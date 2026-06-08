import uuid
from datetime import datetime
from sqlalchemy import Integer, Text, Float, String, ForeignKey, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class EvaluationReport(Base):
    __tablename__ = "evaluation_reports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    submission_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("submissions.id", ondelete="CASCADE"),
        nullable=False, unique=True,
    )
    # Core scores
    ai_score: Mapped[int] = mapped_column(Integer, nullable=False)
    percentage: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    grade: Mapped[str] = mapped_column(String(5), nullable=False, default="")

    # Structured feedback
    strengths: Mapped[str] = mapped_column(Text, nullable=False, default="")
    areas_of_improvement: Mapped[str] = mapped_column(Text, nullable=False, default="")
    missing_points: Mapped[str] = mapped_column(Text, nullable=False, default="")
    suggestions: Mapped[str] = mapped_column(Text, nullable=False, default="")
    overall_feedback: Mapped[str] = mapped_column(Text, nullable=False, default="")
    detailed_feedback: Mapped[str] = mapped_column(Text, nullable=False, default="")

    # Rubric breakdown stored as JSON string
    rubric_breakdown: Mapped[str] = mapped_column(Text, nullable=False, default="{}")

    # Source text used for evaluation
    extracted_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    submission: Mapped["Submission"] = relationship("Submission", back_populates="evaluation_report")
