import { z } from 'zod'

export const BulkCreateShiftSchema = z.object({
  templateId: z.string().min(1, '유효한 템플릿 ID를 입력하세요.'),
  organizationId: z.string().min(1, '유효한 조직 ID를 입력하세요.'),
  employeeIds: z
    .array(z.string().min(1))
    .min(1, '직원을 한 명 이상 선택하세요.'),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식으로 입력하세요.'),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식으로 입력하세요.'),
})

export type BulkCreateShiftDto = z.infer<typeof BulkCreateShiftSchema>
