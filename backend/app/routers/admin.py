"""
Admin router — user management + full academic hierarchy management.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.database import get_db
from app.models.user import User, UserRole, UserStatus
from app.models.academic import (
    College, Course, Branch, Semester, ProfessorSemester, StudentEnrollment
)
from app.models.assignment import Assignment
from app.models.submission import Submission, SubmissionStatus
from app.schemas.user import (
    UserCreate, UserUpdate, UserResponse, UserListResponse, ResetPasswordRequest
)
from app.schemas.dashboard import AdminDashboardStats
from app.services.auth import hash_password
from app.services.email import send_email
from app.dependencies import require_admin
from pydantic import BaseModel

router = APIRouter(prefix="/admin", tags=["admin"])


# ── User Management ───────────────────────────────────────────────────────────

@router.post("/users", response_model=UserResponse, status_code=201)
async def create_user(
    body: UserCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    if body.role == UserRole.STUDENT:
        if not body.roll_number:
            raise HTTPException(status_code=422, detail="Roll number required for students")
        roll_exists = await db.execute(select(User).where(User.roll_number == body.roll_number))
        if roll_exists.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Roll number already registered")

    if body.role == UserRole.PROFESSOR:
        if not body.professor_id:
            raise HTTPException(status_code=422, detail="Professor ID required for professors")
        pid_exists = await db.execute(select(User).where(User.professor_id == body.professor_id))
        if pid_exists.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Professor ID already registered")

    user = User(
        name=body.name,
        email=body.email,
        phone=body.phone,
        hashed_password=hash_password(body.password),
        role=body.role,
        status=UserStatus.ACTIVE,
        roll_number=body.roll_number,
        professor_id=body.professor_id,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    # Email credentials to user (best-effort)
    await send_email(
        user.email,
        "Your AI Academic Platform Credentials",
        f"<p>Hello {user.name},</p>"
        f"<p>Your account has been created. Login credentials:</p>"
        f"<ul><li><strong>Email:</strong> {user.email}</li>"
        f"<li><strong>Password:</strong> {body.password}</li></ul>"
        f"<p>Please log in and change your password.</p>"
    )
    return UserResponse.model_validate(user)


@router.get("/users", response_model=list[UserListResponse])
async def list_users(
    role: UserRole | None = None,
    search: str | None = None,
    skip: int = 0,
    limit: int = Query(default=50, le=200),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    q = select(User)
    if role:
        q = q.where(User.role == role)
    if search:
        q = q.where(or_(
            User.name.ilike(f"%{search}%"),
            User.email.ilike(f"%{search}%"),
            User.roll_number.ilike(f"%{search}%"),
            User.professor_id.ilike(f"%{search}%"),
        ))
    q = q.offset(skip).limit(limit)
    result = await db.execute(q)
    return [UserListResponse.model_validate(u) for u in result.scalars().all()]


@router.get("/users/{user_id}", response_model=UserResponse)
async def get_user(user_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    u = await db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    return UserResponse.model_validate(u)


@router.patch("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str, body: UserUpdate,
    db: AsyncSession = Depends(get_db), _: User = Depends(require_admin),
):
    u = await db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    for field, val in body.model_dump(exclude_none=True, exclude={"semester_id"}).items():
        setattr(u, field, val)
    await db.commit()
    await db.refresh(u)
    return UserResponse.model_validate(u)


@router.post("/users/{user_id}/activate")
async def activate_user(user_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    u = await db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    u.status = UserStatus.ACTIVE
    await db.commit()
    return {"message": "User activated"}


@router.post("/users/{user_id}/deactivate")
async def deactivate_user(user_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    u = await db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    u.status = UserStatus.INACTIVE
    await db.commit()
    return {"message": "User deactivated"}


@router.post("/users/{user_id}/reset-password")
async def reset_password(
    user_id: str, body: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db), _: User = Depends(require_admin),
):
    u = await db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    u.hashed_password = hash_password(body.new_password)
    await db.commit()
    return {"message": "Password reset successfully"}


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(user_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    u = await db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    await db.delete(u)
    await db.commit()


# ── College Management ────────────────────────────────────────────────────────

class CollegeBody(BaseModel):
    name: str
    description: str | None = None


@router.post("/colleges", status_code=201)
async def create_college(body: CollegeBody, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    exists = await db.execute(select(College).where(College.name == body.name))
    if exists.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="College name already exists")
    college = College(name=body.name, description=body.description)
    db.add(college)
    await db.commit()
    await db.refresh(college)
    return {"id": college.id, "name": college.name, "description": college.description}


@router.get("/colleges")
async def list_colleges(db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    result = await db.execute(select(College).order_by(College.name))
    return [{"id": c.id, "name": c.name, "description": c.description} for c in result.scalars().all()]


@router.patch("/colleges/{college_id}")
async def update_college(college_id: str, body: CollegeBody, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    c = await db.get(College, college_id)
    if not c:
        raise HTTPException(status_code=404, detail="College not found")
    c.name = body.name
    if body.description is not None:
        c.description = body.description
    await db.commit()
    return {"id": c.id, "name": c.name}


@router.delete("/colleges/{college_id}", status_code=204)
async def delete_college(college_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    c = await db.get(College, college_id)
    if not c:
        raise HTTPException(status_code=404, detail="College not found")
    await db.delete(c)
    await db.commit()


# ── Course Management ─────────────────────────────────────────────────────────

class CourseBody(BaseModel):
    name: str


@router.post("/colleges/{college_id}/courses", status_code=201)
async def create_course(college_id: str, body: CourseBody, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    if not await db.get(College, college_id):
        raise HTTPException(status_code=404, detail="College not found")
    course = Course(college_id=college_id, name=body.name)
    db.add(course)
    await db.commit()
    await db.refresh(course)
    return {"id": course.id, "name": course.name, "college_id": course.college_id}


@router.get("/colleges/{college_id}/courses")
async def list_courses(college_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    result = await db.execute(select(Course).where(Course.college_id == college_id).order_by(Course.name))
    return [{"id": c.id, "name": c.name} for c in result.scalars().all()]


@router.patch("/colleges/{college_id}/courses/{course_id}")
async def update_course(college_id: str, course_id: str, body: CourseBody, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    c = await db.get(Course, course_id)
    if not c or c.college_id != college_id:
        raise HTTPException(status_code=404, detail="Course not found")
    c.name = body.name
    await db.commit()
    return {"id": c.id, "name": c.name}


@router.delete("/colleges/{college_id}/courses/{course_id}", status_code=204)
async def delete_course(college_id: str, course_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    c = await db.get(Course, course_id)
    if not c or c.college_id != college_id:
        raise HTTPException(status_code=404, detail="Course not found")
    await db.delete(c)
    await db.commit()


# ── Branch Management ─────────────────────────────────────────────────────────

class BranchBody(BaseModel):
    name: str


@router.post("/courses/{course_id}/branches", status_code=201)
async def create_branch(course_id: str, body: BranchBody, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    if not await db.get(Course, course_id):
        raise HTTPException(status_code=404, detail="Course not found")
    branch = Branch(course_id=course_id, name=body.name)
    db.add(branch)
    await db.commit()
    await db.refresh(branch)
    return {"id": branch.id, "name": branch.name, "course_id": branch.course_id}


@router.get("/courses/{course_id}/branches")
async def list_branches(course_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    result = await db.execute(select(Branch).where(Branch.course_id == course_id).order_by(Branch.name))
    return [{"id": b.id, "name": b.name} for b in result.scalars().all()]


@router.patch("/courses/{course_id}/branches/{branch_id}")
async def update_branch(course_id: str, branch_id: str, body: BranchBody, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    b = await db.get(Branch, branch_id)
    if not b or b.course_id != course_id:
        raise HTTPException(status_code=404, detail="Branch not found")
    b.name = body.name
    await db.commit()
    return {"id": b.id, "name": b.name}


@router.delete("/courses/{course_id}/branches/{branch_id}", status_code=204)
async def delete_branch(course_id: str, branch_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    b = await db.get(Branch, branch_id)
    if not b or b.course_id != course_id:
        raise HTTPException(status_code=404, detail="Branch not found")
    await db.delete(b)
    await db.commit()


# ── Semester Management ───────────────────────────────────────────────────────

class SemesterBody(BaseModel):
    name: str


@router.post("/branches/{branch_id}/semesters", status_code=201)
async def create_semester(branch_id: str, body: SemesterBody, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    if not await db.get(Branch, branch_id):
        raise HTTPException(status_code=404, detail="Branch not found")
    sem = Semester(branch_id=branch_id, name=body.name)
    db.add(sem)
    await db.commit()
    await db.refresh(sem)
    return {"id": sem.id, "name": sem.name, "branch_id": sem.branch_id}


@router.get("/branches/{branch_id}/semesters")
async def list_semesters(branch_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    result = await db.execute(select(Semester).where(Semester.branch_id == branch_id).order_by(Semester.name))
    return [{"id": s.id, "name": s.name} for s in result.scalars().all()]


@router.patch("/branches/{branch_id}/semesters/{semester_id}")
async def update_semester(branch_id: str, semester_id: str, body: SemesterBody, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    s = await db.get(Semester, semester_id)
    if not s or s.branch_id != branch_id:
        raise HTTPException(status_code=404, detail="Semester not found")
    s.name = body.name
    await db.commit()
    return {"id": s.id, "name": s.name}


@router.delete("/branches/{branch_id}/semesters/{semester_id}", status_code=204)
async def delete_semester(branch_id: str, semester_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    s = await db.get(Semester, semester_id)
    if not s or s.branch_id != branch_id:
        raise HTTPException(status_code=404, detail="Semester not found")
    await db.delete(s)
    await db.commit()


# ── Assign Professor / Enroll Student to Semester ────────────────────────────

class AssignBody(BaseModel):
    user_id: str


@router.post("/semesters/{semester_id}/professors")
async def assign_professor_to_semester(
    semester_id: str, body: AssignBody,
    db: AsyncSession = Depends(get_db), _: User = Depends(require_admin),
):
    if not await db.get(Semester, semester_id):
        raise HTTPException(status_code=404, detail="Semester not found")
    prof = await db.get(User, body.user_id)
    if not prof or prof.role != UserRole.PROFESSOR:
        raise HTTPException(status_code=404, detail="Professor not found")
    exists = await db.execute(
        select(ProfessorSemester).where(
            ProfessorSemester.professor_id == body.user_id,
            ProfessorSemester.semester_id == semester_id,
        )
    )
    if exists.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Already assigned")
    db.add(ProfessorSemester(professor_id=body.user_id, semester_id=semester_id))
    await db.commit()
    return {"message": "Professor assigned to semester"}


@router.delete("/semesters/{semester_id}/professors/{professor_id}", status_code=204)
async def remove_professor_from_semester(
    semester_id: str, professor_id: str,
    db: AsyncSession = Depends(get_db), _: User = Depends(require_admin),
):
    result = await db.execute(
        select(ProfessorSemester).where(
            ProfessorSemester.professor_id == professor_id,
            ProfessorSemester.semester_id == semester_id,
        )
    )
    ps = result.scalar_one_or_none()
    if not ps:
        raise HTTPException(status_code=404, detail="Assignment not found")
    await db.delete(ps)
    await db.commit()


@router.post("/semesters/{semester_id}/students")
async def enroll_student_in_semester(
    semester_id: str, body: AssignBody,
    db: AsyncSession = Depends(get_db), _: User = Depends(require_admin),
):
    if not await db.get(Semester, semester_id):
        raise HTTPException(status_code=404, detail="Semester not found")
    student = await db.get(User, body.user_id)
    if not student or student.role != UserRole.STUDENT:
        raise HTTPException(status_code=404, detail="Student not found")
    exists = await db.execute(
        select(StudentEnrollment).where(
            StudentEnrollment.student_id == body.user_id,
            StudentEnrollment.semester_id == semester_id,
        )
    )
    if exists.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Already enrolled")
    db.add(StudentEnrollment(student_id=body.user_id, semester_id=semester_id))
    await db.commit()
    return {"message": "Student enrolled in semester"}


@router.delete("/semesters/{semester_id}/students/{student_id}", status_code=204)
async def remove_student_from_semester(
    semester_id: str, student_id: str,
    db: AsyncSession = Depends(get_db), _: User = Depends(require_admin),
):
    result = await db.execute(
        select(StudentEnrollment).where(
            StudentEnrollment.student_id == student_id,
            StudentEnrollment.semester_id == semester_id,
        )
    )
    se = result.scalar_one_or_none()
    if not se:
        raise HTTPException(status_code=404, detail="Enrollment not found")
    await db.delete(se)
    await db.commit()


# ── Dashboard ─────────────────────────────────────────────────────────────────

@router.get("/dashboard", response_model=AdminDashboardStats)
async def get_dashboard(db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    total_students = await db.scalar(select(func.count(User.id)).where(User.role == UserRole.STUDENT, User.status == UserStatus.ACTIVE)) or 0
    total_professors = await db.scalar(select(func.count(User.id)).where(User.role == UserRole.PROFESSOR, User.status == UserStatus.ACTIVE)) or 0
    total_assignments = await db.scalar(select(func.count(Assignment.id))) or 0
    total_submissions = await db.scalar(select(func.count(Submission.id))) or 0
    pending_evaluations = await db.scalar(select(func.count(Submission.id)).where(Submission.status == SubmissionStatus.EVALUATING)) or 0

    from app.models.evaluation import EvaluationReport
    eval_result = await db.execute(
        select(EvaluationReport.ai_score, Assignment.max_marks)
        .join(Submission, Submission.id == EvaluationReport.submission_id)
        .join(Assignment, Assignment.id == Submission.assignment_id)
        .where(Submission.status == SubmissionStatus.EVALUATED)
    )
    scores = eval_result.all()
    avg = round(sum(r[0] / r[1] * 100 for r in scores if r[1] > 0) / len(scores), 2) if scores else 0.0

    return AdminDashboardStats(
        total_students=total_students, total_professors=total_professors,
        total_assignments=total_assignments, total_submissions=total_submissions,
        pending_evaluations=pending_evaluations, average_performance=avg,
    )


# ── Full hierarchy tree (for admin UI) ───────────────────────────────────────

@router.get("/hierarchy")
async def get_full_hierarchy(db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    """Return full College→Course→Branch→Semester tree."""
    colleges_result = await db.execute(select(College).order_by(College.name))
    colleges = colleges_result.scalars().all()
    tree = []
    for col in colleges:
        courses_result = await db.execute(select(Course).where(Course.college_id == col.id).order_by(Course.name))
        courses = []
        for crs in courses_result.scalars().all():
            branches_result = await db.execute(select(Branch).where(Branch.course_id == crs.id).order_by(Branch.name))
            branches = []
            for br in branches_result.scalars().all():
                sems_result = await db.execute(select(Semester).where(Semester.branch_id == br.id).order_by(Semester.name))
                branches.append({
                    "id": br.id, "name": br.name,
                    "semesters": [{"id": s.id, "name": s.name} for s in sems_result.scalars().all()]
                })
            courses.append({"id": crs.id, "name": crs.name, "branches": branches})
        tree.append({"id": col.id, "name": col.name, "description": col.description, "courses": courses})
    return tree
