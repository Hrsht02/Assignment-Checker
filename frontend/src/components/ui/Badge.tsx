import { cn, getStatusColor, formatStatus } from '../../lib/utils'

interface BadgeProps {
  status: string
  label?: string
  className?: string
}

export function Badge({ status, label, className }: BadgeProps) {
  return (
    <span className={cn('badge', getStatusColor(status), className)}>
      {label ?? formatStatus(status)}
    </span>
  )
}
