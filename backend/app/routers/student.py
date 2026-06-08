from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
import asyncio
import json

from app.database import get_db, AsyncSessionLocal
from app.models.academic import StudentEnrollment, Semester, Branch, Course, College
from app.models.assignment import Assignment, AssignmentStatus
from app.models.submission import Submission, SubmissionStatus
from app.models.evaluation import EvaluationReport
from app.models.marks import MarksOverride
from app.models.user import User
from app.dependencies import require_student

router = APIRouter(prefix="/student", tags=["student"])


# ── Dashboard (full data from DB) ─────────────────────────────────────────────

@router.get("/dashboard")
async def get_dashboard(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_student),
):
    enrollments = (await db.execute(
        select(StudentEnrollment).where(StudentEnrollment.student_id == current_user.id)
    )).scalars().all()

    semesters_data = []
    for enr in enrollments:
        sem = await db.get(Semester, enr.semester_id)
        if not sem:
            continue
        branch = await db.get(Branch, sem.branch_id)
        course = await db.get(Course, branch.course_id) if branch else None
        college = await db.get(College, course.college_id) if course else None

        assignments = await _get_assignments(db, current_user.id, sem.id)
        semesters_data.append({
            "semester": {
                "id": sem.id,
                "name": sem.name,
                "branch": branch.name if branch else "",
                "course": course.name if course else "",
                "college": college.name if college else "",
            },
            "assignments": assignments,
        })

    # Compute stats from live data
    all_vals = [s["assignments"] for s in semesters_data]
    total_assigned = sum(
        len(v.get("active", [])) + len(v.get("upcoming", [])) +
        len(v.get("submitted", [])) + len(v.get("evaluated", []))
        for v in all_vals
    )
    total_submitted = sum(len(v.get("submitted", [])) + len(v.get("evaluated", [])) for v in all_vals)
    total_evaluated = sum(len(v.get("evaluated", [])) for v in all_vals)

    # Average score from evaluated assignments
    scores = []
    for v in all_vals:
        for item in v.get("evaluated", []):
            sub = item.get("submission")
            if sub and sub.get("final_score") is not None:
                max_m = item.get("max_marks", 100) or 100
                scores.append(sub["final_score"] / max_m * 100)
    avg_score = round(sum(scores) / len(scores), 1) if scores else 0.0

    return {
        "student": {
            "id": current_user.id,
            "name": current_user.name,
            "email": current_user.email,
            "roll_number": current_user.roll_number,
            "college_id": current_user.college_id,
        },
        "stats": {
            "total_assigned": total_assigned,
            "total_submitted": total_submitted,
            "total_evaluated": total_evaluated,
            "average_score_percentage": avg_score,
            "pending": total_submitted - total_evaluated,
        },
        "semesters": semesters_data,
    }


# ── Stats endpoint (used by StatCards) ───────────────────────────────────────

@router.get("/stats")
async def get_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_student),
):
    """Lightweight stats for the dashboard header cards."""
    enrollments = (await db.execute(
        select(StudentEnrollment).where(StudentEnrollment.student_id == current_user.id)
    )).scalars().all()
    semester_ids = [e.semester_id for e in enrollments]

    if not semester_ids:
        return {"total_assigned": 0, "total_submitted": 0, "total_evaluated": 0,
                "average_score_percentage": 0.0, "pending": 0}

    total_assigned = await db.scalar(
        select(func.count(Assignment.id)).where(
            Assignment.semester_id.in_(semester_ids),
            Assignment.status != AssignmentStatus.DELETED,
        )
    ) or 0

    total_submitted = await db.scalar(
        select(func.count(Submission.id)).where(
            Submission.student_id == current_user.id,
            Submission.status != SubmissionStatus.REJECTED,
        )
    ) or 0

    total_evaluated = await db.scalar(
        select(func.count(Submission.id)).where(
            Submission.student_id == current_user.id,
            Submission.status == SubmissionStatus.EVALUATED,
        )
    ) or 0

    # Average score
    score_rows = (await db.execute(
        select(EvaluationReport.ai_score, Assignment.max_marks)
        .join(Submission, Submission.id == EvaluationReport.submission_id)
        .join(Assignment, Assignment.id == Submission.assignment_id)
        .where(Submission.student_id == current_user.id, Submission.status == SubmissionStatus.EVALUATED)
    )).all()

    # Use override if present
    avg_scores = []
    for row in score_rows:
        if row[1] and row[1] > 0:
            avg_scores.append(row[0] / row[1] * 100)
    avg_score = round(sum(avg_scores) / len(avg_scores), 1) if avg_scores else 0.0

    return {
        "total_assigned": total_assigned,
        "total_submitted": total_submitted,
        "total_evaluated": total_evaluated,
        "average_score_percentage": avg_score,
        "pending": total_submitted - total_evaluated,
    }


# ── All assignments (flat list) ───────────────────────────────────────────────

@router.get("/assignments")
async def get_all_assignments(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_student),
):
    enrollments = (await db.execute(
        select(StudentEnrollment).where(StudentEnrollment.student_id == current_user.id)
    )).scalars().all()

    all_items = []
    for enr in enrollments:
        cats = await _get_assignments(db, current_user.id, enr.semester_id)
        for cat_items in cats.values():
            all_items.extend(cat_items)
    # Sort by deadline ascending
    all_items.sort(key=lambda x: x.get("deadline", ""))
    return all_items


# ── SSE: real-time dashboard updates ─────────────────────────────────────────

