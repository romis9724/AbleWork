import { z } from 'zod'

export const CreateShiftSchema = z.object({
  employeeId: z.string().uuid('유효한 직원 ID를 입력하세요.'),
  organizationId: z.string().uuid('유효한 조직 ID를 입력하세요.'),
  shiftTypeId: z.string().uuid('유효한 근무유형 ID를 입력하세요.'),
  templateId: z.string().uuid().optional(),
  startAt: z.string().datetime({ message: 'ISO 8601 형식으로 입력하세요.' }),
  endAt: z.string().datetime({ message: 'ISO 8601 형식으로 입력하세요.' }),
  isOffsite: z.boolean().optional().default(false),
  offsiteAddress: z.string().max(500).optional(),
  offsiteLat: z.number().min(-90).max(90).optional(),
  offsiteLng: z.number().min(-180).max(180).optional(),
})

export const UpdateShiftSchema = z.object({
  shiftTypeId: z.string().uuid().optional(),
  templateId: z.string().uuid().optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  isOffsite: z.boolean().optional(),
  offsiteAddress: z.string().max(500).optional(),
  offsiteLat: z.number().min(-90).max(90).optional(),
  offsiteLng: z.number().min(-180).max(180).optional(),
})

export type CreateShiftDto = z.infer<typeof CreateShiftSchema>
export type UpdateShiftDto = z.infer<typeof UpdateShiftSchema>
