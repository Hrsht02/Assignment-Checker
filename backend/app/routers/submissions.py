"""
Submissions — students submit PDF or text; professors review, override, re-evaluate.
"""
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.assignment import Assignment, AssignmentStatus
from app.models.submission import Submission, SubmissionStatus, SubmissionType
from app.models.evaluation import EvaluationReport
from app.models.marks import MarksOverride
from app.models.academic import StudentEnrollment, ProfessorSemester
from app.models.user import User
from app.models.notification import NotificationType
from app.services import notification as notif_svc
from app.services.storage import upload_file
from app.services.email import send_email
from app.dependencies import require_student, require_professor, get_current_user
from app.config import get_settings
from pydantic import BaseModel, field_validator

settings = get_settings()
router = APIRouter(prefix="/submissions", tags=["submissions"])


# ── Student: submit (PDF or text) ────────────────────────────────────────────

@router.post("/assignments/{assignment_id}/pdf", status_code=201)
async def submit_pdf(
    assignment_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_student),
):
    """Submit a PDF answer sheet."""
    a = await _get_accessible_assignment(assignment_id, current_user.id, db)

    if file.content_type != "application/pdf":
        raise HTTPException(status_code=422, detail="Only PDF files are accepted")
    content = await file.read()
    if len(content) > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=422, detail=f"File exceeds {settings.MAX_UPLOAD_SIZE_MB} MB")
    await file.seek(0)

    try:
        file_key, file_url = await upload_file(file, f"submissions/{assignment_id}")
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=f"Storage failed: {e}")

    submission = await _upsert_submission(
        db, a, current_user.id,
        sub_type=SubmissionType.PDF,
        file_url=file_url, file_key=file_key, file_name=file.filename or "submission.pdf",
    )
    await _post_submit(db, submission, a, current_user)
    return _sub_dict(submission)


class TextSubmitBody(BaseModel):
    text_content: str

    @field_validator("text_content")
    @classmethod
    def not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Text content cannot be empty")
        return v


@router.post("/assignments/{assignment_id}/text", status_code=201)
async def submit_text(
    assignment_id: str,
    body: TextSubmitBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_student),
):
    """Submit typed text answer."""
    a = await _get_accessible_assignment(assignment_id, current_user.id, db)

    submission = await _upsert_submission(
        db, a, current_user.id,
        sub_type=SubmissionType.TEXT,
        text_content=body.text_content,
    )
    await _post_submit(db, submission, a, current_user)
    return _sub_dict(submission)


# ── Professor: list & filter submissions ─────────────────────────────────────

@router.get("/assignments/{assignment_id}")
async def list_submissions(
    assignment_id: str,
    student_name: str | None = Query(None),
    roll_number: str | None = Query(None),
    sub_status: SubmissionStatus | None = Query(None, alias="status"),
    skip: int = 0,
    limit: int = Query(default=50, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor),
):
    a = await db.get(Assignment, assignment_id)
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found")
    ps = await db.execute(
        select(ProfessorSemester).where(
            ProfessorSemester.professor_id == current_user.id,
            ProfessorSemester.semester_id == a.semester_id,
        )
    )
    if not ps.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Access not permitted")

    q = select(Submission).join(User, User.id == Submission.student_id).where(Submission.assignment_id == assignment_id)
    if student_name:
        q = q.where(User.name.ilike(f"%{student_name}%"))
    if roll_number:
        q = q.where(User.roll_number == roll_number)
    if sub_status:
        q = q.where(Submission.status == sub_status)
    q = q.offset(skip).limit(limit)

    subs = (await db.execute(q)).scalars().all()
    out = []
    for sub in subs:
        student = await db.get(User, sub.student_id)
        eval_r = (await db.execute(select(EvaluationReport).where(EvaluationReport.submission_id == sub.id))).scalar_one_or_none()
        override = (await db.execute(select(MarksOverride).where(MarksOverride.submission_id == sub.id))).scalar_one_or_none()
        
        ai_score = eval_r.ai_score if eval_r else None
        final_score = override.revised_score if override else ai_score
        
        # Compute percentage and grade from final score
        pct: float | None = None
        grade: str | None = None
        if final_score is not None and a.max_marks > 0:
            pct = round(final_score / a.max_marks * 100, 1)
            if pct >= 90: grade = "A+"
            elif pct >= 80: grade = "A"
            elif pct >= 70: grade = "B+"
            elif pct >= 60: grade = "B"
            elif pct >= 50: grade = "C"
            elif pct >= 40: grade = "D"
            else: grade = "F"
        
        # Get matched student name for plagiarism display
        matched_student_name: str | None = None
        if sub.matched_submission_id:
            matched_sub = await db.get(Submission, sub.matched_submission_id)
            if matched_sub:
                matched_user = await db.get(User, matched_sub.student_id)
                if matched_user:
                    matched_student_name = matched_user.name

        d = _sub_dict(sub)
        d.update({
            "student_name": student.name if student else "",
            "student_roll": student.roll_number if student else "",
            "student_email": student.email if student else "",
            "ai_score": ai_score,
            "final_score": final_score,
            "percentage": pct,
            "grade": grade,
            "professor_remark": override.remark if override else None,
            "has_evaluation": eval_r is not None,
            # Full AI feedback fields for expanded panel
            "strengths": eval_r.strengths if eval_r else None,
            "areas_of_improvement": eval_r.areas_of_improvement if eval_r else None,
            "missing_points": eval_r.missing_points if eval_r else None,
            "suggestions": eval_r.suggestions if eval_r else None,
            "overall_feedback": eval_r.overall_feedback if eval_r else None,
            # Plagiarism details
            "matched_student_name": matched_student_name,
            "plagiarism_label": (
                "Exact Copy" if sub.similarity_score and sub.similarity_score >= 0.99 else
                "High Risk" if sub.similarity_score and sub.similarity_score >= 0.7 else
                "Warning" if sub.similarity_score and sub.similarity_score >= 0.4 else
                "Safe"
            ) if sub.similarity_score is not None else None,
        })
        out.append(d)
    return out


