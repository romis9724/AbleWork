'use client'
import { createTheme, type Theme } from '@mui/material/styles'
import type {} from '@mui/x-data-grid/themeAugmentation'
import { type ThemeId, type ThemeTokens, getThemeMeta } from './tokens'

/**
 * AB Workforce MUI 테마 팩토리.
 *
 * 화면 룩은 CSS 변수(styles/ab-*.css)가 지배하지만, 아직 CSS 클래스로 마이그레이션되지
 * 않은 MUI 컴포넌트(DataGrid·Dialog·Tooltip 등)도 동일한 테마로 칠해지도록
 * theme/tokens.ts 의 동일 토큰에서 MUI 테마를 생성한다.
 *
 * ThemeRegistry 가 활성 테마 id 로 buildMuiTheme(id) 를 호출한다.
 */

function buildFromTokens(t: ThemeTokens): Theme {
  const isDark = t.colorScheme === 'dark'
  // 상태색 면 위 텍스트: 다크 테마는 밝은 상태색 → 어두운 글씨, 라이트 테마는 그 반대
  const onState = isDark ? '#000000' : '#ffffff'

  return createTheme({
    palette: {
      mode: t.colorScheme,
      primary: {
        main: t.accent,
        dark: t.accentDk,
        contrastText: t.onAccent,
      },
      secondary: { main: t.info, contrastText: onState },
      success: { main: t.ok, contrastText: onState },
      warning: { main: t.warn, contrastText: onState },
      error: { main: t.err, contrastText: t.onErr },
      info: { main: t.info, contrastText: onState },
      background: { default: t.bg, paper: t.bg1 },
      text: { primary: t.fg1, secondary: t.fg3, disabled: t.fg4 },
      divider: t.line,
      action: { hover: t.bg3, selected: t.bg2 },
    },
    // 디자인 시스템 토큰과 통일: 본문은 --font-body, 숫자/날짜는 화면에서 .tek(Tektur)로 별도 처리.
    typography: {
      fontFamily: 'var(--font-body)',
      fontWeightRegular: 500,
      button: { fontWeight: 600, textTransform: 'none' },
    },
    shape: { borderRadius: 0 },
    components: {
      MuiCssBaseline: {
        styleOverrides: { body: { backgroundColor: t.bg, color: t.fg1 } },
      },
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: 'none', backgroundColor: t.bg1, border: `1px solid ${t.line}` },
          elevation0: { border: 'none' },
        },
        defaultProps: { elevation: 0 },
      },
      MuiCard: {
        styleOverrides: {
          root: { boxShadow: 'none', backgroundColor: t.bg1, border: `1px solid ${t.line}` },
        },
      },
      MuiAppBar: {
        styleOverrides: { root: { boxShadow: 'none', backgroundColor: t.bg, backgroundImage: 'none' } },
      },
      MuiDrawer: {
        styleOverrides: { paper: { backgroundColor: t.bg1, backgroundImage: 'none', borderColor: t.line } },
      },
      MuiButton: {
        styleOverrides: {
          root: { textTransform: 'none', fontWeight: 600, boxShadow: 'none' },
          containedPrimary: { '&:hover': { backgroundColor: t.accentDk } },
        },
        defaultProps: { disableElevation: true },
      },
      MuiDialog: {
        styleOverrides: {
          paper: { backgroundColor: t.dialogBg, border: `1px solid ${t.lineStrong}`, backgroundImage: 'none' },
        },
      },
      MuiMenu: {
        styleOverrides: { paper: { backgroundColor: t.dialogBg, border: `1px solid ${t.line}` } },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: { backgroundColor: t.tooltipBg, color: '#ffffff', border: `1px solid ${t.line}`, fontSize: 12 },
        },
      },
      MuiDataGrid: {
        styleOverrides: {
          root: {
            border: 'none',
            color: t.fg2,
            '& .MuiDataGrid-cell:focus': { outline: 'none' },
            '& .MuiDataGrid-columnHeaders': { backgroundColor: t.bg1, borderColor: t.line },
            '& .MuiDataGrid-cell': { borderColor: t.lineSoft },
            '& .MuiDataGrid-row:hover': { backgroundColor: t.bg3 },
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: { borderColor: t.lineSoft },
          head: { backgroundColor: t.bg1, color: t.fg4, fontWeight: 700 },
        },
      },
      MuiTable: { defaultProps: { size: 'small' } },
      MuiOutlinedInput: {
        styleOverrides: {
          notchedOutline: { borderColor: t.line },
          root: { '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: t.lineStrong } },
        },
      },
      MuiChip: { styleOverrides: { root: { borderRadius: 0 } } },
      MuiDivider: { styleOverrides: { root: { borderColor: t.line } } },
    },
  })
}

const themeCache = new Map<ThemeId, Theme>()

/** 활성 테마 id 로 MUI 테마를 생성(캐시)한다. */
export function buildMuiTheme(id: ThemeId): Theme {
  const cached = themeCache.get(id)
  if (cached) return cached
  const meta = getThemeMeta(id)
  const built = buildFromTokens(meta.tokens)
  themeCache.set(meta.id, built)
  return built
}
