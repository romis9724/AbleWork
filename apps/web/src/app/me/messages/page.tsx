'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import { PageHead, TableBar } from '@/components/ab/Page'
import { Badge } from '@/components/ab/atoms'
import { Modal } from '@/components/ab/Modal'
import { useToast } from '@/components/ab/Toast'

interface Message {
  id: string
  title?: string
  content: string
  sentAt: string
  readAt: string | null
}

const MESSAGES_KEY = ['messages']

function useMessages() {
  return useQuery({
    queryKey: MESSAGES_KEY,
    queryFn: () => apiClient.get('/messages'),
    staleTime: 30_000,
  })
}

function useReadMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      apiClient.post(`/messages/${id}/read`, note ? { note } : {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: MESSAGES_KEY }),
  })
}

export default function MessagesPage() {
  const toast = useToast()
  const [selected, setSelected] = useState<Message | null>(null)
  const [memo, setMemo] = useState('')

  const { data: rawMessages, isLoading } = useMessages()
  const messages: Message[] = Array.isArray(rawMessages)
    ? rawMessages
    : (rawMessages as { items?: Message[]; data?: Message[] })?.items ??
      (rawMessages as { items?: Message[]; data?: Message[] })?.data ??
      []
  const readMessage = useReadMessage()

  const unreadCount = messages.filter((m) => !m.readAt).length

  const handleOpen = (msg: Message) => {
    setSelected(msg)
    setMemo('')
  }

  const handleClose = () => {
    setSelected(null)
    setMemo('')
  }

  const handleConfirm = async () => {
    if (!selected) return
    try {
      await readMessage.mutateAsync({ id: selected.id, note: memo.trim() || undefined })
      toast('메시지를 확인했습니다')
      handleClose()
    } catch (err) {
      toast(err instanceof Error ? err.message : '처리 중 오류가 발생했습니다')
    }
  }

  return (
    <>
      <PageHead
        eyebrow="Messages"
        title="내 메시지"
        right={unreadCount > 0 ? <span className="page-stamp">미읽음 {unreadCount}</span> : undefined}
      />

      <TableBar count={<>총 <b>{messages.length}</b>건</>} />

      {isLoading ? (
        <div className="ab-loading"><span className="ab-spin" />불러오는 중…</div>
      ) : messages.length === 0 ? (
        <div className="note"><div className="note-t">메시지 없음</div>받은 메시지가 없습니다.</div>
      ) : (
        <div className="me-msg-list">
          {messages.map((msg) => {
            const isRead = !!msg.readAt
            const displayTitle = msg.title ?? msg.content.slice(0, 30) + (msg.content.length > 30 ? '…' : '')
            return (
              <button
                key={msg.id}
                className={'me-msg-row' + (isRead ? ' read' : '')}
                onClick={() => handleOpen(msg)}
              >
                {!isRead && <span className="me-msg-dot" />}
                <div className="grow">
                  <div className="me-msg-title">{displayTitle}</div>
                  <div className="me-msg-time tek">
                    {new Date(msg.sentAt).toLocaleString('ko-KR', {
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
                <Badge kind={isRead ? 'b-submit' : 'b-prog'}>{isRead ? '읽음' : '미읽음'}</Badge>
              </button>
            )
          })}
        </div>
      )}

      <Modal
        open={!!selected}
        onClose={handleClose}
        eyebrow="Message"
        title={selected?.title ?? '메시지'}
        maxWidth={480}
        footer={
          <>
            <button className="btn btn-ghost" onClick={handleClose}>닫기</button>
            <button className="btn btn-primary" disabled={readMessage.isPending} onClick={handleConfirm}>
              {readMessage.isPending ? '처리 중…' : '확인'}
            </button>
          </>
        }
      >
        {selected && (
          <>
            <div className="me-msg-meta tek">{new Date(selected.sentAt).toLocaleString('ko-KR')}</div>
            <div className="me-msg-content">{selected.content}</div>
            <div className="fld" style={{ alignItems: 'start' }}>
              <label>메모</label>
              <textarea
                className="ta"
                style={{ minHeight: 90 }}
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="메모를 입력하세요 (선택)"
              />
            </div>
          </>
        )}
      </Modal>
    </>
  )
}
