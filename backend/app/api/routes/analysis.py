from fastapi import APIRouter, File, HTTPException, UploadFile, status

from app.schemas.analysis import (
    DribblingVideoAnalysisResponse,
    ShootingPhotoAnalysisResponse,
    ShootingVideoAnalysisResponse,
)
from app.services.dribbling_video_analyzer import analyze_dribbling_video
from app.services.shooting_photo_analyzer import analyze_shooting_photo
from app.services.shooting_video_analyzer import analyze_shooting_video

router = APIRouter()

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/jpg"}
ALLOWED_VIDEO_TYPES = {
    "video/mp4",
    "video/quicktime",
    "video/webm",
    "video/x-m4v",
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


@router.post("/shooting-video", response_model=ShootingVideoAnalysisResponse)
async def analyze_shooting_video_endpoint(
    file: UploadFile = File(...),
) -> ShootingVideoAnalysisResponse:
    video_bytes = await read_video_upload(file)

    try:
        return analyze_shooting_video(video_bytes)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error


@router.post("/dribbling-video", response_model=DribblingVideoAnalysisResponse)
async def analyze_dribbling_video_endpoint(
    file: UploadFile = File(...),
) -> DribblingVideoAnalysisResponse:
    video_bytes = await read_video_upload(file)

    try:
        return analyze_dribbling_video(video_bytes)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error


async def read_video_upload(file: UploadFile) -> bytes:
    if file.content_type not in ALLOWED_VIDEO_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file type. Please upload an MP4, MOV, or WebM video.",
        )

    video_bytes = await file.read()

    if not video_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )

    return video_bytes
