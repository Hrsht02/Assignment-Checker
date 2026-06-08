import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, FileText, Calendar, Hash, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { TopBar } from '../../components/layout/TopBar'
import { Modal } from '../../components/ui/Modal'
import { Badge } from '../../components/ui/Badge'
import { Spinner } from '../../components/ui/Spinner'
import { EmptyState } from '../../components/ui/EmptyState'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import api from '../../lib/api'
import type { Assignment } from '../../types'
import { formatDateTime, isDeadlinePast } from '../../lib/utils'
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

export default function SectionPage() {
  const { sectionId: semesterId } = useParams<{ sectionId: string }>()  // route param is sectionId but holds a semester ID
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Assignment | null>(null)

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ['semester-assignments', semesterId],
    queryFn: async () => {
      const res = await api.get(`/assignments/semesters/${semesterId}`)
      return res.data as Assignment[]
    },
    enabled: !!semesterId,
  })

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const form = new FormData()
      form.append('title', data.title)
      form.append('description', data.description)
      form.append('max_marks', String(data.max_marks))
      form.append('deadline', new Date(data.deadline).toISOString())
      form.append('rubric', data.rubric)
      if (data.question_text) form.append('question_text', data.question_text)
      return api.post(`/assignments/semesters/${semesterId}`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    },
    onSuccess: () => {
      toast.success('Assignment created')
      qc.invalidateQueries({ queryKey: ['semester-assignments', semesterId] })
      setShowCreate(false)
      reset()
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
            description="Create your first assignment for this section."
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
                    <Link to={`/professor/assignments/${a.id}`}
                      className="btn-secondary text-xs px-3 py-1.5">
                      View
                    </Link>
                    <button
                      onClick={() => setDeleteTarget(a)}
                      className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                      aria-label="Delete assignment"
                    >
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
      <Modal open={showCreate} onClose={() => { setShowCreate(false); reset() }} title="New Assignment" size="lg">
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
              placeholder="Describe how the assignment should be evaluated (criteria, weights, etc.)..."
              {...register('rubric')} />
            {errors.rubric && <p className="mt-1 text-xs text-red-600">{errors.rubric.message}</p>}
          </div>
          <div>
            <label className="label">Questions (optional if uploading PDF)</label>
            <textarea className="input min-h-[80px] resize-y" placeholder="Type questions here..." {...register('question_text')} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={() => { setShowCreate(false); reset() }}>Cancel</button>
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
        message={`Are you sure you want to delete "${deleteTarget?.title}"? This will also delete all submissions.`}
        confirmLabel="Delete"
        danger
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
