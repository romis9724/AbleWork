'use client'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { SETTINGS_HELP } from '@/lib/settings-help'

interface HelpTipProps {
  /** SETTINGS_HELP 키 — 지정 시 중앙 텍스트(title/body/effects/tip)를 사용 */
  k?: string
  /** 직접 지정용(선택) */
  title?: string
  children?: ReactNode
  width?: number
}

/**
 * 설정 항목 옆 "!" 도움말 아이콘.
 * 클릭하면 그 자리에 풍선(popover)으로 설명을 띄운다. 외부 클릭·ESC로 닫힌다.
 * `k`로 중앙 SSOT(SETTINGS_HELP)에서 본문·영향 목록·권장 팁을 가져오거나,
 * title/children을 직접 넘긴다. 내용이 길면 popover 내부에서 스크롤된다.
 */
export function HelpTip({ k, title, children, width = 340 }: HelpTipProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

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

  const entry = k ? SETTINGS_HELP[k] : undefined
  const resolvedTitle = title ?? entry?.title
  const body = children ?? entry?.body
  const effects = entry?.effects
  const tip = entry?.tip

  // 문구가 없으면(키 누락) 렌더하지 않아 깨진 아이콘을 방지
  if (!body) return null

  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex', verticalAlign: 'middle' }}>
      <button
        type="button"
        aria-label="설정 설명 보기"
        onClick={(e) => {
          // label/행 클릭으로 전파되어 체크박스·토글이 바뀌는 것을 막는다
          e.preventDefault()
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        style={{
          width: 16,
          height: 16,
          marginLeft: 6,
          padding: 0,
          borderRadius: '50%',
          border: '1px solid var(--line-strong)',
          background: open ? 'var(--ab-orange)' : 'transparent',
          color: open ? '#fff' : 'var(--fg-4)',
          fontSize: 11,
          fontWeight: 700,
          lineHeight: 1,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        !
      </button>
      {open && (
        <span
          role="tooltip"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 60,
            width,
            maxHeight: 360,
            overflowY: 'auto',
            background: 'var(--ab-bg-1, #16181d)',
            border: '1px solid var(--line-strong)',
            borderRadius: 6,
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            padding: '12px 14px',
            fontSize: 12,
            lineHeight: 1.65,
            color: 'var(--fg-2)',
            fontWeight: 400,
            whiteSpace: 'normal',
            textAlign: 'left',
            cursor: 'auto',
          }}
        >
          {resolvedTitle && (
            <strong style={{ display: 'block', marginBottom: 6, color: 'var(--fg-1)', fontSize: 12.5 }}>
              {resolvedTitle}
            </strong>
          )}
          <span style={{ display: 'block' }}>{body}</span>
          {effects && effects.length > 0 && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {effects.map((e, i) => (
                <li key={i} style={{ color: 'var(--fg-3)' }}>
                  {e}
                </li>
              ))}
            </ul>
          )}
          {tip && (
            <span
              style={{
                display: 'block',
                marginTop: 8,
                paddingTop: 8,
                borderTop: '1px solid var(--line)',
                color: 'var(--ab-orange)',
              }}
            >
              💡 {tip}
            </span>
          )}
        </span>
      )}
    </span>
  )
}
