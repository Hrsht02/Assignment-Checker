import { NavLink } from 'react-router-dom'
import { cn } from '../../lib/utils'
import { useAuthStore } from '../../store/authStore'
import { useLogout } from '../../hooks/useAuth'
import {
  LayoutDashboard, Users, BookOpen, FileText,
  ClipboardList, Bell, LogOut, GraduationCap,
  BarChart3, Settings, Building2, ChevronRight,
} from 'lucide-react'

interface NavItem { label: string; to: string; icon: React.ElementType }

const orgAdminNav: NavItem[] = [
  { label: 'Dashboard',  to: '/org',           icon: LayoutDashboard },
  { label: 'Colleges',   to: '/org/colleges',  icon: Building2 },
  { label: 'Settings',   to: '/org/settings',  icon: Settings },
]

const collegeAdminNav: NavItem[] = [
  { label: 'Dashboard',  to: '/college-admin',            icon: LayoutDashboard },
  { label: 'Structure',  to: '/college-admin/structure',  icon: BookOpen },
  { label: 'Professors', to: '/college-admin/professors', icon: Users },
  { label: 'Students',   to: '/college-admin/students',   icon: Users },
  { label: 'Reports',    to: '/college-admin/reports',    icon: BarChart3 },
]

const professorNav: NavItem[] = [
  { label: 'Dashboard',   to: '/professor',              icon: LayoutDashboard },
  { label: 'Assignments', to: '/professor/assignments',  icon: FileText },
  { label: 'Submissions', to: '/professor/submissions',  icon: ClipboardList },
  { label: 'Reports',     to: '/professor/reports',      icon: BarChart3 },
]

const studentNav: NavItem[] = [
  { label: 'Dashboard',   to: '/student',             icon: LayoutDashboard },
  { label: 'Assignments', to: '/student/assignments', icon: FileText },
  { label: 'Results',     to: '/student/results',     icon: BarChart3 },
]

const navByRole: Record<string, NavItem[]> = {
  org_admin: orgAdminNav,
  college_admin: collegeAdminNav,
  professor: professorNav,
  student: studentNav,
}

const roleLabel: Record<string, string> = {
  org_admin: 'Org Admin',
  college_admin: 'College Admin',
  professor: 'Professor',
  student: 'Student',
}

const notifPath: Record<string, string> = {
  org_admin: '/org/notifications',
  college_admin: '/college-admin/notifications',
  professor: '/professor/notifications',
  student: '/student/notifications',
}

export function Sidebar() {
  const { user } = useAuthStore()
  const logout = useLogout()
  const nav = navByRole[user?.role ?? 'student'] ?? []

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-gray-200 bg-white">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-gray-100 px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600">
          <GraduationCap className="h-4 w-4 text-white" />
        </div>
        <div>
          <p className="text-sm font-bold text-gray-900 leading-tight">AI Academic</p>
          <p className="text-[10px] text-gray-400">Platform</p>
        </div>
      </div>

      {/* User info */}
      <div className="border-b border-gray-100 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 text-primary-700 text-sm font-bold shrink-0">
            {user?.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-gray-900">{user?.name}</p>
            <p className="text-xs text-gray-400">{roleLabel[user?.role ?? ''] ?? user?.role}</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Main navigation">
        <ul className="space-y-0.5" role="list">
          {nav.map(item => (
            <li key={item.to}>
              <NavLink to={item.to} end={item.to.split('/').length <= 2}
                className={({ isActive }) => cn(
                  'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                )}>
                {({ isActive }) => (
                  <>
                    <item.icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-primary-600' : 'text-gray-400 group-hover:text-gray-600')} />
                    <span className="flex-1">{item.label}</span>
                    {isActive && <ChevronRight className="h-3 w-3 text-primary-400" />}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Bottom */}
      <div className="border-t border-gray-100 px-3 py-3 space-y-0.5">
        <NavLink to={notifPath[user?.role ?? 'student'] ?? '/notifications'}
          className={({ isActive }) => cn(
            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
            isActive ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          )}>
          <Bell className="h-4 w-4 text-gray-400" />
          <span>Notifications</span>
        </NavLink>
        <button onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors">
          <LogOut className="h-4 w-4" />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  )
}
