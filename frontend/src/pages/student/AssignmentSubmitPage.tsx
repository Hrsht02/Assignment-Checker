import { useState, useRef, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, FileText, Clock, Hash, CheckCircle, AlertTriangle, X, Type, Timer, Download } from 'lucide-react'
import toast from 'react-hot-toast'
import { TopBar } from '../../components/layout/TopBar'
import { Badge } from '../../components/ui/Badge'
import { Spinner } from '../../components/ui/Spinner'
import api from '../../lib/api'
import type { Assignment } from '../../types'
import { formatDateTime, isDeadlinePast } from '../../lib/utils'
import { cn } from '../../lib/utils'

type SubmitMode = 'pdf' | 'text'

// ── Countdown hook ────────────────────────────────────────────────────────────

function useCountdown(deadline: string | undefined) {
  const [remaining, setRemaining] = useState('')
  const [urgent, setUrgent] = useState(false)

  useEffect(() => {
    if (!deadline) return
    const update = () => {
      const diff = new Date(deadline).getTime() - Date.now()
      if (diff <= 0) { setRemaining('Deadline passed'); setUrgent(true); return }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setUrgent(diff < 3600000) // urgent if < 1 hour
      if (h > 24) {
        const d = Math.floor(h / 24)
        setRemaining(`${d}d ${h % 24}h remaining`)
      } else if (h > 0) {
        setRemaining(`${h}h ${m}m ${s}s remaining`)
      } else {
        setRemaining(`${m}m ${s}s remaining`)
      }
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [deadline])

  return { remaining, urgent }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AssignmentSubmitPage() {
  const { assignmentId } = useParams<{ assignmentId: string }>()
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<SubmitMode>('pdf')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [textContent, setTextContent] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [showRubric, setShowRubric] = useState(false)

  const { data: assignment, isLoading: aLoading } = useQuery({
    queryKey: ['assignment', assignmentId],
    queryFn: async () => (await api.get(`/assignments/${assignmentId}`)).data as Assignment,
    enabled: !!assignmentId,
  })

  const { data: submission, isLoading: sLoading } = useQuery({
    queryKey: ['my-submission', assignmentId],
    queryFn: async () => (await api.get(`/submissions/my/${assignmentId}`)).data,
    enabled: !!assignmentId,
    retry: false,
    refetchInterval: 15_000,   // always poll every 15s while page is open
  })

  const { remaining, urgent } = useCountdown(assignment?.deadline)

  const pdfMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append('file', file)
      return api.post(`/submissions/assignments/${assignmentId}/pdf`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    },
    onSuccess: () => {
      toast.success('Assignment submitted!')
      qc.invalidateQueries({ queryKey: ['my-submission', assignmentId] })
      qc.invalidateQueries({ queryKey: ['student-dashboard'] })
      qc.invalidateQueries({ queryKey: ['student-stats'] })
      setSelectedFile(null)
    },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Submission failed'),
  })

  const textMutation = useMutation({
    mutationFn: (text: string) =>
      api.post(`/submissions/assignments/${assignmentId}/text`, { text_content: text }),
    onSuccess: () => {
      toast.success('Assignment submitted!')
      qc.invalidateQueries({ queryKey: ['my-submission', assignmentId] })
      qc.invalidateQueries({ queryKey: ['student-dashboard'] })
      qc.invalidateQueries({ queryKey: ['student-stats'] })
      setTextContent('')
    },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Submission failed'),
  })

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file?.type === 'application/pdf') setSelectedFile(file)
    else toast.error('Only PDF files are accepted')
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.type !== 'application/pdf') { toast.error('Only PDF files accepted'); return }
    if (file.size > 20 * 1024 * 1024) { toast.error('File must be under 20 MB'); return }
    setSelectedFile(file)
  }

  const past = assignment ? isDeadlinePast(assignment.deadline) : false
  const canResubmit = submission?.status === 'resubmission_requested' &&
    submission?.resubmission_deadline && !isDeadlinePast(submission.resubmission_deadline)
  const canSubmit = !past || canResubmit

  if (aLoading) return <div className="flex justify-center py-12"><Spinner className="h-8 w-8" /></div>
  if (!assignment) return null

  return (
    <div>
      <TopBar title={assignment.title} subtitle="Assignment details and submission" />
      <div className="p-6 space-y-5 max-w-3xl">

        {/* Assignment info */}
        <div className="card space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-gray-900">{assignment.title}</h2>
              <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-400">
                <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{past ? 'Ended' : 'Due'} {formatDateTime(assignment.deadline)}</span>
                <span className="flex items-center gap-1"><Hash className="h-3.5 w-3.5" />{assignment.max_marks} marks</span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Badge status={past ? 'closed' : 'active'} label={past ? 'Closed' : 'Active'} />
              {!past && remaining && (
                <div className={cn(
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold',
                  urgent ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-blue-50 text-blue-700 border border-blue-100'
                )}>
                  <Timer className="h-3.5 w-3.5 shrink-0" />
                  {remaining}
                </div>
              )}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">Description</p>
            <p className="text-sm text-gray-700 whitespace-pre-line">{assignment.description}</p>
          </div>

          {/* Rubric toggle */}
          {assignment.rubric && (
            <div>
              <button
                onClick={() => setShowRubric(r => !r)}
                className="text-xs font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1"
              >
                {showRubric ? '▼' : '▶'} View Evaluation Rubric
              </button>
              {showRubric && (
                <div className="mt-2 rounded-lg bg-primary-50 border border-primary-100 p-4 text-sm text-primary-800 whitespace-pre-line">
                  {assignment.rubric}
                </div>
              )}
            </div>
          )}

          {assignment.question_text && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Questions</p>
              <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 text-sm text-gray-700 whitespace-pre-line">
                {assignment.question_text}
              </div>
            </div>
          )}

          {assignment.question_pdf_url && (
            <a href={assignment.question_pdf_url} target="_blank" rel="noopener noreferrer" className="btn-secondary inline-flex">
              <FileText className="h-4 w-4" /> View Question Paper (PDF)
            </a>
          )}
        </div>

        {/* Existing submission */}
        {!sLoading && submission && <SubmissionResult submission={submission} assignment={assignment} />}

        {/* Submit area */}
        {canSubmit && (
          <div className="card space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">
              {submission ? 'Resubmit Assignment' : 'Submit Your Answer'}
            </h3>

            {canResubmit && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm">
                <p className="font-medium text-amber-800 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />Resubmission Required
                </p>
                <p className="text-amber-700 mt-1">{submission.rejection_reason}</p>
                <p className="text-xs text-amber-600 mt-1">
                  Resubmit by: {formatDateTime(submission.resubmission_deadline)}
                </p>
              </div>
            )}

            {/* Mode toggle */}
            <div className="flex gap-1 rounded-xl bg-gray-100 p-1 w-fit">
              {(['pdf', 'text'] as SubmitMode[]).map(m => (
                <button key={m} onClick={() => setMode(m)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all',
                    mode === m ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  )}>
                  {m === 'pdf' ? <Upload className="h-3.5 w-3.5" /> : <Type className="h-3.5 w-3.5" />}
                  {m === 'pdf' ? 'Upload PDF' : 'Type Answer'}
                </button>
              ))}
            </div>

            {mode === 'pdf' && (
              <>
                <div
                  className={cn(
                    'relative rounded-xl border-2 border-dashed transition-colors cursor-pointer p-8 text-center',
                    dragOver ? 'border-primary-400 bg-primary-50' :
                    selectedFile ? 'border-green-400 bg-green-50' :
                    'border-gray-200 bg-gray-50 hover:border-primary-300 hover:bg-primary-50'
                  )}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  role="button" tabIndex={0} aria-label="Upload PDF"
                  onKeyDown={e => e.key === 'Enter' && fileInputRef.current?.click()}
                >
                  <input ref={fileInputRef} type="file" accept="application/pdf"
                    className="hidden" onChange={handleFileChange} />
                  {selectedFile ? (
                    <div className="flex items-center justify-center gap-3">
                      <CheckCircle className="h-6 w-6 text-green-500 shrink-0" />
                      <div className="text-left">
                        <p className="text-sm font-medium text-gray-900">{selectedFile.name}</p>
                        <p className="text-xs text-gray-400">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                      <button type="button"
                        onClick={e => { e.stopPropagation(); setSelectedFile(null) }}
                        className="ml-2 rounded-full p-1 text-gray-400 hover:bg-gray-200">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Upload className="mx-auto h-8 w-8 text-gray-300" />
                      <p className="text-sm text-gray-500">
                        Drag & drop your PDF, or <span className="text-primary-600 font-medium">browse</span>
                      </p>
                      <p className="text-xs text-gray-400">PDF only · max 20 MB</p>
                    </div>
                  )}
                </div>
                <button className="btn-primary w-full py-2.5"
                  disabled={!selectedFile || pdfMutation.isPending}
                  onClick={() => selectedFile && pdfMutation.mutate(selectedFile)}>
                  {pdfMutation.isPending ? <><Spinner className="h-4 w-4" />Submitting…</> : <><Upload className="h-4 w-4" />Submit PDF</>}
                </button>
              </>
            )}

            {mode === 'text' && (
              <>
                <div>
                  <label className="label">Your Answer</label>
                  <textarea
                    className="input min-h-[240px] resize-y font-mono text-sm"
                    placeholder="Type your complete answer here…"
                    value={textContent}
                    onChange={e => setTextContent(e.target.value)}
                  />
                  <p className="mt-1 text-xs text-gray-400 text-right">{textContent.length} characters</p>
                </div>
                <button className="btn-primary w-full py-2.5"
                  disabled={!textContent.trim() || textMutation.isPending}
                  onClick={() => textMutation.mutate(textContent)}>
                  {textMutation.isPending ? <><Spinner className="h-4 w-4" />Submitting…</> : 'Submit Answer'}
                </button>
              </>
            )}
          </div>
        )}

        {past && !canResubmit && !submission && (
          <div className="card text-center py-8">
            <Clock className="mx-auto h-8 w-8 text-gray-300 mb-2" />
            <p className="text-sm text-gray-500">The submission deadline has passed.</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Submission Result Card ────────────────────────────────────────────────────

function SubmissionResult({ submission, assignment }: { submission: any; assignment: Assignment }) {
  const finalScore = submission.final_score ?? submission.ai_score
  const isEvaluated = submission.status === 'evaluated'
  const isPending = ['submitted', 'evaluating'].includes(submission.status)
  const isFlagged = submission.status === 'similarity_review'
  const pct = finalScore != null && assignment.max_marks > 0
    ? (finalScore / assignment.max_marks) * 100 : null

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Your Submission</h3>
        <div className="flex items-center gap-2">
          {submission.submission_type && (
            <span className="badge bg-gray-100 text-gray-600 capitalize">{submission.submission_type}</span>
          )}
          <Badge status={submission.status} />
        </div>
      </div>

      {isPending && (
        <div className="flex items-center gap-3 rounded-lg bg-blue-50 border border-blue-100 p-3 text-sm text-blue-700">
          <Spinner className="h-4 w-4 shrink-0" />
          AI evaluation in progress — this page refreshes automatically.
        </div>
      )}

      {isFlagged && (
        <div className="rounded-lg bg-orange-50 border border-orange-200 p-3 text-sm">
          <p className="font-medium text-orange-800 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />Under similarity review
          </p>
          <p className="text-orange-600 mt-1">
            Similarity score: {((submission.similarity_score ?? 0) * 100).toFixed(1)}%
          </p>
        </div>
      )}

      {/* Download submitted file */}
      {submission.file_url && (
        <a href={submission.file_url} target="_blank" rel="noopener noreferrer"
          className="btn-secondary inline-flex text-sm">
          <Download className="h-4 w-4" />
          Download Submitted PDF ({submission.file_name ?? 'submission.pdf'})
        </a>
      )}

      {/* Submitted text preview */}
      {submission.text_content && (
        <div className="rounded-lg bg-gray-50 border border-gray-200 p-4">
          <p className="text-xs font-semibold text-gray-500 mb-2">Submitted Answer</p>
          <p className="text-sm text-gray-700 whitespace-pre-line line-clamp-6 font-mono">{submission.text_content}</p>
        </div>
      )}

      {isEvaluated && finalScore != null && (
        <>
          {/* Score */}
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-4xl font-bold text-gray-900">{finalScore}</p>
              <p className="text-sm text-gray-400">/ {assignment.max_marks}</p>
            </div>
            {submission.grade && (
              <div className={cn('flex h-14 w-14 items-center justify-center rounded-full border-2 text-xl font-bold shrink-0',
                submission.grade.startsWith('A') ? 'border-green-400 text-green-600' :
                submission.grade.startsWith('B') ? 'border-blue-400 text-blue-600' :
                submission.grade === 'C' ? 'border-yellow-400 text-yellow-600' : 'border-red-400 text-red-600'
              )}>{submission.grade}</div>
            )}
            {pct != null && (
              <div className="flex-1">
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div className={cn('h-full rounded-full',
                    pct >= 70 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                  )} style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-1 text-xs text-gray-400 text-right">{pct.toFixed(1)}%</p>
              </div>
            )}
          </div>

          {(submission.strengths || submission.areas_of_improvement) && (
            <div className="grid sm:grid-cols-2 gap-3">
              {submission.strengths && (
                <div className="rounded-xl bg-green-50 border border-green-100 p-4">
                  <p className="text-xs font-semibold text-green-700 mb-1.5">Strengths</p>
                  <p className="text-sm text-green-800">{submission.strengths}</p>
                </div>
              )}
              {submission.areas_of_improvement && (
                <div className="rounded-xl bg-amber-50 border border-amber-100 p-4">
                  <p className="text-xs font-semibold text-amber-700 mb-1.5">Areas to Improve</p>
                  <p className="text-sm text-amber-800">{submission.areas_of_improvement}</p>
                </div>
              )}
            </div>
          )}

          {submission.detailed_feedback && (
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-600 mb-1.5">Detailed Feedback</p>
              <p className="text-sm text-gray-700 whitespace-pre-line">{submission.detailed_feedback}</p>
            </div>
          )}

          {submission.professor_remark && (
            <div className="rounded-xl bg-primary-50 border border-primary-100 p-4">
              <p className="text-xs font-semibold text-primary-700 mb-1.5">Professor's Remark</p>
              <p className="text-sm text-primary-800">{submission.professor_remark}</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
