from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import VideoAnalysis


def create_video_analysis(
    db: Session,
    analysis_type: str,
    original_filename: str,
    s3_key: str,
    s3_url: str,
    score: float | None,
    summary: str | None,
    feedback: list | None,
    measurements: dict | None,
) -> VideoAnalysis:
    video_analysis = VideoAnalysis(
        analysis_type=analysis_type,
        original_filename=original_filename,
        s3_key=s3_key,
        s3_url=s3_url,
        score=score,
        summary=summary,
        feedback=feedback,
        measurements=measurements,
    )
    db.add(video_analysis)
    db.commit()
    db.refresh(video_analysis)

    return video_analysis


def get_video_analyses(db: Session) -> list[VideoAnalysis]:
    statement = select(VideoAnalysis).order_by(VideoAnalysis.created_at.desc())
    return list(db.scalars(statement).all())
