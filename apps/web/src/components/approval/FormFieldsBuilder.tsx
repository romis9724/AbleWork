'use client'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import {
  DOCUMENT_FIELD_TYPE_LABEL,
  DocumentFieldType,
  type DocumentFieldDef,
} from '@ablework/shared-constants'

interface Props {
  fields: DocumentFieldDef[]
  onChange: (fields: DocumentFieldDef[]) => void
  disabled?: boolean
}

const TYPE_OPTIONS = Object.values(DocumentFieldType)

/** 기존 키와 충돌하지 않는 새 필드 키를 생성한다(field_1, field_2, …). */
function genKey(existing: DocumentFieldDef[]): string {
  const keys = new Set(existing.map((f) => f.key))
  let n = existing.length + 1
  while (keys.has(`field_${n}`)) n++
  return `field_${n}`
}

/** 기안양식 동적 필드 설계기 (AP-01-02) — 양식 관리 다이얼로그에서 사용 */
export default function FormFieldsBuilder({ fields, onChange, disabled }: Props) {
  const update = (idx: number, patch: Partial<DocumentFieldDef>) =>
    onChange(fields.map((f, i) => (i === idx ? { ...f, ...patch } : f)))
  const remove = (idx: number) => onChange(fields.filter((_, i) => i !== idx))
  const add = () =>
    onChange([...fields, { key: genKey(fields), label: '', type: DocumentFieldType.TEXT, required: false }])

  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={700} mb={0.5}>
        입력 필드 설계
      </Typography>
      <Typography variant="caption" color="text.secondary" display="block" mb={1.5}>
        기안 작성 시 이 양식으로 입력받을 항목을 정의합니다. 비워두면 작성 시 ‘내용’만 입력합니다.
      </Typography>

      {fields.map((f, idx) => (
        <Box
          key={f.key}
          sx={{
            display: 'flex',
            gap: 1,
            alignItems: 'flex-start',
            mb: 1,
            flexWrap: 'wrap',
          }}
        >
          <TextField
            label="필드명"
            size="small"
            required
            value={f.label}
            onChange={(e) => update(idx, { label: e.target.value })}
            disabled={disabled}
            sx={{ flexGrow: 1, minWidth: 140 }}
          />
          <TextField
            select
            label="유형"
            size="small"
            value={f.type}
            onChange={(e) => {
              const nextType = e.target.value as DocumentFieldDef['type']
              update(idx, {
                type: nextType,
                // 유형 전환 시 무관한 설정 제거
                ...(nextType === DocumentFieldType.SELECT ? {} : { options: undefined }),
                ...(nextType === DocumentFieldType.TABLE ? {} : { columns: undefined }),
              })
            }}
            disabled={disabled}
            sx={{ width: 130 }}
          >
            {TYPE_OPTIONS.map((t) => (
              <MenuItem key={t} value={t}>
                {DOCUMENT_FIELD_TYPE_LABEL[t]}
              </MenuItem>
            ))}
          </TextField>
          {f.type === DocumentFieldType.SELECT && (
            <TextField
              label="옵션 (쉼표 구분)"
              size="small"
              value={(f.options ?? []).join(', ')}
              onChange={(e) =>
                update(idx, {
                  options: e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              disabled={disabled}
              sx={{ flexBasis: '100%' }}
            />
          )}
          {f.type === DocumentFieldType.TABLE && (
            <TextField
              label="표 열 (쉼표 구분)"
              size="small"
              placeholder="예: 항목, 수량, 금액"
              value={(f.columns ?? []).join(', ')}
              onChange={(e) =>
                update(idx, {
                  columns: e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              disabled={disabled}
              sx={{ flexBasis: '100%' }}
            />
          )}
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={f.required}
                onChange={(e) => update(idx, { required: e.target.checked })}
                disabled={disabled}
              />
            }
            label="필수"
            sx={{ mr: 0 }}
          />
          <IconButton
            aria-label="필드 삭제"
            size="small"
            color="error"
            onClick={() => remove(idx)}
            disabled={disabled}
          >
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Box>
      ))}

      <Button size="small" startIcon={<AddIcon />} onClick={add} disabled={disabled} sx={{ mt: 0.5 }}>
        필드 추가
      </Button>
    </Box>
  )
}
