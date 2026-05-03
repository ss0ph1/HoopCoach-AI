from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel

FeedbackStatus = Literal["good", "needs_work", "unknown"]


class AnalysisFeedbackItem(BaseModel):
    category: str
    status: FeedbackStatus
    message: str


class ShootingMeasurements(BaseModel):
    shootingElbowAngle: float | None
    shoulderTilt: float | None
    bodyLean: float | None


class ShootingPhotoAnalysisResponse(BaseModel):
    score: int
    summary: str
    feedback: list[AnalysisFeedbackItem]
    measurements: ShootingMeasurements


class ShootingVideoMeasurements(BaseModel):
    averageElbowAngle: float | None
    releaseElbowAngle: float | None
    shoulderTilt: float | None
    bodyLean: float | None
    kneeBend: float | None
    followThroughHeld: bool | None


class ShootingVideoAnalysisResponse(BaseModel):
    analysisType: Literal["shooting"]
    score: int
    summary: str
    feedback: list[AnalysisFeedbackItem]
    measurements: ShootingVideoMeasurements


class DribblingVideoMeasurements(BaseModel):
    averageKneeBend: float | None
    averageBodyLean: float | None
    headDownPercentage: float | None
    stanceStability: float | None
    estimatedBallHeight: str | None


class DribblingVideoAnalysisResponse(BaseModel):
    analysisType: Literal["dribbling"]
    score: int
    summary: str
    feedback: list[AnalysisFeedbackItem]
    measurements: DribblingVideoMeasurements


class VideoAnalysisResponse(BaseModel):
    id: UUID
    analysisType: Literal["shooting", "dribbling"]
    score: float | None
    summary: str | None
    feedback: list[AnalysisFeedbackItem]
    measurements: dict[str, Any]
    s3Url: str
    s3Key: str
    createdAt: datetime
