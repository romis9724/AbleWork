'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export interface Company {
  id: string
  name: string
  businessNumber?: string | null
  foundedAt?: string | null
  timezone: string
  locale: string
  countryCode: string
  logoUrl?: string | null
}

export interface CompanyHoliday {
  id: string
  name: string
  holidayDate: string
  isAnnualRepeat: boolean
  type: string
}

export interface CreateCompanyHolidayInput {
  name: string
  holidayDate: string
  isAnnualRepeat?: boolean
  type?: string
}

const COMPANY_KEY = (id: string) => ['company', id]
const HOLIDAYS_KEY = ['company-holidays']

export const useCompany = (id?: string) =>
  useQuery({
    queryKey: COMPANY_KEY(id ?? ''),
    queryFn: () => apiClient.get(`/companies/${id}`) as Promise<Company>,
    enabled: Boolean(id),
    staleTime: 60_000,
  })

export const useUpdateCompany = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Company> & { id: string }) =>
      apiClient.patch(`/companies/${id}`, data) as Promise<Company>,
    onSuccess: (_data, { id }) => qc.invalidateQueries({ queryKey: COMPANY_KEY(id) }),
  })
}

export const useCompanyHolidays = () =>
  useQuery({
    queryKey: HOLIDAYS_KEY,
    queryFn: () => apiClient.get('/company-holidays') as Promise<CompanyHoliday[]>,
    staleTime: 60_000,
  })

export const useCreateCompanyHoliday = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateCompanyHolidayInput) =>
      apiClient.post('/company-holidays', data) as Promise<CompanyHoliday>,
    onSuccess: () => qc.invalidateQueries({ queryKey: HOLIDAYS_KEY }),
  })
}

export const useDeleteCompanyHoliday = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/company-holidays/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: HOLIDAYS_KEY }),
  })
}
