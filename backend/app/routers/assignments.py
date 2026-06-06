from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.models.assignment import Assignment, AssignmentStatus
from app.models.academic import Section, ProfessorSection, SectionEnrollment
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User, UserRole
from app.models.notification import NotificationType
from app.schemas.assignment import AssignmentResponse, AssignmentListResponse, AssignmentUpdate
from app.services import notification as notif_svc
from app.services.email import (
    send_assignment_posted_email, send_email
)
from app.services.storage import upload_file
from app.dependencies import require_professor, get_current_user
from app.config import get_settings

settings = get_settings()

router = APIRouter(prefix="/assignments", tags=["assignments"])


async def _verify_professor_section_access(
    professor_id: str,
    section_id: str,
    db: AsyncSession,
) -> Section:
    """Raise 403 if professor doesn't own the section."""
    ps_result = await db.execute(
        select(ProfessorSection).where(
            ProfessorSection.professor_id == professor_id,
            ProfessorSection.section_id == section_id,
        )
    )
    if not ps_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access not permitted",
        )
    section_result = await db.execute(select(Section).where(Section.id == section_id))
    section = section_result.scalar_one_or_none()
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    return section


@router.post("/sections/{section_id}", response_model=AssignmentResponse, status_code=201)
async def create_assignment(
    section_id: str,
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
    section = await _verify_professor_section_access(current_user.id, section_id, db)

    # Validate deadline
    if deadline <= datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Deadline must be in the future",
        )

    # Validate at least one question source
    if not question_text and not question_pdf:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide either question_text or question_pdf",
        )

    # Upload question PDF if provided
    question_pdf_url = None
    question_pdf_key = None
    if question_pdf:
        if question_pdf.content_type != "application/pdf":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Question paper must be a PDF",
            )
        max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
        content = await question_pdf.read()
        if len(content) > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"File exceeds {settings.MAX_UPLOAD_SIZE_MB}MB limit",
            )
        await question_pdf.seek(0)
        try:
            question_pdf_key, question_pdf_url = await upload_file(
                question_pdf, f"questions/{section_id}"
            )
        except RuntimeError as e:
            raise HTTPException(status_code=500, detail=str(e))

    assignment = Assignment(
        section_id=section_id,
        created_by=current_user.id,
        title=title.strip(),
        description=description.strip(),
        max_marks=max_marks,
        deadline=deadline,
        rubric=rubric.strip(),
        question_text=question_text,
        question_pdf_url=question_pdf_url,
        question_pdf_key=question_pdf_key,
        status=AssignmentStatus.ACTIVE,
    )
    db.add(assignment)
    await db.flush()

    # Notify enrolled students
    enrolled_result = await db.execute(
        select(SectionEnrollment).where(SectionEnrollment.section_id == section_id)
    )
    enrollments = enrolled_result.scalars().all()

    for enrollment in enrollments:
        student_result = await db.execute(
            select(User).where(User.id == enrollment.student_id)
        )
        student = student_result.scalar_one_or_none()
        if student:
            await notif_svc.create_notification(
                db, student.id,
                NotificationType.ASSIGNMENT_POSTED,
                "New Assignment",
                f"A new assignment '{assignment.title}' has been posted in {section.subject}.",
                reference_id=assignment.id, reference_type="assignment",
            )
            await send_assignment_posted_email(
                student.email,
                student.name,
                assignment.title,
                deadline.strftime("%Y-%m-%d %H:%M UTC"),
                section.subject,
            )

    await db.commit()
    await db.refresh(assignment)
    return AssignmentResponse.model_validate(assignment)


@router.get("/sections/{section_id}", response_model=list[AssignmentListResponse])
async def list_section_assignments(
    section_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Access control
    if current_user.role == UserRole.PROFESSOR:
        await _verify_professor_section_access(current_user.id, section_id, db)
    elif current_user.role == UserRole.STUDENT:
        enrolled = await db.execute(
            select(SectionEnrollment).where(
                SectionEnrollment.section_id == section_id,
                SectionEnrollment.student_id == current_user.id,
            )
        )
        if not enrolled.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Access not permitted")

    result = await db.execute(
        select(Assignment)
        .where(
            Assignment.section_id == section_id,
            Assignment.status != AssignmentStatus.DELETED,
        )
        .order_by(Assignment.created_at.desc())
    )
    assignments = result.scalars().all()
    responses = []
    for a in assignments:
        sub_count = await db.scalar(
            select(func.count(Submission.id)).where(Submission.assignment_id == a.id)
        )
        eval_count = await db.scalar(
            select(func.count(Submission.id)).where(
                Submission.assignment_id == a.id,
                Submission.status == SubmissionStatus.EVALUATED,
            )
        )
        r = AssignmentListResponse.model_validate(a)
        r.submission_count = sub_count or 0
        r.evaluated_count = eval_count or 0
        responses.append(r)
    return responses


@router.get("/{assignment_id}", response_model=AssignmentResponse)
async def get_assignment(
    assignment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Assignment).where(
            Assignment.id == assignment_id,
            Assignment.status != AssignmentStatus.DELETED,
        )
    )
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    # Access control
    if current_user.role == UserRole.PROFESSOR:
        await _verify_professor_section_access(
            current_user.id, assignment.section_id, db
        )
    elif current_user.role == UserRole.STUDENT:
        enrolled = await db.execute(
            select(SectionEnrollment).where(
                SectionEnrollment.section_id == assignment.section_id,
                SectionEnrollment.student_id == current_user.id,
            )
        )
        if not enrolled.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Access not permitted")

    return AssignmentResponse.model_validate(assignment)


