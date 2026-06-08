import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { BarChart3, Download, FileText, ChevronRight } from 'lucide-react'
import { TopBar } from '../../components/layout/TopBar'
import { Spinner } from '../../components/ui/Spinner'
import { EmptyState } from '../../components/ui/EmptyState'
import { Badge } from '../../components/ui/Badge'
import api from '../../lib/api'
import { formatDateTime, isDeadlinePast } from '../../lib/utils'

interface SemesterGroup {
  semester_id: string
  semester_name: string
  branch_name: string
  course_name: string
  assignments: Array<{
    id: string
    title: string
    deadline: string
    max_marks: number
    submission_count: number
    status: string
  }>
}

export default function ProfessorReportsPage() {
  const { data = [], isLoading } = useQuery({
    queryKey: ['professor-all-assignments'],
    queryFn: async () => (await api.get('/assignments/professor/my-assignments')).data as SemesterGroup[],
  })

  // Only show assignments whose deadline has passed (reports are meaningful then)
  const closedAssignments = data.flatMap(g =>
    g.assignments
      .filter(a => isDeadlinePast(a.deadline))
      .map(a => ({ ...a, semester_name: g.semester_name, course_name: g.course_name }))
  ).sort((a, b) => new Date(b.deadline).getTime() - new Date(a.deadline).getTime())

  return (
    <div>
      <TopBar title="Reports" subtitle="Download marks reports for completed assignments" />
      <div className="p-6 space-y-4">
        <div className="card bg-primary-50 border-primary-100">
          <div className="flex items-start gap-3">
            <BarChart3 className="h-5 w-5 text-primary-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-primary-900">Reports auto-generate after deadline</p>
              <p className="text-xs text-primary-700 mt-1">
                Click any assignment below to open it and download the full marks report as PDF, Excel, or CSV.
                Reports include student name, roll number, marks, percentage, grade, and submission timestamp.
              </p>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner className="h-8 w-8" /></div>
        ) : closedAssignments.length === 0 ? (
          <EmptyState icon={BarChart3} title="No completed assignments yet"
            description="Reports appear here once assignment deadlines have passed." />
        ) : (
          <div className="space-y-2">
            {closedAssignments.map(a => (
              <Link key={a.id} to={`/professor/assignments/${a.id}`}
                className="card flex items-center gap-4 hover:shadow-md hover:border-primary-200 transition-all group">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-50 shrink-0">
                  <FileText className="h-5 w-5 text-gray-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 group-hover:text-primary-700 transition-colors">
                      {a.title}
                    </span>
                    <Badge status="closed" label="Closed" />
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {a.course_name} · {a.semester_name}
                  </p>
                  <p className="text-xs text-gray-400">
                    Ended {formatDateTime(a.deadline)} · {a.submission_count} submissions · {a.max_marks} marks
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 text-xs text-primary-600 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Download className="h-3.5 w-3.5" /> Download
                </div>
                <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-primary-500 shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
