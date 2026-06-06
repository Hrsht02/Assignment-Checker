import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '../types'

interface AuthState {
  user: User | null
  token: string | null
  setAuth: (user: User, token: string) => void
  clearAuth: () => void
  isAuthenticated: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      setAuth: (user, token) => {
        localStorage.setItem('access_token', token)
        set({ user, token })
      },
      clearAuth: () => {
        localStorage.removeItem('access_token')
        set({ user: null, token: null })
      },
      isAuthenticated: () => !!get().token && !!get().user,
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ user: state.user, token: state.token }),
    }
  )
)
