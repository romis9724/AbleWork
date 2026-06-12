'use client'
import { useState } from 'react'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import Fab from '@mui/material/Fab'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import ListSubheader from '@mui/material/ListSubheader'
import CircularProgress from '@mui/material/CircularProgress'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import AddIcon from '@mui/icons-material/Add'
import BeachAccessIcon from '@mui/icons-material/BeachAccess'
import ScheduleIcon from '@mui/icons-material/Schedule'
import EditCalendarIcon from '@mui/icons-material/EditCalendar'
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid'
import EmptyState from '@/components/common/EmptyState'
import { useRequests, useCreateRequest, useCancelRequest } from '@/lib/query/requests'
import { useAuthStore } from '@/stores/auth.store'
import { LeaveCreateDialog, LeaveModifyDialog, LeaveDeleteDialog } from './leave-request-dialogs'
import { ShiftCreateDialog, ShiftModifyDialog, ShiftDeleteDialog } from './shift-request-dialogs'
import {
  AttendanceEditDialog,
  AttendanceCreateDialog,
  AttendanceDeleteDialog,
} from './attendance-request-dialogs'
import { DeviceChangeDialog } from './device-request-dialog'

type TabValue = 'ALL' | 'PENDING' | 'DONE'

type RequestDialogType =
  | 'LEAVE_CREATE'
  | 'LEAVE_MODIFY'
  | 'LEAVE_DELETE'
  | 'SHIFT_CREATE'
  | 'SHIFT_MODIFY'
  | 'SHIFT_DELETE'
  | 'ATTENDANCE_EDIT'
  | 'ATTENDANCE_CREATE'
  | 'ATTENDANCE_DELETE'
  | 'DEVICE_CHANGE'

type DialogMode = null | 'menu' | RequestDialogType

const TYPE_LABEL: Record<string, string> = {
  LEAVE_CREATE: '휴가 신청',
  LEAVE_MODIFY: '휴가 수정 요청',
  LEAVE_DELETE: '휴가 취소 요청',
  SHIFT_CREATE: '근무일정 신청',
  SHIFT_MODIFY: '근무일정 수정 요청',
  SHIFT_DELETE: '근무일정 삭제 요청',
  ATTENDANCE_EDIT: '출퇴근 정정 요청',
  ATTENDANCE_CREATE: '출퇴근 기록 생성 요청',
  ATTENDANCE_DELETE: '출퇴근 기록 삭제 요청',
  DEVICE_CHANGE: '기기 변경 요청',
  OFFSITE_WORK: '외근/출장 요청',
  CUSTOM: '기타 요청',
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: '대기중',
  APPROVED: '승인',
  REJECTED: '거절',
  CANCELLED: '취소',
}

const STATUS_COLOR: Record<string, 'warning' | 'success' | 'error' | 'default'> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'error',
  CANCELLED: 'default',
}

interface MenuGroup {
  title: string
  icon: React.ReactNode
  items: { type: RequestDialogType; label: string }[]
}

const MENU_GROUPS: MenuGroup[] = [
  {
    title: '휴가',
    icon: <BeachAccessIcon fontSize="small" />,
    items: [
      { type: 'LEAVE_CREATE', label: '휴가 신청' },
      { type: 'LEAVE_MODIFY', label: '휴가 수정' },
      { type: 'LEAVE_DELETE', label: '휴가 취소(삭제)' },
    ],
  },
  {
    title: '근무일정',
    icon: <ScheduleIcon fontSize="small" />,
    items: [
      { type: 'SHIFT_CREATE', label: '일정 신청' },
      { type: 'SHIFT_MODIFY', label: '일정 수정' },
      { type: 'SHIFT_DELETE', label: '일정 삭제' },
    ],
  },
  {
    title: '출퇴근',
    icon: <EditCalendarIcon fontSize="small" />,
    items: [
      { type: 'ATTENDANCE_EDIT', label: '출퇴근 정정' },
      { type: 'ATTENDANCE_CREATE', label: '기록 생성' },
      { type: 'ATTENDANCE_DELETE', label: '기록 삭제' },
    ],
  },
  {
    title: '기타',
    icon: <PhoneAndroidIcon fontSize="small" />,
    items: [{ type: 'DEVICE_CHANGE', label: '기기 변경' }],
  },
]

