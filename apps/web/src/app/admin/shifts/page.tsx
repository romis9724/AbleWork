'use client'
import { useMemo, useState } from 'react'
import { PageHead } from '@/components/ab/Page'
import { Emp, DateInput } from '@/components/ab/atoms'
import { Modal, ConfirmDialog } from '@/components/ab/Modal'
import { I, HRI } from '@/components/ab/icons'
import { useToast } from '@/components/ab/Toast'
import BulkCreateDialog from './BulkCreateDialog'
import {
  useShifts,
  useShiftTypes,
  useShiftTemplates,
  useCreateShift,
  useUpdateShift,
  useDeleteShift,
  useConfirmShift,
  useUnconfirmShift,
  type Shift,
  type ShiftType,
} from '@/lib/query/shifts'
import { useEmployees, type Employee } from '@/lib/query/employees'
import { usePositions } from '@/lib/query/positions'
import { useOrganizations, type Organization } from '@/lib/query/organizations'
import { useAuthStore } from '@/stores/auth.store'
import { ACCESS_LEVEL_HIERARCHY } from '@ablework/shared-constants'

// ── 날짜 유틸 (로컬 기준) ─────────────────────────────────────────────────────
const DOW = ['월', '화', '수', '목', '금', '토', '일'] as const
const DAYS_PER_WEEK = 7
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/

