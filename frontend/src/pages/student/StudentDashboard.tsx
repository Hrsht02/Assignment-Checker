import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, CheckCircle, Clock, TrendingUp, AlertTriangle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { TopBar } from '../../components/layout/TopBar'
import { StatCard } from '../../components/ui/StatCard'
import { Spinner } from '../../components/ui/Spinner'
import { EmptyState } from '../../components/ui/EmptyState'
import { Badge } from '../../components/ui/Badge'
import api from '../../lib/api'
import { formatDateTime, isDeadlinePast } from '../../lib/utils'
import { useAuthStore } from '../../store/authStore'

interface AssignmentItem {
  id: string
  title: string
  description: string
  max_marks: number
  deadline: string
  is_overdue?: boolean
  submission?: {
    status: string
    final_score?: number
    ai_score?: number
    percentage?: number
    grade?: string
    submitted_at: string
    is_late?: boolean
  } | null
}

interface SectionData {
  semester: { id: string; name: string; course: string; branch: string; college: string }
  assignments: {
    active: AssignmentItem[]
    upcoming: AssignmentItem[]
    submitted: AssignmentItem[]
    evaluated: AssignmentItem[]
  }
}

export default function StudentDashboard() {
  const qc = useQueryClient()
  const { token } = useAuthStore()

  // Live stats from backend
  const { data: stats } = useQuery({
    queryKey: ['student-stats'],
    queryFn: async () => (await api.get('/student/stats')).data,
    refetchInterval: 30_000,
  })

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['student-dashboard'],
    queryFn: async () => (await api.get('/student/dashboard')).data as { semesters: SectionData[] },
    refetchInterval: 30_000,
  })

  // SSE: real-time push — invalidate queries whenever backend pushes an update
  useEffect(() => {
    if (!token) return
    const apiBase = import.meta.env.VITE_API_URL ?? ''
    const url = `${apiBase}/api/v1/student/live`
    const es = new EventSource(url)

    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'stats_update') {
          qc.invalidateQueries({ queryKey: ['student-stats'] })
          qc.invalidateQueries({ queryKey: ['student-dashboard'] })
        }
      } catch { /* ignore */ }
    }
    es.onerror = () => es.close()
    return () => es.close()
  }, [token, qc])

  const allActive   = (dashboard?.semesters ?? []).flatMap(s => s.assignments?.active   ?? [])
  const allUpcoming = (dashboard?.semesters ?? []).flatMap(s => s.assignments?.upcoming ?? [])
  const allSubmitted = (dashboard?.semesters ?? []).flatMap(s => s.assignments?.submitted ?? [])
  const allEvaluated = (dashboard?.semesters ?? []).flatMap(s => s.assignments?.evaluated ?? [])

  return (
    <div>
      <TopBar title="Dashboard" subtitle="Your academic overview" />
      <div className="p-6 space-y-6">
        {/* Stats — live from DB */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatCard label="Assigned"   value={stats?.total_assigned       ?? 0} icon={FileText}    iconBg="bg-blue-50"    iconColor="text-blue-600" />
          <StatCard label="Submitted"  value={stats?.total_submitted      ?? 0} icon={CheckCircle} iconBg="bg-green-50"   iconColor="text-green-600" />
          <StatCard label="Pending"    value={stats?.pending              ?? 0} icon={Clock}       iconBg="bg-yellow-50"  iconColor="text-yellow-600" />
          <StatCard label="Evaluated"  value={stats?.total_evaluated      ?? 0} icon={TrendingUp}  iconBg="bg-violet-50"  iconColor="text-violet-600" />
          <StatCard label="Avg. Score" value={`${stats?.average_score_percentage ?? 0}%`} icon={TrendingUp} iconBg="bg-emerald-50" iconColor="text-emerald-600" />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner className="h-8 w-8" /></div>
        ) : (
          <>
            {/* Urgent / Overdue */}
            {allActive.length > 0 && (
              <Section title="Action Required" count={allActive.length} countColor="bg-red-100 text-red-700">
                {allActive.map(a => <AssignmentCard key={a.id} item={a} urgent />)}
              </Section>
            )}

            {/* Upcoming */}
            {allUpcoming.length > 0 && (
              <Section title="Upcoming" count={allUpcoming.length} countColor="bg-blue-100 text-blue-700">
                {allUpcoming.map(a => <AssignmentCard key={a.id} item={a} />)}
              </Section>
            )}

            {/* Submitted — awaiting evaluation */}
            {allSubmitted.length > 0 && (
              <Section title="Submitted — Pending Evaluation" count={allSubmitted.length} countColor="bg-yellow-100 text-yellow-700">
                {allSubmitted.map(a => <AssignmentCard key={a.id} item={a} />)}
              </Section>
            )}

            {/* Recently evaluated */}
            {allEvaluated.length > 0 && (
              <Section title="Recently Evaluated" count={allEvaluated.length} countColor="bg-green-100 text-green-700">
                {allEvaluated.slice(0, 5).map(a => <AssignmentCard key={a.id} item={a} />)}
              </Section>
            )}

            {allActive.length === 0 && allUpcoming.length === 0 && allSubmitted.length === 0 && allEvaluated.length === 0 && (
              <EmptyState icon={CheckCircle} title="All caught up!" description="No pending assignments right now." />
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Section({ title, count, countColor, children }: {
  title: string; count: number; countColor: string; children: React.ReactNode
}) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
        {title}
        <span className={`badge ${countColor}`}>{count}</span>
      </h2>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function AssignmentCard({ item, urgent }: { item: AssignmentItem; urgent?: boolean }) {
  const sub = item.submission
  const past = isDeadlinePast(item.deadline)

  return (
    <Link
      to={`/student/assignments/${item.id}`}
      className="card flex items-center gap-4 hover:shadow-md hover:border-primary-200 transition-all group p-4"
    >
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl shrink-0 ${
        urgent && past ? 'bg-red-50' : urgent ? 'bg-orange-50' : 'bg-primary-50'
      }`}>
        {urgent && past
          ? <AlertTriangle className="h-5 w-5 text-red-400" />
          : <FileText className={`h-5 w-5 ${urgent ? 'text-orange-500' : 'text-primary-600'}`} />
        }
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm text-gray-900 group-hover:text-primary-700 transition-colors">
            {item.title}
          </span>
          {sub?.status && <Badge status={sub.status} />}
          {sub?.is_late && <span className="badge bg-red-100 text-red-600">Late</span>}
          {urgent && past && !sub && <span className="badge bg-red-100 text-red-700">Overdue</span>}
        </div>
        <div className="flex gap-3 mt-0.5 text-xs text-gray-400">
          <span className={`flex items-center gap-1 ${urgent && past ? 'text-red-500' : ''}`}>
            <Clock className="h-3 w-3" />
            {past ? 'Ended' : 'Due'} {formatDateTime(item.deadline)}
          </span>
          <span>{item.max_marks} marks</span>
        </div>
      </div>

      {/* Score display */}
      {sub?.final_score != null && (
        <div className="text-right shrink-0">
          <p className="text-lg font-bold text-gray-900">{sub.final_score}</p>
          <p className="text-xs text-gray-400">/{item.max_marks}</p>
          {sub.grade && (
            <span className={`text-xs font-bold ${
              sub.grade.startsWith('A') ? 'text-green-600' :
              sub.grade === 'B+' || sub.grade === 'B' ? 'text-blue-600' :
              sub.grade === 'C' ? 'text-yellow-600' : 'text-red-600'
            }`}>{sub.grade}</span>
          )}
        </div>
      )}
    </Link>
  )
}
