import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow, isPast } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date): string {
  return format(new Date(date), 'MMM d, yyyy')
}

export function formatDateTime(date: string | Date): string {
  return format(new Date(date), 'MMM d, yyyy HH:mm')
}

export function formatRelative(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true })
}

export function isDeadlinePast(deadline: string | Date): boolean {
  return isPast(new Date(deadline))
}

export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    submitted: 'bg-blue-100 text-blue-800',
    evaluating: 'bg-yellow-100 text-yellow-800',
    evaluated: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
    similarity_review: 'bg-orange-100 text-orange-800',
    resubmission_requested: 'bg-purple-100 text-purple-800',
    extraction_failed: 'bg-red-100 text-red-800',
    evaluation_failed: 'bg-red-100 text-red-800',
    active: 'bg-green-100 text-green-800',
    closed: 'bg-gray-100 text-gray-800',
    pending: 'bg-yellow-100 text-yellow-800',
  }
  return map[status] ?? 'bg-gray-100 text-gray-800'
}

export function formatStatus(status: string): string {
  return status
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
