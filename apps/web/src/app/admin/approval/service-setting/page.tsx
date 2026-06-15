'use client'
import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PageHead } from '@/components/ab/Page'
import { RadioGroup } from '@/components/ab/atoms'
import { useToast } from '@/components/ab/Toast'
import apiClient from '@/lib/api-client'

interface ApprovalSettings {
  approvalServiceEnabled?: boolean
}

type OnOff = 'on' | 'off'
const ON_OFF_OPTIONS: { value: OnOff; label: string }[] = [
  { value: 'on', label: '사용' },
  { value: 'off', label: '사용 안 함' },
]

/** AP 서비스 사용 설정 — 전자결재 서비스 on/off (카카오워크 PDF: 좌측 네비 독립 페이지 + 라디오) */
export default function ApprovalServiceSettingPage() {
  const toast = useToast()
  const qc = useQueryClient()
  const [enabled, setEnabled] = useState(true)
  const [dirty, setDirty] = useState(false)

  const { data, isLoading } = useQuery<ApprovalSettings>({
    queryKey: ['company-settings'],
    queryFn: () => apiClient.get('/company-settings') as Promise<ApprovalSettings>,
    staleTime: 60_000,
  })

  useEffect(() => {
    if (data) setEnabled(data.approvalServiceEnabled ?? true)
  }, [data])

  const saveMutation = useMutation({
    mutationFn: (value: boolean) => apiClient.patch('/company-settings', { approvalServiceEnabled: value }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['company-settings'] })
      toast('설정을 저장했습니다.')
      setDirty(false)
    },
    onError: () => toast('저장에 실패했습니다.'),
  })

  if (isLoading) {
    return (
      <div className="ab-loading">
        <span className="ab-spin" />
        불러오는 중…
      </div>
    )
  }

  return (
    <>
      <PageHead eyebrow="Service Setting" title="서비스 사용 설정" />

      <div className="set-block">
        <div className="set-block-head">전자결재 서비스</div>
        <div className="set-row">
          <span className="k">서비스 사용 설정</span>
          <RadioGroup<OnOff>
            value={enabled ? 'on' : 'off'}
            onChange={(v) => {
              setEnabled(v === 'on')
              setDirty(true)
            }}
            options={ON_OFF_OPTIONS}
          />
        </div>
        <div className="set-row" style={{ borderBottom: 'none' }}>
          <span className="k" />
          <div style={{ fontSize: 12, color: 'var(--fg-4)', lineHeight: 1.7 }}>
            ‘사용 안 함’으로 설정하면 기안 작성·결재함·양식·결재선 등 전자결재 기능 전체가
            비활성화됩니다. (인사/근태 요청의 결재 처리는 영향받지 않습니다.)
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          className="btn btn-primary"
          disabled={!dirty || saveMutation.isPending}
          onClick={() => saveMutation.mutate(enabled)}
        >
          저장
        </button>
      </div>
    </>
  )
}
