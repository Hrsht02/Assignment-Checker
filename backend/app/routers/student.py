from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.models.academic import SectionEnrollment, Section, Semester
from app.models.assignment import Assignment, AssignmentStatus
from app.models.submission import Submission, SubmissionStatus
from app.models.evaluation import EvaluationReport
from app.models.marks import MarksOverride
from app.models.user import User
from app.schemas.dashboard import StudentAssignmentStats
from app.dependencies import require_student

router = APIRouter(prefix="/student", tags=["student"])


@router.get("/dashboard")
async def get_student_dashboard(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_student),
):
    """Student dashboard: enrolled sections + assignment categories."""
    enrolled_result = await db.execute(
        select(SectionEnrollment).where(
            SectionEnrollment.student_id == current_user.id
        )
    )
    enrollments = enrolled_result.scalars().all()

    sections_data = []
    for enrollment in enrollments:
        section_result = await db.execute(
            select(Section).where(Section.id == enrollment.section_id)
        )
        section = section_result.scalar_one_or_none()
        if not section:
            continue

        semester_result = await db.execute(
            select(Semester).where(Semester.id == section.semester_id)
        )
        semester = semester_result.scalar_one_or_none()

        assignments = await _get_student_assignments_categorized(
            db, current_user.id, section.id
        )
        sections_data.append({
            "section": {
                "id": str(section.id),
                "name": section.name,
                "subject": section.subject,
                "semester_name": semester.name if semester else "",
            },
            "assignments": assignments,
        })

    return {
        "student": {
            "id": str(current_user.id),
            "name": current_user.name,
            "email": current_user.email,
            "roll_number": current_user.roll_number,
        },
        "sections": sections_data,
    }


@router.get("/assignments")
async def get_my_assignments(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_student),
):
    """Get all assignments for the student, flat list with status context."""
    enrolled_result = await db.execute(
        select(SectionEnrollment).where(
            SectionEnrollment.student_id == current_user.id
        )
    )
    enrollments = enrolled_result.scalars().all()

    all_assignments = []
    for enrollment in enrollments:
        categorized = await _get_student_assignments_categorized(
            db, current_user.id, enrollment.section_id
        )
        all_assignments.extend(
            categorized["active"]
            + categorized["upcoming"]
            + categorized["submitted"]
            + categorized["evaluated"]
        )
    return all_assignments


@router.get("/stats", response_model=StudentAssignmentStats)
async def get_student_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_student),
):
    enrolled_result = await db.execute(
        select(SectionEnrollment).where(
            SectionEnrollment.student_id == current_user.id
        )
    )
    enrollments = enrolled_result.scalars().all()
    section_ids = [e.section_id for e in enrollments]

    if not section_ids:
        return StudentAssignmentStats(
            total_assigned=0, total_submitted=0,
            total_evaluated=0, average_score_percentage=0.0
        )

    total_assigned = await db.scalar(
        select(func.count(Assignment.id)).where(
            Assignment.section_id.in_(section_ids),
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

    # Average score percentage
    eval_result = await db.execute(
        select(EvaluationReport.ai_score, Assignment.max_marks)
        .join(Submission, Submission.id == EvaluationReport.submission_id)
        .join(Assignment, Assignment.id == Submission.assignment_id)
        .where(
            Submission.student_id == current_user.id,
            Submission.status == SubmissionStatus.EVALUATED,
        )
    )
    scores = eval_result.all()
    if scores:
        percentages = [row[0] / row[1] * 100 for row in scores if row[1] > 0]
        avg_score = sum(percentages) / len(percentages) if percentages else 0.0
    else:
        avg_score = 0.0

    return StudentAssignmentStats(
        total_assigned=total_assigned,
        total_submitted=total_submitted,
        total_evaluated=total_evaluated,
        average_score_percentage=round(avg_score, 2),
    )


async def _get_student_assignments_categorized(
    db: AsyncSession, student_id: str, section_id: str
) -> dict:
    """Categorize assignments for a student into active/upcoming/submitted/evaluated."""
    now = datetime.now(timezone.utc)

    result = await db.execute(
        select(Assignment).where(
            Assignment.section_id == section_id,
            Assignment.status != AssignmentStatus.DELETED,
        )
    )
    assignments = result.scalars().all()

    active, upcoming, submitted, evaluated = [], [], [], []

    for assignment in assignments:
        sub_result = await db.execute(
            select(Submission).where(
                Submission.assignment_id == assignment.id,
                Submission.student_id == student_id,
                Submission.status != SubmissionStatus.REJECTED,
            ).order_by(Submission.submitted_at.desc())
        )
        submission = sub_result.scalar_one_or_none()

        # Build base data
        base = {
            "id": str(assignment.id),
            "title": assignment.title,
            "description": assignment.description,
            "max_marks": assignment.max_marks,
            "deadline": assignment.deadline.isoformat(),
            "status": assignment.status.value,
            "submission": None,
        }

        if submission:
            eval_result = await db.execute(
                select(EvaluationReport).where(
                    EvaluationReport.submission_id == submission.id
                )
            )
            eval_report = eval_result.scalar_one_or_none()

            override_result = await db.execute(
                select(MarksOverride).where(
                    MarksOverride.submission_id == submission.id
                )
            )
            override = override_result.scalar_one_or_none()

            ai_score = eval_report.ai_score if eval_report else None
            final_score = override.revised_score if override else ai_score

            base["submission"] = {
                "id": str(submission.id),
                "status": submission.status.value,
                "submitted_at": submission.submitted_at.isoformat(),
                "ai_score": ai_score,
                "final_score": final_score,
                "professor_remark": override.remark if override else None,
                "strengths": eval_report.strengths if eval_report else None,
                "areas_of_improvement": eval_report.areas_of_improvement if eval_report else None,
                "detailed_feedback": eval_report.detailed_feedback if eval_report else None,
                "similarity_score": submission.similarity_score,
                "rejection_reason": submission.rejection_reason,
                "resubmission_deadline": (
                    submission.resubmission_deadline.isoformat()
                    if submission.resubmission_deadline else None
                ),
            }

            if submission.status == SubmissionStatus.EVALUATED:
                evaluated.append(base)
            else:
                submitted.append(base)
        else:
            if assignment.deadline > now:
                from datetime import timedelta
                if (assignment.deadline - now).total_seconds() > 86400:
                    upcoming.append(base)
                else:
                    active.append(base)
            else:
                active.append(base)

    return {
        "active": active,
        "upcoming": upcoming,
        "submitted": submitted,
        "evaluated": evaluated,
    }