@router.get("/live")
async def live_updates(current_user: User = Depends(require_student)):
    """
    Server-Sent Events endpoint.
    Pushes a 'refresh' event every 15 seconds and whenever backend state changes.
    Frontend subscribes and invalidates React Query cache on receipt.
    """
    async def event_generator():
        try:
            while True:
                async with AsyncSessionLocal() as db:
                    stats = await _compute_stats(db, current_user.id)
                yield f"data: {json.dumps({'type': 'stats_update', 'stats': stats})}\n\n"
                await asyncio.sleep(15)
        except asyncio.CancelledError:
            return

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _compute_stats(db: AsyncSession, student_id: str) -> dict:
    enrollments = (await db.execute(
        select(StudentEnrollment).where(StudentEnrollment.student_id == student_id)
    )).scalars().all()
    semester_ids = [e.semester_id for e in enrollments]
    if not semester_ids:
        return {"total_assigned": 0, "total_submitted": 0, "total_evaluated": 0,
                "average_score_percentage": 0.0, "pending": 0}

    total_assigned = await db.scalar(
        select(func.count(Assignment.id)).where(
            Assignment.semester_id.in_(semester_ids),
            Assignment.status != AssignmentStatus.DELETED,
        )
    ) or 0
    total_submitted = await db.scalar(
        select(func.count(Submission.id)).where(
            Submission.student_id == student_id,
            Submission.status != SubmissionStatus.REJECTED,
        )
    ) or 0
    total_evaluated = await db.scalar(
        select(func.count(Submission.id)).where(
            Submission.student_id == student_id,
            Submission.status == SubmissionStatus.EVALUATED,
        )
    ) or 0
    # Compute real average score
    score_rows = (await db.execute(
        select(EvaluationReport.ai_score, Assignment.max_marks)
        .join(Submission, Submission.id == EvaluationReport.submission_id)
        .join(Assignment, Assignment.id == Submission.assignment_id)
        .where(Submission.student_id == student_id, Submission.status == SubmissionStatus.EVALUATED)
    )).all()
    avg_score = round(sum(r[0]/r[1]*100 for r in score_rows if r[1]>0)/len(score_rows), 1) if score_rows else 0.0

    return {
        "total_assigned": total_assigned,
        "total_submitted": total_submitted,
        "total_evaluated": total_evaluated,
        "average_score_percentage": avg_score,
        "pending": total_submitted - total_evaluated,
    }

async def _get_assignments(db: AsyncSession, student_id: str, semester_id: str) -> dict:
    now = datetime.now(timezone.utc)
    assignments = (await db.execute(
        select(Assignment).where(
            Assignment.semester_id == semester_id,
            Assignment.status != AssignmentStatus.DELETED,
        ).order_by(Assignment.deadline.asc())
    )).scalars().all()

    active, upcoming, submitted, evaluated = [], [], [], []

    for a in assignments:
        sub = (await db.execute(
            select(Submission).where(
                Submission.assignment_id == a.id,
                Submission.student_id == student_id,
                Submission.status != SubmissionStatus.REJECTED,
            ).order_by(Submission.submitted_at.desc())
        )).scalar_one_or_none()

        base = {
            "id": a.id,
            "title": a.title,
            "description": a.description,
            "max_marks": a.max_marks,
            "rubric": a.rubric,
            "deadline": a.deadline.isoformat(),
            "question_text": a.question_text,
            "question_pdf_url": a.question_pdf_url,
            "is_overdue": a.deadline < now,
            "submission": None,
        }

        if sub:
            eval_r = (await db.execute(
                select(EvaluationReport).where(EvaluationReport.submission_id == sub.id)
            )).scalar_one_or_none()
            override = (await db.execute(
                select(MarksOverride).where(MarksOverride.submission_id == sub.id)
            )).scalar_one_or_none()
            ai_score = eval_r.ai_score if eval_r else None
            final_score = override.revised_score if override else ai_score
            percentage = round(final_score / a.max_marks * 100, 1) if final_score is not None and a.max_marks > 0 else None
            grade = _compute_grade(percentage) if percentage is not None else None

            base["submission"] = {
                "id": sub.id,
                "submission_type": sub.submission_type.value,
                "file_url": sub.file_url,
                "file_name": sub.file_name,
                "text_content": sub.text_content,
                "status": sub.status.value,
                "submitted_at": sub.submitted_at.isoformat(),
                "is_late": sub.submitted_at > a.deadline,
                "ai_score": ai_score,
                "final_score": final_score,
                "percentage": percentage,
                "grade": grade,
                "professor_remark": override.remark if override else None,
                "strengths": eval_r.strengths if eval_r else None,
                "areas_of_improvement": eval_r.areas_of_improvement if eval_r else None,
                "detailed_feedback": eval_r.detailed_feedback if eval_r else None,
                "similarity_score": sub.similarity_score,
                "rejection_reason": sub.rejection_reason,
                "resubmission_deadline": sub.resubmission_deadline.isoformat() if sub.resubmission_deadline else None,
            }
            if sub.status == SubmissionStatus.EVALUATED:
                evaluated.append(base)
            else:
                submitted.append(base)
        else:
            if a.deadline > now:
                hours_left = (a.deadline - now).total_seconds() / 3600
                if hours_left > 24:
                    upcoming.append(base)
                else:
                    active.append(base)  # due within 24 hours — urgent
            else:
                active.append(base)  # overdue, not submitted

    return {"active": active, "upcoming": upcoming, "submitted": submitted, "evaluated": evaluated}


def _compute_grade(percentage: float) -> str:
    if percentage >= 90: return "A+"
    if percentage >= 80: return "A"
    if percentage >= 70: return "B+"
    if percentage >= 60: return "B"
    if percentage >= 50: return "C"
    if percentage >= 40: return "D"
    return "F"
