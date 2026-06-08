import { useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, FileText, Clock, Hash, CheckCircle, AlertTriangle, X, Type } from 'lucide-react'
import toast from 'react-hot-toast'
import { TopBar } from '../../components/layout/TopBar'
import { Badge } from '../../components/ui/Badge'
import { Spinner } from '../../components/ui/Spinner'
import api from '../../lib/api'
import type { Assignment } from '../../types'
import { formatDateTime, isDeadlinePast } from '../../lib/utils'
import { cn } from '../../lib/utils'

type SubmitMode = 'pdf' | 'text'

export default function AssignmentSubmitPage() {
  const { assignmentId } = useParams<{ assignmentId: string }>()
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<SubmitMode>('pdf')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [textContent, setTextContent] = useState('')
  const [dragOver, setDragOver] = useState(false)

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
  })

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
      <TopBar title={assignment.title} subtitle="View and submit your assignment" />
      <div className="p-6 space-y-5 max-w-3xl">

        {/* Assignment info */}
        <div className="card space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{assignment.title}</h2>
              <div className="flex gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{past ? 'Ended' : 'Due'} {formatDateTime(assignment.deadline)}</span>
                <span className="flex items-center gap-1"><Hash className="h-3.5 w-3.5" />{assignment.max_marks} marks</span>
              </div>
            </div>
            <Badge status={past ? 'closed' : 'active'} label={past ? 'Closed' : 'Active'} />
          </div>

          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">Description</p>
            <p className="text-sm text-gray-700 whitespace-pre-line">{assignment.description}</p>
          </div>

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

        {/* Existing submission result */}
        {!sLoading && submission && <SubmissionResult submission={submission} assignment={assignment} />}

        {/* Submit area */}
        {canSubmit && (
          <div className="card space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">
              {submission ? 'Resubmit' : 'Submit Your Answer'}
            </h3>

            {canResubmit && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm">
                <p className="font-medium text-amber-800 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />Resubmission required
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

            {/* PDF Upload */}
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
                    className="hidden" onChange={handleFileChange} aria-hidden="true" />
                  {selectedFile ? (
                    <div className="flex items-center justify-center gap-3">
                      <CheckCircle className="h-6 w-6 text-green-500 shrink-0" />
                      <div className="text-left">
                        <p className="text-sm font-medium text-gray-900">{selectedFile.name}</p>
                        <p className="text-xs text-gray-400">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                      <button type="button"
                        onClick={e => { e.stopPropagation(); setSelectedFile(null) }}
                        className="ml-2 rounded-full p-1 text-gray-400 hover:bg-gray-200"
                        aria-label="Remove file">
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

            {/* Text submission */}
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

function SubmissionResult({ submission, assignment }: { submission: any; assignment: Assignment }) {
  const finalScore = submission.final_score ?? submission.ai_score
  const isEvaluated = submission.status === 'evaluated'
  const isPending = ['submitted', 'evaluating'].includes(submission.status)

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
          Evaluation in progress — check back soon.
        </div>
      )}

      {/* Show download link for submitted PDF */}
      {submission.submission_type === 'pdf' && submission.file_url && (
        <a href={submission.file_url} target="_blank" rel="noopener noreferrer"
          className="btn-secondary inline-flex text-sm">
          <FileText className="h-4 w-4" />
          Download Submitted PDF ({submission.file_name ?? 'submission.pdf'})
        </a>
      )}

      {/* Show submitted text content */}
      {submission.submission_type === 'text' && submission.text_content && (
        <div className="rounded-lg bg-gray-50 border border-gray-200 p-4">
          <p className="text-xs font-semibold text-gray-500 mb-2">Your Submitted Answer</p>
          <p className="text-sm text-gray-700 whitespace-pre-line font-mono">{submission.text_content}</p>
        </div>
      )}

      {isEvaluated && finalScore != null && (
        <>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-4xl font-bold text-gray-900">{finalScore}</p>
              <p className="text-sm text-gray-400">/ {assignment.max_marks}</p>
            </div>
            <div className="flex-1">
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={cn('h-full rounded-full',
                    finalScore / assignment.max_marks >= 0.7 ? 'bg-green-500' :
                    finalScore / assignment.max_marks >= 0.5 ? 'bg-yellow-500' : 'bg-red-500'
                  )}
                  style={{ width: `${(finalScore / assignment.max_marks) * 100}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-gray-400 text-right">
                {((finalScore / assignment.max_marks) * 100).toFixed(1)}%
              </p>
            </div>
          </div>

          {submission.strengths && (
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="rounded-xl bg-green-50 border border-green-100 p-4">
                <p className="text-xs font-semibold text-green-700 mb-1.5">Strengths</p>
                <p className="text-sm text-green-800">{submission.strengths}</p>
              </div>
              <div className="rounded-xl bg-amber-50 border border-amber-100 p-4">
                <p className="text-xs font-semibold text-amber-700 mb-1.5">Areas to Improve</p>
                <p className="text-sm text-amber-800">{submission.areas_of_improvement}</p>
              </div>
            </div>
          )}

          {submission.detailed_feedback && (
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-600 mb-1.5">Detailed Feedback</p>
              <p className="text-sm text-gray-700 whitespace-pre-line">{submission.detailed_feedback}</p>
            </div>
          )}

          {submission.professor_remark && (
            <div className="rounded-xl bg-blue-50 border border-blue-100 p-4">
              <p className="text-xs font-semibold text-blue-700 mb-1.5">Professor's Remark</p>
              <p className="text-sm text-blue-800">{submission.professor_remark}</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
