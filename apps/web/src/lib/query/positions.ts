'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export interface Position {
  id: string
  name: string
  color?: string
  sortOrder?: number
  isActive?: boolean
}

const QUERY_KEY = ['positions']

export const usePositions = () =>
  useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => apiClient.get('/positions') as Promise<Position[]>,
    staleTime: 60_000,
  })

export const useCreatePosition = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Position>) => apiClient.post('/positions', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export const useUpdatePosition = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Position> & { id: string }) =>
      apiClient.patch(`/positions/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export const useDeletePosition = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/positions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

// 정렬 순서 변경 — ids 순서대로 sortOrder 재설정 (낙관적 업데이트)
export const useReorderPositions = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids: string[]) => apiClient.patch('/positions/reorder', { ids }),
    onMutate: async (ids: string[]) => {
      await qc.cancelQueries({ queryKey: QUERY_KEY })
      const previous = qc.getQueryData<Position[]>(QUERY_KEY)
      if (previous) {
        const byId = new Map(previous.map((p) => [p.id, p]))
        const reordered = ids
          .map((id) => byId.get(id))
          .filter((p): p is Position => Boolean(p))
        qc.setQueryData<Position[]>(QUERY_KEY, reordered)
      }
      return { previous }
    },
    onError: (_err, _ids, ctx) => {
      if (ctx?.previous) qc.setQueryData(QUERY_KEY, ctx.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}
