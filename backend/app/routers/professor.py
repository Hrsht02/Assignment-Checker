from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.models.academic import ProfessorSection, Section, SectionEnrollment
from app.models.assignment import Assignment, AssignmentStatus
from app.models.submission import Submission, SubmissionStatus
from app.models.evaluation import EvaluationReport
from app.models.report import MarksReport
from app.models.user import User
from app.schemas.dashboard import ProfessorSectionAnalytics
from app.dependencies import require_professor

router = APIRouter(prefix="/professor", tags=["professor"])


@router.get("/dashboard")
async def get_professor_dashboard(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor),
):
    """Full professor dashboard: sections + analytics."""
    result = await db.execute(
        select(ProfessorSection).where(
            ProfessorSection.professor_id == current_user.id
        )
    )
    professor_sections = result.scalars().all()

    sections_data = []
    for ps in professor_sections:
        section_result = await db.execute(
            select(Section).where(Section.id == ps.section_id)
        )
        section = section_result.scalar_one_or_none()
        if not section:
            continue

        analytics = await _compute_section_analytics(db, section)
        sections_data.append({
            "section": {
                "id": str(section.id),
                "name": section.name,
                "subject": section.subject,
                "semester_id": str(section.semester_id),
            },
            "analytics": analytics,
        })

    return {"sections": sections_data}


@router.get("/sections/{section_id}/analytics", response_model=ProfessorSectionAnalytics)
async def get_section_analytics(
    section_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor),
):
    # Verify access
    ps_result = await db.execute(
        select(ProfessorSection).where(
            ProfessorSection.professor_id == current_user.id,
            ProfessorSection.section_id == section_id,
        )
    )
    if not ps_result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Access not permitted")

    section_result = await db.execute(select(Section).where(Section.id == section_id))
    section = section_result.scalar_one_or_none()
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")

    return await _compute_section_analytics(db, section)


@router.get("/reports/{assignment_id}")
async def get_assignment_report(
    assignment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor),
):
    assignment_result = await db.execute(
        select(Assignment).where(Assignment.id == assignment_id)
    )
    assignment = assignment_result.scalar_one_or_none()
    if not assignment or assignment.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access not permitted")

    report_result = await db.execute(
        select(MarksReport).where(MarksReport.assignment_id == assignment_id)
        .order_by(MarksReport.generated_at.desc())
    )
    report = report_result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Report not yet generated")

    return {
        "id": str(report.id),
        "assignment_id": str(report.assignment_id),
        "pdf_url": report.pdf_url,
        "excel_url": report.excel_url,
        "csv_url": report.csv_url,
        "generated_at": report.generated_at.isoformat(),
    }


@router.post("/reports/{assignment_id}/generate")
async def trigger_report_generation(
    assignment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor),
):
    assignment_result = await db.execute(
        select(Assignment).where(Assignment.id == assignment_id)
    )
    assignment = assignment_result.scalar_one_or_none()
    if not assignment or assignment.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access not permitted")

    from app.tasks.report_tasks import generate_marks_report_task
    from app.tasks.evaluation_tasks import safe_delay
    safe_delay(generate_marks_report_task, str(assignment_id))
    return {"message": "Report generation triggered"}


async def _compute_section_analytics(
    db: AsyncSession, section: Section
) -> ProfessorSectionAnalytics:
    total_assignments = await db.scalar(
        select(func.count(Assignment.id)).where(
            Assignment.section_id == section.id,
            Assignment.status != AssignmentStatus.DELETED,
        )
    ) or 0

    total_students = await db.scalar(
        select(func.count(SectionEnrollment.id)).where(
            SectionEnrollment.section_id == section.id
        )
    ) or 0

    # Average marks percentage
    eval_result = await db.execute(
        select(EvaluationReport.ai_score, Assignment.max_marks)
        .join(Submission, Submission.id == EvaluationReport.submission_id)
        .join(Assignment, Assignment.id == Submission.assignment_id)
        .where(
            Assignment.section_id == section.id,
            Submission.status == SubmissionStatus.EVALUATED,
        )
    )
    scores = eval_result.all()
    if scores:
        percentages = [
            row[0] / row[1] * 100 for row in scores if row[1] > 0
        ]
        avg_marks = sum(percentages) / len(percentages) if percentages else 0.0
    else:
        avg_marks = 0.0

    # Submission rate
    total_submissions = await db.scalar(
        select(func.count(Submission.id))
        .join(Assignment, Assignment.id == Submission.assignment_id)
        .where(Assignment.section_id == section.id)
    ) or 0
    submission_rate = (total_submissions / total_students * 100) if total_students > 0 else 0.0

    # Plagiarism rate
    flagged = await db.scalar(
        select(func.count(Submission.id))
        .join(Assignment, Assignment.id == Submission.assignment_id)
        .where(
            Assignment.section_id == section.id,
            Submission.status == SubmissionStatus.SIMILARITY_REVIEW,
        )
    ) or 0
    plagiarism_rate = (flagged / total_submissions * 100) if total_submissions > 0 else 0.0

    # Pending evaluations
    pending = await db.scalar(
        select(func.count(Submission.id))
        .join(Assignment, Assignment.id == Submission.assignment_id)
        .where(
            Assignment.section_id == section.id,
            Submission.status == SubmissionStatus.EVALUATING,
        )
    ) or 0

    return ProfessorSectionAnalytics(
        section_id=str(section.id),
        section_name=section.name,
        subject=section.subject,
        total_assignments=total_assignments,
        total_students=total_students,
        average_marks_percentage=round(avg_marks, 2),
        submission_rate=round(submission_rate, 2),
        plagiarism_rate=round(plagiarism_rate, 2),
        pending_evaluations=pending,
    )
