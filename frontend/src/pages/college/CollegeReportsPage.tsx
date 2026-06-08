import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { BarChart3 } from 'lucide-react'
import { TopBar } from '../../components/layout/TopBar'
import { Spinner } from '../../components/ui/Spinner'
import api from '../../lib/api'
import type { Hierarchy } from '../../types'

export default function CollegeReportsPage() {
  const [courseId, setCourseId] = useState('')
  const [branchId, setBranchId] = useState('')
  const [semesterId, setSemesterId] = useState('')

  const { data: hierarchy } = useQuery({
    queryKey: ['college-hierarchy'],
    queryFn: async () => (await api.get('/college-admin/hierarchy')).data as Hierarchy,
  })

  const { data: stats, isLoading } = useQuery({
    queryKey: ['college-admin-stats', courseId, branchId, semesterId],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (courseId) params.course_id = courseId
      if (branchId) params.branch_id = branchId
      if (semesterId) params.semester_id = semesterId
      return (await api.get('/college-admin/dashboard', { params })).data
    },
    refetchInterval: 30_000,
  })

  const allCourses = hierarchy?.courses ?? []
  const branches = courseId ? allCourses.find(c => c.id === courseId)?.branches ?? [] : allCourses.flatMap(c => c.branches)
  const semesters = branchId ? branches.find(b => b.id === branchId)?.semesters ?? [] : branches.flatMap(b => b.semesters)

  return (
    <div>
      <TopBar title="Reports & Analytics" subtitle="Filter by course, branch, or semester" />
      <div className="p-6 space-y-5">
        {/* Filters */}
        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">Filter</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Course</label>
              <select className="input" value={courseId} onChange={e => { setCourseId(e.target.value); setBranchId(''); setSemesterId('') }}>
                <option value="">All Courses</option>
                {allCourses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Branch</label>
              <select className="input" value={branchId} onChange={e => { setBranchId(e.target.value); setSemesterId('') }}>
                <option value="">All Branches</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Semester</label>
              <select className="input" value={semesterId} onChange={e => setSemesterId(e.target.value)}>
                <option value="">All Semesters</option>
                {semesters.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Stats */}
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner className="h-8 w-8" /></div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {[
              { label: 'Students', value: stats?.total_students ?? 0 },
              { label: 'Professors', value: stats?.total_professors ?? 0 },
              { label: 'Assignments', value: stats?.total_assignments ?? 0 },
              { label: 'Submissions', value: stats?.total_submissions ?? 0 },
              { label: 'Pending Evals', value: stats?.pending_evaluations ?? 0 },
              { label: 'Avg. Score', value: `${stats?.average_performance?.toFixed(1) ?? 0}%` },
            ].map(s => (
              <div key={s.label} className="card text-center">
                <p className="text-2xl font-bold text-gray-900">{s.value}</p>
                <p className="text-xs text-gray-400 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        <div className="card">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Download Reports</h2>
          <p className="text-sm text-gray-500 mb-4">
            Reports are generated automatically after each assignment deadline. Navigate to an assignment from the Professor's Assignment Detail page to download PDF, Excel, or CSV reports.
          </p>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <BarChart3 className="h-4 w-4" />
            Reports include: student name, roll number, email, marks, percentage, grade, submission time, status.
          </div>
        </div>
      </div>
    </div>
  )
}
