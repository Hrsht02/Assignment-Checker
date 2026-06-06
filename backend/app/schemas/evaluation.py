from datetime import datetime
from pydantic import BaseModel, field_validator


class EvaluationReportResponse(BaseModel):
    id: str
    submission_id: str
    strengths: str
    areas_of_improvement: str
    ai_score: int
    detailed_feedback: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MarksOverrideCreate(BaseModel):
    revised_score: int
    remark: str

    @field_validator("remark")
    @classmethod
    def validate_remark(cls, v: str) -> str:
        stripped = v.strip()
        non_whitespace = "".join(stripped.split())
        if not (1 <= len(non_whitespace) <= 500):
            raise ValueError("Remark must be between 1 and 500 non-whitespace characters")
        return stripped

    @field_validator("revised_score")
    @classmethod
    def validate_score(cls, v: int) -> int:
        if v < 0:
            raise ValueError("Score cannot be negative")
        return v


class MarksOverrideResponse(BaseModel):
    id: str
    submission_id: str
    professor_id: str
    original_ai_score: int
    revised_score: int
    remark: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class FinalScoreResponse(BaseModel):
    submission_id: str
    ai_score: int | None
    final_score: int | None
    professor_remark: str | None
    is_overridden: bool
