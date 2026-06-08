import { useQuery } from '@tanstack/react-query'
import { FileText, Users, Clock, ChevronRight, Send, CheckCircle, AlertTriangle, BarChart2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { TopBar } from '../../components/layout/TopBar'
import { StatCard } from '../../components/ui/StatCard'
import { Spinner } from '../../components/ui/Spinner'
import { EmptyState } from '../../components/ui/EmptyState'
import api from '../../lib/api'

interface SemesterDashboard {
  semester: {
    id: string
    name: string
    branch: string
    course: string
    college: string
  }
  analytics: {
    total_assignments: number
    total_students: number
    average_marks_percentage: number
    pending_evaluations: number
  }
}

interface AnalyticsSummary {
  total_assignments: number
  total_students: number
  total_submissions: number
  total_evaluated: number
  pending_evaluations: number
  plagiarism_cases: number
  average_score_percentage: number
}

export default function ProfessorDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['professor-dashboard'],
    queryFn: async () => {
      const res = await api.get('/professor/dashboard')
      return res.data as { professor: { name: string; professor_id: string }; semesters: SemesterDashboard[] }
    },
    refetchInterval: 60_000,
  })

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['professor-analytics-summary'],
    queryFn: async () => {
      const res = await api.get('/professor/analytics/summary')
      return res.data as AnalyticsSummary
    },
    refetchInterval: 30_000,
  })

  const semesters = data?.semesters ?? []

  return (
    <div>
      <TopBar title="Dashboard" subtitle="Your teaching overview" />
      <div className="p-6 space-y-6">
        {isLoading || summaryLoading ? (
          <div className="flex justify-center py-12"><Spinner className="h-8 w-8" /></div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Total Assignments" value={summary?.total_assignments ?? 0} icon={FileText}
                iconBg="bg-blue-50" iconColor="text-blue-600" />
              <StatCard label="Total Students" value={summary?.total_students ?? 0} icon={Users}
                iconBg="bg-violet-50" iconColor="text-violet-600" />
              <StatCard label="Total Submissions" value={summary?.total_submissions ?? 0} icon={Send}
                iconBg="bg-sky-50" iconColor="text-sky-600" />
              <StatCard label="Evaluated" value={summary?.total_evaluated ?? 0} icon={CheckCircle}
                iconBg="bg-green-50" iconColor="text-green-600" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatCard label="Pending Evaluations" value={summary?.pending_evaluations ?? 0} icon={Clock}
                iconBg="bg-orange-50" iconColor="text-orange-600" />
              <StatCard label="Plagiarism Cases" value={summary?.plagiarism_cases ?? 0} icon={AlertTriangle}
                iconBg="bg-red-50" iconColor="text-red-600" />
              <StatCard label="Average Score" value={`${summary?.average_score_percentage ?? 0}%`} icon={BarChart2}
                iconBg="bg-teal-50" iconColor="text-teal-600" />
            </div>

            {semesters.length === 0 ? (
              <EmptyState icon={FileText} title="No semesters assigned"
                description="Contact your college admin to get semesters assigned to you." />
            ) : (
              <div>
                <h2 className="text-sm font-semibold text-gray-900 mb-3">My Semesters</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {semesters.map(({ semester, analytics }) => (
                    <Link key={semester.id}
                      to={`/professor/sections/${semester.id}`}
                      className="card hover:shadow-md hover:border-primary-200 transition-all group">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-semibold text-gray-900 group-hover:text-primary-700 transition-colors">
                            {semester.name}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {semester.course} → {semester.branch}
                          </p>
                          <p className="text-[11px] text-gray-300">{semester.college}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-primary-400 transition-colors" />
                      </div>

                      <div className="grid grid-cols-2 gap-2 mt-3">
                        <Metric label="Assignments" value={analytics.total_assignments} />
                        <Metric label="Students" value={analytics.total_students} />
                        <Metric label="Avg. Score"
                          value={`${analytics.average_marks_percentage.toFixed(1)}%`}
                          highlight={analytics.average_marks_percentage >= 60} />
                        <Metric label="Pending" value={analytics.pending_evaluations}
                          highlight={analytics.pending_evaluations === 0} />
                      </div>

                      {analytics.pending_evaluations > 0 && (
                        <div className="mt-3 flex items-center gap-1.5 text-xs text-orange-600 bg-orange-50 rounded-lg px-3 py-2">
                          <Clock className="h-3.5 w-3.5 shrink-0" />
                          {analytics.pending_evaluations} pending evaluation{analytics.pending_evaluations !== 1 ? 's' : ''}
                        </div>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Metric({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2">
      <p className="text-[11px] text-gray-400">{label}</p>
      <p className={`text-sm font-semibold ${highlight ? 'text-green-600' : 'text-gray-800'}`}>{value}</p>
    </div>
  )
}
