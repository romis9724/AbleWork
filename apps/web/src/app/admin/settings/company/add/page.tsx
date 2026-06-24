'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { PageHead } from '@/components/ab/Page'
import { useToast } from '@/components/ab/Toast'
import { useAuthStore } from '@/stores/auth.store'
import { usePermission } from '@/hooks/usePermission'
import { useAddCompany, useSwitchCompany, type AddCompanyInput } from '@/lib/query/auth'
import { parseJwt, writeAuthCookies } from '@/lib/auth-session'
import { getApiErrorMessage } from '@/lib/api-error'

const COUNTRIES = [
  { value: 'KR', label: '대한민국' },
  { value: 'US', label: '미국' },
  { value: 'JP', label: '일본' },
  { value: 'CN', label: '중국' },
]

const TIMEZONES = ['Asia/Seoul', 'Asia/Tokyo', 'Asia/Shanghai', 'America/Los_Angeles', 'UTC']

/**
 * 회사 추가 — 로그인한 SUPER_ADMIN이 같은 그룹에 새 회사를 만든다.
 * 생성 직후 새 회사로 전환한다.
 */
export default function AddCompanyPage() {
  const router = useRouter()
  const qc = useQueryClient()
  const toast = useToast()
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const { isSuperAdmin } = usePermission()
  const addCompany = useAddCompany()
  const switchCompany = useSwitchCompany()

  const [form, setForm] = useState<AddCompanyInput>({
    name: '',
    businessNumber: '',
    countryCode: 'KR',
    timezone: 'Asia/Seoul',
    logoUrl: '',
  })

  const busy = addCompany.isPending || switchCompany.isPending
  const set = (k: keyof AddCompanyInput, v: string) => setForm((f) => ({ ...f, [k]: v }))

  if (!isSuperAdmin) {
    return (
      <>
        <PageHead eyebrow="Company" title="회사 추가" />
        <div className="set-block">
          <div className="set-block-head">접근 불가</div>
          <p style={{ color: 'var(--fg-5)', fontSize: 13, padding: '8px 0' }}>
            회사 추가는 최고관리자(SUPER_ADMIN)만 가능합니다.
          </p>
        </div>
      </>
    )
  }

  const handleCreate = async () => {
    if (!form.name.trim()) {
      toast('회사명을 입력하세요.')
      return
    }
    // 빈 문자열 옵션 필드는 전송하지 않는다.
    const payload: AddCompanyInput = {
      name: form.name.trim(),
      countryCode: form.countryCode,
      timezone: form.timezone,
      ...(form.businessNumber ? { businessNumber: form.businessNumber } : {}),
      ...(form.logoUrl ? { logoUrl: form.logoUrl } : {}),
    }
    try {
      const { company } = await addCompany.mutateAsync(payload)
      // 새 회사로 전환 (토큰 재발급)
      const { accessToken, refreshToken } = await switchCompany.mutateAsync(company.id)
      writeAuthCookies(accessToken, refreshToken)
      const claims = parseJwt(accessToken)
      setUser({
        userId: claims.sub,
        employeeId: claims.employeeId,
        companyId: claims.companyId,
        accessLevel: claims.accessLevel,
        name: user?.name,
      })
      qc.clear()
      toast(`${company.name} 회사가 추가되었습니다.`)
      router.push('/admin/dashboard')
      router.refresh()
    } catch (e) {
      toast(getApiErrorMessage(e, '회사 추가에 실패했습니다.'))
    }
  }

  return (
    <>
      <PageHead
        eyebrow="Company"
        title="회사 추가"
        right={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm" disabled={busy} onClick={() => router.back()}>
              취소
            </button>
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={handleCreate}>
              {busy ? '생성 중…' : '회사 생성'}
            </button>
          </div>
        }
      />

      <div className="set-block">
        <div className="set-block-head">새 회사 정보</div>
        <p style={{ color: 'var(--fg-5)', fontSize: 12, margin: '0 0 8px' }}>
          현재 그룹에 새 회사가 추가되며, 회원님이 해당 회사의 최고관리자로 등록됩니다.
        </p>

        <div className="set-row">
          <span className="k">
            회사명 <span style={{ color: 'var(--ab-orange)' }}>*</span>
          </span>
          <div>
            <input
              className="inp-block"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="예) AbleWork 2호점"
              style={{ maxWidth: 360 }}
              autoFocus
            />
          </div>
        </div>

        <div className="set-row">
          <span className="k">사업자등록번호</span>
          <div>
            <input
              className="inp-block"
              value={form.businessNumber ?? ''}
              onChange={(e) => set('businessNumber', e.target.value)}
              placeholder="숫자 10자리"
              style={{ maxWidth: 240 }}
            />
          </div>
        </div>

        <div className="set-row">
          <span className="k">국가</span>
          <div>
            <select
              className="sel"
              value={form.countryCode}
              onChange={(e) => set('countryCode', e.target.value)}
              style={{ maxWidth: 220 }}
            >
              {COUNTRIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="set-row">
          <span className="k">타임존</span>
          <div>
            <select
              className="sel"
              value={form.timezone}
              onChange={(e) => set('timezone', e.target.value)}
              style={{ maxWidth: 220 }}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="set-row">
          <span className="k">회사 로고 URL</span>
          <div>
            <input
              className="inp-block"
              value={form.logoUrl ?? ''}
              onChange={(e) => set('logoUrl', e.target.value)}
              placeholder="https://…"
              style={{ maxWidth: 360 }}
            />
          </div>
        </div>
      </div>
    </>
  )
}
