'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export interface MessageTemplate {
  id: string
  name: string
  content: string
  hasVariables?: boolean
  createdAt: string
}

export interface MessageLog {
  id: string
  title?: string
  type?: string
  /** GET /messages는 로그인 사용자가 수신한 메시지를 반환한다 (집계 필드 없음) */
  recipientCount?: number
  readCount?: number
  sentAt?: string
  /** 읽음 처리 시각. null이면 미열람 */
  readAt?: string | null
  createdAt?: string
}

const TEMPLATES_KEY = ['message-templates']
const LOGS_KEY = ['message-logs']

export const useMessageTemplates = () =>
  useQuery({
    queryKey: TEMPLATES_KEY,
    queryFn: () => apiClient.get('/messages/templates') as Promise<MessageTemplate[]>,
    staleTime: 60_000,
  })

export const useCreateMessageTemplate = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; content: string }) =>
      apiClient.post('/messages/templates', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: TEMPLATES_KEY }),
  })
}

export const useUpdateMessageTemplate = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      apiClient.patch(`/messages/templates/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: TEMPLATES_KEY }),
  })
}

export const useDeleteMessageTemplate = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/messages/templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: TEMPLATES_KEY }),
  })
}

export const useMessageLogs = () =>
  useQuery({
    queryKey: LOGS_KEY,
    queryFn: () => apiClient.get('/messages') as Promise<MessageLog[] | { items: MessageLog[] }>,
    staleTime: 30_000,
  })

/** 관리자 회사 발송 이력 (수신자 기준이 아닌 회사 전체 발송 메시지) */
export interface SentMessage {
  id: string
  title?: string
  type?: string
  content?: string
  sentAt?: string
  createdAt?: string
  recipientCount?: number
  readCount?: number
}

export const useSentMessages = () =>
  useQuery({
    queryKey: [...LOGS_KEY, 'sent'],
    queryFn: () =>
      apiClient.get('/messages/sent') as Promise<SentMessage[] | { items: SentMessage[] }>,
    staleTime: 30_000,
  })

export interface SendMessagePayload {
  title: string
  content: string
  recipientEmployeeIds: string[]
  templateId?: string
  sendEmail?: boolean
}

export const useSendMessage = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: SendMessagePayload) => apiClient.post('/messages/send', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: LOGS_KEY }),
  })
}
