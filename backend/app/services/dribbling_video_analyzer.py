import os
import math
import tempfile
from dataclasses import dataclass

import cv2
import mediapipe as mp
import numpy as np

from app.schemas.analysis import (
    AnalysisFeedbackItem,
    DribblingVideoAnalysisResponse,
    DribblingVideoMeasurements,
)
from app.services.pose_geometry import (
    Point,
    average,
    calculate_angle,
    calculate_body_lean,
    is_visible,
    midpoint,
    round_optional,
)

MAX_VIDEO_SECONDS = 10
MAX_SAMPLED_FRAMES = 36


NO_POSE_RESPONSE = DribblingVideoAnalysisResponse(
    analysisType="dribbling",
    score=0,
    summary="No clear human pose detected. Please upload a clearer single-player training video.",
    feedback=[],
    measurements=DribblingVideoMeasurements(
        averageKneeBend=None,
        averageBodyLean=None,
        headDownPercentage=None,
        stanceStability=None,
        estimatedBallHeight=None,
    ),
)


@dataclass
class DribblingFrameMetrics:
    knee_bend: float | None
    body_lean: float | None
    head_down: bool | None
    hip_x: float | None
    ball_height: str | None


def analyze_dribbling_video(video_bytes: bytes) -> DribblingVideoAnalysisResponse:
    video_path = write_temp_video(video_bytes)

    try:
        return analyze_dribbling_video_file(video_path)
    finally:
        try:
            os.remove(video_path)
        except OSError:
            pass


def analyze_dribbling_video_file(video_path: str) -> DribblingVideoAnalysisResponse:
    cap = cv2.VideoCapture(video_path)

    if not cap.isOpened():
        raise ValueError("Invalid video file. Please upload a valid short MP4, MOV, or WebM video.")

    try:
        fps = cap.get(cv2.CAP_PROP_FPS) or 30
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        duration = frame_count / fps if frame_count else 0
        if duration > MAX_VIDEO_SECONDS:
            raise ValueError("Please upload a short training video under 10 seconds.")
        metrics = collect_dribbling_metrics(cap, frame_count)
    finally:
        cap.release()

    if len(metrics) < 3:
        return NO_POSE_RESPONSE

    knee_bend = average([item.knee_bend for item in metrics])
    body_lean = average([item.body_lean for item in metrics])
    head_down_percentage = calculate_head_down_percentage(metrics)
    stance_stability = calculate_stance_stability(metrics)
    ball_height = summarize_ball_height(metrics)

    feedback = [
        evaluate_head_position(head_down_percentage),
        evaluate_knee_bend(knee_bend),
        evaluate_body_lean(body_lean),
        evaluate_stance_stability(stance_stability),
        evaluate_ball_height(ball_height),
    ]
    score = score_feedback(feedback)

    return DribblingVideoAnalysisResponse(
        analysisType="dribbling",
        score=score,
        summary="Camera-view posture estimate, not a ball-handling skill rating. " + build_summary(score),
        feedback=feedback,
        measurements=DribblingVideoMeasurements(
            averageKneeBend=round_optional(knee_bend),
            averageBodyLean=round_optional(body_lean),
            headDownPercentage=round_optional(head_down_percentage),
            stanceStability=round_optional(stance_stability, 3),
            estimatedBallHeight=ball_height,
        ),
    )


def write_temp_video(video_bytes: bytes) -> str:
    if not video_bytes:
        raise ValueError("Uploaded file is empty.")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as temp_file:
        temp_file.write(video_bytes)
        return temp_file.name


def collect_dribbling_metrics(cap, frame_count: int) -> list[DribblingFrameMetrics]:
    mp_pose = mp.solutions.pose
    sample_every = max(math.ceil(frame_count / MAX_SAMPLED_FRAMES), 1) if frame_count else 1
    metrics: list[DribblingFrameMetrics] = []

    # These are simple pose and color estimates for short training clips. They
    # are explainable coaching hints, not a custom trained model or full-game
    # basketball stat tracker.
    with mp_pose.Pose(static_image_mode=False, min_detection_confidence=0.5) as pose:
        frame_index = 0
        sampled = 0
        while sampled < MAX_SAMPLED_FRAMES:
            success, frame = cap.read()
            if not success:
                break

            if frame_index % sample_every != 0:
                frame_index += 1
                continue

            sampled += 1
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            result = pose.process(frame_rgb)

            if result.pose_landmarks:
                points = extract_points(result.pose_landmarks.landmark, mp_pose)
                frame_metrics = analyze_pose_frame(points, frame)
                if frame_metrics is not None:
                    metrics.append(frame_metrics)

            frame_index += 1

    return metrics


