'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import FormControlLabel from '@mui/material/FormControlLabel'
import Paper from '@mui/material/Paper'
import Snackbar from '@mui/material/Snackbar'
import Switch from '@mui/material/Switch'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import PageHeader from '@/components/common/PageHeader'
import apiClient from '@/lib/api-client'
import { NOTIFIABLE_EVENTS, type NotifiableEvent } from '@ablework/shared-constants'

interface NotificationRule {
  id: string
  channelType: string
  webhookUrl?: string | null
  eventType: string
  isActive: boolean
}

interface NotificationLog {
  id: string
  sentAt: string
  eventType: string
  status: 'success' | 'failed' | 'retrying'
  retryCount: number
}

const CHANNELS = [
  { key: 'attendance', label: '#근태-알림' },
  { key: 'approval', label: '#결재-알림' },
  { key: 'leave', label: '#휴가-알림' },
]

// 알림 이벤트 목록은 단일 출처(@ablework/shared-constants)에서 가져온다.
// 정의 순서를 보존하며 그룹 단위로 묶어 렌더링한다.
const EVENT_GROUPS = NOTIFIABLE_EVENTS.reduce<
  { group: string; groupLabel: string; events: NotifiableEvent[] }[]
>((acc, ev) => {
  const existing = acc.find((g) => g.group === ev.group)
  if (existing) existing.events.push(ev)
  else acc.push({ group: ev.group, groupLabel: ev.groupLabel, events: [ev] })
  return acc
}, [])

const LOG_STATUS_COLOR: Record<string, 'success' | 'error' | 'warning'> = {
  success: 'success',
  failed: 'error',
  retrying: 'warning',
}

const LOG_STATUS_LABEL: Record<string, string> = {
  success: '성공',
  failed: '실패',
  retrying: '재시도 중',
}

const EVENT_LABEL: Record<string, string> = Object.fromEntries(
  NOTIFIABLE_EVENTS.map((e) => [e.event, e.label]),
)

