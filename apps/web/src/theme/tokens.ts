/**
 * 멀티 테마 토큰 레지스트리 (SSOT).
 *
 * 화면의 실제 룩은 CSS 커스텀 프로퍼티(--ab-*, --fg-*, --line* 등)가 지배한다.
 * 이 파일이 그 변수들의 "값"을 테마별로 단일 정의하고, 두 산출물을 파생시킨다.
 *   1) buildThemeCss()  → `:root[data-theme="X"]{ ... }` 블록 (레이아웃 <head>에 주입)
 *   2) buildMuiTheme(id) → MUI 테마 (theme/index.ts) — 아직 MUI로 칠해지는 컴포넌트 정합용
 *
 * 새 테마 추가: THEMES 에 한 항목만 더하면 CSS·MUI·전환 UI가 모두 자동 반영된다.
 */

export type ThemeMode = 'dark' | 'light'

export type ThemeId =
  | 'night-orange'
  | 'light-orange'
  | 'ayu'
  | 'tokyo-night'
  | 'github-white'
  | 'dracula'

/** 한 테마가 채워야 하는 색 토큰 전체 */
export interface ThemeTokens {
  /** 액센트(브랜드/주요 액션) — CSS --ab-orange */
  accent: string
  /** 액센트 hover/강조 — --ab-orange-dk */
  accentDk: string
  /** 보조 웜 톤 — --ab-warm-beige */
  warmBeige: string

  /** 캔버스 배경 — --ab-bg */
  bg: string
  /** 사이드바/표면(raised) — --ab-bg-1 */
  bg1: string
  /** 테이블 헤더/hover well — --ab-bg-2 */
  bg2: string
  /** 행 hover — --ab-bg-3 */
  bg3: string

  /** 최대 대비 전경(제목/강조) — --fg-1 */
  fg1: string
  fg2: string
  fg3: string
  fg4: string
  fg5: string

  line: string
  lineSoft: string
  lineStrong: string

  /** 입력 보더 — --warm-500 */
  warm500: string
  /** placeholder — --warm-600 */
  warm600: string

  ok: string
  warn: string
  err: string
  info: string

  /** 액센트로 채운 면 위 텍스트(버튼/뱃지) — --on-accent */
  onAccent: string
  /** 에러색으로 채운 면 위 텍스트 — --on-err */
  onErr: string

  /** 모달/다이얼로그/카드 표면 — --dialog-bg */
  dialogBg: string
  /** 토스트 표면 — --toast-bg */
  toastBg: string
  /** 모달 backdrop scrim — --overlay */
  overlay: string

  scrollbarTrack: string
  scrollbarThumb: string
  scrollbarThumbHover: string

  /** 토글 off 트랙 — --toggle-off */
  toggleOff: string
  /** 토글 knob — --toggle-knob */
  toggleKnob: string

  /** MUI 툴팁 배경(항상 어두운 표면 + 흰 글씨) — --tooltip-bg */
  tooltipBg: string

  /** 네이티브 폼 컨트롤(date picker 등) 스킴 — --color-scheme */
  colorScheme: ThemeMode
}

export interface ThemeMeta {
  id: ThemeId
  /** 전환 UI 표기 */
  label: string
  mode: ThemeMode
  /** 전환 UI 그룹 헤더 */
  group: '라이트' | '다크'
  /** 전환 UI 미리보기 스와치 [배경, 액센트, 전경] */
  swatch: [string, string, string]
  tokens: ThemeTokens
}

// ─────────────────────────────────────────────────────────────────────────────
// 테마 정의
// ─────────────────────────────────────────────────────────────────────────────

