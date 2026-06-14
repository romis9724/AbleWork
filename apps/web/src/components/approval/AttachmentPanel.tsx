'use client'
import { useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import Link from '@mui/material/Link'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import Typography from '@mui/material/Typography'
import AttachFileIcon from '@mui/icons-material/AttachFile'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import DownloadIcon from '@mui/icons-material/Download'
import {
  useDocumentAttachments,
  useUploadAttachment,
  useDeleteAttachment,
  downloadAttachment,
} from '@/lib/query/documents'
import { getApiErrorMessage } from '@/lib/api-error'

interface Props {
  documentId: string
  /** true면 업로드/삭제 가능(기안 작성·수정), false면 목록/다운로드만(상세 열람) */
  editable?: boolean
  /** 양식의 ZIP 허용 여부 — 안내 문구용 */
  allowZipUpload?: boolean
  onError?: (message: string) => void
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function AttachmentPanel({ documentId, editable = false, allowZipUpload, onError }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const { data: attachments, isLoading } = useDocumentAttachments(documentId)
  const upload = useUploadAttachment(documentId)
  const remove = useDeleteAttachment(documentId)

  function reportError(err: unknown, fallback: string) {
    onError?.(getApiErrorMessage(err, fallback))
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return
    // 여러 파일을 순차 업로드 (개수 한도는 서버가 검증)
    for (const file of Array.from(files)) {
      try {
        await upload.mutateAsync(file)
      } catch (err) {
        reportError(err, `'${file.name}' 업로드에 실패했습니다.`)
        break
      }
    }
  }

  async function handleDownload(id: string, fileName: string) {
    setBusyId(id)
    try {
      await downloadAttachment(documentId, id, fileName)
    } catch (err) {
      reportError(err, '다운로드에 실패했습니다.')
    } finally {
      setBusyId(null)
    }
  }

  function handleRemove(id: string) {
    remove.mutate(id, { onError: (err) => reportError(err, '첨부 삭제에 실패했습니다.') })
  }

  const items = attachments ?? []

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <AttachFileIcon fontSize="small" /> 첨부파일 {items.length > 0 && `(${items.length})`}
      </Typography>

      {editable && (
        <Box
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            handleFiles(e.dataTransfer.files)
          }}
          onClick={() => inputRef.current?.click()}
          sx={{
            border: '1.5px dashed',
            borderColor: dragOver ? 'primary.main' : 'divider',
            bgcolor: dragOver ? 'action.hover' : 'transparent',
            borderRadius: 1.5,
            p: 2,
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 150ms',
            mb: 1.5,
          }}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              handleFiles(e.target.files)
              e.target.value = ''
            }}
          />
          {upload.isPending ? (
            <CircularProgress size={20} />
          ) : (
            <>
              <Typography variant="body2" color="text.secondary">
                파일을 끌어다 놓거나 클릭하여 첨부 (최대 20MB · 문서당 10개)
              </Typography>
              {allowZipUpload === false && (
                <Typography variant="caption" color="text.disabled">
                  이 양식은 압축파일(zip) 첨부를 허용하지 않습니다.
                </Typography>
              )}
            </>
          )}
        </Box>
      )}

      {isLoading ? (
        <CircularProgress size={18} />
      ) : items.length === 0 ? (
        !editable && (
          <Typography variant="body2" color="text.secondary">
            첨부파일이 없습니다.
          </Typography>
        )
      ) : (
        <List dense disablePadding sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
          {items.map((att) => (
            <ListItem
              key={att.id}
              divider
              secondaryAction={
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  <IconButton
                    size="small"
                    onClick={() => handleDownload(att.id, att.fileName)}
                    disabled={busyId === att.id}
                    aria-label="다운로드"
                  >
                    {busyId === att.id ? <CircularProgress size={16} /> : <DownloadIcon fontSize="small" />}
                  </IconButton>
                  {editable && (
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleRemove(att.id)}
                      disabled={remove.isPending}
                      aria-label="삭제"
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  )}
                </Box>
              }
            >
              <ListItemText
                primary={
                  <Link
                    component="button"
                    type="button"
                    underline="hover"
                    onClick={() => handleDownload(att.id, att.fileName)}
                    sx={{ textAlign: 'left' }}
                  >
                    {att.fileName}
                  </Link>
                }
                secondary={`${formatSize(att.size)}${att.uploader ? ` · ${att.uploader.name}` : ''}`}
              />
            </ListItem>
          ))}
        </List>
      )}
    </Box>
  )
}