def extract_points(landmarks, mp_pose) -> dict[str, Point]:
    names = {
        "nose": mp_pose.PoseLandmark.NOSE,
        "left_shoulder": mp_pose.PoseLandmark.LEFT_SHOULDER,
        "right_shoulder": mp_pose.PoseLandmark.RIGHT_SHOULDER,
        "left_hip": mp_pose.PoseLandmark.LEFT_HIP,
        "right_hip": mp_pose.PoseLandmark.RIGHT_HIP,
        "left_knee": mp_pose.PoseLandmark.LEFT_KNEE,
        "right_knee": mp_pose.PoseLandmark.RIGHT_KNEE,
        "left_ankle": mp_pose.PoseLandmark.LEFT_ANKLE,
        "right_ankle": mp_pose.PoseLandmark.RIGHT_ANKLE,
    }

    return {
        name: Point(
            x=landmarks[landmark.value].x,
            y=landmarks[landmark.value].y,
            visibility=landmarks[landmark.value].visibility,
        )
        for name, landmark in names.items()
    }


def analyze_pose_frame(points: dict[str, Point], frame) -> DribblingFrameMetrics | None:
    required_core = ["left_shoulder", "right_shoulder", "left_hip", "right_hip"]
    if not all(is_visible(points[name]) for name in required_core):
        return None

    hip_midpoint = midpoint(points["left_hip"], points["right_hip"])
    shoulder_midpoint = midpoint(points["left_shoulder"], points["right_shoulder"])
    # Restore the frame aspect ratio before measuring image-plane angles.
    aspect = frame.shape[1] / frame.shape[0]
    geometry = {name: Point(point.x * aspect, point.y, point.visibility) for name, point in points.items()}
    knee_bend = average([
        calculate_angle(geometry["left_hip"], geometry["left_knee"], geometry["left_ankle"]),
        calculate_angle(geometry["right_hip"], geometry["right_knee"], geometry["right_ankle"]),
    ])
    body_lean = calculate_body_lean(
        geometry["left_shoulder"],
        geometry["right_shoulder"],
        geometry["left_hip"],
        geometry["right_hip"],
    )
    head_down = estimate_head_down(points["nose"], shoulder_midpoint, hip_midpoint)
    ball_height = detect_ball_height(frame, hip_midpoint, points)

    return DribblingFrameMetrics(
        knee_bend=knee_bend,
        body_lean=body_lean,
        head_down=head_down,
        hip_x=hip_midpoint.x if is_visible(hip_midpoint) else None,
        ball_height=ball_height,
    )


def estimate_head_down(nose: Point, shoulder_midpoint: Point, hip_midpoint: Point) -> bool | None:
    # Body landmarks do not reliably establish gaze direction across camera angles.
    return None


def detect_ball_height(frame, hip_midpoint: Point, points: dict[str, Point]) -> str | None:
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    lower_orange = np.array([5, 80, 80])
    upper_orange = np.array([25, 255, 255])
    mask = cv2.inRange(hsv, lower_orange, upper_orange)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    if not contours:
        return None

    if not all(is_visible(points[name]) for name in ["left_knee", "right_knee"]):
        return None
    frame_height, frame_width = frame.shape[:2]
    shoulder_y = min(points["left_shoulder"].y, points["right_shoulder"].y)
    knee_y = average([points["left_knee"].y, points["right_knee"].y])
    if knee_y is None or knee_y <= hip_midpoint.y:
        return None
    bottom_y = max(points["left_ankle"].y, points["right_ankle"].y)
    body_height = max(0.15, bottom_y - shoulder_y)
    torso_x = [points[name].x for name in ["left_shoulder", "right_shoulder", "left_hip", "right_hip"]]
    candidates = []
    for contour in contours:
        area = cv2.contourArea(contour)
        x, y, w, h = cv2.boundingRect(contour)
        center_x, center_y = (x + w / 2) / frame_width, (y + h / 2) / frame_height
        perimeter = cv2.arcLength(contour, True)
        circularity = 4 * math.pi * area / (perimeter * perimeter) if perimeter else 0
        diameter = max(w / frame_width, h / frame_height) / body_height
        if (area < 12 or not 0.7 <= w / h <= 1.4 or circularity < 0.55
                or not 0.04 <= diameter <= 0.3 or abs(center_x - hip_midpoint.x) > body_height * 0.9
                or center_y < shoulder_y - body_height * 0.25 or center_y > bottom_y + body_height * 0.2
                or (min(torso_x) <= center_x <= max(torso_x) and shoulder_y <= center_y <= hip_midpoint.y)):
            continue
        candidates.append((area, center_y))
    candidates.sort(reverse=True)
    if not candidates or (len(candidates) > 1 and candidates[1][0] > candidates[0][0] * 0.65):
        return None
    ball_y = candidates[0][1]
    return "low" if ball_y > knee_y else "medium" if ball_y > hip_midpoint.y else "high"


