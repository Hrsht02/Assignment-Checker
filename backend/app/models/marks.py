import uuid
from datetime import datetime
from sqlalchemy import Integer, String, ForeignKey, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class MarksOverride(Base):
    __tablename__ = "marks_overrides"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    submission_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("submissions.id", ondelete="CASCADE"),
        nullable=False, unique=True,
    )
    professor_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False
    )
    original_ai_score: Mapped[int] = mapped_column(Integer, nullable=False)
    revised_score: Mapped[int] = mapped_column(Integer, nullable=False)
    remark: Mapped[str] = mapped_column(String(500), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    submission: Mapped["Submission"] = relationship(
        "Submission", back_populates="marks_override"
    )
    professor: Mapped["User"] = relationship("User", foreign_keys=[professor_id])