const NIGHT_ORANGE: ThemeTokens = {
  accent: '#f36f20',
  accentDk: '#d24b13',
  warmBeige: '#dcd5ce',
  bg: '#000000',
  bg1: '#070707',
  bg2: '#0d0d0d',
  bg3: '#131313',
  fg1: '#ffffff',
  fg2: 'rgba(255,255,255,0.80)',
  fg3: 'rgba(255,255,255,0.62)',
  fg4: 'rgba(255,255,255,0.42)',
  fg5: 'rgba(255,255,255,0.28)',
  line: 'rgba(255,255,255,0.12)',
  lineSoft: 'rgba(255,255,255,0.07)',
  lineStrong: 'rgba(255,255,255,0.55)',
  warm500: '#9e9088',
  warm600: '#756a60',
  ok: '#7fdc8e',
  warn: '#f3b720',
  err: '#ff7f7f',
  info: '#8ab4f8',
  onAccent: '#ffffff',
  onErr: '#000000',
  dialogBg: '#050505',
  toastBg: '#111111',
  overlay: 'rgba(0,0,0,0.72)',
  scrollbarTrack: '#000000',
  scrollbarThumb: '#2a2a2a',
  scrollbarThumbHover: '#3a3a3a',
  toggleOff: '#2a2a2a',
  toggleKnob: '#ffffff',
  tooltipBg: '#1b1b1b',
  colorScheme: 'dark',
}

const LIGHT_ORANGE: ThemeTokens = {
  // 라이트 배경에서 accent 는 텍스트(eyebrow·뱃지·링크)로도 쓰이므로 AA(4.5)를 만족하도록
  // 충분히 진한 번트 오렌지로. 흰 글씨를 올린 채움 버튼 대비도 함께 확보된다.
  accent: '#a8480c',
  accentDk: '#8a3b08',
  warmBeige: '#8a7d72',
  bg: '#f7f4f1',
  bg1: '#ffffff',
  bg2: '#efe9e3',
  bg3: '#f2ece6',
  fg1: '#1c1815',
  fg2: 'rgba(28,24,21,0.82)',
  fg3: 'rgba(28,24,21,0.62)',
  fg4: 'rgba(28,24,21,0.48)',
  fg5: 'rgba(28,24,21,0.32)',
  line: 'rgba(28,24,21,0.14)',
  lineSoft: 'rgba(28,24,21,0.07)',
  lineStrong: 'rgba(28,24,21,0.45)',
  warm500: '#a99e92',
  warm600: '#8d8073',
  // 상태색도 라이트 배경에서 텍스트로 읽혀야 하므로 어두운 톤으로 (AA 충족)
  ok: '#1f7a40',
  warn: '#855a00',
  err: '#c0392b',
  info: '#1257c4',
  onAccent: '#ffffff',
  onErr: '#ffffff',
  dialogBg: '#ffffff',
  toastBg: '#ffffff',
  overlay: 'rgba(28,24,21,0.45)',
  scrollbarTrack: '#efe9e3',
  scrollbarThumb: '#d4cabf',
  scrollbarThumbHover: '#c0b4a7',
  toggleOff: '#cfc6bd',
  toggleKnob: '#ffffff',
  tooltipBg: '#2a2521',
  colorScheme: 'light',
}

// Ayu Dark — 따뜻한 짙은 네이비 + 앰버 액센트
const AYU: ThemeTokens = {
  accent: '#ffb454',
  accentDk: '#f0a030',
  warmBeige: '#b3a173',
  bg: '#0b0e14',
  bg1: '#0d1017',
  bg2: '#11161f',
  bg3: '#161c26',
  fg1: '#eceae0',
  fg2: 'rgba(236,234,224,0.78)',
  fg3: 'rgba(236,234,224,0.58)',
  fg4: 'rgba(236,234,224,0.40)',
  fg5: 'rgba(236,234,224,0.26)',
  line: 'rgba(189,189,182,0.13)',
  lineSoft: 'rgba(189,189,182,0.07)',
  lineStrong: 'rgba(189,189,182,0.42)',
  warm500: '#565b66',
  warm600: '#3d424d',
  ok: '#aad94c',
  warn: '#ffb454',
  err: '#f07178',
  info: '#59c2ff',
  onAccent: '#0b0e14',
  onErr: '#0b0e14',
  dialogBg: '#0d1017',
  toastBg: '#11161f',
  overlay: 'rgba(0,0,0,0.72)',
  scrollbarTrack: '#0b0e14',
  scrollbarThumb: '#1f2630',
  scrollbarThumbHover: '#2a323e',
  toggleOff: '#2a323e',
  toggleKnob: '#eceae0',
  tooltipBg: '#1f2630',
  colorScheme: 'dark',
}

