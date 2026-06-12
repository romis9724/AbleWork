'use client'
import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Select from '@mui/material/Select'
import Snackbar from '@mui/material/Snackbar'
import Switch from '@mui/material/Switch'
import Tab from '@mui/material/Tab'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import SendIcon from '@mui/icons-material/Send'
import PageHeader from '@/components/common/PageHeader'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import EmptyState from '@/components/common/EmptyState'
import {
  useMessageTemplates,
  useCreateMessageTemplate,
  useUpdateMessageTemplate,
  useDeleteMessageTemplate,
  useMessageLogs,
  useSendMessage,
  type MessageTemplate,
  type MessageLog,
} from '@/lib/query/messages'
import { useEmployees, type Employee } from '@/lib/query/employees'

// ── Template form ─────────────────────────────────────────────────────────────

interface TemplateForm {
  name: string
  content: string
}

const defaultTemplateForm: TemplateForm = { name: '', content: '' }

// ── Send form ─────────────────────────────────────────────────────────────────

interface SendForm {
  name: string
  templateId: string
  recipients: Employee[]
  emailNotification: boolean
}

const defaultSendForm: SendForm = {
  name: '',
  templateId: '',
  recipients: [],
  emailNotification: false,
}

// ─────────────────────────────────────────────────────────────────────────────

