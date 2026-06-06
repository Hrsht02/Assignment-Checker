import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, BookOpen, Users, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import { TopBar } from '../../components/layout/TopBar'
import { Modal } from '../../components/ui/Modal'
import { EmptyState } from '../../components/ui/EmptyState'
import { Spinner } from '../../components/ui/Spinner'
import api from '../../lib/api'
import type { Semester } from '../../types'
import { formatDate } from '../../lib/utils'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(1).max(100),
  start_date: z.string().min(1, 'Required'),
  end_date: z.string().min(1, 'Required'),
}).refine((d) => d.end_date > d.start_date, {
  message: 'End date must be after start date',
  path: ['end_date'],
})
type FormData = z.infer<typeof schema>

export default function SemestersPage() {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)

  const { data: semesters = [], isLoading } = useQuery({
    queryKey: ['semesters'],
    queryFn: async () => {
      const res = await api.get('/semesters')
      return res.data as Semester[]
    },
  })

  const createMutation = useMutation({
    mutationFn: (data: FormData) => api.post('/semesters', data),
    onSuccess: () => {
      toast.success('Semester created')
      qc.invalidateQueries({ queryKey: ['semesters'] })
      setShowCreate(false)
      reset()
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail ?? 'Failed to create semester')
    },
  })

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  return (
    <div>
      <TopBar title="Semesters" subtitle="Academic structure management" />
      <div className="p-6 space-y-4">
        <div className="flex justify-end">
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            New Semester
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner className="h-8 w-8" /></div>
        ) : semesters.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="No semesters yet"
            description="Create your first semester to get started."
            action={
              <button className="btn-primary" onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4" /> Create Semester
              </button>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {semesters.map((s) => (
              <Link
                key={s.id}
                to={`/admin/semesters/${s.id}`}
                className="card hover:shadow-md hover:border-primary-200 transition-all group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
                    <BookOpen className="h-5 w-5 text-primary-600" />
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-primary-500 transition-colors" />
                </div>
                <div className="mt-3">
                  <h3 className="font-semibold text-gray-900">{s.name}</h3>
                  <p className="mt-1 text-xs text-gray-400">
                    {formatDate(s.start_date)} — {formatDate(s.end_date)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <Modal open={showCreate} onClose={() => { setShowCreate(false); reset() }} title="New Semester">
        <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} className="space-y-4" noValidate>
          <div>
            <label className="label">Semester Name</label>
            <input className="input" placeholder="e.g. Semester 1 – Fall 2024" {...register('name')} />
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Start Date</label>
              <input type="date" className="input" {...register('start_date')} />
              {errors.start_date && <p className="mt-1 text-xs text-red-600">{errors.start_date.message}</p>}
            </div>
            <div>
              <label className="label">End Date</label>
              <input type="date" className="input" {...register('end_date')} />
              {errors.end_date && <p className="mt-1 text-xs text-red-600">{errors.end_date.message}</p>}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={() => { setShowCreate(false); reset() }}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={createMutation.isPending}>
              {createMutation.isPending && <Spinner className="h-4 w-4" />}
              Create
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
