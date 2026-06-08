import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, ChevronRight, ChevronDown, BookOpen } from 'lucide-react'
import toast from 'react-hot-toast'
import { TopBar } from '../../components/layout/TopBar'
import { Modal } from '../../components/ui/Modal'
import { Spinner } from '../../components/ui/Spinner'
import { EmptyState } from '../../components/ui/EmptyState'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import api from '../../lib/api'
import type { Hierarchy } from '../../types'
import { cn } from '../../lib/utils'

type Level = 'course' | 'branch' | 'semester'
interface EditItem { level: Level; id: string; parentId: string; name: string }
interface DeleteItem { level: Level; id: string; parentId: string; name: string }

export default function CollegeStructurePage() {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [addTarget, setAddTarget] = useState<{ level: Level; parentId: string } | null>(null)
  const [editItem, setEditItem] = useState<EditItem | null>(null)
  const [deleteItem, setDeleteItem] = useState<DeleteItem | null>(null)
  const [inputVal, setInputVal] = useState('')

  const { data: hierarchy, isLoading } = useQuery({
    queryKey: ['college-hierarchy'],
    queryFn: async () => (await api.get('/college-admin/hierarchy')).data as Hierarchy,
  })

  const toggle = (id: string) => setExpanded(p => ({ ...p, [id]: !p[id] }))

  const saveMutation = useMutation({
    mutationFn: async () => {
      const name = inputVal.trim()
      if (!name) throw new Error('Name required')
      if (addTarget) {
        if (addTarget.level === 'course') return api.post('/college-admin/courses', { name })
        if (addTarget.level === 'branch') return api.post(`/college-admin/courses/${addTarget.parentId}/branches`, { name })
        if (addTarget.level === 'semester') return api.post(`/college-admin/branches/${addTarget.parentId}/semesters`, { name })
      } else if (editItem) {
        if (editItem.level === 'course') return api.patch(`/college-admin/courses/${editItem.id}`, { name })
        if (editItem.level === 'branch') return api.patch(`/college-admin/courses/${editItem.parentId}/branches/${editItem.id}`, { name })
        if (editItem.level === 'semester') return api.patch(`/college-admin/branches/${editItem.parentId}/semesters/${editItem.id}`, { name })
      }
    },
    onSuccess: () => {
      toast.success(addTarget ? 'Created' : 'Updated')
      qc.invalidateQueries({ queryKey: ['college-hierarchy'] })
      setAddTarget(null); setEditItem(null); setInputVal('')
    },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!deleteItem) return
      if (deleteItem.level === 'course') return api.delete(`/college-admin/courses/${deleteItem.id}`)
      if (deleteItem.level === 'branch') return api.delete(`/college-admin/courses/${deleteItem.parentId}/branches/${deleteItem.id}`)
      if (deleteItem.level === 'semester') return api.delete(`/college-admin/branches/${deleteItem.parentId}/semesters/${deleteItem.id}`)
    },
    onSuccess: () => {
      toast.success('Deleted')
      qc.invalidateQueries({ queryKey: ['college-hierarchy'] })
      setDeleteItem(null)
    },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Failed'),
  })

  const courses = hierarchy?.courses ?? []

  return (
    <div>
      <TopBar title="Academic Structure" subtitle="Course → Branch → Semester" />
      <div className="p-6 space-y-4">
        <div className="flex justify-end">
          <button className="btn-primary" onClick={() => { setInputVal(''); setAddTarget({ level: 'course', parentId: '' }) }}>
            <Plus className="h-4 w-4" /> Add Course
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner className="h-8 w-8" /></div>
        ) : courses.length === 0 ? (
          <EmptyState icon={BookOpen} title="No courses yet"
            description="Start by adding a course."
            action={<button className="btn-primary" onClick={() => { setInputVal(''); setAddTarget({ level: 'course', parentId: '' }) }}><Plus className="h-4 w-4" />Add Course</button>} />
        ) : (
          <div className="card p-0 overflow-hidden space-y-0">
            {courses.map(course => (
              <div key={course.id} className="border-b border-gray-100 last:border-0">
                {/* Course row */}
                <Row label={course.name} level={0} expanded={!!expanded[course.id]}
                  onToggle={() => toggle(course.id)}
                  onAdd={() => { setInputVal(''); setAddTarget({ level: 'branch', parentId: course.id }) }}
                  addLabel="Add Branch"
                  onEdit={() => { setInputVal(course.name); setEditItem({ level: 'course', id: course.id, parentId: '', name: course.name }) }}
                  onDelete={() => setDeleteItem({ level: 'course', id: course.id, parentId: '', name: course.name })}
                />
                {expanded[course.id] && (
                  <div>
                    {course.branches.length === 0 && <p className="pl-12 py-2 text-xs text-gray-400">No branches</p>}
                    {course.branches.map(branch => (
                      <div key={branch.id}>
                        <Row label={branch.name} level={1} expanded={!!expanded[branch.id]}
                          onToggle={() => toggle(branch.id)}
                          onAdd={() => { setInputVal(''); setAddTarget({ level: 'semester', parentId: branch.id }) }}
                          addLabel="Add Semester"
                          onEdit={() => { setInputVal(branch.name); setEditItem({ level: 'branch', id: branch.id, parentId: course.id, name: branch.name }) }}
                          onDelete={() => setDeleteItem({ level: 'branch', id: branch.id, parentId: course.id, name: branch.name })}
                        />
                        {expanded[branch.id] && (
                          <div>
                            {branch.semesters.length === 0 && <p className="pl-20 py-2 text-xs text-gray-400">No semesters</p>}
                            {branch.semesters.map(sem => (
                              <Row key={sem.id} label={sem.name} level={2} expanded={false}
                                onToggle={() => {}} isLeaf
                                onEdit={() => { setInputVal(sem.name); setEditItem({ level: 'semester', id: sem.id, parentId: branch.id, name: sem.name }) }}
                                onDelete={() => setDeleteItem({ level: 'semester', id: sem.id, parentId: branch.id, name: sem.name })}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={!!addTarget || !!editItem}
        onClose={() => { setAddTarget(null); setEditItem(null); setInputVal('') }}
        title={addTarget ? `Add ${addTarget.level.charAt(0).toUpperCase() + addTarget.level.slice(1)}` : `Edit ${editItem?.level}`}
        size="sm">
        <div className="space-y-4">
          <div>
            <label className="label">Name</label>
            <input className="input" value={inputVal} onChange={e => setInputVal(e.target.value)} autoFocus
              onKeyDown={e => e.key === 'Enter' && saveMutation.mutate()} />
          </div>
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => { setAddTarget(null); setEditItem(null) }}>Cancel</button>
            <button className="btn-primary" disabled={!inputVal.trim() || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending && <Spinner className="h-4 w-4" />}
              {addTarget ? 'Create' : 'Save'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteItem} onClose={() => setDeleteItem(null)}
        onConfirm={() => deleteMutation.mutate()}
        title={`Delete ${deleteItem?.level}`}
        message={`Delete "${deleteItem?.name}"? All nested items will also be removed.`}
        confirmLabel="Delete" danger loading={deleteMutation.isPending} />
    </div>
  )
}

const INDENT = ['pl-4', 'pl-10', 'pl-16']

function Row({ label, level, expanded, onToggle, onAdd, addLabel, onEdit, onDelete, isLeaf }: {
  label: string; level: number; expanded: boolean; onToggle: () => void
  onAdd?: () => void; addLabel?: string; onEdit: () => void; onDelete: () => void; isLeaf?: boolean
}) {
  return (
    <div className={cn('flex items-center gap-2 py-2.5 px-4 group hover:bg-gray-50 border-b border-gray-50 last:border-0',
      ['bg-white', 'bg-gray-50/50', 'bg-white'][level])}>
      <div className={cn('flex items-center gap-2 flex-1', INDENT[level])}>
        {!isLeaf ? (
          <button onClick={onToggle} className="text-gray-400 hover:text-gray-600 shrink-0">
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : <span className="w-4 shrink-0" />}
        <span className="text-sm font-medium text-gray-800">{label}</span>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {onAdd && addLabel && (
          <button onClick={onAdd} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-primary-600 hover:bg-primary-50">
            <Plus className="h-3.5 w-3.5" />{addLabel}
          </button>
        )}
        <button onClick={onEdit} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><Pencil className="h-3.5 w-3.5" /></button>
        <button onClick={onDelete} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  )
}
