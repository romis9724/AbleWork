import { z } from 'zod'

export const UpdateOrganizationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  parentId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  approverId: z.string().uuid().nullable().optional(),
  // AP-04-07 문서담당자 (미지정 시 approverId/팀장 fallback)
  docManagerId: z.string().uuid().nullable().optional(),
  // 부서 주소 (선택, null로 해제 가능)
  address: z.string().max(1024).nullable().optional(),
})

export type UpdateOrganizationDto = z.infer<typeof UpdateOrganizationSchema>
