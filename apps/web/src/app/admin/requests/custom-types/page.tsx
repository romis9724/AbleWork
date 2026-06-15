'use client'
import PageHeader from '@/components/common/PageHeader'
import RequestCustomTypesPanel from './RequestCustomTypesPanel'

export default function CustomRequestTypesPage() {
  return (
    <>
      <PageHeader title="커스텀 요청 유형" subtitle="회사 고유 요청 양식을 정의합니다." />
      <RequestCustomTypesPanel />
    </>
  )
}
