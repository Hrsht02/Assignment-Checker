import uuid
import enum
from datetime import datetime
from sqlalchemy import String, Enum, Boolean, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    PROFESSOR = "professor"
    STUDENT = "student"


class UserStatus(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    PENDING = "pending"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), nullable=False)
    status: Mapped[UserStatus] = mapped_column(
        Enum(UserStatus), nullable=False, default=UserStatus.ACTIVE
    )
    roll_number: Mapped[str | None] = mapped_column(String(20), nullable=True, unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    professor_sections: Mapped[list["ProfessorSection"]] = relationship(
        "ProfessorSection", back_populates="professor",
        foreign_keys="ProfessorSection.professor_id"
    )
    student_enrollments: Mapped[list["SectionEnrollment"]] = relationship(
        "SectionEnrollment", back_populates="student"
    )
    submissions: Mapped[list["Submission"]] = relationship(
        "Submission", back_populates="student"
    )
    notifications: Mapped[list["Notification"]] = relationship(
        "Notification", back_populates="user"
    )
