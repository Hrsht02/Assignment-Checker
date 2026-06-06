import { useQuery } from '@tanstack/react-query'
import { FileText, Users, TrendingUp, Clock, AlertTriangle, CheckCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { TopBar } from '../../components/layout/TopBar'
import { StatCard } from '../../components/ui/StatCard'
import { Spinner } from '../../components/ui/Spinner'
import { EmptyState } from '../../components/ui/EmptyState'
import { Badge } from '../../components/ui/Badge'
import api from '../../lib/api'

interface SectionDashboard {
  section: { id: string; name: string; subject: string; semester_id: string }
  analytics: {
    section_id: string
    total_assignments: number
    total_students: number
    average_marks_percentage: number
    submission_rate: number
    plagiarism_rate: number
    pending_evaluations: number
  }
}

export default function ProfessorDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['professor-dashboard'],
    queryFn: async () => {
      const res = await api.get('/professor/dashboard')
      return res.data as { sections: SectionDashboard[] }
    },
    refetchInterval: 60_000,
  })

  const sections = data?.sections ?? []

  // Aggregate totals
  const totals = sections.reduce(
    (acc, s) => ({
      assignments: acc.assignments + s.analytics.total_assignments,
      students: acc.students + s.analytics.total_students,
      pending: acc.pending + s.analytics.pending_evaluations,
    }),
    { assignments: 0, students: 0, pending: 0 }
  )

  return (
    <div>
      <TopBar title="Dashboard" subtitle="Your teaching overview" />
      <div className="p-6 space-y-6">
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner className="h-8 w-8" /></div>
        ) : (
          <>
            {/* Summary stats */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatCard label="Total Assignments" value={totals.assignments} icon={FileText}
                iconBg="bg-blue-50" iconColor="text-blue-600" />
              <StatCard label="Total Students" value={totals.students} icon={Users}
                iconBg="bg-violet-50" iconColor="text-violet-600" />
              <StatCard label="Pending Evaluations" value={totals.pending} icon={Clock}
                iconBg="bg-orange-50" iconColor="text-orange-600" />
            </div>

            {/* Section cards */}
            {sections.length === 0 ? (
              <EmptyState
                icon={BookOpen}
                title="No sections assigned"
                description="Contact your admin to get sections assigned to you."
              />
            ) : (
              <div>
                <h2 className="text-sm font-semibold text-gray-900 mb-3">My Sections</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {sections.map(({ section, analytics }) => (
                    <Link
                      key={section.id}
                      to={`/professor/sections/${section.id}`}
                      className="card hover:shadow-md hover:border-primary-200 transition-all group"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-semibold text-gray-900 group-hover:text-primary-700 transition-colors">
                            {section.subject}
                          </h3>
                          <p className="text-xs text-gray-400 mt-0.5">{section.name}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mt-4">
                        <Metric label="Assignments" value={analytics.total_assignments} />
                        <Metric label="Students" value={analytics.total_students} />
                        <Metric
                          label="Avg. Score"
                          value={`${analytics.average_marks_percentage.toFixed(1)}%`}
                          highlight={analytics.average_marks_percentage >= 60}
                        />
                        <Metric
                          label="Submission Rate"
                          value={`${analytics.submission_rate.toFixed(1)}%`}
                        />
                      </div>

                      {analytics.pending_evaluations > 0 && (
                        <div className="mt-3 flex items-center gap-1.5 text-xs text-orange-600 bg-orange-50 rounded-lg px-3 py-2">
                          <Clock className="h-3.5 w-3.5 shrink-0" />
                          {analytics.pending_evaluations} pending evaluation{analytics.pending_evaluations !== 1 ? 's' : ''}
                        </div>
                      )}

                      {analytics.plagiarism_rate > 0 && (
                        <div className="mt-2 flex items-center gap-1.5 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                          {analytics.plagiarism_rate.toFixed(1)}% similarity flags
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

// fix missing import
function BookOpen(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
    </svg>
  )
}
