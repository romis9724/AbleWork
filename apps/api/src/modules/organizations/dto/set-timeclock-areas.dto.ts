import { z } from 'zod'

/** 조직에 연결할 출퇴근 장소 집합 교체 — areaIds로 통째 교체 (N:N) */
export const SetTimeclockAreasSchema = z.object({
  areaIds: z.array(z.string().min(1)).max(100),
})

export type SetTimeclockAreasDto = z.infer<typeof SetTimeclockAreasSchema>
