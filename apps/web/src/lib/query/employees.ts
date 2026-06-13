'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export interface Employee {
  id: string
  name: string
  employeeNumber?: string
  phone?: string
  joinedAt: string
  resignedAt?: string
  employmentType: string
  accessLevel: string
  deviceId?: string
  isActive: boolean
  user?: { email: string }
  organizations?: { organization: { id: string; name: string }; isPrimary: boolean }[]
  positions?: { position: { id: string; name: string } }[]
}

export interface EmployeeFilterParams {
  search?: string
  organizationId?: string
  positionId?: string
  isActive?: boolean
  page?: number
  limit?: number
}

export interface EmployeeListResponse {
  items: Employee[]
  total: number
  page: number
  limit: number
}

const QUERY_KEY = ['employees']

export const useEmployees = (params?: EmployeeFilterParams) =>
  useQuery({
    queryKey: [...QUERY_KEY, params],
    queryFn: () => apiClient.get('/employees', { params }) as Promise<EmployeeListResponse>,
    staleTime: 30_000,
  })

export const useEmployee = (id: string) =>
  useQuery({
    queryKey: [...QUERY_KEY, id],
    queryFn: () => apiClient.get(`/employees/${id}`) as Promise<Employee>,
    enabled: !!id,
  })

export const useCreateEmployee = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: unknown) => apiClient.post('/employees', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export const useUpdateEmployee = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      apiClient.patch(`/employees/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export const useDeactivateEmployee = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      apiClient.post(`/employees/${id}/deactivate`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export const useActivateEmployee = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/employees/${id}/activate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export const useResetDevice = () =>
  useMutation({
    mutationFn: (id: string) => apiClient.post(`/employees/${id}/reset-device`),
  })

export const useWageInfos = (employeeId: string) =>
  useQuery({
    queryKey: ['wage-infos', employeeId],
    queryFn: () => apiClient.get(`/employees/${employeeId}/wage-info`),
    enabled: !!employeeId,
  })

export const useCreateWageInfo = (employeeId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: unknown) => apiClient.post(`/employees/${employeeId}/wage-info`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wage-infos', employeeId] }),
  })
}
