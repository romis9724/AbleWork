/**
 * AB 전자결재 — 기안양식 관리 (핸드오프 screens2.jsx Forms 네이티브 재구축).
 * .split 2-pane: 좌 양식함(분류) + 우 검색/목록(.tbl). 행 클릭/추가는 FormModalNative.
 * 핸드오프엔 없는 보조기능 보존: 양식 접근규칙(FormAccessRulesPanel)·문서번호 채번(useDocumentNumberRule)을
 * 관리 아이콘의 보조 액션(접근규칙/채번 버튼)으로 유지(다크 MUI 다이얼로그로 마운트). 분류 관리는 FormCategoryManagerDialog.
 */
'use client'
import { useEffect, useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { PageHead } from '@/components/ab/Page'
import { Badge, TextInput, TableEmpty } from '@/components/ab/atoms'
import { ConfirmDialog } from '@/components/ab/Modal'
import { I } from '@/components/ab/icons'
import { useToast } from '@/components/ab/Toast'
import FormModalNative from '@/components/approval/FormModalNative'
import FormCategoryManagerDialog from '@/components/approval/FormCategoryManagerDialog'
import FormAccessRulesPanel from '@/components/approval/FormAccessRulesPanel'
import { getApiErrorMessage } from '@/lib/api-error'
import {
  useDocumentForms,
  useDeleteDocumentForm,
  useDocumentNumberRule,
  useSaveDocumentNumberRule,
  useFormCategories,
  type DocumentForm,
} from '@/lib/query/documents'

const DEFAULT_PATTERN = 'HR-{YYYY}-{SEQ:4}'
const ALL_CATEGORY = '__all__'

/** 문서번호 패턴 미리보기 — {YYYY},{MM},{ABBR},{SEQ:n} 토큰 치환 */
function previewNumber(pattern: string, abbr = ''): string {
  const now = new Date()
  return pattern
    .replace(/\{YYYY\}/g, String(now.getFullYear()))
    .replace(/\{MM\}/g, String(now.getMonth() + 1).padStart(2, '0'))
    .replace(/\{ABBR\}/g, abbr)
    .replace(/\{SEQ:(\d+)\}/g, (_m, digits: string) => '1'.padStart(Number(digits), '0'))
}

const retainLabel = (y?: number | null) =>
  y == null ? '—' : y === 0 ? '영구 보존' : `${y}년 보존`

const VISIBILITY_LABEL: Record<string, string> = {
  PUBLIC: '전체공개',
  DEPARTMENT: '부서공개',
  PRIVATE: '비공개',
}

/** 문서번호 채번 규칙 다이얼로그 (보조기능 보존, 다크 MUI) */
function NumberRuleDialog({
  form,
  onClose,
  onSuccess,
}: {
  form: DocumentForm
  onClose: () => void
  onSuccess: (message: string) => void
}) {
  const { data: rule, isLoading } = useDocumentNumberRule(form.id)
  const saveMutation = useSaveDocumentNumberRule()
  const [pattern, setPattern] = useState(DEFAULT_PATTERN)
  const [resetYearly, setResetYearly] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    if (isLoading || initialized) return
    if (rule) {
      setPattern(rule.pattern || DEFAULT_PATTERN)
      setResetYearly(rule.resetYearly)
    }
    setInitialized(true)
  }, [rule, isLoading, initialized])

  const handleSave = async () => {
    setErrorMessage('')
    if (!pattern.includes('{SEQ:')) {
      setErrorMessage('패턴에 {SEQ:n} 토큰이 필요합니다. 예: HR-{YYYY}-{SEQ:4}')
      return
    }
    try {
      await saveMutation.mutateAsync({ formId: form.id, pattern, resetYearly })
      onSuccess('문서번호 규칙이 저장되었습니다.')
      onClose()
    } catch {
      setErrorMessage('저장 중 오류가 발생했습니다.')
    }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>문서번호 채번 — {form.name}</DialogTitle>
      <DialogContent dividers>
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 0.5 }}>
            {errorMessage && <Alert severity="error">{errorMessage}</Alert>}
            <TextField
              label="패턴"
              fullWidth
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              helperText="사용 가능 토큰: {YYYY} 연도, {MM} 월, {ABBR} 양식 약어, {SEQ:4} 일련번호(자릿수)"
            />
            <FormControlLabel
              control={<Switch checked={resetYearly} onChange={(e) => setResetYearly(e.target.checked)} />}
              label="매년 일련번호 초기화"
            />
            <Box sx={{ p: 1.5, bgcolor: 'background.default', borderRadius: 1 }}>
              <Typography variant="caption" color="text.secondary">미리보기</Typography>
              <Typography variant="body1" fontWeight={700}>{previewNumber(pattern, form.abbreviation ?? '')}</Typography>
            </Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saveMutation.isPending}>취소</Button>
        <Button variant="contained" onClick={handleSave} disabled={saveMutation.isPending || isLoading}>
          {saveMutation.isPending ? <CircularProgress size={18} sx={{ mr: 1 }} /> : null}
          저장
        </Button>
      </DialogActions>
    </Dialog>
  )
}