// Tokyo Night — 블루·퍼플 다크 + 블루 액센트
const TOKYO_NIGHT: ThemeTokens = {
  accent: '#7aa2f7',
  accentDk: '#6889d8',
  warmBeige: '#9aa5ce',
  bg: '#1a1b26',
  bg1: '#1d1e2c',
  bg2: '#222433',
  bg3: '#2a2c3d',
  fg1: '#c0caf5',
  fg2: 'rgba(192,202,245,0.80)',
  fg3: 'rgba(192,202,245,0.60)',
  fg4: 'rgba(192,202,245,0.42)',
  fg5: 'rgba(192,202,245,0.28)',
  line: 'rgba(192,202,245,0.11)',
  lineSoft: 'rgba(192,202,245,0.06)',
  lineStrong: 'rgba(192,202,245,0.40)',
  warm500: '#565f89',
  warm600: '#414868',
  ok: '#9ece6a',
  warn: '#e0af68',
  err: '#f7768e',
  info: '#7dcfff',
  onAccent: '#16161e',
  onErr: '#16161e',
  dialogBg: '#16161e',
  toastBg: '#20222e',
  overlay: 'rgba(0,0,0,0.72)',
  scrollbarTrack: '#16161e',
  scrollbarThumb: '#2a2c3d',
  scrollbarThumbHover: '#363951',
  toggleOff: '#2a2c3d',
  toggleKnob: '#c0caf5',
  tooltipBg: '#20222e',
  colorScheme: 'dark',
}

// GitHub Light Default — 또렷한 라이트 + 블루 액센트
const GITHUB_WHITE: ThemeTokens = {
  accent: '#0969da',
  accentDk: '#0860ca',
  warmBeige: '#8c959f',
  bg: '#ffffff',
  bg1: '#f6f8fa',
  bg2: '#eaeef2',
  bg3: '#f0f3f6',
  fg1: '#1f2328',
  fg2: '#424a53',
  fg3: '#59636e',
  fg4: '#818b98',
  fg5: '#afb8c1',
  line: '#d0d7de',
  lineSoft: '#eaeef2',
  lineStrong: '#afb8c1',
  warm500: '#afb8c1',
  warm600: '#8c959f',
  ok: '#1a7f37',
  warn: '#9a6700',
  err: '#cf222e',
  info: '#0969da',
  onAccent: '#ffffff',
  onErr: '#ffffff',
  dialogBg: '#ffffff',
  toastBg: '#ffffff',
  overlay: 'rgba(31,35,40,0.45)',
  scrollbarTrack: '#f6f8fa',
  scrollbarThumb: '#d0d7de',
  scrollbarThumbHover: '#afb8c1',
  toggleOff: '#d0d7de',
  toggleKnob: '#ffffff',
  tooltipBg: '#24292f',
  colorScheme: 'light',
}

// Dracula — 보라 액센트 다크
const DRACULA: ThemeTokens = {
  accent: '#bd93f9',
  accentDk: '#a87fe0',
  warmBeige: '#6272a4',
  bg: '#282a36',
  bg1: '#2d2f3d',
  bg2: '#343746',
  bg3: '#3c3f51',
  fg1: '#f8f8f2',
  fg2: 'rgba(248,248,242,0.80)',
  fg3: 'rgba(248,248,242,0.60)',
  fg4: 'rgba(248,248,242,0.42)',
  fg5: 'rgba(248,248,242,0.28)',
  line: 'rgba(248,248,242,0.11)',
  lineSoft: 'rgba(248,248,242,0.06)',
  lineStrong: 'rgba(248,248,242,0.42)',
  warm500: '#6272a4',
  warm600: '#4a5277',
  ok: '#50fa7b',
  warn: '#f1fa8c',
  err: '#ff5555',
  info: '#8be9fd',
  onAccent: '#282a36',
  onErr: '#282a36',
  dialogBg: '#21222c',
  toastBg: '#343746',
  overlay: 'rgba(0,0,0,0.72)',
  scrollbarTrack: '#21222c',
  scrollbarThumb: '#44475a',
  scrollbarThumbHover: '#565a72',
  toggleOff: '#44475a',
  toggleKnob: '#f8f8f2',
  tooltipBg: '#343746',
  colorScheme: 'dark',
}

