import { BarChart3 } from 'lucide-react'
import { TopBar } from '../../components/layout/TopBar'
import { EmptyState } from '../../components/ui/EmptyState'

export default function AdminReportsPage() {
  return (
    <div>
      <TopBar title="Reports" subtitle="Institution-wide marks reports" />
      <div className="p-6">
        <EmptyState
          icon={BarChart3}
          title="Reports available per assignment"
          description="Reports are generated automatically after each assignment deadline. Navigate to a semester → section → assignment to download reports in PDF, Excel, or CSV."
        />
      </div>
    </div>
  )
}
