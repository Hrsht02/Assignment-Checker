import { useQuery } from '@tanstack/react-query'
import { Users, FileText, ClipboardList, Clock, TrendingUp, BookOpen } from 'lucide-react'
import { Link } from 'react-router-dom'
import { TopBar } from '../../components/layout/TopBar'
import { StatCard } from '../../components/ui/StatCard'
import { Spinner } from '../../components/ui/Spinner'
import api from '../../lib/api'
import type { AdminDashboardStats } from '../../types'

export default function CollegeAdminDashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['college-admin-dashboard'],
    queryFn: async () => (await api.get('/college-admin/dashboard')).data as AdminDashboardStats,
    refetchInterval: 60_000,
  })

  return (
    <div>
      <TopBar title="Dashboard" subtitle="College overview" />
      <div className="p-6 space-y-6">
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner className="h-8 w-8" /></div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              <StatCard label="Students"       value={stats?.total_students    ?? 0} icon={Users}       iconBg="bg-blue-50"    iconColor="text-blue-600" />
              <StatCard label="Professors"     value={stats?.total_professors  ?? 0} icon={Users}       iconBg="bg-violet-50"  iconColor="text-violet-600" />
              <StatCard label="Assignments"    value={stats?.total_assignments ?? 0} icon={FileText}    iconBg="bg-green-50"   iconColor="text-green-600" />
              <StatCard label="Submissions"    value={stats?.total_submissions ?? 0} icon={ClipboardList} iconBg="bg-orange-50" iconColor="text-orange-600" />
              <StatCard label="Pending Evals"  value={stats?.pending_evaluations ?? 0} icon={Clock}    iconBg="bg-yellow-50"  iconColor="text-yellow-600" />
              <StatCard label="Avg. Score"     value={`${stats?.average_performance?.toFixed(1) ?? 0}%`} icon={TrendingUp} iconBg="bg-emerald-50" iconColor="text-emerald-600" />
            </div>
            <div className="card">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Quick Actions</h2>
              <div className="flex flex-wrap gap-3">
                <Link to="/college-admin/professors" className="btn-primary"><Users className="h-4 w-4" />Manage Professors</Link>
                <Link to="/college-admin/students"   className="btn-secondary"><Users className="h-4 w-4" />Manage Students</Link>
                <Link to="/college-admin/structure"  className="btn-secondary"><BookOpen className="h-4 w-4" />Academic Structure</Link>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
