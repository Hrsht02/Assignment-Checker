from datetime import datetime
from pydantic import BaseModel, field_validator
from app.models.assignment import AssignmentStatus


class AssignmentCreate(BaseModel):
    title: str
    description: str
    max_marks: int
    deadline: datetime
    rubric: str
    question_text: str | None = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str) -> str:
        v = v.strip()
        if not (1 <= len(v) <= 200):
            raise ValueError("Title must be between 1 and 200 characters")
        return v

    @field_validator("description")
    @classmethod
    def validate_description(cls, v: str) -> str:
        v = v.strip()
        if not (1 <= len(v) <= 2000):
            raise ValueError("Description must be between 1 and 2000 characters")
        return v

    @field_validator("max_marks")
    @classmethod
    def validate_max_marks(cls, v: int) -> int:
        if not (1 <= v <= 1000):
            raise ValueError("Max marks must be between 1 and 1000")
        return v

    @field_validator("rubric")
    @classmethod
    def validate_rubric(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Rubric cannot be empty")
        return v


class AssignmentUpdate(BaseModel):
    description: str | None = None
    deadline: datetime | None = None
    rubric: str | None = None
    max_marks: int | None = None
    title: str | None = None


class AssignmentResponse(BaseModel):
    id: str
    section_id: str
    created_by: str
    title: str
    description: str
    question_text: str | None
    question_pdf_url: str | None
    max_marks: int
    rubric: str
    deadline: datetime
    status: AssignmentStatus
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AssignmentListResponse(BaseModel):
    id: str
    section_id: str
    title: str
    max_marks: int
    deadline: datetime
    status: AssignmentStatus
    submission_count: int = 0
    evaluated_count: int = 0

    model_config = {"from_attributes": True}
