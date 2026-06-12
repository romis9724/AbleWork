import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import InboxIcon from '@mui/icons-material/Inbox'
import type { ReactNode } from 'react'

interface Props {
  message?: string
  action?: ReactNode
}

export default function EmptyState({ message = '데이터가 없습니다.', action }: Props) {
  return (
    <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
      <InboxIcon sx={{ fontSize: 48, mb: 1, opacity: 0.4 }} />
      <Typography variant="body1">{message}</Typography>
      {action && <Box sx={{ mt: 2 }}>{action}</Box>}
    </Box>
  )
}
