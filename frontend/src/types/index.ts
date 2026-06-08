// ── Users ─────────────────────────────────────────────────────────────────────

export type UserRole = 'org_admin' | 'college_admin' | 'professor' | 'student'
export type UserStatus = 'active' | 'inactive'

export interface User {
  id: string
  name: string
  email: string
  phone?: string
  role: UserRole
  status: UserStatus
  college_id?: string
  roll_number?: string
  professor_id?: string
  created_at: string
}

// ── Academic hierarchy ────────────────────────────────────────────────────────

export interface College {
  id: string
  name: string
  description?: string
  is_active: boolean
  admin_count?: number
}

export interface Course {
  id: string
  college_id?: string
  name: string
}

export interface Branch {
  id: string
  course_id?: string
  name: string
}

export interface Semester {
  id: string
  branch_id?: string
  name: string
}

export interface HierarchyCourse {
  id: string
  name: string
  branches: HierarchyBranch[]
}

export interface HierarchyBranch {
  id: string
  name: string
  semesters: { id: string; name: string }[]
}

export interface Hierarchy {
  college_id?: string
  id?: string
  name?: string
  courses: HierarchyCourse[]
}

// ── Assignments ───────────────────────────────────────────────────────────────

export type AssignmentStatus = 'active' | 'closed' | 'deleted'

export interface Assignment {
  id: string
  semester_id: string
  created_by: string
  title: string
  description: string
  question_text?: string
  question_pdf_url?: string
  max_marks: number
  rubric: string
  deadline: string
  status: AssignmentStatus
  created_at: string
  submission_count?: number
}

// ── Submissions ───────────────────────────────────────────────────────────────

export type SubmissionType = 'pdf' | 'text'
export type SubmissionStatus =
  | 'submitted' | 'similarity_review' | 'evaluating' | 'evaluated'
  | 'extraction_failed' | 'evaluation_failed' | 'rejected' | 'resubmission_requested'

export interface Submission {
  id: string
  assignment_id: string
  student_id: string
  submission_type: SubmissionType
  file_url?: string
  file_name?: string
  text_content?: string
  status: SubmissionStatus
  similarity_score?: number
  is_resubmission: boolean
  rejection_reason?: string
  resubmission_deadline?: string
  submitted_at: string
  // enriched
  student_name?: string
  student_roll?: string
  student_roll_number?: string
  ai_score?: number
  final_score?: number
  professor_remark?: string
  has_evaluation?: boolean
  strengths?: string
  areas_of_improvement?: string
  detailed_feedback?: string
}

export interface EvaluationReport {
  id: string
  submission_id: string
  ai_score: number
  strengths: string
  areas_of_improvement: string
  detailed_feedback: string
  created_at: string
}

export interface Notification {
  id: string
  user_id: string
  type: string
  title: string
  message: string
  is_read: boolean
  reference_id?: string
  reference_type?: string
  created_at: string
}

export interface StudentAssignmentStats {
  total_assigned: number
  total_submitted: number
  total_evaluated: number
  average_score_percentage: number
}


export interface AdminDashboardStats {
  total_students: number
  total_professors: number
  total_assignments: number
  total_submissions: number
  pending_evaluations: number
  average_performance: number
}
