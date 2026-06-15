'use client'
import PageHeader from '@/components/common/PageHeader'
import LeaveListPanel from './LeaveListPanel'

export default function LeaveListPage() {
  return (
    <>
      <PageHeader title="휴가 목록" />
      <LeaveListPanel />
    </>
  )
}
