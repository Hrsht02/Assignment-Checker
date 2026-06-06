"""
Storage service — Cloudflare R2 in production.
Falls back to local filesystem when R2 credentials are not configured (dev mode).
"""
import uuid
import os
from pathlib import Path
from fastapi import UploadFile
from app.config import get_settings

settings = get_settings()

# Local uploads folder used when R2 is not configured
_LOCAL_DIR = Path(__file__).resolve().parent.parent.parent / "uploads"


def _r2_configured() -> bool:
    return bool(settings.R2_ACCOUNT_ID and settings.R2_ACCESS_KEY_ID and settings.R2_SECRET_ACCESS_KEY)


def _local_url(key: str) -> str:
    return f"{settings.APP_URL}/uploads/{key}"


# ── Local filesystem helpers ──────────────────────────────────────────────────

async def _save_local(content: bytes, key: str) -> tuple[str, str]:
    dest = _LOCAL_DIR / key
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(content)
    return key, _local_url(key)


# ── Public API ────────────────────────────────────────────────────────────────

async def upload_file(file: UploadFile, folder: str) -> tuple[str, str]:
    """Upload a FastAPI UploadFile. Returns (key, url)."""
    ext = file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else "bin"
    key = f"{folder}/{uuid.uuid4()}.{ext}"
    content = await file.read()

    if not _r2_configured():
        return await _save_local(content, key)

    try:
        import boto3
        from botocore.exceptions import ClientError

        client = boto3.client(
            "s3",
            endpoint_url=f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
            aws_access_key_id=settings.R2_ACCESS_KEY_ID,
            aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
            region_name="auto",
        )
        client.put_object(
            Bucket=settings.R2_BUCKET_NAME,
            Key=key,
            Body=content,
            ContentType=file.content_type or "application/octet-stream",
        )
        return key, f"{settings.R2_PUBLIC_URL}/{key}"
    except Exception as e:
        raise RuntimeError(f"Storage upload failed: {e}") from e


async def upload_bytes(data: bytes, key: str, content_type: str = "application/octet-stream") -> tuple[str, str]:
    """Upload raw bytes. Returns (key, url)."""
    if not _r2_configured():
        return await _save_local(data, key)

    try:
        import boto3
        client = boto3.client(
            "s3",
            endpoint_url=f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
            aws_access_key_id=settings.R2_ACCESS_KEY_ID,
            aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
            region_name="auto",
        )
        client.put_object(Bucket=settings.R2_BUCKET_NAME, Key=key, Body=data, ContentType=content_type)
        return key, f"{settings.R2_PUBLIC_URL}/{key}"
    except Exception as e:
        raise RuntimeError(f"Storage upload failed: {e}") from e


async def delete_file(key: str) -> None:
    if not _r2_configured():
        try:
            (_LOCAL_DIR / key).unlink(missing_ok=True)
        except Exception:
            pass
        return
    try:
        import boto3
        client = boto3.client(
            "s3",
            endpoint_url=f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
            aws_access_key_id=settings.R2_ACCESS_KEY_ID,
            aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
            region_name="auto",
        )
        client.delete_object(Bucket=settings.R2_BUCKET_NAME, Key=key)
    except Exception:
        pass
