import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import type { ReactNode } from 'react'

interface Props {
  title: string
  subtitle?: string
  actions?: ReactNode
  /** 지정 시 제목 앞에 뒤로가기 버튼을 표시한다 (상세/작성 화면 공통 헤더용) */
  onBack?: () => void
  /** 제목 옆에 표시할 요소 (상태 칩 등) */
  titleAdornment?: ReactNode
}

export default function PageHeader({ title, subtitle, actions, onBack, titleAdornment }: Props) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, mb: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, minWidth: 0 }}>
        {onBack && (
          <IconButton onClick={onBack} size="small" edge="start" aria-label="뒤로" sx={{ mt: 0.25 }}>
            <ArrowBackIcon />
          </IconButton>
        )}
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="h5" fontWeight={700}>{title}</Typography>
            {titleAdornment}
          </Box>
          {subtitle && <Typography variant="body2" color="text.secondary" mt={0.5}>{subtitle}</Typography>}
        </Box>
      </Box>
      {actions && <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>{actions}</Box>}
    </Box>
  )
}
