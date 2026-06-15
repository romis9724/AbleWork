'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth.store'
import { useEmployee, useUpdateEmployee } from '@/lib/query/employees'
import apiClient from '@/lib/api-client'
import { PageHead } from '@/components/ab/Page'
import { Avatar } from '@/components/ab/atoms'
import { I } from '@/components/ab/icons'
import { useToast } from '@/components/ab/Toast'

const EMPLOYMENT_LABEL: Record<string, string> = {
  REGULAR: '정규직',
  CONTRACT: '계약직',
  PART_TIME: '파트타임',
  INTERN: '인턴',
  DAILY: '일용직',
}

function dateLabel(iso?: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ko-KR')
}

export default function ProfilePage() {
  const router = useRouter()
  const toast = useToast()
  const { user, clearUser } = useAuthStore()

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)

  const { data: employee, isLoading } = useEmployee(user?.employeeId ?? '')
  const updateEmployee = useUpdateEmployee()

  useEffect(() => {
    if (employee) {
      setName(employee.name ?? '')
      setPhone(employee.phone ?? '')
    }
  }, [employee])

  const handleSaveProfile = async () => {
    if (!user?.employeeId) return
    try {
      await updateEmployee.mutateAsync({ id: user.employeeId, name, phone })
      toast('프로필이 저장됐습니다')
    } catch (err) {
      toast(err instanceof Error ? err.message : '저장 중 오류가 발생했습니다')
    }
  }

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast('모든 비밀번호 항목을 입력해 주세요')
      return
    }
    if (newPassword !== confirmPassword) {
      toast('새 비밀번호가 일치하지 않습니다')
      return
    }
    if (newPassword.length < 8) {
      toast('새 비밀번호는 8자 이상이어야 합니다')
      return
    }
    setChangingPassword(true)
    try {
      await apiClient.post('/auth/change-password', { currentPassword, newPassword, confirmPassword })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      toast('비밀번호가 변경됐습니다')
    } catch (err) {
      toast(err instanceof Error ? err.message : '비밀번호 변경 중 오류가 발생했습니다')
    } finally {
      setChangingPassword(false)
    }
  }

  const handleLogout = () => {
    document.cookie = 'accessToken=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT'
    document.cookie = 'refreshToken=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT'
    clearUser()
    router.push('/login')
  }

  const passwordMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword

  if (isLoading) {
    return (
      <>
        <PageHead eyebrow="Profile" title="내 프로필" />
        <div className="ab-loading"><span className="ab-spin" />불러오는 중…</div>
      </>
    )
  }

  const primaryOrg = employee?.organizations?.find((o) => o.isPrimary)?.organization
    ?? employee?.organizations?.[0]?.organization
  const positionNames = employee?.positions?.map((p) => p.position.name).join(', ')

  return (
    <>
      <PageHead eyebrow="Profile" title="내 프로필" />

      {/* 프로필 헤더 */}
      <div className="me-profile-hero">
        <Avatar name={employee?.name ?? user?.accessLevel} on />
        <div className="grow">
          <div className="me-profile-name">{employee?.name ?? '—'}</div>
          <div className="me-profile-sub">
            {primaryOrg?.name ?? '—'}
            {positionNames && <> · {positionNames}</>}
          </div>
        </div>
      </div>

      {/* 기본 정보 (수정 가능) */}
      <div className="set-block">
        <div className="set-block-head">기본 정보</div>
        <div className="set-row">
          <span className="k">이름</span>
          <input className="inp-block" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="set-row">
          <span className="k">전화번호</span>
          <input
            className="inp-block"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="010-0000-0000"
          />
        </div>
        <div className="set-row">
          <span className="k" />
          <div>
            <button className="btn btn-primary" disabled={updateEmployee.isPending} onClick={handleSaveProfile}>
              {updateEmployee.isPending ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
      </div>

      {/* 근로 정보 (읽기 전용) */}
      <div className="set-block">
        <div className="set-block-head">근로 정보</div>
        <div style={{ padding: '6px 24px 14px' }}>
          <div className="doc-field">
            <span className="fk">사번</span>
            <span className="fv tek">{employee?.employeeNumber ?? '—'}</span>
          </div>
          <div className="doc-field">
            <span className="fk">이메일</span>
            <span className="fv">{employee?.user?.email ?? '—'}</span>
          </div>
          <div className="doc-field">
            <span className="fk">고용 형태</span>
            <span className="fv">{employee ? EMPLOYMENT_LABEL[employee.employmentType] ?? employee.employmentType : '—'}</span>
          </div>
          <div className="doc-field">
            <span className="fk">권한</span>
            <span className="fv">{employee?.accessLevel ?? user?.accessLevel ?? '—'}</span>
          </div>
          <div className="doc-field">
            <span className="fk">입사일</span>
            <span className="fv">{dateLabel(employee?.joinedAt)}</span>
          </div>
        </div>
      </div>

      {/* 비밀번호 변경 */}
      <div className="set-block">
        <div className="set-block-head">비밀번호 변경</div>
        <div className="set-row">
          <span className="k">현재 비밀번호</span>
          <input
            className="inp-block"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </div>
        <div className="set-row">
          <span className="k">새 비밀번호</span>
          <div>
            <input
              className="inp-block"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <div className="me-field-hint">8자 이상</div>
          </div>
        </div>
        <div className="set-row">
          <span className="k">새 비밀번호 확인</span>
          <div>
            <input
              className="inp-block"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            {passwordMismatch && <div className="me-field-hint err">비밀번호가 일치하지 않습니다</div>}
          </div>
        </div>
        <div className="set-row">
          <span className="k" />
          <div>
            <button className="btn btn-line" disabled={changingPassword} onClick={handleChangePassword}>
              {changingPassword ? '변경 중…' : '비밀번호 변경'}
            </button>
          </div>
        </div>
      </div>

      <button className="btn btn-line me-logout" onClick={handleLogout}>
        {I.logout()} 로그아웃
      </button>
    </>
  )
}
