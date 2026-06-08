import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ClipboardList, ChevronRight, FileText, Clock } from 'lucide-react'
import { TopBar } from '../../components/layout/TopBar'
import { Spinner } from '../../components/ui/Spinner'
import { EmptyState } from '../../components/ui/EmptyState'
import { Badge } from '../../components/ui/Badge'
import api from '../../lib/api'
import { formatDateTime } from '../../lib/utils'

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

export default function ProfessorSubmissionsPage() {
  const { data = [], isLoading } = useQuery({
    queryKey: ['professor-all-assignments'],
    queryFn: async () => {
      const res = await api.get('/assignments/professor/my-assignments')
      return res.data as SemesterGroup[]
    },
    refetchInterval: 30_000,
  })

  const allAssignments = data.flatMap(g =>
    g.assignments.map(a => ({ ...a, semester_name: g.semester_name, course_name: g.course_name }))
  ).filter(a => a.submission_count > 0)
    .sort((a, b) => new Date(b.deadline).getTime() - new Date(a.deadline).getTime())

  return (
    <div>
      <TopBar title="Submissions" subtitle="All assignments with pending submissions" />
      <div className="p-6 space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner className="h-8 w-8" /></div>
        ) : allAssignments.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No submissions yet"
            description="Submissions will appear here once students start submitting. Navigate to an assignment to see details." />
        ) : (
          <div className="space-y-2">
            {allAssignments.map(a => (
              <Link key={a.id} to={`/professor/assignments/${a.id}`}
                className="card flex items-center gap-4 hover:shadow-md hover:border-primary-200 transition-all group">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 shrink-0">
                  <FileText className="h-5 w-5 text-primary-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-900 group-hover:text-primary-700 transition-colors">
                      {a.title}
                    </span>
                    <Badge status={a.status} />
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {a.course_name} · {a.semester_name}
                  </p>
                  <div className="flex gap-3 mt-1 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {formatDateTime(a.deadline)}
                    </span>
                    <span>{a.max_marks} marks</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xl font-bold text-gray-900">{a.submission_count}</p>
                  <p className="text-xs text-gray-400">submissions</p>
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
