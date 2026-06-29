import { z } from 'zod'

export const AuthMethod = {
  GPS: 'gps',
  WIFI: 'wifi',
  GPS_OR_WIFI: 'gps_or_wifi',
  GPS_AND_WIFI: 'gps_and_wifi',
  NONE: 'none',
} as const

export const CreateTimeclockAreaSchema = z
  .object({
    // 출퇴근 장소 ↔ 조직은 N:N. 조직 연결은 '조직 관리' 화면에서 설정하므로 장소 생성 시엔 조직을 받지 않는다.
    name: z.string().min(1, '장소 이름을 입력하세요.').max(100),
    authMethod: z.enum(['gps', 'wifi', 'gps_or_wifi', 'gps_and_wifi', 'none'], {
      errorMap: () => ({ message: '인증 방식이 올바르지 않습니다.' }),
    }),
    locationLat: z.number().min(-90).max(90).optional(),
    locationLng: z.number().min(-180).max(180).optional(),
    locationRadiusMeters: z.number().int().positive().optional(),
    wifiSsid: z.string().max(255).optional(),
  })
  .superRefine((data, ctx) => {
    const requiresGps =
      data.authMethod === 'gps' ||
      data.authMethod === 'gps_or_wifi' ||
      data.authMethod === 'gps_and_wifi'

    const requiresWifi =
      data.authMethod === 'wifi' ||
      data.authMethod === 'gps_or_wifi' ||
      data.authMethod === 'gps_and_wifi'

    if (requiresGps) {
      if (data.locationLat == null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['locationLat'], message: 'GPS 인증에는 위도가 필요합니다.' })
      }
      if (data.locationLng == null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['locationLng'], message: 'GPS 인증에는 경도가 필요합니다.' })
      }
      if (data.locationRadiusMeters == null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['locationRadiusMeters'], message: 'GPS 인증에는 반경(m)이 필요합니다.' })
      }
    }

    if (requiresWifi && !data.wifiSsid) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['wifiSsid'], message: 'Wi-Fi 인증에는 SSID가 필요합니다.' })
    }
  })

export const UpdateTimeclockAreaSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    authMethod: z.enum(['gps', 'wifi', 'gps_or_wifi', 'gps_and_wifi', 'none']).optional(),
    locationLat: z.number().min(-90).max(90).optional(),
    locationLng: z.number().min(-180).max(180).optional(),
    locationRadiusMeters: z.number().int().positive().optional(),
    wifiSsid: z.string().max(255).optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.authMethod) return

    const requiresGps =
      data.authMethod === 'gps' ||
      data.authMethod === 'gps_or_wifi' ||
      data.authMethod === 'gps_and_wifi'

    const requiresWifi =
      data.authMethod === 'wifi' ||
      data.authMethod === 'gps_or_wifi' ||
      data.authMethod === 'gps_and_wifi'

    if (requiresGps) {
      if (data.locationLat == null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['locationLat'], message: 'GPS 인증에는 위도가 필요합니다.' })
      }
      if (data.locationLng == null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['locationLng'], message: 'GPS 인증에는 경도가 필요합니다.' })
      }
      if (data.locationRadiusMeters == null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['locationRadiusMeters'], message: 'GPS 인증에는 반경(m)이 필요합니다.' })
      }
    }

    if (requiresWifi && !data.wifiSsid) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['wifiSsid'], message: 'Wi-Fi 인증에는 SSID가 필요합니다.' })
    }
  })

export type CreateTimeclockAreaDto = z.infer<typeof CreateTimeclockAreaSchema>
export type UpdateTimeclockAreaDto = z.infer<typeof UpdateTimeclockAreaSchema>
