/**
 * AB Workforce 페이지 레이아웃 헬퍼 — 페이지 헤드 · KPI · 카드박스 · 필터.
 * 핸드오프 .page-head / .kpi-grid / .card-box / .filter / .fbar 스타일 사용.
 */
'use client'
import type { ReactNode } from 'react'

interface PageHeadProps {
  eyebrow: string
  title: string
  /** 우측 액션/기준시각 영역 */
  right?: ReactNode
}
export function PageHead({ eyebrow, title, right }: PageHeadProps) {
  return (
    <div className="page-head">
      <div className="page-title-wrap">
        <span className="page-eyebrow">{eyebrow}</span>
        <h1 className="page-title">{title}</h1>
      </div>
      {right && <div className="head-actions">{right}</div>}
    </div>
  )
}

export function KpiGrid({ children, cols }: { children: ReactNode; cols?: number }) {
  // cols 지정 시 열 수를 고정(인라인이 .kpi-grid 클래스 규칙보다 우선). 예: 홈 연차현황 1행 3열.
  return (
    <div
      className="kpi-grid"
      style={cols ? { gridTemplateColumns: `repeat(${cols}, 1fr)` } : undefined}
    >
      {children}
    </div>
  )
}

interface KpiProps {
  label: string
  value: ReactNode
  unit?: string
  desc?: ReactNode
  accent?: boolean
}
export function Kpi({ label, value, unit, desc, accent }: KpiProps) {
  return (
    <div className={'kpi' + (accent ? ' accent' : '')}>
      <div className="kpi-k">{label}</div>
      <div className="kpi-v">
        {value}
        {unit && <span className="u">{unit}</span>}
      </div>
      {desc && <div className="kpi-d">{desc}</div>}
    </div>
  )
}

interface CardBoxProps {
  title: ReactNode
  more?: ReactNode
  onMore?: () => void
  children: ReactNode
}
export function CardBox({ title, more, onMore, children }: CardBoxProps) {
  return (
    <div className="card-box">
      <div className="card-box-head">
        <span className="t">
          <span className="dot" />
          {title}
        </span>
        {more && (
          <span
            className="more"
            role="button"
            tabIndex={0}
            onClick={onMore}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onMore?.()
              }
            }}
          >
            {more}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

/** 작은 필터 칩 행 (.fbar) */
export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="fbar">{children}</div>
}

interface FChipProps {
  icon?: ReactNode
  children: ReactNode
  count?: number
  onClick?: () => void
}
export function FChip({ icon, children, count, onClick }: FChipProps) {
  return (
    <button type="button" className="fchip" onClick={onClick}>
      {icon && <span className="ic">{icon}</span>}
      {children}
      {count != null && <span className="cnt">{count}</span>}
    </button>
  )
}

/** 큰 필터 박스 (.filter + .filter-grid) */
export function FilterPanel({ children }: { children: ReactNode }) {
  return (
    <div className="filter">
      <div className="filter-grid">{children}</div>
    </div>
  )
}

/** 테이블 상단 카운트/툴 바 */
export function TableBar({ count, tools }: { count?: ReactNode; tools?: ReactNode }) {
  return (
    <div className="tbl-bar">
      <div className="tbl-count">{count}</div>
      {tools && <div className="tbl-tools">{tools}</div>}
    </div>
  )
}
