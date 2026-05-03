import os
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()


class Settings:
    port: int = int(os.getenv("PORT", "4000"))
    database_url: str = os.getenv(
        "DATABASE_URL",
        "postgresql://127.0.0.1:5433/hoopflow_ai",
    )
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-5.2")
    aws_access_key_id: str = os.getenv("AWS_ACCESS_KEY_ID", "")
    aws_secret_access_key: str = os.getenv("AWS_SECRET_ACCESS_KEY", "")
    aws_region: str = os.getenv("AWS_REGION", "ca-central-1")
    aws_s3_bucket_name: str = os.getenv("AWS_S3_BUCKET_NAME", "")


@lru_cache
def get_settings() -> Settings:
    return Settings()
