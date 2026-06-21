/**
 * GlobalExceptionFilter가 발행하고 ErrorAnalysisService가 구독하는 에러 이벤트 페이로드.
 * (EVENTS.API_ERROR_DETECTED)
 */
export interface ApiErrorEvent {
  /** HTTP 상태 코드 */
  status: number
  /** 에러 코드(BAD_REQUEST·VALIDATION_ERROR·INTERNAL_SERVER_ERROR 등) */
  code: string
  /** 사용자 표시 메시지 */
  message: string
  /** 요청 메서드 */
  method: string
  /** 요청 경로 */
  path: string
  /** 인증된 요청이면 회사 ID(JWT) */
  companyId?: string
  /** 인증된 요청이면 사용자 ID(JWT sub) */
  userId?: string
  /** 검증 실패 등 상세(4xx) */
  details?: unknown
  /** 서버 오류 스택(5xx) */
  stack?: string
  /** 발생 시각(ISO) */
  at: string
}
