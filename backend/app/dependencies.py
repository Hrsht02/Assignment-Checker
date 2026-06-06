from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User, UserRole, UserStatus
from app.services.auth import decode_token, get_user_by_id

bearer_scheme = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    try:
        payload = decode_token(credentials.credentials)
        user_id: str = payload["sub"]          # stored as plain string now
    except (JWTError, KeyError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    user = await get_user_by_id(db, user_id)
    if not user or user.status != UserStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    return user


async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access not permitted")
    return current_user


async def require_professor(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.PROFESSOR:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access not permitted")
    return current_user


async def require_student(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access not permitted")
    return current_user


def require_role(*roles: UserRole):
    async def _check(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access not permitted")
        return current_user
    return _check