export const THEMES: Record<ThemeId, ThemeMeta> = {
  'night-orange': {
    id: 'night-orange',
    label: 'Night Orange',
    mode: 'dark',
    group: '다크',
    swatch: ['#000000', '#f36f20', '#ffffff'],
    tokens: NIGHT_ORANGE,
  },
  'light-orange': {
    id: 'light-orange',
    label: 'Light Orange',
    mode: 'light',
    group: '라이트',
    swatch: ['#f7f4f1', '#a8480c', '#1c1815'],
    tokens: LIGHT_ORANGE,
  },
  ayu: {
    id: 'ayu',
    label: 'Ayu',
    mode: 'dark',
    group: '다크',
    swatch: ['#0b0e14', '#ffb454', '#eceae0'],
    tokens: AYU,
  },
  'tokyo-night': {
    id: 'tokyo-night',
    label: 'Tokyo Night',
    mode: 'dark',
    group: '다크',
    swatch: ['#1a1b26', '#7aa2f7', '#c0caf5'],
    tokens: TOKYO_NIGHT,
  },
  'github-white': {
    id: 'github-white',
    label: 'GitHub White',
    mode: 'light',
    group: '라이트',
    swatch: ['#ffffff', '#0969da', '#1f2328'],
    tokens: GITHUB_WHITE,
  },
  dracula: {
    id: 'dracula',
    label: 'Dracula',
    mode: 'dark',
    group: '다크',
    swatch: ['#282a36', '#bd93f9', '#f8f8f2'],
    tokens: DRACULA,
  },
}

export const DEFAULT_THEME_ID: ThemeId = 'night-orange'

/** 테마 선택 영속화 쿠키명 (서버 레이아웃·클라이언트 스토어 공용) */
export const THEME_COOKIE = 'ablework-theme'

/** 전환 UI 노출 순서 */
export const THEME_ORDER: ThemeId[] = [
  'night-orange',
  'light-orange',
  'ayu',
  'tokyo-night',
  'github-white',
  'dracula',
]

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && value in THEMES
}

export function getThemeMeta(id: ThemeId): ThemeMeta {
  return THEMES[id] ?? THEMES[DEFAULT_THEME_ID]
}

/** 토큰 키 → CSS 변수명 매핑 (CSS 시트가 참조하는 이름과 1:1) */
const CSS_VAR_MAP: Record<keyof ThemeTokens, string> = {
  accent: '--ab-orange',
  accentDk: '--ab-orange-dk',
  warmBeige: '--ab-warm-beige',
  bg: '--ab-bg',
  bg1: '--ab-bg-1',
  bg2: '--ab-bg-2',
  bg3: '--ab-bg-3',
  fg1: '--fg-1',
  fg2: '--fg-2',
  fg3: '--fg-3',
  fg4: '--fg-4',
  fg5: '--fg-5',
  line: '--line',
  lineSoft: '--line-soft',
  lineStrong: '--line-strong',
  warm500: '--warm-500',
  warm600: '--warm-600',
  ok: '--ok',
  warn: '--warn',
  err: '--err',
  info: '--info',
  onAccent: '--on-accent',
  onErr: '--on-err',
  dialogBg: '--dialog-bg',
  toastBg: '--toast-bg',
  overlay: '--overlay',
  scrollbarTrack: '--scrollbar-track',
  scrollbarThumb: '--scrollbar-thumb',
  scrollbarThumbHover: '--scrollbar-thumb-hover',
  toggleOff: '--toggle-off',
  toggleKnob: '--toggle-knob',
  tooltipBg: '--tooltip-bg',
  colorScheme: '--color-scheme',
}

function tokensToVars(tokens: ThemeTokens): string {
  return (Object.keys(CSS_VAR_MAP) as (keyof ThemeTokens)[])
    .map((key) => `${CSS_VAR_MAP[key]}:${tokens[key]};`)
    .join('')
}

/**
 * 전 테마의 `:root[data-theme="X"]{...}` 블록을 생성한다.
 * `:root[data-theme]`(특이도 0,1,1)가 ab-admin.css 의 `:root`(0,1,0) 기본값을 항상 이기므로
 * 시트 주입 순서와 무관하게 적용된다.
 */
export function buildThemeCss(): string {
  return THEME_ORDER.map((id) => {
    const t = THEMES[id].tokens
    return `:root[data-theme="${id}"]{${tokensToVars(t)}color-scheme:${t.colorScheme};}`
  }).join('\n')
}
