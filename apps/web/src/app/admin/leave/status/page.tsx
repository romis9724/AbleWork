'use client'
import { PageHead } from '@/components/ab/Page'
import LeaveStatusPanel from './LeaveStatusPanel'

export default function LeaveStatusPage() {
  return (
    <>
      <PageHead eyebrow="Leave" title="휴가 현황" />
      <LeaveStatusPanel />
    </>
  )
}
