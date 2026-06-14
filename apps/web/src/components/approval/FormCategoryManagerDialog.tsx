'use client'
import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import {
  useFormCategories,
  useCreateFormCategory,
  useDeleteFormCategory,
} from '@/lib/query/documents'
import { getApiErrorMessage } from '@/lib/api-error'

interface Props {
  open: boolean
  onClose: () => void
  onResult: (message: string, severity: 'success' | 'error') => void
}

/** AP-01 양식함(분류) 관리 — 목록 + 추가 + 삭제(사용 중이면 서버가 차단) */
export default function FormCategoryManagerDialog({ open, onClose, onResult }: Props) {
  const { data: categories = [] } = useFormCategories()
  const create = useCreateFormCategory()
  const remove = useDeleteFormCategory()
  const [name, setName] = useState('')

  const handleAdd = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    create.mutate(
      { name: trimmed, sortOrder: categories.length },
      {
        onSuccess: () => {
          setName('')
          onResult('분류를 추가했습니다.', 'success')
        },
        onError: (err) => onResult(getApiErrorMessage(err, '분류 추가에 실패했습니다.'), 'error'),
      },
    )
  }

  const handleDelete = (id: string) => {
    remove.mutate(id, {
      onSuccess: () => onResult('분류를 삭제했습니다.', 'success'),
      onError: (err) => onResult(getApiErrorMessage(err, '분류 삭제에 실패했습니다.'), 'error'),
    })
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>양식함(분류) 관리</DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
          <TextField
            size="small"
            fullWidth
            label="새 분류명"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd()
            }}
          />
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleAdd}
            disabled={create.isPending || !name.trim()}
          >
            추가
          </Button>
        </Box>

        {categories.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
            등록된 분류가 없습니다.
          </Typography>
        ) : (
          <List dense disablePadding sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
            {categories.map((c) => (
              <ListItem
                key={c.id}
                divider
                secondaryAction={
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => handleDelete(c.id)}
                    disabled={remove.isPending}
                    aria-label="삭제"
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                }
              >
                <ListItemText primary={c.name} />
              </ListItem>
            ))}
          </List>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          사용 중인 분류는 삭제할 수 없습니다.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>닫기</Button>
      </DialogActions>
    </Dialog>
  )
}
