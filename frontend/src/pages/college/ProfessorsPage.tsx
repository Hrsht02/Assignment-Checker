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

export default function ProfessorsPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [resetTarget, setResetTarget] = useState<User | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)
  const [newPw, setNewPw] = useState('')
  const [form, setForm] = useState({ name: '', professor_id: '', email: '', phone: '', password: '', semester_ids: [] as string[] })

  const { data: professors = [], isLoading } = useQuery({
    queryKey: ['college-professors', search],
    queryFn: async () => {
      const p: Record<string, string> = {}
      if (search) p.search = search
      return (await api.get('/college-admin/professors', { params: p })).data as User[]
    },
  })

  const { data: hierarchy } = useQuery({
    queryKey: ['college-hierarchy'],
    queryFn: async () => (await api.get('/college-admin/hierarchy')).data as Hierarchy,
  })

  // Flat list of all semesters with breadcrumb
  const allSemesters = (hierarchy?.courses ?? []).flatMap(c =>
    c.branches.flatMap(b =>
      b.semesters.map(s => ({ id: s.id, label: `${c.name} → ${b.name} → ${s.name}` }))
    )
  )

  const createMutation = useMutation({
    mutationFn: () => api.post('/college-admin/professors', form),
    onSuccess: () => {
      toast.success('Professor created')
      qc.invalidateQueries({ queryKey: ['college-professors'] })
      setShowCreate(false)
      setForm({ name: '', professor_id: '', email: '', phone: '', password: '', semester_ids: [] })
    },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Failed'),
  })

  const toggleStatus = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.post(`/college-admin/professors/${id}/${active ? 'activate' : 'deactivate'}`),
    onSuccess: () => { toast.success('Updated'); qc.invalidateQueries({ queryKey: ['college-professors'] }) },
  })

  const resetPw = useMutation({
    mutationFn: ({ id, pw }: { id: string; pw: string }) =>
      api.post(`/college-admin/professors/${id}/reset-password`, { new_password: pw }),
    onSuccess: () => { toast.success('Password reset'); setResetTarget(null); setNewPw('') },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/college-admin/professors/${id}`),
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['college-professors'] }); setDeleteTarget(null) },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Failed'),
  })

  const toggleSemester = (id: string) => {
    setForm(f => ({
      ...f,
      semester_ids: f.semester_ids.includes(id)
        ? f.semester_ids.filter(s => s !== id)
        : [...f.semester_ids, id],
    }))
  }

  return (
    <div>
      <TopBar title="Professors" subtitle="Manage faculty accounts" />
      <div className="p-6 space-y-4">
        <div className="flex gap-3 items-center justify-between">
          <div className="relative max-w-xs flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input type="search" className="input pl-9" placeholder="Search professors…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" /> Add Professor
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner className="h-8 w-8" /></div>
        ) : professors.length === 0 ? (
          <EmptyState icon={Search} title="No professors found"
            action={<button className="btn-primary" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />Add Professor</button>} />
        ) : (
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Name', 'Professor ID', 'Email / Phone', 'Status', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {professors.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{u.name}</td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{u.professor_id ?? '—'}</td>
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
        )}
      </div>

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add Professor" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Full Name</label>
              <input className="input" placeholder="Dr. Amit Kumar" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="label">Professor ID</label>
              <input className="input" placeholder="e.g. PROF001" value={form.professor_id} onChange={e => setForm(f => ({ ...f, professor_id: e.target.value }))} />
              <p className="mt-1 text-xs text-gray-400">Unique ID within this college</p>
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" placeholder="prof@college.edu" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label className="label">Phone (optional)</label>
              <input className="input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div>
              <label className="label">Password</label>
              <input type="password" className="input" placeholder="Min 8 characters" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label">Assign to Semesters</label>
            <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-2 space-y-1">
              {allSemesters.length === 0 && <p className="text-xs text-gray-400 px-2 py-1">No semesters found — add structure first.</p>}
              {allSemesters.map(s => (
                <label key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white cursor-pointer">
                  <input type="checkbox" checked={form.semester_ids.includes(s.id)}
                    onChange={() => toggleSemester(s.id)} className="accent-primary-600" />
                  <span className="text-xs text-gray-700">{s.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button className="btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
            <button className="btn-primary" disabled={!form.name || !form.professor_id || !form.email || form.password.length < 8 || createMutation.isPending}
              onClick={() => createMutation.mutate()}>
              {createMutation.isPending && <Spinner className="h-4 w-4" />}
              Create Professor
            </button>
          </div>
        </div>
      </Modal>

      {/* Reset Password Modal */}
      <Modal open={!!resetTarget} onClose={() => setResetTarget(null)} title="Reset Password" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Set a new password for <strong>{resetTarget?.name}</strong>.</p>
          <input type="password" className="input" placeholder="New password (min 8 chars)"
            value={newPw} onChange={e => setNewPw(e.target.value)} />
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
        title="Delete Professor" message={`Delete "${deleteTarget?.name}"?`}
        confirmLabel="Delete" danger loading={deleteMutation.isPending} />
    </div>
  )
}
