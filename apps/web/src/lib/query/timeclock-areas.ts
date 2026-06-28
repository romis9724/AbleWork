'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export type AuthMethod = 'gps' | 'wifi' | 'gps_or_wifi' | 'gps_and_wifi' | 'none'

export interface TimeclockArea {
  id: string
  name: string
  organizationId: string
  organization?: { id: string; name: string }
  authMethod: AuthMethod
  locationLat?: number | null
  locationLng?: number | null
  locationRadiusMeters?: number | null
  wifiSsid?: string | null
  isActive?: boolean
}

const QUERY_KEY = ['timeclock-areas']

// organizationId 지정 시 해당 조직의 장소만 조회 (무일정 출근 모달에서 선택 조직 기준)
export const useTimeclockAreas = (organizationId?: string) =>
  useQuery({
    queryKey: [...QUERY_KEY, organizationId ?? 'all'],
    queryFn: () =>
      apiClient.get('/timeclock-areas', {
        params: organizationId ? { organizationId } : {},
      }) as Promise<TimeclockArea[]>,
    staleTime: 60_000,
  })

export const useCreateTimeclockArea = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<TimeclockArea>) => apiClient.post('/timeclock-areas', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export const useUpdateTimeclockArea = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<TimeclockArea> & { id: string }) =>
      apiClient.patch(`/timeclock-areas/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export const useDeleteTimeclockArea = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/timeclock-areas/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}
