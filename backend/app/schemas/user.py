import re
from datetime import datetime
from pydantic import BaseModel, field_validator
from app.models.user import UserRole, UserStatus


class SignupRequest(BaseModel):
    name: str
    email: str          # email address OR phone number
    password: str
    role: UserRole
    roll_number: str | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if not (1 <= len(v) <= 100):
            raise ValueError("Name must be between 1 and 100 characters")
        return v

    @field_validator("email")
    @classmethod
    def validate_identifier(cls, v: str) -> str:
        v = v.strip()
        email_re = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
        phone_re = re.compile(r"^\+?\d{7,15}$")
        if not email_re.match(v) and not phone_re.match(v):
            raise ValueError("Enter a valid email address or phone number")
        return v

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v

    @field_validator("roll_number")
    @classmethod
    def validate_roll_number(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not re.match(r"^[A-Za-z0-9]{3,20}$", v):
            raise ValueError("Roll number must be alphanumeric and 3–20 characters")
        return v


class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    role: UserRole
    roll_number: str | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if not (1 <= len(v) <= 100):
            raise ValueError("Name must be between 1 and 100 characters")
        return v

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class UserUpdate(BaseModel):
    name: str | None = None
    role: UserRole | None = None
    status: UserStatus | None = None


class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    role: UserRole
    status: UserStatus
    roll_number: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class UserListResponse(BaseModel):
    id: str
    name: str
    email: str
    role: UserRole
    status: UserStatus
    roll_number: str | None

    model_config = {"from_attributes": True}


class LoginRequest(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def validate_identifier(cls, v: str) -> str:
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
    def validate_new_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v
