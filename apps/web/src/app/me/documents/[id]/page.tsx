'use client'
import { useParams } from 'next/navigation'
import DocumentDetailView from '@/components/approval/DocumentDetailView'

/** 직원 기안 문서 상세 — 내용·결재선·이력 + 내 차례 결재 액션 */
export default function MyDocumentDetailPage() {
  const params = useParams<{ id: string }>()
  return (
    <DocumentDetailView
      documentId={params.id}
      backPath="/me/documents"
      composeBase="/me/documents"
      isMineHint
    />
  )
}