def calculate_head_down_percentage(metrics: list[DribblingFrameMetrics]) -> float | None:
    known = [item.head_down for item in metrics if item.head_down is not None]
    if not known:
        return None
    return 100 * sum(1 for item in known if item) / len(known)


def calculate_stance_stability(metrics: list[DribblingFrameMetrics]) -> float | None:
    hip_positions = [item.hip_x for item in metrics if item.hip_x is not None]
    if len(hip_positions) < 3:
        return None
    return float(np.std(hip_positions))


def summarize_ball_height(metrics: list[DribblingFrameMetrics]) -> str:
    heights = [item.ball_height for item in metrics if item.ball_height]
    if len(heights) < 3 or len(set(heights)) < 2:
        return "unknown"
    return max(sorted(set(heights)), key=heights.count)


def evaluate_head_position(head_down_percentage: float | None) -> AnalysisFeedbackItem:
    if head_down_percentage is None:
        return AnalysisFeedbackItem(category="Head position", status="unknown", message="Head position was not clear enough to estimate.")
    if head_down_percentage <= 35:
        return AnalysisFeedbackItem(category="Head position", status="good", message="Your head appears up for most sampled frames.")
    return AnalysisFeedbackItem(category="Head position", status="needs_work", message="You appear to look down often. Practice keeping your eyes up while dribbling.")


def evaluate_knee_bend(knee_angle: float | None) -> AnalysisFeedbackItem:
    if knee_angle is None:
        return AnalysisFeedbackItem(category="Low stance", status="unknown", message="Knees or ankles were not clear enough to estimate stance.")
    if 105 <= knee_angle <= 165:
        return AnalysisFeedbackItem(category="Low stance", status="good", message="Your knees show an athletic bend for dribbling.")
    return AnalysisFeedbackItem(category="Low stance", status="needs_work", message="Your stance looks too upright or too collapsed. Aim for a balanced low base.")


def evaluate_body_lean(lean: float | None) -> AnalysisFeedbackItem:
    if lean is None:
        return AnalysisFeedbackItem(category="Body lean", status="unknown", message="Shoulders or hips were not clear enough to estimate lean.")
    if lean <= 16:
        return AnalysisFeedbackItem(category="Body lean", status="good", message="Your torso stays controlled over your base.")
    return AnalysisFeedbackItem(category="Body lean", status="needs_work", message="Your torso leans noticeably. Keep your chest balanced over your hips.")


def evaluate_stance_stability(stability: float | None) -> AnalysisFeedbackItem:
    if stability is None:
        return AnalysisFeedbackItem(category="Stance stability", status="unknown", message="Not enough hip tracking data to estimate stability.")
    return AnalysisFeedbackItem(category="Stance stability", status="unknown", message="Hip movement can reflect camera motion or intentional footwork; it is not scored as a technique fault.")


def evaluate_ball_height(ball_height: str | None) -> AnalysisFeedbackItem:
    if ball_height in {None, "unknown"}:
        return AnalysisFeedbackItem(category="Ball height", status="unknown", message="Ball height could not be estimated clearly from this video.")
    if ball_height in {"low", "medium"}:
        return AnalysisFeedbackItem(category="Ball height", status="good", message=f"The ball appears mostly {ball_height}, which is useful for control.")
    return AnalysisFeedbackItem(category="Ball height", status="needs_work", message="The ball appears high. Work on keeping the dribble lower and tighter.")


def score_feedback(feedback: list[AnalysisFeedbackItem]) -> int:
    known = [item for item in feedback if item.status != "unknown"]
    if not known:
        return 0
    return round(100 * sum(1 for item in known if item.status == "good") / len(known))


def build_summary(score: int) -> str:
    if score >= 80:
        return "Strong dribbling movement sample. Keep reinforcing this stance and control."
    if score >= 50:
        return "Some dribbling habits look solid, with a few areas to improve."
    return "This dribbling video shows several areas to clean up. Use the feedback as simple coaching cues."
