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
    refetchInterval: 30_000, // poll every 30 seconds
  })
}

export function useMarkAllRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
}
