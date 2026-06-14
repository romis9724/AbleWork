'use client'
import { useParams } from 'next/navigation'
import DocumentDetailView from '@/components/approval/DocumentDetailView'

/** 관리자 내 문서함 상세 — 내용·결재선·이력 + 내 차례 결재 액션 */
export default function AdminInboxDocumentDetailPage() {
  const params = useParams<{ id: string }>()
  return (
    <DocumentDetailView
      documentId={params.id}
      backPath="/admin/approval/inbox"
      composeBase="/admin/approval/inbox"
      isMineHint
    />
  )
}
