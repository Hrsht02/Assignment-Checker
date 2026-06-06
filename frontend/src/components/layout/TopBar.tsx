import { Bell } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useNotifications } from '../../hooks/useNotifications'

interface TopBarProps {
  title: string
  subtitle?: string
}

export function TopBar({ title, subtitle }: TopBarProps) {
  const { user } = useAuthStore()
  const { data: notifData } = useNotifications()
  const unread = notifData?.unread_count ?? 0

  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
        {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3">
        <Link
          to={`/${user?.role}/notifications`}
          className="relative rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Link>
      </div>
    </header>
  )
}
