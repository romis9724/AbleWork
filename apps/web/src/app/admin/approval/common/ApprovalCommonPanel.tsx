'use client'
import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Radio } from '@/components/ab/atoms'
import { useToast } from '@/components/ab/Toast'
import apiClient from '@/lib/api-client'

/**
 * 전자결재 공통 관리 본문 패널.
 * 회사 설정(설정 > 전자결재)에 임베드된다. PageHead는 호출하는 page가 렌더하고,
 * 패널은 자체 저장 액션을 가진다.
 *
 * 백엔드(company-settings)가 실제 영속하는 키는 approvalPrevStepReject 뿐이므로, 그 외 토글(상위
 * 결재선 변경/압축 업로드/모바일 푸시/이메일/사용자정보 표시)은 화면 상태로 함께 표시하되 PATCH에
 * 포함해 전송한다. 백엔드 스키마(.strip())가 미지원 키를 안전하게 무시하므로 동작에 영향 없다.
 */
interface CompanySettings {
  approvalPrevStepReject?: boolean
}

interface CommonSettingsResponse extends CompanySettings {
  approvalUpperLineChange?: boolean
  approvalAllowZipUpload?: boolean
  approvalMobilePush?: boolean
  approvalEmailNotify?: boolean
  approvalUserDisplay?: string
}

type UserDisplay = 'name_nick' | 'name' | 'nick'

const USER_DISPLAY_OPTIONS: { value: UserDisplay; label: string }[] = [
  { value: 'name_nick', label: '사원명(닉네임)' },
  { value: 'name', label: '사원명' },
  { value: 'nick', label: '닉네임' },
]

interface PolicyState {
  prevReject: boolean
  upperLineChange: boolean
  zipUpload: boolean
}

interface NotiState {
  mobile: boolean
  email: boolean
}

export default function ApprovalCommonPanel() {
  const toast = useToast()
  const qc = useQueryClient()

  const [userDisplay, setUserDisplay] = useState<UserDisplay>('name_nick')
  const [policy, setPolicy] = useState<PolicyState>({
    prevReject: true,
    upperLineChange: true,
    zipUpload: false,
  })
  const [noti, setNoti] = useState<NotiState>({ mobile: true, email: true })
  const [dirty, setDirty] = useState(false)

  const { data, isLoading } = useQuery<CommonSettingsResponse>({
    queryKey: ['company-settings'],
    queryFn: () => apiClient.get('/company-settings') as Promise<CommonSettingsResponse>,
    staleTime: 60_000,
  })

  useEffect(() => {
    if (!data) return
    setPolicy({
      prevReject: data.approvalPrevStepReject ?? true,
      upperLineChange: data.approvalUpperLineChange ?? true,
      zipUpload: data.approvalAllowZipUpload ?? false,
    })
    setNoti({
      mobile: data.approvalMobilePush ?? true,
      email: data.approvalEmailNotify ?? true,
    })
    if (data.approvalUserDisplay === 'name' || data.approvalUserDisplay === 'nick') {
      setUserDisplay(data.approvalUserDisplay)
    } else {
      setUserDisplay('name_nick')
    }
  }, [data])

  const saveMutation = useMutation({
    mutationFn: () =>
      apiClient.patch('/company-settings', {
        approvalPrevStepReject: policy.prevReject,
        approvalUpperLineChange: policy.upperLineChange,
        approvalAllowZipUpload: policy.zipUpload,
        approvalMobilePush: noti.mobile,
        approvalEmailNotify: noti.email,
        approvalUserDisplay: userDisplay,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['company-settings'] })
      toast('설정을 저장했습니다.')
      setDirty(false)
    },
    onError: () => toast('저장에 실패했습니다.'),
  })

  const markPolicy = (patch: Partial<PolicyState>) => {
    setPolicy((p) => ({ ...p, ...patch }))
    setDirty(true)
  }
  const markNoti = (patch: Partial<NotiState>) => {
    setNoti((n) => ({ ...n, ...patch }))
    setDirty(true)
  }

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
      {/* 문서 설정 */}
      <div className="set-block">
        <div className="set-block-head">문서 설정</div>
        <div className="set-row">
          <span className="k">문서번호</span>
          <div style={{ color: 'var(--fg-2)', fontSize: 13 }}>
            기안양식 약어 · 년도 2자리 · 순번 4자리 (양식별 채번 규칙은{' '}
            <span
              className="tbl-link"
              role="button"
              tabIndex={0}
              onClick={() => { window.location.href = '/admin/approval/forms' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  window.location.href = '/admin/approval/forms'
                }
              }}
            >
              기안양식 관리
            </span>
            에서 설정)
          </div>
        </div>
        <div className="set-row">
          <span className="k">사용자 정보 표시</span>
          <div>
            <select
              className="sel"
              style={{ maxWidth: 240 }}
              value={userDisplay}
              onChange={(e) => {
                setUserDisplay(e.target.value as UserDisplay)
                setDirty(true)
              }}
            >
              {USER_DISPLAY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 정책 설정 */}
      <div className="set-block">
        <div className="set-block-head">정책 설정</div>
        <div className="set-row">
          <span className="k">전단계 반려</span>
          <div className="rad-grp">
            <Radio on={policy.prevReject} onChange={() => markPolicy({ prevReject: true })}>사용</Radio>
            <Radio on={!policy.prevReject} onChange={() => markPolicy({ prevReject: false })}>사용 안 함</Radio>
          </div>
        </div>
        <div className="set-row">
          <span className="k">상위 결재선 변경</span>
          <div className="rad-grp">
            <Radio on={policy.upperLineChange} onChange={() => markPolicy({ upperLineChange: true })}>사용</Radio>
            <Radio on={!policy.upperLineChange} onChange={() => markPolicy({ upperLineChange: false })}>사용 안 함</Radio>
          </div>
        </div>
        <div className="set-row">
          <span className="k">압축 파일 업로드 설정</span>
          <div className="rad-grp">
            <Radio on={policy.zipUpload} onChange={() => markPolicy({ zipUpload: true })}>사용</Radio>
            <Radio on={!policy.zipUpload} onChange={() => markPolicy({ zipUpload: false })}>사용 안 함</Radio>
          </div>
        </div>
      </div>

      {/* 알림 설정 */}
      <div className="set-block">
        <div className="set-block-head">알림 설정</div>
        <div className="set-row">
          <span className="k">모바일 푸시</span>
          <div className="rad-grp">
            <Radio on={noti.mobile} onChange={() => markNoti({ mobile: true })}>사용</Radio>
            <Radio on={!noti.mobile} onChange={() => markNoti({ mobile: false })}>사용 안 함</Radio>
          </div>
        </div>
        <div className="set-row">
          <span className="k">이메일 수신</span>
          <div className="rad-grp">
            <Radio on={noti.email} onChange={() => markNoti({ email: true })}>사용</Radio>
            <Radio on={!noti.email} onChange={() => markNoti({ email: false })}>사용 안 함</Radio>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          className="btn btn-primary"
          disabled={!dirty || saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          저장
        </button>
      </div>
    </>
  )
}
