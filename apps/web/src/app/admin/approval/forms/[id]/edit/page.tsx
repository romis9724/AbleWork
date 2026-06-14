'use client'
import { useParams } from 'next/navigation'
import DocumentFormWizard from '@/components/approval/DocumentFormWizard'

/** 기안양식 수정 — 3-step 위저드 PAGE */
export default function EditDocumentFormPage() {
  const params = useParams<{ id: string }>()
  return <DocumentFormWizard editingId={params.id} listPath="/admin/approval/forms" />
}
