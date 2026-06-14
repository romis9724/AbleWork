'use client'
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import DocumentComposeForm from '@/components/approval/DocumentComposeForm'

function NewForm() {
  const sp = useSearchParams()
  return (
    <DocumentComposeForm
      initialFormId={sp.get('formId')}
      redraftFromId={sp.get('from')}
      listPath="/me/documents"
    />
  )
}

/** 직원 기안 작성 — 양식 선택 → 작성/상신 (재기안은 ?from=, 양식 선택은 ?formId=) */
export default function MyDocumentNewPage() {
  return (
    <Suspense fallback={null}>
      <NewForm />
    </Suspense>
  )
}
