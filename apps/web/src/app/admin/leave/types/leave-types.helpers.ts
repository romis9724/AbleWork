// 휴가 유형 관리 화면 순수 폼 상태·상수·검증 (god file 분할 · 항목 24).

// ── Group form state ──────────────────────────────────────────────────────────

export interface GroupForm {
  name: string
  code: string
  overageLimitDays: string
}

export const defaultGroupForm: GroupForm = { name: '', code: '', overageLimitDays: '0' }

// ── Type form state ───────────────────────────────────────────────────────────

export interface TypeForm {
  name: string
  displayName: string
  code: string
  groupId: string
  timeOption: string
  paidHours: string
  deductionDays: string
  specialOption: string
  minConsecutiveDays: string
  maxConsecutiveDays: string
  isActive: boolean
}

export const defaultTypeForm: TypeForm = {
  name: '',
  displayName: '',
  code: '',
  groupId: '',
  timeOption: 'full_day',
  paidHours: '',
  deductionDays: '1',
  specialOption: '',
  minConsecutiveDays: '',
  maxConsecutiveDays: '',
  isActive: true,
}

// 특별 옵션 (SYSTEM_DESIGN: 장기/휴무/휴일)
export const SPECIAL_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '없음' },
  { value: 'long_term', label: '장기휴가' },
  { value: 'day_off', label: '휴무' },
  { value: 'holiday', label: '휴일' },
]

// 각 설정 항목 설명 (초기 셋팅 시 매뉴얼 없이 이해할 수 있도록)
export const FIELD_HELP = {
  displayName: '직원 화면에 표시할 이름. 비우면 이름을 그대로 사용합니다.',
  code: '연동/리포트에서 식별하는 영문 코드 (예: ANNUAL). 회사 내 고유.',
  group: '잔액·발생규칙이 그룹 단위로 묶입니다. 휴가 신청 시 같은 그룹 잔액에서 차감됩니다.',
  timeOption:
    '하루종일: 일 단위로 신청. 시간입력: 시작·종료 시간을 지정하는 시간 단위 휴가(8시간=1일 기준).',
  deductionDays: '하루 사용 시 차감되는 일수. 1=종일, 0.5=반차. 시간 단위 유형은 유급 시간으로 환산됩니다.',
  paidHours: '시간 단위 휴가의 유급 시간. 8시간=1일 기준으로 차감 일수를 환산합니다. (시간입력 유형 필수)',
  specialOption: '장기/휴무/휴일 등 특수 처리 유형. 일반 휴가는 “없음”.',
  consecutive: '한 번에 신청 가능한 최소·최대 연속 일수 제한. 비우면 제한 없음.',
} as const

// 유형 목록 정렬 키
export type TypeSortKey = 'group' | 'paidHours' | 'deductionDays'

// 유형 폼 검증 — 필드별 에러 메시지 맵 (빈 객체면 유효)
export function validateTypeForm(form: TypeForm): Partial<Record<keyof TypeForm, string>> {
  const errors: Partial<Record<keyof TypeForm, string>> = {}
  if (!form.name.trim()) errors.name = '이름을 입력하세요.'
  if (!form.groupId) errors.groupId = '그룹을 선택하세요.'

  const deduction = Number(form.deductionDays)
  if (form.deductionDays === '' || Number.isNaN(deduction) || deduction < 0) {
    errors.deductionDays = '0 이상의 숫자를 입력하세요.'
  }

  if (form.timeOption === 'hourly') {
    const hours = Number(form.paidHours)
    if (form.paidHours === '' || Number.isNaN(hours) || hours <= 0) {
      errors.paidHours = '시간입력 유형은 유급 시간(1 이상)이 필요합니다.'
    }
  }

  const min = form.minConsecutiveDays !== '' ? Number(form.minConsecutiveDays) : null
  const max = form.maxConsecutiveDays !== '' ? Number(form.maxConsecutiveDays) : null
  if (min !== null && max !== null && min > max) {
    errors.maxConsecutiveDays = '최대 연속 일수는 최소보다 크거나 같아야 합니다.'
  }
  return errors
}
