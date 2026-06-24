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
  useDocumentCategories,
  useCreateDocumentCategory,
  useDeleteDocumentCategory,
} from '@/lib/query/documents'
import { getApiErrorMessage } from '@/lib/api-error'

interface Props {
  open: boolean
  onClose: () => void
  onResult: (message: string, severity: 'success' | 'error') => void
}

/**
 * AP 문서성격(채번 대분류) 관리 — 사업관리/일반관리/인사관리/LABL CHINA 등.
 * 목록 + 추가(이름·약어) + 삭제(사용 중이면 서버가 차단). 약어는 문서번호 {CATEGORY} 토큰에 쓰인다.
 */
export default function DocumentCategoryManagerDialog({ open, onClose, onResult }: Props) {
  const { data: categories = [] } = useDocumentCategories()
  const create = useCreateDocumentCategory()
  const remove = useDeleteDocumentCategory()
  const [name, setName] = useState('')
  const [abbr, setAbbr] = useState('')

  const handleAdd = () => {
    const n = name.trim()
    const a = abbr.trim()
    if (!n || !a) return
    create.mutate(
      { name: n, abbreviation: a, sortOrder: categories.length },
      {
        onSuccess: () => {
          setName('')
          setAbbr('')
          onResult('문서성격을 추가했습니다.', 'success')
        },
        onError: (err) => onResult(getApiErrorMessage(err, '문서성격 추가에 실패했습니다.'), 'error'),
      },
    )
  }

  const handleDelete = (id: string) => {
    remove.mutate(id, {
      onSuccess: () => onResult('문서성격을 삭제했습니다.', 'success'),
      onError: (err) => onResult(getApiErrorMessage(err, '문서성격 삭제에 실패했습니다.'), 'error'),
    })
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>문서성격 관리</DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
          <TextField
            size="small"
            sx={{ flex: 1 }}
            label="문서성격명"
            placeholder="예: 사업관리"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd()
            }}
          />
          <TextField
            size="small"
            sx={{ width: 110 }}
            label="약어"
            placeholder="예: 사업"
            value={abbr}
            onChange={(e) => setAbbr(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd()
            }}
          />
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleAdd}
            disabled={create.isPending || !name.trim() || !abbr.trim()}
          >
            추가
          </Button>
        </Box>

        {categories.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
            등록된 문서성격이 없습니다.
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
                <ListItemText primary={c.name} secondary={`약어: ${c.abbreviation}`} />
              </ListItem>
            ))}
          </List>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          약어는 문서번호 패턴의 {'{CATEGORY}'} 토큰에 사용됩니다. 사용 중인 문서성격은 삭제할 수 없습니다.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>닫기</Button>
      </DialogActions>
    </Dialog>
  )
}
