import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { AccessLevel, ACCESS_LEVEL_HIERARCHY } from '@ablework/shared-constants'
import { JwtPayload } from '../../common/types/jwt-payload.type'
import {
  DocStatus,
  StepStatus,
  APPROVAL_FLOW_ROLES,
  RECEIVER_ROLES,
  ACTED_STEP_STATUSES,
} from './documents.constants'

/**
 * documents 서비스 순수 헬퍼 + 공유 타입 (god file 분할 · 항목 24).
 * DI·prisma 없는 순수 계산/검증만 모은다. DocumentsService/QueryService/StepsService 공용.
 */

/** 기안자가 수정·상신할 수 있는 상태 — 임시저장(DRAFT)만. 회수/반려 문서는 재상신 불가(복사하여 새 기안). */
export const EDITABLE_STATUSES: string[] = [DocStatus.DRAFT]
/** 기안함(draft 박스) 목록 노출 상태 — 임시저장 + 회수 + 반려(회수/반려는 읽기전용으로 조회·복사) */
export const DRAFT_BOX_STATUSES: string[] = [DocStatus.DRAFT, DocStatus.RECALLED, DocStatus.REJECTED]

export type StepRecord = {
  id: string
  role: string
  assigneeId: string
  organizationId?: string | null
  stepOrder: number
  status: string
}

/** assigneeId가 확정된 결재 단계 (부서 단계는 부서 문서담당자로 해석 완료) */
export type ResolvedStep = {
  role: string
  assigneeId: string
  organizationId: string | null
  stepOrder: number
}

/**
 * 탭별 검색 OR 조건 — 제목/양식명(form.name)/기안자명(drafter.name).
 * all(기본)은 문서번호까지 포함한 전체 필드 검색.
 */
export function buildSearchOr(search: string, field: string): Record<string, unknown>[] {
  switch (field) {
    case 'title':
      return [{ title: { contains: search } }]
    case 'form':
      return [{ form: { name: { contains: search } } }]
    case 'drafter':
      return [{ drafter: { name: { contains: search } } }]
    default:
      return [
        { title: { contains: search } },
        { docNumber: { contains: search } },
        { form: { name: { contains: search } } },
        { drafter: { name: { contains: search } } },
      ]
  }
}

/** 결재 현황 phase: PENDING + 액티드 step 없음=상신 / 있음=진행중 / 그 외=null */
export function derivePhase(
  status: string,
  steps: Array<{ status: string }>,
): 'SUBMITTED' | 'IN_PROGRESS' | null {
  if (status !== DocStatus.PENDING) return null
  const hasActed = steps.some((s) => ACTED_STEP_STATUSES.includes(s.status))
  return hasActed ? 'IN_PROGRESS' : 'SUBMITTED'
}

/** 현재 결재 차례인 결재(승인/협조) 단계의 담당자 이름 (stepOrder 오름차순 첫 PENDING) */
export function deriveCurrentApprover(
  steps: Array<{
    role: string
    status: string
    stepOrder: number
    assignee?: { id: string; name: string } | null
  }>,
): { id: string; name: string } | null {
  const current = steps
    .filter((s) => APPROVAL_FLOW_ROLES.includes(s.role) && s.status === StepStatus.PENDING)
    .sort((a, b) => a.stepOrder - b.stepOrder)[0]
  return current?.assignee ?? null
}

/** 상신 시 단계 초기 상태: 첫 결재만 PENDING · 나머지 결재 WAITING · 수신 WAITING · 참조/공람 즉시 PENDING */
export function initialStepStatus(
  step: ResolvedStep,
  firstFlowOrder: number | undefined,
): string {
  if (APPROVAL_FLOW_ROLES.includes(step.role)) {
    return step.stepOrder === firstFlowOrder ? StepStatus.PENDING : StepStatus.WAITING
  }
  if (RECEIVER_ROLES.includes(step.role)) {
    return StepStatus.WAITING // 최종 승인 후 활성화 (RECEIVER + 부서수신)
  }
  return StepStatus.PENDING // REFERENCE/VIEWER — 즉시 확인 가능(비차단)
}

/**
 * pattern 토큰 치환:
 * - {CATEGORY}(문서성격 약어), {ABBR}(양식 약어)
 * - {YYYY}(4자리 연도), {YY}(2자리 연도), {MM}(2자리 월)
 * - {SEQ:n}(0패딩 n자리, n 생략 시 패딩 없음)
 * 예) {CATEGORY}-{ABBR}-{YY}-{SEQ:4} → 사업-지출기안-26-0001
 */
export function renderDocNumber(
  pattern: string,
  date: Date,
  seq: number,
  abbr = '',
  categoryAbbr = '',
): string {
  return pattern
    .replace(/\{YYYY\}/g, String(date.getFullYear()))
    .replace(/\{YY\}/g, String(date.getFullYear()).slice(-2))
    .replace(/\{MM\}/g, String(date.getMonth() + 1).padStart(2, '0'))
    .replace(/\{CATEGORY\}/g, categoryAbbr)
    .replace(/\{ABBR\}/g, abbr)
    .replace(/\{SEQ(?::(\d+))?\}/g, (_match, width?: string) =>
      width ? String(seq).padStart(Number(width), '0') : String(seq),
    )
}

/** @db.Date 비교용 — 오늘 00:00 UTC */
export function todayDateOnly(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

export function isCompanyAdmin(user: JwtPayload): boolean {
  return (
    ACCESS_LEVEL_HIERARCHY[user.accessLevel] >=
    ACCESS_LEVEL_HIERARCHY[AccessLevel.GENERAL_ADMIN]
  )
}

export function assertDrafter(document: { drafterId: string }, user: JwtPayload) {
  if (document.drafterId !== user.employeeId) {
    throw new ForbiddenException({
      code: 'DOCUMENT_NOT_DRAFTER',
      message: '기안자 본인만 처리할 수 있습니다.',
    })
  }
}

/** HR 요청 연동 문서는 /requests 승인 플로우에서만 처리 (이중 처리 방지) */
export function assertNotRequestManaged(document: { requestId: string | null }) {
  if (document.requestId) {
    throw new BadRequestException({
      code: 'DOCUMENT_MANAGED_BY_REQUEST',
      message: 'HR 요청과 연동된 문서는 요청 관리에서 처리해 주세요.',
    })
  }
}

export function assertCanRead(
  document: {
    drafterId: string
    approvalLines: Array<{ steps: Array<{ assigneeId: string; proxyId?: string | null }> }>
  },
  user: JwtPayload,
) {
  if (isCompanyAdmin(user)) return
  if (document.drafterId === user.employeeId) return

  const isParticipant = document.approvalLines
    .flatMap((line) => line.steps)
    .some((s) => s.assigneeId === user.employeeId || s.proxyId === user.employeeId)
  if (!isParticipant) {
    throw new ForbiddenException({
      code: 'DOCUMENT_ACCESS_FORBIDDEN',
      message: '문서를 열람할 권한이 없습니다.',
    })
  }
}
