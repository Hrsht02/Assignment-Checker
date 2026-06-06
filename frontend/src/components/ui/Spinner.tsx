import { cn } from '../../lib/utils'

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'inline-block h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-primary-600',
        className
      )}
      role="status"
      aria-label="Loading"
    />
  )
}

export function FullPageSpinner() {
  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <Spinner className="h-10 w-10" />
    </div>
  )
}
