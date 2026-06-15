import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'
import type { AccessLevel } from '@ablework/shared-constants'
import { authApi } from '@/lib/api'
import {
  getApiErrorMessage,
  setAuthFailureHandler,
  setAuthRefreshHandler,
  TOKEN_KEYS,
} from '@/lib/api-client'
import { decodeJwt, isTokenExpired } from '@/lib/jwt'

export interface AuthUser {
  userId: string
  employeeId: string
  companyId: string
  accessLevel: AccessLevel
  name?: string
}

interface AuthState {
  user: AuthUser | null
  isAuthenticated: boolean
  isHydrating: boolean
  hydrate: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  setName: (name: string) => void
}

/** 토큰 클레임을 앱 사용자 모델로 변환 */
function userFromToken(accessToken: string): AuthUser | null {
  const claims = decodeJwt(accessToken)
  if (!claims || isTokenExpired(claims)) return null
  return {
    userId: claims.sub,
    employeeId: claims.employeeId,
    companyId: claims.companyId,
    accessLevel: claims.accessLevel,
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isHydrating: true,

  hydrate: async () => {
    try {
      const accessToken = await SecureStore.getItemAsync(TOKEN_KEYS.access)
      if (!accessToken) {
        set({ user: null, isAuthenticated: false })
        return
      }
      const user = userFromToken(accessToken)
      if (user) {
        set({ user, isAuthenticated: true })
        return
      }

      // access token 만료/손상 — 유효한 refresh token이 있으면 회전을 시도한다.
      // (access는 단명, refresh는 7일이므로 앱을 다시 열 때 access 만료는 정상 상황)
      const refreshToken = await SecureStore.getItemAsync(TOKEN_KEYS.refresh)
      if (refreshToken) {
        try {
          const tokens = await authApi.refresh(refreshToken)
          const refreshed = userFromToken(tokens.accessToken)
          if (refreshed) {
            await SecureStore.setItemAsync(TOKEN_KEYS.access, tokens.accessToken)
            if (tokens.refreshToken) {
              await SecureStore.setItemAsync(TOKEN_KEYS.refresh, tokens.refreshToken)
            }
            set({ user: refreshed, isAuthenticated: true })
            return
          }
        } catch {
          // refresh 실패(만료/무효) — 아래에서 토큰을 정리한다.
        }
      }

      // 복원 불가 — 토큰 정리 후 로그인 화면으로
      await SecureStore.deleteItemAsync(TOKEN_KEYS.access)
      await SecureStore.deleteItemAsync(TOKEN_KEYS.refresh)
      set({ user: null, isAuthenticated: false })
    } finally {
      set({ isHydrating: false })
    }
  },

  login: async (email, password) => {
    try {
      const { accessToken, refreshToken } = await authApi.login(email, password)
      await SecureStore.setItemAsync(TOKEN_KEYS.access, accessToken)
      await SecureStore.setItemAsync(TOKEN_KEYS.refresh, refreshToken)
      const user = userFromToken(accessToken)
      if (!user) throw new Error('로그인 토큰을 처리하지 못했습니다.')
      set({ user, isAuthenticated: true })
    } catch (error) {
      throw new Error(getApiErrorMessage(error, '이메일 또는 비밀번호가 올바르지 않습니다.'))
    }
  },

  logout: async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEYS.access)
    await SecureStore.deleteItemAsync(TOKEN_KEYS.refresh)
    set({ user: null, isAuthenticated: false })
  },

  setName: (name) => {
    const { user } = get()
    if (!user) return
    set({ user: { ...user, name } })
  },
}))

// Refresh 실패(세션 만료) 시 스토어를 비워 라우팅 가드가 로그인으로 보낸다.
setAuthFailureHandler(() => {
  useAuthStore.setState({ user: null, isAuthenticated: false })
})

// 토큰 회전 성공 시 새 클레임의 accessLevel 등을 즉시 반영한다 (name은 보존).
setAuthRefreshHandler((newAccessToken) => {
  const next = userFromToken(newAccessToken)
  if (!next) return
  useAuthStore.setState((s) => ({
    user: { ...next, name: s.user?.name },
    isAuthenticated: true,
  }))
})
