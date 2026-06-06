import uuid
from datetime import datetime
from sqlalchemy import String, ForeignKey, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class MarksReport(Base):
    __tablename__ = "marks_reports"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    assignment_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("assignments.id", ondelete="CASCADE"), nullable=False,
    )
    pdf_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    excel_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    csv_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    pdf_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    excel_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    csv_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    assignment: Mapped["Assignment"] = relationship("Assignment", back_populates="marks_reports")
