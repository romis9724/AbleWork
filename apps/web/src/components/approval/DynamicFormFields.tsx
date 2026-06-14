'use client'
import Box from '@mui/material/Box'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import { DocumentFieldType, type DocumentFieldDef } from '@ablework/shared-constants'

interface Props {
  fields: DocumentFieldDef[]
  values: Record<string, unknown>
  onChange: (key: string, value: unknown) => void
  disabled?: boolean
}

const toStr = (v: unknown): string => (v === undefined || v === null ? '' : String(v))

/** 기안 작성 시 양식 fieldsSchema 기반 동적 입력 렌더러 (AP-01-02 → AP-02-01) */
export default function DynamicFormFields({ fields, values, onChange, disabled }: Props) {
  if (fields.length === 0) return null

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {fields.map((f) => {
        const common = {
          label: f.label,
          required: f.required,
          fullWidth: true,
          disabled,
          value: toStr(values[f.key]),
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(f.key, e.target.value),
        }
        switch (f.type) {
          case DocumentFieldType.TEXTAREA:
            return <TextField key={f.key} {...common} multiline rows={3} placeholder={f.placeholder} />
          case DocumentFieldType.NUMBER:
            return <TextField key={f.key} {...common} type="number" placeholder={f.placeholder} />
          case DocumentFieldType.DATE:
            return <TextField key={f.key} {...common} type="date" InputLabelProps={{ shrink: true }} />
          case DocumentFieldType.SELECT:
            return (
              <TextField key={f.key} {...common} select>
                {(f.options ?? []).map((o) => (
                  <MenuItem key={o} value={o}>{o}</MenuItem>
                ))}
              </TextField>
            )
          default:
            return <TextField key={f.key} {...common} placeholder={f.placeholder} />
        }
      })}
    </Box>
  )
}
