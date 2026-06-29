/**
 * AB 전자결재 — 기안양식 미리보기 모달.
 * 기안양식 등록/수정 모달의 [미리보기] 버튼으로 열리며, 실제 기안 작성 화면과 같은 구성
 * (양식 도움말 → 동적 양식 항목(읽기전용) → 기본 본문)을 그대로 보여준다.
 */
'use client'
import Box from '@mui/material/Box'
import { I } from '@/components/ab/icons'
import { type DocumentFieldDef } from '@ablework/shared-constants'
import DynamicFormFields from './DynamicFormFields'
import RichTextView from './RichTextView'

interface Props {
  name: string
  abbreviation: string
  retentionYears: number
  categoryName?: string
  fields: DocumentFieldDef[]
  helpText: string
  defaultContent: string
  onClose: () => void
}

const retainLabel = (y: number) => (y === 0 ? '영구 보존' : `${y}년 보존`)

export default function FormPreviewModal({
  name,
  abbreviation,
  retentionYears,
  categoryName,
  fields,
  helpText,
  defaultContent,
  onClose,
}: Props) {
  return (
    <div className="modal-overlay" onClick={(e) => { e.stopPropagation(); onClose() }} style={{ zIndex: 220 }}>
      <div className="modal" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title-wrap">
            <span className="modal-eyebrow">Form Preview</span>
            <span className="modal-title">{name || '양식'} 미리보기</span>
          </div>
          <button className="modal-x" onClick={onClose}>{I.x()}</button>
        </div>

        <div className="modal-body doc">
          {/* 문서 정보 요약 */}
          <div className="doc-section">
            <div className="doc-sec-head"><span className="dot" /><span className="t">문서 정보</span><span className="en">Document Info</span></div>
            <div className="doc-meta">
              <div className="cell"><div className="k">문서번호</div><div className="v num">{abbreviation || 'ABBR'} · YY · 0001</div></div>
              <div className="cell"><div className="k">양식 분류</div><div className="v">{categoryName ?? '분류 없음'}</div></div>
              <div className="cell"><div className="k">보존연한</div><div className="v">{retainLabel(retentionYears)}</div></div>
            </div>
          </div>

          {/* 양식 도움말 */}
          {helpText.trim() && (
            <div className="doc-section">
              <div className="doc-sec-head"><span className="dot" /><span className="t">작성 안내</span><span className="en">Guide</span></div>
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 6,
                  background: 'color-mix(in srgb, var(--ab-orange) 10%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--ab-orange) 30%, transparent)',
                  color: 'var(--fg-2)',
                  fontSize: 13,
                  lineHeight: 1.7,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {helpText}
              </div>
            </div>
          )}

          {/* 기안 내용 (양식 항목 + 본문) */}
          <div className="doc-section">
            <div className="doc-sec-head"><span className="dot" /><span className="t">기안 내용</span><span className="en">Content</span></div>
            <div className="doc-field">
              <span className="fk">제목</span>
              <span className="fv">{name || '기안 제목을 입력하세요'}</span>
            </div>

            {fields.length > 0 && (
              <div className="doc-field">
                <span className="fk">양식 항목</span>
                <span className="fv" style={{ width: '100%' }}>
                  <DynamicFormFields fields={fields} values={{}} onChange={() => {}} disabled />
                </span>
              </div>
            )}

            <div className="doc-field">
              <span className="fk">본문</span>
              <span className="fv" style={{ width: '100%' }}>
                {defaultContent.trim()
                  ? <RichTextView html={defaultContent} />
                  : <Box sx={{ color: 'var(--fg-5)', fontSize: 13 }}>본문 기본 내용이 없습니다. (기안자가 직접 작성)</Box>}
              </span>
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn btn-primary" style={{ minWidth: 120 }} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}
