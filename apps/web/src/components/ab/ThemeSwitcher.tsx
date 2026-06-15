'use client'
import { useState, type MouseEvent } from 'react'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import ListSubheader from '@mui/material/ListSubheader'
import { useThemeStore } from '@/stores/theme.store'
import { THEME_ORDER, THEMES, type ThemeId } from '@/theme/tokens'

/**
 * 테마 전환 컨트롤 — 헤더(관리자·직원)·로그인 화면 공용.
 * 트리거(팔레트 아이콘) + 라이트/다크 그룹 메뉴. 각 항목은 미니 UI 프리뷰 스와치.
 */

function PaletteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3a9 9 0 1 0 0 18c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1-.24-.27-.39-.62-.39-1 0-.83.67-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4.42-4.03-8-9-8Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="7.5" cy="11.5" r="1.1" fill="currentColor" />
      <circle cx="11" cy="7.5" r="1.1" fill="currentColor" />
      <circle cx="15.5" cy="8.5" r="1.1" fill="currentColor" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12.5l4.2 4.2L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
    </svg>
  )
}

/** 미니 UI 프리뷰: 캔버스 + 액센트 바 + 전경 라인 2줄 */
function Swatch({ id }: { id: ThemeId }) {
  const [bg, accent, fg] = THEMES[id].swatch
  return (
    <span
      aria-hidden="true"
      style={{
        width: 30,
        height: 24,
        flex: '0 0 30px',
        background: bg,
        border: '1px solid var(--line)',
        display: 'block',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <span style={{ position: 'absolute', top: 4, left: 4, width: 8, height: 8, background: accent }} />
      <span style={{ position: 'absolute', top: 5, left: 15, width: 10, height: 2, background: fg, opacity: 0.85 }} />
      <span style={{ position: 'absolute', top: 11, left: 4, width: 21, height: 2, background: fg, opacity: 0.45 }} />
      <span style={{ position: 'absolute', top: 16, left: 4, width: 14, height: 2, background: fg, opacity: 0.3 }} />
    </span>
  )
}

interface ThemeSwitcherProps {
  /** 헤더 칩 스타일 클래스(.hd-lang 등)를 그대로 입혀 톤을 맞춘다 */
  className?: string
  /** 라벨 텍스트 표시 여부 (좁은 헤더에서는 끄기) */
  showLabel?: boolean
}

export function ThemeSwitcher({ className = 'hd-lang', showLabel = false }: ThemeSwitcherProps) {
  const themeId = useThemeStore((s) => s.themeId)
  const setTheme = useThemeStore((s) => s.setTheme)
  const [anchor, setAnchor] = useState<null | HTMLElement>(null)
  const open = Boolean(anchor)

  const grouped: Record<string, ThemeId[]> = { 라이트: [], 다크: [] }
  for (const id of THEME_ORDER) grouped[THEMES[id].group].push(id)

  const handleOpen = (e: MouseEvent<HTMLElement>) => setAnchor(e.currentTarget)
  const handleClose = () => setAnchor(null)
  const pick = (id: ThemeId) => {
    setTheme(id)
    handleClose()
  }

  return (
    <>
      <div
        className={className}
        role="button"
        tabIndex={0}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="테마 변경"
        title="테마 변경"
        onClick={handleOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleOpen(e as unknown as MouseEvent<HTMLElement>)
          }
        }}
      >
        <PaletteIcon />
        {showLabel && <span>{THEMES[themeId].label}</span>}
      </div>

      <Menu
        anchorEl={anchor}
        open={open}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { minWidth: 232, mt: 1 } } }}
      >
        {(['라이트', '다크'] as const).flatMap((group) => [
          <ListSubheader
            key={`h-${group}`}
            disableSticky
            sx={{
              bgcolor: 'transparent',
              color: 'var(--fg-5)',
              fontFamily: 'var(--font-display)',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              lineHeight: '28px',
            }}
          >
            {group}
          </ListSubheader>,
          ...grouped[group].map((id) => (
            <MenuItem
              key={id}
              selected={id === themeId}
              onClick={() => pick(id)}
              sx={{ gap: 1.25, py: 1, fontSize: 13 }}
            >
              <Swatch id={id} />
              <span style={{ flex: 1 }}>{THEMES[id].label}</span>
              {id === themeId && (
                <span style={{ color: 'var(--ab-orange)', display: 'inline-flex' }}>
                  <CheckIcon />
                </span>
              )}
            </MenuItem>
          )),
        ])}
      </Menu>
    </>
  )
}
