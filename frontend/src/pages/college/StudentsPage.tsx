import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, KeyRound, Trash2, UserCheck, UserX } from 'lucide-react'
import toast from 'react-hot-toast'
import { TopBar } from '../../components/layout/TopBar'
import { Modal } from '../../components/ui/Modal'
import { Badge } from '../../components/ui/Badge'
import { Spinner } from '../../components/ui/Spinner'
import { EmptyState } from '../../components/ui/EmptyState'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import api from '../../lib/api'
import type { User, Hierarchy } from '../../types'

export default function StudentsPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [resetTarget, setResetTarget] = useState<User | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)
  const [newPw, setNewPw] = useState('')
  const [form, setForm] = useState({ name: '', roll_number: '', email: '', phone: '', password: '', semester_id: '' })

  const { data: students = [], isLoading } = useQuery({
    queryKey: ['college-students', search],
    queryFn: async () => {
      const p: Record<string, string> = {}
      if (search) p.search = search
      return (await api.get('/college-admin/students', { params: p })).data as User[]
    },
  })

  const { data: hierarchy } = useQuery({
    queryKey: ['college-hierarchy'],
    queryFn: async () => (await api.get('/college-admin/hierarchy')).data as Hierarchy,
  })

  const allSemesters = (hierarchy?.courses ?? []).flatMap(c =>
    c.branches.flatMap(b =>
      b.semesters.map(s => ({ id: s.id, label: `${c.name} → ${b.name} → ${s.name}` }))
    )
  )

  const createMutation = useMutation({
    mutationFn: () => api.post('/college-admin/students', form),
    onSuccess: () => {
      toast.success('Student created and enrolled')
      qc.invalidateQueries({ queryKey: ['college-students'] })
      setShowCreate(false)
      setForm({ name: '', roll_number: '', email: '', phone: '', password: '', semester_id: '' })
    },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Failed'),
  })

  const toggleStatus = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.post(`/college-admin/students/${id}/${active ? 'activate' : 'deactivate'}`),
    onSuccess: () => { toast.success('Updated'); qc.invalidateQueries({ queryKey: ['college-students'] }) },
  })

  const resetPw = useMutation({
    mutationFn: ({ id, pw }: { id: string; pw: string }) =>
      api.post(`/college-admin/students/${id}/reset-password`, { new_password: pw }),
    onSuccess: () => { toast.success('Password reset'); setResetTarget(null); setNewPw('') },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/college-admin/students/${id}`),
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['college-students'] }); setDeleteTarget(null) },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Failed'),
  })

  return (
    <div>
      <TopBar title="Students" subtitle="Manage student accounts and enrollment" />
      <div className="p-6 space-y-4">
        <div className="flex gap-3 items-center justify-between">
          <div className="relative max-w-xs flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input type="search" className="input pl-9" placeholder="Search students…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" /> Add Student
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner className="h-8 w-8" /></div>
        ) : students.length === 0 ? (
          <EmptyState icon={Search} title="No students found"
            action={<button className="btn-primary" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />Add Student</button>} />
        ) : (
          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {['Name', 'Roll No.', 'Email / Phone', 'Status', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-medium text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {students.map(u => (
                    <tr key={u.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{u.name}</td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{u.roll_number ?? '—'}</td>
                      <td className="px-4 py-3">
                        <p className="text-gray-700">{u.email}</p>
                        {u.phone && <p className="text-xs text-gray-400">{u.phone}</p>}
                      </td>
                      <td className="px-4 py-3"><Badge status={u.status} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => toggleStatus.mutate({ id: u.id, active: u.status !== 'active' })}
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                            title={u.status === 'active' ? 'Deactivate' : 'Activate'}>
                            {u.status === 'active' ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                          </button>
                          <button onClick={() => { setResetTarget(u); setNewPw('') }}
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600" title="Reset password">
                            <KeyRound className="h-4 w-4" />
                          </button>
                          <button onClick={() => setDeleteTarget(u)}
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Delete">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add Student" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Full Name</label>
              <input className="input" placeholder="Student Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="label">Roll Number</label>
              <input className="input" placeholder="e.g. CS2024001" value={form.roll_number} onChange={e => setForm(f => ({ ...f, roll_number: e.target.value }))} />
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" placeholder="student@college.edu" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label className="label">Phone (optional)</label>
              <input className="input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div>
              <label className="label">Password</label>
              <input type="password" className="input" placeholder="Min 8 characters" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <label className="label">Enroll in Semester</label>
              <select className="input" value={form.semester_id} onChange={e => setForm(f => ({ ...f, semester_id: e.target.value }))}>
                <option value="">Select a semester…</option>
                {allSemesters.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <p className="mt-1 text-xs text-gray-400">Student is automatically enrolled on account creation.</p>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button className="btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
            <button className="btn-primary"
              disabled={!form.name || !form.roll_number || !form.email || form.password.length < 8 || !form.semester_id || createMutation.isPending}
              onClick={() => createMutation.mutate()}>
              {createMutation.isPending && <Spinner className="h-4 w-4" />}
              Create Student
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!resetTarget} onClose={() => setResetTarget(null)} title="Reset Password" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">New password for <strong>{resetTarget?.name}</strong>.</p>
          <input type="password" className="input" placeholder="Min 8 characters" value={newPw} onChange={e => setNewPw(e.target.value)} />
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => setResetTarget(null)}>Cancel</button>
            <button className="btn-primary" disabled={newPw.length < 8 || resetPw.isPending}
              onClick={() => resetTarget && resetPw.mutate({ id: resetTarget.id, pw: newPw })}>
              {resetPw.isPending && <Spinner className="h-4 w-4" />} Reset
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Delete Student" message={`Delete "${deleteTarget?.name}"? All submissions will be removed.`}
        confirmLabel="Delete" danger loading={deleteMutation.isPending} />
    </div>
  )
}
