'use client'
import DocumentBoxesView from '@/components/approval/DocumentBoxesView'

/** 직원 문서함 — 기안함/진행중/완료/결재함/참조/공람/수신 */
export default function MyDocumentsPage() {
  return <DocumentBoxesView variant="me" />
}
