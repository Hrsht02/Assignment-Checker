from datetime import datetime
from pydantic import BaseModel
from app.models.submission import SubmissionStatus


class SubmissionResponse(BaseModel):
    id: str
    assignment_id: str
    student_id: str
    file_url: str
    file_name: str
    status: SubmissionStatus
    similarity_score: float | None
    matched_submission_id: str | None
    is_resubmission: bool
    resubmission_deadline: datetime | None
    rejection_reason: str | None
    submitted_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SubmissionWithDetails(SubmissionResponse):
    student_name: str = ""
    student_email: str = ""
    student_roll_number: str | None = None
    assignment_title: str = ""
    ai_score: int | None = None
    final_score: int | None = None
    professor_remark: str | None = None
    has_evaluation: bool = False


class PlagiarismReviewRequest(BaseModel):
    action: str  # "accept" or "reject"
    rejection_reason: str | None = None
    resubmission_days: int | None = None


class SubmissionFilterParams(BaseModel):
    student_name: str | None = None
    roll_number: str | None = None
    status: SubmissionStatus | None = None
    marks_min: int | None = None
    marks_max: int | None = None
