from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_

from app.database import get_db
from app.models.assignment import Assignment, AssignmentStatus
from app.models.submission import Submission, SubmissionStatus
from app.models.evaluation import EvaluationReport
from app.models.marks import MarksOverride
from app.models.academic import SectionEnrollment, ProfessorSection
from app.models.user import User
from app.models.notification import NotificationType
from app.schemas.submission import (
    SubmissionResponse, SubmissionWithDetails, PlagiarismReviewRequest
)
from app.schemas.evaluation import MarksOverrideCreate, MarksOverrideResponse, EvaluationReportResponse
from app.services import notification as notif_svc
from app.services.storage import upload_file
from app.services.email import (
    send_submission_receipt_email,
    send_resubmission_request_email,
    send_submission_rejected_email,
)
from app.dependencies import require_student, require_professor, get_current_user
from app.config import get_settings

settings = get_settings()
router = APIRouter(prefix="/submissions", tags=["submissions"])


@router.post("/assignments/{assignment_id}", response_model=SubmissionResponse, status_code=201)
async def submit_assignment(
    assignment_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_student),
):
    # Load assignment
    result = await db.execute(
        select(Assignment).where(
            Assignment.id == assignment_id,
            Assignment.status != AssignmentStatus.DELETED,
        )
    )
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    # Verify student is enrolled
    enrolled = await db.execute(
        select(SectionEnrollment).where(
            SectionEnrollment.section_id == assignment.section_id,
            SectionEnrollment.student_id == current_user.id,
        )
    )
    if not enrolled.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Access not permitted")

    # Check deadline
    if datetime.now(timezone.utc) > assignment.deadline:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Submission deadline has passed",
        )

    # Validate file type
    if file.content_type != "application/pdf":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Only PDF files are accepted",
        )

    # Validate file size
    content = await file.read()
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"File exceeds {settings.MAX_UPLOAD_SIZE_MB}MB limit",
        )
    await file.seek(0)

    # Check for existing submission
    existing_result = await db.execute(
        select(Submission).where(
            Submission.assignment_id == assignment_id,
            Submission.student_id == current_user.id,
            Submission.status != SubmissionStatus.REJECTED,
        )
    )
    existing_submission = existing_result.scalar_one_or_none()

    # Check resubmission rules
    if existing_submission:
        if existing_submission.is_resubmission:
            # Can't submit more than once after a resubmission
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="No further submissions are permitted for this assignment",
            )
        if existing_submission.status == SubmissionStatus.RESUBMISSION_REQUESTED:
            if existing_submission.resubmission_deadline:
                if datetime.now(timezone.utc) > existing_submission.resubmission_deadline:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail="Resubmission deadline has expired",
                    )

    # Upload file
    try:
        file_key, file_url = await upload_file(file, f"submissions/{assignment_id}")
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Storage failed: {e}",
        )

    is_resubmission = (
        existing_submission is not None
        and existing_submission.status == SubmissionStatus.RESUBMISSION_REQUESTED
    )

    # If replacing an existing submission
    if existing_submission and not is_resubmission:
        existing_submission.file_url = file_url
        existing_submission.file_key = file_key
        existing_submission.file_name = file.filename
        existing_submission.status = SubmissionStatus.SUBMITTED
        existing_submission.submitted_at = datetime.now(timezone.utc)
        existing_submission.similarity_score = None
        existing_submission.matched_submission_id = None
        submission = existing_submission
    elif is_resubmission:
        existing_submission.file_url = file_url
        existing_submission.file_key = file_key
        existing_submission.file_name = file.filename
        existing_submission.status = SubmissionStatus.SUBMITTED
        existing_submission.submitted_at = datetime.now(timezone.utc)
        existing_submission.is_resubmission = True
        existing_submission.similarity_score = None
        existing_submission.matched_submission_id = None
        submission = existing_submission
    else:
        submission = Submission(
            assignment_id=assignment_id,
            student_id=current_user.id,
            file_url=file_url,
            file_key=file_key,
            file_name=file.filename or "submission.pdf",
            status=SubmissionStatus.SUBMITTED,
            is_resubmission=False,
        )
        db.add(submission)

    await db.commit()
    await db.refresh(submission)

    # Send receipt email
    await send_submission_receipt_email(
        current_user.email,
        current_user.name,
        assignment.title,
        submission.submitted_at.strftime("%Y-%m-%d %H:%M UTC"),
    )

    await notif_svc.create_notification(
        db, current_user.id,
        NotificationType.SUBMISSION_RECEIVED,
        "Submission Received",
        f"Your submission for '{assignment.title}' has been received.",
        reference_id=assignment.id, reference_type="assignment",
    )
    await db.commit()

    # Trigger async evaluation
    from app.tasks.evaluation_tasks import evaluate_submission_task, safe_delay
    safe_delay(evaluate_submission_task, str(submission.id))

    return SubmissionResponse.model_validate(submission)


