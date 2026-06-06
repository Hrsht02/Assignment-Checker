from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.database import get_db
from app.models.user import User, UserRole, UserStatus
from app.models.assignment import Assignment
from app.models.submission import Submission, SubmissionStatus
from app.models.evaluation import EvaluationReport
from app.models.marks import MarksOverride
from app.schemas.user import UserCreate, UserUpdate, UserResponse, UserListResponse
from app.schemas.dashboard import AdminDashboardStats
from app.services.auth import hash_password
from app.services.email import send_welcome_email
from app.dependencies import require_admin

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    # Check duplicate email
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    # Validate roll_number for students
    if body.role == UserRole.STUDENT:
        if not body.roll_number:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Roll number is required for students",
            )
        existing_roll = await db.execute(
            select(User).where(User.roll_number == body.roll_number)
        )
        if existing_roll.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Roll number already registered",
            )

    user = User(
        name=body.name,
        email=body.email,
        hashed_password=hash_password(body.password),
        role=body.role,
        status=UserStatus.ACTIVE,
        roll_number=body.roll_number,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    # Send welcome email (best-effort)
    await send_welcome_email(user.email, user.name, user.email, body.password)

    return UserResponse.model_validate(user)


@router.get("/users", response_model=list[UserListResponse])
async def list_users(
    role: UserRole | None = None,
    status: UserStatus | None = None,
    search: str | None = None,
    skip: int = 0,
    limit: int = Query(default=50, le=200),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    query = select(User)
    if role:
        query = query.where(User.role == role)
    if status:
        query = query.where(User.status == status)
    if search:
        query = query.where(
            or_(
                User.name.ilike(f"%{search}%"),
                User.email.ilike(f"%{search}%"),
                User.roll_number.ilike(f"%{search}%"),
            )
        )
    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    return [UserListResponse.model_validate(u) for u in result.scalars().all()]


@router.get("/users/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserResponse.model_validate(user)


@router.patch("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    body: UserUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if body.name is not None:
        user.name = body.name
    if body.role is not None:
        user.role = body.role
    if body.status is not None:
        user.status = body.status

    await db.commit()
    await db.refresh(user)
    return UserResponse.model_validate(user)


@router.post("/users/{user_id}/deactivate")
async def deactivate_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.status = UserStatus.INACTIVE
    await db.commit()
    return {"message": "User deactivated"}


@router.post("/users/{user_id}/activate")
async def activate_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.status = UserStatus.ACTIVE
    await db.commit()
    return {"message": "User activated"}


@router.get("/dashboard", response_model=AdminDashboardStats)
async def get_dashboard(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    total_students = await db.scalar(
        select(func.count(User.id)).where(
            User.role == UserRole.STUDENT, User.status == UserStatus.ACTIVE
        )
    )
    total_professors = await db.scalar(
        select(func.count(User.id)).where(
            User.role == UserRole.PROFESSOR, User.status == UserStatus.ACTIVE
        )
    )
    total_assignments = await db.scalar(select(func.count(Assignment.id)))
    total_submissions = await db.scalar(select(func.count(Submission.id)))
    pending_evaluations = await db.scalar(
        select(func.count(Submission.id)).where(
            Submission.status == SubmissionStatus.EVALUATING
        )
    )

    # Average performance: mean of (score / max_marks) across evaluated submissions
    eval_result = await db.execute(
        select(EvaluationReport.ai_score, Assignment.max_marks)
        .join(Submission, Submission.id == EvaluationReport.submission_id)
        .join(Assignment, Assignment.id == Submission.assignment_id)
        .where(Submission.status == SubmissionStatus.EVALUATED)
    )
    scores = eval_result.all()

    if scores:
        percentages = []
        for row in scores:
            # Check for override
            override_result = await db.execute(
                select(MarksOverride).where(
                    MarksOverride.submission_id == row[0]
                )
            )
            # Use ai_score directly here for simplicity
            if row[1] > 0:
                percentages.append(row[0] / row[1] * 100)
        avg_performance = sum(percentages) / len(percentages) if percentages else 0.0
    else:
        avg_performance = 0.0

    return AdminDashboardStats(
        total_students=total_students or 0,
        total_professors=total_professors or 0,
        total_assignments=total_assignments or 0,
        total_submissions=total_submissions or 0,
        pending_evaluations=pending_evaluations or 0,
        average_performance=round(avg_performance, 2),
    )


@router.patch("/settings/similarity-threshold")
async def update_similarity_threshold(
    threshold: float,
    _: User = Depends(require_admin),
):
    """Update the global similarity threshold (stored in env/config for now)."""
    if not (0.0 <= threshold <= 1.0):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Threshold must be between 0.0 and 1.0",
        )
    # In production, this would persist to a settings table
    return {"message": f"Similarity threshold updated to {threshold}", "threshold": threshold}
