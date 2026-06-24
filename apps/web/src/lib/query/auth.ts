'use client'
import { useQuery, useMutation } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import type { AccessLevel } from '@ablework/shared-constants'

export interface MyCompany {
  companyId: string
  companyName: string
  logoUrl: string | null
  accessLevel: AccessLevel
  isCurrent: boolean
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

export interface AddCompanyInput {
  name: string
  businessNumber?: string
  foundedAt?: string
  timezone?: string
  locale?: string
  countryCode?: string
  logoUrl?: string
}

export const MY_COMPANIES_KEY = ['my-companies'] as const

/** 내 소속 회사 목록 (회사 전환 스위처용) */
export const useMyCompanies = (enabled = true) =>
  useQuery({
    queryKey: MY_COMPANIES_KEY,
    queryFn: () => apiClient.get('/auth/my-companies') as Promise<MyCompany[]>,
    staleTime: 60_000,
    enabled,
  })

/** 회사 전환 — 새 토큰 쌍을 반환한다. 캐시 무효화는 호출자가 처리. */
export const useSwitchCompany = () =>
  useMutation({
    mutationFn: (companyId: string) =>
      apiClient.post('/auth/switch-company', { companyId }) as Promise<AuthTokens>,
  })

/** 같은 그룹에 회사 추가 (SUPER_ADMIN) */
export const useAddCompany = () =>
  useMutation({
    mutationFn: (data: AddCompanyInput) =>
      apiClient.post('/companies/add', data) as Promise<{
        company: { id: string; name: string }
      }>,
  })