@router.get("/my/{assignment_id}")
async def get_my_submission(
    assignment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_student),
):
    result = await db.execute(
        select(Submission).where(
            Submission.assignment_id == assignment_id,
            Submission.student_id == current_user.id,
        ).order_by(Submission.submitted_at.desc())
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="No submission found")

    eval_r = (await db.execute(select(EvaluationReport).where(EvaluationReport.submission_id == sub.id))).scalar_one_or_none()
    override = (await db.execute(select(MarksOverride).where(MarksOverride.submission_id == sub.id))).scalar_one_or_none()
    d = _sub_dict(sub)
    d.update({
        "ai_score": eval_r.ai_score if eval_r else None,
        "final_score": override.revised_score if override else (eval_r.ai_score if eval_r else None),
        "professor_remark": override.remark if override else None,
        "strengths": eval_r.strengths if eval_r else None,
        "areas_of_improvement": eval_r.areas_of_improvement if eval_r else None,
        "detailed_feedback": eval_r.detailed_feedback if eval_r else None,
    })
    return d


@router.get("/{submission_id}/evaluation")
async def get_evaluation(
    submission_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sub = await db.get(Submission, submission_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    from app.models.user import UserRole
    if current_user.role == UserRole.STUDENT and sub.student_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access not permitted")
    eval_r = (await db.execute(select(EvaluationReport).where(EvaluationReport.submission_id == submission_id))).scalar_one_or_none()
    if not eval_r:
        raise HTTPException(status_code=404, detail="Evaluation not yet available")
    import json
    return {
        "id": eval_r.id,
        "submission_id": eval_r.submission_id,
        "ai_score": eval_r.ai_score,
        "percentage": eval_r.percentage,
        "grade": eval_r.grade,
        "strengths": eval_r.strengths,
        "areas_of_improvement": eval_r.areas_of_improvement,
        "missing_points": eval_r.missing_points,
        "suggestions": eval_r.suggestions,
        "overall_feedback": eval_r.overall_feedback,
        "detailed_feedback": eval_r.detailed_feedback,
        "rubric_breakdown": json.loads(eval_r.rubric_breakdown or "{}"),
        "created_at": eval_r.created_at.isoformat(),
    }


# ── Professor: plagiarism review ─────────────────────────────────────────────

class ReviewBody(BaseModel):
    action: str   # "accept" | "reject"
    rejection_reason: str | None = None
    resubmission_days: int | None = None


@router.post("/{submission_id}/review")
async def review_submission(
    submission_id: str,
    body: ReviewBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor),
):
    sub = await db.get(Submission, submission_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    if sub.status != SubmissionStatus.SIMILARITY_REVIEW:
        raise HTTPException(status_code=422, detail="Submission is not pending review")

    a = await db.get(Assignment, sub.assignment_id)
    if not a or a.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access not permitted")

    student = await db.get(User, sub.student_id)

    if body.action == "accept":
        sub.status = SubmissionStatus.SUBMITTED
        await db.commit()
        await notif_svc.create_notification(
            db, sub.student_id, NotificationType.SUBMISSION_ACCEPTED,
            "Submission Accepted", f"Your submission for '{a.title}' was accepted.",
            reference_id=a.id, reference_type="assignment",
        )
        await db.commit()
        from app.tasks.evaluation_tasks import evaluate_submission_task, safe_delay
        safe_delay(evaluate_submission_task, str(sub.id))

    elif body.action == "reject":
        if not body.rejection_reason:
            raise HTTPException(status_code=422, detail="rejection_reason is required")
        days = max(1, min(7, body.resubmission_days or 3))
        sub.status = SubmissionStatus.RESUBMISSION_REQUESTED
        sub.rejection_reason = body.rejection_reason
        sub.resubmission_deadline = datetime.now(timezone.utc) + timedelta(days=days)
        await db.commit()
        await notif_svc.create_notification(
            db, sub.student_id, NotificationType.RESUBMISSION_REQUESTED,
            "Resubmission Required", f"Your submission for '{a.title}' was rejected.",
            reference_id=a.id, reference_type="assignment",
        )
        if student:
            await send_email(
                student.email,
                f"Resubmission Required: {a.title}",
                f"<p>Reason: {body.rejection_reason}</p>"
                f"<p>Similarity: {(sub.similarity_score or 0)*100:.1f}%</p>"
                f"<p>Deadline: {sub.resubmission_deadline.strftime('%Y-%m-%d %H:%M UTC')}</p>",
            )
        await db.commit()
    else:
        raise HTTPException(status_code=422, detail="action must be accept or reject")

    await db.refresh(sub)
    return _sub_dict(sub)


# ── Professor: marks override ─────────────────────────────────────────────────

class OverrideBody(BaseModel):
    revised_score: int
    remark: str

    @field_validator("remark")
    @classmethod
    def remark_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Remark cannot be empty")
        return v.strip()


@router.post("/{submission_id}/override")
async def override_marks(
    submission_id: str,
    body: OverrideBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor),
):
    sub = await db.get(Submission, submission_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    a = await db.get(Assignment, sub.assignment_id)
    if not a or a.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access not permitted")
    if body.revised_score < 0 or body.revised_score > a.max_marks:
        raise HTTPException(status_code=422, detail=f"Score must be 0–{a.max_marks}")

    eval_r = (await db.execute(select(EvaluationReport).where(EvaluationReport.submission_id == submission_id))).scalar_one_or_none()
    if not eval_r:
        raise HTTPException(status_code=422, detail="Not yet evaluated")

    override = (await db.execute(select(MarksOverride).where(MarksOverride.submission_id == submission_id))).scalar_one_or_none()
    if override:
        override.revised_score = body.revised_score
        override.remark = body.remark
        override.original_ai_score = eval_r.ai_score
    else:
        override = MarksOverride(
            submission_id=submission_id, professor_id=current_user.id,
            original_ai_score=eval_r.ai_score, revised_score=body.revised_score, remark=body.remark,
        )
        db.add(override)

    await db.commit()
    student = await db.get(User, sub.student_id)
    await notif_svc.create_notification(
        db, sub.student_id, NotificationType.MARKS_PUBLISHED,
        "Marks Published", f"Your marks for '{a.title}' have been published.",
        reference_id=a.id, reference_type="assignment",
    )
    await db.commit()
    return {"message": "Override saved", "revised_score": body.revised_score}


@router.post("/{submission_id}/accept-marks")
async def accept_ai_marks(
    submission_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor),
):
    sub = await db.get(Submission, submission_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    a = await db.get(Assignment, sub.assignment_id)
    if not a or a.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access not permitted")
    eval_r = (await db.execute(select(EvaluationReport).where(EvaluationReport.submission_id == submission_id))).scalar_one_or_none()
    if not eval_r:
        raise HTTPException(status_code=422, detail="Not yet evaluated")

    await notif_svc.create_notification(
        db, sub.student_id, NotificationType.MARKS_PUBLISHED,
        "Marks Published", f"Your marks for '{a.title}' have been published.",
        reference_id=a.id, reference_type="assignment",
    )
    await db.commit()
    return {"message": "Marks accepted", "score": eval_r.ai_score}


@router.post("/{submission_id}/re-evaluate")
async def re_evaluate(
    submission_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor),
):
    sub = await db.get(Submission, submission_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    a = await db.get(Assignment, sub.assignment_id)
    if not a or a.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access not permitted")

    override = (await db.execute(select(MarksOverride).where(MarksOverride.submission_id == submission_id))).scalar_one_or_none()
    if override:
        await db.delete(override)

    sub.status = SubmissionStatus.SUBMITTED
    await db.commit()

    from app.tasks.evaluation_tasks import evaluate_submission_task, safe_delay
    safe_delay(evaluate_submission_task, str(sub.id))
    return {"message": "Re-evaluation triggered"}


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_accessible_assignment(assignment_id: str, student_id: str, db: AsyncSession) -> Assignment:
    a = await db.get(Assignment, assignment_id)
    if not a or a.status == AssignmentStatus.DELETED:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if datetime.now(timezone.utc) > a.deadline:
        raise HTTPException(status_code=422, detail="Submission deadline has passed")
    enr = await db.execute(
        select(StudentEnrollment).where(
            StudentEnrollment.student_id == student_id,
            StudentEnrollment.semester_id == a.semester_id,
        )
    )
    if not enr.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Access not permitted")
    return a


async def _upsert_submission(
    db: AsyncSession,
    assignment: Assignment,
    student_id: str,
    sub_type: SubmissionType,
    file_url: str | None = None,
    file_key: str | None = None,
    file_name: str | None = None,
    text_content: str | None = None,
) -> Submission:
    existing = (await db.execute(
        select(Submission).where(
            Submission.assignment_id == assignment.id,
            Submission.student_id == student_id,
            Submission.status != SubmissionStatus.REJECTED,
        ).order_by(Submission.submitted_at.desc())
    )).scalar_one_or_none()

    if existing:
        if existing.is_resubmission:
            raise HTTPException(status_code=422, detail="No further submissions permitted")
        if existing.status == SubmissionStatus.RESUBMISSION_REQUESTED:
            if existing.resubmission_deadline and datetime.now(timezone.utc) > existing.resubmission_deadline:
                raise HTTPException(status_code=422, detail="Resubmission deadline expired")
            existing.is_resubmission = True
        existing.submission_type = sub_type
        existing.file_url = file_url
        existing.file_key = file_key
        existing.file_name = file_name
        existing.text_content = text_content
        existing.status = SubmissionStatus.SUBMITTED
        existing.submitted_at = datetime.now(timezone.utc)
        existing.similarity_score = None
        existing.matched_submission_id = None
        return existing

    sub = Submission(
        assignment_id=assignment.id,
        student_id=student_id,
        submission_type=sub_type,
        file_url=file_url,
        file_key=file_key,
        file_name=file_name,
        text_content=text_content,
        status=SubmissionStatus.SUBMITTED,
    )
    db.add(sub)
    return sub


async def _post_submit(db: AsyncSession, submission: Submission, assignment: Assignment, student: User):
    await db.commit()
    await db.refresh(submission)

    await notif_svc.create_notification(
        db, student.id, NotificationType.SUBMISSION_RECEIVED,
        "Submission Received", f"Your submission for '{assignment.title}' was received.",
        reference_id=assignment.id, reference_type="assignment",
    )
    await db.commit()

    from app.tasks.evaluation_tasks import evaluate_submission_task, safe_delay
    safe_delay(evaluate_submission_task, str(submission.id))


def _sub_dict(s: Submission) -> dict:
    return {
        "id": s.id,
        "assignment_id": s.assignment_id,
        "student_id": s.student_id,
        "submission_type": s.submission_type.value,
        "file_url": s.file_url,
        "file_name": s.file_name,
        "text_content": s.text_content,
        "status": s.status.value,
        "similarity_score": s.similarity_score,
        "is_resubmission": s.is_resubmission,
        "rejection_reason": s.rejection_reason,
        "resubmission_deadline": s.resubmission_deadline.isoformat() if s.resubmission_deadline else None,
        "submitted_at": s.submitted_at.isoformat(),
    }
