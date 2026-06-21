import { z } from 'zod'

export const CreateOrganizationSchema = z.object({
  name: z.string().min(1).max(100),
  parentId: z.string().min(1).optional(),
  sortOrder: z.number().int().min(0).default(0),
  approverId: z.string().min(1).optional(),
  // AP-04-07 문서담당자 (미지정 시 approverId/팀장 fallback)
  docManagerId: z.string().min(1).optional(),
  // 부서 주소 (선택)
  address: z.string().max(1024).optional(),
})

export type CreateOrganizationDto = z.infer<typeof CreateOrganizationSchema>
