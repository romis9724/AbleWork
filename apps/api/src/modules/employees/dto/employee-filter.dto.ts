import { z } from 'zod'

/** 콤마 구분 문자열을 trim/공백제거 후 배열로 — 비면 undefined */
const csvToArray = (v: string | undefined): string[] | undefined => {
  if (!v) return undefined
  const arr = v.split(',').map((s) => s.trim()).filter(Boolean)
  return arr.length ? arr : undefined
}

export const EmployeeFilterSchema = z.object({
  search: z.string().optional(),
  // 단수: 기존 호출 호환(예: 근무일정 벌크 생성). 다중과 함께 오면 다중이 우선.
  organizationId: z.string().min(1).optional(),
  positionId: z.string().min(1).optional(),
  // 다중: 검색영역 다중 선택(콤마 구분 문자열)
  organizationIds: z.string().optional().transform(csvToArray),
  positionIds: z.string().optional().transform(csvToArray),
  // 인사관리 목록 전용 — 최고관리자(SUPER_ADMIN)를 제외한다.
  // 결재선·문서담당 등 비인사 화면은 이 옵션 없이 전체를 조회한다(기본 false).
  excludeSuperAdmin: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  isActive: z
    .string()
    .optional()
    .transform((v) => {
      if (v === 'true') return true
      if (v === 'false') return false
      return undefined
    }),
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 1))
    .pipe(z.number().int().min(1).default(1)),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 20))
    // 직원 셀렉트(결재선·문서담당 등)·CSV 전체 export는 전 직원을 한 번에 로드한다.
    // 중소기업(50~300인) 규모를 수용하도록 상한을 1000으로 둔다(기본은 20 페이지네이션).
    .pipe(z.number().int().min(1).max(1000).default(20)),
})

export type EmployeeFilterDto = z.infer<typeof EmployeeFilterSchema>
