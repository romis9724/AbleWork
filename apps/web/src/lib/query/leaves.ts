'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export interface LeaveGroup {
  id: string
  name: string
  code?: string
  overageLimitDays: number
  isActive?: boolean
}

export interface LeaveType {
  id: string
  name: string
  displayName?: string
  code?: string | null
  timeOption: string
  paidHours?: number | null
  deductionDays: number
  specialOption?: string | null
  minConsecutiveDays?: number | null
  maxConsecutiveDays?: number | null
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

export const useUpdateLeaveGroup = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      apiClient.patch(`/leaves/groups/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: GROUPS_KEY }),
  })
}

export const useDeleteLeaveGroup = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/leaves/groups/${id}`),
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

export interface CompanyBalanceEntry {
  employee: { id: string; name: string }
  balances: LeaveBalance[]
}

export interface CompanyBalanceFilter {
  year?: number
  organizationId?: string
}

export const useCompanyLeaveBalances = (params?: CompanyBalanceFilter) =>
  useQuery({
    queryKey: ['leave-balances', params],
    queryFn: () =>
      apiClient.get('/leaves/balances', { params }) as Promise<CompanyBalanceEntry[]>,
    staleTime: 30_000,
  })

export interface Leave {
  id: string
  employeeId: string
  leaveTypeId: string
  startDate: string
  endDate: string
  daysUsed: number
  status: string
  reason?: string | null
  employee?: { id: string; name: string }
  leaveType?: { id: string; name: string; displayName?: string | null }
}

export interface LeaveListFilter {
  employeeId?: string
  leaveTypeId?: string
  startDate?: string
  endDate?: string
  page?: number
  limit?: number
}

export interface LeaveListResponse {
  items: Leave[]
  total: number
  page: number
  limit: number
}

export const useLeaves = (params?: LeaveListFilter) =>
  useQuery({
    queryKey: ['leaves', params],
    queryFn: () => apiClient.get('/leaves', { params }) as Promise<LeaveListResponse>,
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

export const useUpdateAccrualRule = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      apiClient.patch(`/leaves/accrual-rules/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: RULES_KEY }),
  })
}

export const useDeleteAccrualRule = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/leaves/accrual-rules/${id}`),
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave-balance'] })
      qc.invalidateQueries({ queryKey: ['leave-balances'] })
    },
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave-balance'] })
      qc.invalidateQueries({ queryKey: ['leave-balances'] })
    },
  })
}

export interface CreateLeavePayload {
  employeeId: string
  leaveTypeId: string
  startDate: string
  endDate: string
  reason?: string
}

export const useCreateLeave = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateLeavePayload) => apiClient.post('/leaves', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave-balance'] })
      qc.invalidateQueries({ queryKey: ['leave-balances'] })
      qc.invalidateQueries({ queryKey: ['leaves'] })
    },
  })
}

export const useRunAccrualRule = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      apiClient.post(`/leaves/accrual-rules/${id}/run`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave-balance'] })
      qc.invalidateQueries({ queryKey: ['leave-balances'] })
    },
  })
}
