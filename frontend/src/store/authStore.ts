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
        // Write state — zustand-persist will sync to localStorage synchronously
        // because we use the default synchronous storage (localStorage).
        set({ user, token })

        // Belt-and-suspenders: also write directly so api.ts getToken()
        // picks it up immediately on the very next request (before any re-render).
        try {
          const existing = localStorage.getItem('auth-storage')
          const parsed = existing ? JSON.parse(existing) : { state: {}, version: 0 }
          parsed.state = { ...parsed.state, user, token }
          localStorage.setItem('auth-storage', JSON.stringify(parsed))
        } catch {
          // ignore
        }
      },

      clearAuth: () => {
        localStorage.removeItem('auth-storage')
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
