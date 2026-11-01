"""Application settings, loaded from environment variables.

When running outside Docker, values are also read from the repo-root `.env`
file (missing files are ignored, so this is a no-op inside containers).
"""

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_ENV_FILE = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT_ENV_FILE, extra="ignore")

    mongo_url: str = Field(..., alias="MONGO_URL")
    mongo_db: str = Field("resume_screener", alias="MONGO_DB")
    internal_api_key: str = Field(..., min_length=16, alias="INTERNAL_API_KEY")


@lru_cache
def get_settings() -> Settings:
    return Settings()
