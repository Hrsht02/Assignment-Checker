from datetime import datetime, date
from pydantic import BaseModel, field_validator


class SemesterCreate(BaseModel):
    name: str
    start_date: date
    end_date: date

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if not (1 <= len(v) <= 100):
            raise ValueError("Semester name must be between 1 and 100 characters")
        return v

    @field_validator("end_date")
    @classmethod
    def validate_dates(cls, end_date: date, info) -> date:
        start_date = info.data.get("start_date")
        if start_date and end_date <= start_date:
            raise ValueError("End date must be after start date")
        return end_date


class SemesterResponse(BaseModel):
    id: str
    name: str
    start_date: date
    end_date: date
    created_at: datetime

    model_config = {"from_attributes": True}


class SemesterWithSections(SemesterResponse):
    sections: list["SectionResponse"] = []


class SectionCreate(BaseModel):
    name: str
    subject: str

    @field_validator("name", "subject")
    @classmethod
    def validate_fields(cls, v: str) -> str:
        v = v.strip()
        if not (1 <= len(v) <= 100):
            raise ValueError("Field must be between 1 and 100 characters")
        return v


class SectionResponse(BaseModel):
    id: str
    semester_id: str
    name: str
    subject: str
    created_at: datetime

    model_config = {"from_attributes": True}


class SectionDetailResponse(SectionResponse):
    enrolled_students: int = 0
    assigned_professors: int = 0


class AssignProfessorRequest(BaseModel):
    professor_id: str


class EnrollStudentRequest(BaseModel):
    student_id: str


class BulkEnrollRequest(BaseModel):
    student_ids: list[str]
