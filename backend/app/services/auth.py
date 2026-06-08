from datetime import datetime, timedelta, timezone
from typing import Optional
import warnings

from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import get_settings
from app.models.user import User, UserStatus

settings = get_settings()

# ── bcrypt via passlib ────────────────────────────────────────────────────────
# passlib 1.7.4 reads bcrypt.__about__.__version__ which was removed in
# bcrypt 4.x — suppress the AttributeError/UserWarning it raises.
with warnings.catch_warnings():
    warnings.filterwarnings("ignore")
    try:
        from passlib.context import CryptContext
        pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
        _USE_PASSLIB = True
    except Exception:
        _USE_PASSLIB = False


def hash_password(password: str) -> str:
    """Hash a password using bcrypt. Falls back to direct bcrypt if passlib fails."""
    if _USE_PASSLIB:
        try:
            return pwd_context.hash(password)
        except Exception:
            pass
    # Direct bcrypt fallback (bcrypt 4.x)
    import bcrypt
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    if _USE_PASSLIB:
        try:
            return pwd_context.verify(plain_password, hashed_password)
        except Exception:
            pass
    import bcrypt
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {
        "sub": str(user_id),
        "role": role,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])


async def authenticate_user(db: AsyncSession, email: str, password: str) -> Optional[User]:
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    if user.status != UserStatus.ACTIVE:
        return None
    return user


async def get_user_by_id(db: AsyncSession, user_id: str) -> Optional[User]:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()
