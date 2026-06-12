'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export interface Attendance {
  id: string
  employeeId: string
  clockInAt: string
  clockOutAt?: string
  status: string
  isConfirmed: boolean
  note?: string
  employee?: { name: string }
}

export interface NowAtWork {
  employeeId: string
  name: string
  organization?: string
  status: string
  clockInAt?: string
  workMinutes?: number
}

const QUERY_KEY = ['attendances']

export const useAttendances = (params?: Record<string, string | undefined>) =>
  useQuery({
    queryKey: [...QUERY_KEY, params],
    queryFn: () =>
      apiClient.get('/attendances', { params }) as Promise<{ items?: Attendance[]; total?: number } | Attendance[]>,
    staleTime: 30_000,
  })

export const useNowAtWork = () =>
  useQuery({
    queryKey: [...QUERY_KEY, 'now'],
    queryFn: () => apiClient.get('/attendances/now-at-work') as Promise<NowAtWork[]>,
    staleTime: 30_000,
    refetchInterval: 30_000,
  })

export const useClockIn = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { lat?: number; lng?: number; method: string }) =>
      apiClient.post('/attendances/clock-in', data),
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

export const useBreakStart = () =>
  useMutation({ mutationFn: () => apiClient.post('/attendances/break-start') })

export const useBreakEnd = () =>
  useMutation({ mutationFn: () => apiClient.post('/attendances/break-end') })

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
    mutationFn: (data: { startDate: string; endDate: string; organizationId?: string }) =>
      apiClient.post('/attendances/confirm-period', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}
