"""
Org Admin router — manages colleges and college admins.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel

from app.database import get_db
from app.models.user import User, UserRole, UserStatus
from app.models.academic import College, Course, Branch, Semester
from app.schemas.user import UserResponse, CollegeAdminCreate, ResetPasswordRequest
from app.services.auth import hash_password
from app.services.email import send_email
from app.dependencies import require_org_admin

router = APIRouter(prefix="/org", tags=["org-admin"])


# ── Dashboard ─────────────────────────────────────────────────────────────────

@router.get("/dashboard")
async def org_dashboard(db: AsyncSession = Depends(get_db), _: User = Depends(require_org_admin)):
    total_colleges = await db.scalar(select(func.count(College.id))) or 0
    total_users = await db.scalar(select(func.count(User.id)).where(User.role != UserRole.ORG_ADMIN)) or 0
    total_students = await db.scalar(select(func.count(User.id)).where(User.role == UserRole.STUDENT)) or 0
    total_professors = await db.scalar(select(func.count(User.id)).where(User.role == UserRole.PROFESSOR)) or 0
    return {
        "total_colleges": total_colleges,
        "total_users": total_users,
        "total_students": total_students,
        "total_professors": total_professors,
    }


# ── College CRUD ──────────────────────────────────────────────────────────────

class CollegeBody(BaseModel):
    name: str
    description: str | None = None


@router.post("/colleges", status_code=201)
async def create_college(body: CollegeBody, db: AsyncSession = Depends(get_db), _: User = Depends(require_org_admin)):
    existing = await db.execute(select(College).where(College.name == body.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="College name already exists")
    college = College(name=body.name.strip(), description=body.description)
    db.add(college)
    await db.commit()
    await db.refresh(college)
    return _college_dict(college)


@router.get("/colleges")
async def list_colleges(db: AsyncSession = Depends(get_db), _: User = Depends(require_org_admin)):
    result = await db.execute(select(College).order_by(College.name))
    colleges = result.scalars().all()
    out = []
    for c in colleges:
        admin_count = await db.scalar(
            select(func.count(User.id)).where(User.college_id == c.id, User.role == UserRole.COLLEGE_ADMIN)
        ) or 0
        d = _college_dict(c)
        d["admin_count"] = admin_count
        out.append(d)
    return out


@router.patch("/colleges/{college_id}")
async def update_college(college_id: str, body: CollegeBody, db: AsyncSession = Depends(get_db), _: User = Depends(require_org_admin)):
    c = await db.get(College, college_id)
    if not c:
        raise HTTPException(status_code=404, detail="College not found")
    c.name = body.name.strip()
    if body.description is not None:
        c.description = body.description
    await db.commit()
    return _college_dict(c)


@router.post("/colleges/{college_id}/activate")
async def activate_college(college_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(require_org_admin)):
    c = await db.get(College, college_id)
    if not c:
        raise HTTPException(status_code=404, detail="College not found")
    c.is_active = True
    await db.commit()
    return {"message": "College activated"}


@router.post("/colleges/{college_id}/deactivate")
async def deactivate_college(college_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(require_org_admin)):
    c = await db.get(College, college_id)
    if not c:
        raise HTTPException(status_code=404, detail="College not found")
    c.is_active = False
    await db.commit()
    return {"message": "College deactivated"}


@router.delete("/colleges/{college_id}", status_code=204)
async def delete_college(college_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(require_org_admin)):
    c = await db.get(College, college_id)
    if not c:
        raise HTTPException(status_code=404, detail="College not found")
    await db.delete(c)
    await db.commit()


# ── College Admin CRUD ────────────────────────────────────────────────────────

@router.post("/colleges/{college_id}/admins", response_model=UserResponse, status_code=201)
async def create_college_admin(
    college_id: str, body: CollegeAdminCreate,
    db: AsyncSession = Depends(get_db), _: User = Depends(require_org_admin),
):
    c = await db.get(College, college_id)
    if not c:
        raise HTTPException(status_code=404, detail="College not found")

    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        name=body.name,
        email=body.email,
        phone=body.phone,
        hashed_password=hash_password(body.password),
        role=UserRole.COLLEGE_ADMIN,
        status=UserStatus.ACTIVE,
        college_id=college_id,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    await send_email(
        user.email,
        "Your College Admin Account",
        f"<p>Hello {user.name},</p>"
        f"<p>You have been assigned as College Admin for <strong>{c.name}</strong>.</p>"
        f"<p>Email: {user.email} | Password: {body.password}</p>"
        f"<p>Please log in and change your password.</p>",
    )
    return UserResponse.model_validate(user)


@router.get("/colleges/{college_id}/admins")
async def list_college_admins(
    college_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(require_org_admin)
):
    result = await db.execute(
        select(User).where(User.college_id == college_id, User.role == UserRole.COLLEGE_ADMIN)
    )
    return [UserResponse.model_validate(u) for u in result.scalars().all()]


@router.post("/colleges/{college_id}/admins/{admin_id}/reset-password")
async def reset_college_admin_password(
    college_id: str, admin_id: str, body: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db), _: User = Depends(require_org_admin),
):
    u = await db.get(User, admin_id)
    if not u or u.college_id != college_id or u.role != UserRole.COLLEGE_ADMIN:
        raise HTTPException(status_code=404, detail="Admin not found")
    u.hashed_password = hash_password(body.new_password)
    await db.commit()
    return {"message": "Password reset"}


@router.delete("/colleges/{college_id}/admins/{admin_id}", status_code=204)
async def delete_college_admin(
    college_id: str, admin_id: str,
    db: AsyncSession = Depends(get_db), _: User = Depends(require_org_admin),
):
    u = await db.get(User, admin_id)
    if not u or u.college_id != college_id or u.role != UserRole.COLLEGE_ADMIN:
        raise HTTPException(status_code=404, detail="Admin not found")
    await db.delete(u)
    await db.commit()


# ── Full hierarchy tree ───────────────────────────────────────────────────────

@router.get("/colleges/{college_id}/hierarchy")
async def college_hierarchy(
    college_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(require_org_admin)
):
    c = await db.get(College, college_id)
    if not c:
        raise HTTPException(status_code=404, detail="College not found")
    return await _build_hierarchy(db, c)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _college_dict(c: College) -> dict:
    return {"id": c.id, "name": c.name, "description": c.description, "is_active": c.is_active}


async def _build_hierarchy(db: AsyncSession, college: College) -> dict:
    courses_result = await db.execute(select(Course).where(Course.college_id == college.id).order_by(Course.name))
    courses = []
    for crs in courses_result.scalars().all():
        branches_result = await db.execute(select(Branch).where(Branch.course_id == crs.id).order_by(Branch.name))
        branches = []
        for br in branches_result.scalars().all():
            sems_result = await db.execute(select(Semester).where(Semester.branch_id == br.id).order_by(Semester.name))
            branches.append({
                "id": br.id, "name": br.name,
                "semesters": [{"id": s.id, "name": s.name} for s in sems_result.scalars().all()],
            })
        courses.append({"id": crs.id, "name": crs.name, "branches": branches})
    return {"id": college.id, "name": college.name, "description": college.description, "courses": courses}
