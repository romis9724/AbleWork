'use client'
import { useParams } from 'next/navigation'
import DocumentDetailView from '@/components/approval/DocumentDetailView'

/** 결재 현황 상세 — 진행 중 문서 모니터링. 재상신/재기안 비노출 */
export default function StatusDocumentDetailPage() {
  const params = useParams<{ id: string }>()
  return <DocumentDetailView documentId={params.id} backPath="/admin/approval/status" />
}
