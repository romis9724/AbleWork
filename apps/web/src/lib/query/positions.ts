'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export interface Position {
  id: string
  name: string
  color?: string
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
