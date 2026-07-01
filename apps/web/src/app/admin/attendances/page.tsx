'use client'
import { useMemo, useState } from 'react'
import { PageHead } from '@/components/ab/Page'
import { Emp, Badge, DateInput } from '@/components/ab/atoms'
import { Modal, ConfirmDialog } from '@/components/ab/Modal'
import { I, HRI } from '@/components/ab/icons'
import { useToast } from '@/components/ab/Toast'
import {
  useAttendances,
  useCreateAttendance,
  useUpdateAttendance,
  useUpdateAttendanceBreaks,
  useDeleteAttendance,
  useConfirmPeriod,
  useUnconfirmAttendances,
  type Attendance,
} from '@/lib/query/attendances'
import { useEmployees } from '@/lib/query/employees'
import { useOrganizations, type Organization } from '@/lib/query/organizations'
import { useAuthStore } from '@/stores/auth.store'
import { ACCESS_LEVEL_HIERARCHY } from '@ablework/shared-constants'
import apiClient from '@/lib/api-client'
import {
  STATUS_LABEL,
  STATUS_BADGE,
  BREAK_TYPE_LABEL,
  spanStyle,
  timeLabel,
  dateLabel,
  workDuration,
  toDatetimeLocal,
  getThisMonthRange,
  EMPTY_CREATE,
  unwrap,
  type EditForm,
  type BreakRow,
  type CreateForm,
} from './attendances.helpers'

