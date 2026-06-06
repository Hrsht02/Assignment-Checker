import { useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, FileText, Clock, Hash, CheckCircle, AlertTriangle, RefreshCw, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { TopBar } from '../../components/layout/TopBar'
import { Badge } from '../../components/ui/Badge'
import { Spinner } from '../../components/ui/Spinner'
import api from '../../lib/api'
import type { Assignment } from '../../types'
import { formatDateTime, isDeadlinePast } from '../../lib/utils'

export default function AssignmentSubmitPage() {
  const { assignmentId } = useParams<{ assignmentId: string }>()
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const { data: assignment, isLoading: aLoading } = useQuery({
    queryKey: ['assignment', assignmentId],
    queryFn: async () => {
      const res = await api.get(`/assignments/${assignmentId}`)
      return res.data as Assignment
    },
    enabled: !!assignmentId,
  })

  const { data: submission, isLoading: sLoading } = useQuery({
    queryKey: ['my-submission', assignmentId],
    queryFn: async () => {
      const res = await api.get(`/submissions/my/${assignmentId}`)
      return res.data
    },
    enabled: !!assignmentId,
    retry: false,
  })

  const submitMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append('file', file)
      return api.post(`/submissions/assignments/${assignmentId}`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    },
    onSuccess: () => {
      toast.success('Assignment submitted successfully!')
      qc.invalidateQueries({ queryKey: ['my-submission', assignmentId] })
      qc.invalidateQueries({ queryKey: ['student-dashboard'] })
      setSelectedFile(null)
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.detail ?? 'Submission failed')
    },
  })

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file?.type === 'application/pdf') {
      setSelectedFile(file)
    } else {
      toast.error('Only PDF files are accepted')
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.type !== 'application/pdf') {
      toast.error('Only PDF files are accepted')
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error('File must be under 20 MB')
      return
    }
    setSelectedFile(file)
  }

  const deadline = assignment ? new Date(assignment.deadline) : null
  const past = deadline ? isDeadlinePast(assignment!.deadline) : false
  const canResubmit = submission?.status === 'resubmission_requested' &&
    submission?.resubmission_deadline &&
    !isDeadlinePast(submission.resubmission_deadline)
  const canSubmit = !past || canResubmit

  if (aLoading) return <div className="flex justify-center py-12"><Spinner className="h-8 w-8" /></div>
  if (!assignment) return null

  return (
    <div>
      <TopBar title={assignment.title} subtitle="Assignment details and submission" />
      <div className="p-6 space-y-5 max-w-3xl">
        {/* Assignment info card */}
        <div className="card space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{assignment.title}</h2>
              <div className="flex gap-3 mt-1 text-xs text-gray-400">
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {past ? 'Ended' : 'Due'} {formatDateTime(assignment.deadline)}
                </span>
                <span className="flex items-center gap-1">
                  <Hash className="h-3.5 w-3.5" />
                  {assignment.max_marks} marks
                </span>
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
            <a href={assignment.question_pdf_url} target="_blank" rel="noopener noreferrer"
              className="btn-secondary inline-flex">
              <FileText className="h-4 w-4" /> View Question Paper (PDF)
            </a>
          )}
        </div>

        {/* Existing submission result */}
        {!sLoading && submission && (
          <SubmissionResult submission={submission} assignment={assignment} canResubmit={!!canResubmit} />
        )}

        {/* Upload area */}
        {canSubmit && (
          <div className="card space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">
              {submission ? 'Resubmit Assignment' : 'Submit Assignment'}
            </h3>

            {canResubmit && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm">
                <p className="font-medium text-amber-800 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Resubmission required
                </p>
                <p className="text-amber-700 mt-1">{submission.rejection_reason}</p>
                <p className="text-xs text-amber-600 mt-1">
                  Resubmit by: {formatDateTime(submission.resubmission_deadline)}
                </p>
              </div>
            )}

            {/* Drop zone */}
            <div
              className={`relative rounded-xl border-2 border-dashed transition-colors cursor-pointer ${
                dragOver
                  ? 'border-primary-400 bg-primary-50'
                  : selectedFile
                  ? 'border-green-400 bg-green-50'
                  : 'border-gray-200 bg-gray-50 hover:border-primary-300 hover:bg-primary-50'
              } p-8 text-center`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              role="button"
              aria-label="Upload PDF"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={handleFileChange}
                aria-hidden="true"
              />

              {selectedFile ? (
                <div className="flex items-center justify-center gap-3">
                  <CheckCircle className="h-6 w-6 text-green-500 shrink-0" />
                  <div className="text-left">
                    <p className="text-sm font-medium text-gray-900">{selectedFile.name}</p>
                    <p className="text-xs text-gray-400">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setSelectedFile(null) }}
                    className="ml-2 rounded-full p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                    aria-label="Remove file"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="mx-auto h-8 w-8 text-gray-300" />
                  <p className="text-sm text-gray-500">
                    Drag & drop your PDF here, or <span className="text-primary-600 font-medium">browse</span>
                  </p>
                  <p className="text-xs text-gray-400">PDF only · max 20 MB</p>
                </div>
              )}
            </div>

            <button
              className="btn-primary w-full py-2.5"
              disabled={!selectedFile || submitMutation.isPending}
              onClick={() => selectedFile && submitMutation.mutate(selectedFile)}
            >
              {submitMutation.isPending ? (
                <><Spinner className="h-4 w-4" />Submitting…</>
              ) : (
                <><Upload className="h-4 w-4" />Submit Assignment</>
              )}
            </button>
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

function SubmissionResult({ submission, assignment, canResubmit }: {
  submission: any
  assignment: Assignment
  canResubmit: boolean
}) {
  const isEvaluated = submission.status === 'evaluated'
  const isPending = ['submitted', 'evaluating'].includes(submission.status)
  const isFlagged = submission.status === 'similarity_review'
  const finalScore = submission.final_score ?? submission.ai_score

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Your Submission</h3>
        <Badge status={submission.status} />
      </div>

      {isPending && (
        <div className="flex items-center gap-3 rounded-lg bg-blue-50 border border-blue-100 p-3 text-sm text-blue-700">
          <RefreshCw className="h-4 w-4 shrink-0 animate-spin" />
          Evaluation in progress — check back soon.
        </div>
      )}

      {isFlagged && (
        <div className="rounded-lg bg-orange-50 border border-orange-200 p-3 text-sm">
          <p className="font-medium text-orange-800 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Under similarity review
          </p>
          <p className="text-orange-600 mt-1">
            Similarity score: {((submission.similarity_score ?? 0) * 100).toFixed(1)}%
          </p>
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
            <div className="flex-1">
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    finalScore / assignment.max_marks >= 0.7
                      ? 'bg-green-500'
                      : finalScore / assignment.max_marks >= 0.5
                      ? 'bg-yellow-500'
                      : 'bg-red-500'
                  }`}
                  style={{ width: `${(finalScore / assignment.max_marks) * 100}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-gray-400 text-right">
                {((finalScore / assignment.max_marks) * 100).toFixed(1)}%
              </p>
            </div>
          </div>

          {/* AI Feedback */}
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
