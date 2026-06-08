import uuid
import enum
from datetime import datetime
from sqlalchemy import String, Integer, Text, ForeignKey, DateTime, func, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class AssignmentStatus(str, enum.Enum):
    ACTIVE = "active"
    CLOSED = "closed"
    DELETED = "deleted"


class Assignment(Base):
    __tablename__ = "assignments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    semester_id: Mapped[str] = mapped_column(String(36), ForeignKey("semesters.id", ondelete="CASCADE"), nullable=False)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    # Question: typed text or uploaded PDF
    question_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    question_pdf_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    question_pdf_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    max_marks: Mapped[int] = mapped_column(Integer, nullable=False)
    rubric: Mapped[str] = mapped_column(Text, nullable=False)
    deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[AssignmentStatus] = mapped_column(Enum(AssignmentStatus), nullable=False, default=AssignmentStatus.ACTIVE)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    semester: Mapped["Semester"] = relationship("Semester", back_populates="assignments")
    professor: Mapped["User"] = relationship("User", foreign_keys=[created_by])
    submissions: Mapped[list["Submission"]] = relationship("Submission", back_populates="assignment", cascade="all, delete-orphan")
    marks_reports: Mapped[list["MarksReport"]] = relationship("MarksReport", back_populates="assignment", cascade="all, delete-orphan")
