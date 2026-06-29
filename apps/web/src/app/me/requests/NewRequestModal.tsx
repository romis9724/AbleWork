'use client'
/**
 * 새 요청 플로우(요청 유형 선택 메뉴 + 유형별 신청 다이얼로그) 공용 컴포넌트.
 * me/requests(요청 내역)와 me/home(요청 버튼) 양쪽에서 동일하게 사용한다.
 */
import { useEffect, useState, type ReactElement } from 'react'
import { useCreateRequest } from '@/lib/query/requests'
import { Modal } from '@/components/ab/Modal'
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

export type RequestDialogType =
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

interface MenuGroup {
  title: string
  icon: () => ReactElement
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

interface NewRequestModalProps {
  open: boolean
  employeeId: string
  onClose: () => void
  /** 요청 접수 성공 시(목록 새로고침 등) */
  onSuccess?: () => void
}

export function NewRequestModal({ open, employeeId, onClose, onSuccess }: NewRequestModalProps) {
  const toast = useToast()
  const createRequest = useCreateRequest()
  const [step, setStep] = useState<'menu' | RequestDialogType>('menu')

  // 열릴 때마다 유형 선택 메뉴부터 시작
  useEffect(() => {
    if (open) setStep('menu')
  }, [open])

  if (!open) return null

  const close = () => onClose()

  const handleSubmit = async (type: string, payload: Record<string, unknown>) => {
    try {
      await createRequest.mutateAsync({ type, payload })
      toast(`${TYPE_LABEL[type] ?? '요청'} 접수가 완료됐습니다`)
      onSuccess?.()
      close()
    } catch (err) {
      toast(err instanceof Error ? err.message : '신청 중 오류가 발생했습니다')
    }
  }

  const dialogProps = {
    employeeId,
    submitting: createRequest.isPending,
    onClose: close,
    onSubmit: handleSubmit,
  }

  return (
    <>
      {/* 유형 선택 메뉴 (그룹 구분) */}
      <Modal open={step === 'menu'} onClose={close} eyebrow="New Request" title="요청 유형 선택" maxWidth={460}>
        <div className="me-req-menu">
          {MENU_GROUPS.map((group) => (
            <div className="me-req-group" key={group.title}>
              <div className="me-req-group-head">
                <span className="ic">{group.icon()}</span>
                {group.title}
              </div>
              <div className="me-req-group-items">
                {group.items.map((item) => (
                  <button key={item.type} data-testid={`req-type-${item.type}`} className="me-req-item" onClick={() => setStep(item.type)}>
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
      {step === 'LEAVE_CREATE' && (
        <LeaveFormModal open mode="create" employeeId={employeeId} onClose={close} onSuccess={onSuccess} />
      )}
      {step === 'LEAVE_MODIFY' && (
        <LeaveFormModal open mode="modify" employeeId={employeeId} onClose={close} onSuccess={onSuccess} />
      )}
      {step === 'LEAVE_DELETE' && <LeaveDeleteDialog open {...dialogProps} />}
      {step === 'SHIFT_CREATE' && <ShiftCreateDialog open {...dialogProps} />}
      {step === 'SHIFT_MODIFY' && <ShiftModifyDialog open {...dialogProps} />}
      {step === 'SHIFT_DELETE' && <ShiftDeleteDialog open {...dialogProps} />}
      {step === 'ATTENDANCE_EDIT' && <AttendanceEditDialog open {...dialogProps} />}
      {step === 'ATTENDANCE_CREATE' && <AttendanceCreateDialog open {...dialogProps} />}
      {step === 'ATTENDANCE_DELETE' && <AttendanceDeleteDialog open {...dialogProps} />}
      {step === 'DEVICE_CHANGE' && <DeviceChangeDialog open {...dialogProps} />}
      {step === 'OFFSITE_WORK' && <OffsiteWorkDialog open {...dialogProps} />}
      {step === 'CUSTOM' && <CustomRequestDialog open {...dialogProps} />}
    </>
  )
}
