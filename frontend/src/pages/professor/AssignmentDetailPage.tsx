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
import type { Submission, Assignment, EvaluationReport } from '../../types'
import { formatDateTime, formatRelative } from '../../lib/utils'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const overrideSchema = z.object({
  revised_score: z.coerce.number().int().min(0),
  remark: z.string().min(1).max(500),
})
const reviewSchema = z.object({
  rejection_reason: z.string().optional(),
  resubmission_days: z.coerce.number().int().min(1).max(7).optional(),
})

export default function AssignmentDetailPage() {
  const { assignmentId } = useParams<{ assignmentId: string }>()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [overrideTarget, setOverrideTarget] = useState<Submission | null>(null)
  const [reviewTarget, setReviewTarget] = useState<Submission | null>(null)
  const [reviewAction, setReviewAction] = useState<'accept' | 'reject'>('accept')

  const { data: assignment, isLoading: aLoading } = useQuery({
    queryKey: ['assignment', assignmentId],
    queryFn: async () => {
      const res = await api.get(`/assignments/${assignmentId}`)
      return res.data as Assignment
    },
    enabled: !!assignmentId,
  })

  const { data: submissions = [], isLoading: sLoading } = useQuery({
    queryKey: ['submissions', assignmentId, search, statusFilter],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (search) params.student_name = search
      if (statusFilter) params.status = statusFilter
      const res = await api.get(`/submissions/assignments/${assignmentId}`, { params })
      return res.data as Submission[]
    },
    enabled: !!assignmentId,
  })

  const { register: regOverride, handleSubmit: handleOverride, reset: resetOverride, formState: { errors: overrideErrors } } =
    useForm({ resolver: zodResolver(overrideSchema) })
  const { register: regReview, handleSubmit: handleReview, reset: resetReview } =
    useForm({ resolver: zodResolver(reviewSchema) })

  const overrideMutation = useMutation({
    mutationFn: (data: { submission_id: string; revised_score: number; remark: string }) =>
      api.post(`/submissions/${data.submission_id}/override`, {
        revised_score: data.revised_score,
        remark: data.remark,
      }),
    onSuccess: () => {
      toast.success('Marks updated')
      qc.invalidateQueries({ queryKey: ['submissions', assignmentId] })
      setOverrideTarget(null)
      resetOverride()
    },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Failed'),
  })

  const acceptMarksMutation = useMutation({
    mutationFn: (subId: string) => api.post(`/submissions/${subId}/accept-marks`),
    onSuccess: () => {
      toast.success('Marks published to student')
      qc.invalidateQueries({ queryKey: ['submissions', assignmentId] })
    },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Failed'),
  })

  const reviewMutation = useMutation({
    mutationFn: (data: { submission_id: string; action: string; rejection_reason?: string; resubmission_days?: number }) =>
      api.post(`/submissions/${data.submission_id}/review`, {
        action: data.action,
        rejection_reason: data.rejection_reason,
        resubmission_days: data.resubmission_days,
      }),
    onSuccess: () => {
      toast.success('Review submitted')
      qc.invalidateQueries({ queryKey: ['submissions', assignmentId] })
      setReviewTarget(null)
      resetReview()
    },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Failed'),
  })

  const reEvaluateMutation = useMutation({
    mutationFn: (subId: string) => api.post(`/submissions/${subId}/re-evaluate`),
    onSuccess: () => {
      toast.success('Re-evaluation triggered')
      qc.invalidateQueries({ queryKey: ['submissions', assignmentId] })
    },
  })

  const generateReport = useMutation({
    mutationFn: () => api.post(`/professor/reports/${assignmentId}/generate`),
    onSuccess: () => toast.success('Report generation started'),
  })

  if (aLoading) return <div className="flex justify-center py-12"><Spinner className="h-8 w-8" /></div>
  if (!assignment) return null

  return (
    <div>
      <TopBar title={assignment.title} subtitle={`${submissions.length} submissions`} />
      <div className="p-6 space-y-4">
        {/* Assignment summary */}
        <div className="card">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-semibold text-gray-900">{assignment.title}</h2>
                <Badge status={new Date(assignment.deadline) < new Date() ? 'closed' : 'active'}
                  label={new Date(assignment.deadline) < new Date() ? 'Closed' : 'Active'} />
              </div>
              <p className="text-sm text-gray-500">{assignment.description}</p>
              <p className="text-xs text-gray-400">
                Deadline: {formatDateTime(assignment.deadline)} · Max {assignment.max_marks} marks
              </p>
            </div>
            <button className="btn-secondary" onClick={() => generateReport.mutate()} disabled={generateReport.isPending}>
              {generateReport.isPending ? <Spinner className="h-4 w-4" /> : <BarChart3 className="h-4 w-4" />}
              Generate Report
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input type="search" placeholder="Search student…" className="input pl-9"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="input w-48" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status">
            <option value="">All statuses</option>
            <option value="submitted">Submitted</option>
            <option value="evaluating">Evaluating</option>
            <option value="evaluated">Evaluated</option>
            <option value="similarity_review">Similarity Review</option>
            <option value="rejected">Rejected</option>
            <option value="resubmission_requested">Resubmission Requested</option>
          </select>
        </div>

        {/* Submissions list */}
        {sLoading ? (
          <div className="flex justify-center py-12"><Spinner className="h-8 w-8" /></div>
        ) : submissions.length === 0 ? (
          <EmptyState icon={FileText} title="No submissions found" description="No submissions match the current filters." />
        ) : (
          <div className="space-y-2">
            {submissions.map((sub) => (
              <SubmissionRow
                key={sub.id}
                sub={sub}
                assignment={assignment}
                expanded={expandedId === sub.id}
                onToggle={() => setExpandedId(expandedId === sub.id ? null : sub.id)}
                onOverride={(s) => { setOverrideTarget(s); resetOverride({ revised_score: s.final_score ?? s.ai_score ?? 0 } as any) }}
                onAccept={(id) => acceptMarksMutation.mutate(id)}
                onReview={(s, action) => { setReviewTarget(s); setReviewAction(action) }}
                onReEvaluate={(id) => reEvaluateMutation.mutate(id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Override Modal */}
      <Modal open={!!overrideTarget} onClose={() => { setOverrideTarget(null); resetOverride() }}
        title="Override Marks">
        {overrideTarget && (
          <form onSubmit={handleOverride((d: any) => overrideMutation.mutate({
            submission_id: overrideTarget.id,
            revised_score: d.revised_score,
            remark: d.remark,
          }))} className="space-y-4" noValidate>
            <p className="text-sm text-gray-500">
              AI Score: <strong>{overrideTarget.ai_score ?? '—'}</strong> / {assignment.max_marks}
            </p>
            <div>
              <label className="label">Revised Score (0–{assignment.max_marks})</label>
              <input type="number" className="input" min={0} max={assignment.max_marks}
                {...regOverride('revised_score')} />
              {overrideErrors.revised_score && (
                <p className="mt-1 text-xs text-red-600">{overrideErrors.revised_score.message as string}</p>
              )}
            </div>
            <div>
              <label className="label">Remark (required)</label>
              <textarea className="input min-h-[80px] resize-y"
                placeholder="Explain the reason for the override…" {...regOverride('remark')} />
              {overrideErrors.remark && (
                <p className="mt-1 text-xs text-red-600">{overrideErrors.remark.message as string}</p>
              )}
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" className="btn-secondary" onClick={() => { setOverrideTarget(null); resetOverride() }}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={overrideMutation.isPending}>
                {overrideMutation.isPending && <Spinner className="h-4 w-4" />}
                Save Override
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Plagiarism Review Modal */}
      <Modal open={!!reviewTarget} onClose={() => { setReviewTarget(null); resetReview() }}
        title={reviewAction === 'accept' ? 'Accept Submission' : 'Reject Submission'}>
        {reviewTarget && (
          <form onSubmit={handleReview((d: any) => reviewMutation.mutate({
            submission_id: reviewTarget.id,
            action: reviewAction,
            rejection_reason: d.rejection_reason,
            resubmission_days: d.resubmission_days,
          }))} className="space-y-4" noValidate>
            <div className="rounded-lg bg-orange-50 border border-orange-100 p-3 text-sm">
              <p className="font-medium text-orange-800">Similarity Score: {((reviewTarget.similarity_score ?? 0) * 100).toFixed(1)}%</p>
              <p className="text-orange-600 text-xs mt-0.5">Student: {reviewTarget.student_name}</p>
            </div>
            {reviewAction === 'reject' && (
              <>
                <div>
                  <label className="label">Rejection Reason</label>
                  <textarea className="input min-h-[80px] resize-y"
                    placeholder="Explain why the submission is being rejected…"
                    {...regReview('rejection_reason')} />
                </div>
                <div>
                  <label className="label">Resubmission Window (days, 1–7)</label>
                  <input type="number" className="input" min={1} max={7} defaultValue={3}
                    {...regReview('resubmission_days')} />
                </div>
              </>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" className="btn-secondary" onClick={() => { setReviewTarget(null); resetReview() }}>Cancel</button>
              <button type="submit"
                className={reviewAction === 'accept' ? 'btn-primary' : 'btn-danger'}
                disabled={reviewMutation.isPending}>
                {reviewMutation.isPending && <Spinner className="h-4 w-4" />}
                {reviewAction === 'accept' ? 'Accept' : 'Reject'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}

// ── Submission Row ────────────────────────────────────────────────────────────

interface SubmissionRowProps {
  sub: Submission
  assignment: Assignment
  expanded: boolean
  onToggle: () => void
  onOverride: (s: Submission) => void
  onAccept: (id: string) => void
  onReview: (s: Submission, action: 'accept' | 'reject') => void
  onReEvaluate: (id: string) => void
}

function SubmissionRow({ sub, assignment, expanded, onToggle, onOverride, onAccept, onReview, onReEvaluate }: SubmissionRowProps) {
  const scoreDisplay = sub.final_score != null
    ? `${sub.final_score}/${assignment.max_marks}`
    : sub.ai_score != null
      ? `${sub.ai_score}/${assignment.max_marks} (AI)`
      : '—'

  return (
    <div className="card p-0 overflow-hidden">
      {/* Row header */}
      <div className="flex items-center gap-4 px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 text-primary-700 text-sm font-bold shrink-0">
          {sub.student_name?.charAt(0).toUpperCase() ?? '?'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-gray-900 text-sm">{sub.student_name}</span>
            <span className="text-xs text-gray-400">{sub.student_roll_number}</span>
            <Badge status={sub.status} />
            {sub.is_resubmission && (
              <span className="badge bg-purple-100 text-purple-700">Resubmission</span>
            )}
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

        {/* Action buttons */}
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
              <button className="btn-secondary text-xs px-3 py-1.5" onClick={() => onOverride(sub)}>
                Override
              </button>
              <button className="btn-secondary text-xs px-3 py-1.5" onClick={() => onReEvaluate(sub.id)}>
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          <a href={sub.file_url} target="_blank" rel="noopener noreferrer"
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            aria-label="Download submission">
            <Download className="h-4 w-4" />
          </a>
          <button onClick={onToggle} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            aria-label={expanded ? 'Collapse' : 'Expand'} aria-expanded={expanded}>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Expanded evaluation */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-4 space-y-3">
          {sub.has_evaluation ? (
            <EvaluationPanel submissionId={sub.id} />
          ) : (
            <p className="text-sm text-gray-400 text-center py-4">
              {sub.status === 'evaluating' ? 'Evaluation in progress…' : 'No evaluation report yet.'}
            </p>
          )}
          {sub.similarity_score != null && sub.similarity_score > 0 && (
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm">
              <p className="font-medium text-orange-800">Similarity: {(sub.similarity_score * 100).toFixed(1)}%</p>
              {sub.rejection_reason && <p className="text-xs text-orange-600 mt-1">{sub.rejection_reason}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function EvaluationPanel({ submissionId }: { submissionId: string }) {
  const { data: report, isLoading } = useQuery({
    queryKey: ['evaluation-report', submissionId],
    queryFn: async () => {
      const res = await api.get(`/submissions/${submissionId}/evaluation`)
      return res.data as EvaluationReport
    },
  })

  if (isLoading) return <div className="flex justify-center py-4"><Spinner /></div>
  if (!report) return <p className="text-sm text-gray-400 text-center py-4">No report available.</p>

  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="rounded-lg bg-green-50 border border-green-100 p-3">
          <p className="text-xs font-semibold text-green-700 mb-1">Strengths</p>
          <p className="text-sm text-green-800">{report.strengths}</p>
        </div>
        <div className="rounded-lg bg-amber-50 border border-amber-100 p-3">
          <p className="text-xs font-semibold text-amber-700 mb-1">Areas of Improvement</p>
          <p className="text-sm text-amber-800">{report.areas_of_improvement}</p>
        </div>
      </div>
      <div className="rounded-lg bg-white border border-gray-200 p-3">
        <p className="text-xs font-semibold text-gray-600 mb-1">Detailed Feedback</p>
        <p className="text-sm text-gray-700 whitespace-pre-line">{report.detailed_feedback}</p>
      </div>
    </div>
  )
}
