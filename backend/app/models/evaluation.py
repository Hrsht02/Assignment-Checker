import uuid
from datetime import datetime
from sqlalchemy import Integer, Text, ForeignKey, DateTime, func, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class EvaluationReport(Base):
    __tablename__ = "evaluation_reports"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    submission_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("submissions.id", ondelete="CASCADE"),
        nullable=False, unique=True,
    )
    strengths: Mapped[str] = mapped_column(Text, nullable=False)
    areas_of_improvement: Mapped[str] = mapped_column(Text, nullable=False)
    ai_score: Mapped[int] = mapped_column(Integer, nullable=False)
    detailed_feedback: Mapped[str] = mapped_column(Text, nullable=False)
    extracted_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    submission: Mapped["Submission"] = relationship(
        "Submission", back_populates="evaluation_report"
    )
