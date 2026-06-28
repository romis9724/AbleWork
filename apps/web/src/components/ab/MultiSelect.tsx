'use client'
import { useEffect, useRef, useState } from 'react'

export interface MultiSelectOption {
  value: string
  label: string
  /** 트리 들여쓰기 깊이(조직 계층 표시용) */
  depth?: number
}

interface MultiSelectProps {
  options: MultiSelectOption[]
  value: string[]
  onChange: (next: string[]) => void
  /** 선택이 없을 때 표시(= 전체) */
  placeholder?: string
  width?: number
  testId?: string
}

/**
 * AB 스타일 다중 선택 — `.sel` 입력칸 모양의 트리거 + 체크박스 팝오버.
 * native `<select multiple>` 대비 UX가 좋고, 외부 클릭/ESC로 닫힌다.
 */
export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = '전체',
  width = 180,
  testId,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const selected = options.filter((o) => value.includes(o.value))
  const summary =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? selected[0].label
        : `${selected.length}개 선택`

  function toggle(v: string) {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  }

  return (
    <div ref={ref} style={{ position: 'relative', width, flex: '0 0 auto' }}>
      <button
        type="button"
        className="sel"
        data-testid={testId}
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          textAlign: 'left',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
        }}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: selected.length ? 'var(--fg-1)' : 'var(--fg-4)',
          }}
        >
          {summary}
        </span>
        <span style={{ color: 'var(--fg-4)', fontSize: 10, flexShrink: 0 }}>▾</span>
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            zIndex: 50,
            minWidth: '100%',
            maxHeight: 280,
            overflowY: 'auto',
            background: 'var(--ab-bg-1, #16181d)',
            border: '1px solid var(--line-strong)',
            borderRadius: 6,
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            padding: 4,
          }}
        >
          {value.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              style={{
                width: '100%',
                textAlign: 'left',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--ab-orange)',
                fontSize: 12,
                padding: '6px 8px',
              }}
            >
              선택 해제
            </button>
          )}
          {options.length === 0 ? (
            <div style={{ padding: '8px', fontSize: 12, color: 'var(--fg-4)' }}>항목이 없습니다</div>
          ) : (
            options.map((o) => (
              <label
                key={o.value}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 8px',
                  cursor: 'pointer',
                  fontSize: 13,
                  color: 'var(--fg-2)',
                  borderRadius: 4,
                }}
              >
                <input
                  type="checkbox"
                  className="ck"
                  checked={value.includes(o.value)}
                  onChange={() => toggle(o.value)}
                />
                <span style={{ paddingLeft: (o.depth ?? 0) * 12 }}>{o.label}</span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  )
}
