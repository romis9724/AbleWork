'use client'
import { useParams } from 'next/navigation'
import DocumentComposeForm from '@/components/approval/DocumentComposeForm'

/** 직원 기안 이어쓰기·재상신 — DRAFT/REJECTED/RECALLED 문서 편집 */
export default function MyDocumentEditPage() {
  const params = useParams<{ id: string }>()
  return <DocumentComposeForm editingId={params.id} listPath="/me/documents" />
}
