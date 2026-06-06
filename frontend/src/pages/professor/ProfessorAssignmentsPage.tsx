import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { FileText, Calendar, Hash, ChevronRight } from 'lucide-react'
import { TopBar } from '../../components/layout/TopBar'
import { Badge } from '../../components/ui/Badge'
import { Spinner } from '../../components/ui/Spinner'
import { EmptyState } from '../../components/ui/EmptyState'
import api from '../../lib/api'
import type { Assignment } from '../../types'
import { formatDateTime, isDeadlinePast } from '../../lib/utils'

interface SectionGroup {
  section_id: string
  section_name: string
  subject: string
  assignments: Assignment[]
}

export default function ProfessorAssignmentsPage() {
  const { data = [], isLoading } = useQuery({
    queryKey: ['professor-all-assignments'],
    queryFn: async () => {
      const res = await api.get('/assignments/professor/my-assignments')
      return res.data as SectionGroup[]
    },
  })

  return (
    <div>
      <TopBar title="Assignments" subtitle="All assignments across your sections" />
      <div className="p-6 space-y-6">
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner className="h-8 w-8" /></div>
        ) : data.length === 0 ? (
          <EmptyState icon={FileText} title="No assignments" description="Create assignments from a section page." />
        ) : (
          data.map((group) => (
            <div key={group.section_id}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">{group.subject}</h2>
                  <p className="text-xs text-gray-400">{group.section_name}</p>
                </div>
                <Link to={`/professor/sections/${group.section_id}`}
                  className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1">
                  Manage section <ChevronRight className="h-3 w-3" />
                </Link>
              </div>

              {group.assignments.length === 0 ? (
                <p className="text-sm text-gray-400 py-3">No assignments in this section.</p>
              ) : (
                <div className="space-y-2">
                  {group.assignments.map((a) => (
                    <Link
                      key={a.id}
                      to={`/professor/assignments/${a.id}`}
                      className="card flex items-center gap-4 hover:shadow-md hover:border-primary-200 transition-all group"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 shrink-0">
                        <FileText className="h-5 w-5 text-primary-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-900 group-hover:text-primary-700 transition-colors">
                            {a.title}
                          </span>
                          <Badge status={isDeadlinePast(a.deadline) ? 'closed' : 'active'}
                            label={isDeadlinePast(a.deadline) ? 'Closed' : 'Active'} />
                        </div>
                        <div className="mt-1 flex flex-wrap gap-3 text-xs text-gray-400">
                          <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDateTime(a.deadline)}</span>
                          <span className="flex items-center gap-1"><Hash className="h-3 w-3" />{a.max_marks} marks</span>
                          <span>{a.submission_count ?? 0} submissions</span>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-primary-500 transition-colors shrink-0" />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
