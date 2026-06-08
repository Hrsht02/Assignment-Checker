import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, UserPlus, Power, PowerOff } from 'lucide-react'
import toast from 'react-hot-toast'
import { TopBar } from '../../components/layout/TopBar'
import { Modal } from '../../components/ui/Modal'
import { Spinner } from '../../components/ui/Spinner'
import { EmptyState } from '../../components/ui/EmptyState'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import api from '../../lib/api'
import type { College } from '../../types'
import { cn } from '../../lib/utils'

export default function CollegesPage() {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [editTarget, setEditTarget] = useState<College | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<College | null>(null)
  const [addAdminFor, setAddAdminFor] = useState<College | null>(null)
  const [form, setForm] = useState({ name: '', description: '' })
  const [adminForm, setAdminForm] = useState({ name: '', email: '', password: '', phone: '' })

  const { data: colleges = [], isLoading } = useQuery({
    queryKey: ['org-colleges'],
    queryFn: async () => (await api.get('/org/colleges')).data as College[],
  })

  const saveMutation = useMutation({
    mutationFn: () => editTarget
      ? api.patch(`/org/colleges/${editTarget.id}`, form)
      : api.post('/org/colleges', form),
    onSuccess: () => {
      toast.success(editTarget ? 'College updated' : 'College created')
      qc.invalidateQueries({ queryKey: ['org-colleges'] })
      setShowAdd(false); setEditTarget(null); setForm({ name: '', description: '' })
    },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/org/colleges/${id}`),
    onSuccess: () => {
      toast.success('College deleted')
      qc.invalidateQueries({ queryKey: ['org-colleges'] })
      setDeleteTarget(null)
    },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Failed'),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.post(`/org/colleges/${id}/${active ? 'activate' : 'deactivate'}`),
    onSuccess: () => { toast.success('Updated'); qc.invalidateQueries({ queryKey: ['org-colleges'] }) },
  })

  const addAdminMutation = useMutation({
    mutationFn: () => api.post(`/org/colleges/${addAdminFor!.id}/admins`, adminForm),
    onSuccess: () => {
      toast.success('College Admin created')
      setAddAdminFor(null); setAdminForm({ name: '', email: '', password: '', phone: '' })
    },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Failed'),
  })

  const openEdit = (c: College) => { setEditTarget(c); setForm({ name: c.name, description: c.description ?? '' }); setShowAdd(true) }

  return (
    <div>
      <TopBar title="Colleges" subtitle="Manage all colleges on the platform" />
      <div className="p-6 space-y-4">
        <div className="flex justify-end">
          <button className="btn-primary" onClick={() => { setEditTarget(null); setForm({ name: '', description: '' }); setShowAdd(true) }}>
            <Plus className="h-4 w-4" /> Add College
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner className="h-8 w-8" /></div>
        ) : colleges.length === 0 ? (
          <EmptyState icon={Plus} title="No colleges yet"
            description="Add your first college to get started."
            action={<button className="btn-primary" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" />Add College</button>} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {colleges.map(c => (
              <div key={c.id} className={cn('card space-y-3 hover:shadow-md transition-shadow', !c.is_active && 'opacity-60')}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">{c.name}</p>
                    {c.description && <p className="text-xs text-gray-400 mt-0.5">{c.description}</p>}
                  </div>
                  <span className={cn('badge', c.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                    {c.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <p className="text-xs text-gray-400">{c.admin_count ?? 0} admin{(c.admin_count ?? 0) !== 1 ? 's' : ''}</p>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button onClick={() => setAddAdminFor(c)}
                    className="btn-secondary text-xs px-2.5 py-1.5">
                    <UserPlus className="h-3.5 w-3.5" /> Add Admin
                  </button>
                  <button onClick={() => openEdit(c)}
                    className="btn-secondary text-xs px-2.5 py-1.5">
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button onClick={() => toggleMutation.mutate({ id: c.id, active: !c.is_active })}
                    className="btn-secondary text-xs px-2.5 py-1.5">
                    {c.is_active ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
                    {c.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button onClick={() => setDeleteTarget(c)}
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <Modal open={showAdd} onClose={() => { setShowAdd(false); setEditTarget(null) }}
        title={editTarget ? 'Edit College' : 'Add College'} size="sm">
        <div className="space-y-4">
          <div>
            <label className="label">College Name</label>
            <input className="input" placeholder="e.g. IIT Patna" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
          </div>
          <div>
            <label className="label">Description (optional)</label>
            <input className="input" placeholder="Brief description" value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button className="btn-secondary" onClick={() => { setShowAdd(false); setEditTarget(null) }}>Cancel</button>
            <button className="btn-primary" disabled={!form.name.trim() || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending && <Spinner className="h-4 w-4" />}
              {editTarget ? 'Save' : 'Create'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Add Admin Modal */}
      <Modal open={!!addAdminFor} onClose={() => setAddAdminFor(null)}
        title={`Add Admin — ${addAdminFor?.name}`} size="md">
        <div className="space-y-4">
          {(['name', 'email', 'password', 'phone'] as const).map(field => (
            <div key={field}>
              <label className="label capitalize">{field}{field === 'phone' ? ' (optional)' : ''}</label>
              <input type={field === 'password' ? 'password' : field === 'email' ? 'email' : 'text'}
                className="input" placeholder={field === 'password' ? 'Min 8 characters' : ''}
                value={adminForm[field]} onChange={e => setAdminForm(f => ({ ...f, [field]: e.target.value }))} />
            </div>
          ))}
          <div className="flex justify-end gap-3 pt-2">
            <button className="btn-secondary" onClick={() => setAddAdminFor(null)}>Cancel</button>
            <button className="btn-primary" disabled={addAdminMutation.isPending || !adminForm.name || !adminForm.email || adminForm.password.length < 8}
              onClick={() => addAdminMutation.mutate()}>
              {addAdminMutation.isPending && <Spinner className="h-4 w-4" />}
              Create Admin
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Delete College"
        message={`Permanently delete "${deleteTarget?.name}"? All associated data will be removed.`}
        confirmLabel="Delete" danger loading={deleteMutation.isPending} />
    </div>
  )
}
