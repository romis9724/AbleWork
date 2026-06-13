import { AxiosError } from 'axios'

interface ApiErrorBody {
  success?: boolean
  error?: { code?: string; message?: string }
}

/**
 * 백엔드 표준 에러 응답({ success:false, error:{ code, message } })에서
 * 사용자에게 보여줄 메시지를 추출한다. 메시지가 없으면 fallback을 반환한다.
 *
 * 예: 참조무결성 가드(FORM_IN_USE 등)가 반환하는 구체 메시지를 토스트에 그대로 노출.
 */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof AxiosError) {
    const body = error.response?.data as ApiErrorBody | undefined
    const message = body?.error?.message
    if (typeof message === 'string' && message.trim().length > 0) {
      return message
    }
  }
  return fallback
}
