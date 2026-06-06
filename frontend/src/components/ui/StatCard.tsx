import { cn } from '../../lib/utils'
import type { LucideIcon } from 'lucide-react'

interface StatCardProps {
  label: string
  value: string | number
  icon: LucideIcon
  iconColor?: string
  iconBg?: string
  trend?: string
}

export function StatCard({ label, value, icon: Icon, iconColor = 'text-primary-600', iconBg = 'bg-primary-50', trend }: StatCardProps) {
  return (
    <div className="card flex items-start gap-4">
      <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl', iconBg)}>
        <Icon className={cn('h-5 w-5', iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-gray-500">{label}</p>
        <p className="mt-0.5 text-2xl font-bold text-gray-900">{value}</p>
        {trend && <p className="mt-0.5 text-xs text-gray-400">{trend}</p>}
      </div>
    </div>
  )
}
