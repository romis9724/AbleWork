/** me/requests 유형별 신청 다이얼로그 공통 props */
export interface RequestFormDialogProps {
  open: boolean
  /** 로그인한 직원 ID — 내 데이터(휴가/일정/출퇴근) 조회 필터 */
  employeeId: string
  submitting: boolean
  onClose: () => void
  /** 검증 통과한 payload를 부모로 전달 (실제 POST /requests는 부모가 수행) */
  onSubmit: (type: string, payload: Record<string, unknown>) => void
}

export const todayString = (): string => new Date().toISOString().slice(0, 10)
