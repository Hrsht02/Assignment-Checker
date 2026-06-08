import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Download, Search, RefreshCw, CheckCircle, AlertTriangle,
  ChevronDown, ChevronUp, BarChart3, FileText
} from 'lucide-react'
import toast from 'react-hot-toast'
import { TopBar } from '../../components/layout/TopBar'
import { Badge } from '../../components/ui/Badge'
import { Spinner } from '../../components/ui/Spinner'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import api from '../../lib/api'
import type { Assignment, EvaluationReport } from '../../types'
import { formatDateTime, formatRelative } from '../../lib/utils'
import { cn } from '../../lib/utils'

export default function AssignmentDetailPage() {
  const { assignmentId } = useParams<{ assignmentId: string }>()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [overrideTarget, setOverrideTarget] = useState<any | null>(null)
  const [reviewTarget, setReviewTarget] = useState<any | null>(null)
  const [reviewAction, setReviewAction] = useState<'accept' | 'reject'>('accept')
  const [overrideScore, setOverrideScore] = useState('')
  const [overrideRemark, setOverrideRemark] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [resubDays, setResubDays] = useState('3')

  const { data: assignment } = useQuery({
    queryKey: ['assignment', assignmentId],
    queryFn: async () => (await api.get(`/assignments/${assignmentId}`)).data as Assignment,
    enabled: !!assignmentId,
  })

  const { data: submissions = [], isLoading: sLoading, refetch } = useQuery({
    queryKey: ['submissions', assignmentId, search, statusFilter],
    queryFn: async () => {
      const p: Record<string, string> = {}
      if (search) p.student_name = search
      if (statusFilter) p.status = statusFilter
      return (await api.get(`/submissions/assignments/${assignmentId}`, { params: p })).data
    },
    enabled: !!assignmentId,
    refetchInterval: 30_000,
  })

  const overrideMutation = useMutation({
    mutationFn: () => api.post(`/submissions/${overrideTarget?.id}/override`, {
      revised_score: parseInt(overrideScore), remark: overrideRemark,
    }),
    onSuccess: () => { toast.success('Marks updated'); qc.invalidateQueries({ queryKey: ['submissions'] }); setOverrideTarget(null) },
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

  if (!assignment) return <div className="flex justify-center py-12"><Spinner className="h-8 w-8" /></div>

  const pending = submissions.filter((s: any) => s.status === 'evaluating').length
  const evaluated = submissions.filter((s: any) => s.status === 'evaluated').length
  const flagged = submissions.filter((s: any) => s.status === 'similarity_review').length
  const avgScore = evaluated > 0
    ? Math.round(submissions.filter((s: any) => s.final_score != null)
        .reduce((acc: number, s: any) => acc + s.final_score / (assignment?.max_marks || 100) * 100, 0) / evaluated)
    : 0

  return (
    <div>
      <TopBar title={assignment.title} subtitle={`${submissions.length} total submissions`} />
      <div className="p-6 space-y-4">

        {/* Assignment summary */}
        <div className="card">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-semibold text-gray-900">{assignment.title}</h2>
                <Badge status={new Date(assignment.deadline) < new Date() ? 'closed' : 'active'}
                  label={new Date(assignment.deadline) < new Date() ? 'Closed' : 'Active'} />
              </div>
              <p className="text-sm text-gray-500 line-clamp-2">{assignment.description}</p>
              <p className="text-xs text-gray-400">
                Deadline: {formatDateTime(assignment.deadline)} · Max {assignment.max_marks} marks
              </p>
            </div>
            {/* Live stats */}
            <div className="flex gap-3 flex-wrap">
              {[
                { label: 'Total', value: submissions.length, color: 'text-gray-700' },
                { label: 'Evaluated', value: evaluated, color: 'text-green-600' },
                { label: 'Pending', value: pending, color: 'text-yellow-600' },
                { label: 'Flagged', value: flagged, color: 'text-orange-600' },
                { label: 'Avg Score', value: `${avgScore}%`, color: 'text-primary-600' },
              ].map(s => (
                <div key={s.label} className="text-center px-3 py-2 rounded-lg bg-gray-50 min-w-[60px]">
                  <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-[10px] text-gray-400">{s.label}</p>
                </div>
              ))}
            </div>
            <button className="btn-secondary shrink-0" onClick={() => reportMutation.mutate()} disabled={reportMutation.isPending}>
              {reportMutation.isPending ? <Spinner className="h-4 w-4" /> : <BarChart3 className="h-4 w-4" />}
              Generate Report
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input type="search" placeholder="Search student…" className="input pl-9"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="input w-52" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="submitted">Submitted</option>
            <option value="evaluating">Evaluating</option>
            <option value="evaluated">Evaluated</option>
            <option value="similarity_review">Similarity Review</option>
            <option value="rejected">Rejected</option>
            <option value="resubmission_requested">Resubmission Requested</option>
          </select>
        </div>

        {/* Submissions */}
        {sLoading ? (
          <div className="flex justify-center py-12"><Spinner className="h-8 w-8" /></div>
        ) : submissions.length === 0 ? (
          <EmptyState icon={FileText} title="No submissions found" />
        ) : (
          <div className="space-y-2">
            {submissions.map((sub: any) => (
              <SubmissionRow
                key={sub.id}
                sub={sub}
                assignment={assignment}
                expanded={expandedId === sub.id}
                onToggle={() => setExpandedId(expandedId === sub.id ? null : sub.id)}
                onOverride={(s) => { setOverrideTarget(s); setOverrideScore(String(s.final_score ?? s.ai_score ?? 0)); setOverrideRemark('') }}
                onAccept={(id) => acceptMutation.mutate(id)}
                onReview={(s, action) => { setReviewTarget(s); setReviewAction(action); setRejectReason(''); setResubDays('3') }}
                onReEvaluate={(id) => reEvalMutation.mutate(id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Override Modal */}
      <Modal open={!!overrideTarget} onClose={() => setOverrideTarget(null)} title="Override Marks">
        {overrideTarget && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">AI Score: <strong>{overrideTarget.ai_score ?? '—'}</strong> / {assignment.max_marks}</p>
            <div>
              <label className="label">Revised Score (0–{assignment.max_marks})</label>
              <input type="number" className="input" min={0} max={assignment.max_marks}
                value={overrideScore} onChange={e => setOverrideScore(e.target.value)} />
            </div>
            <div>
              <label className="label">Remark (required)</label>
              <textarea className="input min-h-[80px] resize-y"
                placeholder="Reason for override…" value={overrideRemark}
                onChange={e => setOverrideRemark(e.target.value)} />
            </div>
            <div className="flex justify-end gap-3">
              <button className="btn-secondary" onClick={() => setOverrideTarget(null)}>Cancel</button>
              <button className="btn-primary" disabled={!overrideRemark.trim() || overrideMutation.isPending}
                onClick={() => overrideMutation.mutate()}>
                {overrideMutation.isPending && <Spinner className="h-4 w-4" />} Save
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
              <p className="font-medium text-orange-800">Similarity: {((reviewTarget.similarity_score ?? 0) * 100).toFixed(1)}%</p>
              <p className="text-xs text-orange-600 mt-0.5">Student: {reviewTarget.student_name}</p>
            </div>
            {reviewAction === 'reject' && (
              <>
                <div>
                  <label className="label">Rejection Reason</label>
                  <textarea className="input min-h-[80px] resize-y"
                    placeholder="Explain rejection…" value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)} />
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
                disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate()}>
                {reviewMutation.isPending && <Spinner className="h-4 w-4" />}
                {reviewAction === 'accept' ? 'Accept' : 'Reject'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function SubmissionRow({ sub, assignment, expanded, onToggle, onOverride, onAccept, onReview, onReEvaluate }: {
  sub: any
  assignment: Assignment
  expanded: boolean
  onToggle: () => void
  onOverride: (s: any) => void
  onAccept: (id: string) => void
  onReview: (s: any, action: 'accept' | 'reject') => void
  onReEvaluate: (id: string) => void
}) {
  const scoreDisplay = sub.final_score != null
    ? `${sub.final_score}/${assignment.max_marks}`
    : sub.ai_score != null
    ? `${sub.ai_score}/${assignment.max_marks} (AI)`
    : '—'

  return (
    <div className="card p-0 overflow-hidden">
      <div className="flex items-center gap-4 px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 text-primary-700 text-sm font-bold shrink-0">
          {(sub.student_name || '?').charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-gray-900 text-sm">{sub.student_name}</span>
            <span className="text-xs text-gray-400">{sub.student_roll}</span>
            <Badge status={sub.status} />
            {sub.is_resubmission && <span className="badge bg-purple-100 text-purple-700">Resubmission</span>}
            {sub.submission_type && <span className="badge bg-gray-100 text-gray-600 capitalize">{sub.submission_type}</span>}
          </div>
          <div className="flex gap-3 mt-0.5 text-xs text-gray-400">
            <span>{formatRelative(sub.submitted_at)}</span>
            <span className="font-medium text-gray-700">{scoreDisplay}</span>
            {sub.similarity_score != null && sub.similarity_score > 0 && (
              <span className={sub.similarity_score >= 0.95 ? 'text-red-600 font-medium' : 'text-orange-500'}>
                {(sub.similarity_score * 100).toFixed(1)}% similar
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {sub.status === 'similarity_review' && (
            <>
              <button className="btn-primary text-xs px-3 py-1.5" onClick={() => onReview(sub, 'accept')}>
                <CheckCircle className="h-3.5 w-3.5" /> Accept
              </button>
              <button className="btn-danger text-xs px-3 py-1.5" onClick={() => onReview(sub, 'reject')}>
                <AlertTriangle className="h-3.5 w-3.5" /> Reject
              </button>
            </>
          )}
          {sub.status === 'evaluated' && (
            <>
              <button className="btn-primary text-xs px-3 py-1.5" onClick={() => onAccept(sub.id)}>
                <CheckCircle className="h-3.5 w-3.5" /> Publish
              </button>
              <button className="btn-secondary text-xs px-3 py-1.5" onClick={() => onOverride(sub)}>Override</button>
              <button className="btn-secondary text-xs px-2 py-1.5" onClick={() => onReEvaluate(sub.id)} title="Re-evaluate">
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          {sub.file_url && (
            <a href={sub.file_url} target="_blank" rel="noopener noreferrer"
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              title="Download submission">
              <Download className="h-4 w-4" />
            </a>
          )}
          <button onClick={onToggle} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 transition-colors"
            aria-expanded={expanded}>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-4 space-y-3">
          {sub.has_evaluation ? <EvaluationPanel submissionId={sub.id} /> : (
            <p className="text-sm text-gray-400 text-center py-4">
              {sub.status === 'evaluating' ? 'Evaluation in progress…' : 'No evaluation report yet.'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function EvaluationPanel({ submissionId }: { submissionId: string }) {
  const { data: report, isLoading } = useQuery({
    queryKey: ['eval', submissionId],
    queryFn: async () => (await api.get(`/submissions/${submissionId}/evaluation`)).data as EvaluationReport & {
      percentage?: number; grade?: string; missing_points?: string; suggestions?: string;
      overall_feedback?: string; rubric_breakdown?: Record<string, { max_score: number; obtained_score: number; comment: string }>
    },
  })

  if (isLoading) return <div className="flex justify-center py-4"><Spinner /></div>
  if (!report) return <p className="text-sm text-gray-400 text-center py-4">No report available.</p>

  const rubricEntries = Object.entries(report.rubric_breakdown ?? {})

  return (
    <div className="space-y-3">
      {/* Score + Grade */}
      <div className="flex items-center gap-4 rounded-lg bg-white border border-gray-200 p-3">
        <div className="text-center">
          <p className="text-2xl font-bold text-gray-900">{report.ai_score}</p>
          <p className="text-xs text-gray-400">AI Score</p>
        </div>
        {report.percentage != null && (
          <div className="text-center">
            <p className="text-2xl font-bold text-primary-600">{report.percentage}%</p>
            <p className="text-xs text-gray-400">Percentage</p>
          </div>
        )}
        {report.grade && (
          <div className="text-center">
            <p className={cn('text-2xl font-bold',
              report.grade.startsWith('A') ? 'text-green-600' :
              report.grade.startsWith('B') ? 'text-blue-600' :
              report.grade === 'C' ? 'text-yellow-600' : 'text-red-600'
            )}>{report.grade}</p>
            <p className="text-xs text-gray-400">Grade</p>
          </div>
        )}
        {/* Progress bar */}
        {report.percentage != null && (
          <div className="flex-1">
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
              <div className={cn('h-full rounded-full transition-all',
                report.percentage >= 70 ? 'bg-green-500' :
                report.percentage >= 50 ? 'bg-yellow-500' : 'bg-red-500'
              )} style={{ width: `${report.percentage}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Rubric breakdown */}
      {rubricEntries.length > 0 && (
        <div className="rounded-lg bg-white border border-gray-200 p-3">
          <p className="text-xs font-semibold text-gray-600 mb-2">Rubric Breakdown</p>
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

      <div className="grid sm:grid-cols-2 gap-3">
        {report.strengths && (
          <div className="rounded-lg bg-green-50 border border-green-100 p-3">
            <p className="text-xs font-semibold text-green-700 mb-1">Strengths</p>
            <p className="text-sm text-green-800">{report.strengths}</p>
          </div>
        )}
        {report.areas_of_improvement && (
          <div className="rounded-lg bg-amber-50 border border-amber-100 p-3">
            <p className="text-xs font-semibold text-amber-700 mb-1">Areas to Improve</p>
            <p className="text-sm text-amber-800">{report.areas_of_improvement}</p>
          </div>
        )}
        {report.missing_points && (
          <div className="rounded-lg bg-red-50 border border-red-100 p-3">
            <p className="text-xs font-semibold text-red-700 mb-1">Missing Points</p>
            <p className="text-sm text-red-800">{report.missing_points}</p>
          </div>
        )}
        {report.suggestions && (
          <div className="rounded-lg bg-blue-50 border border-blue-100 p-3">
            <p className="text-xs font-semibold text-blue-700 mb-1">Suggestions</p>
            <p className="text-sm text-blue-800">{report.suggestions}</p>
          </div>
        )}
      </div>

      {report.overall_feedback && (
        <div className="rounded-lg bg-white border border-gray-200 p-3">
          <p className="text-xs font-semibold text-gray-600 mb-1">Overall Feedback</p>
          <p className="text-sm text-gray-700 whitespace-pre-line">{report.overall_feedback}</p>
        </div>
      )}
    </div>
  )
}
