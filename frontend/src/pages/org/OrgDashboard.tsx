import { useQuery } from '@tanstack/react-query'
import { Building2, Users, GraduationCap, BookOpen, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { TopBar } from '../../components/layout/TopBar'
import { StatCard } from '../../components/ui/StatCard'
import { Spinner } from '../../components/ui/Spinner'
import api from '../../lib/api'

export default function OrgDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['org-dashboard'],
    queryFn: async () => (await api.get('/org/dashboard')).data,
    refetchInterval: 60_000,
  })

  return (
    <div>
      <TopBar title="Organisation Dashboard" subtitle="Platform overview" />
      <div className="p-6 space-y-6">
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner className="h-8 w-8" /></div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="Colleges"   value={data?.total_colleges   ?? 0} icon={Building2}     iconBg="bg-violet-50" iconColor="text-violet-600" />
              <StatCard label="Total Users" value={data?.total_users     ?? 0} icon={Users}          iconBg="bg-blue-50"   iconColor="text-blue-600" />
              <StatCard label="Students"   value={data?.total_students   ?? 0} icon={GraduationCap} iconBg="bg-green-50"  iconColor="text-green-600" />
              <StatCard label="Professors" value={data?.total_professors ?? 0} icon={BookOpen}       iconBg="bg-orange-50" iconColor="text-orange-600" />
            </div>

            <div className="card">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Quick Actions</h2>
              <div className="flex gap-3 flex-wrap">
                <Link to="/org/colleges" className="btn-primary">
                  <Building2 className="h-4 w-4" /> Manage Colleges
                </Link>
                <Link to="/org/colleges" className="btn-secondary">
                  <Plus className="h-4 w-4" /> Add College
                </Link>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
