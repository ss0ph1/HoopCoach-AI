from dataclasses import dataclass
from uuid import uuid4

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import HTTPException, status

from app.core.config import get_settings


@dataclass
class S3UploadResult:
    s3Key: str
    s3Url: str


class S3Service:
    def __init__(self) -> None:
        self.settings = get_settings()

        if not self.settings.aws_s3_bucket_name:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="AWS S3 bucket is not configured.",
            )

        self.client = boto3.client(
            "s3",
            region_name=self.settings.aws_region,
            aws_access_key_id=self.settings.aws_access_key_id or None,
            aws_secret_access_key=self.settings.aws_secret_access_key or None,
        )

    def upload_video(
        self,
        file_object,
        original_filename: str,
        content_type: str,
        analysis_type: str,
    ) -> S3UploadResult:
        extension = self._get_extension(original_filename, content_type)
        s3_key = f"training-videos/{analysis_type}/{uuid4()}{extension}"

        try:
            file_object.seek(0)
            self.client.upload_fileobj(
                file_object,
                self.settings.aws_s3_bucket_name,
                s3_key,
                ExtraArgs={"ContentType": content_type},
            )
        except (BotoCoreError, ClientError) as error:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Could not upload video to AWS S3.",
            ) from error

        return S3UploadResult(
            s3Key=s3_key,
            s3Url=self._build_s3_url(s3_key),
        )

    def _build_s3_url(self, s3_key: str) -> str:
        return (
            f"https://{self.settings.aws_s3_bucket_name}.s3."
            f"{self.settings.aws_region}.amazonaws.com/{s3_key}"
        )

    def _get_extension(self, original_filename: str, content_type: str) -> str:
        lowered = original_filename.lower()

        if lowered.endswith((".mp4", ".mov", ".avi", ".webm")):
            return lowered[lowered.rfind("."):]

        content_type_extensions = {
            "video/mp4": ".mp4",
            "video/quicktime": ".mov",
            "video/x-msvideo": ".avi",
            "video/webm": ".webm",
        }
        return content_type_extensions.get(content_type, ".mp4")

