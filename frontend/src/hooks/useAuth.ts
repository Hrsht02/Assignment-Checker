import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../lib/api'
import { useAuthStore } from '../store/authStore'
import type { User } from '../types'

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
      redirectByRole(user.role, navigate)
    },
    onError: () => {
      toast.error('Invalid email/phone or password')
    },
  })
}

export function useSignup() {
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: async (data: {
      name: string
      email: string
      password: string
      role: string
      roll_number?: string
    }) => {
      const res = await api.post('/auth/signup', data)
      return res.data as { access_token: string; user: User }
    },
    onSuccess: ({ access_token, user }) => {
      setAuth(user, access_token)
      toast.success(`Welcome, ${user.name}!`)
      redirectByRole(user.role, navigate)
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail ?? 'Signup failed. Please try again.')
    },
  })
}

export function useLogout() {
  const { clearAuth } = useAuthStore()
  const navigate = useNavigate()

  return () => {
    clearAuth()
    navigate('/login')
  }
}

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const res = await api.get('/auth/me')
      return res.data as User
    },
    staleTime: 5 * 60 * 1000,
  })
}

function redirectByRole(role: string, navigate: ReturnType<typeof useNavigate>) {
  if (role === 'admin') navigate('/admin')
  else if (role === 'professor') navigate('/professor')
  else navigate('/student')
}
