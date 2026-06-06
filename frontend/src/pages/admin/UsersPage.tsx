import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, MoreVertical, UserCheck, UserX, Shield } from 'lucide-react'
import toast from 'react-hot-toast'
import { TopBar } from '../../components/layout/TopBar'
import { Modal } from '../../components/ui/Modal'
import { Badge } from '../../components/ui/Badge'
import { Spinner } from '../../components/ui/Spinner'
import { EmptyState } from '../../components/ui/EmptyState'
import api from '../../lib/api'
import type { User, UserRole } from '../../types'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const createSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8, 'Min 8 characters'),
  role: z.enum(['professor', 'student']),
  roll_number: z.string().optional(),
})
type CreateForm = z.infer<typeof createSchema>

export default function UsersPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<UserRole | ''>('')
  const [showCreate, setShowCreate] = useState(false)

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin-users', search, roleFilter],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (search) params.search = search
      if (roleFilter) params.role = roleFilter
      const res = await api.get('/admin/users', { params })
      return res.data as User[]
    },
  })

  const createMutation = useMutation({
    mutationFn: (data: CreateForm) => api.post('/admin/users', data),
    onSuccess: () => {
      toast.success('User created successfully')
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      setShowCreate(false)
      reset()
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail ?? 'Failed to create user')
    },
  })

  const toggleStatus = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.post(`/admin/users/${id}/${active ? 'activate' : 'deactivate'}`),
    onSuccess: () => {
      toast.success('User status updated')
      qc.invalidateQueries({ queryKey: ['admin-users'] })
    },
  })

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
  })
  const watchedRole = watch('role')

  return (
    <div>
      <TopBar title="Users" subtitle="Manage professors and students" />
      <div className="p-6 space-y-4">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3 flex-1">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="search"
                placeholder="Search users…"
                className="input pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search users"
              />
            </div>
            <select
              className="input w-40"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as UserRole | '')}
              aria-label="Filter by role"
            >
              <option value="">All roles</option>
              <option value="professor">Professor</option>
              <option value="student">Student</option>
            </select>
          </div>
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            Add User
          </button>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner className="h-8 w-8" /></div>
        ) : users.length === 0 ? (
          <EmptyState icon={Shield} title="No users found" description="Try adjusting your filters or add a new user." />
        ) : (
          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label="Users table">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Name</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Email</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Role</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Roll No.</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-primary-700 text-xs font-bold shrink-0">
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium text-gray-900">{user.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{user.email}</td>
                      <td className="px-4 py-3">
                        <Badge status={user.role} />
                      </td>
                      <td className="px-4 py-3 text-gray-500">{user.roll_number ?? '—'}</td>
                      <td className="px-4 py-3">
                        <Badge status={user.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => toggleStatus.mutate({ id: user.id, active: user.status !== 'active' })}
                          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors"
                          aria-label={user.status === 'active' ? 'Deactivate user' : 'Activate user'}
                        >
                          {user.status === 'active' ? (
                            <><UserX className="h-3.5 w-3.5" />Deactivate</>
                          ) : (
                            <><UserCheck className="h-3.5 w-3.5" />Activate</>
                          )}
                        </button>
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
      <Modal open={showCreate} onClose={() => { setShowCreate(false); reset() }} title="Add New User">
        <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} className="space-y-4" noValidate>
          <div>
            <label className="label">Full Name</label>
            <input className="input" placeholder="Dr. Jane Smith" {...register('name')} />
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" className="input" placeholder="jane@uni.edu" {...register('email')} />
            {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
          </div>
          <div>
            <label className="label">Password</label>
            <input type="password" className="input" placeholder="Min 8 characters" {...register('password')} />
            {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
          </div>
          <div>
            <label className="label">Role</label>
            <select className="input" {...register('role')}>
              <option value="">Select role</option>
              <option value="professor">Professor</option>
              <option value="student">Student</option>
            </select>
            {errors.role && <p className="mt-1 text-xs text-red-600">{errors.role.message}</p>}
          </div>
          {watchedRole === 'student' && (
            <div>
              <label className="label">Roll Number</label>
              <input className="input" placeholder="e.g. CS2024001" {...register('roll_number')} />
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={() => { setShowCreate(false); reset() }}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={createMutation.isPending}>
              {createMutation.isPending && <Spinner className="h-4 w-4" />}
              Create User
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
