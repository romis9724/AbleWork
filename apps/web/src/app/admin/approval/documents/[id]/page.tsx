'use client'
import { useParams } from 'next/navigation'
import DocumentDetailView from '@/components/approval/DocumentDetailView'

/** 문서대장 상세 — 회사 전체 문서 조회(모니터링). 재상신/재기안 비노출 */
export default function LedgerDocumentDetailPage() {
  const params = useParams<{ id: string }>()
  return <DocumentDetailView documentId={params.id} backPath="/admin/approval/documents" />
}
