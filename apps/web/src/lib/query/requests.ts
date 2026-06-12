'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export interface Request {
  id: string
  type: string
  status: string
  payload: Record<string, unknown>
  createdAt: string
  requester?: { name: string }
  document?: { id: string; status: string }
}

export interface ApprovalRule {
  id: string
  name: string
  requestType: string
  maxApprovalRounds: number
  isAutoApprove: boolean
}

const QUERY_KEY = ['requests']
const RULES_KEY = ['approval-rules']

export const useRequests = (params?: Record<string, string | boolean | undefined>) =>
  useQuery({
    queryKey: [...QUERY_KEY, params],
    queryFn: () =>
      apiClient.get('/requests', { params }) as Promise<{ items?: Request[]; total?: number } | Request[]>,
    staleTime: 30_000,
  })

export const useCreateRequest = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { type: string; payload: Record<string, unknown> }) =>
      apiClient.post('/requests', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export const useApproveRequest = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, comment }: { id: string; comment?: string }) =>
      apiClient.post(`/requests/${id}/approve`, { comment }),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export const useRejectRequest = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, comment }: { id: string; comment?: string }) =>
      apiClient.post(`/requests/${id}/reject`, { comment }),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export const useForceApproveRequest = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, comment }: { id: string; comment?: string }) =>
      apiClient.post(`/requests/${id}/force-approve`, { comment }),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export const useForceRejectRequest = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, comment }: { id: string; comment?: string }) =>
      apiClient.post(`/requests/${id}/force-reject`, { comment }),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export const useBulkApprove = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids: string[]) => apiClient.post('/requests/bulk-approve', { requestIds: ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export const useApprovalRules = () =>
  useQuery({
    queryKey: RULES_KEY,
    queryFn: () => apiClient.get('/requests/approval-rules') as Promise<ApprovalRule[]>,
    staleTime: 60_000,
  })

export const useCreateApprovalRule = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: unknown) => apiClient.post('/requests/approval-rules', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: RULES_KEY }),
  })
}

export const useUpdateApprovalRule = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      apiClient.patch(`/requests/approval-rules/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: RULES_KEY }),
  })
}
