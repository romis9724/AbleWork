/**
 * AB 전자결재 — 기안양식 등록 · 수정 모달 (핸드오프 hr/form_modal.jsx 네이티브 포팅).
 * 기본정보 + 양식 항목(저장 키 자동) + 양식 도움말 + 기본 본문(RichText).
 * [미리보기] 버튼으로 FormPreviewModal(작성 화면과 동일 구성)을 띄운다.
 * 저장은 useCreateDocumentForm/useUpdateDocumentForm. 도움말·기본본문은 fieldsSchema JSON에 함께 저장.
 * 각 항목 라벨의 "!"(HelpTip)은 settings-help.ts(form.*) 문구를 사용한다.
 */
'use client'
import { useState } from 'react'
import { useToast } from '@/components/ab/Toast'
import { I } from '@/components/ab/icons'
import { Radio, Toggle } from '@/components/ab/atoms'
import { HelpTip } from '@/components/ab/HelpTip'
import RichTextEditor from './RichTextEditor'
import FormPreviewModal from './FormPreviewModal'
import {
  useCreateDocumentForm,
  useFormCategories,
  useSharedApprovalLines,
  useUpdateDocumentForm,
  useBodyTemplates,
  type DocumentForm,
  type FormVisibilityScope,
} from '@/lib/query/documents'
import { useEmployees } from '@/lib/query/employees'
import {
  DocumentFieldType,
  DOCUMENT_FIELD_TYPE_LABEL,
  readFormFields,
  readFormHelpText,
  readFormDefaultContent,
  type DocumentFieldDef,
} from '@ablework/shared-constants'

interface Props {
  form?: DocumentForm | null
  mode: 'create' | 'edit'
  onClose: () => void
}

/** 보존연한 선택지(년) */
const RETAIN_OPTS = [1, 3, 5, 10, 0] as const
const retainLabel = (y: number) => (y === 0 ? '영구 보존' : `${y}년 보존`)

const VISIBILITY_OPTS: { value: FormVisibilityScope; label: string }[] = [
  { value: 'PUBLIC', label: '전체공개' },
  { value: 'DEPARTMENT', label: '부서공개' },
  { value: 'PRIVATE', label: '비공개' },
]

/** content 저장 키 자동 생성 — 사용자에게 노출하지 않는다 (label/유형만 설계) */
const genFieldKey = () => `f_${Math.random().toString(36).slice(2, 10)}`

