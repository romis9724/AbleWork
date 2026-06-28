'use client'
import { useState } from 'react'
import { useRequests, useCreateRequest, useCancelRequest } from '@/lib/query/requests'
import { useAuthStore } from '@/stores/auth.store'
import { currentEmployeeId } from '@/lib/auth-session'
import { PageHead, TableBar } from '@/components/ab/Page'
import { Badge, type BadgeKind } from '@/components/ab/atoms'
import { Modal, ConfirmDialog } from '@/components/ab/Modal'
import { I, HRI } from '@/components/ab/icons'
import { useToast } from '@/components/ab/Toast'
import { LeaveDeleteDialog } from './leave-request-dialogs'
import { LeaveFormModal } from '@/components/leave/LeaveFormModal'
import { ShiftCreateDialog, ShiftModifyDialog, ShiftDeleteDialog } from './shift-request-dialogs'
import {
  AttendanceEditDialog,
  AttendanceCreateDialog,
  AttendanceDeleteDialog,
} from './attendance-request-dialogs'
import { DeviceChangeDialog } from './device-request-dialog'
import { OffsiteWorkDialog, CustomRequestDialog } from './offsite-custom-request-dialogs'

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
  | 'OFFSITE_WORK'
  | 'CUSTOM'

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

const STATUS: Record<string, { label: string; kind: BadgeKind }> = {
  PENDING: { label: '대기중', kind: 'b-wait' },
  APPROVED: { label: '승인', kind: 'b-done' },
  REJECTED: { label: '거절', kind: 'b-reject' },
  CANCELLED: { label: '취소', kind: 'b-submit' },
}

const TABS: { value: TabValue; label: string }[] = [
  { value: 'ALL', label: '전체' },
  { value: 'PENDING', label: '대기중' },
  { value: 'DONE', label: '완료' },
]

interface MenuGroup {
  title: string
  icon: () => React.ReactElement
  items: { type: RequestDialogType; label: string }[]
}

const MENU_GROUPS: MenuGroup[] = [
  {
    title: '휴가',
    icon: HRI.leave,
    items: [
      { type: 'LEAVE_CREATE', label: '휴가 신청' },
      { type: 'LEAVE_MODIFY', label: '휴가 수정' },
      { type: 'LEAVE_DELETE', label: '휴가 취소(삭제)' },
    ],
  },
  {
    title: '근무일정',
    icon: HRI.schedule,
    items: [
      { type: 'SHIFT_CREATE', label: '일정 신청' },
      { type: 'SHIFT_MODIFY', label: '일정 수정' },
      { type: 'SHIFT_DELETE', label: '일정 삭제' },
    ],
  },
  {
    title: '출퇴근',
    icon: HRI.clock,
    items: [
      { type: 'ATTENDANCE_EDIT', label: '출퇴근 정정' },
      { type: 'ATTENDANCE_CREATE', label: '기록 생성' },
      { type: 'ATTENDANCE_DELETE', label: '기록 삭제' },
    ],
  },
  {
    title: '기타',
    icon: HRI.settings,
    items: [
      { type: 'OFFSITE_WORK', label: '외근/출장' },
      { type: 'DEVICE_CHANGE', label: '기기 변경' },
      { type: 'CUSTOM', label: '기타 요청' },
    ],
  },
]

