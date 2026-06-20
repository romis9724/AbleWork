import { z } from 'zod'

export const EmployeeFilterSchema = z.object({
  search: z.string().optional(),
  organizationId: z.string().uuid().optional(),
  positionId: z.string().uuid().optional(),
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
