'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export interface LeaveGroup {
  id: string
  name: string
  code?: string
  overageLimitDays: number
}

export interface LeaveType {
  id: string
  name: string
  displayName?: string
  timeOption: string
  deductionDays: number
  isActive: boolean
  group?: LeaveGroup
}

export interface LeaveBalance {
  id: string
  leaveTypeId: string
  year: number
  accruedDays: number
  usedDays: number
  remainingDays: number
  expiresAt?: string
  leaveType?: LeaveType
}

const GROUPS_KEY = ['leave-groups']
const TYPES_KEY = ['leave-types']
const RULES_KEY = ['leave-accrual-rules']

export const useLeaveGroups = () =>
  useQuery({
    queryKey: GROUPS_KEY,
    queryFn: () => apiClient.get('/leaves/groups') as Promise<LeaveGroup[]>,
    staleTime: 60_000,
  })

export const useCreateLeaveGroup = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: unknown) => apiClient.post('/leaves/groups', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: GROUPS_KEY }),
  })
}

export const useLeaveTypes = () =>
  useQuery({
    queryKey: TYPES_KEY,
    queryFn: () => apiClient.get('/leaves/types') as Promise<LeaveType[]>,
    staleTime: 60_000,
  })

export const useCreateLeaveType = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: unknown) => apiClient.post('/leaves/types', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: TYPES_KEY }),
  })
}

export const useUpdateLeaveType = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      apiClient.patch(`/leaves/types/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: TYPES_KEY }),
  })
}

export const useLeaveBalance = (employeeId: string) =>
  useQuery({
    queryKey: ['leave-balance', employeeId],
    queryFn: () => apiClient.get(`/leaves/balance/${employeeId}`) as Promise<LeaveBalance[]>,
    enabled: !!employeeId,
  })

export const useAccrualRules = () =>
  useQuery({
    queryKey: RULES_KEY,
    queryFn: () => apiClient.get('/leaves/accrual-rules'),
    staleTime: 60_000,
  })

export const useCreateAccrualRule = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: unknown) => apiClient.post('/leaves/accrual-rules', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: RULES_KEY }),
  })
}

export const useDeleteLeaveType = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/leaves/types/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: TYPES_KEY }),
  })
}

export interface AccrualRuleItem {
  id: string
  accrualBasis: 'monthly' | 'yearly'
  tenureMonths?: number | null
  tenureYears?: number | null
  accrualDays: number
  validMonths?: number | null
  periodStartMd?: string | null
  periodEndMd?: string | null
  sortOrder: number
}

export interface AccrualRule {
  id: string
  name: string
  memo?: string
  isActive: boolean
  leaveGroup?: { id: string; name: string }
  items?: AccrualRuleItem[]
}

export interface ManualAccrualPayload {
  employeeIds: string[]
  leaveTypeId: string
  year?: number
  days: number
  expiresAt?: string
  note?: string
}

export const useManualAccrual = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: ManualAccrualPayload) => apiClient.post('/leaves/accrual', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leave-balance'] }),
  })
}

export interface CompensationAccrualPayload {
  employeeId: string
  leaveTypeId: string
  year?: number
  days: number
  expiresAt?: string
  reason?: string
}

export const useCompensationAccrual = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CompensationAccrualPayload) =>
      apiClient.post('/leaves/compensation', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leave-balance'] }),
  })
}

export const useRunAccrualRule = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      apiClient.post(`/leaves/accrual-rules/${id}/run`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leave-balance'] }),
  })
}
