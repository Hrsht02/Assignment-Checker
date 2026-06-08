import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, ExternalLink } from 'lucide-react'
import { TopBar } from '../components/layout/TopBar'
import { Spinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import { useNotifications, useMarkAllRead } from '../hooks/useNotifications'
import { useAuthStore } from '../store/authStore'
import { formatRelative } from '../lib/utils'
import { cn } from '../lib/utils'
import api from '../lib/api'

// Map notification type + reference to the correct route
function getNotificationLink(n: {
  type: string
  reference_id?: string
  reference_type?: string
}, role: string): string | null {
  const { type, reference_id, reference_type } = n
  if (!reference_id) return null

  if (reference_type === 'assignment') {
    if (role === 'student') return `/student/assignments/${reference_id}`
    if (role === 'professor') return `/professor/assignments/${reference_id}`
  }
  if (reference_type === 'submission') {
    if (role === 'professor') return `/professor/submissions`
  }
  if (type === 'report_generated' && reference_type === 'assignment') {
    if (role === 'professor') return `/professor/assignments/${reference_id}`
  }
  return null
}

const typeColors: Record<string, string> = {
  assignment_posted:      'bg-blue-500',
  submission_received:    'bg-green-500',
  submission_accepted:    'bg-emerald-500',
  submission_rejected:    'bg-red-500',
  resubmission_requested: 'bg-orange-500',
  deadline_reminder:      'bg-yellow-500',
  marks_published:        'bg-violet-500',
  evaluation_complete:    'bg-teal-500',
  report_generated:       'bg-indigo-500',
  plagiarism_flagged:     'bg-red-500',
  extraction_failed:      'bg-red-400',
  evaluation_failed:      'bg-red-400',
  deadline_reached:       'bg-yellow-500',
}

export default function NotificationsPage() {
  const { data, isLoading, refetch } = useNotifications()
  const markAllRead = useMarkAllRead()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const notifications = data?.notifications ?? []
  const unread = data?.unread_count ?? 0

  const handleClick = async (n: any) => {
    // Mark as read
    if (!n.is_read) {
      try {
        await api.post('/notifications/read', [n.id])
        refetch()
      } catch { /* ignore */ }
    }

    // Navigate to relevant page
    const link = getNotificationLink(n, user?.role ?? '')
    if (link) navigate(link)
  }

  return (
    <div>
      <TopBar
        title="Notifications"
        subtitle={unread > 0 ? `${unread} unread` : 'All caught up'}
      />
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
            {notifications.map((n) => {
              const link = getNotificationLink(n, user?.role ?? '')
              const isClickable = !!link

              return (
                <div
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={cn(
                    'flex gap-4 rounded-xl border p-4 transition-all',
                    n.is_read
                      ? 'bg-white border-gray-100'
                      : 'bg-primary-50 border-primary-100',
                    isClickable
                      ? 'cursor-pointer hover:shadow-sm hover:border-primary-300 hover:bg-primary-50/80'
                      : 'cursor-default'
                  )}
                  role={isClickable ? 'button' : undefined}
                  tabIndex={isClickable ? 0 : undefined}
                  onKeyDown={e => e.key === 'Enter' && isClickable && handleClick(n)}
                  aria-label={isClickable ? `${n.title} — click to view` : n.title}
                >
                  {/* Color dot */}
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
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[11px] text-gray-400 whitespace-nowrap">
                          {formatRelative(n.created_at)}
                        </span>
                        {isClickable && (
                          <ExternalLink className="h-3.5 w-3.5 text-gray-300" />
                        )}
                      </div>
                    </div>
                    <p className="mt-0.5 text-sm text-gray-500">{n.message}</p>
                    {isClickable && (
                      <p className="mt-1 text-xs text-primary-500 font-medium">
                        Click to view →
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
