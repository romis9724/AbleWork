'use client'
import { useState } from 'react'
import { Seg } from '@/components/ab/atoms'
import RequestListPanel from '@/app/admin/requests/RequestListPanel'
import RequestRulesPanel from '@/app/admin/requests/rules/RequestRulesPanel'
import RequestCustomTypesPanel from '@/app/admin/requests/custom-types/RequestCustomTypesPanel'

type RequestSettingsTab = 'list' | 'rules' | 'custom'

const TABS: { value: RequestSettingsTab; label: string }[] = [
  { value: 'list', label: '요청 내역' },
  { value: 'rules', label: '승인 규칙' },
  { value: 'custom', label: '커스텀 요청 유형' },
]

/**
 * 회사 설정 "요청" 섹션 래퍼 패널.
 * 요청 내역 / 승인 규칙 / 커스텀 요청 유형 3개 패널을 서브탭으로 묶어 활성 탭만 렌더한다.
 * 각 패널은 표준 라우트(/admin/requests/*)와 동일한 컴포넌트를 재사용한다.
 */
export default function RequestSettingsPanel() {
  const [tab, setTab] = useState<RequestSettingsTab>('list')

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ marginBottom: 16 }}>
        <Seg<RequestSettingsTab> value={tab} onChange={setTab} options={TABS} />
      </div>

      {tab === 'list' && <RequestListPanel />}
      {tab === 'rules' && <RequestRulesPanel />}
      {tab === 'custom' && <RequestCustomTypesPanel />}
    </div>
  )
}