/** 양식 접근규칙 다이얼로그 (보조기능 보존, 다크 MUI — FormAccessRulesPanel 마운트) */
function AccessRulesDialog({ form, onClose }: { form: DocumentForm; onClose: () => void }) {
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>작성 권한 (접근규칙) — {form.name}</DialogTitle>
      <DialogContent dividers>
        <FormAccessRulesPanel formId={form.id} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>닫기</Button>
      </DialogActions>
    </Dialog>
  )
}

interface FormModalState {
  mode: 'create' | 'edit'
  form: DocumentForm | null
}

export default function ApprovalFormsPage() {
  const toast = useToast()
  const { data: forms = [], isLoading } = useDocumentForms()
  const { data: categories = [] } = useFormCategories()
  const deleteMutation = useDeleteDocumentForm()

  const [selectedCat, setSelectedCat] = useState<string>(ALL_CATEGORY)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [formModal, setFormModal] = useState<FormModalState | null>(null)
  const [catManagerOpen, setCatManagerOpen] = useState(false)
  const [ruleTarget, setRuleTarget] = useState<DocumentForm | null>(null)
  const [accessTarget, setAccessTarget] = useState<DocumentForm | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<DocumentForm | null>(null)
  const [confirmCatDelete, setConfirmCatDelete] = useState(false)

  const sortedForms = useMemo(() => [...forms].sort((a, b) => a.sortOrder - b.sortOrder), [forms])

  // 좌측 양식함(분류) — 전체 + 각 카테고리(양식 수)
  const folders = useMemo(() => {
    const countFor = (catId: string) => forms.filter((f) => f.categoryId === catId).length
    return [
      { id: ALL_CATEGORY, name: '전체 양식', count: forms.length },
      ...[...categories]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((c) => ({ id: c.id, name: c.name, count: countFor(c.id) })),
    ]
  }, [forms, categories])

  const visibleForms = useMemo(() => {
    const byCat = selectedCat === ALL_CATEGORY ? sortedForms : sortedForms.filter((f) => f.categoryId === selectedCat)
    const q = search.trim()
    return q ? byCat.filter((f) => f.name.includes(q)) : byCat
  }, [sortedForms, selectedCat, search])

  const categoryName = (form: DocumentForm) =>
    categories.find((c) => c.id === form.categoryId)?.name ?? form.category ?? '—'

  const handleDelete = async () => {
    if (!confirmTarget) return
    try {
      await deleteMutation.mutateAsync(confirmTarget.id)
      toast('양식을 삭제했습니다.')
    } catch (e) {
      toast(getApiErrorMessage(e, '삭제 중 오류가 발생했습니다.'))
    } finally {
      setConfirmTarget(null)
    }
  }

  return (
    <>
      <PageHead
        eyebrow="Form Templates"
        title="기안양식 관리"
        right={
          <button className="btn btn-ghost btn-sm" onClick={() => setFormModal({ mode: 'create', form: null })}>＋ 양식 추가</button>
        }
      />

      {isLoading ? (
        <div className="ab-loading">
          <span className="ab-spin" />
          불러오는 중…
        </div>
      ) : (
        <div className="split">
          {/* 좌: 양식함(분류) */}
          <div className="pane">
            <div className="pane-head"><span className="dot" /><span className="t">양식함</span></div>
            <div className="pane-list">
              {folders.map((f) => (
                <div
                  key={f.id}
                  className={'pane-li' + (selectedCat === f.id ? ' on' : '')}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selectedCat === f.id}
                  onClick={() => setSelectedCat(f.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setSelectedCat(f.id)
                    }
                  }}
                >
                  <span>{f.name} ({f.count})</span>
                </div>
              ))}
            </div>
            <div className="pane-foot">
              <button className="btn btn-line btn-sm" onClick={() => setCatManagerOpen(true)}>추가</button>
              <button className="btn btn-line btn-sm" onClick={() => setCatManagerOpen(true)}>수정</button>
              <button className="btn btn-line btn-sm" onClick={() => setConfirmCatDelete(true)}>삭제</button>
            </div>
          </div>

          {/* 우: 양식 목록 */}
          <div>
            <div className="filter" style={{ padding: '20px 24px', marginBottom: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <label style={{ fontSize: 13, color: 'var(--fg-3)', flex: '0 0 auto' }}>검색</label>
                <TextInput placeholder="기안양식명 입력" value={searchInput} onChange={setSearchInput} />
                <button
                  className="btn btn-primary btn-sm"
                  style={{ flex: '0 0 auto', padding: '10px 28px' }}
                  onClick={() => setSearch(searchInput)}
                >
                  조회
                </button>
              </div>
            </div>

            <div className="tbl-bar">
              <span className="tbl-count">양식 목록 <b>{visibleForms.length}</b>건</span>
            </div>
            <div className="tbl-scroll wide">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>양식명</th>
                    <th style={{ width: 120 }}>보존연한</th>
                    <th style={{ width: 110 }}>공개여부</th>
                    <th style={{ width: 90 }}>사용여부</th>
                    <th style={{ width: 140 }}>분류</th>
                    <th style={{ width: 140 }} className="c">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleForms.length === 0 ? (
                    <TableEmpty colSpan={6} message="등록된 기안양식이 없습니다." />
                  ) : (
                    visibleForms.map((form) => (
                      <tr key={form.id}>
                        <td className="lead">
                          <span
                            className="tbl-link"
                            role="button"
                            tabIndex={0}
                            onClick={() => setFormModal({ mode: 'edit', form })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                setFormModal({ mode: 'edit', form })
                              }
                            }}
                          >
                            {form.name}
                          </span>
                        </td>
                        <td className="muted">{retainLabel(form.retentionYears)}</td>
                        <td className="muted">{form.visibilityScope ? VISIBILITY_LABEL[form.visibilityScope] : '—'}</td>
                        <td>
                          {form.isActive ? <Badge kind="b-done">사용</Badge> : <Badge kind="b-submit">사용 안 함</Badge>}
                        </td>
                        <td className="muted">{categoryName(form)}</td>
                        <td className="c">
                          <div style={{ display: 'inline-flex', gap: 8, color: 'var(--fg-4)' }}>
                            <button className="modal-x" style={{ width: 26, height: 26 }} onClick={() => setAccessTarget(form)} aria-label="접근규칙" title="접근규칙">{I.user()}</button>
                            <button className="modal-x" style={{ width: 26, height: 26 }} onClick={() => setRuleTarget(form)} aria-label="문서번호 채번" title="문서번호 채번">{I.file()}</button>
                            <button className="modal-x" style={{ width: 26, height: 26 }} onClick={() => setConfirmTarget(form)} aria-label="삭제" title="삭제">{I.trash()}</button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 양식 등록/수정 — 핸드오프 네이티브 모달 */}
      {formModal && (
        <FormModalNative
          form={formModal.form}
          mode={formModal.mode}
          onClose={() => setFormModal(null)}
        />
      )}

      {/* 보조기능 — 문서번호 채번 */}
      {ruleTarget && (
        <NumberRuleDialog
          form={ruleTarget}
          onClose={() => setRuleTarget(null)}
          onSuccess={(msg) => toast(msg)}
        />
      )}

      {/* 보조기능 — 양식 접근규칙 */}
      {accessTarget && <AccessRulesDialog form={accessTarget} onClose={() => setAccessTarget(null)} />}

      {/* 양식 분류 관리 (추가·수정·삭제) */}
      <FormCategoryManagerDialog
        open={catManagerOpen}
        onClose={() => setCatManagerOpen(false)}
        onResult={(msg) => toast(msg)}
      />

      {/* 분류함 삭제 안내 — 분류 관리로 유도 */}
      <ConfirmDialog
        open={confirmCatDelete}
        title="양식함 삭제 안내"
        message="등록되어있는 결재문서들은 삭제되지 않습니다. 분류 관리에서 삭제할 분류를 선택해 주세요."
        confirmLabel="분류 관리"
        cancelLabel="닫기"
        onConfirm={() => {
          setConfirmCatDelete(false)
          setCatManagerOpen(true)
        }}
        onCancel={() => setConfirmCatDelete(false)}
      />

      {/* 양식 삭제 확인 */}
      <ConfirmDialog
        open={!!confirmTarget}
        title="양식 삭제"
        message={confirmTarget ? `"${confirmTarget.name}" 양식을 삭제하시겠습니까?` : ''}
        confirmLabel="삭제"
        onConfirm={handleDelete}
        onCancel={() => setConfirmTarget(null)}
      />
    </>
  )
}
