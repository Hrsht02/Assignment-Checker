from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.models.academic import Semester, Section, ProfessorSection, SectionEnrollment
from app.models.user import User, UserRole
from app.schemas.academic import (
    SemesterCreate, SemesterResponse, SemesterWithSections,
    SectionCreate, SectionResponse, SectionDetailResponse,
    AssignProfessorRequest, EnrollStudentRequest, BulkEnrollRequest,
)
from app.dependencies import require_admin, get_current_user

router = APIRouter(prefix="/semesters", tags=["semesters"])


@router.post("", response_model=SemesterResponse, status_code=status.HTTP_201_CREATED)
async def create_semester(
    body: SemesterCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    existing = await db.execute(
        select(Semester).where(Semester.name == body.name)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A semester with this name already exists",
        )
    semester = Semester(
        name=body.name, start_date=body.start_date, end_date=body.end_date
    )
    db.add(semester)
    await db.commit()
    await db.refresh(semester)
    return SemesterResponse.model_validate(semester)


@router.get("", response_model=list[SemesterResponse])
async def list_semesters(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Semester).order_by(Semester.created_at.desc()))
    return [SemesterResponse.model_validate(s) for s in result.scalars().all()]


@router.get("/{semester_id}", response_model=SemesterWithSections)
async def get_semester(
    semester_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Semester).where(Semester.id == semester_id)
    )
    semester = result.scalar_one_or_none()
    if not semester:
        raise HTTPException(status_code=404, detail="Semester not found")

    sections_result = await db.execute(
        select(Section).where(Section.semester_id == semester_id)
    )
    sections = sections_result.scalars().all()

    response = SemesterWithSections.model_validate(semester)
    response.sections = [SectionResponse.model_validate(s) for s in sections]
    return response


# ── Sections ──────────────────────────────────────────────────────────────────

@router.post(
    "/{semester_id}/sections",
    response_model=SectionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_section(
    semester_id: str,
    body: SectionCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(select(Semester).where(Semester.id == semester_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Semester not found")

    section = Section(
        semester_id=semester_id, name=body.name, subject=body.subject
    )
    db.add(section)
    await db.commit()
    await db.refresh(section)
    return SectionResponse.model_validate(section)


@router.get("/{semester_id}/sections", response_model=list[SectionDetailResponse])
async def list_sections(
    semester_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Section).where(Section.semester_id == semester_id)
    )
    sections = result.scalars().all()
    responses = []
    for section in sections:
        student_count = await db.scalar(
            select(func.count(SectionEnrollment.id)).where(
                SectionEnrollment.section_id == section.id
            )
        )
        prof_count = await db.scalar(
            select(func.count(ProfessorSection.id)).where(
                ProfessorSection.section_id == section.id
            )
        )
        r = SectionDetailResponse.model_validate(section)
        r.enrolled_students = student_count or 0
        r.assigned_professors = prof_count or 0
        responses.append(r)
    return responses


@router.post("/{semester_id}/sections/{section_id}/professors")
async def assign_professor(
    semester_id: str,
    section_id: str,
    body: AssignProfessorRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    # Validate section belongs to semester
    section_result = await db.execute(
        select(Section).where(
            Section.id == section_id, Section.semester_id == semester_id
        )
    )
    if not section_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Section not found")

    # Validate professor
    prof_result = await db.execute(
        select(User).where(User.id == body.professor_id, User.role == UserRole.PROFESSOR)
    )
    if not prof_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Professor not found")

    # Check if already assigned
    existing = await db.execute(
        select(ProfessorSection).where(
            ProfessorSection.professor_id == body.professor_id,
            ProfessorSection.section_id == section_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Professor already assigned to this section",
        )

    assignment = ProfessorSection(
        professor_id=body.professor_id, section_id=section_id
    )
    db.add(assignment)
    await db.commit()
    return {"message": "Professor assigned successfully"}


@router.delete("/{semester_id}/sections/{section_id}/professors/{professor_id}")
async def remove_professor(
    semester_id: str,
    section_id: str,
    professor_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(
        select(ProfessorSection).where(
            ProfessorSection.professor_id == professor_id,
            ProfessorSection.section_id == section_id,
        )
    )
    ps = result.scalar_one_or_none()
    if not ps:
        raise HTTPException(status_code=404, detail="Assignment not found")
    await db.delete(ps)
    await db.commit()
    return {"message": "Professor removed from section"}


@router.post("/{semester_id}/sections/{section_id}/students")
async def enroll_students(
    semester_id: str,
    section_id: str,
    body: BulkEnrollRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    section_result = await db.execute(
        select(Section).where(
            Section.id == section_id, Section.semester_id == semester_id
        )
    )
    if not section_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Section not found")

    enrolled = []
    for student_id in body.student_ids:
        student_result = await db.execute(
            select(User).where(
                User.id == student_id, User.role == UserRole.STUDENT
            )
        )
        if not student_result.scalar_one_or_none():
            continue

        existing = await db.execute(
            select(SectionEnrollment).where(
                SectionEnrollment.student_id == student_id,
                SectionEnrollment.section_id == section_id,
            )
        )
        if existing.scalar_one_or_none():
            continue

        enrollment = SectionEnrollment(student_id=student_id, section_id=section_id)
        db.add(enrollment)
        enrolled.append(str(student_id))

    await db.commit()
    return {"message": f"Enrolled {len(enrolled)} students", "enrolled": enrolled}


@router.delete("/{semester_id}/sections/{section_id}/students/{student_id}")
async def remove_student(
    semester_id: str,
    section_id: str,
    student_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(
        select(SectionEnrollment).where(
            SectionEnrollment.student_id == student_id,
            SectionEnrollment.section_id == section_id,
        )
    )
    enrollment = result.scalar_one_or_none()
    if not enrollment:
        raise HTTPException(status_code=404, detail="Enrollment not found")
    await db.delete(enrollment)
    await db.commit()
    return {"message": "Student removed from section"}


@router.get("/{semester_id}/sections/{section_id}/students", response_model=list)
async def list_section_students(
    semester_id: str,
    section_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(User)
        .join(SectionEnrollment, SectionEnrollment.student_id == User.id)
        .where(SectionEnrollment.section_id == section_id)
    )
    students = result.scalars().all()
    return [
        {
            "id": str(s.id),
            "name": s.name,
            "email": s.email,
            "roll_number": s.roll_number,
            "status": s.status.value,
        }
        for s in students
    ]
