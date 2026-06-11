'use client'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { AccessLevel } from '@ablework/shared-constants'

interface AuthUser {
  userId: string
  employeeId: string
  companyId: string
  accessLevel: AccessLevel
  name?: string
}

interface AuthState {
  user: AuthUser | null
  isAuthenticated: boolean
  setUser: (user: AuthUser) => void
  clearUser: () => void
}

const noopStorage = {
  getItem: (_name: string) => null,
  setItem: (_name: string, _value: string) => {},
  removeItem: (_name: string) => {},
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      setUser: (user) => set({ user, isAuthenticated: true }),
      clearUser: () => set({ user: null, isAuthenticated: false }),
    }),
    {
      name: 'ablework-auth',
      storage: createJSONStorage(() => {
        try {
          if (typeof window === 'undefined') return noopStorage
          if (typeof localStorage?.getItem !== 'function') return noopStorage
          localStorage.getItem('__test__')
          return localStorage
        } catch {
          return noopStorage
        }
      }),
      skipHydration: true,
    },
  ),
)