export default function MessagesPage() {
  const [tab, setTab] = useState(0)

  const { data: rawTemplates, isLoading: templatesLoading } = useMessageTemplates()
  const templates: MessageTemplate[] = Array.isArray(rawTemplates)
    ? rawTemplates
    : (((rawTemplates as unknown) as { items?: MessageTemplate[] })?.items ?? [])

  const { data: logsRaw, isLoading: logsLoading } = useMessageLogs()
  const logs: MessageLog[] = Array.isArray(logsRaw)
    ? logsRaw
    : (logsRaw as { items?: MessageLog[] })?.items ?? []

  const { data: employeesData } = useEmployees({ isActive: true })
  const employees: Employee[] = employeesData?.items ?? []

  const createTemplateMutation = useCreateMessageTemplate()
  const updateTemplateMutation = useUpdateMessageTemplate()
  const deleteTemplateMutation = useDeleteMessageTemplate()
  const sendMutation = useSendMessage()

  // Template dialog
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null)
  const [templateForm, setTemplateForm] = useState<TemplateForm>(defaultTemplateForm)

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<MessageTemplate | null>(null)

  // Send form
  const [sendForm, setSendForm] = useState<SendForm>(defaultSendForm)

  // Snackbar
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  })

  function showSnack(message: string, severity: 'success' | 'error' = 'success') {
    setSnack({ open: true, message, severity })
  }

  // ── Template actions ──────────────────────────────────────────────────────

  function openAddTemplate() {
    setEditingTemplate(null)
    setTemplateForm(defaultTemplateForm)
    setTemplateDialogOpen(true)
  }

  function openEditTemplate(t: MessageTemplate) {
    setEditingTemplate(t)
    setTemplateForm({ name: t.name, content: t.content })
    setTemplateDialogOpen(true)
  }

  async function handleSaveTemplate() {
    if (!templateForm.name.trim() || !templateForm.content.trim()) return
    const hasVariables = /\{\{.+?\}\}/.test(templateForm.content)
    try {
      if (editingTemplate) {
        await updateTemplateMutation.mutateAsync({
          id: editingTemplate.id,
          name: templateForm.name.trim(),
          content: templateForm.content.trim(),
          hasVariables,
        })
        showSnack('템플릿이 수정되었습니다.')
      } else {
        await createTemplateMutation.mutateAsync({
          name: templateForm.name.trim(),
          content: templateForm.content.trim(),
        })
        showSnack('템플릿이 추가되었습니다.')
      }
      setTemplateDialogOpen(false)
    } catch {
      showSnack('저장에 실패했습니다.', 'error')
    }
  }

  async function handleDeleteTemplate() {
    if (!deleteTarget) return
    try {
      await deleteTemplateMutation.mutateAsync(deleteTarget.id)
      setDeleteTarget(null)
      showSnack('삭제되었습니다.')
    } catch {
      showSnack('삭제에 실패했습니다.', 'error')
    }
  }

  // ── Send actions ──────────────────────────────────────────────────────────

  async function handleSend() {
    if (!sendForm.name.trim() || !sendForm.templateId || sendForm.recipients.length === 0) return
    const template = templates.find((t) => t.id === sendForm.templateId)
    if (!template) return
    try {
      await sendMutation.mutateAsync({
        title: sendForm.name.trim(),
        content: template.content,
        templateId: sendForm.templateId,
        recipientEmployeeIds: sendForm.recipients.map((e) => e.id),
        sendEmail: sendForm.emailNotification,
      })
      setSendForm(defaultSendForm)
      showSnack(`메시지가 ${sendForm.recipients.length}명에게 발송되었습니다.`)
      setTab(2) // Switch to log tab
    } catch {
      showSnack('발송에 실패했습니다.', 'error')
    }
  }

  const isTemplateSaving =
    createTemplateMutation.isPending || updateTemplateMutation.isPending

  const selectedTemplate = templates.find((t) => t.id === sendForm.templateId)

  return (
    <>
      <PageHeader title="메시지 관리" />

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab label="템플릿 관리" />
        <Tab label="메시지 발송" />
        <Tab label="발송 내역" />
      </Tabs>

      {/* ── Tab 0: Templates ─────────────────────────────────────────────────── */}
      {tab === 0 && (
        <>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
            <Button variant="contained" startIcon={<AddIcon />} onClick={openAddTemplate}>
              템플릿 추가
            </Button>
          </Box>
          {templatesLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
              <CircularProgress />
            </Box>
          ) : templates.length === 0 ? (
            <EmptyState
              message="등록된 템플릿이 없습니다."
              action={
                <Button variant="outlined" startIcon={<AddIcon />} onClick={openAddTemplate}>
                  템플릿 추가
                </Button>
              }
            />
          ) : (
            <TableContainer
              component={Paper}
              elevation={0}
              sx={{ border: '1px solid', borderColor: 'divider' }}
            >
              <Table>
                <TableHead>
                  <TableRow sx={{ bgcolor: 'background.default' }}>
                    <TableCell>이름</TableCell>
                    <TableCell>내용 미리보기</TableCell>
                    <TableCell>변수</TableCell>
                    <TableCell align="right">액션</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {templates.map((t) => (
                    <TableRow key={t.id} hover>
                      <TableCell sx={{ fontWeight: 600 }}>{t.name}</TableCell>
                      <TableCell sx={{ color: 'text.secondary', maxWidth: 320 }}>
                        <Typography variant="body2" noWrap>
                          {t.content.slice(0, 50)}
                          {t.content.length > 50 ? '…' : ''}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {t.hasVariables ? (
                          <Chip label="변수 포함" size="small" color="info" variant="outlined" />
                        ) : (
                          <Chip label="없음" size="small" variant="outlined" />
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <IconButton size="small" onClick={() => openEditTemplate(t)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => setDeleteTarget(t)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}

      {/* ── Tab 1: Send ───────────────────────────────────────────────────────── */}
      {tab === 1 && (
        <Paper
          elevation={0}
          sx={{ border: '1px solid', borderColor: 'divider', p: 3, borderRadius: 2, maxWidth: 600 }}
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <TextField
              label="메시지명"
              required
              value={sendForm.name}
              onChange={(e) => setSendForm((f) => ({ ...f, name: e.target.value }))}
              fullWidth
            />

            <FormControl fullWidth required>
              <InputLabel>템플릿 선택</InputLabel>
              <Select
                value={sendForm.templateId}
                label="템플릿 선택"
                onChange={(e) => setSendForm((f) => ({ ...f, templateId: e.target.value }))}
              >
                {templates.map((t) => (
                  <MenuItem key={t.id} value={t.id}>
                    {t.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {selectedTemplate && (
              <Box
                sx={{
                  bgcolor: 'background.default',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  p: 1.5,
                }}
              >
                <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                  템플릿 미리보기
                </Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                  {selectedTemplate.content}
                </Typography>
              </Box>
            )}

            <Autocomplete
              multiple
              options={employees}
              getOptionLabel={(e) => e.name}
              value={sendForm.recipients}
              onChange={(_, v) => setSendForm((f) => ({ ...f, recipients: v }))}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="수신자 선택 (다중)"
                  required
                  helperText={`${sendForm.recipients.length}명 선택됨`}
                />
              )}
            />

            <FormControlLabel
              control={
                <Switch
                  checked={sendForm.emailNotification}
                  onChange={(e) =>
                    setSendForm((f) => ({ ...f, emailNotification: e.target.checked }))
                  }
                />
              }
              label="이메일 알림 발송"
            />

            <Box>
              <Button
                variant="contained"
                startIcon={
                  sendMutation.isPending ? (
                    <CircularProgress size={16} color="inherit" />
                  ) : (
                    <SendIcon />
                  )
                }
                onClick={handleSend}
                disabled={
                  sendMutation.isPending ||
                  !sendForm.name.trim() ||
                  !sendForm.templateId ||
                  sendForm.recipients.length === 0
                }
              >
                발송하기
              </Button>
            </Box>
          </Box>
        </Paper>
      )}

      {/* ── Tab 2: Logs ───────────────────────────────────────────────────────── */}
      {tab === 2 && (
        <>
          {logsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
              <CircularProgress />
            </Box>
          ) : logs.length === 0 ? (
            <EmptyState message="발송 내역이 없습니다." />
          ) : (
            <TableContainer
              component={Paper}
              elevation={0}
              sx={{ border: '1px solid', borderColor: 'divider' }}
            >
              <Table>
                <TableHead>
                  <TableRow sx={{ bgcolor: 'background.default' }}>
                    <TableCell>발송일</TableCell>
                    <TableCell>제목</TableCell>
                    <TableCell align="right">수신자수</TableCell>
                    <TableCell align="right">읽음수</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id} hover>
                      <TableCell sx={{ color: 'text.secondary' }}>
                        {new Date(log.sentAt ?? log.createdAt).toLocaleString('ko-KR')}
                      </TableCell>
                      <TableCell sx={{ fontWeight: 500 }}>{log.title ?? '—'}</TableCell>
                      <TableCell align="right">{log.recipientCount}명</TableCell>
                      <TableCell align="right">
                        <Chip
                          label={`${log.readCount} / ${log.recipientCount}`}
                          size="small"
                          color={log.readCount === log.recipientCount ? 'success' : 'default'}
                          variant="outlined"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}

      {/* ── Template Dialog ───────────────────────────────────────────────────── */}
      <Dialog
        open={templateDialogOpen}
        onClose={() => setTemplateDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{editingTemplate ? '템플릿 수정' : '템플릿 추가'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField
            label="이름"
            required
            value={templateForm.name}
            onChange={(e) => setTemplateForm((f) => ({ ...f, name: e.target.value }))}
            fullWidth
          />
          <TextField
            label="내용"
            required
            multiline
            rows={5}
            value={templateForm.content}
            onChange={(e) => setTemplateForm((f) => ({ ...f, content: e.target.value }))}
            fullWidth
            helperText="변수는 {{변수명}} 형식으로 입력하세요. 예: {{직원명}}, {{날짜}}"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTemplateDialogOpen(false)}>취소</Button>
          <Button
            variant="contained"
            onClick={handleSaveTemplate}
            disabled={
              isTemplateSaving ||
              !templateForm.name.trim() ||
              !templateForm.content.trim()
            }
          >
            {editingTemplate ? '수정' : '추가'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Delete Confirm ─────────────────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="템플릿 삭제"
        message={`"${deleteTarget?.name}" 템플릿을 삭제하시겠습니까?`}
        confirmLabel="삭제"
        confirmColor="error"
        loading={deleteTemplateMutation.isPending}
        onConfirm={handleDeleteTemplate}
        onCancel={() => setDeleteTarget(null)}
      />

      <Snackbar
        open={snack.open}
        autoHideDuration={3000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snack.severity}
          variant="filled"
          onClose={() => setSnack((s) => ({ ...s, open: false }))}
        >
          {snack.message}
        </Alert>
      </Snackbar>
    </>
  )
}
