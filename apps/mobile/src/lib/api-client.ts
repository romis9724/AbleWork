import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import * as SecureStore from 'expo-secure-store'

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'

export const TOKEN_KEYS = {
  access: 'accessToken',
  refresh: 'refreshToken',
} as const

/**
 * Refresh 실패(세션 만료) 시 호출되는 콜백.
 * auth 스토어가 등록하여 토큰 정리 + 로그인 화면 전환을 수행한다.
 */
let onAuthFailure: (() => void) | null = null

export function setAuthFailureHandler(handler: () => void): void {
  onAuthFailure = handler
}

/**
 * 토큰 회전(refresh 성공) 시 호출되는 콜백.
 * auth 스토어가 등록하여 새 토큰 클레임으로 user(accessLevel 포함)를 즉시 갱신한다.
 * (서버 refresh는 DB에서 accessLevel을 재발급하므로 권한 변경이 즉시 반영되어야 함)
 */
let onAuthRefresh: ((newAccessToken: string) => void) | null = null

export function setAuthRefreshHandler(handler: (newAccessToken: string) => void): void {
  onAuthRefresh = handler
}

export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 10000,
})

apiClient.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync(TOKEN_KEYS.access)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

apiClient.interceptors.response.use(
  // 성공 응답은 { success, data } 봉투를 벗겨 data 만 반환한다.
  (res) => res.data?.data ?? res.data,
  async (error: AxiosError) => {
    const originalRequest = error.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean })
      | undefined

    // 로그인/갱신 엔드포인트는 재시도하지 않는다 (무한 루프 방지).
    const isAuthEndpoint = originalRequest?.url?.includes('/auth/')

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true
      try {
        const refreshToken = await SecureStore.getItemAsync(TOKEN_KEYS.refresh)
        if (!refreshToken) throw new Error('No refresh token')

        const res = await axios.post(`${API_URL}/auth/refresh`, { refreshToken })
        const { accessToken: newToken, refreshToken: newRefresh } = res.data.data
        await SecureStore.setItemAsync(TOKEN_KEYS.access, newToken)
        if (newRefresh) await SecureStore.setItemAsync(TOKEN_KEYS.refresh, newRefresh)

        // 새 토큰의 클레임(accessLevel 등)을 스토어에 즉시 반영
        onAuthRefresh?.(newToken)

        originalRequest.headers.Authorization = `Bearer ${newToken}`
        return apiClient(originalRequest)
      } catch {
        await SecureStore.deleteItemAsync(TOKEN_KEYS.access)
        await SecureStore.deleteItemAsync(TOKEN_KEYS.refresh)
        onAuthFailure?.()
      }
    }
    return Promise.reject(error)
  },
)

/** API 에러에서 사용자 노출용 메시지를 안전하게 추출한다. */
export function getApiErrorMessage(error: unknown, fallback = '요청 처리 중 오류가 발생했습니다.'): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { error?: { message?: string }; message?: string } | undefined
    return data?.error?.message ?? data?.message ?? fallback
  }
  if (error instanceof Error && error.message) return error.message
  return fallback
}
