'use client'
import PageHeader from '@/components/common/PageHeader'
import RequestRulesPanel from './RequestRulesPanel'

export default function ApprovalRulesPage() {
  return (
    <>
      <PageHeader title="승인 규칙" />
      <RequestRulesPanel />
    </>
  )
}
