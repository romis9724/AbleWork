'use client'
import { useState } from 'react'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import CircularProgress from '@mui/material/CircularProgress'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import EmptyState from '@/components/common/EmptyState'

interface Message {
  id: string
  title?: string
  content: string
  sentAt: string
  isRead: boolean
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
    mutationFn: (id: string) => apiClient.post(`/messages/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: MESSAGES_KEY }),
  })
}

export default function MessagesPage() {
  const [selected, setSelected] = useState<Message | null>(null)
  const [memo, setMemo] = useState('')
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success',
  })

  const { data: rawMessages, isLoading } = useMessages()
  const messages: Message[] = Array.isArray(rawMessages)
    ? rawMessages
    : ((rawMessages as { items?: Message[]; data?: Message[] })?.items ?? (rawMessages as { items?: Message[]; data?: Message[] })?.data ?? [])
  const readMessage = useReadMessage()

  const showSnack = (message: string, severity: 'success' | 'error') =>
    setSnack({ open: true, message, severity })

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
      await readMessage.mutateAsync(selected.id)
      showSnack('메시지를 확인했습니다.', 'success')
      handleClose()
    } catch {
      showSnack('처리 중 오류가 발생했습니다.', 'error')
    }
  }

  return (
    <Box>
      <Typography variant="h6" fontWeight={700} mb={2}>내 메시지</Typography>

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
          <CircularProgress />
        </Box>
      ) : messages.length === 0 ? (
        <EmptyState message="받은 메시지가 없습니다." />
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {messages.map((msg) => {
            const displayTitle = msg.title ?? msg.content.slice(0, 30) + (msg.content.length > 30 ? '…' : '')
            return (
              <Card
                key={msg.id}
                variant="outlined"
                sx={{ opacity: msg.isRead ? 0.7 : 1 }}
              >
                <CardActionArea onClick={() => handleOpen(msg)}>
                  <CardContent
                    sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: '12px !important' }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0, mr: 1.5 }}>
                      <Typography
                        variant="body2"
                        fontWeight={msg.isRead ? 400 : 600}
                        noWrap
                      >
                        {displayTitle}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(msg.sentAt).toLocaleString('ko-KR', {
                          month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
                        })}
                      </Typography>
                    </Box>
                    <Chip
                      label={msg.isRead ? '읽음' : '미읽음'}
                      size="small"
                      color={msg.isRead ? 'default' : 'primary'}
                      variant={msg.isRead ? 'outlined' : 'filled'}
                    />
                  </CardContent>
                </CardActionArea>
              </Card>
            )
          })}
        </Box>
      )}

      {/* Detail dialog */}
      <Dialog open={!!selected} onClose={handleClose} fullWidth maxWidth="xs">
        <DialogTitle>{selected?.title ?? '메시지'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
          <Typography variant="caption" color="text.secondary">
            {selected && new Date(selected.sentAt).toLocaleString('ko-KR')}
          </Typography>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
            {selected?.content}
          </Typography>
          <TextField
            label="메모"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            fullWidth
            multiline
            rows={3}
            placeholder="메모를 입력하세요 (선택사항)"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>닫기</Button>
          <Button
            variant="contained"
            onClick={handleConfirm}
            disabled={readMessage.isPending}
          >
            {readMessage.isPending ? <CircularProgress size={20} color="inherit" /> : '확인'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snack.open}
        autoHideDuration={4000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
      >
        <Alert severity={snack.severity} onClose={() => setSnack((s) => ({ ...s, open: false }))}>
          {snack.message}
        </Alert>
      </Snackbar>
    </Box>
  )
}
