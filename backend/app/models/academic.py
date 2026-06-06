import uuid
from datetime import datetime, date
from sqlalchemy import String, ForeignKey, Date, DateTime, func, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Semester(Base):
    __tablename__ = "semesters"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    sections: Mapped[list["Section"]] = relationship(
        "Section", back_populates="semester", cascade="all, delete-orphan"
    )


class Section(Base):
    __tablename__ = "sections"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    semester_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("semesters.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    subject: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    semester: Mapped["Semester"] = relationship("Semester", back_populates="sections")
    professor_assignments: Mapped[list["ProfessorSection"]] = relationship(
        "ProfessorSection", back_populates="section", cascade="all, delete-orphan"
    )
    student_enrollments: Mapped[list["SectionEnrollment"]] = relationship(
        "SectionEnrollment", back_populates="section", cascade="all, delete-orphan"
    )
    assignments: Mapped[list["Assignment"]] = relationship(
        "Assignment", back_populates="section", cascade="all, delete-orphan"
    )


class ProfessorSection(Base):
    __tablename__ = "professor_sections"
    __table_args__ = (
        UniqueConstraint("professor_id", "section_id", name="uq_professor_section"),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    professor_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    section_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("sections.id", ondelete="CASCADE"), nullable=False
    )
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    professor: Mapped["User"] = relationship(
        "User", back_populates="professor_sections", foreign_keys=[professor_id]
    )
    section: Mapped["Section"] = relationship(
        "Section", back_populates="professor_assignments"
    )


class SectionEnrollment(Base):
    __tablename__ = "section_enrollments"
    __table_args__ = (
        UniqueConstraint("student_id", "section_id", name="uq_student_section"),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    student_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    section_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("sections.id", ondelete="CASCADE"), nullable=False
    )
    enrolled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    student: Mapped["User"] = relationship("User", back_populates="student_enrollments")
    section: Mapped["Section"] = relationship("Section", back_populates="student_enrollments")