@router.get("/assignments/{assignment_id}", response_model=list[SubmissionWithDetails])
async def list_submissions(
    assignment_id: str,
    student_name: str | None = Query(None),
    roll_number: str | None = Query(None),
    sub_status: SubmissionStatus | None = Query(None, alias="status"),
    marks_min: int | None = Query(None),
    marks_max: int | None = Query(None),
    skip: int = 0,
    limit: int = Query(default=50, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor),
):
    # Verify professor access
    result = await db.execute(
        select(Assignment).where(Assignment.id == assignment_id)
    )
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    ps_result = await db.execute(
        select(ProfessorSection).where(
            ProfessorSection.professor_id == current_user.id,
            ProfessorSection.section_id == assignment.section_id,
        )
    )
    if not ps_result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Access not permitted")

    query = (
        select(Submission)
        .join(User, User.id == Submission.student_id)
        .where(Submission.assignment_id == assignment_id)
    )

    if student_name:
        query = query.where(User.name.ilike(f"%{student_name}%"))
    if roll_number:
        query = query.where(User.roll_number == roll_number)
    if sub_status:
        query = query.where(Submission.status == sub_status)

    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    submissions = result.scalars().all()

    responses = []
    for sub in submissions:
        student_result = await db.execute(select(User).where(User.id == sub.student_id))
        student = student_result.scalar_one_or_none()

        eval_result = await db.execute(
            select(EvaluationReport).where(EvaluationReport.submission_id == sub.id)
        )
        eval_report = eval_result.scalar_one_or_none()

        override_result = await db.execute(
            select(MarksOverride).where(MarksOverride.submission_id == sub.id)
        )
        override = override_result.scalar_one_or_none()

        ai_score = eval_report.ai_score if eval_report else None
        final_score = override.revised_score if override else ai_score

        # Apply marks filter
        if marks_min is not None and (final_score is None or final_score < marks_min):
            continue
        if marks_max is not None and (final_score is None or final_score > marks_max):
            continue

        r = SubmissionWithDetails.model_validate(sub)
        if student:
            r.student_name = student.name
            r.student_email = student.email
            r.student_roll_number = student.roll_number
        r.assignment_title = assignment.title
        r.ai_score = ai_score
        r.final_score = final_score
        r.professor_remark = override.remark if override else None
        r.has_evaluation = eval_report is not None
        responses.append(r)

    return responses


@router.get("/my/{assignment_id}", response_model=SubmissionWithDetails)
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
    submission = result.scalar_one_or_none()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    assignment_result = await db.execute(
        select(Assignment).where(Assignment.id == assignment_id)
    )
    assignment = assignment_result.scalar_one_or_none()

    eval_result = await db.execute(
        select(EvaluationReport).where(EvaluationReport.submission_id == submission.id)
    )
    eval_report = eval_result.scalar_one_or_none()

    override_result = await db.execute(
        select(MarksOverride).where(MarksOverride.submission_id == submission.id)
    )
    override = override_result.scalar_one_or_none()

    r = SubmissionWithDetails.model_validate(submission)
    r.student_name = current_user.name
    r.student_email = current_user.email
    r.student_roll_number = current_user.roll_number
    r.assignment_title = assignment.title if assignment else ""
    r.ai_score = eval_report.ai_score if eval_report else None
    r.final_score = override.revised_score if override else r.ai_score
    r.professor_remark = override.remark if override else None
    r.has_evaluation = eval_report is not None
    return r


