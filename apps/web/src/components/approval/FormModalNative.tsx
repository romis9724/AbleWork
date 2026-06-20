/**
 * AB 전자결재 — 기안양식 등록 · 수정 모달 (핸드오프 hr/form_modal.jsx 네이티브 포팅).
 * 기본정보(.doc-section) + 미리보기(.tpl-prev). 저장은 useCreateDocumentForm/useUpdateDocumentForm.
 * 실제 DocumentForm 필드명(name·categoryId·retentionYears·abbreviation·isActive·visibilityScope·description)에 매핑.
 */
'use client'
import { useState } from 'react'
import { useToast } from '@/components/ab/Toast'
import { I } from '@/components/ab/icons'
import { Radio, Toggle } from '@/components/ab/atoms'
import {
  useCreateDocumentForm,
  useFormCategories,
  useSharedApprovalLines,
  useUpdateDocumentForm,
  type DocumentForm,
  type FormVisibilityScope,
} from '@/lib/query/documents'
import { useEmployees } from '@/lib/query/employees'
import {
  DocumentFieldType,
  DOCUMENT_FIELD_TYPE_LABEL,
  readFormFields,
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

export default function FormModalNative({ form, mode, onClose }: Props) {
  const toast = useToast()
  const isEdit = mode === 'edit'
  const { data: categories = [] } = useFormCategories()
  const { data: sharedLines = [] } = useSharedApprovalLines()
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

  const addField = () =>
    setFields((fs) => [...fs, { key: `field${fs.length + 1}`, label: '', type: DocumentFieldType.TEXT, required: false }])
  const removeField = (i: number) => setFields((fs) => fs.filter((_, idx) => idx !== i))
  const updateField = (i: number, patch: Partial<DocumentFieldDef>) =>
    setFields((fs) => fs.map((f, idx) => (idx === i ? { ...f, ...patch } : f)))

  const busy = createMutation.isPending || updateMutation.isPending

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
      fieldsSchema: { fields: fields.filter((f) => f.label.trim() && f.key.trim()) },
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
              <span className="fk">양식명<span className="req">*</span></span>
              <span className="fv">
                <input className="inp-block" value={name} onChange={(e) => setName(e.target.value)} placeholder="예) 지출결의서" />
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 40px' }}>
              <div className="doc-field">
                <span className="fk">양식 분류</span>
                <span className="fv">
                  <select className="sel" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={{ borderBottom: '1px solid var(--warm-500)' }}>
                    <option value="">분류 없음</option>
                    {categories.filter((c) => c.isActive).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </span>
              </div>
              <div className="doc-field">
                <span className="fk">보존연한</span>
                <span className="fv">
                  <select className="sel" value={retentionYears} onChange={(e) => setRetentionYears(Number(e.target.value))} style={{ borderBottom: '1px solid var(--warm-500)' }}>
                    {RETAIN_OPTS.map((y) => <option key={y} value={y}>{retainLabel(y)}</option>)}
                  </select>
                </span>
              </div>
              <div className="doc-field">
                <span className="fk">문서번호 약어</span>
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
                <span className="fk">사용여부</span>
                <span className="fv">
                  <Toggle on={isActive} onChange={setIsActive} label={isActive ? '사용' : '사용 안 함'} />
                </span>
              </div>
            </div>

            <div className="doc-field">
              <span className="fk">공개여부</span>
              <span className="fv">
                <div className="rad-grp">
                  {VISIBILITY_OPTS.map((o) => (
                    <Radio key={o.value} on={visibilityScope === o.value} onChange={() => setVisibilityScope(o.value)}>{o.label}</Radio>
                  ))}
                </div>
              </span>
            </div>

            <div className="doc-field">
              <span className="fk">설명</span>
              <span className="fv" style={{ width: '100%' }}>
                <input className="inp-block" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="양식 용도에 대한 간단한 설명 (선택)" />
              </span>
            </div>

            <div className="doc-field">
              <span className="fk">결재 옵션</span>
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
                <span className="fk">기본 결재선</span>
                <span className="fv">
                  <select className="sel" value={defaultLineId} onChange={(e) => setDefaultLineId(e.target.value)} style={{ borderBottom: '1px solid var(--warm-500)' }}>
                    <option value="">없음 (상신 시 직접 구성)</option>
                    {sharedLines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </span>
              </div>
              <div className="doc-field">
                <span className="fk">양식 담당자</span>
                <span className="fv">
                  <select className="sel" value={formOwnerId} onChange={(e) => setFormOwnerId(e.target.value)} style={{ borderBottom: '1px solid var(--warm-500)' }}>
                    <option value="">미지정</option>
                    {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                  </select>
                </span>
              </div>
            </div>

            <div className="doc-field">
              <span className="fk">양식 항목</span>
              <span className="fv" style={{ width: '100%' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {fields.map((f, i) => (
                    <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <input className="inp-block" style={{ width: 120 }} value={f.key} onChange={(e) => updateField(i, { key: e.target.value })} placeholder="키" />
                      <input className="inp-block" style={{ flex: 1, minWidth: 140 }} value={f.label} onChange={(e) => updateField(i, { label: e.target.value })} placeholder="항목 이름" />
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

          {/* 미리보기 */}
          <div className="doc-section">
            <div className="doc-sec-head"><span className="dot" /><span className="t">양식 구성 미리보기</span><span className="en">Layout</span></div>
            <div className="tpl-prev">
              <div className="tpl-prev-row"><span className="lab">문서번호</span><span className="cnt">{abbreviation || 'ABBR'} · 년도 2자리 · 순번 4자리 · {retainLabel(retentionYears)}</span></div>
              <div className="tpl-prev-row"><span className="lab">양식 분류</span><span className="cnt">{categoryName ?? '분류 없음'}</span></div>
              <div className="tpl-prev-row"><span className="lab">결재선</span><span className="cnt">기안 → 검토 → 승인 (상신 시 지정)</span></div>
              <div className="tpl-prev-row"><span className="lab">제목</span><span className="cnt">{name || '양식명이 기본 제목으로 표시됩니다'}</span></div>
              <div className="tpl-prev-row"><span className="lab">본문</span><span className="cnt">자유 입력 영역 · 표/첨부 삽입 지원</span></div>
              <div className="tpl-prev-row"><span className="lab">첨부파일</span><span className="cnt">최대 10개 · 항목당 20 MB</span></div>
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn btn-line" style={{ minWidth: 110 }} disabled={busy} onClick={onClose}>취소</button>
          <button className="btn btn-primary" style={{ minWidth: 110 }} disabled={busy || !name.trim()} onClick={handleSave}>저장</button>
        </div>
      </div>
    </div>
  )
}