@router.patch("/{assignment_id}", response_model=AssignmentResponse)
async def update_assignment(
    assignment_id: str,
    body: AssignmentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor),
):
    result = await db.execute(
        select(Assignment).where(
            Assignment.id == assignment_id,
            Assignment.status != AssignmentStatus.DELETED,
        )
    )
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    await _verify_professor_section_access(current_user.id, assignment.section_id, db)

    # Check if submissions exist
    sub_count = await db.scalar(
        select(func.count(Submission.id)).where(
            Submission.assignment_id == assignment.id
        )
    )
    has_submissions = (sub_count or 0) > 0

    if has_submissions:
        # Only deadline and rubric can be changed once submissions exist
        allowed_updates = {"deadline", "rubric"}
        provided = {k for k, v in body.model_dump(exclude_none=True).items()}
        disallowed = provided - allowed_updates
        if disallowed:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Cannot modify {disallowed} after submissions have been received",
            )

    if body.deadline is not None:
        if body.deadline <= datetime.now(timezone.utc):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Deadline must be in the future",
            )
        assignment.deadline = body.deadline

        # Notify enrolled students
        enrolled_result = await db.execute(
            select(SectionEnrollment).where(
                SectionEnrollment.section_id == assignment.section_id
            )
        )
        section_result = await db.execute(
            select(Section).where(Section.id == assignment.section_id)
        )
        section = section_result.scalar_one_or_none()

        for enrollment in enrolled_result.scalars().all():
            student_result = await db.execute(
                select(User).where(User.id == enrollment.student_id)
            )
            student = student_result.scalar_one_or_none()
            if student:
                await notif_svc.create_notification(
                    db, student.id,
                    NotificationType.ASSIGNMENT_POSTED,
                    "Assignment Deadline Updated",
                    f"The deadline for '{assignment.title}' has been updated to "
                    f"{body.deadline.strftime('%Y-%m-%d %H:%M UTC')}.",
                    reference_id=assignment.id, reference_type="assignment",
                )

    if body.description is not None and not has_submissions:
        assignment.description = body.description
    if body.rubric is not None:
        assignment.rubric = body.rubric
    if body.max_marks is not None and not has_submissions:
        assignment.max_marks = body.max_marks
    if body.title is not None and not has_submissions:
        assignment.title = body.title

    await db.commit()
    await db.refresh(assignment)
    return AssignmentResponse.model_validate(assignment)


@router.delete("/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_assignment(
    assignment_id: str,
    confirmed: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor),
):
    result = await db.execute(
        select(Assignment).where(
            Assignment.id == assignment_id,
            Assignment.status != AssignmentStatus.DELETED,
        )
    )
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    await _verify_professor_section_access(current_user.id, assignment.section_id, db)

    sub_count = await db.scalar(
        select(func.count(Submission.id)).where(
            Submission.assignment_id == assignment.id
        )
    )
    has_submissions = (sub_count or 0) > 0

    if has_submissions and not confirmed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Assignment has submissions. Pass confirmed=true to confirm deletion.",
        )

    # Notify enrolled students
    enrolled_result = await db.execute(
        select(SectionEnrollment).where(
            SectionEnrollment.section_id == assignment.section_id
        )
    )
    for enrollment in enrolled_result.scalars().all():
        student_result = await db.execute(
            select(User).where(User.id == enrollment.student_id)
        )
        student = student_result.scalar_one_or_none()
        if student:
            await notif_svc.create_notification(
                db, student.id,
                NotificationType.ASSIGNMENT_POSTED,
                "Assignment Removed",
                f"The assignment '{assignment.title}' has been removed.",
                reference_id=assignment.id, reference_type="assignment",
            )
            await send_email(
                student.email,
                f"Assignment Removed: {assignment.title}",
                f"<p>The assignment <strong>{assignment.title}</strong> has been removed.</p>",
            )

    assignment.status = AssignmentStatus.DELETED
    await db.commit()


@router.get("/professor/my-assignments")
async def get_my_assignments(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor),
):
    """Get all assignments created by the current professor, grouped by section."""
    result = await db.execute(
        select(ProfessorSection).where(
            ProfessorSection.professor_id == current_user.id
        )
    )
    professor_sections = result.scalars().all()

    data = []
    for ps in professor_sections:
        section_result = await db.execute(
            select(Section).where(Section.id == ps.section_id)
        )
        section = section_result.scalar_one_or_none()
        if not section:
            continue

        assignments_result = await db.execute(
            select(Assignment).where(
                Assignment.section_id == section.id,
                Assignment.status != AssignmentStatus.DELETED,
            )
        )
        assignments = assignments_result.scalars().all()

        data.append({
            "section_id": str(section.id),
            "section_name": section.name,
            "subject": section.subject,
            "assignments": [AssignmentListResponse.model_validate(a) for a in assignments],
        })
    return data
