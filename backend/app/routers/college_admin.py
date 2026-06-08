"""
College Admin router — manages academic structure + professors + students
for their own college only.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel

from app.database import get_db
from app.models.user import User, UserRole, UserStatus
from app.models.academic import College, Course, Branch, Semester, ProfessorSemester, StudentEnrollment
from app.schemas.user import (
    UserResponse, ProfessorCreate, StudentCreate,
    StudentUpdate, ProfessorUpdate, ResetPasswordRequest,
)
from app.schemas.dashboard import AdminDashboardStats
from app.services.auth import hash_password
from app.services.email import send_email
from app.dependencies import require_college_admin

router = APIRouter(prefix="/college-admin", tags=["college-admin"])


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _assert_in_college(college_id: str, resource_college_id: str):
    if resource_college_id != college_id:
        raise HTTPException(status_code=403, detail="Access not permitted")


async def _get_semester_for_college(db: AsyncSession, semester_id: str, college_id: str) -> Semester:
    sem = await db.get(Semester, semester_id)
    if not sem:
        raise HTTPException(status_code=404, detail="Semester not found")
    branch = await db.get(Branch, sem.branch_id)
    course = await db.get(Course, branch.course_id)
    if course.college_id != college_id:
        raise HTTPException(status_code=403, detail="Semester does not belong to your college")
    return sem


# ── Dashboard ─────────────────────────────────────────────────────────────────

@router.get("/dashboard", response_model=AdminDashboardStats)
async def dashboard(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_college_admin),
    course_id: str | None = None,
    branch_id: str | None = None,
    semester_id: str | None = None,
):
    cid = current_user.college_id
    from app.models.assignment import Assignment
    from app.models.submission import Submission, SubmissionStatus
    from app.models.evaluation import EvaluationReport

    total_students = await db.scalar(
        select(func.count(User.id)).where(User.college_id == cid, User.role == UserRole.STUDENT, User.status == UserStatus.ACTIVE)
    ) or 0
    total_professors = await db.scalar(
        select(func.count(User.id)).where(User.college_id == cid, User.role == UserRole.PROFESSOR, User.status == UserStatus.ACTIVE)
    ) or 0

    # Assignments belonging to this college's semesters (optionally filtered)
    college_semesters = await _get_college_semester_ids(db, cid, course_id=course_id, branch_id=branch_id, semester_id=semester_id)
    total_assignments = await db.scalar(
        select(func.count(Assignment.id)).where(Assignment.semester_id.in_(college_semesters))
    ) or 0
    total_submissions = await db.scalar(
        select(func.count(Submission.id)).join(Assignment, Assignment.id == Submission.assignment_id)
        .where(Assignment.semester_id.in_(college_semesters))
    ) or 0
    pending = await db.scalar(
        select(func.count(Submission.id)).join(Assignment, Assignment.id == Submission.assignment_id)
        .where(Assignment.semester_id.in_(college_semesters), Submission.status == SubmissionStatus.EVALUATING)
    ) or 0

    scores = (await db.execute(
        select(EvaluationReport.ai_score, Assignment.max_marks)
        .join(Submission, Submission.id == EvaluationReport.submission_id)
        .join(Assignment, Assignment.id == Submission.assignment_id)
        .where(Assignment.semester_id.in_(college_semesters))
    )).all()
    avg = round(sum(r[0] / r[1] * 100 for r in scores if r[1] > 0) / len(scores), 2) if scores else 0.0

    return AdminDashboardStats(
        total_students=total_students, total_professors=total_professors,
        total_assignments=total_assignments, total_submissions=total_submissions,
        pending_evaluations=pending, average_performance=avg,
    )


# ── Academic Structure (Course/Branch/Semester) ───────────────────────────────

class NameBody(BaseModel):
    name: str


@router.post("/courses", status_code=201)
async def create_course(body: NameBody, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_college_admin)):
    course = Course(college_id=current_user.college_id, name=body.name.strip())
    db.add(course)
    await db.commit()
    await db.refresh(course)
    return {"id": course.id, "name": course.name}


@router.get("/courses")
async def list_courses(db: AsyncSession = Depends(get_db), current_user: User = Depends(require_college_admin)):
    result = await db.execute(select(Course).where(Course.college_id == current_user.college_id).order_by(Course.name))
    return [{"id": c.id, "name": c.name} for c in result.scalars().all()]


@router.patch("/courses/{course_id}")
async def update_course(course_id: str, body: NameBody, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_college_admin)):
    c = await db.get(Course, course_id)
    if not c or c.college_id != current_user.college_id:
        raise HTTPException(status_code=404, detail="Course not found")
    c.name = body.name.strip()
    await db.commit()
    return {"id": c.id, "name": c.name}


@router.delete("/courses/{course_id}", status_code=204)
async def delete_course(course_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_college_admin)):
    c = await db.get(Course, course_id)
    if not c or c.college_id != current_user.college_id:
        raise HTTPException(status_code=404, detail="Course not found")
    await db.delete(c)
    await db.commit()


@router.post("/courses/{course_id}/branches", status_code=201)
async def create_branch(course_id: str, body: NameBody, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_college_admin)):
    c = await db.get(Course, course_id)
    if not c or c.college_id != current_user.college_id:
        raise HTTPException(status_code=404, detail="Course not found")
    branch = Branch(course_id=course_id, name=body.name.strip())
    db.add(branch)
    await db.commit()
    await db.refresh(branch)
    return {"id": branch.id, "name": branch.name, "course_id": branch.course_id}


@router.get("/courses/{course_id}/branches")
async def list_branches(course_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_college_admin)):
    c = await db.get(Course, course_id)
    if not c or c.college_id != current_user.college_id:
        raise HTTPException(status_code=404, detail="Course not found")
    result = await db.execute(select(Branch).where(Branch.course_id == course_id).order_by(Branch.name))
    return [{"id": b.id, "name": b.name} for b in result.scalars().all()]


@router.patch("/courses/{course_id}/branches/{branch_id}")
async def update_branch(course_id: str, branch_id: str, body: NameBody, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_college_admin)):
    b = await db.get(Branch, branch_id)
    if not b or b.course_id != course_id:
        raise HTTPException(status_code=404, detail="Branch not found")
    b.name = body.name.strip()
    await db.commit()
    return {"id": b.id, "name": b.name}


@router.delete("/courses/{course_id}/branches/{branch_id}", status_code=204)
async def delete_branch(course_id: str, branch_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_college_admin)):
    b = await db.get(Branch, branch_id)
    if not b or b.course_id != course_id:
        raise HTTPException(status_code=404, detail="Branch not found")
    await db.delete(b)
    await db.commit()


@router.post("/branches/{branch_id}/semesters", status_code=201)
async def create_semester(branch_id: str, body: NameBody, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_college_admin)):
    b = await db.get(Branch, branch_id)
    if not b:
        raise HTTPException(status_code=404, detail="Branch not found")
    sem = Semester(branch_id=branch_id, name=body.name.strip())
    db.add(sem)
    await db.commit()
    await db.refresh(sem)
    return {"id": sem.id, "name": sem.name, "branch_id": sem.branch_id}


@router.get("/branches/{branch_id}/semesters")
async def list_semesters(branch_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_college_admin)):
    result = await db.execute(select(Semester).where(Semester.branch_id == branch_id).order_by(Semester.name))
    return [{"id": s.id, "name": s.name} for s in result.scalars().all()]


@router.patch("/branches/{branch_id}/semesters/{semester_id}")
async def update_semester(branch_id: str, semester_id: str, body: NameBody, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_college_admin)):
    s = await db.get(Semester, semester_id)
    if not s or s.branch_id != branch_id:
        raise HTTPException(status_code=404, detail="Semester not found")
    s.name = body.name.strip()
    await db.commit()
    return {"id": s.id, "name": s.name}


@router.delete("/branches/{branch_id}/semesters/{semester_id}", status_code=204)
async def delete_semester(branch_id: str, semester_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_college_admin)):
    s = await db.get(Semester, semester_id)
    if not s or s.branch_id != branch_id:
        raise HTTPException(status_code=404, detail="Semester not found")
    await db.delete(s)
    await db.commit()


# ── Full hierarchy tree ───────────────────────────────────────────────────────

@router.get("/hierarchy")
async def get_hierarchy(db: AsyncSession = Depends(get_db), current_user: User = Depends(require_college_admin)):
    courses_result = await db.execute(
        select(Course).where(Course.college_id == current_user.college_id).order_by(Course.name)
    )
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
    return {"college_id": current_user.college_id, "courses": courses}


# ── Professor Management ──────────────────────────────────────────────────────

@router.post("/professors", response_model=UserResponse, status_code=201)
async def create_professor(
    body: ProfessorCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_college_admin),
):
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    pid_exists = await db.execute(
        select(User).where(User.professor_id == body.professor_id, User.college_id == current_user.college_id)
    )
    if pid_exists.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Professor ID already exists in this college")

    user = User(
        name=body.name,
        email=body.email,
        phone=body.phone,
        hashed_password=hash_password(body.password),
        role=UserRole.PROFESSOR,
        status=UserStatus.ACTIVE,
        college_id=current_user.college_id,
        professor_id=body.professor_id,
    )
    db.add(user)
    await db.flush()

    # Assign to requested semesters (validate they belong to this college)
    for sem_id in body.semester_ids:
        await _get_semester_for_college(db, sem_id, current_user.college_id)
        db.add(ProfessorSemester(professor_id=user.id, semester_id=sem_id))

    await db.commit()
    await db.refresh(user)

    await send_email(
        user.email, "Your Professor Account",
        f"<p>Hello {user.name},</p>"
        f"<p>Your professor account has been created.</p>"
        f"<p>Professor ID: {user.professor_id} | Email: {user.email} | Password: {body.password}</p>",
    )
    return UserResponse.model_validate(user)


@router.get("/professors")
async def list_professors(
    search: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_college_admin),
):
    q = select(User).where(User.college_id == current_user.college_id, User.role == UserRole.PROFESSOR)
    if search:
        from sqlalchemy import or_
        q = q.where(or_(User.name.ilike(f"%{search}%"), User.email.ilike(f"%{search}%"), User.professor_id.ilike(f"%{search}%")))
    result = await db.execute(q)
    return [UserResponse.model_validate(u) for u in result.scalars().all()]


@router.patch("/professors/{professor_id}", response_model=UserResponse)
async def update_professor(
    professor_id: str, body: ProfessorUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_college_admin),
):
    u = await db.get(User, professor_id)
    if not u or u.college_id != current_user.college_id or u.role != UserRole.PROFESSOR:
        raise HTTPException(status_code=404, detail="Professor not found")

    if body.name is not None:
        u.name = body.name
    if body.phone is not None:
        u.phone = body.phone

    if body.semester_ids is not None:
        # Remove all existing assignments
        existing = await db.execute(select(ProfessorSemester).where(ProfessorSemester.professor_id == u.id))
        for ps in existing.scalars().all():
            await db.delete(ps)
        # Add new assignments
        for sem_id in body.semester_ids:
            await _get_semester_for_college(db, sem_id, current_user.college_id)
            db.add(ProfessorSemester(professor_id=u.id, semester_id=sem_id))

    await db.commit()
    await db.refresh(u)
    return UserResponse.model_validate(u)


@router.post("/professors/{professor_id}/activate")
async def activate_professor(professor_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_college_admin)):
    u = await db.get(User, professor_id)
    if not u or u.college_id != current_user.college_id:
        raise HTTPException(status_code=404, detail="Professor not found")
    u.status = UserStatus.ACTIVE
    await db.commit()
    return {"message": "Activated"}


@router.post("/professors/{professor_id}/deactivate")
async def deactivate_professor(professor_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_college_admin)):
    u = await db.get(User, professor_id)
    if not u or u.college_id != current_user.college_id:
        raise HTTPException(status_code=404, detail="Professor not found")
    u.status = UserStatus.INACTIVE
    await db.commit()
    return {"message": "Deactivated"}


@router.post("/professors/{professor_id}/reset-password")
async def reset_professor_password(professor_id: str, body: ResetPasswordRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_college_admin)):
    u = await db.get(User, professor_id)
    if not u or u.college_id != current_user.college_id:
        raise HTTPException(status_code=404, detail="Professor not found")
    u.hashed_password = hash_password(body.new_password)
    await db.commit()
    return {"message": "Password reset"}


@router.delete("/professors/{professor_id}", status_code=204)
async def delete_professor(professor_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_college_admin)):
    u = await db.get(User, professor_id)
    if not u or u.college_id != current_user.college_id:
        raise HTTPException(status_code=404, detail="Professor not found")
    await db.delete(u)
    await db.commit()


# ── Student Management ────────────────────────────────────────────────────────

@router.post("/students", response_model=UserResponse, status_code=201)
async def create_student(
    body: StudentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_college_admin),
):
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    roll_exists = await db.execute(
        select(User).where(User.roll_number == body.roll_number, User.college_id == current_user.college_id)
    )
    if roll_exists.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Roll number already exists in this college")

    # Validate semester belongs to this college
    sem = await _get_semester_for_college(db, body.semester_id, current_user.college_id)

    user = User(
        name=body.name,
        email=body.email,
        phone=body.phone,
        hashed_password=hash_password(body.password),
        role=UserRole.STUDENT,
        status=UserStatus.ACTIVE,
        college_id=current_user.college_id,
        roll_number=body.roll_number,
    )
    db.add(user)
    await db.flush()

    # Auto-enroll into the semester
    db.add(StudentEnrollment(student_id=user.id, semester_id=body.semester_id))

    await db.commit()
    await db.refresh(user)

    await send_email(
        user.email, "Your Student Account",
        f"<p>Hello {user.name},</p>"
        f"<p>Your student account has been created.</p>"
        f"<p>Roll No: {user.roll_number} | Email: {user.email} | Password: {body.password}</p>",
    )
    return UserResponse.model_validate(user)


@router.get("/students")
async def list_students(
    search: str | None = None,
    semester_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_college_admin),
):
    if semester_id:
        q = select(User).join(StudentEnrollment, StudentEnrollment.student_id == User.id).where(
            User.college_id == current_user.college_id,
            User.role == UserRole.STUDENT,
            StudentEnrollment.semester_id == semester_id,
        )
    else:
        q = select(User).where(User.college_id == current_user.college_id, User.role == UserRole.STUDENT)

    if search:
        from sqlalchemy import or_
        q = q.where(or_(User.name.ilike(f"%{search}%"), User.roll_number.ilike(f"%{search}%"), User.email.ilike(f"%{search}%")))

    result = await db.execute(q)
    return [UserResponse.model_validate(u) for u in result.scalars().all()]


@router.patch("/students/{student_id}", response_model=UserResponse)
async def update_student(
    student_id: str, body: StudentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_college_admin),
):
    u = await db.get(User, student_id)
    if not u or u.college_id != current_user.college_id or u.role != UserRole.STUDENT:
        raise HTTPException(status_code=404, detail="Student not found")

    if body.name is not None:
        u.name = body.name
    if body.phone is not None:
        u.phone = body.phone

    if body.semester_id is not None:
        # Validate new semester
        await _get_semester_for_college(db, body.semester_id, current_user.college_id)
        # Remove old enrollment
        old_enr = await db.execute(select(StudentEnrollment).where(StudentEnrollment.student_id == u.id))
        for enr in old_enr.scalars().all():
            await db.delete(enr)
        # Add new enrollment
        db.add(StudentEnrollment(student_id=u.id, semester_id=body.semester_id))

    await db.commit()
    await db.refresh(u)
    return UserResponse.model_validate(u)


@router.post("/students/{student_id}/activate")
async def activate_student(student_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_college_admin)):
    u = await db.get(User, student_id)
    if not u or u.college_id != current_user.college_id:
        raise HTTPException(status_code=404, detail="Student not found")
    u.status = UserStatus.ACTIVE
    await db.commit()
    return {"message": "Activated"}


@router.post("/students/{student_id}/deactivate")
async def deactivate_student(student_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_college_admin)):
    u = await db.get(User, student_id)
    if not u or u.college_id != current_user.college_id:
        raise HTTPException(status_code=404, detail="Student not found")
    u.status = UserStatus.INACTIVE
    await db.commit()
    return {"message": "Deactivated"}


@router.post("/students/{student_id}/reset-password")
async def reset_student_password(student_id: str, body: ResetPasswordRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_college_admin)):
    u = await db.get(User, student_id)
    if not u or u.college_id != current_user.college_id:
        raise HTTPException(status_code=404, detail="Student not found")
    u.hashed_password = hash_password(body.new_password)
    await db.commit()
    return {"message": "Password reset"}


@router.delete("/students/{student_id}", status_code=204)
async def delete_student(student_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_college_admin)):
    u = await db.get(User, student_id)
    if not u or u.college_id != current_user.college_id:
        raise HTTPException(status_code=404, detail="Student not found")
    await db.delete(u)
    await db.commit()


# ── Assign / remove professor from semester ───────────────────────────────────

class AssignBody(BaseModel):
    professor_id: str


@router.post("/semesters/{semester_id}/professors")
async def assign_professor(semester_id: str, body: AssignBody, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_college_admin)):
    await _get_semester_for_college(db, semester_id, current_user.college_id)
    prof = await db.get(User, body.professor_id)
    if not prof or prof.college_id != current_user.college_id or prof.role != UserRole.PROFESSOR:
        raise HTTPException(status_code=404, detail="Professor not found")
    exists = await db.execute(
        select(ProfessorSemester).where(ProfessorSemester.professor_id == body.professor_id, ProfessorSemester.semester_id == semester_id)
    )
    if exists.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Already assigned")
    db.add(ProfessorSemester(professor_id=body.professor_id, semester_id=semester_id))
    await db.commit()
    return {"message": "Professor assigned"}


@router.delete("/semesters/{semester_id}/professors/{professor_id}", status_code=204)
async def remove_professor(semester_id: str, professor_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_college_admin)):
    ps = (await db.execute(
        select(ProfessorSemester).where(ProfessorSemester.professor_id == professor_id, ProfessorSemester.semester_id == semester_id)
    )).scalar_one_or_none()
    if not ps:
        raise HTTPException(status_code=404, detail="Assignment not found")
    await db.delete(ps)
    await db.commit()


# ── Private helper ────────────────────────────────────────────────────────────

async def _get_college_semester_ids(db: AsyncSession, college_id: str, course_id: str | None = None, branch_id: str | None = None, semester_id: str | None = None) -> list[str]:
    # If a specific semester is requested, validate it belongs to this college
    if semester_id:
        try:
            await _get_semester_for_college(db, semester_id, college_id)
            return [semester_id]
        except Exception:
            return []

    courses = (await db.execute(select(Course).where(Course.college_id == college_id))).scalars().all()
    if course_id:
        courses = [c for c in courses if c.id == course_id]

    ids = []
    for c in courses:
        branches = (await db.execute(select(Branch).where(Branch.course_id == c.id))).scalars().all()
        if branch_id:
            branches = [b for b in branches if b.id == branch_id]
        for b in branches:
            sems = (await db.execute(select(Semester).where(Semester.branch_id == b.id))).scalars().all()
            ids.extend(s.id for s in sems)
    return ids