export default function AttendancesPage() {
  const toast = useToast()
  const defaultRange = getThisMonthRange()

  const [startDate, setStartDate] = useState(defaultRange.start)
  const [endDate, setEndDate] = useState(defaultRange.end)
  const [orgId, setOrgId] = useState<string | undefined>(undefined)
  const [missingOnly, setMissingOnly] = useState(false)
  const [queryParams, setQueryParams] = useState<Record<string, string | undefined>>({
    startDate: defaultRange.start,
    endDate: defaultRange.end,
  })

  const { data: rawData, isLoading } = useAttendances(queryParams)
  const records = useMemo(() => unwrap(rawData), [rawData])

  const { data: orgs = [] } = useOrganizations()
  const { data: employeesData } = useEmployees({ limit: 200, excludeSuperAdmin: true })
  const employees = employeesData?.items ?? []

  const createMutation = useCreateAttendance()
  const updateMutation = useUpdateAttendance()
  const updateBreaksMutation = useUpdateAttendanceBreaks()
  const deleteMutation = useDeleteAttendance()
  const confirmPeriodMutation = useConfirmPeriod()
  const unconfirmMutation = useUnconfirmAttendances()

  const { user } = useAuthStore()
  // 확정 기록 관리(기간 확정·일괄 삭제·확정 해제)는 GENERAL_ADMIN 이상 전용 백엔드 API다.
  const isGeneralAdmin =
    !!user && ACCESS_LEVEL_HIERARCHY[user.accessLevel] >= ACCESS_LEVEL_HIERARCHY.GENERAL_ADMIN
  const canUnconfirm = isGeneralAdmin

  // 선택
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const visibleIds = records.map((r) => r.id)
  const selectedVisible = selectedIds.filter((id) => visibleIds.includes(id))
  const isAllSelected = visibleIds.length > 0 && selectedVisible.length === visibleIds.length
  function toggleSelectAll() {
    setSelectedIds(isAllSelected ? [] : visibleIds)
  }
  function toggleSelect(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]))
  }

  // 요약 카운트
  const counts = useMemo(() => {
    let normal = 0
    let late = 0
    let absent = 0
    for (const r of records) {
      if (r.status === 'late') late++
      else if (r.status === 'absent') absent++
      else if (r.status === 'normal') normal++
    }
    return { normal, late, absent }
  }, [records])

  // 수정 모달
  const [editRow, setEditRow] = useState<Attendance | null>(null)
  const [editForm, setEditForm] = useState<EditForm>({ clockInAt: '', clockOutAt: '', status: 'normal', note: '' })
  const [breakRows, setBreakRows] = useState<BreakRow[]>([])

  // 추가 모달
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_CREATE)

  // 기간 확정 모달
  const [confirmPeriodOpen, setConfirmPeriodOpen] = useState(false)
  const [confirmStart, setConfirmStart] = useState(defaultRange.start)
  const [confirmEnd, setConfirmEnd] = useState(defaultRange.end)

  // 일괄 삭제 확인
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)

  function openEdit(row: Attendance) {
    setEditRow(row)
    setEditForm({
      clockInAt: toDatetimeLocal(row.clockInAt),
      clockOutAt: toDatetimeLocal(row.clockOutAt),
      status: row.status,
      note: row.note ?? '',
    })
    setBreakRows(
      (row.breaks ?? []).map((b) => ({
        id: b.id,
        breakType: b.breakType,
        startAt: toDatetimeLocal(b.startAt),
        endAt: toDatetimeLocal(b.endAt),
      })),
    )
  }

  function handleSearch() {
    setSelectedIds([])
    setQueryParams({
      startDate,
      endDate,
      organizationId: orgId,
      ...(missingOnly ? { missingClockOut: 'true' } : {}),
    })
  }
  function handleMissingToggle(checked: boolean) {
    setMissingOnly(checked)
    setSelectedIds([])
    setQueryParams((prev) => {
      const next = { ...prev }
      if (checked) next.missingClockOut = 'true'
      else delete next.missingClockOut
      return next
    })
  }

  async function handleSave() {
    if (!editRow) return
    try {
      await updateMutation.mutateAsync({
        id: editRow.id,
        clockInAt: editForm.clockInAt ? new Date(editForm.clockInAt).toISOString() : undefined,
        clockOutAt: editForm.clockOutAt ? new Date(editForm.clockOutAt).toISOString() : undefined,
        status: editForm.status,
        note: editForm.note || undefined,
      })
      await updateBreaksMutation.mutateAsync({
        id: editRow.id,
        breaks: breakRows
          .filter((b) => b.startAt)
          .map((b) => ({
            id: b.id,
            breakType: b.breakType,
            startAt: new Date(b.startAt).toISOString(),
            endAt: b.endAt ? new Date(b.endAt).toISOString() : undefined,
          })),
      })
      setEditRow(null)
      toast('출퇴근기록을 수정했습니다')
    } catch {
      toast('저장에 실패했습니다')
    }
  }

  async function handleCreate() {
    if (!createForm.employeeId || !createForm.clockInAt) {
      toast('직원과 출근 시각을 입력하세요')
      return
    }
    try {
      await createMutation.mutateAsync({
        employeeId: createForm.employeeId,
        clockInAt: new Date(createForm.clockInAt).toISOString(),
        clockOutAt: createForm.clockOutAt ? new Date(createForm.clockOutAt).toISOString() : undefined,
        status: createForm.status || undefined,
        note: createForm.note || undefined,
      })
      setCreateOpen(false)
      setCreateForm(EMPTY_CREATE)
      toast('기록이 추가되었습니다')
    } catch {
      toast('기록 추가에 실패했습니다')
    }
  }

  async function handleBulkConfirm() {
    try {
      await confirmPeriodMutation.mutateAsync({ attendanceIds: selectedVisible })
      setSelectedIds([])
      toast('선택한 기록을 확정했습니다')
    } catch {
      toast('일괄 확정에 실패했습니다')
    }
  }
  async function handleBulkUnconfirm() {
    try {
      await unconfirmMutation.mutateAsync({ attendanceIds: selectedVisible })
      setSelectedIds([])
      toast('선택한 기록의 확정을 해제했습니다')
    } catch {
      toast('일괄 해제에 실패했습니다')
    }
  }
  async function handleBulkDelete() {
    const results = await Promise.allSettled(selectedVisible.map((id) => deleteMutation.mutateAsync(id)))
    const failed = results.filter((r) => r.status === 'rejected').length
    setSelectedIds([])
    setBulkDeleteOpen(false)
    if (failed > 0) toast(`${results.length - failed}건 삭제, ${failed}건 실패 (확정 기록은 삭제 불가)`)
    else toast('선택한 기록을 삭제했습니다')
  }
  async function handleUnconfirm(row: Attendance) {
    try {
      await unconfirmMutation.mutateAsync({ attendanceIds: [row.id] })
      toast('확정을 해제했습니다')
    } catch {
      toast('확정 해제에 실패했습니다')
    }
  }
  async function handleConfirmPeriod() {
    try {
      await confirmPeriodMutation.mutateAsync({ startDate: confirmStart, endDate: confirmEnd, organizationId: orgId })
      setConfirmPeriodOpen(false)
      toast('기간 확정이 완료되었습니다')
    } catch {
      toast('기간 확정에 실패했습니다')
    }
  }
  async function handleExportDownload() {
    try {
      const params: Record<string, string> = {
        startDate: queryParams.startDate ?? '',
        endDate: queryParams.endDate ?? '',
        ...(queryParams.organizationId ? { organizationId: queryParams.organizationId } : {}),
      }
      // 응답 인터셉터: Blob엔 res.data.data가 없어 res.data(Blob)로 폴백됨
      const blob = (await apiClient.get('/reports/export', { params, responseType: 'blob' })) as unknown as Blob
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `출퇴근기록_${params.startDate}_${params.endDate}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast('다운로드를 시작했습니다')
    } catch {
      toast('다운로드에 실패했습니다')
    }
  }

  const isBulkPending =
    confirmPeriodMutation.isPending || unconfirmMutation.isPending || deleteMutation.isPending

  return (
    <>
      <PageHead
        eyebrow="Attendance"
        title="출퇴근기록"
        right={
          <div className="head-actions">
            <button data-testid="att-create-btn" className="btn btn-line btn-sm" onClick={() => setCreateOpen(true)}>
              {I.plus({ style: { marginRight: 6 } })} 기록 추가
            </button>
            {isGeneralAdmin && (
              <button data-testid="att-confirm-period-btn" className="btn btn-line btn-sm" onClick={() => setConfirmPeriodOpen(true)}>
                기간 확정
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={handleExportDownload}>
              {I.down({ style: { marginRight: 7 } })}다운로드
            </button>
          </div>
        }
      />

      {/* 필터 칩 + 요약 */}
      <div className="fbar">
        <DateInput value={startDate} onChange={setStartDate} />
        <span className="dash" style={{ color: 'var(--fg-5)' }}>~</span>
        <DateInput value={endDate} onChange={setEndDate} />
        <select
          className="sel"
          value={orgId ?? ''}
          onChange={(e) => setOrgId(e.target.value || undefined)}
          style={{ minWidth: 150 }}
        >
          <option value="">전체 조직</option>
          {(orgs as Organization[]).map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <button
          data-testid="att-filter-chip"
          className="fchip"
          onClick={() => handleMissingToggle(!missingOnly)}
          style={missingOnly ? { borderColor: 'var(--ab-orange)', color: 'var(--ab-orange)' } : undefined}
        >
          {HRI.filter({ className: 'ic' })} 퇴근 누락만
        </button>
        <button data-testid="att-search-btn" className="btn btn-primary btn-sm" onClick={handleSearch}>
          {I.search({ style: { marginRight: 6 } })}조회
        </button>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--fg-3)' }}>
          정상 <b style={{ color: '#fff' }}>{counts.normal}</b> · 지각{' '}
          <b style={{ color: 'var(--warn)' }}>{counts.late}</b> · 결근{' '}
          <b style={{ color: 'var(--err)' }}>{counts.absent}</b>
        </span>
      </div>

      {/* 일괄 액션 바 */}
      {selectedVisible.length > 0 && (
        <div className="tbl-bar">
          <span className="tbl-count">
            <b>{selectedVisible.length}</b>건 선택됨
          </span>
          <div className="tbl-tools" style={{ display: 'flex', gap: 8 }}>
            <button data-testid="att-bulk-confirm-btn" className="btn btn-line btn-sm" disabled={isBulkPending} onClick={handleBulkConfirm}>
              일괄 확정
            </button>
            {isGeneralAdmin && (
              <button data-testid="att-bulk-unconfirm-btn" className="btn btn-line btn-sm" disabled={isBulkPending} onClick={handleBulkUnconfirm}>
                일괄 해제
              </button>
            )}
            {isGeneralAdmin && (
              <button data-testid="att-bulk-delete-btn" className="btn btn-line btn-sm" disabled={isBulkPending} onClick={() => setBulkDeleteOpen(true)}>
                {I.trash({ style: { marginRight: 6 } })}일괄 삭제
              </button>
            )}
            <button className="btn btn-dark btn-sm" onClick={() => setSelectedIds([])}>
              선택 해제
            </button>
          </div>
        </div>
      )}

      {/* 표 */}
      {isLoading ? (
        <div className="ab-loading">
          <span className="ab-spin" />
          불러오는 중…
        </div>
      ) : (
        <div className="tbl-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <input type="checkbox" className="ck" checked={isAllSelected} onChange={toggleSelectAll} />
                </th>
                <th style={{ width: 200 }}>직원</th>
                <th style={{ width: 110 }}>일자</th>
                <th style={{ width: 80 }} className="c">출근</th>
                <th style={{ width: 80 }} className="c">퇴근</th>
                <th style={{ width: 90 }} className="c">근무시간</th>
                <th>근무 구간</th>
                <th style={{ width: 110 }} className="c">상태</th>
                <th style={{ width: 130 }} className="c">확정</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr>
                  <td className="tbl-empty" colSpan={9}>
                    조회된 출퇴근 기록이 없습니다
                  </td>
                </tr>
              ) : (
                records.map((r) => {
                  const ss = spanStyle(r.clockInAt, r.clockOutAt)
                  const working = !r.clockOutAt && r.status !== 'absent'
                  return (
                    <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => openEdit(r)}>
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="ck"
                          checked={selectedIds.includes(r.id)}
                          onChange={() => toggleSelect(r.id)}
                        />
                      </td>
                      <td>
                        <Emp name={r.employee?.name ?? '—'} on={working} />
                      </td>
                      <td className="muted">{dateLabel(r.clockInAt)}</td>
                      <td className="c">
                        <span className="att-time">{timeLabel(r.clockInAt)}</span>
                      </td>
                      <td className="c">
                        <span className={'att-time' + (!r.clockOutAt && !working ? ' miss' : '')}>
                          {timeLabel(r.clockOutAt)}
                        </span>
                      </td>
                      <td className="c">
                        <span className="att-dur">{workDuration(r.clockInAt, r.clockOutAt)}</span>
                      </td>
                      <td>
                        {ss ? (
                          <div>
                            <div className="span">
                              <div className={'fill' + (r.status === 'late' ? ' late' : '')} style={ss} />
                            </div>
                            <div className="span-scale">
                              <span>08</span>
                              <span>12</span>
                              <span>16</span>
                              <span>20</span>
                            </div>
                          </div>
                        ) : (
                          <span className="zero">기록 없음</span>
                        )}
                      </td>
                      <td className="c">
                        <Badge kind={STATUS_BADGE[r.status] ?? 'b-submit'}>
                          {STATUS_LABEL[r.status] ?? r.status}
                        </Badge>
                      </td>
                      <td className="c" onClick={(e) => e.stopPropagation()}>
                        {r.isConfirmed ? (
                          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                            <Badge kind="b-done">확정</Badge>
                            {canUnconfirm && (
                              <span
                                className="tbl-link"
                                style={{ color: 'var(--warn)', fontSize: 11 }}
                                onClick={() => handleUnconfirm(r)}
                              >
                                해제
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="zero">미확정</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 수정 모달 */}
      <Modal
        open={!!editRow}
        onClose={() => setEditRow(null)}
        eyebrow="Edit Attendance"
        title="출퇴근기록 수정"
        maxWidth={620}
        footer={
          <>
            <button className="btn btn-line" style={{ minWidth: 110 }} onClick={() => setEditRow(null)}>
              취소
            </button>
            <button
              className="btn btn-primary"
              style={{ minWidth: 110 }}
              disabled={updateMutation.isPending || updateBreaksMutation.isPending}
              onClick={handleSave}
            >
              저장
            </button>
          </>
        }
      >
        {editRow && (
          <>
            <div className="doc-section" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <Emp name={editRow.employee?.name ?? '—'} on={!editRow.clockOutAt} />
              <span className="att-dur" style={{ marginLeft: 'auto' }}>
                {dateLabel(editRow.clockInAt)}
              </span>
            </div>
            <div className="doc-section">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 40px' }}>
                <div className="doc-field">
                  <span className="fk">출근 시각</span>
                  <span className="fv">
                    <input
                      className="inp-block"
                      type="datetime-local"
                      value={editForm.clockInAt}
                      onChange={(e) => setEditForm((f) => ({ ...f, clockInAt: e.target.value }))}
                      style={{ fontFamily: 'var(--font-display)' }}
                    />
                  </span>
                </div>
                <div className="doc-field">
                  <span className="fk">퇴근 시각</span>
                  <span className="fv">
                    <input
                      className="inp-block"
                      type="datetime-local"
                      value={editForm.clockOutAt}
                      onChange={(e) => setEditForm((f) => ({ ...f, clockOutAt: e.target.value }))}
                      style={{ fontFamily: 'var(--font-display)' }}
                    />
                  </span>
                </div>
                <div className="doc-field">
                  <span className="fk">상태</span>
                  <span className="fv">
                    <select
                      className="sel"
                      value={editForm.status}
                      onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                      style={{ borderBottom: '1px solid var(--warm-500)' }}
                    >
                      {Object.entries(STATUS_LABEL).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </span>
                </div>
              </div>
              <div className="doc-field">
                <span className="fk">수정 사유</span>
                <span className="fv" style={{ width: '100%' }}>
                  <input
                    className="inp-block"
                    placeholder="기록 수정 사유를 입력하세요 (감사 로그에 기록됩니다)"
                    value={editForm.note}
                    onChange={(e) => setEditForm((f) => ({ ...f, note: e.target.value }))}
                  />
                </span>
              </div>
            </div>

            {/* 휴게 기록 */}
            <div className="doc-section">
              <div className="doc-sec-head">
                <span className="dot" />
                <span className="t">휴게 기록</span>
                <button
                  className="btn btn-line btn-sm"
                  style={{ marginLeft: 'auto' }}
                  onClick={() => setBreakRows((rows) => [...rows, { breakType: 'rest', startAt: '', endAt: '' }])}
                >
                  {I.plus({ style: { marginRight: 6 } })}휴게 추가
                </button>
              </div>
              {breakRows.length === 0 && (
                <p style={{ fontSize: 12, color: 'var(--fg-4)', margin: 0 }}>등록된 휴게 기록이 없습니다.</p>
              )}
              {breakRows.map((b, idx) => (
                <div
                  key={b.id ?? `new-${idx}`}
                  style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}
                >
                  <select
                    className="sel"
                    value={b.breakType}
                    onChange={(e) =>
                      setBreakRows((rows) => rows.map((row, i) => (i === idx ? { ...row, breakType: e.target.value } : row)))
                    }
                    style={{ minWidth: 80 }}
                  >
                    {Object.entries(BREAK_TYPE_LABEL).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                  <input
                    className="inp-block"
                    type="datetime-local"
                    value={b.startAt}
                    onChange={(e) =>
                      setBreakRows((rows) => rows.map((row, i) => (i === idx ? { ...row, startAt: e.target.value } : row)))
                    }
                    style={{ flex: 1 }}
                  />
                  <input
                    className="inp-block"
                    type="datetime-local"
                    value={b.endAt}
                    onChange={(e) =>
                      setBreakRows((rows) => rows.map((row, i) => (i === idx ? { ...row, endAt: e.target.value } : row)))
                    }
                    style={{ flex: 1 }}
                  />
                  <span
                    className="tbl-link"
                    style={{ color: 'var(--err)' }}
                    onClick={() => setBreakRows((rows) => rows.filter((_, i) => i !== idx))}
                  >
                    {I.trash()}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </Modal>

      {/* 기록 추가 모달 */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        eyebrow="New Record"
        title="출퇴근기록 추가"
        maxWidth={560}
        footer={
          <>
            <button className="btn btn-line" style={{ minWidth: 110 }} onClick={() => setCreateOpen(false)}>
              취소
            </button>
            <button
              className="btn btn-primary"
              style={{ minWidth: 110 }}
              disabled={createMutation.isPending || !createForm.employeeId || !createForm.clockInAt}
              onClick={handleCreate}
            >
              추가
            </button>
          </>
        }
      >
        <div className="doc-section">
          <div className="doc-field">
            <span className="fk">직원<span className="req">*</span></span>
            <span className="fv">
              <select
                className="sel"
                value={createForm.employeeId}
                onChange={(e) => setCreateForm((f) => ({ ...f, employeeId: e.target.value }))}
                style={{ borderBottom: '1px solid var(--warm-500)', minWidth: 200 }}
              >
                <option value="">선택</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.employeeNumber ? `${e.name} (${e.employeeNumber})` : e.name}
                  </option>
                ))}
              </select>
            </span>
          </div>
          <div className="doc-field">
            <span className="fk">출근 시각<span className="req">*</span></span>
            <span className="fv">
              <input
                className="inp-block"
                type="datetime-local"
                value={createForm.clockInAt}
                onChange={(e) => setCreateForm((f) => ({ ...f, clockInAt: e.target.value }))}
                style={{ fontFamily: 'var(--font-display)' }}
              />
            </span>
          </div>
          <div className="doc-field">
            <span className="fk">퇴근 시각</span>
            <span className="fv">
              <input
                className="inp-block"
                type="datetime-local"
                value={createForm.clockOutAt}
                onChange={(e) => setCreateForm((f) => ({ ...f, clockOutAt: e.target.value }))}
                style={{ fontFamily: 'var(--font-display)' }}
              />
            </span>
          </div>
          <div className="doc-field">
            <span className="fk">상태</span>
            <span className="fv">
              <select
                className="sel"
                value={createForm.status}
                onChange={(e) => setCreateForm((f) => ({ ...f, status: e.target.value }))}
                style={{ borderBottom: '1px solid var(--warm-500)' }}
              >
                <option value="">자동 판정</option>
                {Object.entries(STATUS_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </span>
          </div>
          <div className="doc-field">
            <span className="fk">근무 노트</span>
            <span className="fv" style={{ width: '100%' }}>
              <input
                className="inp-block"
                placeholder="메모 (선택)"
                value={createForm.note}
                onChange={(e) => setCreateForm((f) => ({ ...f, note: e.target.value }))}
              />
            </span>
          </div>
        </div>
      </Modal>

      {/* 기간 확정 모달 */}
      <Modal
        open={confirmPeriodOpen}
        onClose={() => setConfirmPeriodOpen(false)}
        eyebrow="Confirm Period"
        title="기간 확정"
        maxWidth={460}
        footer={
          <>
            <button className="btn btn-line" style={{ minWidth: 110 }} onClick={() => setConfirmPeriodOpen(false)}>
              취소
            </button>
            <button
              className="btn btn-primary"
              style={{ minWidth: 110 }}
              disabled={confirmPeriodMutation.isPending}
              onClick={handleConfirmPeriod}
            >
              확정 실행
            </button>
          </>
        }
      >
        <div className="doc-section">
          <div className="doc-field">
            <span className="fk">시작일</span>
            <span className="fv">
              <DateInput value={confirmStart} onChange={setConfirmStart} />
            </span>
          </div>
          <div className="doc-field">
            <span className="fk">종료일</span>
            <span className="fv">
              <DateInput value={confirmEnd} onChange={setConfirmEnd} />
            </span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--fg-4)', margin: '10px 0 0' }}>
            선택한 조직 필터가 적용됩니다. 확정 후에는 기록 수정이 제한됩니다.
          </p>
        </div>
      </Modal>

      <ConfirmDialog
        open={bulkDeleteOpen}
        title="선택 기록 삭제"
        message={`선택한 ${selectedVisible.length}건을 삭제하시겠습니까? (확정된 기록은 삭제할 수 없습니다)`}
        confirmLabel="삭제"
        onConfirm={handleBulkDelete}
        onCancel={() => setBulkDeleteOpen(false)}
      />
    </>
  )
}
