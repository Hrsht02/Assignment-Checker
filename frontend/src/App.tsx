import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { AppLayout } from './components/layout/AppLayout'
import type { UserRole } from './types'

// Auth
import LoginPage from './pages/LoginPage'

// Admin
import AdminDashboard from './pages/admin/AdminDashboard'
import UsersPage from './pages/admin/UsersPage'
import SemestersPage from './pages/admin/SemestersPage'
import SemesterDetailPage from './pages/admin/SemesterDetailPage'
import AdminReportsPage from './pages/admin/AdminReportsPage'
import AdminSettingsPage from './pages/admin/AdminSettingsPage'

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

function RequireAuth({ children, role }: { children: React.ReactNode; role?: UserRole }) {
  const { user, token } = useAuthStore()

  if (!token || !user) return <Navigate to="/login" replace />

  if (role && user.role !== role) {
    const home = user.role === 'admin' ? '/admin' : user.role === 'professor' ? '/professor' : '/student'
    return <Navigate to={home} replace />
  }

  return <>{children}</>
}

function GuestOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore()
  if (user) {
    const home = user.role === 'admin' ? '/admin' : user.role === 'professor' ? '/professor' : '/student'
    return <Navigate to={home} replace />
  }
  return <>{children}</>
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* Admin */}
        <Route path="/admin" element={<RequireAuth role="admin"><AppLayout /></RequireAuth>}>
          <Route index element={<AdminDashboard />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="semesters" element={<SemestersPage />} />
          <Route path="semesters/:semesterId" element={<SemesterDetailPage />} />
          <Route path="reports" element={<AdminReportsPage />} />
          <Route path="settings" element={<AdminSettingsPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
        </Route>

        {/* Professor */}
        <Route path="/professor" element={<RequireAuth role="professor"><AppLayout /></RequireAuth>}>
          <Route index element={<ProfessorDashboard />} />
          <Route path="assignments" element={<ProfessorAssignmentsPage />} />
          <Route path="assignments/:assignmentId" element={<AssignmentDetailPage />} />
          <Route path="sections/:sectionId" element={<SectionPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="submissions" element={<div className="p-8 text-gray-400">Select an assignment to view submissions.</div>} />
          <Route path="reports" element={<div className="p-8 text-gray-400">Trigger reports from an assignment's detail page.</div>} />
        </Route>

        {/* Student */}
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
