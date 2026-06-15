'use client'
import { useEffect, useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { PageHead } from '@/components/ab/Page'
import { Toggle, RadioGroup } from '@/components/ab/atoms'
import { I } from '@/components/ab/icons'
import { ConfirmDialog } from '@/components/ab/Modal'
import { useToast } from '@/components/ab/Toast'
import apiClient from '@/lib/api-client'
import EmployeesPanel from '@/app/admin/employees/EmployeesPanel'
import OrganizationsPanel from '@/app/admin/organizations/OrganizationsPanel'
import ApprovalCommonPanel from '@/app/admin/approval/common/ApprovalCommonPanel'
import PermissionsPanel from '@/app/admin/settings/permissions/PermissionsPanel'
import NotificationsPanel from '@/app/admin/settings/notifications/NotificationsPanel'
import LeaveSettingsPanel from '@/components/admin/LeaveSettingsPanel'
import RequestSettingsPanel from '@/components/admin/RequestSettingsPanel'
import ClosingPanel from '@/components/admin/ClosingPanel'
import AdvancedSettingsPanel from '@/components/admin/AdvancedSettingsPanel'
import { useAuthStore } from '@/stores/auth.store'
import {
  useCompany,
  useUpdateCompany,
  useCompanyHolidays,
  useCreateCompanyHoliday,
  useDeleteCompanyHoliday,
  type CompanyHoliday,
} from '@/lib/query/companies'
import { getApiErrorMessage } from '@/lib/api-error'

// ── Types ─────────────────────────────────────────────────────────────────────

interface CompanySettings {
  weekStartDay?: string
  timeFormat?: string
  noShiftClockPolicy?: string
  lateGracePeriodMinutes?: number
  earlyArrivalAllowedMinutes?: number
  pcTimeclockEnabled?: boolean
  timeclockConfirmEnabled?: boolean
  shiftConfirmEnabled?: boolean
  shiftTemplateCodeEnabled?: boolean
  impliedWorkEnabled?: boolean
  autoBreakEnabled?: boolean
  shiftBreakEnabled?: boolean
}

interface CompanyForm {
  name: string
  countryCode: string
  logoUrl: string
  timezone: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

// 좌측 서브내비. 급여정산·전자계약 항목은 제외(NEVER 목록).
const SECTIONS = [
  { key: 'general', label: '일반' },
  { key: 'notification', label: '알림' },
  { key: 'permission', label: '권한' },
  { key: 'organization', label: '조직' },
  { key: 'employee', label: '직원' },
  { key: 'approval', label: '전자결재' },
  { key: 'shift', label: '근무일정' },
  { key: 'attendance', label: '출퇴근' },
  { key: 'break', label: '휴게시간' },
  { key: 'leave', label: '휴가' },
  { key: 'request', label: '요청' },
  { key: 'closing', label: '마감' },
  { key: 'advanced', label: '고급 옵션' },
] as const
type SectionKey = (typeof SECTIONS)[number]['key']

const WEEK_DAYS = [
  { value: 'monday', label: '월요일' },
  { value: 'tuesday', label: '화요일' },
  { value: 'wednesday', label: '수요일' },
  { value: 'thursday', label: '목요일' },
  { value: 'friday', label: '금요일' },
  { value: 'saturday', label: '토요일' },
  { value: 'sunday', label: '일요일' },
]

const COUNTRIES = [
  { value: 'KR', label: '대한민국' },
  { value: 'JP', label: '일본' },
  { value: 'US', label: '미국' },
]

const TIMEZONES = ['Asia/Seoul', 'Asia/Tokyo', 'Asia/Shanghai', 'UTC', 'America/New_York']

// 별도 BE 필드가 없는 안내성 섹션 (임베드 패널이 없는 섹션만 안내 문구 표시)
// ─────────────────────────────────────────────────────────────────────────────

export default function CompanySettingsPage() {
  const toast = useToast()
  const user = useAuthStore((s) => s.user)
  const companyId = user?.companyId
  const isSuperAdmin = user?.accessLevel === 'SUPER_ADMIN'

  const [section, setSection] = useState<SectionKey>('general')
  const [dirty, setDirty] = useState(false)

  // 딥링크(?section=key) 지원 — 다른 화면에서 특정 섹션으로 진입할 때 사용
  useEffect(() => {
    if (typeof window === 'undefined') return
    const requested = new URLSearchParams(window.location.search).get('section')
    if (requested && SECTIONS.some((s) => s.key === requested)) {
      setSection(requested as SectionKey)
    }
  }, [])

  // ── 회사 정보 (일반) ──────────────────────────────────────
  const { data: company } = useCompany(companyId)
  const updateCompany = useUpdateCompany()
  const [companyForm, setCompanyForm] = useState<CompanyForm>({
    name: '',
    countryCode: 'KR',
    logoUrl: '',
    timezone: 'Asia/Seoul',
  })

  useEffect(() => {
    if (company) {
      setCompanyForm({
        name: company.name ?? '',
        countryCode: company.countryCode ?? 'KR',
        logoUrl: company.logoUrl ?? '',
        timezone: company.timezone ?? 'Asia/Seoul',
      })
    }
  }, [company])

  // ── 회사 설정 (출퇴근/근무일정/휴게 등) ──────────────────
  const { data: settings, isLoading: settingsLoading } = useQuery<CompanySettings>({
    queryKey: ['company-settings'],
    queryFn: () => apiClient.get('/company-settings') as Promise<CompanySettings>,
    staleTime: 60_000,
  })
  const [settingsForm, setSettingsForm] = useState<CompanySettings>({})
  useEffect(() => {
    if (settings) setSettingsForm(settings)
  }, [settings])

  const saveSettings = useMutation({
    mutationFn: (patch: Partial<CompanySettings>) => apiClient.patch('/company-settings', patch),
  })

  // ── 휴일 ──────────────────────────────────────────────────
  const { data: holidays } = useCompanyHolidays()
  const createHoliday = useCreateCompanyHoliday()
  const deleteHoliday = useDeleteCompanyHoliday()
  const [holidayName, setHolidayName] = useState('')
  const [holidayDate, setHolidayDate] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<CompanyHoliday | null>(null)

  // ── 헬퍼 ──────────────────────────────────────────────────
  function markDirty() {
    setDirty(true)
  }
  function setCompany<K extends keyof CompanyForm>(key: K, value: CompanyForm[K]) {
    setCompanyForm((prev) => ({ ...prev, [key]: value }))
    markDirty()
  }
  function setSetting<K extends keyof CompanySettings>(key: K, value: CompanySettings[K]) {
    setSettingsForm((prev) => ({ ...prev, [key]: value }))
    markDirty()
  }

  async function handleSave() {
    try {
      if (section === 'general' && companyId) {
        await updateCompany.mutateAsync({
          id: companyId,
          name: companyForm.name.trim(),
          countryCode: companyForm.countryCode,
          timezone: companyForm.timezone,
          ...(companyForm.logoUrl.trim() !== '' && { logoUrl: companyForm.logoUrl.trim() }),
        })
      } else if (section === 'attendance') {
        await saveSettings.mutateAsync({
          noShiftClockPolicy: settingsForm.noShiftClockPolicy,
          lateGracePeriodMinutes: settingsForm.lateGracePeriodMinutes,
          earlyArrivalAllowedMinutes: settingsForm.earlyArrivalAllowedMinutes,
          pcTimeclockEnabled: settingsForm.pcTimeclockEnabled,
          timeclockConfirmEnabled: settingsForm.timeclockConfirmEnabled,
        })
      } else if (section === 'shift') {
        await saveSettings.mutateAsync({
          weekStartDay: settingsForm.weekStartDay,
          shiftConfirmEnabled: settingsForm.shiftConfirmEnabled,
          shiftTemplateCodeEnabled: settingsForm.shiftTemplateCodeEnabled,
          impliedWorkEnabled: settingsForm.impliedWorkEnabled,
        })
      } else if (section === 'break') {
        await saveSettings.mutateAsync({
          autoBreakEnabled: settingsForm.autoBreakEnabled,
          shiftBreakEnabled: settingsForm.shiftBreakEnabled,
        })
      }
      setDirty(false)
      toast('설정을 저장했습니다')
    } catch (e) {
      toast(getApiErrorMessage(e, '저장에 실패했습니다'))
    }
  }

  function handleAddHoliday() {
    if (!holidayName.trim() || !holidayDate) return
    createHoliday.mutate(
      { name: holidayName.trim(), holidayDate, isAnnualRepeat: false },
      {
        onSuccess: () => {
          setHolidayName('')
          setHolidayDate('')
          toast('휴일을 등록했습니다')
        },
        onError: (e) => toast(getApiErrorMessage(e, '휴일 등록에 실패했습니다')),
      },
    )
  }

  function handleDeleteHoliday() {
    if (!deleteTarget) return
    deleteHoliday.mutate(deleteTarget.id, {
      onSuccess: () => {
        setDeleteTarget(null)
        toast('휴일을 삭제했습니다')
      },
      onError: (e) => toast(getApiErrorMessage(e, '휴일 삭제에 실패했습니다')),
    })
  }

  const saving = updateCompany.isPending || saveSettings.isPending
  // 저장 버튼을 노출하는 섹션(실제 mutation 존재)
  const SAVEABLE: SectionKey[] = ['general', 'attendance', 'shift', 'break']
  const showSave = SAVEABLE.includes(section)

  return (
    <>
      <PageHead
        eyebrow="Company Settings"
        title="회사 설정"
        right={
          showSave ? (
            <button className="btn btn-primary btn-sm" disabled={!dirty || saving} onClick={handleSave}>
              {saving ? '저장 중…' : '저장'}
            </button>
          ) : undefined
        }
      />

      <div className="split">
        <div className="pane">
          <div className="pane-head">
            <span className="dot" />
            <span className="t">설정 항목</span>
          </div>
          <div className="subnav">
            {SECTIONS.map((s) => (
              <button
                key={s.key}
                className={'subnav-item' + (section === s.key ? ' on' : '')}
                onClick={() => {
                  if (s.key === section) return
                  // 섹션 전환 시 미저장 편집을 폐기하고 원본으로 재동기
                  if (dirty && !window.confirm('저장하지 않은 변경 사항이 있습니다. 변경 사항을 폐기하고 이동할까요?')) {
                    return
                  }
                  if (settings) setSettingsForm(settings)
                  if (company) {
                    setCompanyForm({
                      name: company.name ?? '',
                      countryCode: company.countryCode ?? 'KR',
                      logoUrl: company.logoUrl ?? '',
                      timezone: company.timezone ?? 'Asia/Seoul',
                    })
                  }
                  setSection(s.key)
                  setDirty(false)
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          {/* ── 일반 ─────────────────────────────────────────── */}
          {section === 'general' && (
            <div className="set-block">
              <div className="set-block-head">일반</div>
              <div className="set-row">
                <span className="k">회사명</span>
                <div>
                  <input
                    className="inp-block"
                    value={companyForm.name}
                    onChange={(e) => setCompany('name', e.target.value)}
                    disabled={!isSuperAdmin}
                    style={{ maxWidth: 360 }}
                  />
                </div>
              </div>
              <div className="set-row">
                <span className="k">국가</span>
                <div>
                  <select
                    className="sel"
                    value={companyForm.countryCode}
                    onChange={(e) => setCompany('countryCode', e.target.value)}
                    disabled={!isSuperAdmin}
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
                <span className="k">회사 로고</span>
                <div>
                  <input
                    className="inp-block"
                    value={companyForm.logoUrl}
                    onChange={(e) => setCompany('logoUrl', e.target.value)}
                    disabled={!isSuperAdmin}
                    placeholder="https://example.com/logo.png"
                    style={{ maxWidth: 360 }}
                  />
                </div>
              </div>
              <div className="set-row">
                <span className="k">
                  관리 단위 <span className="help">시간대</span>
                </span>
                <div>
                  <select
                    className="sel"
                    value={companyForm.timezone}
                    onChange={(e) => setCompany('timezone', e.target.value)}
                    disabled={!isSuperAdmin}
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
                <span className="k">1주 시작 요일</span>
                <div>
                  <select
                    className="sel"
                    value={settingsForm.weekStartDay ?? 'monday'}
                    onChange={(e) => setSetting('weekStartDay', e.target.value)}
                    style={{ maxWidth: 160 }}
                  >
                    {WEEK_DAYS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="set-row" style={{ gridTemplateColumns: '200px 1fr' }}>
                <span className="k">회사 지정 휴일</span>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <input
                      className="inp-block"
                      placeholder="휴일명"
                      value={holidayName}
                      onChange={(e) => setHolidayName(e.target.value)}
                      style={{ maxWidth: 160 }}
                    />
                    <input
                      className="inp-block"
                      type="date"
                      value={holidayDate}
                      onChange={(e) => setHolidayDate(e.target.value)}
                      style={{ maxWidth: 170 }}
                    />
                    <button
                      className="btn btn-line btn-sm"
                      disabled={!holidayName.trim() || !holidayDate || createHoliday.isPending}
                      onClick={handleAddHoliday}
                    >
                      {I.plus({ style: { marginRight: 4 } })}추가
                    </button>
                  </div>
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {(holidays ?? []).length === 0 ? (
                      <span style={{ fontSize: 12, color: 'var(--fg-5)' }}>등록된 지정 휴일이 없습니다.</span>
                    ) : (
                      (holidays ?? []).map((h) => (
                        <div
                          key={h.id}
                          style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12 }}
                        >
                          <span className="att-dur" style={{ color: 'var(--fg-3)' }}>
                            {h.holidayDate.slice(0, 10)}
                          </span>
                          <span style={{ color: '#fff' }}>{h.name}</span>
                          {h.isAnnualRepeat && <span style={{ color: 'var(--ab-orange)' }}>매년</span>}
                          <span
                            className="icell"
                            style={{ color: 'var(--err)' }}
                            onClick={() => setDeleteTarget(h)}
                          >
                            {I.trash()}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
              {!isSuperAdmin && (
                <div className="set-row" style={{ gridTemplateColumns: '1fr' }}>
                  <span style={{ fontSize: 12, color: 'var(--fg-5)' }}>
                    회사 기본 정보는 최고관리자(SUPER_ADMIN)만 수정할 수 있습니다.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ── 출퇴근 ───────────────────────────────────────── */}
          {section === 'attendance' && (
            <div className="set-block">
              <div className="set-block-head">출퇴근</div>
              <div className="set-row">
                <span className="k">무일정 출퇴근 정책</span>
                <div>
                  <RadioGroup
                    value={settingsForm.noShiftClockPolicy ?? 'if_no_shift'}
                    onChange={(v) => setSetting('noShiftClockPolicy', v)}
                    options={[
                      { value: 'always', label: '항상 허용' },
                      { value: 'if_no_shift', label: '근무일정 없을 때만' },
                      { value: 'never', label: '허용 안 함' },
                    ]}
                  />
                </div>
              </div>
              <div className="set-row">
                <span className="k">지각 유예 시간</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    className="inp-block"
                    type="number"
                    min={0}
                    max={120}
                    value={settingsForm.lateGracePeriodMinutes ?? 0}
                    onChange={(e) =>
                      setSetting('lateGracePeriodMinutes', Math.max(0, Math.min(120, Number(e.target.value))))
                    }
                    style={{ maxWidth: 120 }}
                  />
                  <span style={{ fontSize: 12, color: 'var(--fg-4)' }}>분 (0~120)</span>
                </div>
              </div>
              <div className="set-row">
                <span className="k">근무 시작 전 출근 허용</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    className="inp-block"
                    type="number"
                    min={0}
                    value={settingsForm.earlyArrivalAllowedMinutes ?? 0}
                    onChange={(e) => setSetting('earlyArrivalAllowedMinutes', Math.max(0, Number(e.target.value)))}
                    style={{ maxWidth: 120 }}
                  />
                  <span style={{ fontSize: 12, color: 'var(--fg-4)' }}>분</span>
                </div>
              </div>
              <div className="set-row">
                <span className="k">PC 출퇴근 사용</span>
                <div>
                  <Toggle
                    on={settingsForm.pcTimeclockEnabled ?? false}
                    onChange={(v) => setSetting('pcTimeclockEnabled', v)}
                    label={settingsForm.pcTimeclockEnabled ? '사용' : '사용 안 함'}
                  />
                </div>
              </div>
              <div className="set-row">
                <span className="k">출퇴근기록 확정 기능</span>
                <div>
                  <Toggle
                    on={settingsForm.timeclockConfirmEnabled ?? false}
                    onChange={(v) => setSetting('timeclockConfirmEnabled', v)}
                    label={settingsForm.timeclockConfirmEnabled ? '사용' : '사용 안 함'}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── 근무일정 ─────────────────────────────────────── */}
          {section === 'shift' && (
            <div className="set-block">
              <div className="set-block-head">근무일정</div>
              <div className="set-row">
                <span className="k">주 시작 요일</span>
                <div>
                  <select
                    className="sel"
                    value={settingsForm.weekStartDay ?? 'monday'}
                    onChange={(e) => setSetting('weekStartDay', e.target.value)}
                    style={{ maxWidth: 160 }}
                  >
                    {WEEK_DAYS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="set-row">
                <span className="k">근무일정 확정 기능</span>
                <div>
                  <Toggle
                    on={settingsForm.shiftConfirmEnabled ?? false}
                    onChange={(v) => setSetting('shiftConfirmEnabled', v)}
                    label={settingsForm.shiftConfirmEnabled ? '사용' : '사용 안 함'}
                  />
                </div>
              </div>
              <div className="set-row">
                <span className="k">템플릿 코드 기능</span>
                <div>
                  <Toggle
                    on={settingsForm.shiftTemplateCodeEnabled ?? false}
                    onChange={(v) => setSetting('shiftTemplateCodeEnabled', v)}
                    label={settingsForm.shiftTemplateCodeEnabled ? '사용' : '사용 안 함'}
                  />
                </div>
              </div>
              <div className="set-row">
                <span className="k">간주근로 기능</span>
                <div>
                  <Toggle
                    on={settingsForm.impliedWorkEnabled ?? false}
                    onChange={(v) => setSetting('impliedWorkEnabled', v)}
                    label={settingsForm.impliedWorkEnabled ? '사용' : '사용 안 함'}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── 휴게시간 ─────────────────────────────────────── */}
          {section === 'break' && (
            <div className="set-block">
              <div className="set-block-head">휴게시간</div>
              <div className="set-row">
                <span className="k">자동 휴게시간 사용</span>
                <div>
                  <Toggle
                    on={settingsForm.autoBreakEnabled ?? false}
                    onChange={(v) => setSetting('autoBreakEnabled', v)}
                    label={settingsForm.autoBreakEnabled ? '사용' : '사용 안 함'}
                  />
                </div>
              </div>
              <div className="set-row">
                <span className="k">근무일정 휴게시간 기능</span>
                <div>
                  <Toggle
                    on={settingsForm.shiftBreakEnabled ?? false}
                    onChange={(v) => setSetting('shiftBreakEnabled', v)}
                    label={settingsForm.shiftBreakEnabled ? '사용' : '사용 안 함'}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── 직원 (임베드 패널) ───────────────────────────── */}
          {section === 'employee' && <EmployeesPanel />}

          {/* ── 조직 (임베드 패널) ───────────────────────────── */}
          {section === 'organization' && <OrganizationsPanel />}

          {/* ── 전자결재 (임베드 패널: 공통 관리 — 문서/정책/알림) ─ */}
          {section === 'approval' && <ApprovalCommonPanel />}

          {/* ── 권한 (임베드 패널) ───────────────────────────── */}
          {section === 'permission' && <PermissionsPanel />}

          {/* ── 알림 (임베드 패널) ───────────────────────────── */}
          {section === 'notification' && <NotificationsPanel />}

          {/* ── 휴가 (임베드 패널: 현황/유형/발생규칙/목록/보상) ─ */}
          {section === 'leave' && <LeaveSettingsPanel />}

          {/* ── 요청 (임베드 패널: 요청내역/승인규칙/커스텀유형) ─ */}
          {section === 'request' && <RequestSettingsPanel />}

          {/* ── 마감 (임베드 패널: 근태 기간 확정/해제) ────────── */}
          {section === 'closing' && <ClosingPanel />}

          {/* ── 고급 옵션 (임베드 패널) ──────────────────────── */}
          {section === 'advanced' && <AdvancedSettingsPanel />}

          {settingsLoading && (section === 'attendance' || section === 'shift' || section === 'break') && (
            <div className="ab-loading">
              <span className="ab-spin" />
              불러오는 중…
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="휴일 삭제"
        message={`"${deleteTarget?.name}" 휴일을 삭제하시겠습니까?`}
        confirmLabel="삭제"
        onConfirm={handleDeleteHoliday}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  )
}
