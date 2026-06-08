import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { TrendingUp, Award, FileText } from 'lucide-react'
import { TopBar } from '../../components/layout/TopBar'
import { Spinner } from '../../components/ui/Spinner'
import { EmptyState } from '../../components/ui/EmptyState'
import api from '../../lib/api'
import { formatDateTime } from '../../lib/utils'

interface SectionData {
  semester: { id: string; name: string; course: string; branch: string; college: string }
  assignments: {
    evaluated: Array<{
      id: string
      title: string
      max_marks: number
      deadline: string
      submission?: {
        status: string
        final_score?: number
        ai_score?: number
        submitted_at: string
        strengths?: string
        areas_of_improvement?: string
      } | null
    }>
  }
}

export default function StudentResultsPage() {
  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['student-dashboard'],
    queryFn: async () => {
      const res = await api.get('/student/dashboard')
      return res.data as { sections: SectionData[] }
    },
  })

  const sections = dashboard?.sections ?? []
  const allEvaluated = sections.flatMap((s) =>
    (s.assignments?.evaluated ?? []).map((a) => ({ ...a, subject: s.semester?.course ?? s.semester?.name ?? '' }))
  )

  const avgScore = allEvaluated.length
    ? allEvaluated.reduce((acc, a) => {
        const score = a.submission?.final_score ?? a.submission?.ai_score ?? 0
        return acc + (score / a.max_marks) * 100
      }, 0) / allEvaluated.length
    : 0

  return (
    <div>
      <TopBar title="Results" subtitle="Your evaluated assignments" />
      <div className="p-6 space-y-5">
        {/* Summary */}
        {allEvaluated.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="card text-center">
              <Award className="mx-auto h-6 w-6 text-primary-600 mb-2" />
              <p className="text-2xl font-bold text-gray-900">{avgScore.toFixed(1)}%</p>
              <p className="text-xs text-gray-400 mt-0.5">Overall Average</p>
            </div>
            <div className="card text-center">
              <FileText className="mx-auto h-6 w-6 text-green-600 mb-2" />
              <p className="text-2xl font-bold text-gray-900">{allEvaluated.length}</p>
              <p className="text-xs text-gray-400 mt-0.5">Evaluated</p>
            </div>
            <div className="card text-center col-span-2 sm:col-span-1">
              <TrendingUp className="mx-auto h-6 w-6 text-violet-600 mb-2" />
              <p className="text-2xl font-bold text-gray-900">
                {allEvaluated.filter((a) => {
                  const s = a.submission?.final_score ?? a.submission?.ai_score ?? 0
                  return s / a.max_marks >= 0.6
                }).length}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">Passed (≥60%)</p>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner className="h-8 w-8" /></div>
        ) : allEvaluated.length === 0 ? (
          <EmptyState icon={TrendingUp} title="No results yet"
            description="Evaluated assignments will appear here." />
        ) : (
          <div className="space-y-3">
            {allEvaluated.map((item) => {
              const score = item.submission?.final_score ?? item.submission?.ai_score
              const pct = score != null ? (score / item.max_marks) * 100 : null

              return (
                <Link
                  key={item.id}
                  to={`/student/assignments/${item.id}`}
                  className="card hover:shadow-md hover:border-primary-200 transition-all group"
                >
                  <div className="flex items-center gap-4">
                    {/* Score circle */}
                    <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 ${
                      pct == null ? 'border-gray-200 text-gray-400' :
                      pct >= 70 ? 'border-green-400 text-green-600' :
                      pct >= 50 ? 'border-yellow-400 text-yellow-600' :
                      'border-red-400 text-red-600'
                    }`}>
                      <div className="text-center">
                        <p className="text-base font-bold leading-none">{score ?? '—'}</p>
                        <p className="text-[10px] leading-none mt-0.5">/{item.max_marks}</p>
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 group-hover:text-primary-700 transition-colors">
                        {item.title}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{(item as any).subject}</p>
                      {item.submission?.submitted_at && (
                        <p className="text-xs text-gray-400">
                          Submitted {formatDateTime(item.submission.submitted_at)}
                        </p>
                      )}
                    </div>

                    {pct != null && (
                      <div className="w-24 shrink-0">
                        <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              pct >= 70 ? 'bg-green-500' :
                              pct >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="text-xs text-right text-gray-400 mt-0.5">{pct.toFixed(1)}%</p>
                      </div>
                    )}
                  </div>

                  {/* Quick feedback preview */}
                  {item.submission?.strengths && (
                    <p className="mt-3 text-xs text-gray-500 line-clamp-1 pl-[4.5rem]">
                      <span className="font-medium text-green-600">Strength:</span> {item.submission.strengths}
                    </p>
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