function toLocalDateStr(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}
/** 해당 날짜가 속한 주의 월요일 */
function getMonday(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  return addDays(d, diff)
}
function toHHMM(value: string): string {
  // 이미 HH:mm 이면 그대로, ISO/datetime 이면 로컬 시각으로 변환.
  if (TIME_REGEX.test(value)) return value
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
function weekLabel(weekStart: Date): string {
  const end = addDays(weekStart, DAYS_PER_WEEK - 1)
  const fmt = (d: Date) => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  const fmtShort = (d: Date) => `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  return `${fmt(weekStart)} – ${fmtShort(end)}`
}

/** 조직 트리를 깊이순 평탄화 (하위 부서까지 select에 노출) */
function flattenOrgs(orgs: Organization[]): Organization[] {
  return orgs.flatMap((o) => [o, ...flattenOrgs(o.children ?? [])])
}

/** 근무유형 카테고리 → 로스터 칩 클래스(.day/.night/.remote/.leave) */
function shiftCellClass(type?: ShiftType): string {
  const cat = (type?.category ?? '').toLowerCase()
  const name = (type?.name ?? '').toLowerCase()
  if (cat.includes('night') || name.includes('야간')) return 'night'
  if (cat.includes('remote') || name.includes('재택')) return 'remote'
  if (cat.includes('leave') || name.includes('휴') || name.includes('연차') || name.includes('반차')) return 'leave'
  return 'day'
}

// ── 폼 상태 ───────────────────────────────────────────────────────────────────
interface ShiftForm {
  employeeId: string
  organizationId: string
  positionId: string
  date: string
  templateId: string
  startTime: string
  endTime: string
  shiftTypeId: string
}

type AddTab = '템플릿 기준' | '조직 기준' | '직무 기준' | '직원 기준'

const today = toLocalDateStr(new Date())

function emptyForm(): ShiftForm {
  return {
    employeeId: '',
    organizationId: '',
    positionId: '',
    date: today,
    templateId: '',
    startTime: '',
    endTime: '',
    shiftTypeId: '',
  }
}

/** Employee.positionId 는 타입 선언에 없을 수 있어 안전하게 읽는다 */
function readEmployeePositionId(emp: Employee): string | undefined {
  const value = (emp as Employee & { positionId?: string }).positionId
  return typeof value === 'string' ? value : undefined
}

export default function ShiftsPage() {
  const toast = useToast()
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()))
  const [bulkOpen, setBulkOpen] = useState(false)
  const [orgFilter, setOrgFilter] = useState<string | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Shift | null>(null)
  const [form, setForm] = useState<ShiftForm>(emptyForm)
  const [addTab, setAddTab] = useState<AddTab>('직원 기준')
  const [confirmTarget, setConfirmTarget] = useState<Shift | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Shift | null>(null)

  const { user } = useAuthStore()
  const canUnconfirm =
    !!user && ACCESS_LEVEL_HIERARCHY[user.accessLevel] >= ACCESS_LEVEL_HIERARCHY.GENERAL_ADMIN

  const shiftsParams: Record<string, string | undefined> = {
    startAt: toLocalDateStr(weekStart),
    endAt: toLocalDateStr(addDays(weekStart, DAYS_PER_WEEK - 1)),
    ...(orgFilter ? { organizationId: orgFilter } : {}),
  }

  const { data: shifts = [], isLoading } = useShifts(shiftsParams)
  const { data: shiftTypes = [] } = useShiftTypes()
  const { data: rawTemplates = [] } = useShiftTemplates()
  // 템플릿 시간은 API 가 ISO(1970-01-01T..Z)로 주므로 표시·폼 주입·저장 전 HH:mm 으로 정규화한다.
  const templates = useMemo(
    () => rawTemplates.map((t) => ({ ...t, startTime: toHHMM(t.startTime), endTime: toHHMM(t.endTime) })),
    [rawTemplates],
  )
  const { data: employeeData } = useEmployees({ limit: 200 })
  const employees = employeeData?.items ?? []
  const { data: organizations = [] } = useOrganizations()
  const { data: positions = [] } = usePositions()
  const flatOrgs = useMemo(
    () => flattenOrgs(organizations as Organization[]),
    [organizations],
  )

  const createMutation = useCreateShift()
  const updateMutation = useUpdateShift()
  const deleteMutation = useDeleteShift()
  const confirmMutation = useConfirmShift()
  const unconfirmMutation = useUnconfirmShift()

  // 조직 필터 적용 직원 목록 (로스터 행)
  const rosterEmployees: Employee[] = useMemo(() => {
    const base = orgFilter
      ? employees.filter((e) => e.organizations?.some((o) => o.organization.id === orgFilter))
      : employees
    return base
  }, [employees, orgFilter])

  const weekDates = useMemo(
    () => Array.from({ length: DAYS_PER_WEEK }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  )

  // employeeId → dateStr → Shift[]
  const shiftMap = useMemo(() => {
    const map = new Map<string, Map<string, Shift[]>>()
    for (const shift of shifts as Shift[]) {
      const dateStr = toLocalDateStr(new Date(shift.startAt))
      const byDate = map.get(shift.employeeId) ?? new Map<string, Shift[]>()
      byDate.set(dateStr, [...(byDate.get(dateStr) ?? []), shift])
      map.set(shift.employeeId, byDate)
    }
    return map
  }, [shifts])

  // ── 탭별 생성 대상 직원 (활성만) ──────────────────────────────────────────────
  const targetEmployees: Employee[] = useMemo(() => {
    const active = employees.filter((e) => e.isActive)
    if (addTab === '조직 기준') {
      if (!form.organizationId) return []
      return active.filter((e) =>
        e.organizations?.some((o) => o.organization.id === form.organizationId),
      )
    }
    if (addTab === '직무 기준') {
      if (!form.positionId) return []
      return active.filter(
        (e) =>
          e.positions?.some((p) => p.position.id === form.positionId) ||
          readEmployeePositionId(e) === form.positionId,
      )
    }
    // 직원 기준 / 템플릿 기준 → 단일 직원
    if (!form.employeeId) return []
    const single = employees.find((e) => e.id === form.employeeId)
    return single ? [single] : []
  }, [addTab, employees, form.organizationId, form.positionId, form.employeeId])

  // ── 모달 열기 ───────────────────────────────────────────────────────────────
  function openCreate() {
    setEditing(null)
    setAddTab('직원 기준')
    setForm(emptyForm())
    setModalOpen(true)
  }
  function openEdit(shift: Shift) {
    setEditing(shift)
    setForm({
      employeeId: shift.employeeId,
      organizationId: shift.organizationId,
      positionId: '',
      date: shift.startAt.split('T')[0],
      templateId: '',
      startTime: toHHMM(shift.startAt),
      endTime: toHHMM(shift.endAt),
      shiftTypeId: shift.shiftType?.id ?? '',
    })
    setModalOpen(true)
  }
  function closeModal() {
    setModalOpen(false)
    setEditing(null)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await deleteMutation.mutateAsync(deleteTarget.id)
      toast('근무일정을 삭제했습니다')
      setDeleteTarget(null)
      closeModal()
    } catch {
      toast('삭제 중 오류가 발생했습니다 (확정된 일정은 삭제할 수 없습니다)')
      setDeleteTarget(null)
    }
  }

  function patch(p: Partial<ShiftForm>) {
    setForm((f) => ({ ...f, ...p }))
  }
  function applyTemplate(templateId: string) {
    const tmpl = templates.find((t) => t.id === templateId)
    if (tmpl) {
      patch({
        templateId,
        startTime: tmpl.startTime,
        endTime: tmpl.endTime,
        ...(tmpl.shiftTypeId ? { shiftTypeId: tmpl.shiftTypeId } : {}),
      })
    } else {
      patch({ templateId })
    }
  }
  function pickEmployee(employeeId: string) {
    const employee = employees.find((e) => e.id === employeeId)
    const primaryOrgId =
      employee?.organizations?.find((o) => o.isPrimary)?.organization.id ??
      employee?.organizations?.[0]?.organization.id ??
      orgFilter ??
      ''
    patch({ employeeId, organizationId: primaryOrgId })
  }

  // 공통: 근무유형 + (템플릿 또는 유효 시작/종료시각) + 적용일자
  const commonValid =
    !!form.shiftTypeId &&
    !!form.date &&
    (!!form.templateId || (TIME_REGEX.test(form.startTime) && TIME_REGEX.test(form.endTime)))

  // 탭별 대상 검증 (편집 모드는 항상 단일 직원 기준)
  const targetValid = editing
    ? !!form.employeeId
    : addTab === '조직 기준'
      ? !!form.organizationId && targetEmployees.length > 0
      : addTab === '직무 기준'
        ? !!form.positionId && targetEmployees.length > 0
        : addTab === '템플릿 기준'
          ? !!form.employeeId && !!form.templateId
          : !!form.employeeId // 직원 기준

  const formValid = commonValid && targetValid

  /** 대상 직원의 소속 조직 id 해석 (조직/직무 기준 벌크 생성용) */
  function resolveOrgId(emp: Employee): string {
    return (
      emp.organizations?.find((o) => o.isPrimary)?.organization.id ??
      emp.organizations?.[0]?.organization.id ??
      form.organizationId ??
      ''
    )
  }

  async function handleSave() {
    if (!formValid) return
    const template = templates.find((t) => t.id === form.templateId)
    const startTime = template ? template.startTime : form.startTime
    const endTime = template ? template.endTime : form.endTime
    const startDate = new Date(`${form.date}T${startTime}:00`)
    const endDate = new Date(`${form.date}T${endTime}:00`)
    // 종료 == 시작이면 무효, 종료 < 시작이면 야간근무로 보고 종료를 +1일 보정
    if (endDate.getTime() === startDate.getTime()) {
      toast('종료 시각이 시작 시각보다 이후여야 합니다')
      return
    }
    if (endDate.getTime() < startDate.getTime()) {
      endDate.setDate(endDate.getDate() + 1)
    }
    const resolvedStart = startDate.toISOString()
    const resolvedEnd = endDate.toISOString()

    const basePayload = {
      shiftTypeId: form.shiftTypeId,
      startAt: resolvedStart,
      endAt: resolvedEnd,
      ...(form.templateId ? { templateId: form.templateId } : {}),
    }

    // ── 편집 모드: 단건 수정 ────────────────────────────────────────────────
    if (editing) {
      try {
        await updateMutation.mutateAsync({
          id: editing.id,
          employeeId: form.employeeId,
          organizationId: form.organizationId,
          ...basePayload,
        })
        toast('근무일정을 수정했습니다')
        closeModal()
      } catch {
        toast('저장 중 오류가 발생했습니다')
      }
      return
    }

    // ── 생성 모드: 탭별 대상 직원 목록 ──────────────────────────────────────
    const targets = targetEmployees
    if (targets.length === 0) {
      toast('대상 직원이 없습니다')
      return
    }

    // 조직/직무 기준은 각 직원의 소속 조직을, 직원/템플릿 기준은 폼의 조직을 사용
    const useEmployeeOrg = addTab === '조직 기준' || addTab === '직무 기준'

    const results = await Promise.allSettled(
      targets.map((emp) =>
        createMutation.mutateAsync({
          employeeId: emp.id,
          organizationId: useEmployeeOrg ? resolveOrgId(emp) : form.organizationId,
          ...basePayload,
        }),
      ),
    )

    const succeeded = results.filter((r) => r.status === 'fulfilled').length
    const failed = results.length - succeeded

    if (succeeded === 0) {
      toast('근무일정 생성에 실패했습니다')
      return
    }
    toast(failed > 0 ? `${succeeded}건 생성, ${failed}건 실패` : `${succeeded}건 생성했습니다`)
    closeModal()
  }

  async function handleConfirm(shift: Shift) {
    try {
      const result = await confirmMutation.mutateAsync(shift.id)
      toast(result.warning ?? '근무일정을 확정했습니다')
    } catch {
      toast('확정 중 오류가 발생했습니다')
    } finally {
      setConfirmTarget(null)
    }
  }
  async function handleUnconfirm(shift: Shift) {
    try {
      await unconfirmMutation.mutateAsync(shift.id)
      toast('확정을 해제했습니다')
    } catch {
      toast('확정 해제 중 오류가 발생했습니다')
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <>
      <PageHead
        eyebrow="Shift Schedule"
        title="근무일정"
        right={
          <div style={{ display: 'flex', gap: 8 }}>
            <button data-testid="shifts-bulk-btn" className="btn btn-line btn-sm" onClick={() => setBulkOpen(true)}>
              {I.plus({ style: { marginRight: 6 } })} 일괄 생성
            </button>
            <button data-testid="shifts-add-btn" className="btn btn-ghost btn-sm" onClick={openCreate}>
              {I.plus({ style: { marginRight: 6 } })} 근무일정 추가
            </button>
          </div>
        }
      />

      {/* 주 이동 + 조직 필터 */}
      <div className="roster-toolbar">
        <div className="wk-nav">
          <button data-testid="shifts-prev-week" className="nb" onClick={() => setWeekStart(addDays(weekStart, -DAYS_PER_WEEK))} aria-label="이전 주">
            {I.chevL()}
          </button>
          <span className="wk-label">{weekLabel(weekStart)}</span>
          <button data-testid="shifts-next-week" className="nb" onClick={() => setWeekStart(addDays(weekStart, DAYS_PER_WEEK))} aria-label="다음 주">
            {I.chevR()}
          </button>
          <button data-testid="shifts-this-week" className="btn btn-line btn-sm" onClick={() => setWeekStart(getMonday(new Date()))}>
            오늘
          </button>
        </div>
        <div className="fbar" style={{ margin: 0 }}>
          <button
            className={'fchip' + (orgFilter === null ? ' on' : '')}
            onClick={() => setOrgFilter(null)}
          >
            {HRI.people({ className: 'ic' })} 전체 조직 <span className="cnt">{employees.length}</span>
          </button>
          <select
            className="sel"
            value={orgFilter ?? ''}
            onChange={(e) => setOrgFilter(e.target.value || null)}
            style={{ minWidth: 160 }}
          >
            <option value="">조직 선택</option>
            {flatOrgs.map((o) => (
              <option key={o.id} value={o.id}>
                {'　'.repeat(o.depth)}
                {o.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 로스터 표 */}
      {isLoading ? (
        <div className="ab-loading">
          <span className="ab-spin" />
          불러오는 중…
        </div>
      ) : (
        <div className="roster-wrap">
          <table className="roster">
            <thead>
              <tr>
                <th className="emp-col">직원</th>
                {weekDates.map((d, i) => (
                  <th key={i} className={i === 6 ? 'sun' : i === 5 ? 'sat' : ''}>
                    <span className="dow">{DOW[i]}</span>
                    {String(d.getDate()).padStart(2, '0')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rosterEmployees.length === 0 ? (
                <tr>
                  <td className="emp-col">—</td>
                  <td colSpan={DAYS_PER_WEEK} className="tbl-empty">
                    표시할 직원이 없습니다
                  </td>
                </tr>
              ) : (
                rosterEmployees.map((emp) => {
                  const byDate = shiftMap.get(emp.id)
                  const primaryOrg =
                    emp.organizations?.find((o) => o.isPrimary)?.organization.name ??
                    emp.organizations?.[0]?.organization.name
                  return (
                    <tr key={emp.id}>
                      <td className="emp-col">
                        <Emp name={emp.name} sub={primaryOrg} />
                      </td>
                      {weekDates.map((d, i) => {
                        const dateStr = toLocalDateStr(d)
                        const cellShifts = byDate?.get(dateStr) ?? []
                        return (
                          <td key={i}>
                            {cellShifts.length === 0 ? (
                              <span
                                className="shift off"
                                role="button"
                                tabIndex={0}
                                onClick={() => {
                                  openCreate()
                                  pickEmployee(emp.id)
                                  patch({ date: dateStr })
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    openCreate()
                                    pickEmployee(emp.id)
                                    patch({ date: dateStr })
                                  }
                                }}
                                style={{ cursor: 'pointer' }}
                              >
                                휴무
                              </span>
                            ) : (
                              cellShifts.map((shift) => {
                                const cls = shiftCellClass(shift.shiftType)
                                const confirmed = shift.status === 'confirmed'
                                return (
                                  <span
                                    key={shift.id}
                                    className={'shift ' + cls}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => openEdit(shift)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault()
                                        openEdit(shift)
                                      }
                                    }}
                                    title={confirmed ? '확정됨' : '클릭하여 수정'}
                                  >
                                    {shift.shiftType?.name ?? shift.template?.name ?? '근무'}
                                    <span className="tm">
                                      {toHHMM(shift.startAt)}–{toHHMM(shift.endAt)}
                                    </span>
                                    {!confirmed && (
                                      <span
                                        data-testid="shift-confirm-btn"
                                        className="tbl-link"
                                        role="button"
                                        tabIndex={0}
                                        style={{ display: 'block', fontSize: 10, marginTop: 4 }}
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          setConfirmTarget(shift)
                                        }}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault()
                                            e.stopPropagation()
                                            setConfirmTarget(shift)
                                          }
                                        }}
                                      >
                                        확정
                                      </span>
                                    )}
                                    {confirmed && canUnconfirm && (
                                      <span
                                        data-testid="shift-unconfirm-btn"
                                        className="tbl-link"
                                        role="button"
                                        tabIndex={0}
                                        style={{ display: 'block', fontSize: 10, marginTop: 4, color: 'var(--warn)' }}
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleUnconfirm(shift)
                                        }}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault()
                                            e.stopPropagation()
                                            handleUnconfirm(shift)
                                          }
                                        }}
                                      >
                                        확정 해제
                                      </span>
                                    )}
                                  </span>
                                )
                              })
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 범례 */}
      <div className="legend">
        <div className="legend-item"><span className="sw day" />주간 근무</div>
        <div className="legend-item"><span className="sw night" />야간 근무</div>
        <div className="legend-item"><span className="sw remote" />재택 근무</div>
        <div className="legend-item"><span className="sw leave" />연차 / 반차</div>
        <div className="legend-item">
          <span className="sw" style={{ borderStyle: 'dashed', borderColor: 'var(--line-soft)' }} />휴무
        </div>
      </div>

      {/* 근무일정 추가/수정 모달 */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        eyebrow={editing ? 'Edit Shift' : 'New Shift'}
        title={editing ? '근무일정 수정' : '근무일정 추가'}
        maxWidth={820}
        footer={
          <>
            {editing && editing.status !== 'confirmed' && (
              <button
                className="btn btn-line"
                style={{ minWidth: 110, color: 'var(--err)', borderColor: 'rgba(255,127,127,0.4)', marginRight: 'auto' }}
                disabled={isSaving || deleteMutation.isPending}
                onClick={() => setDeleteTarget(editing)}
              >
                삭제
              </button>
            )}
            <button className="btn btn-line" style={{ minWidth: 110 }} onClick={closeModal}>
              {editing ? '취소' : '닫기'}
            </button>
            <button
              className="btn btn-primary"
              style={{ minWidth: 110 }}
              disabled={!formValid || isSaving}
              onClick={handleSave}
            >
              {editing ? '수정' : '추가하기'}
            </button>
          </>
        }
      >
        {!editing && (
          <div className="tabs">
            {(['템플릿 기준', '조직 기준', '직무 기준', '직원 기준'] as AddTab[]).map((t) => (
              <button key={t} className={'tab' + (addTab === t ? ' on' : '')} onClick={() => setAddTab(t)}>
                {t}
              </button>
            ))}
          </div>
        )}

        <div className="doc-section">
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', marginBottom: 22 }}
          >
            {/* 대상 선택 — 편집 모드는 조직+직원, 생성 모드는 탭에 따라 분기 */}
            {editing ? (
              <>
                <div
                  className="doc-field"
                  style={{ border: 'none', padding: 0, gridTemplateColumns: 'auto auto', gap: 12 }}
                >
                  <span className="fk" style={{ paddingTop: 7 }}>조직</span>
                  <span className="fv">
                    <select
                      className="sel"
                      value={form.organizationId}
                      onChange={(e) => patch({ organizationId: e.target.value })}
                      style={{ borderBottom: '1px solid var(--warm-500)', minWidth: 160 }}
                    >
                      <option value="">선택</option>
                      {flatOrgs.map((o) => (
                        <option key={o.id} value={o.id}>
                          {'　'.repeat(o.depth)}
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </span>
                </div>
                <span className="cell-arrow">{I.arrow()}</span>
                <div
                  className="doc-field"
                  style={{ border: 'none', padding: 0, gridTemplateColumns: 'auto auto', gap: 12 }}
                >
                  <span className="fk" style={{ paddingTop: 7 }}>직원</span>
                  <span className="fv">
                    <select
                      className="sel"
                      value={form.employeeId}
                      onChange={(e) => pickEmployee(e.target.value)}
                      style={{ borderBottom: '1px solid var(--warm-500)', minWidth: 160 }}
                    >
                      <option value="">선택</option>
                      {employees.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </select>
                  </span>
                </div>
              </>
            ) : addTab === '조직 기준' ? (
              <div
                className="doc-field"
                style={{ border: 'none', padding: 0, gridTemplateColumns: 'auto auto', gap: 12 }}
              >
                <span className="fk" style={{ paddingTop: 7 }}>조직</span>
                <span className="fv" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <select
                    className="sel"
                    value={form.organizationId}
                    onChange={(e) => patch({ organizationId: e.target.value })}
                    style={{ borderBottom: '1px solid var(--warm-500)', minWidth: 160 }}
                  >
                    <option value="">선택</option>
                    {flatOrgs.map((o) => (
                      <option key={o.id} value={o.id}>
                        {'　'.repeat(o.depth)}
                        {o.name}
                      </option>
                    ))}
                  </select>
                  {form.organizationId && (
                    <span style={{ fontSize: 13, color: 'var(--fg-4)' }}>
                      {targetEmployees.length}명에게 생성
                    </span>
                  )}
                </span>
              </div>
            ) : addTab === '직무 기준' ? (
              <div
                className="doc-field"
                style={{ border: 'none', padding: 0, gridTemplateColumns: 'auto auto', gap: 12 }}
              >
                <span className="fk" style={{ paddingTop: 7 }}>직무</span>
                <span className="fv" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <select
                    className="sel"
                    value={form.positionId}
                    onChange={(e) => patch({ positionId: e.target.value })}
                    style={{ borderBottom: '1px solid var(--warm-500)', minWidth: 160 }}
                  >
                    <option value="">선택</option>
                    {positions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  {form.positionId && (
                    <span style={{ fontSize: 13, color: 'var(--fg-4)' }}>
                      {targetEmployees.length}명에게 생성
                    </span>
                  )}
                </span>
              </div>
            ) : (
              /* 직원 기준 / 템플릿 기준 — 단일 직원 */
              <div
                className="doc-field"
                style={{ border: 'none', padding: 0, gridTemplateColumns: 'auto auto', gap: 12 }}
              >
                <span className="fk" style={{ paddingTop: 7 }}>직원</span>
                <span className="fv">
                  <select
                    className="sel"
                    value={form.employeeId}
                    onChange={(e) => pickEmployee(e.target.value)}
                    style={{ borderBottom: '1px solid var(--warm-500)', minWidth: 160 }}
                  >
                    <option value="">선택</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                </span>
              </div>
            )}
          </div>

          {/* 템플릿 — 템플릿 기준 탭에서는 필수, 그 외 선택 */}
          {(() => {
            const templateRequired = !editing && addTab === '템플릿 기준'
            return (
              <div className="doc-sec-head">
                <span className="dot" />
                <span className="t">근무 템플릿 {templateRequired ? '(필수)' : '(선택)'}</span>
                <span className="en">Template</span>
              </div>
            )
          })()}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            {!(!editing && addTab === '템플릿 기준') && (
              <button
                className={'shift ' + (form.templateId === '' ? 'day' : 'off')}
                style={{ display: 'inline-block', padding: '11px 16px', minWidth: 120, opacity: 1 }}
                onClick={() => patch({ templateId: '' })}
              >
                직접 입력
              </button>
            )}
            {templates.map((t) => (
              <button
                key={t.id}
                className={'shift ' + (form.templateId === t.id ? 'day' : 'off')}
                style={{ display: 'inline-block', padding: '11px 16px', minWidth: 130, opacity: 1 }}
                onClick={() => applyTemplate(t.id)}
              >
                {t.name}
                <span className="tm">
                  {t.startTime} – {t.endTime}
                </span>
              </button>
            ))}
          </div>

          {/* 근무 유형 + 직접 시간 */}
          <div className="doc-sec-head">
            <span className="dot" />
            <span className="t">근무 유형 선택</span>
            <span className="en">Shift Types</span>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
            {(shiftTypes as ShiftType[]).map((st) => (
              <button
                key={st.id}
                className={'shift ' + (form.shiftTypeId === st.id ? shiftCellClass(st) : 'off')}
                style={{ display: 'inline-block', padding: '11px 16px', minWidth: 120, opacity: 1 }}
                onClick={() => patch({ shiftTypeId: st.id })}
              >
                {st.name}
              </button>
            ))}
          </div>

          <div className="fld-range" style={{ marginBottom: 4 }}>
            <input
              className="inp-block"
              placeholder="시작 09:00"
              value={form.startTime}
              disabled={!!form.templateId}
              onChange={(e) => patch({ startTime: e.target.value })}
              style={{ maxWidth: 140, fontFamily: 'var(--font-display)' }}
            />
            <span className="dash">~</span>
            <input
              className="inp-block"
              placeholder="종료 18:00"
              value={form.endTime}
              disabled={!!form.templateId}
              onChange={(e) => patch({ endTime: e.target.value })}
              style={{ maxWidth: 140, fontFamily: 'var(--font-display)' }}
            />
          </div>
        </div>

        {/* 적용 일자 */}
        <div className="doc-section">
          <div className="doc-sec-head">
            <span className="dot" />
            <span className="t">적용 일자</span>
            <span className="en">Date</span>
          </div>
          <DateInput value={form.date} onChange={(v) => patch({ date: v })} />
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmTarget}
        title="근무일정 확정"
        message="확정 후에는 수정이 제한됩니다. 확정하시겠습니까?"
        confirmLabel="확정"
        onConfirm={() => confirmTarget && handleConfirm(confirmTarget)}
        onCancel={() => setConfirmTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="근무일정 삭제"
        message="이 근무일정을 삭제하시겠습니까? 되돌릴 수 없습니다."
        confirmLabel="삭제"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <BulkCreateDialog
        open={bulkOpen}
        templates={templates}
        organizations={flatOrgs}
        defaultStartDate={toLocalDateStr(weekStart)}
        defaultEndDate={toLocalDateStr(addDays(weekStart, DAYS_PER_WEEK - 1))}
        onClose={() => setBulkOpen(false)}
        onResult={(msg) => toast(msg)}
      />
    </>
  )
}
