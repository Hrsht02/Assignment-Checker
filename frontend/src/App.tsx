import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { AppLayout } from './components/layout/AppLayout'
import type { UserRole } from './types'

// Auth
import LoginPage from './pages/LoginPage'

// Org Admin
import OrgDashboard from './pages/org/OrgDashboard'
import CollegesPage from './pages/org/CollegesPage'

// College Admin
import CollegeAdminDashboard from './pages/college/CollegeAdminDashboard'
import CollegeStructurePage from './pages/college/StructurePage'
import ProfessorsPage from './pages/college/ProfessorsPage'
import StudentsPage from './pages/college/StudentsPage'

// Professor
import ProfessorDashboard from './pages/professor/ProfessorDashboard'
import ProfessorAssignmentsPage from './pages/professor/ProfessorAssignmentsPage'
import SectionPage from './pages/professor/SectionPage'
import AssignmentDetailPage from './pages/professor/AssignmentDetailPage'

// Student
import StudentDashboard from './pages/student/StudentDashboard'
import StudentAssignmentsPage from './pages/student/StudentAssignmentsPage'
import AssignmentSubmitPage from './pages/student/AssignmentSubmitPage'
import StudentResultsPage from './pages/student/StudentResultsPage'

// Shared
import NotificationsPage from './pages/NotificationsPage'
import NotFoundPage from './pages/NotFoundPage'

// ── Route Guards ──────────────────────────────────────────────────────────────

function RequireAuth({ children, role }: { children: React.ReactNode; role?: UserRole | UserRole[] }) {
  const { user, token } = useAuthStore()
  if (!token || !user) return <Navigate to="/login" replace />

  const allowed = role ? (Array.isArray(role) ? role : [role]) : null
  if (allowed && !allowed.includes(user.role)) {
    return <Navigate to={homeFor(user.role)} replace />
  }
  return <>{children}</>
}

function GuestOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore()
  if (user) return <Navigate to={homeFor(user.role)} replace />
  return <>{children}</>
}

function homeFor(role: string) {
  if (role === 'org_admin')     return '/org'
  if (role === 'college_admin') return '/college-admin'
  if (role === 'professor')     return '/professor'
  return '/student'
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* ── Org Admin ── */}
        <Route path="/org" element={<RequireAuth role="org_admin"><AppLayout /></RequireAuth>}>
          <Route index element={<OrgDashboard />} />
          <Route path="colleges" element={<CollegesPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="settings" element={<PlaceholderPage text="Platform settings coming soon." />} />
        </Route>

        {/* ── College Admin ── */}
        <Route path="/college-admin" element={<RequireAuth role="college_admin"><AppLayout /></RequireAuth>}>
          <Route index element={<CollegeAdminDashboard />} />
          <Route path="structure" element={<CollegeStructurePage />} />
          <Route path="professors" element={<ProfessorsPage />} />
          <Route path="students" element={<StudentsPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="reports" element={<PlaceholderPage text="Reports generated after assignment deadlines appear here." />} />
        </Route>

        {/* ── Professor ── */}
        <Route path="/professor" element={<RequireAuth role="professor"><AppLayout /></RequireAuth>}>
          <Route index element={<ProfessorDashboard />} />
          <Route path="assignments" element={<ProfessorAssignmentsPage />} />
          <Route path="assignments/:assignmentId" element={<AssignmentDetailPage />} />
          <Route path="sections/:sectionId" element={<SectionPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="submissions" element={<PlaceholderPage text="Select an assignment to view its submissions." />} />
          <Route path="reports" element={<PlaceholderPage text="Trigger reports from an assignment detail page." />} />
        </Route>

        {/* ── Student ── */}
        <Route path="/student" element={<RequireAuth role="student"><AppLayout /></RequireAuth>}>
          <Route index element={<StudentDashboard />} />
          <Route path="assignments" element={<StudentAssignmentsPage />} />
          <Route path="assignments/:assignmentId" element={<AssignmentSubmitPage />} />
          <Route path="results" element={<StudentResultsPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
        </Route>

        {/* 404 */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}

function PlaceholderPage({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center h-64 text-sm text-gray-400 p-8 text-center">
      {text}
    </div>
  )
}
