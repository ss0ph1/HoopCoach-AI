import math
from dataclasses import dataclass

import cv2
import mediapipe as mp
import numpy as np

from app.schemas.analysis import (
    AnalysisFeedbackItem,
    ShootingMeasurements,
    ShootingPhotoAnalysisResponse,
)


@dataclass
class Point:
    x: float
    y: float
    visibility: float


NO_POSE_RESPONSE = ShootingPhotoAnalysisResponse(
    score=0,
    summary="No clear human pose detected. Please upload a clearer side/front view shooting photo.",
    feedback=[],
    measurements=ShootingMeasurements(
        shootingElbowAngle=None,
        shoulderTilt=None,
        bodyLean=None,
    ),
)


def analyze_shooting_photo(image_bytes: bytes) -> ShootingPhotoAnalysisResponse:
    image = decode_image(image_bytes)

    if image is None:
        raise ValueError("Invalid image file. Please upload a PNG, JPG, or JPEG image.")

    # MediaPipe Pose returns body landmarks such as shoulders, elbows, wrists, and hips.
    # This is a beginner-friendly estimate, not professional biomechanics analysis.
    mp_pose = mp.solutions.pose
    image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

    with mp_pose.Pose(static_image_mode=True, min_detection_confidence=0.5) as pose:
        result = pose.process(image_rgb)

    if not result.pose_landmarks:
        return NO_POSE_RESPONSE

    landmarks = result.pose_landmarks.landmark
    points = {
        "left_shoulder": get_point(landmarks, mp_pose.PoseLandmark.LEFT_SHOULDER),
        "right_shoulder": get_point(landmarks, mp_pose.PoseLandmark.RIGHT_SHOULDER),
        "left_elbow": get_point(landmarks, mp_pose.PoseLandmark.LEFT_ELBOW),
        "right_elbow": get_point(landmarks, mp_pose.PoseLandmark.RIGHT_ELBOW),
        "left_wrist": get_point(landmarks, mp_pose.PoseLandmark.LEFT_WRIST),
        "right_wrist": get_point(landmarks, mp_pose.PoseLandmark.RIGHT_WRIST),
        "left_hip": get_point(landmarks, mp_pose.PoseLandmark.LEFT_HIP),
        "right_hip": get_point(landmarks, mp_pose.PoseLandmark.RIGHT_HIP),
    }

    if not has_clear_core_pose(points):
        return NO_POSE_RESPONSE

    shooting_side = choose_shooting_side(points)
    elbow_angle = calculate_angle(
        points[f"{shooting_side}_shoulder"],
        points[f"{shooting_side}_elbow"],
        points[f"{shooting_side}_wrist"],
    )
    shoulder_tilt = abs(points["left_shoulder"].y - points["right_shoulder"].y)
    body_lean = calculate_body_lean(points)

    feedback = [
        evaluate_elbow_angle(elbow_angle),
        evaluate_shoulder_balance(shoulder_tilt),
        evaluate_body_lean(body_lean),
    ]
    known_feedback = [item for item in feedback if item.status != "unknown"]
    score = round(
        100
        * sum(1 for item in known_feedback if item.status == "good")
        / max(len(known_feedback), 1)
    )

    summary = build_summary(score, known_feedback)

    return ShootingPhotoAnalysisResponse(
        score=score,
        summary=summary,
        feedback=feedback,
        measurements=ShootingMeasurements(
            shootingElbowAngle=round(elbow_angle, 1) if elbow_angle is not None else None,
            shoulderTilt=round(shoulder_tilt, 3),
            bodyLean=round(body_lean, 1) if body_lean is not None else None,
        ),
    )


def decode_image(image_bytes: bytes):
    image_array = np.frombuffer(image_bytes, dtype=np.uint8)
    return cv2.imdecode(image_array, cv2.IMREAD_COLOR)


def get_point(landmarks, landmark) -> Point:
    value = landmarks[landmark.value]
    return Point(x=value.x, y=value.y, visibility=value.visibility)


def is_visible(point: Point, minimum_visibility: float = 0.45) -> bool:
    return point.visibility >= minimum_visibility


