import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Clock, CheckCircle, AlertCircle, Search } from 'lucide-react'
import { TopBar } from '../../components/layout/TopBar'
import { Badge } from '../../components/ui/Badge'
import { Spinner } from '../../components/ui/Spinner'
import { EmptyState } from '../../components/ui/EmptyState'
import api from '../../lib/api'
import { formatDateTime, isDeadlinePast } from '../../lib/utils'

type TabKey = 'active' | 'upcoming' | 'submitted' | 'evaluated'

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
  // Enriched by client for display
  semesterName?: string
  courseName?: string
}

interface SemesterData {
  semester: { id: string; name: string; course: string; branch: string; college: string }
  assignments: Record<TabKey, AssignmentItem[]>
}

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: 'active', label: 'Active', icon: AlertCircle },
  { key: 'upcoming', label: 'Upcoming', icon: Clock },
  { key: 'submitted', label: 'Submitted', icon: FileText },
  { key: 'evaluated', label: 'Evaluated', icon: CheckCircle },
]

export default function StudentAssignmentsPage() {
  const [tab, setTab] = useState<TabKey>('active')
  const [search, setSearch] = useState('')

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['student-dashboard'],
    queryFn: async () => {
      const res = await api.get('/student/dashboard')
      return res.data as { sections: SemesterData[] }
    },
  })

  const sections: SemesterData[] = dashboard?.sections ?? []

  // Flatten assignments for each tab, enriching with semester info
  const itemsForTab: AssignmentItem[] = sections.flatMap((s) => {
    const list: AssignmentItem[] = s.assignments?.[tab] ?? []
    return list.map((item) => ({
      ...item,
      semesterName: s.semester.name,
      courseName: s.semester.course,
    }))
  })

  // Apply search filter
  const filtered = search.trim()
    ? itemsForTab.filter((item) =>
        item.title.toLowerCase().includes(search.trim().toLowerCase())
      )
    : itemsForTab

  const counts = TABS.reduce((acc, t) => {
    acc[t.key] = sections.flatMap((s) => s.assignments?.[t.key] ?? []).length
    return acc
  }, {} as Record<TabKey, number>)

  return (
    <div>
      <TopBar title="Assignments" subtitle="All your assignments" />
      <div className="p-6 space-y-4">
        {/* Search bar */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search assignments…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm text-gray-800 placeholder-gray-400 shadow-sm focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400"
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-xl bg-gray-100 p-1 w-fit" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                tab === t.key
                  ? 'bg-white text-primary-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
              {counts[t.key] > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
                  tab === t.key ? 'bg-primary-100 text-primary-700' : 'bg-gray-200 text-gray-600'
                }`}>
                  {counts[t.key]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* List */}
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner className="h-8 w-8" /></div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={FileText} title={search.trim() ? 'No matching assignments' : `No ${tab} assignments`}
            description={
              search.trim() ? `No results for "${search.trim()}".` :
              tab === 'active' ? 'No assignments due right now.' :
              tab === 'upcoming' ? 'Nothing coming up soon.' :
              tab === 'submitted' ? 'Submit an assignment to see it here.' :
              'Evaluated assignments will appear here.'
            }
          />
        ) : (
          <div className="space-y-3">
            {filtered.map((item) => {
              const overdue = tab === 'active' && isDeadlinePast(item.deadline)
              return (
                <Link
                  key={item.id}
                  to={`/student/assignments/${item.id}`}
                  className="card flex items-start gap-4 hover:shadow-md hover:border-primary-200 transition-all group"
                >
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl shrink-0 mt-0.5 ${
                    tab === 'active' ? 'bg-orange-50' :
                    tab === 'evaluated' ? 'bg-green-50' :
                    'bg-primary-50'
                  }`}>
                    <FileText className={`h-5 w-5 ${
                      tab === 'active' ? 'text-orange-500' :
                      tab === 'evaluated' ? 'text-green-600' :
                      'text-primary-600'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900 group-hover:text-primary-700 transition-colors">
                        {item.title}
                      </span>
                      {item.submission?.status && <Badge status={item.submission.status} />}
                      {overdue && (
                        <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                          Overdue
                        </span>
                      )}
                    </div>
                    {(item.semesterName || item.courseName) && (
                      <p className="mt-0.5 text-xs text-gray-400">
                        {item.courseName && <span>{item.courseName}</span>}
                        {item.courseName && item.semesterName && <span> · </span>}
                        {item.semesterName && <span>{item.semesterName}</span>}
                      </p>
                    )}
                    <p className="mt-1 text-sm text-gray-500 line-clamp-2">{item.description}</p>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {isDeadlinePast(item.deadline) ? 'Ended' : 'Due'} {formatDateTime(item.deadline)}
                      </span>
                      <span>{item.max_marks} marks</span>
                      {item.submission?.submitted_at && (
                        <span className="text-green-600">
                          Submitted {formatDateTime(item.submission.submitted_at)}
                        </span>
                      )}
                    </div>
                  </div>
                  {item.submission?.final_score != null && (
                    <div className="text-right shrink-0">
                      <p className="text-xl font-bold text-gray-900">{item.submission.final_score}</p>
                      <p className="text-xs text-gray-400">/ {item.max_marks}</p>
                      <p className="text-xs text-gray-400">
                        {((item.submission.final_score / item.max_marks) * 100).toFixed(0)}%
                      </p>
                    </div>
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
