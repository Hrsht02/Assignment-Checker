import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../lib/api'
import { useAuthStore } from '../store/authStore'
import type { User } from '../types'

function homeForRole(role: string) {
  if (role === 'org_admin') return '/org'
  if (role === 'college_admin') return '/college-admin'
  if (role === 'professor') return '/professor'
  return '/student'
}

export function useLogin() {
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      const res = await api.post('/auth/login', data)
      return res.data as { access_token: string; user: User }
    },
    onSuccess: ({ access_token, user }) => {
      setAuth(user, access_token)
      navigate(homeForRole(user.role))
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail ?? 'Invalid credentials')
    },
  })
}

export function useLogout() {
  const { clearAuth } = useAuthStore()
  const navigate = useNavigate()
  return () => { clearAuth(); navigate('/login') }
}

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => (await api.get('/auth/me')).data as User,
    staleTime: 5 * 60 * 1000,
  })
}
