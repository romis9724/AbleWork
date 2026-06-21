/**
 * AB Workforce 아이콘 세트 — 1px 스트로크 사각캡 인라인 SVG.
 * 디자인 핸드오프(hr/atoms.jsx · hr/hr_atoms.jsx)의 I / HRI / Sigil 포팅.
 */
import type { SVGProps, ReactElement } from 'react'

type IconProps = SVGProps<SVGSVGElement>
type IconFn = (p?: IconProps) => ReactElement

// ---- 브랜드 시질 (오렌지 큐브) ----
export function Sigil({ size = 26 }: { size?: number }): ReactElement {
  return (
    <svg className="hd-sigil" width={size} height={size * (46 / 48)} viewBox="0 0 48 46" fill="none">
      <path d="M17.7806 26.5507V19.4493L23.9389 15.8958L30.0944 19.4493L43.875 11.5L23.9389 0L4 11.5V34.5L23.9389 46V30.1013L17.7806 26.5507Z" fill="#F36F20" />
      <path d="M30.0949 19.4493V26.5507L23.9395 30.1013V46L43.8755 34.5V11.5L30.0949 19.4493Z" fill="#D24B13" />
    </svg>
  )
}

// ---- 공용 아이콘 (I) ----
export const I: Record<string, IconFn> = {
  search: (p) => <svg width="15" height="15" viewBox="0 0 16 16" fill="none" {...p}><circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.2" /><path d="M11 11l4 4" stroke="currentColor" strokeWidth="1.2" /></svg>,
  cal: (p) => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}><rect x="2" y="3" width="12" height="11" stroke="currentColor" strokeWidth="1.1" /><path d="M2 6h12M5 1.5v3M11 1.5v3" stroke="currentColor" strokeWidth="1.1" /></svg>,
  refresh: (p) => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" stroke="currentColor" strokeWidth="1.2" /><path d="M12.5 1.5v3h-3" stroke="currentColor" strokeWidth="1.2" /></svg>,
  ext: (p) => <svg width="11" height="11" viewBox="0 0 16 16" fill="none" {...p}><path d="M6 3H3v10h10v-3M10 3h3v3M13 3L7 9" stroke="currentColor" strokeWidth="1.2" /></svg>,
  grip: (p) => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}><path d="M3 5h10M3 8h10M3 11h10" stroke="currentColor" strokeWidth="1.2" /></svg>,
  x: (p) => <svg width="12" height="12" viewBox="0 0 16 16" fill="none" {...p}><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.3" /></svg>,
  plus: (p) => <svg width="13" height="13" viewBox="0 0 16 16" fill="none" {...p}><path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.3" /></svg>,
  down: (p) => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}><path d="M8 2v9M4 7l4 4 4-4M3 14h10" stroke="currentColor" strokeWidth="1.2" /></svg>,
  user: (p) => <svg width="15" height="15" viewBox="0 0 16 16" fill="none" {...p}><circle cx="8" cy="5.5" r="2.6" stroke="currentColor" strokeWidth="1.1" /><path d="M2.7 14c0-2.9 2.4-4.5 5.3-4.5s5.3 1.6 5.3 4.5" stroke="currentColor" strokeWidth="1.1" /></svg>,
  arrow: (p) => <svg width="13" height="13" viewBox="0 0 16 16" fill="none" {...p}><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.3" /></svg>,
  chevL: (p) => <svg width="12" height="12" viewBox="0 0 16 16" fill="none" {...p}><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.3" /></svg>,
  chevR: (p) => <svg width="12" height="12" viewBox="0 0 16 16" fill="none" {...p}><path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.3" /></svg>,
  file: (p) => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}><path d="M4 1.5h5l3 3v10H4z" stroke="currentColor" strokeWidth="1.1" /><path d="M9 1.5v3h3" stroke="currentColor" strokeWidth="1.1" /></svg>,
  clip: (p) => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}><path d="M12.5 7.5l-5 5a3 3 0 0 1-4.2-4.2l5.6-5.6a2 2 0 0 1 2.8 2.8l-5.6 5.6a1 1 0 0 1-1.4-1.4l5-5" stroke="currentColor" strokeWidth="1.1" /></svg>,
  print: (p) => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}><path d="M4 6V2h8v4M4 12H2.5V6.5h11V12H12M4 9.5h8V14H4z" stroke="currentColor" strokeWidth="1.1" /></svg>,
  edit: (p) => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}><path d="M11 2.5l2.5 2.5M2.5 13.5l1-3.2 7-7 2.2 2.2-7 7z" stroke="currentColor" strokeWidth="1.1" /></svg>,
  undo: (p) => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}><path d="M5 3L2 6l3 3" stroke="currentColor" strokeWidth="1.2" /><path d="M2 6h7a4 4 0 0 1 4 4v0a4 4 0 0 1-4 4H5" stroke="currentColor" strokeWidth="1.2" /></svg>,
  trash: (p) => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}><path d="M3 4h10M6 4V2.5h4V4M4.5 4l.6 9.5h5.8L11.5 4M6.5 6.5v5M9.5 6.5v5" stroke="currentColor" strokeWidth="1.1" /></svg>,
  logout: (p) => <svg width="15" height="15" viewBox="0 0 16 16" fill="none" {...p}><path d="M10 2.5H3v11h7M7 8h7M11 5l3 3-3 3" stroke="currentColor" strokeWidth="1.2" /></svg>,
}

