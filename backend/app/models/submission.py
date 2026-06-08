import uuid
import enum
from datetime import datetime
from sqlalchemy import String, Float, Integer, ForeignKey, DateTime, func, Enum, Boolean, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class SubmissionType(str, enum.Enum):
    PDF = "pdf"
    TEXT = "text"


class SubmissionStatus(str, enum.Enum):
    SUBMITTED = "submitted"
    SIMILARITY_REVIEW = "similarity_review"
    EVALUATING = "evaluating"
    EVALUATED = "evaluated"
    EXTRACTION_FAILED = "extraction_failed"
    EVALUATION_FAILED = "evaluation_failed"
    REJECTED = "rejected"
    RESUBMISSION_REQUESTED = "resubmission_requested"


class Submission(Base):
    __tablename__ = "submissions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    assignment_id: Mapped[str] = mapped_column(String(36), ForeignKey("assignments.id", ondelete="CASCADE"), nullable=False)
    student_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # Submission type — PDF upload OR inline text
    submission_type: Mapped[SubmissionType] = mapped_column(Enum(SubmissionType), nullable=False, default=SubmissionType.PDF)
    # PDF fields (used when submission_type == pdf)
    file_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    file_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Text fields (used when submission_type == text)
    text_content: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[SubmissionStatus] = mapped_column(Enum(SubmissionStatus), nullable=False, default=SubmissionStatus.SUBMITTED)
    similarity_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    matched_submission_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("submissions.id"), nullable=True)
    is_resubmission: Mapped[bool] = mapped_column(Boolean, default=False)
    resubmission_deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    assignment: Mapped["Assignment"] = relationship("Assignment", back_populates="submissions")
    student: Mapped["User"] = relationship("User", back_populates="submissions")
    evaluation_report: Mapped["EvaluationReport | None"] = relationship(
        "EvaluationReport", back_populates="submission", uselist=False, cascade="all, delete-orphan"
    )
    marks_override: Mapped["MarksOverride | None"] = relationship(
        "MarksOverride", back_populates="submission", uselist=False, cascade="all, delete-orphan"
    )
    matched_submission: Mapped["Submission | None"] = relationship(
        "Submission", remote_side="Submission.id", foreign_keys=[matched_submission_id]
    )
