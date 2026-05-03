import os
import tempfile
from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.repositories.analysis_repository import create_video_analysis

from app.schemas.analysis import (
    ShootingPhotoAnalysisResponse,
    VideoAnalysisResponse,
)
from app.services.dribbling_video_analyzer import analyze_dribbling_video_file
from app.services.s3_service import S3Service
from app.services.shooting_photo_analyzer import analyze_shooting_photo
from app.services.shooting_video_analyzer import analyze_shooting_video_file

router = APIRouter()

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/jpg"}
ALLOWED_VIDEO_TYPES = {
    "video/mp4",
    "video/quicktime",
    "video/x-msvideo",
    "video/webm",
}


@router.post("/shooting-photo", response_model=ShootingPhotoAnalysisResponse)
async def analyze_shooting_photo_endpoint(
    file: UploadFile = File(...),
) -> ShootingPhotoAnalysisResponse:
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file type. Please upload a PNG, JPG, or JPEG image.",
        )

    image_bytes = await file.read()

    if not image_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )

    try:
        return analyze_shooting_photo(image_bytes)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error


@router.post("/shooting-video", response_model=VideoAnalysisResponse)
async def analyze_shooting_video_endpoint(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> VideoAnalysisResponse:
    return await analyze_and_store_video(file, "shooting", db)


@router.post("/dribbling-video", response_model=VideoAnalysisResponse)
async def analyze_dribbling_video_endpoint(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> VideoAnalysisResponse:
    return await analyze_and_store_video(file, "dribbling", db)


async def analyze_and_store_video(
    file: UploadFile,
    analysis_type: Literal["shooting", "dribbling"],
    db: Session,
) -> VideoAnalysisResponse:
    validate_video_upload(file)
    temp_path = await save_temp_video(file)

    try:
        with open(temp_path, "rb") as video_file:
            s3_result = S3Service().upload_video(
                video_file,
                file.filename or f"{analysis_type}-training-video.mp4",
                file.content_type or "video/mp4",
                analysis_type,
            )

        analysis_result = (
            analyze_shooting_video_file(temp_path)
            if analysis_type == "shooting"
            else analyze_dribbling_video_file(temp_path)
        )

        saved_analysis = create_video_analysis(
            db=db,
            analysis_type=analysis_type,
            original_filename=file.filename or "training-video",
            s3_key=s3_result.s3Key,
            s3_url=s3_result.s3Url,
            score=analysis_result.score,
            summary=analysis_result.summary,
            feedback=[item.model_dump(mode="json") for item in analysis_result.feedback],
            measurements=analysis_result.measurements.model_dump(mode="json"),
        )

        return VideoAnalysisResponse(
            id=saved_analysis.id,
            analysisType=analysis_type,
            score=saved_analysis.score,
            summary=saved_analysis.summary,
            feedback=analysis_result.feedback,
            measurements=saved_analysis.measurements or {},
            s3Url=saved_analysis.s3_url,
            s3Key=saved_analysis.s3_key,
            createdAt=saved_analysis.created_at,
        )
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error
    finally:
        try:
            os.remove(temp_path)
        except OSError:
            pass


def validate_video_upload(file: UploadFile) -> None:
    if file.content_type not in ALLOWED_VIDEO_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file type. Please upload an MP4, MOV, AVI, or WebM video.",
        )


async def save_temp_video(file: UploadFile) -> str:
    suffix = get_video_suffix(file.filename or "", file.content_type or "")

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        while chunk := await file.read(1024 * 1024):
            temp_file.write(chunk)
        temp_path = temp_file.name

    if os.path.getsize(temp_path) == 0:
        try:
            os.remove(temp_path)
        except OSError:
            pass
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )

    return temp_path


def get_video_suffix(filename: str, content_type: str) -> str:
    lowered = filename.lower()
    for suffix in [".mp4", ".mov", ".avi", ".webm"]:
        if lowered.endswith(suffix):
            return suffix

    return {
        "video/mp4": ".mp4",
        "video/quicktime": ".mov",
        "video/x-msvideo": ".avi",
        "video/webm": ".webm",
    }.get(content_type, ".mp4")
