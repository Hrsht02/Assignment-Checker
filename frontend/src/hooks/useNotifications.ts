import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import type { Notification } from '../types'

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await api.get('/notifications')
      return res.data as { notifications: Notification[]; unread_count: number }
    },
    refetchInterval: 30_000,
    // Don't retry on 4xx — avoids hammering the server with 403s when token is stale
    retry: (failureCount, error: any) => {
      const status = error?.response?.status
      if (status && status >= 400 && status < 500) return false
      return failureCount < 2
    },
  })
}

export function useMarkAllRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
}
