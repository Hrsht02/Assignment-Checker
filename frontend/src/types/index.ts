export type UserRole = 'admin' | 'professor' | 'student'
export type UserStatus = 'active' | 'inactive' | 'pending'

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  status: UserStatus
  roll_number?: string
  created_at: string
}

export interface Semester {
  id: string
  name: string
  start_date: string
  end_date: string
  created_at: string
  sections?: Section[]
}

export interface Section {
  id: string
  semester_id: string
  name: string
  subject: string
  created_at: string
  enrolled_students?: number
  assigned_professors?: number
}

export type AssignmentStatus = 'draft' | 'active' | 'closed' | 'deleted'

export interface Assignment {
  id: string
  section_id: string
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
  updated_at: string
  submission_count?: number
  evaluated_count?: number
}

export type SubmissionStatus =
  | 'submitted'
  | 'similarity_review'
  | 'evaluating'
  | 'evaluated'
  | 'extraction_failed'
  | 'evaluation_failed'
  | 'rejected'
  | 'resubmission_requested'

export interface Submission {
  id: string
  assignment_id: string
  student_id: string
  file_url: string
  file_name: string
  status: SubmissionStatus
  similarity_score?: number
  matched_submission_id?: string
  is_resubmission: boolean
  resubmission_deadline?: string
  rejection_reason?: string
  submitted_at: string
  updated_at: string
  // enriched fields
  student_name?: string
  student_email?: string
  student_roll_number?: string
  assignment_title?: string
  ai_score?: number
  final_score?: number
  professor_remark?: string
  has_evaluation?: boolean
}

export interface EvaluationReport {
  id: string
  submission_id: string
  strengths: string
  areas_of_improvement: string
  ai_score: number
  detailed_feedback: string
  created_at: string
  updated_at: string
}

export interface MarksOverride {
  id: string
  submission_id: string
  professor_id: string
  original_ai_score: number
  revised_score: number
  remark: string
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

export interface AdminDashboardStats {
  total_students: number
  total_professors: number
  total_assignments: number
  total_submissions: number
  pending_evaluations: number
  average_performance: number
}

export interface ProfessorSectionAnalytics {
  section_id: string
  section_name: string
  subject: string
  total_assignments: number
  total_students: number
  average_marks_percentage: number
  submission_rate: number
  plagiarism_rate: number
  pending_evaluations: number
}
