'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export interface Organization {
  id: string
  companyId: string
  parentId: string | null
  name: string
  depth: number
  sortOrder: number
  approverId: string | null
  isActive: boolean
  children?: Organization[]
}

const QUERY_KEY = ['organizations']

export const useOrganizations = () =>
  useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => apiClient.get('/organizations') as Promise<Organization[]>,
    staleTime: 60_000,
  })

export const useCreateOrganization = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Organization>) => apiClient.post('/organizations', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export const useUpdateOrganization = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Organization> & { id: string }) =>
      apiClient.patch(`/organizations/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export const useDeleteOrganization = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/organizations/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}