@router.post("/{submission_id}/review", response_model=SubmissionResponse)
async def review_plagiarism_flag(
    submission_id: str,
    body: PlagiarismReviewRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor),
):
    """Accept or reject a similarity-flagged submission."""
    result = await db.execute(
        select(Submission).where(Submission.id == submission_id)
    )
    submission = result.scalar_one_or_none()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    if submission.status != SubmissionStatus.SIMILARITY_REVIEW:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Submission is not pending similarity review",
        )

    # Verify professor owns the assignment
    assignment_result = await db.execute(
        select(Assignment).where(Assignment.id == submission.assignment_id)
    )
    assignment = assignment_result.scalar_one_or_none()
    if not assignment or assignment.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access not permitted")

    student_result = await db.execute(
        select(User).where(User.id == submission.student_id)
    )
    student = student_result.scalar_one_or_none()

    if body.action == "accept":
        submission.status = SubmissionStatus.SUBMITTED
        await db.commit()

        # Notify student
        await notif_svc.create_notification(
            db, submission.student_id,
            NotificationType.SUBMISSION_ACCEPTED,
            "Submission Accepted",
            f"Your submission for '{assignment.title}' has been accepted by the professor.",
            reference_id=assignment.id, reference_type="assignment",
        )
        await db.commit()

        # Trigger evaluation
        from app.tasks.evaluation_tasks import evaluate_submission_task, safe_delay
        safe_delay(evaluate_submission_task, str(submission.id))

    elif body.action == "reject":
        if not body.rejection_reason:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="rejection_reason is required when rejecting",
            )
        days = body.resubmission_days or 3
        if not (1 <= days <= 7):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="resubmission_days must be between 1 and 7",
            )

        resubmission_deadline = datetime.now(timezone.utc) + timedelta(days=days)
        submission.status = SubmissionStatus.RESUBMISSION_REQUESTED
        submission.rejection_reason = body.rejection_reason
        submission.resubmission_deadline = resubmission_deadline
        await db.commit()

        # Notify student
        await notif_svc.create_notification(
            db, submission.student_id,
            NotificationType.RESUBMISSION_REQUESTED,
            "Resubmission Required",
            f"Your submission for '{assignment.title}' requires resubmission.",
            reference_id=assignment.id, reference_type="assignment",
        )

        if student:
            await send_resubmission_request_email(
                student.email,
                student.name,
                assignment.title,
                body.rejection_reason,
                submission.similarity_score or 0.0,
                resubmission_deadline.strftime("%Y-%m-%d %H:%M UTC"),
            )

        await db.commit()
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="action must be 'accept' or 'reject'",
        )

    await db.refresh(submission)
    return SubmissionResponse.model_validate(submission)


@router.post("/{submission_id}/override", response_model=MarksOverrideResponse)
async def override_marks(
    submission_id: str,
    body: MarksOverrideCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor),
):
    """Override AI-generated marks for a submission."""
    result = await db.execute(
        select(Submission).where(Submission.id == submission_id)
    )
    submission = result.scalar_one_or_none()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    assignment_result = await db.execute(
        select(Assignment).where(Assignment.id == submission.assignment_id)
    )
    assignment = assignment_result.scalar_one_or_none()
    if not assignment or assignment.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access not permitted")

    if body.revised_score > assignment.max_marks:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Score cannot exceed maximum marks ({assignment.max_marks})",
        )

    # Get AI score
    eval_result = await db.execute(
        select(EvaluationReport).where(EvaluationReport.submission_id == submission_id)
    )
    eval_report = eval_result.scalar_one_or_none()
    if not eval_report:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Submission has not been evaluated yet",
        )

    # Upsert override
    override_result = await db.execute(
        select(MarksOverride).where(MarksOverride.submission_id == submission_id)
    )
    override = override_result.scalar_one_or_none()

    if override:
        override.revised_score = body.revised_score
        override.remark = body.remark
        override.original_ai_score = eval_report.ai_score
    else:
        override = MarksOverride(
            submission_id=submission_id,
            professor_id=current_user.id,
            original_ai_score=eval_report.ai_score,
            revised_score=body.revised_score,
            remark=body.remark,
        )
        db.add(override)

    await db.commit()

    # Notify student marks published
    student_result = await db.execute(
        select(User).where(User.id == submission.student_id)
    )
    student = student_result.scalar_one_or_none()

    from app.services.email import send_marks_published_email
    await notif_svc.create_notification(
        db, submission.student_id,
        NotificationType.MARKS_PUBLISHED,
        "Marks Published",
        f"Your marks for '{assignment.title}' have been published.",
        reference_id=assignment.id, reference_type="assignment",
    )
    if student:
        await send_marks_published_email(
            student.email, student.name, assignment.title,
            body.revised_score, assignment.max_marks,
        )
    await db.commit()
    await db.refresh(override)
    return MarksOverrideResponse.model_validate(override)


