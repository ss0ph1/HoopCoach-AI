import os
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
        cap = cv2.VideoCapture(video_path)

        if not cap.isOpened():
            raise ValueError("Invalid video file. Please upload a valid short MP4, MOV, or WebM video.")

        fps = cap.get(cv2.CAP_PROP_FPS) or 30
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        duration = frame_count / fps if frame_count else 0

        if duration > MAX_VIDEO_SECONDS:
            raise ValueError("Please upload a short training video under 10 seconds.")

        metrics = collect_dribbling_metrics(cap, frame_count)
    finally:
        try:
            os.remove(video_path)
        except OSError:
            pass

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
        summary=build_summary(score),
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
    sample_every = max(frame_count // MAX_SAMPLED_FRAMES, 1) if frame_count else 1
    metrics: list[DribblingFrameMetrics] = []

    # These are simple pose and color estimates for short training clips. They
    # are explainable coaching hints, not a custom trained model or full-game
    # basketball stat tracker.
    with mp_pose.Pose(static_image_mode=False, min_detection_confidence=0.5) as pose:
        frame_index = 0
        while True:
            success, frame = cap.read()
            if not success:
                break

            if frame_index % sample_every != 0:
                frame_index += 1
                continue

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
    knee_bend = average(
        [
            calculate_angle(points["left_hip"], points["left_knee"], points["left_ankle"]),
            calculate_angle(points["right_hip"], points["right_knee"], points["right_ankle"]),
        ]
    )
    body_lean = calculate_body_lean(
        points["left_shoulder"],
        points["right_shoulder"],
        points["left_hip"],
        points["right_hip"],
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
    if not all(is_visible(point) for point in [nose, shoulder_midpoint, hip_midpoint]):
        return None

    torso_height = abs(hip_midpoint.y - shoulder_midpoint.y)
    if torso_height == 0:
        return None

    # If the nose drops too close to the shoulder line, the player is probably
    # looking down instead of scanning forward.
    head_clearance = shoulder_midpoint.y - nose.y
    return head_clearance < torso_height * 0.32


def detect_ball_height(frame, hip_midpoint: Point, points: dict[str, Point]) -> str | None:
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    lower_orange = np.array([5, 80, 80])
    upper_orange = np.array([25, 255, 255])
    mask = cv2.inRange(hsv, lower_orange, upper_orange)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    if not contours:
        return None

    largest = max(contours, key=cv2.contourArea)
    if cv2.contourArea(largest) < 80:
        return None

    _, y, _, h = cv2.boundingRect(largest)
    frame_height = frame.shape[0]
    ball_y = (y + h / 2) / frame_height
    knee_y = average([points["left_knee"].y, points["right_knee"].y])

    if knee_y is None:
        return "unknown"

    if ball_y > knee_y:
        return "low"
    if ball_y > hip_midpoint.y:
        return "medium"
    return "high"


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
    if not heights:
        return "unknown"
    return max(set(heights), key=heights.count)


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
    if stability <= 0.08:
        return AnalysisFeedbackItem(category="Stance stability", status="good", message="Your hip movement looks controlled across the sampled frames.")
    return AnalysisFeedbackItem(category="Stance stability", status="needs_work", message="Your base shifts a lot. Work on controlled side-to-side movement.")


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

