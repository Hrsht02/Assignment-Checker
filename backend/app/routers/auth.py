from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.user import User, UserStatus, UserRole
from app.schemas.user import (
    LoginRequest, TokenResponse, UserResponse,
    ChangePasswordRequest, SignupRequest,
)
from app.services.auth import authenticate_user, create_access_token, hash_password, verify_password
from app.dependencies import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def signup(request: SignupRequest, db: AsyncSession = Depends(get_db)):
    """
    Public self-registration — no email verification.
    Account is created and immediately active.
    Returns a JWT token so the user is logged in straight away.
    """
    # Check duplicate identifier
    existing = await db.execute(select(User).where(User.email == request.email))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email/phone already exists",
        )

    # Students must provide a roll number
    if request.role == UserRole.STUDENT and not request.roll_number:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Roll number is required for students",
        )

    # Check duplicate roll number
    if request.roll_number:
        existing_roll = await db.execute(
            select(User).where(User.roll_number == request.roll_number)
        )
        if existing_roll.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Roll number already registered",
            )

    user = User(
        name=request.name,
        email=request.email,
        hashed_password=hash_password(request.password),
        role=request.role,
        status=UserStatus.ACTIVE,
        roll_number=request.roll_number,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(user.id, user.role.value)
    return TokenResponse(
        access_token=token,
        user=UserResponse.model_validate(user),
    )


@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = await authenticate_user(db, request.email, request.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    token = create_access_token(user.id, user.role.value)
    return TokenResponse(
        access_token=token,
        user=UserResponse.model_validate(user),
    )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse.model_validate(current_user)


@router.post("/change-password")
async def change_password(
    request: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(request.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )
    current_user.hashed_password = hash_password(request.new_password)
    await db.commit()
    return {"message": "Password updated successfully"}
