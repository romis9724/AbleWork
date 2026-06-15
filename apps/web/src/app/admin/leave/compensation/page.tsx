'use client'
import PageHeader from '@/components/common/PageHeader'
import LeaveCompensationPanel from './LeaveCompensationPanel'

export default function CompensationLeavePage() {
  return (
    <>
      <PageHeader title="보상휴가 발생" subtitle="휴일근로 등에 대한 보상휴가를 발생합니다." />
      <LeaveCompensationPanel />
    </>
  )
}
