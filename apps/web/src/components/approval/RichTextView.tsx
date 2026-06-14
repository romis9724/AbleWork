'use client'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { sanitizeHtml, looksLikeHtml } from '@/lib/sanitize-html'

interface Props {
  /** 저장된 본문 (리치텍스트 HTML 또는 레거시 평문) */
  html?: string | null
  emptyText?: string
}

/** 기안 본문 읽기 전용 렌더 — HTML이면 sanitize 후 표시, 평문이면 줄바꿈 보존 */
export default function RichTextView({ html, emptyText = '내용이 없습니다.' }: Props) {
  if (!html) {
    return (
      <Typography variant="body2" color="text.secondary">
        {emptyText}
      </Typography>
    )
  }

  // 레거시 평문(태그 없음)은 pre-wrap으로, 리치텍스트 HTML은 sanitize 후 dangerouslySetInnerHTML
  if (!looksLikeHtml(html)) {
    return <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{html}</Typography>
  }

  return (
    <Box
      sx={{
        fontSize: 14,
        lineHeight: 1.6,
        '& table': { borderCollapse: 'collapse', width: '100%' },
        '& td, & th': { border: '1px solid', borderColor: 'divider', p: 0.5 },
        '& ul, & ol': { pl: 3 },
        '& a': { color: 'primary.main' },
        '& img': { maxWidth: '100%' },
      }}
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
    />
  )
}
