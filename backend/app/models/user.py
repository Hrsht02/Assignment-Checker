import uuid
import enum
from datetime import datetime
from sqlalchemy import String, Enum, DateTime, func, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class UserRole(str, enum.Enum):
    ORG_ADMIN = "org_admin"         # Service provider / platform owner
    COLLEGE_ADMIN = "college_admin" # Manages one college
    PROFESSOR = "professor"
    STUDENT = "student"


class UserStatus(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), nullable=False)
    status: Mapped[UserStatus] = mapped_column(Enum(UserStatus), nullable=False, default=UserStatus.ACTIVE)

    # Which college this user belongs to (null for org_admin)
    college_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("colleges.id", ondelete="CASCADE"), nullable=True
    )

    # Student-specific
    roll_number: Mapped[str | None] = mapped_column(String(30), nullable=True)
    # Professor-specific
    professor_id: Mapped[str | None] = mapped_column(String(30), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    college: Mapped["College | None"] = relationship("College", back_populates="users", foreign_keys=[college_id])
    professor_assignments: Mapped[list["ProfessorSemester"]] = relationship(
        "ProfessorSemester", back_populates="professor", foreign_keys="ProfessorSemester.professor_id"
    )
    student_enrollments: Mapped[list["StudentEnrollment"]] = relationship(
        "StudentEnrollment", back_populates="student"
    )
    submissions: Mapped[list["Submission"]] = relationship("Submission", back_populates="student")
    notifications: Mapped[list["Notification"]] = relationship("Notification", back_populates="user")
