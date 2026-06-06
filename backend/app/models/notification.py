import uuid
import enum
from datetime import datetime
from sqlalchemy import String, Text, Boolean, ForeignKey, DateTime, func, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class NotificationType(str, enum.Enum):
    ASSIGNMENT_POSTED = "assignment_posted"
    SUBMISSION_RECEIVED = "submission_received"
    SUBMISSION_ACCEPTED = "submission_accepted"
    SUBMISSION_REJECTED = "submission_rejected"
    RESUBMISSION_REQUESTED = "resubmission_requested"
    DEADLINE_REMINDER = "deadline_reminder"
    MARKS_PUBLISHED = "marks_published"
    EVALUATION_COMPLETE = "evaluation_complete"
    REPORT_GENERATED = "report_generated"
    PLAGIARISM_FLAGGED = "plagiarism_flagged"
    EXTRACTION_FAILED = "extraction_failed"
    EVALUATION_FAILED = "evaluation_failed"
    DEADLINE_REACHED = "deadline_reached"


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    type: Mapped[NotificationType] = mapped_column(Enum(NotificationType), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    reference_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    reference_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped["User"] = relationship("User", back_populates="notifications")
