from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.models.academic import ProfessorSemester, Semester, Branch, Course, College, StudentEnrollment
from app.models.assignment import Assignment, AssignmentStatus
from app.models.submission import Submission, SubmissionStatus
from app.models.evaluation import EvaluationReport
from app.models.report import MarksReport
from app.models.user import User
from app.dependencies import require_professor

router = APIRouter(prefix="/professor", tags=["professor"])


@router.get("/dashboard")
async def get_dashboard(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor),
):
    ps_result = (await db.execute(
        select(ProfessorSemester).where(ProfessorSemester.professor_id == current_user.id)
    )).scalars().all()

    semesters_data = []
    for ps in ps_result:
        sem = await db.get(Semester, ps.semester_id)
        if not sem:
            continue
        branch = await db.get(Branch, sem.branch_id)
        course = await db.get(Course, branch.course_id) if branch else None
        college = await db.get(College, course.college_id) if course else None

        total_assignments = await db.scalar(
            select(func.count(Assignment.id)).where(
                Assignment.semester_id == sem.id,
                Assignment.status != AssignmentStatus.DELETED,
            )
        ) or 0
        total_students = await db.scalar(
            select(func.count(StudentEnrollment.id)).where(StudentEnrollment.semester_id == sem.id)
        ) or 0
        pending = await db.scalar(
            select(func.count(Submission.id))
            .join(Assignment, Assignment.id == Submission.assignment_id)
            .where(Assignment.semester_id == sem.id, Submission.status == SubmissionStatus.EVALUATING)
        ) or 0

        scores = (await db.execute(
            select(EvaluationReport.ai_score, Assignment.max_marks)
            .join(Submission, Submission.id == EvaluationReport.submission_id)
            .join(Assignment, Assignment.id == Submission.assignment_id)
            .where(Assignment.semester_id == sem.id, Submission.status == SubmissionStatus.EVALUATED)
        )).all()
        avg = round(sum(r[0] / r[1] * 100 for r in scores if r[1] > 0) / len(scores), 1) if scores else 0.0

        semesters_data.append({
            "semester": {
                "id": sem.id,
                "name": sem.name,
                "branch": branch.name if branch else "",
                "course": course.name if course else "",
                "college": college.name if college else "",
            },
            "analytics": {
                "total_assignments": total_assignments,
                "total_students": total_students,
                "average_marks_percentage": avg,
                "pending_evaluations": pending,
            },
        })
    return {
        "professor": {
            "id": current_user.id,
            "name": current_user.name,
            "professor_id": current_user.professor_id,
            "college_id": current_user.college_id,
        },
        "semesters": semesters_data,
    }


@router.get("/reports/{assignment_id}")
async def get_report(
    assignment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor),
):
    a = await db.get(Assignment, assignment_id)
    if not a or a.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access not permitted")

    report = (await db.execute(
        select(MarksReport).where(MarksReport.assignment_id == assignment_id)
        .order_by(MarksReport.generated_at.desc())
    )).scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Report not yet generated")

    return {
        "id": report.id,
        "assignment_id": report.assignment_id,
        "pdf_url": report.pdf_url,
        "excel_url": report.excel_url,
        "csv_url": report.csv_url,
        "generated_at": report.generated_at.isoformat(),
    }


@router.get("/analytics/summary")
async def get_analytics_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor),
):
    """Aggregate analytics across all professor's semesters."""
    ps_result = (await db.execute(
        select(ProfessorSemester).where(ProfessorSemester.professor_id == current_user.id)
    )).scalars().all()

    semester_ids = [ps.semester_id for ps in ps_result]
    if not semester_ids:
        return {"total_assignments": 0, "total_students": 0, "total_submissions": 0,
                "total_evaluated": 0, "pending_evaluations": 0, "plagiarism_cases": 0,
                "average_score_percentage": 0.0}

    total_assignments = await db.scalar(
        select(func.count(Assignment.id)).where(
            Assignment.semester_id.in_(semester_ids),
            Assignment.status != AssignmentStatus.DELETED,
        )
    ) or 0

    total_students = await db.scalar(
        select(func.count(func.distinct(StudentEnrollment.student_id))).where(
            StudentEnrollment.semester_id.in_(semester_ids)
        )
    ) or 0

    total_submissions = await db.scalar(
        select(func.count(Submission.id))
        .join(Assignment, Assignment.id == Submission.assignment_id)
        .where(Assignment.semester_id.in_(semester_ids))
    ) or 0

    total_evaluated = await db.scalar(
        select(func.count(Submission.id))
        .join(Assignment, Assignment.id == Submission.assignment_id)
        .where(Assignment.semester_id.in_(semester_ids), Submission.status == SubmissionStatus.EVALUATED)
    ) or 0

    pending = await db.scalar(
        select(func.count(Submission.id))
        .join(Assignment, Assignment.id == Submission.assignment_id)
        .where(Assignment.semester_id.in_(semester_ids), Submission.status == SubmissionStatus.EVALUATING)
    ) or 0

    plagiarism = await db.scalar(
        select(func.count(Submission.id))
        .join(Assignment, Assignment.id == Submission.assignment_id)
        .where(Assignment.semester_id.in_(semester_ids), Submission.status == SubmissionStatus.SIMILARITY_REVIEW)
    ) or 0

    scores = (await db.execute(
        select(EvaluationReport.ai_score, Assignment.max_marks)
        .join(Submission, Submission.id == EvaluationReport.submission_id)
        .join(Assignment, Assignment.id == Submission.assignment_id)
        .where(Assignment.semester_id.in_(semester_ids))
    )).all()
    avg = round(sum(r[0] / r[1] * 100 for r in scores if r[1] > 0) / len(scores), 1) if scores else 0.0

    return {
        "total_assignments": total_assignments,
        "total_students": total_students,
        "total_submissions": total_submissions,
        "total_evaluated": total_evaluated,
        "pending_evaluations": pending,
        "plagiarism_cases": plagiarism,
        "average_score_percentage": avg,
    }


@router.post("/reports/{assignment_id}/generate")
async def trigger_report(
    assignment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor),
):
    a = await db.get(Assignment, assignment_id)
    if not a or a.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access not permitted")
    from app.tasks.report_tasks import generate_marks_report_task
    from app.tasks.evaluation_tasks import safe_delay
    safe_delay(generate_marks_report_task, str(assignment_id))
    return {"message": "Report generation triggered"}