export default function RequestsPage() {
  const [tab, setTab] = useState<TabValue>('ALL')
  const [dialogMode, setDialogMode] = useState<DialogMode>(null)
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null)
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success',
  })

  const employeeId = useAuthStore((s) => s.user?.employeeId) ?? ''

  const queryParams = tab === 'ALL'
    ? undefined
    : tab === 'PENDING'
    ? { status: 'PENDING' }
    : { status: 'APPROVED,REJECTED,CANCELLED' }

  const { data, isLoading } = useRequests(queryParams)
  const createRequest = useCreateRequest()
  const cancelRequest = useCancelRequest()

  const requests = Array.isArray(data) ? data : (data?.items ?? [])

  const showSnack = (message: string, severity: 'success' | 'error') =>
    setSnack({ open: true, message, severity })

  const closeDialog = () => setDialogMode(null)

  const handleSubmit = async (type: string, payload: Record<string, unknown>) => {
    try {
      await createRequest.mutateAsync({ type, payload })
      showSnack(`${TYPE_LABEL[type] ?? '요청'} 접수가 완료됐습니다.`, 'success')
      closeDialog()
    } catch {
      showSnack('신청 중 오류가 발생했습니다.', 'error')
    }
  }

  const handleCancelConfirm = async () => {
    if (!cancelTargetId) return
    try {
      await cancelRequest.mutateAsync(cancelTargetId)
      showSnack('요청이 취소됐습니다.', 'success')
    } catch {
      showSnack('취소 중 오류가 발생했습니다.', 'error')
    } finally {
      setCancelTargetId(null)
    }
  }

  /** 내가 올린 PENDING 요청만 취소 가능 (requesterId 미제공 응답은 본인 목록으로 간주) */
  const isCancellable = (r: { status: string; requesterId?: string }) =>
    r.status === 'PENDING' && (!r.requesterId || r.requesterId === employeeId)

  const dialogProps = {
    employeeId,
    submitting: createRequest.isPending,
    onClose: closeDialog,
    onSubmit: handleSubmit,
  }

  return (
    <Box sx={{ position: 'relative', pb: 4 }}>
      <Typography variant="h6" fontWeight={700} mb={2}>내 요청</Typography>

      <Tabs value={tab} onChange={(_, v) => setTab(v as TabValue)} sx={{ mb: 2 }}>
        <Tab label="전체" value="ALL" />
        <Tab label="대기중" value="PENDING" />
        <Tab label="완료" value="DONE" />
      </Tabs>

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
          <CircularProgress />
        </Box>
      ) : requests.length === 0 ? (
        <EmptyState message="요청 내역이 없습니다." />
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {requests.map((r) => (
            <Card key={r.id}>
              <CardContent
                sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: '12px !important' }}
              >
                <Box>
                  <Typography variant="body2" fontWeight={600}>{TYPE_LABEL[r.type] ?? r.type}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {new Date(r.createdAt).toLocaleDateString('ko-KR')}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {isCancellable(r) && (
                    <Button
                      size="small"
                      color="inherit"
                      sx={{ color: 'text.secondary' }}
                      onClick={() => setCancelTargetId(r.id)}
                    >
                      신청 취소
                    </Button>
                  )}
                  <Chip
                    label={STATUS_LABEL[r.status] ?? r.status}
                    color={STATUS_COLOR[r.status] ?? 'default'}
                    size="small"
                  />
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      {/* FAB */}
      <Fab
        color="primary"
        aria-label="요청 신청"
        sx={{ position: 'fixed', bottom: 72, right: 16 }}
        onClick={() => setDialogMode('menu')}
      >
        <AddIcon />
      </Fab>

      {/* 유형 선택 메뉴 (그룹 구분) */}
      <Dialog open={dialogMode === 'menu'} onClose={closeDialog} fullWidth maxWidth="xs">
        <DialogTitle>요청 유형 선택</DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          <List disablePadding subheader={<li />}>
            {MENU_GROUPS.map((group) => (
              <li key={group.title}>
                <ul style={{ padding: 0 }}>
                  <ListSubheader sx={{ display: 'flex', alignItems: 'center', gap: 1, lineHeight: '36px' }}>
                    <Box sx={{ color: 'primary.main', display: 'flex' }}>{group.icon}</Box>
                    {group.title}
                  </ListSubheader>
                  {group.items.map((item) => (
                    <ListItem key={item.type} disablePadding divider>
                      <ListItemButton onClick={() => setDialogMode(item.type)}>
                        <ListItemText primary={item.label} sx={{ pl: 4 }} />
                      </ListItemButton>
                    </ListItem>
                  ))}
                </ul>
              </li>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>취소</Button>
        </DialogActions>
      </Dialog>

      {/* 유형별 신청 다이얼로그 — 열릴 때만 마운트해 내부 조회/입력 상태를 초기화 */}
      {dialogMode === 'LEAVE_CREATE' && <LeaveCreateDialog open {...dialogProps} />}
      {dialogMode === 'LEAVE_MODIFY' && <LeaveModifyDialog open {...dialogProps} />}
      {dialogMode === 'LEAVE_DELETE' && <LeaveDeleteDialog open {...dialogProps} />}
      {dialogMode === 'SHIFT_CREATE' && <ShiftCreateDialog open {...dialogProps} />}
      {dialogMode === 'SHIFT_MODIFY' && <ShiftModifyDialog open {...dialogProps} />}
      {dialogMode === 'SHIFT_DELETE' && <ShiftDeleteDialog open {...dialogProps} />}
      {dialogMode === 'ATTENDANCE_EDIT' && <AttendanceEditDialog open {...dialogProps} />}
      {dialogMode === 'ATTENDANCE_CREATE' && <AttendanceCreateDialog open {...dialogProps} />}
      {dialogMode === 'ATTENDANCE_DELETE' && <AttendanceDeleteDialog open {...dialogProps} />}
      {dialogMode === 'DEVICE_CHANGE' && <DeviceChangeDialog open {...dialogProps} />}

      {/* 신청 취소 확인 */}
      <Dialog open={!!cancelTargetId} onClose={() => setCancelTargetId(null)} fullWidth maxWidth="xs">
        <DialogTitle>신청 취소</DialogTitle>
        <DialogContent>
          <DialogContentText>이 요청을 취소하시겠어요? 취소한 요청은 되돌릴 수 없습니다.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelTargetId(null)}>닫기</Button>
          <Button
            variant="contained"
            color="error"
            disabled={cancelRequest.isPending}
            onClick={handleCancelConfirm}
          >
            {cancelRequest.isPending ? <CircularProgress size={20} color="inherit" /> : '신청 취소'}
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
