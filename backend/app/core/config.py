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


@lru_cache
def get_settings() -> Settings:
    return Settings()
