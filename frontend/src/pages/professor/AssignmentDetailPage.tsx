import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Download, Search, RefreshCw, CheckCircle,
  BarChart3, FileText, ArrowUpDown, Shield
} from 'lucide-react'
import toast from 'react-hot-toast'
import { TopBar } from '../../components/layout/TopBar'
import { Badge } from '../../components/ui/Badge'
import { Spinner } from '../../components/ui/Spinner'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import api from '../../lib/api'
import type { Assignment } from '../../types'
import { formatRelative } from '../../lib/utils'
import { cn } from '../../lib/utils'
import { useAuthStore } from '../../store/authStore'

// ── Types ──────────────────────────────────────────────────────────────────────

type SortKey = 'submitted_at' | 'final_score' | 'student_name' | 'percentage'
type SortDir = 'asc' | 'desc'

function gradeColor(g?: string | null) {
  if (!g) return 'text-gray-400'
  if (g.startsWith('A')) return 'text-green-600 font-bold'
  if (g.startsWith('B')) return 'text-blue-600 font-bold'
  if (g === 'C') return 'text-yellow-600 font-bold'
  return 'text-red-600 font-bold'
}

function plagLabel(score?: number | null) {
  if (score == null) return { label: '—', color: 'text-gray-400' }
  const pct = score * 100
  if (pct >= 99) return { label: `${pct.toFixed(0)}% Exact Copy`, color: 'text-red-700 font-bold' }
  if (pct >= 70) return { label: `${pct.toFixed(0)}% High Risk`, color: 'text-orange-600 font-semibold' }
  if (pct >= 40) return { label: `${pct.toFixed(0)}% Warning`, color: 'text-yellow-600' }
  if (pct > 0) return { label: `${pct.toFixed(0)}% Safe`, color: 'text-green-600' }
  return { label: '0% Safe', color: 'text-green-600' }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AssignmentDetailPage() {
  const { assignmentId } = useParams<{ assignmentId: string }>()
  const qc = useQueryClient()
  const { token } = useAuthStore()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [gradeFilter, setGradeFilter] = useState('')
  const [plagFilter, setPlagFilter] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('submitted_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [overrideTarget, setOverrideTarget] = useState<any | null>(null)
  const [reviewTarget, setReviewTarget] = useState<any | null>(null)
  const [reviewAction, setReviewAction] = useState<'accept' | 'reject'>('accept')
  const [overrideScore, setOverrideScore] = useState('')
  const [overrideRemark, setOverrideRemark] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [resubDays, setResubDays] = useState('3')

  // SSE live updates
  useEffect(() => {
    if (!assignmentId || !token) return
    const apiBase = import.meta.env.VITE_API_URL ?? ''
    const es = new EventSource(`${apiBase}/api/v1/professor/live/${assignmentId}`)
    es.onmessage = () => {
      qc.invalidateQueries({ queryKey: ['submissions', assignmentId] })
      qc.invalidateQueries({ queryKey: ['professor-analytics-summary'] })
      qc.invalidateQueries({ queryKey: ['professor-dashboard'] })
    }
    es.onerror = () => es.close()
    return () => es.close()
  }, [assignmentId, token, qc])

  const { data: assignment } = useQuery({
    queryKey: ['assignment', assignmentId],
    queryFn: async () => (await api.get(`/assignments/${assignmentId}`)).data as Assignment,
    enabled: !!assignmentId,
  })

  const { data: rawSubmissions = [], isLoading: sLoading, refetch } = useQuery({
    queryKey: ['submissions', assignmentId, search, statusFilter],
    queryFn: async () => {
      const p: Record<string, string> = {}
      if (search) p.student_name = search
      if (statusFilter) p.status = statusFilter
      return (await api.get(`/submissions/assignments/${assignmentId}`, { params: p })).data as any[]
    },
    enabled: !!assignmentId,
    refetchInterval: 20_000,
  })

  // Client-side grade filter + plagiarism filter + sort
  const submissions = rawSubmissions
    .filter(s => !gradeFilter || s.grade === gradeFilter)
    .filter(s => !plagFilter || (s.similarity_score != null && s.similarity_score >= 0.4))
    .sort((a, b) => {
      let va: any, vb: any
      if (sortKey === 'submitted_at') { va = new Date(a.submitted_at).getTime(); vb = new Date(b.submitted_at).getTime() }
      else if (sortKey === 'final_score') { va = a.final_score ?? -1; vb = b.final_score ?? -1 }
      else if (sortKey === 'percentage') { va = a.percentage ?? -1; vb = b.percentage ?? -1 }
      else { va = a.student_name?.toLowerCase(); vb = b.student_name?.toLowerCase() }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  // Aggregates
  const total = rawSubmissions.length
  const evaluated = rawSubmissions.filter(s => s.status === 'evaluated').length
  const pending = rawSubmissions.filter(s => s.status === 'evaluating').length
  const flagged = rawSubmissions.filter(s => s.status === 'similarity_review').length
  const scores = rawSubmissions.filter(s => s.percentage != null).map(s => s.percentage as number)
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
  const highestScore = scores.length ? Math.max(...scores) : 0
  const lowestScore = scores.length ? Math.min(...scores) : 0

  // Mutations
  const overrideMutation = useMutation({
    mutationFn: () => api.post(`/submissions/${overrideTarget?.id}/override`, {
      revised_score: parseInt(overrideScore), remark: overrideRemark,
    }),
    onSuccess: () => { toast.success('Marks updated'); qc.invalidateQueries({ queryKey: ['submissions', assignmentId] }); setOverrideTarget(null) },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Failed'),
  })

  const acceptMutation = useMutation({
    mutationFn: (subId: string) => api.post(`/submissions/${subId}/accept-marks`),
    onSuccess: () => { toast.success('Marks published'); refetch() },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Failed'),
  })

  const reviewMutation = useMutation({
    mutationFn: () => api.post(`/submissions/${reviewTarget?.id}/review`, {
      action: reviewAction,
      rejection_reason: rejectReason || undefined,
      resubmission_days: parseInt(resubDays),
    }),
    onSuccess: () => { toast.success('Review submitted'); refetch(); setReviewTarget(null) },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Failed'),
  })

  const reEvalMutation = useMutation({
    mutationFn: (subId: string) => api.post(`/submissions/${subId}/re-evaluate`),
    onSuccess: () => { toast.success('Re-evaluation triggered'); refetch() },
  })

  const reportMutation = useMutation({
    mutationFn: () => api.post(`/professor/reports/${assignmentId}/generate`),
    onSuccess: () => toast.success('Report generation started'),
  })

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <button onClick={() => toggleSort(k)} className="flex items-center gap-1 group">
      {label}
      <ArrowUpDown className={cn('h-3 w-3', sortKey === k ? 'text-primary-500' : 'text-gray-300 group-hover:text-gray-500')} />
    </button>
  )

  const apiBase = import.meta.env.VITE_API_URL ?? ''
  const exportBase = `${apiBase}/api/v1/professor/assignments/${assignmentId}/export`

  if (!assignment) return <div className="flex justify-center py-12"><Spinner className="h-8 w-8" /></div>

  return (
    <div>
      <TopBar title={assignment.title} subtitle={`${total} submissions · live updates enabled`} />
      <div className="p-6 space-y-4">

        {/* Live stat cards */}
        <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
          {[
            { label: 'Total', value: total, color: 'text-gray-700' },
            { label: 'Evaluated', value: evaluated, color: 'text-green-600' },
            { label: 'Pending', value: pending, color: 'text-yellow-600' },
            { label: 'Flagged', value: flagged, color: 'text-orange-600' },
            { label: 'Avg %', value: `${avgScore}%`, color: 'text-primary-600' },
            { label: 'Highest', value: `${highestScore}%`, color: 'text-emerald-600' },
            { label: 'Lowest', value: `${lowestScore}%`, color: 'text-red-500' },
          ].map(s => (
            <div key={s.label} className="card text-center p-3">
              <p className={`text-xl font-bold leading-tight ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative min-w-[200px] flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input type="search" placeholder="Search student…" className="input pl-9"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          <select className="input w-44" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label="Filter by status">
            <option value="">All statuses</option>
            <option value="submitted">Submitted</option>
            <option value="evaluating">Evaluating</option>
            <option value="evaluated">Evaluated</option>
            <option value="similarity_review">Similarity Review</option>
            <option value="rejected">Rejected</option>
            <option value="resubmission_requested">Resubmission</option>
          </select>

          <select className="input w-32" value={gradeFilter} onChange={e => setGradeFilter(e.target.value)} aria-label="Filter by grade">
            <option value="">All grades</option>
            {['A+', 'A', 'B+', 'B', 'C', 'D', 'F'].map(g => <option key={g} value={g}>{g}</option>)}
          </select>

          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input type="checkbox" checked={plagFilter} onChange={e => setPlagFilter(e.target.checked)}
              className="accent-primary-600" />
            <Shield className="h-3.5 w-3.5 text-orange-500" />
            Plagiarism only
          </label>

          <div className="ml-auto flex gap-2">
            <a href={`${exportBase}/csv`} target="_blank" rel="noopener noreferrer"
              className="btn-secondary text-xs px-3 py-1.5">
              <Download className="h-3.5 w-3.5" /> CSV
            </a>
            <a href={`${exportBase}/excel`} target="_blank" rel="noopener noreferrer"
              className="btn-secondary text-xs px-3 py-1.5">
              <Download className="h-3.5 w-3.5" /> Excel
            </a>
            <button className="btn-secondary text-xs px-3 py-1.5"
              onClick={() => reportMutation.mutate()} disabled={reportMutation.isPending}>
              {reportMutation.isPending ? <Spinner className="h-3.5 w-3.5" /> : <BarChart3 className="h-3.5 w-3.5" />}
              PDF Report
            </button>
          </div>
        </div>

        {/* Table */}
        {sLoading ? (
          <div className="flex justify-center py-12"><Spinner className="h-8 w-8" /></div>
        ) : submissions.length === 0 ? (
          <EmptyState icon={FileText} title="No submissions found" description="No submissions match the current filters." />
        ) : (
          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label="Submissions table">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500">
                    <th className="px-4 py-3 text-left"><SortBtn k="student_name" label="Student" /></th>
                    <th className="px-4 py-3 text-left">Roll No</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left"><SortBtn k="final_score" label="Marks" /></th>
                    <th className="px-4 py-3 text-left"><SortBtn k="percentage" label="%" /></th>
                    <th className="px-4 py-3 text-left">Grade</th>
                    <th className="px-4 py-3 text-left">Plagiarism</th>
                    <th className="px-4 py-3 text-left">Type</th>
                    <th className="px-4 py-3 text-left"><SortBtn k="submitted_at" label="Submitted" /></th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {submissions.map((sub: any) => (
                    <>
                      <tr key={sub.id}
                        className={cn('hover:bg-gray-50 transition-colors cursor-pointer',
                          expandedId === sub.id ? 'bg-primary-50/40' : '')}
                        onClick={() => setExpandedId(expandedId === sub.id ? null : sub.id)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-primary-100 text-primary-700 text-xs font-bold flex items-center justify-center shrink-0">
                              {(sub.student_name || '?').charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{sub.student_name}</p>
                              <p className="text-[11px] text-gray-400">{sub.student_email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-500">{sub.student_roll || '—'}</td>
                        <td className="px-4 py-3"><Badge status={sub.status} /></td>
                        <td className="px-4 py-3 font-semibold text-gray-900">
                          {sub.final_score != null ? `${sub.final_score}/${assignment.max_marks}` : '—'}
                          {sub.final_score !== sub.ai_score && sub.ai_score != null && (
                            <span className="ml-1 text-[10px] text-gray-400">(AI: {sub.ai_score})</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {sub.percentage != null ? (
                            <div>
                              <p className="text-sm font-medium text-gray-700">{sub.percentage}%</p>
                              <div className="mt-0.5 h-1 w-16 rounded-full bg-gray-100 overflow-hidden">
                                <div className={cn('h-full rounded-full',
                                  sub.percentage >= 70 ? 'bg-green-500' :
                                  sub.percentage >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                                )} style={{ width: `${sub.percentage}%` }} />
                              </div>
                            </div>
                          ) : '—'}
                        </td>
                        <td className={cn('px-4 py-3 text-sm', gradeColor(sub.grade))}>
                          {sub.grade || '—'}
                        </td>
                        <td className="px-4 py-3">
                          {(() => { const p = plagLabel(sub.similarity_score); return <span className={cn('text-xs', p.color)}>{p.label}</span> })()}
                          {sub.matched_student_name && (
                            <p className="text-[11px] text-gray-400">vs {sub.matched_student_name}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="badge bg-gray-100 text-gray-600 capitalize text-[11px]">
                            {sub.submission_type || 'pdf'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">
                          {formatRelative(sub.submitted_at)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                            {sub.status === 'similarity_review' && (
                              <>
                                <button className="btn-primary text-xs px-2 py-1"
                                  onClick={() => { setReviewTarget(sub); setReviewAction('accept') }}>
                                  <CheckCircle className="h-3 w-3" /> Accept
                                </button>
                                <button className="btn-danger text-xs px-2 py-1"
                                  onClick={() => { setReviewTarget(sub); setReviewAction('reject') }}>
                                  Reject
                                </button>
                              </>
                            )}
                            {sub.status === 'evaluated' && (
                              <>
                                <button className="btn-primary text-xs px-2 py-1"
                                  onClick={() => acceptMutation.mutate(sub.id)} title="Publish marks to student">
                                  <CheckCircle className="h-3 w-3" /> Publish
                                </button>
                                <button className="btn-secondary text-xs px-2 py-1"
                                  onClick={() => { setOverrideTarget(sub); setOverrideScore(String(sub.final_score ?? sub.ai_score ?? 0)); setOverrideRemark('') }}>
                                  Override
                                </button>
                                <button className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                                  onClick={() => reEvalMutation.mutate(sub.id)} title="Re-evaluate">
                                  <RefreshCw className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                            {sub.file_url && (
                              <a href={sub.file_url} target="_blank" rel="noopener noreferrer"
                                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                                title="Download submission">
                                <Download className="h-3.5 w-3.5" />
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expanded evaluation panel */}
                      {expandedId === sub.id && (
                        <tr key={`${sub.id}-exp`}>
                          <td colSpan={10} className="bg-gray-50 border-t border-b border-gray-100 px-4 py-4">
                            {sub.has_evaluation
                              ? <EvaluationPanel sub={sub} assignment={assignment} />
                              : <p className="text-sm text-gray-400 text-center py-3">
                                  {sub.status === 'evaluating'
                                    ? '⏳ AI evaluation in progress…'
                                    : sub.status === 'submitted'
                                    ? '⏳ Waiting for AI evaluation to start…'
                                    : 'No evaluation report yet.'}
                                </p>
                            }
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Override Modal */}
      <Modal open={!!overrideTarget} onClose={() => setOverrideTarget(null)} title="Override Marks">
        {overrideTarget && (
          <div className="space-y-4">
            <div className="rounded-lg bg-gray-50 border p-3 text-sm">
              <p className="text-gray-600">AI Score: <strong>{overrideTarget.ai_score ?? '—'}</strong> / {assignment.max_marks}</p>
              {overrideTarget.grade && <p className="text-gray-500">AI Grade: <strong>{overrideTarget.grade}</strong></p>}
            </div>
            <div>
              <label className="label">Revised Score (0–{assignment.max_marks})</label>
              <input type="number" className="input" min={0} max={assignment.max_marks}
                value={overrideScore} onChange={e => setOverrideScore(e.target.value)} />
            </div>
            <div>
              <label className="label">Remark (required)</label>
              <textarea className="input min-h-[80px] resize-y"
                placeholder="Explain the reason for override…"
                value={overrideRemark} onChange={e => setOverrideRemark(e.target.value)} />
            </div>
            <div className="flex justify-end gap-3">
              <button className="btn-secondary" onClick={() => setOverrideTarget(null)}>Cancel</button>
              <button className="btn-primary"
                disabled={!overrideRemark.trim() || overrideMutation.isPending}
                onClick={() => overrideMutation.mutate()}>
                {overrideMutation.isPending && <Spinner className="h-4 w-4" />} Save Override
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Review Modal */}
      <Modal open={!!reviewTarget} onClose={() => setReviewTarget(null)}
        title={reviewAction === 'accept' ? 'Accept Submission' : 'Reject Submission'}>
        {reviewTarget && (
          <div className="space-y-4">
            <div className="rounded-lg bg-orange-50 border border-orange-100 p-3 text-sm">
              <p className="font-medium text-orange-800">
                Similarity: {((reviewTarget.similarity_score ?? 0) * 100).toFixed(1)}%
                {reviewTarget.matched_student_name && ` — matched with ${reviewTarget.matched_student_name}`}
              </p>
              <p className="text-xs text-orange-600 mt-0.5">Student: {reviewTarget.student_name}</p>
            </div>
            {reviewAction === 'reject' && (
              <>
                <div>
                  <label className="label">Rejection Reason</label>
                  <textarea className="input min-h-[80px] resize-y"
                    placeholder="Explain why this submission is being rejected…"
                    value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
                </div>
                <div>
                  <label className="label">Resubmission Window (days 1–7)</label>
                  <input type="number" className="input" min={1} max={7}
                    value={resubDays} onChange={e => setResubDays(e.target.value)} />
                </div>
              </>
            )}
            <div className="flex justify-end gap-3">
              <button className="btn-secondary" onClick={() => setReviewTarget(null)}>Cancel</button>
              <button className={reviewAction === 'accept' ? 'btn-primary' : 'btn-danger'}
                disabled={reviewMutation.isPending}
                onClick={() => reviewMutation.mutate()}>
                {reviewMutation.isPending && <Spinner className="h-4 w-4" />}
                {reviewAction === 'accept' ? 'Accept Submission' : 'Reject & Request Resubmission'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

// ── Expanded Evaluation Panel ─────────────────────────────────────────────────

function EvaluationPanel({ sub, assignment }: { sub: any; assignment: Assignment }) {
  // Use data already in the submission row — no extra API call needed
  const rubricEntries = Object.entries<{ max_score: number; obtained_score: number; comment: string }>(
    (() => { try { return JSON.parse(sub.rubric_breakdown ?? '{}') } catch { return {} } })()
  )

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      {/* Left: Score summary */}
      <div className="space-y-3">
        {/* Score bar */}
        <div className="rounded-xl bg-white border border-gray-200 p-4 flex items-center gap-5">
          <div className="text-center">
            <p className="text-3xl font-bold text-gray-900">{sub.final_score ?? sub.ai_score ?? '—'}</p>
            <p className="text-xs text-gray-400">/ {assignment.max_marks}</p>
          </div>
          {sub.percentage != null && (
            <div className="text-center">
              <p className="text-3xl font-bold text-primary-600">{sub.percentage}%</p>
              <p className="text-xs text-gray-400">Percentage</p>
            </div>
          )}
          {sub.grade && (
            <div className="text-center">
              <p className={cn('text-3xl', gradeColor(sub.grade))}>{sub.grade}</p>
              <p className="text-xs text-gray-400">Grade</p>
            </div>
          )}
          {sub.percentage != null && (
            <div className="flex-1">
              <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
                <div className={cn('h-full rounded-full transition-all',
                  sub.percentage >= 70 ? 'bg-green-500' :
                  sub.percentage >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                )} style={{ width: `${sub.percentage}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* Rubric breakdown */}
        {rubricEntries.length > 0 && (
          <div className="rounded-lg bg-white border border-gray-200 p-4">
            <p className="text-xs font-semibold text-gray-600 mb-3">Rubric Breakdown</p>
            <div className="space-y-2">
              {rubricEntries.map(([criterion, data]) => (
                <div key={criterion}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-gray-700 capitalize">{criterion.replace(/_/g, ' ')}</span>
                    <span className="text-gray-500">{data.obtained_score}/{data.max_score}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full rounded-full bg-primary-500"
                      style={{ width: `${data.max_score > 0 ? (data.obtained_score / data.max_score) * 100 : 0}%` }} />
                  </div>
                  {data.comment && <p className="text-[11px] text-gray-400 mt-0.5">{data.comment}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Plagiarism */}
        {sub.similarity_score != null && sub.similarity_score > 0 && (
          <div className={cn('rounded-lg p-3 border text-sm',
            sub.similarity_score >= 0.99 ? 'bg-red-50 border-red-200' :
            sub.similarity_score >= 0.7 ? 'bg-orange-50 border-orange-200' :
            'bg-yellow-50 border-yellow-100'
          )}>
            <p className="font-semibold text-gray-800 flex items-center gap-2">
              <Shield className="h-4 w-4 shrink-0" />
              Plagiarism: {(sub.similarity_score * 100).toFixed(1)}%
              {sub.similarity_score >= 0.99 && <span className="text-red-600"> — Exact Copy</span>}
              {sub.similarity_score >= 0.7 && sub.similarity_score < 0.99 && <span className="text-orange-600"> — High Risk</span>}
            </p>
            {sub.matched_student_name && (
              <p className="text-xs text-gray-500 mt-1">Matched with: <strong>{sub.matched_student_name}</strong></p>
            )}
          </div>
        )}
      </div>

      {/* Right: AI Feedback */}
      <div className="space-y-3">
        {sub.strengths && (
          <div className="rounded-lg bg-green-50 border border-green-100 p-3">
            <p className="text-xs font-semibold text-green-700 mb-1">✓ Strengths</p>
            <p className="text-sm text-green-800">{sub.strengths}</p>
          </div>
        )}
        {sub.areas_of_improvement && (
          <div className="rounded-lg bg-amber-50 border border-amber-100 p-3">
            <p className="text-xs font-semibold text-amber-700 mb-1">⚠ Areas to Improve</p>
            <p className="text-sm text-amber-800">{sub.areas_of_improvement}</p>
          </div>
        )}
        {sub.missing_points && (
          <div className="rounded-lg bg-red-50 border border-red-100 p-3">
            <p className="text-xs font-semibold text-red-700 mb-1">✗ Missing Points</p>
            <p className="text-sm text-red-800">{sub.missing_points}</p>
          </div>
        )}
        {sub.suggestions && (
          <div className="rounded-lg bg-blue-50 border border-blue-100 p-3">
            <p className="text-xs font-semibold text-blue-700 mb-1">💡 Suggestions</p>
            <p className="text-sm text-blue-800">{sub.suggestions}</p>
          </div>
        )}
        {sub.overall_feedback && (
          <div className="rounded-lg bg-white border border-gray-200 p-3">
            <p className="text-xs font-semibold text-gray-600 mb-1">Overall Remarks</p>
            <p className="text-sm text-gray-700 whitespace-pre-line">{sub.overall_feedback}</p>
          </div>
        )}
        {sub.professor_remark && (
          <div className="rounded-lg bg-primary-50 border border-primary-100 p-3">
            <p className="text-xs font-semibold text-primary-700 mb-1">Professor's Override Remark</p>
            <p className="text-sm text-primary-800">{sub.professor_remark}</p>
          </div>
        )}
      </div>
    </div>
  )
}