export default function NotificationsSettingsPage() {
  const qc = useQueryClient()
  const [webhookInputs, setWebhookInputs] = useState<Record<string, string>>({})
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  })

  const { data: rawRules, isLoading: rulesLoading } = useQuery({
    queryKey: ['notification-rules'],
    queryFn: () => apiClient.get('/notifications/rules'),
    staleTime: 30_000,
  })
  const rules: NotificationRule[] = Array.isArray(rawRules)
    ? rawRules
    : ((rawRules as { items?: NotificationRule[]; data?: NotificationRule[] })?.items ?? (rawRules as { items?: NotificationRule[]; data?: NotificationRule[] })?.data ?? [])

  const { data: rawLogs, isLoading: logsLoading } = useQuery({
    queryKey: ['notification-logs'],
    queryFn: () => apiClient.get('/notifications/logs', { params: { limit: 20 } }),
    staleTime: 30_000,
  })
  const logs: NotificationLog[] = Array.isArray(rawLogs)
    ? rawLogs
    : ((rawLogs as { items?: NotificationLog[]; data?: NotificationLog[] })?.items ?? (rawLogs as { items?: NotificationLog[]; data?: NotificationLog[] })?.data ?? [])

  const updateWebhookMutation = useMutation({
    mutationFn: ({ channel, webhookUrl }: { channel: string; webhookUrl: string }) =>
      apiClient.patch(`/notifications/rules/webhook`, { channel, webhookUrl }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notification-rules'] })
      setSnack({ open: true, message: 'Webhook URL이 저장되었습니다.', severity: 'success' })
    },
    onError: () => setSnack({ open: true, message: '저장에 실패했습니다.', severity: 'error' }),
  })

  const toggleEventMutation = useMutation({
    mutationFn: ({ eventType, isActive }: { eventType: string; isActive: boolean }) =>
      apiClient.patch(`/notifications/rules/event`, { eventType, isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notification-rules'] }),
    onError: () => setSnack({ open: true, message: '설정 변경에 실패했습니다.', severity: 'error' }),
  })

  function getWebhookValue(channel: string) {
    if (webhookInputs[channel] !== undefined) return webhookInputs[channel]
    // 현재 BE는 회사 단위 webhook을 사용하므로 등록된 규칙의 webhookUrl을 표시
    return rules.find((r) => r.webhookUrl)?.webhookUrl ?? ''
  }

  function isEventEnabled(eventType: string) {
    const rule = rules.find((r) => r.eventType === eventType)
    return rule?.isActive ?? false
  }

  function handleWebhookSave(channel: string) {
    updateWebhookMutation.mutate({ channel, webhookUrl: getWebhookValue(channel) })
  }

  function handleToggleEvent(eventType: string, isActive: boolean) {
    toggleEventMutation.mutate({ eventType, isActive })
  }

  if (rulesLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <>
      <PageHeader title="Discord 알림 설정" />

      <Alert severity="info" sx={{ mb: 3 }}>
        Discord Webhook URL을 등록하면 출퇴근·결재·휴가 이벤트 알림을 Discord 채널로 받을 수 있습니다.
      </Alert>

      {/* Webhook URL 섹션 */}
      <Typography variant="subtitle1" fontWeight={700} mb={2}>
        채널 Webhook 설정
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 4 }}>
        {CHANNELS.map(({ key, label }) => (
          <Card key={key} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
            <CardContent>
              <Typography fontWeight={600} mb={1.5}>
                {label}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <TextField
                  label="Webhook URL"
                  placeholder="https://discord.com/api/webhooks/..."
                  value={getWebhookValue(key)}
                  onChange={(e) =>
                    setWebhookInputs((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                  size="small"
                  fullWidth
                />
                <Button
                  variant="contained"
                  onClick={() => handleWebhookSave(key)}
                  disabled={updateWebhookMutation.isPending}
                  sx={{ whiteSpace: 'nowrap', minWidth: 80 }}
                >
                  저장
                </Button>
              </Box>
            </CardContent>
          </Card>
        ))}
      </Box>

      {/* 이벤트 ON/OFF 섹션 */}
      <Typography variant="subtitle1" fontWeight={700} mb={2}>
        이벤트 알림 설정
      </Typography>
      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', mb: 4 }}>
        <CardContent>
          {EVENT_GROUPS.map((grp, idx) => (
            <Box key={grp.group}>
              {idx > 0 && <Divider sx={{ my: 2 }} />}
              <Typography variant="body2" color="text.secondary" mb={2}>
                {grp.groupLabel}
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                {grp.events.map((event) => (
                  <FormControlLabel
                    key={event.event}
                    control={
                      <Switch
                        checked={isEventEnabled(event.event)}
                        onChange={(e) => handleToggleEvent(event.event, e.target.checked)}
                        disabled={toggleEventMutation.isPending}
                        size="small"
                      />
                    }
                    label={event.label}
                  />
                ))}
              </Box>
            </Box>
          ))}
        </CardContent>
      </Card>

      {/* 알림 발송 이력 */}
      <Typography variant="subtitle1" fontWeight={700} mb={2}>
        최근 발송 이력 (최근 20건)
      </Typography>
      {logsLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={24} />
        </Box>
      ) : (
        <TableContainer
          component={Paper}
          elevation={0}
          sx={{ border: '1px solid', borderColor: 'divider' }}
        >
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'background.default' }}>
                <TableCell>발송일시</TableCell>
                <TableCell>이벤트 유형</TableCell>
                <TableCell>상태</TableCell>
                <TableCell align="right">재시도 횟수</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    발송 이력이 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      {new Date(log.sentAt).toLocaleString('ko-KR', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </TableCell>
                    <TableCell>{EVENT_LABEL[log.eventType] ?? log.eventType}</TableCell>
                    <TableCell>
                      <Chip
                        label={LOG_STATUS_LABEL[log.status] ?? log.status}
                        color={LOG_STATUS_COLOR[log.status] ?? 'default'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell align="right">{log.retryCount}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Snackbar
        open={snack.open}
        autoHideDuration={3000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snack.severity}
          variant="filled"
          onClose={() => setSnack((s) => ({ ...s, open: false }))}
        >
          {snack.message}
        </Alert>
      </Snackbar>
    </>
  )
}
