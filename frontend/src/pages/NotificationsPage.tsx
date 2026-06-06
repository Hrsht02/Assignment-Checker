import { Bell, CheckCheck } from 'lucide-react'
import { TopBar } from '../components/layout/TopBar'
import { Spinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import { useNotifications, useMarkAllRead } from '../hooks/useNotifications'
import { formatRelative } from '../lib/utils'
import { cn } from '../lib/utils'

const typeColors: Record<string, string> = {
  assignment_posted: 'bg-blue-500',
  submission_received: 'bg-green-500',
  submission_accepted: 'bg-emerald-500',
  submission_rejected: 'bg-red-500',
  resubmission_requested: 'bg-orange-500',
  deadline_reminder: 'bg-yellow-500',
  marks_published: 'bg-violet-500',
  evaluation_complete: 'bg-teal-500',
  report_generated: 'bg-indigo-500',
  plagiarism_flagged: 'bg-red-500',
  extraction_failed: 'bg-red-400',
  evaluation_failed: 'bg-red-400',
  deadline_reached: 'bg-yellow-500',
}

export default function NotificationsPage() {
  const { data, isLoading } = useNotifications()
  const markAllRead = useMarkAllRead()
  const notifications = data?.notifications ?? []
  const unread = data?.unread_count ?? 0

  return (
    <div>
      <TopBar title="Notifications" subtitle={unread > 0 ? `${unread} unread` : 'All caught up'} />
      <div className="p-6 space-y-4 max-w-2xl">
        {unread > 0 && (
          <div className="flex justify-end">
            <button
              className="btn-secondary text-xs"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all as read
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner className="h-8 w-8" /></div>
        ) : notifications.length === 0 ? (
          <EmptyState icon={Bell} title="No notifications" description="You're all caught up." />
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={cn(
                  'flex gap-4 rounded-xl border p-4 transition-colors',
                  n.is_read
                    ? 'bg-white border-gray-100'
                    : 'bg-primary-50 border-primary-100'
                )}
              >
                {/* Dot indicator */}
                <div className="pt-1 shrink-0">
                  <div className={cn(
                    'h-2.5 w-2.5 rounded-full',
                    typeColors[n.type] ?? 'bg-gray-400'
                  )} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={cn(
                      'text-sm',
                      n.is_read ? 'font-normal text-gray-700' : 'font-semibold text-gray-900'
                    )}>
                      {n.title}
                    </p>
                    <span className="text-[11px] text-gray-400 whitespace-nowrap shrink-0">
                      {formatRelative(n.created_at)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-gray-500">{n.message}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
