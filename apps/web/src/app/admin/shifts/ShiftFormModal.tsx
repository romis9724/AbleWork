'use client'
import { Modal } from '@/components/ab/Modal'
import { DateInput } from '@/components/ab/atoms'
import { I } from '@/components/ab/icons'
import type { Shift, ShiftType } from '@/lib/query/shifts'
import type { Employee } from '@/lib/query/employees'
import type { Organization } from '@/lib/query/organizations'
import { shiftCellClass, type AddTab, type ShiftForm } from './shifts.helpers'

interface TemplateView {
  id: string
  name: string
  startTime: string
  endTime: string
}

interface ShiftFormModalProps {
  open: boolean
  onClose: () => void
  editing: Shift | null
  form: ShiftForm
  patch: (p: Partial<ShiftForm>) => void
  addTab: AddTab
  setAddTab: (t: AddTab) => void
  templates: TemplateView[]
  shiftTypes: ShiftType[]
  flatOrgs: Organization[]
  positions: { id: string; name: string }[]
  employees: Employee[]
  targetCount: number
  formValid: boolean
  isSaving: boolean
  deletePending: boolean
  applyTemplate: (id: string) => void
  pickEmployee: (id: string) => void
  onSave: () => void
  onRequestDelete: (shift: Shift) => void
}

/**
 * 근무일정 추가/수정 모달 (god file 분할 · 항목 25).
 * 상태·핸들러는 부모(ShiftsPage)가 소유하고 이 컴포넌트는 프레젠테이션만 담당한다.
 */
export default function ShiftFormModal({
  open,
  onClose,
  editing,
  form,
  patch,
  addTab,
  setAddTab,
  templates,
  shiftTypes,
  flatOrgs,
  positions,
  employees,
  targetCount,
  formValid,
  isSaving,
  deletePending,
  applyTemplate,
  pickEmployee,
  onSave,
  onRequestDelete,
}: ShiftFormModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow={editing ? 'Edit Shift' : 'New Shift'}
      title={editing ? '근무일정 수정' : '근무일정 추가'}
      maxWidth={820}
      footer={
        <>
          {editing && editing.status !== 'confirmed' && (
            <button
              className="btn btn-line"
              style={{ minWidth: 110, color: 'var(--err)', borderColor: 'rgba(255,127,127,0.4)', marginRight: 'auto' }}
              disabled={isSaving || deletePending}
              onClick={() => onRequestDelete(editing)}
            >
              삭제
            </button>
          )}
          <button className="btn btn-line" style={{ minWidth: 110 }} onClick={onClose}>
            {editing ? '취소' : '닫기'}
          </button>
          <button
            className="btn btn-primary"
            style={{ minWidth: 110 }}
            disabled={!formValid || isSaving}
            onClick={onSave}
          >
            {editing ? '수정' : '추가하기'}
          </button>
        </>
      }
    >
      {!editing && (
        <div className="tabs">
          {(['템플릿 기준', '조직 기준', '직위 기준', '직원 기준'] as AddTab[]).map((t) => (
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
                    {targetCount}명에게 생성
                  </span>
                )}
              </span>
            </div>
          ) : addTab === '직위 기준' ? (
            <div
              className="doc-field"
              style={{ border: 'none', padding: 0, gridTemplateColumns: 'auto auto', gap: 12 }}
            >
              <span className="fk" style={{ paddingTop: 7 }}>직위</span>
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
                    {targetCount}명에게 생성
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
          {shiftTypes.map((st) => (
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
  )
}
