/**
 * AB Workforce 공통 atoms — 디자인 핸드오프 hr/atoms.jsx · hr/hr_atoms.jsx 포팅 (TSX).
 * 전역 클래스(styles/ab-admin.css, ab-hr.css)에 의존한다.
 */
'use client'
import type { ReactNode } from 'react'
import { I } from './icons'

// 상태 뱃지 종류 (CSS .badge 변형)
export type BadgeKind = 'b-submit' | 'b-prog' | 'b-done' | 'b-reject' | 'b-wait' | 'b-force'

export function Badge({ kind, children }: { kind: BadgeKind; children: ReactNode }) {
  return (
    <span className={'badge ' + kind}>
      <span className="dot" />
      {children}
    </span>
  )
}

export function Toggle({ on, onChange, label, testId }: { on: boolean; onChange: (next: boolean) => void; label?: string; testId?: string }) {
  return (
    <button type="button" data-testid={testId} className={'tog' + (on ? ' on' : '')} onClick={() => onChange(!on)}>
      {label && <span className="tog-label">{label}</span>}
      <span className="tog-track" />
    </button>
  )
}

export function Radio({ on, onChange, children }: { on: boolean; onChange: () => void; children: ReactNode }) {
  return (
    <button type="button" className={'rad' + (on ? ' on' : '')} onClick={onChange}>
      <span className="rad-dot" />
      {children}
    </button>
  )
}

interface RadioGroupProps<T extends string> {
  value: T
  onChange: (next: T) => void
  options: { value: T; label: string }[]
}
export function RadioGroup<T extends string>({ value, onChange, options }: RadioGroupProps<T>) {
  return (
    <div className="rad-grp">
      {options.map((o) => (
        <Radio key={o.value} on={value === o.value} onChange={() => onChange(o.value)}>
          {o.label}
        </Radio>
      ))}
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="fld">
      <label>{label}</label>
      <div>{children}</div>
    </div>
  )
}

interface TextInputProps {
  placeholder?: string
  icon?: ReactNode
  value?: string
  defaultValue?: string
  onChange?: (v: string) => void
  type?: string
}
export function TextInput({ placeholder, icon, value, defaultValue, onChange, type = 'text' }: TextInputProps) {
  // value·defaultValue 동시 전달(React 경고) 방지: controlled면 value만, 아니면 defaultValue만.
  const isControlled = value !== undefined
  return (
    <div className="inp-wrap">
      <input
        className="inp"
        type={type}
        placeholder={placeholder}
        {...(isControlled ? { value } : { defaultValue })}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        readOnly={isControlled && !onChange}
      />
      {icon && <span className="ic">{icon}</span>}
    </div>
  )
}

export function DateInput({ value, onChange }: { value?: string; onChange?: (v: string) => void }) {
  return (
    <div className="inp-wrap">
      <input
        className="inp"
        type="date"
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        onClick={(e) => {
          // 필드 어디를 클릭해도 달력 picker가 열리도록 (webkit는 CSS로도 처리됨)
          try {
            ;(e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.()
          } catch {
            /* showPicker 미지원 브라우저 — 무시 */
          }
        }}
      />
      <span className="ic">{I.cal()}</span>
    </div>
  )
}

// ---- 아바타 / 직원 셀 ----
export function Avatar({ name, on }: { name?: string; on?: boolean }) {
  const init = (name || '').replace(/\(.*\)/, '').trim().slice(0, 2)
  return <span className={'av' + (on ? ' on' : '')}>{init}</span>
}

export function Emp({ name, sub, on }: { name: string; sub?: string; on?: boolean }) {
  return (
    <span className="emp">
      <Avatar name={name} on={on} />
      <span className="nm">
        {name}
        {sub && <span className="sub">{sub}</span>}
      </span>
    </span>
  )
}

// ---- 세그먼트 토글 ----
interface SegProps<T extends string> {
  value: T
  onChange: (next: T) => void
  options: { value: T; label: string }[]
}
export function Seg<T extends string>({ value, onChange, options }: SegProps<T>) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={value === o.value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ---- 페이지네이션 ----
/** 현재±2 + 처음/마지막 + 생략('…') 윈도잉. 1='gap' 토큰은 비클릭 생략 표시. */
function pagerItems(page: number, totalPages: number): (number | 'gap')[] {
  const SIBLINGS = 2 // 현재 페이지 양옆 표시 수
  const first = 1
  const last = totalPages
  const start = Math.max(first, page - SIBLINGS)
  const end = Math.min(last, page + SIBLINGS)

  const items: (number | 'gap')[] = []
  if (start > first) {
    items.push(first)
    if (start > first + 1) items.push('gap')
  }
  for (let p = start; p <= end; p++) items.push(p)
  if (end < last) {
    if (end < last - 1) items.push('gap')
    items.push(last)
  }
  return items
}

export function Pager({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null
  const items = pagerItems(page, totalPages)
  return (
    <div className="pager">
      <button className="nav" disabled={page <= 1} onClick={() => onChange(page - 1)}>{I.chevL()}</button>
      {items.map((it, i) =>
        it === 'gap' ? (
          <span key={`gap-${i}`} className="ellipsis" aria-hidden>…</span>
        ) : (
          <button key={it} className={it === page ? 'on' : ''} onClick={() => onChange(it)}>
            {it}
          </button>
        ),
      )}
      <button className="nav" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>{I.chevR()}</button>
    </div>
  )
}

// ---- 정보 노트 박스 ----
export function Note({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="note">
      {title && <div className="note-t">{title}</div>}
      {children}
    </div>
  )
}

// ---- 빈 상태 ----
export function TableEmpty({ colSpan, message = '데이터가 없습니다' }: { colSpan: number; message?: string }) {
  return (
    <tr>
      <td className="tbl-empty" colSpan={colSpan}>{message}</td>
    </tr>
  )
}
