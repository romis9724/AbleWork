import { z } from 'zod'

export const LoginSchema = z.object({
  email: z.string().email('유효한 이메일을 입력하세요.'),
  password: z.string().min(1, '비밀번호를 입력하세요.'),
})

export type LoginDto = z.infer<typeof LoginSchema>

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token이 필요합니다.'),
})

export type RefreshTokenDto = z.infer<typeof RefreshTokenSchema>

export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, '현재 비밀번호를 입력하세요.'),
    newPassword: z
      .string()
      .min(8, '새 비밀번호는 8자 이상이어야 합니다.')
      .regex(/[A-Za-z]/, '비밀번호에 영문자를 포함하세요.')
      .regex(/[0-9]/, '비밀번호에 숫자를 포함하세요.'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: '새 비밀번호가 일치하지 않습니다.',
    path: ['confirmPassword'],
  })

export type ChangePasswordDto = z.infer<typeof ChangePasswordSchema>
