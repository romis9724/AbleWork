'use client'
import { PageHead } from '@/components/ab/Page'
import RequestListPanel from './RequestListPanel'

export default function RequestsPage() {
  return (
    <>
      <PageHead eyebrow="Requests" title="요청 내역" />
      <RequestListPanel />
    </>
  )
}
