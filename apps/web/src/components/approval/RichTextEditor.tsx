'use client'
import { useEffect, useRef } from 'react'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import ToggleButton from '@mui/material/ToggleButton'
import Tooltip from '@mui/material/Tooltip'
import FormatBoldIcon from '@mui/icons-material/FormatBold'
import FormatItalicIcon from '@mui/icons-material/FormatItalic'
import FormatUnderlinedIcon from '@mui/icons-material/FormatUnderlined'
import StrikethroughSIcon from '@mui/icons-material/StrikethroughS'
import FormatAlignLeftIcon from '@mui/icons-material/FormatAlignLeft'
import FormatAlignCenterIcon from '@mui/icons-material/FormatAlignCenter'
import FormatAlignRightIcon from '@mui/icons-material/FormatAlignRight'
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted'
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered'
import LinkIcon from '@mui/icons-material/Link'
import TableChartIcon from '@mui/icons-material/TableChart'

interface Props {
  value: string
  onChange: (html: string) => void
  disabled?: boolean
  minHeight?: number
  placeholder?: string
}

/** execCommand 래퍼 — 명령 실행 후 onChange로 현재 HTML 반영 */
function exec(cmd: string, arg?: string) {
  document.execCommand(cmd, false, arg)
}

const BASIC_TABLE_HTML =
  '<table style="border-collapse:collapse;width:100%"><tbody>' +
  Array.from({ length: 2 })
    .map(
      () =>
        '<tr>' +
        Array.from({ length: 2 })
          .map(() => '<td style="border:1px solid #ccc;padding:4px;min-width:40px">&nbsp;</td>')
          .join('') +
        '</tr>',
    )
    .join('') +
  '</tbody></table><p><br/></p>'

/**
 * 경량 리치텍스트 에디터 (의존성 없이 contentEditable + execCommand).
 * 카카오워크 기안 본문 에디터 정합: 단락 스타일/B·I·U·S/정렬/목록/링크/표 삽입.
 * 값은 HTML 문자열. 렌더 시 반드시 DOMPurify로 sanitize 후 표시할 것.
 */
export default function RichTextEditor({ value, onChange, disabled, minHeight = 220, placeholder }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const focusedRef = useRef(false)

  // 외부 value 변경(예: 임시저장 문서 로드) 시에만 DOM 갱신 — 입력 중(포커스)에는 커서 점프 방지
  useEffect(() => {
    const el = ref.current
    if (el && !focusedRef.current && value !== el.innerHTML) {
      el.innerHTML = value || ''
    }
  }, [value])

  const emit = () => {
    if (ref.current) onChange(ref.current.innerHTML)
  }

  const run = (cmd: string, arg?: string) => {
    if (disabled) return
    ref.current?.focus()
    exec(cmd, arg)
    emit()
  }

  const insertLink = () => {
    if (disabled) return
    const url = window.prompt('링크 URL을 입력하세요', 'https://')
    if (url) run('createLink', url)
  }

  const insertTable = () => {
    if (disabled) return
    ref.current?.focus()
    exec('insertHTML', BASIC_TABLE_HTML)
    emit()
  }

  const btnSx = { border: 'none', p: 0.5, '&.MuiToggleButton-root': { borderRadius: 1 } }

  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
      {/* 툴바 */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.25,
          flexWrap: 'wrap',
          px: 1,
          py: 0.5,
          bgcolor: 'background.default',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Select
          size="small"
          variant="standard"
          defaultValue="p"
          disableUnderline
          disabled={disabled}
          onChange={(e) => run('formatBlock', e.target.value)}
          sx={{ fontSize: 13, minWidth: 72, mr: 0.5 }}
        >
          <MenuItem value="p">본문</MenuItem>
          <MenuItem value="h1">제목 1</MenuItem>
          <MenuItem value="h2">제목 2</MenuItem>
          <MenuItem value="h3">제목 3</MenuItem>
        </Select>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
        <Tooltip title="굵게"><span><ToggleButton value="bold" size="small" sx={btnSx} disabled={disabled} onClick={() => run('bold')}><FormatBoldIcon fontSize="small" /></ToggleButton></span></Tooltip>
        <Tooltip title="기울임"><span><ToggleButton value="italic" size="small" sx={btnSx} disabled={disabled} onClick={() => run('italic')}><FormatItalicIcon fontSize="small" /></ToggleButton></span></Tooltip>
        <Tooltip title="밑줄"><span><ToggleButton value="underline" size="small" sx={btnSx} disabled={disabled} onClick={() => run('underline')}><FormatUnderlinedIcon fontSize="small" /></ToggleButton></span></Tooltip>
        <Tooltip title="취소선"><span><ToggleButton value="strike" size="small" sx={btnSx} disabled={disabled} onClick={() => run('strikeThrough')}><StrikethroughSIcon fontSize="small" /></ToggleButton></span></Tooltip>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
        <Tooltip title="왼쪽 정렬"><span><ToggleButton value="left" size="small" sx={btnSx} disabled={disabled} onClick={() => run('justifyLeft')}><FormatAlignLeftIcon fontSize="small" /></ToggleButton></span></Tooltip>
        <Tooltip title="가운데 정렬"><span><ToggleButton value="center" size="small" sx={btnSx} disabled={disabled} onClick={() => run('justifyCenter')}><FormatAlignCenterIcon fontSize="small" /></ToggleButton></span></Tooltip>
        <Tooltip title="오른쪽 정렬"><span><ToggleButton value="right" size="small" sx={btnSx} disabled={disabled} onClick={() => run('justifyRight')}><FormatAlignRightIcon fontSize="small" /></ToggleButton></span></Tooltip>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
        <Tooltip title="글머리 기호"><span><ToggleButton value="ul" size="small" sx={btnSx} disabled={disabled} onClick={() => run('insertUnorderedList')}><FormatListBulletedIcon fontSize="small" /></ToggleButton></span></Tooltip>
        <Tooltip title="번호 목록"><span><ToggleButton value="ol" size="small" sx={btnSx} disabled={disabled} onClick={() => run('insertOrderedList')}><FormatListNumberedIcon fontSize="small" /></ToggleButton></span></Tooltip>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
        <Tooltip title="링크"><span><ToggleButton value="link" size="small" sx={btnSx} disabled={disabled} onClick={insertLink}><LinkIcon fontSize="small" /></ToggleButton></span></Tooltip>
        <Tooltip title="표 삽입"><span><ToggleButton value="table" size="small" sx={btnSx} disabled={disabled} onClick={insertTable}><TableChartIcon fontSize="small" /></ToggleButton></span></Tooltip>
      </Box>

      {/* 편집 영역 */}
      <Box
        ref={ref}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={emit}
        onFocus={() => {
          focusedRef.current = true
        }}
        onBlur={() => {
          focusedRef.current = false
          emit()
        }}
        data-placeholder={placeholder ?? '기안 내용을 입력하세요'}
        sx={{
          minHeight,
          p: 1.5,
          fontSize: 14,
          lineHeight: 1.6,
          outline: 'none',
          overflowY: 'auto',
          '&:empty:before': {
            content: 'attr(data-placeholder)',
            color: 'text.disabled',
          },
          '& table': { borderCollapse: 'collapse' },
          '& td, & th': { border: '1px solid #ccc', p: 0.5 },
          '& ul, & ol': { pl: 3 },
        }}
      />
    </Box>
  )
}