def has_clear_core_pose(points: dict[str, Point]) -> bool:
    required = ["left_shoulder", "right_shoulder", "left_hip", "right_hip"]
    arm_visible = (
        all(is_visible(points[f"left_{joint}"]) for joint in ["shoulder", "elbow", "wrist"])
        or all(is_visible(points[f"right_{joint}"]) for joint in ["shoulder", "elbow", "wrist"])
    )
    return arm_visible and all(is_visible(points[name]) for name in required)


def choose_shooting_side(points: dict[str, Point]) -> str:
    left_score = sum(points[f"left_{joint}"].visibility for joint in ["shoulder", "elbow", "wrist"])
    right_score = sum(points[f"right_{joint}"].visibility for joint in ["shoulder", "elbow", "wrist"])
    return "left" if left_score >= right_score else "right"


def calculate_angle(first: Point, middle: Point, last: Point) -> float | None:
    if not all(is_visible(point) for point in [first, middle, last]):
        return None

    # Angle at the middle point: vector middle->first compared to middle->last.
    vector_a = np.array([first.x - middle.x, first.y - middle.y])
    vector_b = np.array([last.x - middle.x, last.y - middle.y])
    denominator = np.linalg.norm(vector_a) * np.linalg.norm(vector_b)

    if denominator == 0:
        return None

    cosine_angle = np.clip(np.dot(vector_a, vector_b) / denominator, -1.0, 1.0)
    return math.degrees(math.acos(cosine_angle))


def calculate_body_lean(points: dict[str, Point]) -> float | None:
    shoulder_midpoint = midpoint(points["left_shoulder"], points["right_shoulder"])
    hip_midpoint = midpoint(points["left_hip"], points["right_hip"])
    vertical_delta = abs(hip_midpoint.y - shoulder_midpoint.y)

    if vertical_delta == 0:
        return None

    horizontal_delta = abs(shoulder_midpoint.x - hip_midpoint.x)
    return math.degrees(math.atan(horizontal_delta / vertical_delta))


def midpoint(first: Point, second: Point) -> Point:
    return Point(
        x=(first.x + second.x) / 2,
        y=(first.y + second.y) / 2,
        visibility=min(first.visibility, second.visibility),
    )


def evaluate_elbow_angle(angle: float | None) -> AnalysisFeedbackItem:
    if angle is None:
        return AnalysisFeedbackItem(
            category="Shooting elbow angle",
            status="unknown",
            message="Elbow, shoulder, or wrist was not clear enough to estimate the shooting arm angle.",
        )

    if 80 <= angle <= 120:
        return AnalysisFeedbackItem(
            category="Shooting elbow angle",
            status="good",
            message="Your shooting arm is in a solid bend range for a set-point photo.",
        )

    return AnalysisFeedbackItem(
        category="Shooting elbow angle",
        status="needs_work",
        message="Your shooting elbow angle looks outside the target 80-120 degree range. Try setting the ball with a more controlled arm bend.",
    )


def evaluate_shoulder_balance(tilt: float) -> AnalysisFeedbackItem:
    if tilt <= 0.04:
        return AnalysisFeedbackItem(
            category="Shoulder balance",
            status="good",
            message="Your shoulders look fairly level in this photo.",
        )

    return AnalysisFeedbackItem(
        category="Shoulder balance",
        status="needs_work",
        message="Your shoulders look tilted. Work on staying balanced through the shot pocket and release.",
    )


def evaluate_body_lean(lean: float | None) -> AnalysisFeedbackItem:
    if lean is None:
        return AnalysisFeedbackItem(
            category="Body lean",
            status="unknown",
            message="Shoulders or hips were not clear enough to estimate body lean.",
        )

    if lean <= 12:
        return AnalysisFeedbackItem(
            category="Body lean",
            status="good",
            message="Your torso looks mostly vertical, which usually helps balance and repeatability.",
        )

    return AnalysisFeedbackItem(
        category="Body lean",
        status="needs_work",
        message="Your torso appears to lean noticeably. Try keeping your shoulders stacked over your hips.",
    )


def build_summary(score: int, feedback: list[AnalysisFeedbackItem]) -> str:
    if not feedback:
        return NO_POSE_RESPONSE.summary

    if score >= 80:
        return "Good shooting-form snapshot. Keep using this as a repeatable base."

    if score >= 50:
        return "Some form pieces look solid, but one or two areas need attention."

    return "This photo shows a few form areas to clean up. Use the feedback as beginner-friendly cues."