export default function RequestsPage() {
  const toast = useToast()
  const [tab, setTab] = useState<TabValue>('ALL')
  const [dialogMode, setDialogMode] = useState<DialogMode>(null)
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null)

  // 내 데이터(휴가/일정 등) 조회 필터 — persist 스토어 대신 쿠키 토큰의 employeeId 사용
  // (멀티컴퍼니 전환 시 스토어-토큰 desync로 대상 목록이 비어 보이던 문제 방지)
  const storeEmployeeId = useAuthStore((s) => s.user?.employeeId) ?? ''
  const employeeId = currentEmployeeId(storeEmployeeId)

  const queryParams =
    tab === 'ALL'
      ? undefined
      : tab === 'PENDING'
      ? { status: 'PENDING' }
      : { status: 'APPROVED,REJECTED,CANCELLED' }

  const { data, isLoading } = useRequests(queryParams)
  const createRequest = useCreateRequest()
  const cancelRequest = useCancelRequest()

  const requests = Array.isArray(data) ? data : data?.items ?? []

  const closeDialog = () => setDialogMode(null)

  const handleSubmit = async (type: string, payload: Record<string, unknown>) => {
    try {
      await createRequest.mutateAsync({ type, payload })
      toast(`${TYPE_LABEL[type] ?? '요청'} 접수가 완료됐습니다`)
      closeDialog()
    } catch (err) {
      toast(err instanceof Error ? err.message : '신청 중 오류가 발생했습니다')
    }
  }

  const handleCancelConfirm = async () => {
    if (!cancelTargetId) return
    try {
      await cancelRequest.mutateAsync(cancelTargetId)
      toast('요청이 취소됐습니다')
    } catch (err) {
      toast(err instanceof Error ? err.message : '취소 중 오류가 발생했습니다')
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
    <>
      <PageHead
        eyebrow="Requests"
        title="내 요청"
        right={
          <button data-testid="req-new-btn" className="btn btn-primary btn-sm" onClick={() => setDialogMode('menu')}>
            {I.plus()} 새 요청
          </button>
        }
      />

      <div className="tabs" style={{ marginBottom: 18 }}>
        {TABS.map((t) => (
          <button key={t.value} className={'tab' + (tab === t.value ? ' on' : '')} onClick={() => setTab(t.value)}>
            {t.label}
          </button>
        ))}
      </div>

      <TableBar count={<>총 <b>{requests.length}</b>건</>} />

      <div className="tbl-scroll">
        <table className="tbl">
          <thead>
            <tr>
              <th>요청 유형</th>
              <th className="c">신청일</th>
              <th className="c">상태</th>
              <th className="c">작업</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td className="tbl-empty" colSpan={4}>불러오는 중…</td></tr>
            ) : requests.length === 0 ? (
              <tr><td className="tbl-empty" colSpan={4}>요청 내역이 없습니다</td></tr>
            ) : (
              requests.map((r) => {
                const st = STATUS[r.status] ?? { label: r.status, kind: 'b-submit' as BadgeKind }
                return (
                  <tr key={r.id}>
                    <td className="lead">{TYPE_LABEL[r.type] ?? r.type}</td>
                    <td className="c muted">{new Date(r.createdAt).toLocaleDateString('ko-KR')}</td>
                    <td className="c"><Badge kind={st.kind}>{st.label}</Badge></td>
                    <td className="c">
                      {isCancellable(r) ? (
                        <button data-testid="req-cancel-btn" className="btn btn-line btn-sm" onClick={() => setCancelTargetId(r.id)}>
                          신청 취소
                        </button>
                      ) : (
                        <span className="zero">—</span>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 유형 선택 메뉴 (그룹 구분) */}
      <Modal open={dialogMode === 'menu'} onClose={closeDialog} eyebrow="New Request" title="요청 유형 선택" maxWidth={460}>
        <div className="me-req-menu">
          {MENU_GROUPS.map((group) => (
            <div className="me-req-group" key={group.title}>
              <div className="me-req-group-head">
                <span className="ic">{group.icon()}</span>
                {group.title}
              </div>
              <div className="me-req-group-items">
                {group.items.map((item) => (
                  <button key={item.type} data-testid={`req-type-${item.type}`} className="me-req-item" onClick={() => setDialogMode(item.type)}>
                    {item.label}
                    <span className="arr">{I.arrow()}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Modal>

      {/* 유형별 신청 다이얼로그 — 열릴 때만 마운트해 내부 조회/입력 상태를 초기화 */}
      {/* 휴가 신청·수정은 '휴가 > 휴가 신청'과 동일한 공용 모달 사용 */}
      {dialogMode === 'LEAVE_CREATE' && (
        <LeaveFormModal open mode="create" employeeId={employeeId} onClose={closeDialog} />
      )}
      {dialogMode === 'LEAVE_MODIFY' && (
        <LeaveFormModal open mode="modify" employeeId={employeeId} onClose={closeDialog} />
      )}
      {dialogMode === 'LEAVE_DELETE' && <LeaveDeleteDialog open {...dialogProps} />}
      {dialogMode === 'SHIFT_CREATE' && <ShiftCreateDialog open {...dialogProps} />}
      {dialogMode === 'SHIFT_MODIFY' && <ShiftModifyDialog open {...dialogProps} />}
      {dialogMode === 'SHIFT_DELETE' && <ShiftDeleteDialog open {...dialogProps} />}
      {dialogMode === 'ATTENDANCE_EDIT' && <AttendanceEditDialog open {...dialogProps} />}
      {dialogMode === 'ATTENDANCE_CREATE' && <AttendanceCreateDialog open {...dialogProps} />}
      {dialogMode === 'ATTENDANCE_DELETE' && <AttendanceDeleteDialog open {...dialogProps} />}
      {dialogMode === 'DEVICE_CHANGE' && <DeviceChangeDialog open {...dialogProps} />}
      {dialogMode === 'OFFSITE_WORK' && <OffsiteWorkDialog open {...dialogProps} />}
      {dialogMode === 'CUSTOM' && <CustomRequestDialog open {...dialogProps} />}

      {/* 신청 취소 확인 */}
      <ConfirmDialog
        open={!!cancelTargetId}
        title="신청 취소"
        message="이 요청을 취소하시겠어요? 취소한 요청은 되돌릴 수 없습니다."
        confirmLabel={cancelRequest.isPending ? '취소 중…' : '신청 취소'}
        cancelLabel="닫기"
        onConfirm={handleCancelConfirm}
        onCancel={() => setCancelTargetId(null)}
      />
    </>
  )
}
