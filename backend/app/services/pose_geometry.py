import math
from dataclasses import dataclass

import numpy as np


@dataclass
class Point:
    x: float
    y: float
    visibility: float


def is_visible(point: Point | None, minimum_visibility: float = 0.45) -> bool:
    return point is not None and point.visibility >= minimum_visibility


def midpoint(first: Point, second: Point) -> Point:
    return Point(
        x=(first.x + second.x) / 2,
        y=(first.y + second.y) / 2,
        visibility=min(first.visibility, second.visibility),
    )


def calculate_angle(first: Point | None, middle: Point | None, last: Point | None) -> float | None:
    if not all(is_visible(point) for point in [first, middle, last]):
        return None

    # Angle at the middle point, measured between middle->first and middle->last.
    vector_a = np.array([first.x - middle.x, first.y - middle.y])
    vector_b = np.array([last.x - middle.x, last.y - middle.y])
    denominator = np.linalg.norm(vector_a) * np.linalg.norm(vector_b)

    if denominator == 0:
        return None

    cosine_angle = np.clip(np.dot(vector_a, vector_b) / denominator, -1.0, 1.0)
    return math.degrees(math.acos(cosine_angle))


def calculate_body_lean(left_shoulder: Point, right_shoulder: Point, left_hip: Point, right_hip: Point) -> float | None:
    shoulder_midpoint = midpoint(left_shoulder, right_shoulder)
    hip_midpoint = midpoint(left_hip, right_hip)
    vertical_delta = abs(hip_midpoint.y - shoulder_midpoint.y)

    if vertical_delta == 0:
        return None

    horizontal_delta = abs(shoulder_midpoint.x - hip_midpoint.x)
    return math.degrees(math.atan(horizontal_delta / vertical_delta))


def average(values: list[float | None]) -> float | None:
    known_values = [value for value in values if value is not None]
    if not known_values:
        return None
    return sum(known_values) / len(known_values)


def round_optional(value: float | None, digits: int = 1) -> float | None:
    return round(value, digits) if value is not None else None

