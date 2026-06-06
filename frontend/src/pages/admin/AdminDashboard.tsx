import { useQuery } from '@tanstack/react-query'
import { Users, BookOpen, FileText, ClipboardList, Clock, TrendingUp } from 'lucide-react'
import { TopBar } from '../../components/layout/TopBar'
import { StatCard } from '../../components/ui/StatCard'
import { Spinner } from '../../components/ui/Spinner'
import api from '../../lib/api'
import type { AdminDashboardStats } from '../../types'

export default function AdminDashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: async () => {
      const res = await api.get('/admin/dashboard')
      return res.data as AdminDashboardStats
    },
    refetchInterval: 60_000,
  })

  return (
    <div>
      <TopBar title="Dashboard" subtitle="Institution overview" />
      <div className="p-6 space-y-6">
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner className="h-8 w-8" /></div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard
                label="Total Students"
                value={stats?.total_students ?? 0}
                icon={Users}
                iconBg="bg-blue-50"
                iconColor="text-blue-600"
              />
              <StatCard
                label="Total Professors"
                value={stats?.total_professors ?? 0}
                icon={Users}
                iconBg="bg-violet-50"
                iconColor="text-violet-600"
              />
              <StatCard
                label="Total Assignments"
                value={stats?.total_assignments ?? 0}
                icon={FileText}
                iconBg="bg-green-50"
                iconColor="text-green-600"
              />
              <StatCard
                label="Total Submissions"
                value={stats?.total_submissions ?? 0}
                icon={ClipboardList}
                iconBg="bg-orange-50"
                iconColor="text-orange-600"
              />
              <StatCard
                label="Pending Evaluations"
                value={stats?.pending_evaluations ?? 0}
                icon={Clock}
                iconBg="bg-yellow-50"
                iconColor="text-yellow-600"
              />
              <StatCard
                label="Avg. Performance"
                value={`${stats?.average_performance?.toFixed(1) ?? 0}%`}
                icon={TrendingUp}
                iconBg="bg-emerald-50"
                iconColor="text-emerald-600"
              />
            </div>

            <div className="card">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Quick Actions</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Add Professor', href: '/admin/users?action=create&role=professor', icon: Users },
                  { label: 'Add Student', href: '/admin/users?action=create&role=student', icon: Users },
                  { label: 'New Semester', href: '/admin/semesters?action=create', icon: BookOpen },
                  { label: 'View Reports', href: '/admin/reports', icon: TrendingUp },
                ].map((item) => (
                  <a
                    key={item.label}
                    href={item.href}
                    className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 p-4 text-center hover:bg-primary-50 hover:border-primary-200 transition-colors"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white shadow-sm">
                      <item.icon className="h-4 w-4 text-gray-600" />
                    </div>
                    <span className="text-xs font-medium text-gray-700">{item.label}</span>
                  </a>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
