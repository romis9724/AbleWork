'use client'
import PageHeader from '@/components/common/PageHeader'
import LeaveTypesPanel from './LeaveTypesPanel'

export default function LeaveTypesPage() {
  return (
    <>
      <PageHeader title="휴가 유형 관리" />
      <LeaveTypesPanel />
    </>
  )
}
