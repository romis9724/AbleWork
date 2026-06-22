'use client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export type ResolutionStatus = 'OPEN' | 'RESOLVED'

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
  resolutionStatus: ResolutionStatus
  resolvedAt: string | null
  resolvedById: string | null
  createdAt: string
}

export interface ErrorAnalysisLogPage {
  items: ErrorAnalysisLog[]
  total: number
  page: number
  limit: number
}

export interface ErrorAnalysisLogParams {
  /** 날짜 단위(YYYY-MM-DD) — 하위 호환 */
  startDate?: string
  endDate?: string
  /** 시간 단위(ISO datetime) — 우선 적용 */
  from?: string
  to?: string
  resolutionStatus?: ResolutionStatus
  status?: number
  method?: string
  search?: string
  page?: number
  limit?: number
}

const QUERY_KEY = ['error-analysis-logs'] as const

export const useErrorAnalysisLogs = (params: ErrorAnalysisLogParams) =>
  useQuery({
    queryKey: [...QUERY_KEY, params],
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

/** 처리 상태 일괄 변경(완료/되돌리기). 성공 시 목록 캐시 무효화. */
export const useBulkResolveErrors = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: ResolutionStatus }) =>
      apiClient.patch('/error-analysis-logs/bulk-resolve', { ids, status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

/** 현재 필터를 적용한 CSV를 내려받는다(브라우저 다운로드 트리거). */
export async function downloadErrorAnalysisCsv(params: ErrorAnalysisLogParams): Promise<void> {
  // apiClient 응답 인터셉터는 Blob엔 res.data.data가 없어 res.data(Blob)로 폴백된다.
  const blob = (await apiClient.get('/error-analysis-logs/export', {
    params,
    responseType: 'blob',
  })) as unknown as Blob
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `error-analysis-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
