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
  recipientCount: number
  readCount: number
  sentAt: string
  createdAt: string
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
