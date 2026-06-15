'use client'
import { createTheme } from '@mui/material/styles'
import type {} from '@mui/x-data-grid/themeAugmentation'

/**
 * AB Workforce 다크 테마.
 * 디자인 핸드오프(refs/design_handoff_ab_workforce) 토큰과 정합:
 * 순수 블랙 캔버스 · 오렌지(#f36f20) 단일 액센트 · radius 0 · 그림자 없음 · 헤어라인.
 * 전역 CSS(styles/ab-admin.css, ab-hr.css)와 함께 동작하며, 아직 마이그레이션되지 않은
 * MUI 컴포넌트도 이 테마로 동일한 다크 룩을 유지한다.
 */

// 디자인 토큰 (CSS :root 와 동일 값)
const AB = {
  orange: '#f36f20',
  orangeDk: '#d24b13',
  orangeLt: '#ff9d50',
  bg: '#000000',
  bg1: '#070707',
  bg2: '#0d0d0d',
  bg3: '#131313',
  fg1: '#ffffff',
  fg2: 'rgba(255,255,255,0.80)',
  fg3: 'rgba(255,255,255,0.62)',
  fg4: 'rgba(255,255,255,0.42)',
  line: 'rgba(255,255,255,0.12)',
  lineSoft: 'rgba(255,255,255,0.07)',
  lineStrong: 'rgba(255,255,255,0.55)',
  ok: '#7fdc8e',
  warn: '#f3b720',
  err: '#ff7f7f',
  info: '#8ab4f8',
} as const

export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: AB.orange,
      light: AB.orangeLt,
      dark: AB.orangeDk,
      contrastText: '#ffffff',
    },
    secondary: {
      main: AB.info,
      contrastText: '#000000',
    },
    success: { main: AB.ok, contrastText: '#000000' },
    warning: { main: AB.warn, contrastText: '#000000' },
    error: { main: AB.err, contrastText: '#000000' },
    info: { main: AB.info, contrastText: '#000000' },
    background: {
      default: AB.bg,
      paper: AB.bg2,
    },
    text: {
      primary: AB.fg1,
      secondary: AB.fg3,
      disabled: AB.fg4,
    },
    divider: AB.line,
    action: {
      hover: AB.bg3,
      selected: AB.bg2,
    },
  },
    // 디자인 시스템 토큰과 통일: 별도 스택(Noto/Roboto) 하드코딩 대신 ab-admin.css의 --font-body 사용.
    // (숫자/문서번호/날짜 등은 화면에서 .tek / var(--font-display) = Tektur 로 별도 처리 — 다른 메뉴와 동일)
  typography: {
    fontFamily: 'var(--font-body)',
    fontWeightRegular: 500,
    button: { fontWeight: 600, textTransform: 'none' },
  },
  shape: {
    borderRadius: 0,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: AB.bg,
          color: AB.fg1,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: AB.bg1,
          border: `1px solid ${AB.line}`,
        },
        elevation0: { border: 'none' },
      },
      defaultProps: { elevation: 0 },
    },
    MuiCard: {
      styleOverrides: {
        root: { boxShadow: 'none', backgroundColor: AB.bg1, border: `1px solid ${AB.line}` },
      },
    },
    MuiAppBar: {
      styleOverrides: { root: { boxShadow: 'none', backgroundColor: AB.bg, backgroundImage: 'none' } },
    },
    MuiDrawer: {
      styleOverrides: { paper: { backgroundColor: AB.bg1, backgroundImage: 'none', borderColor: AB.line } },
    },
    MuiButton: {
      styleOverrides: {
        root: { textTransform: 'none', fontWeight: 600, boxShadow: 'none' },
        containedPrimary: { '&:hover': { backgroundColor: AB.orangeDk } },
      },
      defaultProps: { disableElevation: true },
    },
    MuiDialog: {
      styleOverrides: {
        paper: { backgroundColor: '#050505', border: `1px solid ${AB.lineStrong}`, backgroundImage: 'none' },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: { backgroundColor: '#1b1b1b', border: `1px solid ${AB.line}`, fontSize: 12 },
      },
    },
    MuiDataGrid: {
      styleOverrides: {
        root: {
          border: 'none',
          color: AB.fg2,
          '& .MuiDataGrid-cell:focus': { outline: 'none' },
          '& .MuiDataGrid-columnHeaders': { backgroundColor: AB.bg1, borderColor: AB.line },
          '& .MuiDataGrid-cell': { borderColor: AB.lineSoft },
          '& .MuiDataGrid-row:hover': { backgroundColor: AB.bg3 },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: AB.lineSoft },
        head: { backgroundColor: AB.bg1, color: AB.fg4, fontWeight: 700 },
      },
    },
    MuiTable: { defaultProps: { size: 'small' } },
    MuiOutlinedInput: {
      styleOverrides: {
        notchedOutline: { borderColor: AB.line },
        root: {
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: AB.lineStrong },
        },
      },
    },
    MuiChip: {
      styleOverrides: { root: { borderRadius: 0 } },
    },
    MuiDivider: {
      styleOverrides: { root: { borderColor: AB.line } },
    },
  },
})
