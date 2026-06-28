'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export interface AttendanceBreak {
  id: string
  attendanceId: string
  breakType: string
  startAt: string
  endAt?: string | null
  isManual: boolean
}

export interface Attendance {
  id: string
  employeeId: string
  clockInAt: string
  clockOutAt?: string
  status: string
  isConfirmed: boolean
  note?: string
  employee?: { name: string }
  breaks?: AttendanceBreak[]
}

export interface MyTodayAttendance {
  attendance: (Attendance & { breaks: AttendanceBreak[] }) | null
  openBreak: AttendanceBreak | null
}

export interface NowAtWork {
  attendanceId: string
  employeeId: string
  employeeName: string
  employeeNumber?: string | null
  organization: { name: string } | null
  clockInAt: string
  status: string
  workingStatus: string
  isOncall: boolean
}

export interface NowAtWorkResponse {
  total: number
  items: NowAtWork[]
}

const QUERY_KEY = ['attendances']

export const useAttendances = (params?: Record<string, string | undefined>) =>
  useQuery({
    queryKey: [...QUERY_KEY, params],
    queryFn: () =>
      apiClient.get('/attendances', { params }) as Promise<{ items?: Attendance[]; total?: number } | Attendance[]>,
    staleTime: 30_000,
  })

export const useNowAtWork = (organizationId?: string) =>
  useQuery({
    queryKey: [...QUERY_KEY, 'now', organizationId ?? 'all'],
    queryFn: () =>
      apiClient.get('/attendances/now-at-work', {
        params: organizationId ? { organizationId } : {},
      }) as Promise<NowAtWorkResponse>,
    staleTime: 30_000,
    refetchInterval: 30_000,
  })

export interface ClockInPayload {
  lat?: number
  lng?: number
  method: string
  organizationId?: string
  timeclockAreaId?: string
  positionId?: string
  channel?: 'web' | 'app'
  note?: string
}

export const useClockIn = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: ClockInPayload) => apiClient.post('/attendances/clock-in', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export const useClockOut = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { lat?: number; lng?: number; method: string }) =>
      apiClient.post('/attendances/clock-out', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export const useMyTodayAttendance = () =>
  useQuery({
    queryKey: [...QUERY_KEY, 'me', 'today'],
    queryFn: () => apiClient.get('/attendances/me/today') as Promise<MyTodayAttendance>,
    staleTime: 10_000,
  })

export const useBreakStart = () => {
  const qc = useQueryClient()
  return useMutation({
    // breakType 미전달 시 BE 기본값('rest'). 식사/기타 휴게 구분을 위해 명시 전달 가능.
    mutationFn: (breakType?: 'rest' | 'meal' | 'other') =>
      apiClient.post('/attendances/break-start', breakType ? { breakType } : {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export const useBreakEnd = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiClient.post('/attendances/break-end'),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export const useCreateAttendance = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      employeeId: string
      clockInAt: string
      clockOutAt?: string
      status?: string
      note?: string
    }) => apiClient.post('/attendances', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export const useUpdateAttendanceBreaks = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      breaks,
    }: {
      id: string
      breaks: { id?: string; breakType: string; startAt: string; endAt?: string }[]
    }) => apiClient.patch(`/attendances/${id}/breaks`, { breaks }),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export const useUpdateAttendance = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      apiClient.patch(`/attendances/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export const useDeleteAttendance = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/attendances/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export const useConfirmPeriod = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      startDate?: string
      endDate?: string
      organizationId?: string
      attendanceIds?: string[]
    }) => apiClient.post('/attendances/confirm-period', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export const useUnconfirmAttendances = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { attendanceIds?: string[]; startDate?: string; endDate?: string }) =>
      apiClient.post('/attendances/unconfirm', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}
