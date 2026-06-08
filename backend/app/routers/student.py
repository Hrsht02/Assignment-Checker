from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.academic import StudentEnrollment, Semester, Branch, Course, College
from app.models.assignment import Assignment, AssignmentStatus
from app.models.submission import Submission, SubmissionStatus
from app.models.evaluation import EvaluationReport
from app.models.marks import MarksOverride
from app.models.user import User
from app.dependencies import require_student

router = APIRouter(prefix="/student", tags=["student"])


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

    all_vals = [s["assignments"] for s in semesters_data]
    total_assigned = sum(len(v["active"]) + len(v["upcoming"]) + len(v["submitted"]) + len(v["evaluated"]) for v in all_vals)
    total_submitted = sum(len(v["submitted"]) + len(v["evaluated"]) for v in all_vals)
    total_evaluated = sum(len(v["evaluated"]) for v in all_vals)

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
        },
        "semesters": semesters_data,
    }


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
    return all_items


async def _get_assignments(db: AsyncSession, student_id: str, semester_id: str) -> dict:
    now = datetime.now(timezone.utc)
    assignments = (await db.execute(
        select(Assignment).where(
            Assignment.semester_id == semester_id,
            Assignment.status != AssignmentStatus.DELETED,
        )
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
            "deadline": a.deadline.isoformat(),
            "question_text": a.question_text,
            "question_pdf_url": a.question_pdf_url,
            "submission": None,
        }

        if sub:
            eval_r = (await db.execute(
                select(EvaluationReport).where(EvaluationReport.submission_id == sub.id)
            )).scalar_one_or_none()
            override = (await db.execute(
                select(MarksOverride).where(MarksOverride.submission_id == sub.id)
            )).scalar_one_or_none()
            final_score = override.revised_score if override else (eval_r.ai_score if eval_r else None)

            base["submission"] = {
                "id": sub.id,
                "submission_type": sub.submission_type.value,
                "status": sub.status.value,
                "submitted_at": sub.submitted_at.isoformat(),
                "ai_score": eval_r.ai_score if eval_r else None,
                "final_score": final_score,
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
                    active.append(base)
            else:
                active.append(base)

    return {"active": active, "upcoming": upcoming, "submitted": submitted, "evaluated": evaluated}
