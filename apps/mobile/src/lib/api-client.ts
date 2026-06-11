import axios from 'axios'
import * as SecureStore from 'expo-secure-store'

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'

export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 10000,
})

apiClient.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('accessToken')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

apiClient.interceptors.response.use(
  (res) => res.data.data ?? res.data,
  async (error) => {
    if (error.response?.status === 401) {
      try {
        const refreshToken = await SecureStore.getItemAsync('refreshToken')
        if (!refreshToken) throw new Error('No refresh token')

        const res = await axios.post(`${API_URL}/auth/refresh`, { refreshToken })
        const { accessToken: newToken } = res.data.data
        await SecureStore.setItemAsync('accessToken', newToken)

        error.config.headers.Authorization = `Bearer ${newToken}`
        return apiClient(error.config)
      } catch {
        await SecureStore.deleteItemAsync('accessToken')
        await SecureStore.deleteItemAsync('refreshToken')
        // 로그인 화면으로 이동 처리는 앱 레벨에서 처리
      }
    }
    return Promise.reject(error)
  },
)

export const authApi = {
  login: (email: string, password: string) =>
    apiClient.post<{ accessToken: string; refreshToken: string }>('/auth/login', { email, password }),
  refresh: (refreshToken: string) =>
    apiClient.post<{ accessToken: string; refreshToken: string }>('/auth/refresh', { refreshToken }),
}

export const attendanceApi = {
  clockIn: (lat: number, lng: number) =>
    apiClient.post('/attendances/clock-in', { lat, lng, method: 'gps' }),
  clockOut: (lat: number, lng: number) =>
    apiClient.post('/attendances/clock-out', { lat, lng, method: 'gps' }),
  getMyList: (params: Record<string, string>) =>
    apiClient.get('/attendances', { params }),
}
