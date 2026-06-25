'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export interface MessengerAccount {
  id: string
  platform: string
  externalUserId: string
  createdAt: string
}

const MESSENGER_KEY = ['messenger-accounts']

/** 본인 메신저 연동 목록 */
export const useMyMessengerAccounts = () =>
  useQuery({
    queryKey: MESSENGER_KEY,
    queryFn: () =>
      apiClient.get('/integrations/messenger/accounts/me') as Promise<MessengerAccount[]>,
    staleTime: 30_000,
  })

/** 본인 메신저 연동 해제 */
export const useUnlinkMessenger = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/integrations/messenger/accounts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: MESSENGER_KEY }),
  })
}

/**
 * Discord OAuth 연동 시작 — 서버에서 인증 URL을 받아 그 페이지로 이동한다.
 * (start는 JWT 헤더가 필요해 브라우저 직접 이동이 안 되므로, URL만 받아 location 이동)
 */
export const startDiscordLink = async (): Promise<void> => {
  const { url } = (await apiClient.get('/integrations/discord/oauth/start')) as { url: string }
  window.location.href = url
}
