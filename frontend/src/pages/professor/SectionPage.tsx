import { useState, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, FileText, Calendar, Hash, Trash2, Upload, X, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { TopBar } from '../../components/layout/TopBar'
import { Modal } from '../../components/ui/Modal'
import { Badge } from '../../components/ui/Badge'
import { Spinner } from '../../components/ui/Spinner'
import { EmptyState } from '../../components/ui/EmptyState'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import api from '../../lib/api'
import type { Assignment } from '../../types'
import { formatDateTime, isDeadlinePast, cn } from '../../lib/utils'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const schema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  max_marks: z.coerce.number().int().min(1).max(1000),
  deadline: z.string().min(1, 'Deadline required'),
  rubric: z.string().min(1, 'Rubric required'),
  question_text: z.string().optional(),
})
type FormData = z.infer<typeof schema>
type QuestionMode = 'text' | 'pdf'

export default function SectionPage() {
  const { sectionId: semesterId } = useParams<{ sectionId: string }>()
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Assignment | null>(null)
  const [questionMode, setQuestionMode] = useState<QuestionMode>('text')
  const [questionPdf, setQuestionPdf] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ['semester-assignments', semesterId],
    queryFn: async () => (await api.get(`/assignments/semesters/${semesterId}`)).data as Assignment[],
    enabled: !!semesterId,
  })

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const handlePdfDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file?.type === 'application/pdf') setQuestionPdf(file)
    else toast.error('Only PDF files are accepted')
  }

  const handlePdfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.type !== 'application/pdf') { toast.error('Only PDF files accepted'); return }
    if (file.size > 20 * 1024 * 1024) { toast.error('File must be under 20 MB'); return }
    setQuestionPdf(file)
  }

  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const form = new FormData()
      form.append('title', data.title)
      form.append('description', data.description)
      form.append('max_marks', String(data.max_marks))
      form.append('deadline', new Date(data.deadline).toISOString())
      form.append('rubric', data.rubric)
      if (questionMode === 'text' && data.question_text) {
        form.append('question_text', data.question_text)
      }
      if (questionMode === 'pdf' && questionPdf) {
        form.append('question_pdf', questionPdf)
      }
      return api.post(`/assignments/semesters/${semesterId}`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    },
    onSuccess: () => {
      toast.success('Assignment created')
      qc.invalidateQueries({ queryKey: ['semester-assignments', semesterId] })
      setShowCreate(false)
      reset()
      setQuestionPdf(null)
      setQuestionMode('text')
    },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Failed to create assignment'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/assignments/${id}?confirmed=true`),
    onSuccess: () => {
      toast.success('Assignment deleted')
      qc.invalidateQueries({ queryKey: ['semester-assignments', semesterId] })
      setDeleteTarget(null)
    },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Failed to delete'),
  })

  const handleClose = () => {
    setShowCreate(false)
    reset()
    setQuestionPdf(null)
    setQuestionMode('text')
  }

  return (
    <div>
      <TopBar title="Semester Assignments" subtitle="Manage assignments for this semester" />
      <div className="p-6 space-y-4">
        <div className="flex justify-end">
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" /> New Assignment
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner className="h-8 w-8" /></div>
        ) : assignments.length === 0 ? (
          <EmptyState icon={FileText} title="No assignments yet"
            description="Create your first assignment for this semester."
            action={<button className="btn-primary" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />Create Assignment</button>}
          />
        ) : (
          <div className="space-y-3">
            {assignments.map((a) => (
              <div key={a.id} className="card hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link to={`/professor/assignments/${a.id}`} className="font-semibold text-gray-900 hover:text-primary-600 transition-colors">
                        {a.title}
                      </Link>
                      <Badge status={isDeadlinePast(a.deadline) ? 'closed' : 'active'}
                        label={isDeadlinePast(a.deadline) ? 'Closed' : 'Active'} />
                      {a.question_pdf_url && (
                        <span className="badge bg-blue-100 text-blue-700 flex items-center gap-1">
                          <FileText className="h-3 w-3" /> PDF
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-gray-500 line-clamp-2">{a.description}</p>
                    <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        Due {formatDateTime(a.deadline)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Hash className="h-3.5 w-3.5" />
                        {a.max_marks} marks
                      </span>
                      <span>{a.submission_count ?? 0} submissions</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {a.question_pdf_url && (
                      <a href={a.question_pdf_url} target="_blank" rel="noopener noreferrer"
                        className="btn-secondary text-xs px-3 py-1.5">
                        <FileText className="h-3.5 w-3.5" /> PDF
                      </a>
                    )}
                    <Link to={`/professor/assignments/${a.id}`} className="btn-secondary text-xs px-3 py-1.5">
                      View
                    </Link>
                    <button onClick={() => setDeleteTarget(a)}
                      className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                      aria-label="Delete assignment">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Assignment Modal */}
      <Modal open={showCreate} onClose={handleClose} title="New Assignment" size="xl">
        <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} className="space-y-4" noValidate>
          <div>
            <label className="label">Title</label>
            <input className="input" placeholder="Assignment title" {...register('title')} />
            {errors.title && <p className="mt-1 text-xs text-red-600">{errors.title.message}</p>}
          </div>

          <div>
            <label className="label">Description</label>
            <textarea className="input min-h-[80px] resize-y" placeholder="Describe the assignment..." {...register('description')} />
            {errors.description && <p className="mt-1 text-xs text-red-600">{errors.description.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Max Marks</label>
              <input type="number" className="input" placeholder="100" {...register('max_marks')} />
              {errors.max_marks && <p className="mt-1 text-xs text-red-600">{errors.max_marks.message}</p>}
            </div>
            <div>
              <label className="label">Deadline</label>
              <input type="datetime-local" className="input" {...register('deadline')} />
              {errors.deadline && <p className="mt-1 text-xs text-red-600">{errors.deadline.message}</p>}
            </div>
          </div>

          <div>
            <label className="label">Evaluation Rubric</label>
            <textarea className="input min-h-[80px] resize-y"
              placeholder="Criteria and weightage for AI evaluation…"
              {...register('rubric')} />
            {errors.rubric && <p className="mt-1 text-xs text-red-600">{errors.rubric.message}</p>}
          </div>

          {/* Question source toggle */}
          <div>
            <label className="label">Question Paper</label>
            <div className="flex gap-1 rounded-xl bg-gray-100 p-1 w-fit mb-3">
              {(['text', 'pdf'] as QuestionMode[]).map(m => (
                <button key={m} type="button" onClick={() => setQuestionMode(m)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all',
                    questionMode === m ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  )}>
                  {m === 'pdf' ? <Upload className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                  {m === 'pdf' ? 'Upload PDF' : 'Type Questions'}
                </button>
              ))}
            </div>

            {questionMode === 'text' && (
              <textarea className="input min-h-[100px] resize-y"
                placeholder="Type your questions here…"
                {...register('question_text')} />
            )}

            {questionMode === 'pdf' && (
              <div
                className={cn(
                  'rounded-xl border-2 border-dashed transition-colors cursor-pointer p-6 text-center',
                  dragOver ? 'border-primary-400 bg-primary-50' :
                  questionPdf ? 'border-green-400 bg-green-50' :
                  'border-gray-200 bg-gray-50 hover:border-primary-300 hover:bg-primary-50'
                )}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handlePdfDrop}
                role="button" tabIndex={0} aria-label="Upload question paper PDF"
                onKeyDown={e => e.key === 'Enter' && fileInputRef.current?.click()}
              >
                <input ref={fileInputRef} type="file" accept="application/pdf"
                  className="hidden" onChange={handlePdfChange} aria-hidden="true" />
                {questionPdf ? (
                  <div className="flex items-center justify-center gap-3">
                    <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
                    <div className="text-left">
                      <p className="text-sm font-medium text-gray-900">{questionPdf.name}</p>
                      <p className="text-xs text-gray-400">{(questionPdf.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                    <button type="button"
                      onClick={e => { e.stopPropagation(); setQuestionPdf(null) }}
                      className="ml-2 rounded-full p-1 text-gray-400 hover:bg-gray-200"
                      aria-label="Remove file">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Upload className="mx-auto h-7 w-7 text-gray-300" />
                    <p className="text-sm text-gray-500">
                      Drag & drop question paper PDF, or <span className="text-primary-600 font-medium">browse</span>
                    </p>
                    <p className="text-xs text-gray-400">PDF only · max 20 MB</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={handleClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={createMutation.isPending}>
              {createMutation.isPending && <Spinner className="h-4 w-4" />}
              Create Assignment
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Delete Assignment"
        message={`Delete "${deleteTarget?.title}"? This also deletes all submissions.`}
        confirmLabel="Delete" danger loading={deleteMutation.isPending}
      />
    </div>
  )
}
