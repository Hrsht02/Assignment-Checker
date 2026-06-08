import re
from datetime import datetime
from pydantic import BaseModel, field_validator
from app.models.user import UserRole, UserStatus


# ── Shared ────────────────────────────────────────────────────────────────────

class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    phone: str | None
    role: UserRole
    status: UserStatus
    college_id: str | None
    roll_number: str | None
    professor_id: str | None
    created_at: datetime
    model_config = {"from_attributes": True}


class UserListResponse(BaseModel):
    id: str
    name: str
    email: str
    phone: str | None
    role: UserRole
    status: UserStatus
    college_id: str | None
    roll_number: str | None
    professor_id: str | None
    model_config = {"from_attributes": True}


class LoginRequest(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def strip(cls, v: str) -> str:
        return v.strip()


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class ResetPasswordRequest(BaseModel):
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


# ── Org Admin creates College Admin ──────────────────────────────────────────

class CollegeAdminCreate(BaseModel):
    name: str
    email: str
    password: str
    phone: str | None = None

    @field_validator("name")
    @classmethod
    def v_name(cls, v: str) -> str:
        v = v.strip()
        if not (1 <= len(v) <= 100):
            raise ValueError("Name must be 1–100 characters")
        return v

    @field_validator("email")
    @classmethod
    def v_email(cls, v: str) -> str:
        v = v.strip()
        if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", v):
            raise ValueError("Enter a valid email")
        return v

    @field_validator("password")
    @classmethod
    def v_pw(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Min 8 characters")
        return v


# ── College Admin creates Professor ──────────────────────────────────────────

class ProfessorCreate(BaseModel):
    name: str
    professor_id: str
    email: str
    phone: str | None = None
    password: str
    semester_ids: list[str] = []   # list of semester IDs to assign

    @field_validator("name")
    @classmethod
    def v_name(cls, v: str) -> str:
        return v.strip()

    @field_validator("professor_id")
    @classmethod
    def v_pid(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Professor ID is required")
        return v

    @field_validator("email")
    @classmethod
    def v_email(cls, v: str) -> str:
        v = v.strip()
        if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", v):
            raise ValueError("Enter a valid email")
        return v

    @field_validator("password")
    @classmethod
    def v_pw(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Min 8 characters")
        return v


# ── College Admin creates Student ─────────────────────────────────────────────

class StudentCreate(BaseModel):
    name: str
    roll_number: str
    email: str
    phone: str | None = None
    password: str
    semester_id: str   # auto-enrolled on creation

    @field_validator("name")
    @classmethod
    def v_name(cls, v: str) -> str:
        return v.strip()

    @field_validator("roll_number")
    @classmethod
    def v_roll(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Roll number is required")
        return v

    @field_validator("email")
    @classmethod
    def v_email(cls, v: str) -> str:
        v = v.strip()
        if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", v):
            raise ValueError("Enter a valid email")
        return v

    @field_validator("password")
    @classmethod
    def v_pw(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Min 8 characters")
        return v


class StudentUpdate(BaseModel):
    name: str | None = None
    phone: str | None = None
    semester_id: str | None = None  # re-enroll to new semester


class ProfessorUpdate(BaseModel):
    name: str | None = None
    phone: str | None = None
    semester_ids: list[str] | None = None  # replace all assignments
