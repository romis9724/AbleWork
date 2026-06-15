'use client'
import { useState } from 'react'
import { Seg } from '@/components/ab/atoms'
import LeaveStatusPanel from '@/app/admin/leave/status/LeaveStatusPanel'
import LeaveTypesPanel from '@/app/admin/leave/types/LeaveTypesPanel'
import LeaveAccrualRulesPanel from '@/app/admin/leave/accrual-rules/LeaveAccrualRulesPanel'
import LeaveListPanel from '@/app/admin/leave/list/LeaveListPanel'
import LeaveCompensationPanel from '@/app/admin/leave/compensation/LeaveCompensationPanel'

type LeaveTab = 'status' | 'types' | 'accrual' | 'list' | 'compensation'

const TABS: { value: LeaveTab; label: string }[] = [
  { value: 'status', label: '현황' },
  { value: 'types', label: '유형' },
  { value: 'accrual', label: '발생 규칙' },
  { value: 'list', label: '목록' },
  { value: 'compensation', label: '보상휴가' },
]

/**
 * 회사 설정 > 휴가 섹션 래퍼 패널.
 * 5개 휴가 관리 패널을 서브탭으로 묶어, 활성 탭만 조건부 렌더한다(비활성은 미렌더).
 * 회사설정 page.tsx에서 `{section === 'leave' && <LeaveSettingsPanel />}` 형태로 사용.
 */
export default function LeaveSettingsPanel() {
  const [tab, setTab] = useState<LeaveTab>('status')

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ marginBottom: 18 }}>
        <Seg<LeaveTab> value={tab} onChange={setTab} options={TABS} />
      </div>

      {tab === 'status' && <LeaveStatusPanel />}
      {tab === 'types' && <LeaveTypesPanel />}
      {tab === 'accrual' && <LeaveAccrualRulesPanel />}
      {tab === 'list' && <LeaveListPanel />}
      {tab === 'compensation' && <LeaveCompensationPanel />}
    </div>
  )
}
