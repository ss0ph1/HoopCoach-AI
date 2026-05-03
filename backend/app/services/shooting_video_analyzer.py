import os
import tempfile
from dataclasses import dataclass

import cv2
import mediapipe as mp

from app.schemas.analysis import (
    AnalysisFeedbackItem,
    ShootingVideoAnalysisResponse,
    ShootingVideoMeasurements,
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


NO_POSE_RESPONSE = ShootingVideoAnalysisResponse(
    analysisType="shooting",
    score=0,
    summary="No clear human pose detected. Please upload a clearer single-player training video.",
    feedback=[],
    measurements=ShootingVideoMeasurements(
        averageElbowAngle=None,
        releaseElbowAngle=None,
        shoulderTilt=None,
        bodyLean=None,
        kneeBend=None,
        followThroughHeld=None,
    ),
)


@dataclass
class ShootingFrameMetrics:
    elbow_angle: float | None
    wrist_y: float | None
    shoulder_tilt: float | None
    body_lean: float | None
    knee_bend: float | None


def analyze_shooting_video(video_bytes: bytes) -> ShootingVideoAnalysisResponse:
    video_path = write_temp_video(video_bytes)

    try:
        return analyze_shooting_video_file(video_path)
    finally:
        try:
            os.remove(video_path)
        except OSError:
            pass


def analyze_shooting_video_file(video_path: str) -> ShootingVideoAnalysisResponse:
    cap = cv2.VideoCapture(video_path)

    if not cap.isOpened():
        raise ValueError("Invalid video file. Please upload a valid short MP4, MOV, or WebM video.")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    duration = frame_count / fps if frame_count else 0

    if duration > MAX_VIDEO_SECONDS:
        raise ValueError("Please upload a short training video under 10 seconds.")

    metrics = collect_shooting_metrics(cap, frame_count)
    cap.release()

    if len(metrics) < 3:
        return NO_POSE_RESPONSE

    average_elbow = average([item.elbow_angle for item in metrics])
    shoulder_tilt = average([item.shoulder_tilt for item in metrics])
    body_lean = average([item.body_lean for item in metrics])
    knee_bend = average([item.knee_bend for item in metrics])

    release_index = choose_release_frame(metrics)
    release_elbow = metrics[release_index].elbow_angle if release_index is not None else None
    follow_through_held = evaluate_follow_through(metrics, release_index)

    feedback = [
        evaluate_release_elbow(release_elbow),
        evaluate_shoulder_tilt(shoulder_tilt),
        evaluate_body_lean(body_lean),
        evaluate_knee_bend(knee_bend),
        evaluate_follow_through_feedback(follow_through_held),
    ]
    score = score_feedback(feedback)

    return ShootingVideoAnalysisResponse(
        analysisType="shooting",
        score=score,
        summary=build_summary(score, "shooting"),
        feedback=feedback,
        measurements=ShootingVideoMeasurements(
            averageElbowAngle=round_optional(average_elbow),
            releaseElbowAngle=round_optional(release_elbow),
            shoulderTilt=round_optional(shoulder_tilt, 3),
            bodyLean=round_optional(body_lean),
            kneeBend=round_optional(knee_bend),
            followThroughHeld=follow_through_held,
        ),
    )


def write_temp_video(video_bytes: bytes) -> str:
    if not video_bytes:
        raise ValueError("Uploaded file is empty.")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as temp_file:
        temp_file.write(video_bytes)
        return temp_file.name


def collect_shooting_metrics(cap, frame_count: int) -> list[ShootingFrameMetrics]:
    mp_pose = mp.solutions.pose
    sample_every = max(frame_count // MAX_SAMPLED_FRAMES, 1) if frame_count else 1
    metrics: list[ShootingFrameMetrics] = []

    # MediaPipe Pose gives normalized landmarks such as shoulders, elbows, wrists,
    # hips, knees, and ankles. These estimates are helpful coaching cues, not a
    # professional biomechanics report.
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
                frame_metrics = analyze_pose_frame(points)
                if frame_metrics is not None:
                    metrics.append(frame_metrics)

            frame_index += 1

    return metrics


def extract_points(landmarks, mp_pose) -> dict[str, Point]:
    names = {
        "left_shoulder": mp_pose.PoseLandmark.LEFT_SHOULDER,
        "right_shoulder": mp_pose.PoseLandmark.RIGHT_SHOULDER,
        "left_elbow": mp_pose.PoseLandmark.LEFT_ELBOW,
        "right_elbow": mp_pose.PoseLandmark.RIGHT_ELBOW,
        "left_wrist": mp_pose.PoseLandmark.LEFT_WRIST,
        "right_wrist": mp_pose.PoseLandmark.RIGHT_WRIST,
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


def analyze_pose_frame(points: dict[str, Point]) -> ShootingFrameMetrics | None:
    required_core = ["left_shoulder", "right_shoulder", "left_hip", "right_hip"]
    if not all(is_visible(points[name]) for name in required_core):
        return None

    side = choose_shooting_side(points)
    elbow_angle = calculate_angle(
        points[f"{side}_shoulder"],
        points[f"{side}_elbow"],
        points[f"{side}_wrist"],
    )
    wrist_y = points[f"{side}_wrist"].y if is_visible(points[f"{side}_wrist"]) else None
    shoulder_tilt = abs(points["left_shoulder"].y - points["right_shoulder"].y)
    body_lean = calculate_body_lean(
        points["left_shoulder"],
        points["right_shoulder"],
        points["left_hip"],
        points["right_hip"],
    )
    knee_bend = average(
        [
            calculate_angle(points["left_hip"], points["left_knee"], points["left_ankle"]),
            calculate_angle(points["right_hip"], points["right_knee"], points["right_ankle"]),
        ]
    )

    return ShootingFrameMetrics(
        elbow_angle=elbow_angle,
        wrist_y=wrist_y,
        shoulder_tilt=shoulder_tilt,
        body_lean=body_lean,
        knee_bend=knee_bend,
    )


def choose_shooting_side(points: dict[str, Point]) -> str:
    left_score = sum(points[f"left_{joint}"].visibility for joint in ["shoulder", "elbow", "wrist"])
    right_score = sum(points[f"right_{joint}"].visibility for joint in ["shoulder", "elbow", "wrist"])
    return "left" if left_score >= right_score else "right"


def choose_release_frame(metrics: list[ShootingFrameMetrics]) -> int | None:
    visible_wrists = [
        (index, item.wrist_y)
        for index, item in enumerate(metrics)
        if item.wrist_y is not None
    ]
    if not visible_wrists:
        return None

    # In MediaPipe coordinates, lower y means higher in the image.
    return min(visible_wrists, key=lambda item: item[1])[0]


def evaluate_follow_through(metrics: list[ShootingFrameMetrics], release_index: int | None) -> bool | None:
    if release_index is None or metrics[release_index].wrist_y is None:
        return None

    release_y = metrics[release_index].wrist_y
    after_release = metrics[release_index + 1: release_index + 6]
    if len(after_release) < 2:
        return None

    held_frames = [
        item for item in after_release
        if item.wrist_y is not None and item.wrist_y <= release_y + 0.06
    ]
    return len(held_frames) >= 2


def evaluate_release_elbow(angle: float | None) -> AnalysisFeedbackItem:
    if angle is None:
        return AnalysisFeedbackItem(
            category="Release elbow angle",
            status="unknown",
            message="The shooting arm was not clear enough to estimate release angle.",
        )

    if 80 <= angle <= 120:
        return AnalysisFeedbackItem(
            category="Release elbow angle",
            status="good",
            message="Your release elbow angle is in the target 80-120 degree range.",
        )

    return AnalysisFeedbackItem(
        category="Release elbow angle",
        status="needs_work",
        message="Your release elbow angle looks outside the target range. Try a more controlled set point and release path.",
    )


def evaluate_shoulder_tilt(tilt: float | None) -> AnalysisFeedbackItem:
    if tilt is None:
        return AnalysisFeedbackItem(category="Shoulder tilt", status="unknown", message="Shoulders were not clear enough to estimate tilt.")
    if tilt <= 0.05:
        return AnalysisFeedbackItem(category="Shoulder tilt", status="good", message="Your shoulders stay fairly level through the sampled frames.")
    return AnalysisFeedbackItem(category="Shoulder tilt", status="needs_work", message="Your shoulders tilt noticeably. Work on staying balanced through the shot.")


def evaluate_body_lean(lean: float | None) -> AnalysisFeedbackItem:
    if lean is None:
        return AnalysisFeedbackItem(category="Body lean", status="unknown", message="Hips or shoulders were not clear enough to estimate body lean.")
    if lean <= 14:
        return AnalysisFeedbackItem(category="Body lean", status="good", message="Your torso stays mostly vertical, which supports repeatable shooting form.")
    return AnalysisFeedbackItem(category="Body lean", status="needs_work", message="Your torso leans noticeably. Try keeping shoulders stacked over hips.")


def evaluate_knee_bend(knee_angle: float | None) -> AnalysisFeedbackItem:
    if knee_angle is None:
        return AnalysisFeedbackItem(category="Knee bend", status="unknown", message="Knees or ankles were not clear enough to estimate knee bend.")
    if 115 <= knee_angle <= 170:
        return AnalysisFeedbackItem(category="Knee bend", status="good", message="You show some useful knee bend for rhythm and power.")
    return AnalysisFeedbackItem(category="Knee bend", status="needs_work", message="Your legs look either too upright or too collapsed. Aim for a controlled athletic bend.")


def evaluate_follow_through_feedback(held: bool | None) -> AnalysisFeedbackItem:
    if held is None:
        return AnalysisFeedbackItem(category="Follow-through hold", status="unknown", message="The video did not show enough clear frames after release.")
    if held:
        return AnalysisFeedbackItem(category="Follow-through hold", status="good", message="Your wrist appears to stay high after release.")
    return AnalysisFeedbackItem(category="Follow-through hold", status="needs_work", message="Your follow-through drops quickly. Hold the finish for a moment after release.")


def score_feedback(feedback: list[AnalysisFeedbackItem]) -> int:
    known = [item for item in feedback if item.status != "unknown"]
    if not known:
        return 0
    return round(100 * sum(1 for item in known if item.status == "good") / len(known))


def build_summary(score: int, analysis_name: str) -> str:
    if score >= 80:
        return f"Strong {analysis_name} form sample. Keep reinforcing these movement habits."
    if score >= 50:
        return f"Some {analysis_name} pieces look solid, with a few areas to clean up."
    return f"This {analysis_name} video shows several areas to improve. Use the feedback as simple coaching cues."
