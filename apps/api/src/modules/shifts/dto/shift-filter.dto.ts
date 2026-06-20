import { z } from 'zod'

export const ShiftFilterSchema = z.object({
  // 조회 필터의 employeeId는 형식(uuid) 강제 대신 존재 검증(서비스의 companyId 스코프)에 맡긴다.
  // (id 생성은 uuid지만, 비-UUID id 환경에서도 조회가 막히지 않도록 — 모듈 내 다른 FK와 정합)
  employeeId: z.string().min(1).optional(),
  organizationId: z.string().min(1).optional(),
  startAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식으로 입력하세요.')
    .optional(),
  endAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식으로 입력하세요.')
    .optional(),
})

export type ShiftFilterDto = z.infer<typeof ShiftFilterSchema>
