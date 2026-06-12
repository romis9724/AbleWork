import { z } from 'zod'

export const CustomRequestTypeFieldSchema = z.object({
  fieldName: z.string().min(1, '필드명을 입력해주세요.').max(100),
  fieldType: z.string().min(1).max(30),
  isRequired: z.boolean().optional().default(false),
  options: z.unknown().optional(),
  description: z.string().nullish(),
  imageUrl: z.string().nullish(),
})

export type CustomRequestTypeFieldDto = z.infer<
  typeof CustomRequestTypeFieldSchema
>

export const CreateCustomRequestTypeSchema = z.object({
  name: z.string().min(1, '유형명을 입력해주세요.').max(100),
  isActive: z.boolean().optional().default(true),
  enablePdf: z.boolean().optional().default(false),
  allowEmployeePdf: z.boolean().optional().default(false),
  fields: z.array(CustomRequestTypeFieldSchema).optional().default([]),
})

export type CreateCustomRequestTypeDto = z.infer<
  typeof CreateCustomRequestTypeSchema
>

export const UpdateCustomRequestTypeSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
  enablePdf: z.boolean().optional(),
  allowEmployeePdf: z.boolean().optional(),
  // fields가 주어지면 전체 교체 방식으로 갱신한다
  fields: z.array(CustomRequestTypeFieldSchema).optional(),
})

export type UpdateCustomRequestTypeDto = z.infer<
  typeof UpdateCustomRequestTypeSchema
>
