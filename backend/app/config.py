from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:password@localhost:5432/academic_platform"

    # Security
    SECRET_KEY: str = "change-this-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours

    # Gemini AI
    GEMINI_API_KEY: str = ""

    # Cloudflare R2
    R2_ACCOUNT_ID: str = ""
    R2_ACCESS_KEY_ID: str = ""
    R2_SECRET_ACCESS_KEY: str = ""
    R2_BUCKET_NAME: str = "academic-platform"
    R2_PUBLIC_URL: str = ""

    # Resend Email
    RESEND_API_KEY: str = ""
    FROM_EMAIL: str = "noreply@example.com"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # App
    APP_URL: str = "http://localhost:3000"
    SIMILARITY_THRESHOLD: float = 0.95

    # File upload limits
    MAX_UPLOAD_SIZE_MB: int = 20

    # CORS — comma-separated list of allowed origins
    CORS_ORIGINS: str = ""

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    return Settings()
