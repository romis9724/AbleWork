'use client'
import { useQuery } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export interface ErrorAnalysisLog {
  id: string
  companyId: string
  status: number
  code: string
  message: string
  method: string
  path: string
  userId: string | null
  detail: unknown
  stack: string | null
  aiAnalysis: string | null
  aiEnabled: boolean
  notifiedEmail: boolean
  notifiedDiscord: boolean
  createdAt: string
}

export interface ErrorAnalysisLogPage {
  items: ErrorAnalysisLog[]
  total: number
  page: number
  limit: number
}

export interface ErrorAnalysisLogParams {
  startDate?: string
  endDate?: string
  status?: number
  method?: string
  search?: string
  page?: number
  limit?: number
}

export const useErrorAnalysisLogs = (params: ErrorAnalysisLogParams) =>
  useQuery({
    queryKey: ['error-analysis-logs', params],
    queryFn: () =>
      apiClient.get('/error-analysis-logs', { params }) as Promise<
        ErrorAnalysisLogPage | ErrorAnalysisLog[]
      >,
    staleTime: 30_000,
  })

export const useErrorAnalysisLog = (id: string | null) =>
  useQuery({
    queryKey: ['error-analysis-log', id],
    queryFn: () => apiClient.get(`/error-analysis-logs/${id}`) as Promise<ErrorAnalysisLog>,
    enabled: !!id,
  })
