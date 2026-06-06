import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Users, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { TopBar } from '../../components/layout/TopBar'
import { Modal } from '../../components/ui/Modal'
import { Spinner } from '../../components/ui/Spinner'
import { EmptyState } from '../../components/ui/EmptyState'
import api from '../../lib/api'
import type { Section, User } from '../../types'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'

const sectionSchema = z.object({
  name: z.string().min(1).max(100),
  subject: z.string().min(1).max(100),
})

export default function SemesterDetailPage() {
  const { semesterId } = useParams<{ semesterId: string }>()
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [selectedSection, setSelectedSection] = useState<Section | null>(null)
  const [showEnroll, setShowEnroll] = useState(false)
  const [showAssignProf, setShowAssignProf] = useState(false)
  const [enrollId, setEnrollId] = useState('')
  const [profId, setProfId] = useState('')

  const { data: semester, isLoading } = useQuery({
    queryKey: ['semester', semesterId],
    queryFn: async () => {
      const res = await api.get(`/semesters/${semesterId}`)
      return res.data
    },
    enabled: !!semesterId,
  })

  const { data: sections = [], isLoading: sectionsLoading } = useQuery({
    queryKey: ['sections', semesterId],
    queryFn: async () => {
      const res = await api.get(`/semesters/${semesterId}/sections`)
      return res.data as Section[]
    },
    enabled: !!semesterId,
  })

  const { data: allProfessors = [] } = useQuery({
    queryKey: ['admin-users-professors'],
    queryFn: async () => {
      const res = await api.get('/admin/users', { params: { role: 'professor' } })
      return res.data as User[]
    },
  })

  const { data: allStudents = [] } = useQuery({
    queryKey: ['admin-users-students'],
    queryFn: async () => {
      const res = await api.get('/admin/users', { params: { role: 'student' } })
      return res.data as User[]
    },
  })

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(sectionSchema),
  })

  const createSection = useMutation({
    mutationFn: (data: { name: string; subject: string }) =>
      api.post(`/semesters/${semesterId}/sections`, data),
    onSuccess: () => {
      toast.success('Section created')
      qc.invalidateQueries({ queryKey: ['sections', semesterId] })
      setShowCreate(false)
      reset()
    },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Failed'),
  })

  const assignProfessor = useMutation({
    mutationFn: () =>
      api.post(`/semesters/${semesterId}/sections/${selectedSection?.id}/professors`, { professor_id: profId }),
    onSuccess: () => {
      toast.success('Professor assigned')
      qc.invalidateQueries({ queryKey: ['sections', semesterId] })
      setShowAssignProf(false)
      setProfId('')
    },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Failed'),
  })

  const enrollStudent = useMutation({
    mutationFn: () =>
      api.post(`/semesters/${semesterId}/sections/${selectedSection?.id}/students`, { student_ids: [enrollId] }),
    onSuccess: () => {
      toast.success('Student enrolled')
      qc.invalidateQueries({ queryKey: ['sections', semesterId] })
      setShowEnroll(false)
      setEnrollId('')
    },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Failed'),
  })

  if (isLoading) return <div className="flex justify-center py-12"><Spinner className="h-8 w-8" /></div>

  return (
    <div>
      <TopBar title={semester?.name ?? 'Semester'} subtitle="Sections and enrollment" />
      <div className="p-6 space-y-4">
        <div className="flex justify-end">
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            Add Section
          </button>
        </div>

        {sectionsLoading ? (
          <div className="flex justify-center py-12"><Spinner className="h-8 w-8" /></div>
        ) : sections.length === 0 ? (
          <EmptyState icon={Users} title="No sections yet" description="Add a section to get started." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sections.map((s) => (
              <div key={s.id} className="card space-y-3">
                <div>
                  <h3 className="font-semibold text-gray-900">{s.name}</h3>
                  <p className="text-xs text-gray-400">{s.subject}</p>
                </div>
                <div className="flex gap-4 text-xs text-gray-500">
                  <span>{s.enrolled_students ?? 0} students</span>
                  <span>{s.assigned_professors ?? 0} professors</span>
                </div>
                <div className="flex gap-2">
                  <button
                    className="btn-secondary text-xs px-3 py-1.5"
                    onClick={() => { setSelectedSection(s); setShowAssignProf(true) }}
                  >
                    Assign Professor
                  </button>
                  <button
                    className="btn-secondary text-xs px-3 py-1.5"
                    onClick={() => { setSelectedSection(s); setShowEnroll(true) }}
                  >
                    Enroll Student
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Section Modal */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); reset() }} title="Add Section">
        <form onSubmit={handleSubmit((d) => createSection.mutate(d))} className="space-y-4" noValidate>
          <div>
            <label className="label">Section Name</label>
            <input className="input" placeholder="e.g. Section A" {...register('name')} />
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message as string}</p>}
          </div>
          <div>
            <label className="label">Subject</label>
            <input className="input" placeholder="e.g. Data Structures" {...register('subject')} />
            {errors.subject && <p className="mt-1 text-xs text-red-600">{errors.subject.message as string}</p>}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={() => { setShowCreate(false); reset() }}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={createSection.isPending}>
              {createSection.isPending && <Spinner className="h-4 w-4" />}
              Create
            </button>
          </div>
        </form>
      </Modal>

      {/* Assign Professor Modal */}
      <Modal open={showAssignProf} onClose={() => setShowAssignProf(false)} title="Assign Professor">
        <div className="space-y-4">
          <div>
            <label className="label">Select Professor</label>
            <select className="input" value={profId} onChange={(e) => setProfId(e.target.value)}>
              <option value="">Choose a professor</option>
              {allProfessors.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.email})</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => setShowAssignProf(false)}>Cancel</button>
            <button className="btn-primary" onClick={() => assignProfessor.mutate()} disabled={!profId || assignProfessor.isPending}>
              {assignProfessor.isPending && <Spinner className="h-4 w-4" />}
              Assign
            </button>
          </div>
        </div>
      </Modal>

      {/* Enroll Student Modal */}
      <Modal open={showEnroll} onClose={() => setShowEnroll(false)} title="Enroll Student">
        <div className="space-y-4">
          <div>
            <label className="label">Select Student</label>
            <select className="input" value={enrollId} onChange={(e) => setEnrollId(e.target.value)}>
              <option value="">Choose a student</option>
              {allStudents.map((s) => (
                <option key={s.id} value={s.id}>{s.name} — {s.roll_number} ({s.email})</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => setShowEnroll(false)}>Cancel</button>
            <button className="btn-primary" onClick={() => enrollStudent.mutate()} disabled={!enrollId || enrollStudent.isPending}>
              {enrollStudent.isPending && <Spinner className="h-4 w-4" />}
              Enroll
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
