import type { SxProps, Theme } from '@mui/material/styles'

/**
 * 공통 패널(Paper/Card) 외곽 스타일.
 * 그림자 대신 1px 보더로 통일한다 — 화면 전반의 카드/패널 룩을 단일화.
 * 모서리 반경은 테마(shape.borderRadius)를 그대로 따른다(개별 borderRadius 지정 금지).
 */
export const PANEL_SX: SxProps<Theme> = {
  border: '1px solid',
  borderColor: 'divider',
}

/**
 * 목록 화면 상단 필터/검색 바 공통 스타일.
 * 모든 관리자 목록 화면의 필터 영역을 동일한 패널·간격으로 통일한다.
 */
export const FILTER_BAR_SX: SxProps<Theme> = {
  ...(PANEL_SX as object),
  p: 2,
  mb: 3,
  display: 'flex',
  gap: 2,
  flexWrap: 'wrap',
  alignItems: 'center',
}

/**
 * 다중 선택 시 노출되는 일괄 액션 툴바 공통 스타일.
 */
export const SELECTION_BAR_SX: SxProps<Theme> = {
  display: 'flex',
  alignItems: 'center',
  gap: 1.5,
  mb: 2,
  px: 2,
  minHeight: 48,
  borderRadius: 1,
  bgcolor: 'action.selected',
}

/**
 * 직원(me) 화면 본문 최대 폭.
 * 모바일 우선 카드 레이아웃이 데스크톱에서 과도하게 늘어나지 않도록 중앙 정렬한다.
 */
export const ME_CONTENT_MAX_WIDTH = 900