// ---- HR 도메인 아이콘 (HRI) ----
export const HRI: Record<string, IconFn> = {
  home: (p) => <svg width="16" height="16" viewBox="0 0 18 18" fill="none" {...p}><path d="M2.5 8L9 2.5 15.5 8M4 7v8h10V7M7.2 15v-4h3.6v4" stroke="currentColor" strokeWidth="1.2" /></svg>,
  schedule: (p) => <svg width="16" height="16" viewBox="0 0 18 18" fill="none" {...p}><rect x="2.5" y="3.5" width="13" height="12" stroke="currentColor" strokeWidth="1.2" /><path d="M2.5 7h13M6 2v3M12 2v3M5.5 10h2M10.5 10h2M5.5 12.5h2M10.5 12.5h2" stroke="currentColor" strokeWidth="1.2" /></svg>,
  clock: (p) => <svg width="16" height="16" viewBox="0 0 18 18" fill="none" {...p}><circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.2" /><path d="M9 5v4l2.6 2" stroke="currentColor" strokeWidth="1.2" /></svg>,
  leave: (p) => <svg width="16" height="16" viewBox="0 0 18 18" fill="none" {...p}><path d="M8 10L2.5 8.2l1.2-1.4 2.3.5L9.5 4 11 4.4 9.4 8l3.1.7 1.3-1.8 1.1.3-.9 3.2M5 15h8" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /></svg>,
  request: (p) => <svg width="16" height="16" viewBox="0 0 18 18" fill="none" {...p}><path d="M15.5 2.5L8 10M15.5 2.5L11 15.5 8 10 2.5 7z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /></svg>,
  report: (p) => <svg width="16" height="16" viewBox="0 0 18 18" fill="none" {...p}><path d="M2.5 2.5v13h13M5.5 12V8.5M8.5 12V5.5M11.5 12v-2M14 12V7" stroke="currentColor" strokeWidth="1.2" /></svg>,
  people: (p) => <svg width="16" height="16" viewBox="0 0 18 18" fill="none" {...p}><circle cx="6.5" cy="6" r="2.4" stroke="currentColor" strokeWidth="1.2" /><path d="M2.5 15c0-2.4 1.8-3.8 4-3.8s4 1.4 4 3.8M11.5 4.2A2.3 2.3 0 0 1 13 8.4M12.5 11.4c1.8.2 3 1.5 3 3.6" stroke="currentColor" strokeWidth="1.2" /></svg>,
  settings: (p) => <svg width="16" height="16" viewBox="0 0 18 18" fill="none" {...p}><circle cx="9" cy="9" r="2.3" stroke="currentColor" strokeWidth="1.2" /><path d="M9 1.8v2M9 14.2v2M3.1 3.1l1.4 1.4M13.5 13.5l1.4 1.4M1.8 9h2M14.2 9h2M3.1 14.9l1.4-1.4M13.5 4.5l1.4-1.4" stroke="currentColor" strokeWidth="1.2" /></svg>,
  message: (p) => <svg width="16" height="16" viewBox="0 0 18 18" fill="none" {...p}><path d="M2.5 3.5h13v9h-7l-3.5 2.5V12.5h-2.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /><path d="M5.5 7h7M5.5 9.5h4.5" stroke="currentColor" strokeWidth="1.1" /></svg>,
  approval: (p) => <svg width="16" height="16" viewBox="0 0 18 18" fill="none" {...p}><path d="M4 2h6l4 4v10H4z" stroke="currentColor" strokeWidth="1.2" /><path d="M10 2v4h4" stroke="currentColor" strokeWidth="1.1" /><path d="M6.2 11l1.6 1.6L11.5 9" stroke="currentColor" strokeWidth="1.3" /></svg>,
  aline: (p) => <svg width="16" height="16" viewBox="0 0 18 18" fill="none" {...p}><circle cx="4" cy="9" r="2" stroke="currentColor" strokeWidth="1.2" /><circle cx="14" cy="9" r="2" stroke="currentColor" strokeWidth="1.2" /><path d="M6 9h6M10 7l2 2-2 2" stroke="currentColor" strokeWidth="1.2" /></svg>,
  contract: (p) => <svg width="16" height="16" viewBox="0 0 18 18" fill="none" {...p}><path d="M4 2h6l4 4v10H4z" stroke="currentColor" strokeWidth="1.2" /><path d="M10 2v4h4M6 9h6M6 11.5h6M6 14h3.5" stroke="currentColor" strokeWidth="1.1" /></svg>,
  backup: (p) => <svg width="16" height="16" viewBox="0 0 18 18" fill="none" {...p}><ellipse cx="9" cy="4.5" rx="5.5" ry="2" stroke="currentColor" strokeWidth="1.2" /><path d="M3.5 4.5v9c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2v-9M3.5 9c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2" stroke="currentColor" strokeWidth="1.2" /></svg>,
  filter: (p) => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}><path d="M2 3h12l-4.5 5.5V13l-3 1.5V8.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /></svg>,
  check: (p) => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}><path d="M3 8.5l3.5 3.5L13 4" stroke="currentColor" strokeWidth="1.4" /></svg>,
  up: (p) => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}><path d="M8 14V5M4 9l4-4 4 4M3 2h10" stroke="currentColor" strokeWidth="1.2" /></svg>,
  dots: (p) => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}><circle cx="3" cy="8" r="1.2" fill="currentColor" /><circle cx="8" cy="8" r="1.2" fill="currentColor" /><circle cx="13" cy="8" r="1.2" fill="currentColor" /></svg>,
  pin: (p) => <svg width="13" height="13" viewBox="0 0 16 16" fill="none" {...p}><path d="M8 14.5s5-4.5 5-8a5 5 0 1 0-10 0c0 3.5 5 8 5 8z" stroke="currentColor" strokeWidth="1.1" /><circle cx="8" cy="6.5" r="1.7" stroke="currentColor" strokeWidth="1.1" /></svg>,
  profile: (p) => <svg width="16" height="16" viewBox="0 0 18 18" fill="none" {...p}><circle cx="9" cy="6" r="3" stroke="currentColor" strokeWidth="1.2" /><path d="M3 16c0-3.3 2.7-5 6-5s6 1.7 6 5" stroke="currentColor" strokeWidth="1.2" /></svg>,
  alert: (p) => <svg width="16" height="16" viewBox="0 0 18 18" fill="none" {...p}><path d="M9 2.4 16.2 15H1.8z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /><path d="M9 7v3.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /><circle cx="9" cy="12.6" r="0.75" fill="currentColor" /></svg>,
}
