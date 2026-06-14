import DOMPurify from 'dompurify'

/**
 * 저장된 리치텍스트 HTML을 안전하게 정화한다 (XSS 방지).
 * 클라이언트에서만 동작 — SSR(window 없음)에서는 빈 문자열 반환(다이얼로그 본문은 클라이언트 렌더).
 */
export function sanitizeHtml(html?: string | null): string {
  if (!html) return ''
  if (typeof window === 'undefined') return ''
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target', 'rel'],
  })
}

/** 리치텍스트 HTML 여부 추정 — 태그 포함 시 true (레거시 평문과 구분) */
export function looksLikeHtml(value?: string | null): boolean {
  return !!value && /<\/?[a-z][\s\S]*>/i.test(value)
}
