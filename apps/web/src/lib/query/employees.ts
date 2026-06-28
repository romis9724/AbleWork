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
  /** 다중 선택(검색영역). 서버에는 콤마 구분 문자열로 전송된다. */
  organizationIds?: string[]
  positionIds?: string[]
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
    queryFn: () => {
      const { organizationIds, positionIds, ...rest } = params ?? {}
      // 배열은 axios 기본 직렬화([]) 대신 콤마 구분 문자열로 전송(서버 DTO와 정합)
      const query = {
        ...rest,
        organizationIds: organizationIds?.length ? organizationIds.join(',') : undefined,
        positionIds: positionIds?.length ? positionIds.join(',') : undefined,
      }
      return apiClient.get('/employees', { params: query }) as Promise<EmployeeListResponse>
    },
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

/** 직원 로그인 비밀번호 재설정 (계정 활성화) */
export const useResetPassword = () =>
  useMutation({
    mutationFn: ({ id, newPassword }: { id: string; newPassword: string }) =>
      apiClient.post(`/employees/${id}/reset-password`, { newPassword }),
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

export const useUpdateWageInfo = (employeeId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ wageId, ...data }: { wageId: string } & Record<string, unknown>) =>
      apiClient.patch(`/employees/${employeeId}/wage-info/${wageId}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wage-infos', employeeId] }),
  })
}

export const useDeleteWageInfo = (employeeId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (wageId: string) => apiClient.delete(`/employees/${employeeId}/wage-info/${wageId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wage-infos', employeeId] }),
  })
}
