'use client'
import DocumentFormWizard from '@/components/approval/DocumentFormWizard'

/** 기안양식 등록 — 3-step 위저드 PAGE */
export default function NewDocumentFormPage() {
  return <DocumentFormWizard listPath="/admin/approval/forms" />
}
