'use client'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { DocumentFieldType, type DocumentFieldDef } from '@ablework/shared-constants'
import RichTextEditor from './RichTextEditor'

interface Props {
  fields: DocumentFieldDef[]
  values: Record<string, unknown>
  onChange: (key: string, value: unknown) => void
  disabled?: boolean
}

const toStr = (v: unknown): string => (v === undefined || v === null ? '' : String(v))

/** table 필드 값은 string[][] (행 × 열) */
function asRows(v: unknown): string[][] {
  return Array.isArray(v) ? (v as string[][]).filter(Array.isArray) : []
}

/** 표 입력 필드 — 양식이 정의한 columns 헤더 + 행 추가/삭제 */
function TableField({
  field,
  rows,
  onChange,
  disabled,
}: {
  field: DocumentFieldDef
  rows: string[][]
  onChange: (rows: string[][]) => void
  disabled?: boolean
}) {
  const columns = field.columns?.length ? field.columns : ['항목', '내용']
  const addRow = () => onChange([...rows, columns.map(() => '')])
  const removeRow = (ri: number) => onChange(rows.filter((_, i) => i !== ri))
  const setCell = (ri: number, ci: number, val: string) =>
    onChange(rows.map((r, i) => (i === ri ? r.map((c, j) => (j === ci ? val : c)) : r)))

  return (
    <Box>
      <Typography variant="body2" sx={{ mb: 0.5, fontWeight: 600 }}>
        {field.label}{field.required && ' *'}
      </Typography>
      <Table size="small" sx={{ border: '1px solid', borderColor: 'divider' }}>
        <TableHead>
          <TableRow sx={{ bgcolor: 'background.default' }}>
            {columns.map((c, i) => (
              <TableCell key={i}>{c}</TableCell>
            ))}
            <TableCell padding="checkbox" />
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row, ri) => (
            <TableRow key={ri}>
              {columns.map((_, ci) => (
                <TableCell key={ci} sx={{ p: 0.5 }}>
                  <TextField
                    size="small"
                    fullWidth
                    variant="standard"
                    disabled={disabled}
                    value={row[ci] ?? ''}
                    onChange={(e) => setCell(ri, ci, e.target.value)}
                  />
                </TableCell>
              ))}
              <TableCell padding="checkbox">
                <IconButton size="small" onClick={() => removeRow(ri)} disabled={disabled} aria-label="행 삭제">
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Button size="small" startIcon={<AddIcon />} onClick={addRow} disabled={disabled} sx={{ mt: 0.5 }}>
        행 추가
      </Button>
    </Box>
  )
}

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
          case DocumentFieldType.RICHTEXT:
            return (
              <Box key={f.key}>
                <Typography variant="body2" sx={{ mb: 0.5, fontWeight: 600 }}>
                  {f.label}{f.required && ' *'}
                </Typography>
                <RichTextEditor
                  value={toStr(values[f.key])}
                  onChange={(html) => onChange(f.key, html)}
                  disabled={disabled}
                  minHeight={160}
                  placeholder={f.placeholder}
                />
              </Box>
            )
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
          case DocumentFieldType.TABLE:
            return (
              <TableField
                key={f.key}
                field={f}
                rows={asRows(values[f.key])}
                onChange={(rows) => onChange(f.key, rows)}
                disabled={disabled}
              />
            )
          default:
            return <TextField key={f.key} {...common} placeholder={f.placeholder} />
        }
      })}
    </Box>
  )
}
