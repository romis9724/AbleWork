'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * 전자결재 공통 관리는 "회사 설정 > 전자결재" 탭으로 이동했다.
 * 기존 경로 접근 시 설정 페이지의 전자결재 섹션으로 리다이렉트한다.
 */
export default function ApprovalCommonRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/admin/settings/company?section=approval')
  }, [router])
  return (
    <div className="ab-loading">
      <span className="ab-spin" />
      이동 중…
    </div>
  )
}
