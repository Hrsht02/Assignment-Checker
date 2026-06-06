from pydantic import BaseModel


class AdminDashboardStats(BaseModel):
    total_students: int
    total_professors: int
    total_assignments: int
    total_submissions: int
    pending_evaluations: int
    average_performance: float


class ProfessorSectionAnalytics(BaseModel):
    section_id: str
    section_name: str
    subject: str
    total_assignments: int
    total_students: int
    average_marks_percentage: float
    submission_rate: float
    plagiarism_rate: float
    pending_evaluations: int


class StudentAssignmentStats(BaseModel):
    total_assigned: int
    total_submitted: int
    total_evaluated: int
    average_score_percentage: float
