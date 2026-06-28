import { z } from 'zod'

// 프론트엔드/모바일에서 보내는 간소화된 필드
export const ClockInSchema = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  method: z.enum(['gps', 'wifi', 'manual', 'web']).default('gps'),
  // 출근하는 조직/출퇴근 장소/직무 (무일정 출근 모달에서 선택)
  organizationId: z.string().optional(),
  timeclockAreaId: z.string().optional(),
  positionId: z.string().optional(),
  // 클라이언트 채널 — 웹은 WiFi 검증 수단이 없어 WiFi 필수 장소를 사용할 수 없다.
  // 기본값 'web' (현재 유일 클라이언트). 모바일 앱은 'app'을 명시해 WiFi 장소를 사용한다.
  channel: z.enum(['web', 'app']).default('web'),
  note: z.string().max(500).optional(),
})

// default가 있는 필드(method/channel)는 파이프 파싱 후 채워지므로,
// 호출부 타입에서는 선택적으로 둔다 (z.input). 서비스는 방어적으로 기본값을 적용한다.
export type ClockInDto = z.input<typeof ClockInSchema>
