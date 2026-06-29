'use client'
import { useState } from 'react'
import { I } from '@/components/ab/icons'
import { HelpTip } from '@/components/ab/HelpTip'
import { ConfirmDialog } from '@/components/ab/Modal'
import { useToast } from '@/components/ab/Toast'
import RichTextEditor from '@/components/approval/RichTextEditor'
import { getApiErrorMessage } from '@/lib/api-error'
import {
  useBodyTemplates,
  useCreateBodyTemplate,
  useUpdateBodyTemplate,
  useDeleteBodyTemplate,
  type BodyTemplate,
} from '@/lib/query/documents'

/** HTML 본문에서 태그를 제거해 목록용 미리보기 텍스트 추출 */
const previewText = (html: string) =>
  html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()

type Editing = { mode: 'create' } | { mode: 'edit'; template: BodyTemplate } | null

/**
 * 기안 본문 템플릿 관리 (회사 설정 > 전자결재).
 * 기안양식 등록 시 "기본 본문"을 빠르게 채우기 위한 회사 공용 템플릿을 CRUD한다.
 */
export default function BodyTemplatesPanel() {
  const toast = useToast()
  const { data: templates = [], isLoading } = useBodyTemplates()
  const createMutation = useCreateBodyTemplate()
  const updateMutation = useUpdateBodyTemplate()
  const deleteMutation = useDeleteBodyTemplate()

  const [editing, setEditing] = useState<Editing>(null)
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<BodyTemplate | null>(null)

  const busy = createMutation.isPending || updateMutation.isPending

  const openCreate = () => {
    setName('')
    setContent('')
    setEditing({ mode: 'create' })
  }
  const openEdit = (t: BodyTemplate) => {
    setName(t.name)
    setContent(t.content)
    setEditing({ mode: 'edit', template: t })
  }

  const handleSave = async () => {
    if (!name.trim()) {
      toast('템플릿명을 입력해 주세요')
      return
    }
    try {
      if (editing?.mode === 'edit') {
        await updateMutation.mutateAsync({ id: editing.template.id, name: name.trim(), content })
        toast('템플릿을 수정했습니다')
      } else {
        await createMutation.mutateAsync({ name: name.trim(), content })
        toast('템플릿을 등록했습니다')
      }
      setEditing(null)
    } catch (e) {
      toast(getApiErrorMessage(e, '저장에 실패했습니다'))
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteMutation.mutateAsync(deleteTarget.id)
      toast('템플릿을 삭제했습니다')
    } catch (e) {
      toast(getApiErrorMessage(e, '삭제에 실패했습니다'))
    } finally {
      setDeleteTarget(null)
    }
  }

  return (
    <div className="set-block">
      <div className="set-block-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>기안 본문 템플릿<HelpTip k="approval.bodyTemplates" /></span>
        <button className="btn btn-line btn-sm" onClick={openCreate}>{I.plus({ style: { marginRight: 4 } })}템플릿 추가</button>
      </div>

      {isLoading ? (
        <div className="ab-loading"><span className="ab-spin" />불러오는 중…</div>
      ) : templates.length === 0 ? (
        <div className="set-row" style={{ gridTemplateColumns: '1fr' }}>
          <span style={{ fontSize: 12, color: 'var(--fg-5)' }}>
            등록된 본문 템플릿이 없습니다. 기안양식 등록 시 기본 본문을 빠르게 채울 수 있도록 템플릿을 추가하세요.
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {templates.map((t) => (
            <div
              key={t.id}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 24px', borderBottom: '1px solid var(--line-soft)' }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-1)' }}>{t.name}</div>
                <div style={{ fontSize: 12, color: 'var(--fg-5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {previewText(t.content) || '(내용 없음)'}
                </div>
              </div>
              <button className="btn btn-line btn-sm" onClick={() => openEdit(t)}>수정</button>
              <button className="btn btn-line btn-sm" style={{ color: 'var(--err)' }} onClick={() => setDeleteTarget(t)}>삭제</button>
            </div>
          ))}
        </div>
      )}

      {/* 추가/수정 모달 */}
      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title-wrap">
                <span className="modal-eyebrow">Body Template</span>
                <span className="modal-title">{editing.mode === 'edit' ? '본문 템플릿 수정' : '본문 템플릿 등록'}</span>
              </div>
              <button className="modal-x" onClick={() => setEditing(null)}>{I.x()}</button>
            </div>
            <div className="modal-body doc">
              <div className="doc-section">
                <div className="doc-field">
                  <span className="fk">템플릿명<span className="req">*</span></span>
                  <span className="fv" style={{ width: '100%' }}>
                    <input className="inp-block" value={name} onChange={(e) => setName(e.target.value)} placeholder="예) 지출결의서 기본 양식" />
                  </span>
                </div>
                <div className="doc-field">
                  <span className="fk">본문 내용</span>
                  <span className="fv" style={{ width: '100%' }}>
                    <RichTextEditor value={content} onChange={setContent} disabled={busy} minHeight={200} placeholder="기안 본문에 채워질 내용을 작성하세요" />
                  </span>
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-line" style={{ minWidth: 110 }} disabled={busy} onClick={() => setEditing(null)}>취소</button>
              <button className="btn btn-primary" style={{ minWidth: 110 }} disabled={busy || !name.trim()} onClick={handleSave}>
                {editing.mode === 'edit' ? '저장' : '등록'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="본문 템플릿 삭제"
        message={deleteTarget ? `"${deleteTarget.name}" 템플릿을 삭제하시겠습니까?` : ''}
        confirmLabel="삭제"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
