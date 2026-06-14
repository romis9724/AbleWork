import { z } from 'zod'

/** AP-04-07 부서 문서담당자 집합 교체 — employeeIds 순서가 우선순위(첫 번째=대표) */
export const SetDocManagersSchema = z.object({
  employeeIds: z.array(z.string().uuid()).max(20),
})

export type SetDocManagersDto = z.infer<typeof SetDocManagersSchema>
