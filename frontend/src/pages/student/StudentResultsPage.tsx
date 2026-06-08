import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { TrendingUp, Award, FileText, Download } from 'lucide-react'
import { TopBar } from '../../components/layout/TopBar'
import { Spinner } from '../../components/ui/Spinner'
import { EmptyState } from '../../components/ui/EmptyState'
import api from '../../lib/api'
import { formatDateTime } from '../../lib/utils'
import { cn } from '../../lib/utils'

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
        percentage?: number
        grade?: string
        submitted_at: string
        is_late?: boolean
        strengths?: string
        areas_of_improvement?: string
        missing_points?: string
        suggestions?: string
        overall_feedback?: string
        professor_remark?: string
        file_url?: string
        file_name?: string
      } | null
    }>
  }
}

function gradeColor(grade?: string) {
  if (!grade) return 'text-gray-400 border-gray-200'
  if (grade.startsWith('A')) return 'text-green-700 border-green-400'
  if (grade.startsWith('B')) return 'text-blue-700 border-blue-400'
  if (grade === 'C') return 'text-yellow-700 border-yellow-400'
  return 'text-red-700 border-red-400'
}

export default function StudentResultsPage() {
  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['student-dashboard'],
    queryFn: async () => (await api.get('/student/dashboard')).data as { semesters: SectionData[] },
    refetchInterval: 30_000,
  })

  const sections = dashboard?.semesters ?? []
  const allEvaluated = sections.flatMap((s) =>
    (s.assignments?.evaluated ?? []).map((a) => ({
      ...a,
      subject: s.semester?.course ?? s.semester?.name ?? '',
      semester_name: s.semester?.name ?? '',
    }))
  )

  // Stats
  const avgScore = allEvaluated.length
    ? allEvaluated.reduce((acc, a) => {
        const pct = a.submission?.percentage ?? 0
        return acc + pct
      }, 0) / allEvaluated.length
    : 0

  const passed = allEvaluated.filter(a => (a.submission?.percentage ?? 0) >= 60).length
  const gradeA = allEvaluated.filter(a => a.submission?.grade?.startsWith('A')).length

  return (
    <div>
      <TopBar title="Results" subtitle="Your evaluated assignments with AI feedback" />
      <div className="p-6 space-y-5">
        {/* Summary cards */}
        {allEvaluated.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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
            <div className="card text-center">
              <TrendingUp className="mx-auto h-6 w-6 text-blue-600 mb-2" />
              <p className="text-2xl font-bold text-gray-900">{passed}</p>
              <p className="text-xs text-gray-400 mt-0.5">Passed (≥60%)</p>
            </div>
            <div className="card text-center">
              <Award className="mx-auto h-6 w-6 text-violet-600 mb-2" />
              <p className="text-2xl font-bold text-gray-900">{gradeA}</p>
              <p className="text-xs text-gray-400 mt-0.5">Grade A / A+</p>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner className="h-8 w-8" /></div>
        ) : allEvaluated.length === 0 ? (
          <EmptyState icon={TrendingUp} title="No results yet"
            description="Results appear here after your assignments are evaluated by AI." />
        ) : (
          <div className="space-y-4">
            {allEvaluated.map((item) => {
              const sub = item.submission
              const score = sub?.final_score ?? sub?.ai_score
              const pct = sub?.percentage
              const grade = sub?.grade

              return (
                <div key={item.id} className="card space-y-4">
                  {/* Header */}
                  <div className="flex items-start gap-4">
                    {/* Grade circle */}
                    <div className={cn(
                      'flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full border-2',
                      gradeColor(grade)
                    )}>
                      <span className="text-lg font-bold leading-none">{grade ?? '—'}</span>
                      {score != null && (
                        <span className="text-[10px] leading-none mt-0.5">{score}/{item.max_marks}</span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <Link to={`/student/assignments/${item.id}`}
                        className="font-semibold text-gray-900 hover:text-primary-700 transition-colors">
                        {item.title}
                      </Link>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {item.subject} · {item.semester_name}
                      </p>
                      {sub?.submitted_at && (
                        <p className="text-xs text-gray-400">
                          Submitted {formatDateTime(sub.submitted_at)}
                          {sub.is_late && <span className="ml-1 text-red-500">(Late)</span>}
                        </p>
                      )}
                    </div>

                    {/* Score bar */}
                    {pct != null && (
                      <div className="w-28 shrink-0">
                        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                          <div className={cn('h-full rounded-full transition-all',
                            pct >= 70 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                          )} style={{ width: `${pct}%` }} />
                        </div>
                        <p className="text-xs text-right text-gray-400 mt-0.5">{pct.toFixed(1)}%</p>
                      </div>
                    )}
                  </div>

                  {/* AI Feedback */}
                  {(sub?.strengths || sub?.areas_of_improvement || sub?.missing_points || sub?.suggestions) && (
                    <div className="grid sm:grid-cols-2 gap-3">
                      {sub?.strengths && (
                        <FeedbackBlock color="green" title="Strengths" text={sub.strengths} />
                      )}
                      {sub?.areas_of_improvement && (
                        <FeedbackBlock color="amber" title="Areas to Improve" text={sub.areas_of_improvement} />
                      )}
                      {sub?.missing_points && (
                        <FeedbackBlock color="red" title="Missing Points" text={sub.missing_points} />
                      )}
                      {sub?.suggestions && (
                        <FeedbackBlock color="blue" title="Suggestions" text={sub.suggestions} />
                      )}
                    </div>
                  )}

                  {/* Overall feedback */}
                  {sub?.overall_feedback && (
                    <div className="rounded-xl bg-gray-50 border border-gray-200 p-4">
                      <p className="text-xs font-semibold text-gray-600 mb-1.5">Overall Feedback</p>
                      <p className="text-sm text-gray-700 whitespace-pre-line">{sub.overall_feedback}</p>
                    </div>
                  )}

                  {/* Professor remark */}
                  {sub?.professor_remark && (
                    <div className="rounded-xl bg-primary-50 border border-primary-100 p-4">
                      <p className="text-xs font-semibold text-primary-700 mb-1.5">Professor's Remark</p>
                      <p className="text-sm text-primary-800">{sub.professor_remark}</p>
                    </div>
                  )}

                  {/* Download submitted PDF */}
                  {sub?.file_url && (
                    <div className="flex">
                      <a href={sub.file_url} target="_blank" rel="noopener noreferrer"
                        className="btn-secondary text-xs">
                        <Download className="h-3.5 w-3.5" />
                        Download Submitted PDF
                      </a>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function FeedbackBlock({ color, title, text }: { color: string; title: string; text: string }) {
  const styles: Record<string, string> = {
    green: 'bg-green-50 border-green-100 text-green-700 text-green-800',
    amber: 'bg-amber-50 border-amber-100 text-amber-700 text-amber-800',
    red:   'bg-red-50 border-red-100 text-red-700 text-red-800',
    blue:  'bg-blue-50 border-blue-100 text-blue-700 text-blue-800',
  }
  const parts = (styles[color] ?? '').split(' ')
  return (
    <div className={`rounded-xl border p-4 ${parts[0]} ${parts[1]}`}>
      <p className={`text-xs font-semibold mb-1.5 ${parts[2]}`}>{title}</p>
      <p className={`text-sm ${parts[3]}`}>{text}</p>
    </div>
  )
}
