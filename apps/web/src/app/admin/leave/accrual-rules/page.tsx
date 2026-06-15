'use client'
import PageHeader from '@/components/common/PageHeader'
import LeaveAccrualRulesPanel from './LeaveAccrualRulesPanel'

export default function AccrualRulesPage() {
  return (
    <>
      <PageHeader title="휴가 발생 규칙" />
      <LeaveAccrualRulesPanel />
    </>
  )
}
