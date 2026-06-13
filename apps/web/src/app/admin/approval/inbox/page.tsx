'use client'
import DocumentBoxesView from '@/components/approval/DocumentBoxesView'

/** 관리자용 내 문서함 — 직원 문서함과 동일 컴포넌트 재사용 */
export default function AdminApprovalInboxPage() {
  return <DocumentBoxesView variant="admin" />
}
