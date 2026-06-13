'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export interface ShiftType {
  id: string
  name: string
  category: string
  color?: string
  isDeemedWork: boolean
  deemedWorkHours?: number | null
  noClockInRequired: boolean
  confirmedAlert?: string | null
  isActive: boolean
}

export interface ShiftTemplate {
  id: string
  name: string
  code?: string
  startTime: string
  endTime: string
  shiftTypeId: string
  shiftType?: ShiftType
  isActive: boolean
}

export interface Shift {
  id: string
  employeeId: string
  organizationId: string
  startAt: string
  endAt: string
  status: string
  shiftType?: ShiftType
  template?: ShiftTemplate
  employee?: { name: string }
}

/** 생성/확정 응답 — 주 52시간 초과 시 warning 메시지 포함 */
export type ShiftMutationResult = Shift & { warning?: string }

const SHIFT_TYPES_KEY = ['shift-types']
const SHIFT_TEMPLATES_KEY = ['shift-templates']
const SHIFTS_KEY = ['shifts']

export const useShiftTypes = () =>
  useQuery({
    queryKey: SHIFT_TYPES_KEY,
    queryFn: () => apiClient.get('/shift-types') as Promise<ShiftType[]>,
    staleTime: 60_000,
  })

export const useCreateShiftType = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: unknown) => apiClient.post('/shift-types', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: SHIFT_TYPES_KEY }),
  })
}

export const useUpdateShiftType = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      apiClient.patch(`/shift-types/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: SHIFT_TYPES_KEY }),
  })
}

export const useDeleteShiftType = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/shift-types/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: SHIFT_TYPES_KEY }),
  })
}

export const useShiftTemplates = () =>
  useQuery({
    queryKey: SHIFT_TEMPLATES_KEY,
    queryFn: () => apiClient.get('/shift-templates') as Promise<ShiftTemplate[]>,
    staleTime: 60_000,
  })

export const useCreateShiftTemplate = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: unknown) => apiClient.post('/shift-templates', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: SHIFT_TEMPLATES_KEY }),
  })
}

export const useUpdateShiftTemplate = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      apiClient.patch(`/shift-templates/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: SHIFT_TEMPLATES_KEY }),
  })
}

export const useDeleteShiftTemplate = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/shift-templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: SHIFT_TEMPLATES_KEY }),
  })
}

export const useShifts = (params?: Record<string, string | undefined>) =>
  useQuery({
    queryKey: [...SHIFTS_KEY, params],
    queryFn: () => apiClient.get('/shifts', { params }) as Promise<Shift[]>,
    staleTime: 30_000,
  })

export const useCreateShift = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: unknown) =>
      apiClient.post('/shifts', data) as Promise<ShiftMutationResult>,
    onSuccess: () => qc.invalidateQueries({ queryKey: SHIFTS_KEY }),
  })
}

export const useUpdateShift = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      apiClient.patch(`/shifts/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: SHIFTS_KEY }),
  })
}

export const useDeleteShift = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/shifts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: SHIFTS_KEY }),
  })
}

export const useConfirmShift = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post(`/shifts/${id}/confirm`) as Promise<ShiftMutationResult>,
    onSuccess: () => qc.invalidateQueries({ queryKey: SHIFTS_KEY }),
  })
}

/** 확정 해제 — GENERAL_ADMIN 이상 (BE: POST /shifts/:id/unconfirm) */
export const useUnconfirmShift = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post(`/shifts/${id}/unconfirm`) as Promise<Shift>,
    onSuccess: () => qc.invalidateQueries({ queryKey: SHIFTS_KEY }),
  })
}

/** 일괄 생성 입력 — BE BulkCreateShiftSchema와 동일 구조 */
export interface BulkCreateShiftInput {
  templateId: string
  organizationId: string
  employeeIds: string[]
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
}

export interface BulkCreateShiftResult {
  created: number
  warnings?: string[]
}

export const useBulkCreateShifts = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: BulkCreateShiftInput) =>
      apiClient.post('/shifts/bulk', data) as Promise<BulkCreateShiftResult>,
    onSuccess: () => qc.invalidateQueries({ queryKey: SHIFTS_KEY }),
  })
}