@router.post("/{submission_id}/accept-marks", response_model=dict)
async def accept_ai_marks(
    submission_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor),
):
    """Explicitly accept AI-generated marks (publishes to student)."""
    result = await db.execute(
        select(Submission).where(Submission.id == submission_id)
    )
    submission = result.scalar_one_or_none()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    assignment_result = await db.execute(
        select(Assignment).where(Assignment.id == submission.assignment_id)
    )
    assignment = assignment_result.scalar_one_or_none()
    if not assignment or assignment.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access not permitted")

    eval_result = await db.execute(
        select(EvaluationReport).where(EvaluationReport.submission_id == submission_id)
    )
    eval_report = eval_result.scalar_one_or_none()
    if not eval_report:
        raise HTTPException(status_code=422, detail="No evaluation report found")

    # Notify student
    student_result = await db.execute(
        select(User).where(User.id == submission.student_id)
    )
    student = student_result.scalar_one_or_none()

    from app.services.email import send_marks_published_email
    await notif_svc.create_notification(
        db, submission.student_id,
        NotificationType.MARKS_PUBLISHED,
        "Marks Published",
        f"Your marks for '{assignment.title}' have been published.",
        reference_id=assignment.id, reference_type="assignment",
    )
    if student:
        await send_marks_published_email(
            student.email, student.name, assignment.title,
            eval_report.ai_score, assignment.max_marks,
        )
    await db.commit()
    return {"message": "Marks accepted and published", "score": eval_report.ai_score}


@router.post("/{submission_id}/re-evaluate")
async def re_evaluate_submission(
    submission_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor),
):
    result = await db.execute(
        select(Submission).where(Submission.id == submission_id)
    )
    submission = result.scalar_one_or_none()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    assignment_result = await db.execute(
        select(Assignment).where(Assignment.id == submission.assignment_id)
    )
    assignment = assignment_result.scalar_one_or_none()
    if not assignment or assignment.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access not permitted")

    # Clear existing override
    override_result = await db.execute(
        select(MarksOverride).where(MarksOverride.submission_id == submission_id)
    )
    override = override_result.scalar_one_or_none()
    if override:
        await db.delete(override)

    # Reset status
    submission.status = SubmissionStatus.SUBMITTED
    await db.commit()

    from app.tasks.evaluation_tasks import evaluate_submission_task, safe_delay
    safe_delay(evaluate_submission_task, str(submission.id))

    return {"message": "Re-evaluation triggered"}


@router.get("/{submission_id}/evaluation", response_model=EvaluationReportResponse)
async def get_evaluation_report(
    submission_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Submission).where(Submission.id == submission_id)
    )
    submission = result.scalar_one_or_none()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    # Access control: student can only see their own
    from app.models.user import UserRole
    if current_user.role == UserRole.STUDENT and submission.student_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access not permitted")

    eval_result = await db.execute(
        select(EvaluationReport).where(EvaluationReport.submission_id == submission_id)
    )
    eval_report = eval_result.scalar_one_or_none()
    if not eval_report:
        raise HTTPException(status_code=404, detail="Evaluation report not found")

    return EvaluationReportResponse.model_validate(eval_report)
