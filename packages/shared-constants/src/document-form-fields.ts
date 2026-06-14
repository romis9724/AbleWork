/**
 * 기안양식 동적 필드 정의 (AP-01-02).
 *
 * 양식(`DocumentForm.fieldsSchema`)에 저장되는 필드 설계 구조의 단일 출처(SSOT).
 * - 관리자: 기안양식 관리 화면에서 필드를 설계(추가/수정/삭제).
 * - 기안자: 작성 시 양식의 필드를 동적 렌더링해 값을 입력 → `Document.content`에 `key` 기준 저장.
 */

export const DocumentFieldType = {
  TEXT: 'text',
  TEXTAREA: 'textarea',
  NUMBER: 'number',
  DATE: 'date',
  SELECT: 'select',
} as const

export type DocumentFieldType = (typeof DocumentFieldType)[keyof typeof DocumentFieldType]

export interface DocumentFieldDef {
  /** content 저장 키 (양식 내 고유) */
  key: string
  label: string
  type: DocumentFieldType
  required: boolean
  /** select 전용 — 선택 옵션 */
  options?: string[]
  placeholder?: string
}

export interface DocumentFieldsSchema {
  fields: DocumentFieldDef[]
}

export const DOCUMENT_FIELD_TYPE_LABEL: Record<DocumentFieldType, string> = {
  text: '텍스트',
  textarea: '여러 줄 텍스트',
  number: '숫자',
  date: '날짜',
  select: '선택',
}

/** fieldsSchema(unknown JSON)에서 안전하게 필드 배열을 추출한다. */
export function readFormFields(fieldsSchema: unknown): DocumentFieldDef[] {
  if (
    fieldsSchema &&
    typeof fieldsSchema === 'object' &&
    Array.isArray((fieldsSchema as { fields?: unknown }).fields)
  ) {
    return ((fieldsSchema as { fields: unknown[] }).fields).filter(
      (f): f is DocumentFieldDef =>
        !!f &&
        typeof f === 'object' &&
        typeof (f as DocumentFieldDef).key === 'string' &&
        typeof (f as DocumentFieldDef).label === 'string',
    )
  }
  return []
}
