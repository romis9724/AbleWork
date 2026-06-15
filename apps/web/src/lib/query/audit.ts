'use client'
import { useQuery } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export interface AuditLog {
  id: string
  companyId: string
  actorId: string | null
  actorName: string
  action: string
  targetType: string
  targetId: string | null
  targetLabel: string | null
  result: 'SUCCESS' | 'FAIL'
  detail: Record<string, unknown> | null
  createdAt: string
}

export interface AuditLogPage {
  items: AuditLog[]
  total: number
  page: number
  limit: number
}

export interface AuditLogParams {
  startDate?: string
  endDate?: string
  actorId?: string
  action?: string
  search?: string
  page?: number
  limit?: number
}

export const useAuditLogs = (params: AuditLogParams) =>
  useQuery({
    queryKey: ['audit-logs', params],
    queryFn: () =>
      apiClient.get('/audit-logs', { params }) as Promise<AuditLogPage | AuditLog[]>,
    staleTime: 30_000,
  })
