"""
Assignment management.
Professors create assignments for their assigned semesters.
Students see only assignments for their enrolled semester.
"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel

from app.database import get_db
from app.models.assignment import Assignment, AssignmentStatus
from app.models.academic import Semester, ProfessorSemester, StudentEnrollment, Branch, Course
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User, UserRole
from app.models.notification import NotificationType
from app.services import notification as notif_svc
from app.services.email import send_email
from app.services.storage import upload_file
from app.dependencies import require_professor, get_current_user
from app.config import get_settings

settings = get_settings()
router = APIRouter(prefix="/assignments", tags=["assignments"])


async def _require_prof_semester(professor_id: str, semester_id: str, db: AsyncSession) -> Semester:
    ps = (await db.execute(
        select(ProfessorSemester).where(
            ProfessorSemester.professor_id == professor_id,
            ProfessorSemester.semester_id == semester_id,
        )
    )).scalar_one_or_none()
    if not ps:
        raise HTTPException(status_code=403, detail="Access not permitted")
    sem = await db.get(Semester, semester_id)
    if not sem:
        raise HTTPException(status_code=404, detail="Semester not found")
    return sem


# ── Create ─────────────────────────────────────────────────────────────────────

@router.post("/semesters/{semester_id}", status_code=201)
async def create_assignment(
    semester_id: str,
    title: str = Form(...),
    description: str = Form(...),
    max_marks: int = Form(...),
    deadline: datetime = Form(...),
    rubric: str = Form(...),
    question_text: str | None = Form(None),
    question_pdf: UploadFile | None = File(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor),
):
    await _require_prof_semester(current_user.id, semester_id, db)

    if deadline <= datetime.now(timezone.utc):
        raise HTTPException(status_code=422, detail="Deadline must be in the future")
    if not question_text and not question_pdf:
        raise HTTPException(status_code=422, detail="Provide question_text or question_pdf")

    pdf_url = pdf_key = None
    if question_pdf:
        if question_pdf.content_type != "application/pdf":
            raise HTTPException(status_code=422, detail="Question paper must be a PDF")
        content = await question_pdf.read()
        if len(content) > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
            raise HTTPException(status_code=422, detail=f"File exceeds {settings.MAX_UPLOAD_SIZE_MB} MB")
        await question_pdf.seek(0)
        try:
            pdf_key, pdf_url = await upload_file(question_pdf, f"questions/{semester_id}")
        except RuntimeError as e:
            raise HTTPException(status_code=500, detail=str(e))

    assignment = Assignment(
        semester_id=semester_id,
        created_by=current_user.id,
        title=title.strip(),
        description=description.strip(),
        max_marks=max_marks,
        deadline=deadline,
        rubric=rubric.strip(),
        question_text=question_text,
        question_pdf_url=pdf_url,
        question_pdf_key=pdf_key,
        status=AssignmentStatus.ACTIVE,
    )
    db.add(assignment)
    await db.flush()

    # Notify enrolled students
    enrolled = (await db.execute(
        select(StudentEnrollment).where(StudentEnrollment.semester_id == semester_id)
    )).scalars().all()
    for enr in enrolled:
        student = await db.get(User, enr.student_id)
        if student:
            await notif_svc.create_notification(
                db, student.id, NotificationType.ASSIGNMENT_POSTED,
                "New Assignment", f"'{assignment.title}' has been posted.",
                reference_id=assignment.id, reference_type="assignment",
            )

    await db.commit()
    await db.refresh(assignment)
    return _assignment_dict(assignment)


# ── List by semester ───────────────────────────────────────────────────────────

@router.get("/semesters/{semester_id}")
async def list_semester_assignments(
    semester_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == UserRole.PROFESSOR:
        await _require_prof_semester(current_user.id, semester_id, db)
    elif current_user.role == UserRole.STUDENT:
        enr = (await db.execute(
            select(StudentEnrollment).where(
                StudentEnrollment.student_id == current_user.id,
                StudentEnrollment.semester_id == semester_id,
            )
        )).scalar_one_or_none()
        if not enr:
            raise HTTPException(status_code=403, detail="Access not permitted")

    result = await db.execute(
        select(Assignment).where(
            Assignment.semester_id == semester_id,
            Assignment.status != AssignmentStatus.DELETED,
        ).order_by(Assignment.created_at.desc())
    )
    out = []
    for a in result.scalars().all():
        sub_count = await db.scalar(select(func.count(Submission.id)).where(Submission.assignment_id == a.id)) or 0
        d = _assignment_dict(a)
        d["submission_count"] = sub_count
        out.append(d)
    return out


# ── Get one ────────────────────────────────────────────────────────────────────

@router.get("/{assignment_id}")
async def get_assignment(
    assignment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    a = await db.get(Assignment, assignment_id)
    if not a or a.status == AssignmentStatus.DELETED:
        raise HTTPException(status_code=404, detail="Assignment not found")

    if current_user.role == UserRole.PROFESSOR:
        await _require_prof_semester(current_user.id, a.semester_id, db)
    elif current_user.role == UserRole.STUDENT:
        enr = (await db.execute(
            select(StudentEnrollment).where(
                StudentEnrollment.student_id == current_user.id,
                StudentEnrollment.semester_id == a.semester_id,
            )
        )).scalar_one_or_none()
        if not enr:
            raise HTTPException(status_code=403, detail="Access not permitted")

    return _assignment_dict(a)


# ── Update ─────────────────────────────────────────────────────────────────────

class AssignmentUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    deadline: datetime | None = None
    rubric: str | None = None
    max_marks: int | None = None


@router.patch("/{assignment_id}")
async def update_assignment(
    assignment_id: str,
    body: AssignmentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor),
):
    a = await db.get(Assignment, assignment_id)
    if not a or a.status == AssignmentStatus.DELETED:
        raise HTTPException(status_code=404, detail="Assignment not found")
    await _require_prof_semester(current_user.id, a.semester_id, db)

    has_subs = (await db.scalar(
        select(func.count(Submission.id)).where(Submission.assignment_id == a.id)
    ) or 0) > 0

    if body.deadline is not None:
        if body.deadline <= datetime.now(timezone.utc):
            raise HTTPException(status_code=422, detail="Deadline must be in the future")
        a.deadline = body.deadline
        # Notify students
        enrolled = (await db.execute(
            select(StudentEnrollment).where(StudentEnrollment.semester_id == a.semester_id)
        )).scalars().all()
        for enr in enrolled:
            student = await db.get(User, enr.student_id)
            if student:
                await notif_svc.create_notification(
                    db, student.id, NotificationType.ASSIGNMENT_POSTED,
                    "Deadline Extended",
                    f"Deadline for '{a.title}' updated to {body.deadline.strftime('%Y-%m-%d %H:%M UTC')}.",
                    reference_id=a.id, reference_type="assignment",
                )

    if body.rubric is not None:
        a.rubric = body.rubric
    if not has_subs:
        if body.title is not None:
            a.title = body.title
        if body.description is not None:
            a.description = body.description
        if body.max_marks is not None:
            a.max_marks = body.max_marks

    await db.commit()
    await db.refresh(a)
    return _assignment_dict(a)


# ── Delete ─────────────────────────────────────────────────────────────────────

@router.delete("/{assignment_id}", status_code=204)
async def delete_assignment(
    assignment_id: str,
    confirmed: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor),
):
    a = await db.get(Assignment, assignment_id)
    if not a or a.status == AssignmentStatus.DELETED:
        raise HTTPException(status_code=404, detail="Assignment not found")
    await _require_prof_semester(current_user.id, a.semester_id, db)

    has_subs = (await db.scalar(
        select(func.count(Submission.id)).where(Submission.assignment_id == a.id)
    ) or 0) > 0
    if has_subs and not confirmed:
        raise HTTPException(status_code=409, detail="Has submissions. Add ?confirmed=true to confirm deletion.")

    enrolled = (await db.execute(
        select(StudentEnrollment).where(StudentEnrollment.semester_id == a.semester_id)
    )).scalars().all()
    for enr in enrolled:
        student = await db.get(User, enr.student_id)
        if student:
            await notif_svc.create_notification(
                db, student.id, NotificationType.ASSIGNMENT_POSTED,
                "Assignment Removed", f"'{a.title}' has been removed.",
                reference_id=a.id, reference_type="assignment",
            )

    a.status = AssignmentStatus.DELETED
    await db.commit()


# ── Professor: all my assignments ─────────────────────────────────────────────

@router.get("/professor/my-assignments")
async def my_assignments(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor),
):
    ps_result = (await db.execute(
        select(ProfessorSemester).where(ProfessorSemester.professor_id == current_user.id)
    )).scalars().all()

    out = []
    for ps in ps_result:
        sem = await db.get(Semester, ps.semester_id)
        if not sem:
            continue
        branch = await db.get(Branch, sem.branch_id)
        course = await db.get(Course, branch.course_id) if branch else None

        a_result = (await db.execute(
            select(Assignment).where(
                Assignment.semester_id == sem.id,
                Assignment.status != AssignmentStatus.DELETED,
            ).order_by(Assignment.created_at.desc())
        )).scalars().all()

        out.append({
            "semester_id": sem.id,
            "semester_name": sem.name,
            "branch_name": branch.name if branch else "",
            "course_name": course.name if course else "",
            "assignments": [_assignment_dict(a) for a in a_result],
        })
    return out


# ── Helper ─────────────────────────────────────────────────────────────────────

def _assignment_dict(a: Assignment) -> dict:
    return {
        "id": a.id,
        "semester_id": a.semester_id,
        "created_by": a.created_by,
        "title": a.title,
        "description": a.description,
        "question_text": a.question_text,
        "question_pdf_url": a.question_pdf_url,
        "max_marks": a.max_marks,
        "rubric": a.rubric,
        "deadline": a.deadline.isoformat(),
        "status": a.status.value,
        "created_at": a.created_at.isoformat(),
    }
