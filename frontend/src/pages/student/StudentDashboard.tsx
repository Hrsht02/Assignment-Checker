import { useQuery } from '@tanstack/react-query'
import { FileText, CheckCircle, Clock, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { TopBar } from '../../components/layout/TopBar'
import { StatCard } from '../../components/ui/StatCard'
import { Spinner } from '../../components/ui/Spinner'
import { EmptyState } from '../../components/ui/EmptyState'
import { Badge } from '../../components/ui/Badge'
import api from '../../lib/api'
import { formatDateTime, isDeadlinePast } from '../../lib/utils'
import type { StudentAssignmentStats } from '../../types'

interface AssignmentItem {
  id: string
  title: string
  description: string
  max_marks: number
  deadline: string
  status: string
  submission?: {
    status: string
    final_score?: number
    ai_score?: number
    submitted_at: string
  } | null
}

interface SectionData {
  section: { id: string; name: string; subject: string; semester_name: string }
  assignments: {
    active: AssignmentItem[]
    upcoming: AssignmentItem[]
    submitted: AssignmentItem[]
    evaluated: AssignmentItem[]
  }
}

export default function StudentDashboard() {
  const { data: stats } = useQuery({
    queryKey: ['student-stats'],
    queryFn: async () => {
      const res = await api.get('/student/stats')
      return res.data as StudentAssignmentStats
    },
  })

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['student-dashboard'],
    queryFn: async () => {
      const res = await api.get('/student/dashboard')
      return res.data as { sections: SectionData[] }
    },
  })

  const allActive = dashboard?.sections.flatMap((s) => s.assignments.active) ?? []
  const allSubmitted = dashboard?.sections.flatMap((s) => s.assignments.submitted) ?? []

  return (
    <div>
      <TopBar title="Dashboard" subtitle="Your academic overview" />
      <div className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Total Assigned" value={stats?.total_assigned ?? 0} icon={FileText}
            iconBg="bg-blue-50" iconColor="text-blue-600" />
          <StatCard label="Submitted" value={stats?.total_submitted ?? 0} icon={CheckCircle}
            iconBg="bg-green-50" iconColor="text-green-600" />
          <StatCard label="Evaluated" value={stats?.total_evaluated ?? 0} icon={TrendingUp}
            iconBg="bg-violet-50" iconColor="text-violet-600" />
          <StatCard label="Avg. Score" value={`${stats?.average_score_percentage?.toFixed(1) ?? 0}%`} icon={TrendingUp}
            iconBg="bg-emerald-50" iconColor="text-emerald-600" />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner className="h-8 w-8" /></div>
        ) : (
          <>
            {/* Active / due soon */}
            {allActive.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-gray-900 mb-3">
                  Action Required
                  <span className="ml-2 badge bg-red-100 text-red-700">{allActive.length}</span>
                </h2>
                <div className="space-y-2">
                  {allActive.slice(0, 5).map((a) => (
                    <AssignmentCard key={a.id} item={a} />
                  ))}
                  {allActive.length > 5 && (
                    <Link to="/student/assignments" className="text-xs text-primary-600 hover:underline">
                      View all {allActive.length} active assignments →
                    </Link>
                  )}
                </div>
              </div>
            )}

            {/* Pending evaluation */}
            {allSubmitted.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-gray-900 mb-3">
                  Submitted — Pending Evaluation
                  <span className="ml-2 badge bg-blue-100 text-blue-700">{allSubmitted.length}</span>
                </h2>
                <div className="space-y-2">
                  {allSubmitted.slice(0, 3).map((a) => (
                    <AssignmentCard key={a.id} item={a} />
                  ))}
                </div>
              </div>
            )}

            {allActive.length === 0 && allSubmitted.length === 0 && (
              <EmptyState icon={CheckCircle} title="All caught up!" description="No pending assignments right now." />
            )}
          </>
        )}
      </div>
    </div>
  )
}

function AssignmentCard({ item }: { item: AssignmentItem }) {
  const past = isDeadlinePast(item.deadline)
  const subStatus = item.submission?.status

  return (
    <Link
      to={`/student/assignments/${item.id}`}
      className="card flex items-center gap-4 hover:shadow-md hover:border-primary-200 transition-all group p-4"
    >
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl shrink-0 ${
        past ? 'bg-red-50' : 'bg-primary-50'
      }`}>
        <FileText className={`h-5 w-5 ${past ? 'text-red-400' : 'text-primary-600'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm text-gray-900 group-hover:text-primary-700 transition-colors">
            {item.title}
          </span>
          {subStatus && <Badge status={subStatus} />}
        </div>
        <div className="flex gap-3 mt-0.5 text-xs text-gray-400">
          <span className={`flex items-center gap-1 ${past && !subStatus ? 'text-red-500' : ''}`}>
            <Clock className="h-3 w-3" />
            {past ? 'Ended' : 'Due'} {formatDateTime(item.deadline)}
          </span>
          <span>{item.max_marks} marks</span>
        </div>
      </div>
      {item.submission?.final_score != null && (
        <div className="text-right shrink-0">
          <span className="text-lg font-bold text-gray-900">{item.submission.final_score}</span>
          <span className="text-xs text-gray-400">/{item.max_marks}</span>
        </div>
      )}
    </Link>
  )
}