export default function FormModalNative({ form, mode, onClose }: Props) {
  const toast = useToast()
  const isEdit = mode === 'edit'
  const { data: categories = [] } = useFormCategories()
  const { data: sharedLines = [] } = useSharedApprovalLines()
  const { data: bodyTemplates = [] } = useBodyTemplates()
  const { data: empData } = useEmployees({ isActive: true, limit: 200 })
  const employees = empData?.items ?? []
  const createMutation = useCreateDocumentForm()
  const updateMutation = useUpdateDocumentForm()

  const [name, setName] = useState(form?.name ?? '')
  const [categoryId, setCategoryId] = useState(form?.categoryId ?? '')
  const [retentionYears, setRetentionYears] = useState<number>(form?.retentionYears ?? 5)
  const [abbreviation, setAbbreviation] = useState(form?.abbreviation ?? '')
  const [isActive, setIsActive] = useState(form?.isActive ?? true)
  const [visibilityScope, setVisibilityScope] = useState<FormVisibilityScope>(
    form?.visibilityScope ?? 'DEPARTMENT',
  )
  const [description, setDescription] = useState(form?.description ?? '')
  // 결재 옵션 (C-4): 전결 허용·반려 재기안 허용·압축파일 업로드 허용
  const [allowPreApproval, setAllowPreApproval] = useState(form?.allowPreApproval ?? false)
  const [allowReDraft, setAllowReDraft] = useState(form?.allowReDraft ?? false)
  const [allowZipUpload, setAllowZipUpload] = useState(form?.allowZipUpload ?? false)
  // C-4b: 기본 결재선·양식 담당자·동적 양식 항목
  const [defaultLineId, setDefaultLineId] = useState(form?.defaultLineId ?? '')
  const [formOwnerId, setFormOwnerId] = useState(form?.formOwnerId ?? '')
  const [fields, setFields] = useState<DocumentFieldDef[]>(() => readFormFields(form?.fieldsSchema))
  // 양식 도움말·기본 본문 (fieldsSchema JSON에 함께 저장)
  const [helpText, setHelpText] = useState(() => readFormHelpText(form?.fieldsSchema))
  const [defaultContent, setDefaultContent] = useState(() => readFormDefaultContent(form?.fieldsSchema))
  const [showPreview, setShowPreview] = useState(false)

  const addField = () =>
    setFields((fs) => [...fs, { key: genFieldKey(), label: '', type: DocumentFieldType.TEXT, required: false }])
  const removeField = (i: number) => setFields((fs) => fs.filter((_, idx) => idx !== i))
  const updateField = (i: number, patch: Partial<DocumentFieldDef>) =>
    setFields((fs) => fs.map((f, idx) => (idx === i ? { ...f, ...patch } : f)))

  const busy = createMutation.isPending || updateMutation.isPending

  // 저장될 양식 항목(이름이 있는 것만, 키는 자동 보정)
  const cleanedFields = fields
    .filter((f) => f.label.trim())
    .map((f) => ({ ...f, key: f.key || genFieldKey() }))

  const handleSave = async () => {
    if (!name.trim()) return
    const payload = {
      name: name.trim(),
      categoryId: categoryId || null,
      retentionYears,
      abbreviation: abbreviation.trim() || null,
      isActive,
      visibilityScope,
      description: description.trim() || null,
      allowPreApproval,
      allowReDraft,
      allowZipUpload,
      defaultLineId: defaultLineId || null,
      formOwnerId: formOwnerId || null,
      fieldsSchema: {
        fields: cleanedFields,
        helpText: helpText.trim() || undefined,
        defaultContent: defaultContent.trim() || undefined,
      },
    }
    try {
      if (isEdit && form) {
        await updateMutation.mutateAsync({ id: form.id, ...payload })
        toast('양식을 수정했습니다')
      } else {
        await createMutation.mutateAsync(payload)
        toast('양식을 등록했습니다')
      }
      onClose()
    } catch {
      toast('저장 중 오류가 발생했습니다')
    }
  }

  const categoryName = categories.find((c) => c.id === categoryId)?.name

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 760 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title-wrap">
            <span className="modal-eyebrow">{isEdit ? 'Edit Form Template' : 'New Form Template'}</span>
            <span className="modal-title">{isEdit ? '기안양식 수정' : '기안양식 등록'}</span>
          </div>
          <button className="modal-x" onClick={onClose}>{I.x()}</button>
        </div>

        <div className="modal-body doc">
          {/* 기본 정보 */}
          <div className="doc-section">
            <div className="doc-sec-head"><span className="dot" /><span className="t">기본 정보</span><span className="en">Basic</span></div>

            <div className="doc-field">
              <span className="fk">양식명<span className="req">*</span><HelpTip k="form.name" /></span>
              <span className="fv">
                <input className="inp-block" value={name} onChange={(e) => setName(e.target.value)} placeholder="예) 지출결의서" />
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 40px' }}>
              <div className="doc-field">
                <span className="fk">양식 분류<HelpTip k="form.category" /></span>
                <span className="fv">
                  <select className="sel" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={{ borderBottom: '1px solid var(--warm-500)' }}>
                    <option value="">분류 없음</option>
                    {categories.filter((c) => c.isActive).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </span>
              </div>
              <div className="doc-field">
                <span className="fk">보존연한<HelpTip k="form.retentionYears" /></span>
                <span className="fv">
                  <select className="sel" value={retentionYears} onChange={(e) => setRetentionYears(Number(e.target.value))} style={{ borderBottom: '1px solid var(--warm-500)' }}>
                    {RETAIN_OPTS.map((y) => <option key={y} value={y}>{retainLabel(y)}</option>)}
                  </select>
                </span>
              </div>
              <div className="doc-field">
                <span className="fk">문서번호 약어<HelpTip k="form.abbreviation" /></span>
                <span className="fv">
                  <input
                    className="inp-block tek"
                    value={abbreviation}
                    onChange={(e) => setAbbreviation(e.target.value.toUpperCase().slice(0, 4))}
                    placeholder="예) EXP"
                    style={{ maxWidth: 140, letterSpacing: '0.06em' }}
                  />
                </span>
              </div>
              <div className="doc-field">
                <span className="fk">사용여부<HelpTip k="form.isActive" /></span>
                <span className="fv">
                  <Toggle on={isActive} onChange={setIsActive} label={isActive ? '사용' : '사용 안 함'} />
                </span>
              </div>
            </div>

            <div className="doc-field">
              <span className="fk">공개여부<HelpTip k="form.visibility" /></span>
              <span className="fv">
                <div className="rad-grp">
                  {VISIBILITY_OPTS.map((o) => (
                    <Radio key={o.value} on={visibilityScope === o.value} onChange={() => setVisibilityScope(o.value)}>{o.label}</Radio>
                  ))}
                </div>
              </span>
            </div>

            <div className="doc-field">
              <span className="fk">설명<HelpTip k="form.description" /></span>
              <span className="fv" style={{ width: '100%' }}>
                <input className="inp-block" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="양식 용도에 대한 간단한 설명 (선택)" />
              </span>
            </div>

            <div className="doc-field">
              <span className="fk">결재 옵션<HelpTip k="form.approvalOptions" /></span>
              <span className="fv">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Toggle on={allowPreApproval} onChange={setAllowPreApproval} label="전결 허용 (상위 결재자가 즉시 최종 승인)" />
                  <Toggle on={allowReDraft} onChange={setAllowReDraft} label="반려 후 재기안 허용" />
                  <Toggle on={allowZipUpload} onChange={setAllowZipUpload} label="압축파일(zip) 업로드 허용" />
                </div>
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 40px' }}>
              <div className="doc-field">
                <span className="fk">기본 결재선<HelpTip k="form.defaultLine" /></span>
                <span className="fv">
                  <select className="sel" value={defaultLineId} onChange={(e) => setDefaultLineId(e.target.value)} style={{ borderBottom: '1px solid var(--warm-500)' }}>
                    <option value="">없음 (상신 시 직접 구성)</option>
                    {sharedLines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </span>
              </div>
              <div className="doc-field">
                <span className="fk">양식 담당자<HelpTip k="form.formOwner" /></span>
                <span className="fv">
                  <select className="sel" value={formOwnerId} onChange={(e) => setFormOwnerId(e.target.value)} style={{ borderBottom: '1px solid var(--warm-500)' }}>
                    <option value="">미지정</option>
                    {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                  </select>
                </span>
              </div>
            </div>

            <div className="doc-field">
              <span className="fk">양식 항목<HelpTip k="form.fields" /></span>
              <span className="fv" style={{ width: '100%' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {fields.map((f, i) => (
                    <div key={f.key || i} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <input className="inp-block" style={{ flex: 1, minWidth: 160 }} value={f.label} onChange={(e) => updateField(i, { label: e.target.value })} placeholder="항목 이름 (예: 사용 목적)" />
                      <select className="sel" style={{ width: 130 }} value={f.type} onChange={(e) => updateField(i, { type: e.target.value as DocumentFieldDef['type'] })}>
                        {Object.values(DocumentFieldType).map((t) => <option key={t} value={t}>{DOCUMENT_FIELD_TYPE_LABEL[t]}</option>)}
                      </select>
                      <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <input type="checkbox" checked={f.required} onChange={(e) => updateField(i, { required: e.target.checked })} />필수
                      </label>
                      <button type="button" className="btn btn-line btn-sm" onClick={() => removeField(i)}>삭제</button>
                    </div>
                  ))}
                  <button type="button" className="btn btn-line btn-sm" style={{ alignSelf: 'flex-start' }} onClick={addField}>＋ 항목 추가</button>
                </div>
              </span>
            </div>
          </div>

          {/* 작성 안내 · 기본 본문 */}
          <div className="doc-section">
            <div className="doc-sec-head"><span className="dot" /><span className="t">작성 안내 · 기본 본문</span><span className="en">Guide & Default</span></div>

            <div className="doc-field">
              <span className="fk">양식 도움말<HelpTip k="form.helpText" /></span>
              <span className="fv" style={{ width: '100%' }}>
                <textarea
                  className="inp-block"
                  value={helpText}
                  onChange={(e) => setHelpText(e.target.value)}
                  placeholder="기안 작성 시 안내할 문구 (예: 지출 증빙을 반드시 첨부하세요)"
                  rows={3}
                  style={{ width: '100%', resize: 'vertical', minHeight: 64, fontFamily: 'inherit' }}
                />
              </span>
            </div>

            <div className="doc-field">
              <span className="fk">기본 본문<HelpTip k="form.defaultContent" /></span>
              <span className="fv" style={{ width: '100%' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                  <select
                    className="sel"
                    value=""
                    onChange={(e) => {
                      const t = bodyTemplates.find((x) => x.id === e.target.value)
                      if (t) {
                        setDefaultContent(t.content)
                        toast(`"${t.name}" 템플릿을 불러왔습니다`)
                      }
                    }}
                    style={{ maxWidth: 280 }}
                    disabled={busy}
                  >
                    <option value="">템플릿에서 불러오기…</option>
                    {bodyTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <span style={{ fontSize: 11, color: 'var(--fg-5)' }}>
                    {bodyTemplates.length === 0
                      ? '회사 설정 > 전자결재에서 본문 템플릿을 등록하세요'
                      : '선택하면 아래 본문이 채워집니다'}
                  </span>
                </div>
                <RichTextEditor value={defaultContent} onChange={setDefaultContent} disabled={busy} minHeight={120} placeholder="기안 본문에 미리 채워질 기본 내용 (선택)" />
              </span>
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn btn-line" style={{ minWidth: 110 }} disabled={busy} onClick={onClose}>취소</button>
          <button className="btn btn-line" style={{ minWidth: 110 }} disabled={busy} onClick={() => setShowPreview(true)}>미리보기</button>
          <button className="btn btn-primary" style={{ minWidth: 110 }} disabled={busy || !name.trim()} onClick={handleSave} data-testid="eforms-form-submit-btn">저장</button>
        </div>
      </div>

      {showPreview && (
        <FormPreviewModal
          name={name}
          abbreviation={abbreviation}
          retentionYears={retentionYears}
          categoryName={categoryName}
          fields={cleanedFields}
          helpText={helpText}
          defaultContent={defaultContent}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  )
}
