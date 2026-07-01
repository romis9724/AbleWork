import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common'
import { AttendanceStatus, TimeclockAuthMethod } from '@ablework/shared-constants'
import { PrismaService } from '../../prisma/prisma.service'
import { CompanySettingsService } from '../companies/company-settings.service'

/** 출근 상태 판정에 필요한 회사 설정 키 */
const LATE_GRACE_MINUTES_KEY = 'late_grace_minutes'
const CLOCKIN_BEFORE_SHIFT_MINUTES_KEY = 'clockin_before_shift_minutes'
const ALLOW_UNSCHEDULED_KEY = 'allow_unscheduled'

/** 무일정 출근 정책 값 */
const UnscheduledPolicy = {
  ALWAYS: 'always',
  IF_NO_SHIFT: 'if_no_shift',
  NEVER: 'never',
} as const

/** GPS 검증이 필요한 출퇴근 장소 인증 방식 */
const GPS_AUTH_METHODS: readonly string[] = [
  TimeclockAuthMethod.GPS,
  TimeclockAuthMethod.GPS_OR_WIFI,
  TimeclockAuthMethod.GPS_AND_WIFI,
]

/** 지구 평균 반경 (m) — haversine 거리 계산용 */
const EARTH_RADIUS_METERS = 6_371_000

/** GPS 검증에 필요한 출퇴근 장소 필드 */
interface TimeclockAreaForGps {
  authMethod: string
  locationLat: unknown | null
  locationLng: unknown | null
  locationRadiusMeters: number | null
}

/**
 * 출근 판정·출퇴근 장소(지오/채널)·무일정 정책 검증 클러스터 (god file 분할 · 항목 24).
 * clockIn/clockOut/createManual이 오케스트레이션하며 이 서비스의 검증·판정을 호출한다.
 */
@Injectable()
export class AttendanceClockInService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: CompanySettingsService,
  ) {}

  async determineStatus(
    companyId: string,
    _employeeId: string,
    clockInAt: Date,
    shift: {
      startAt: Date
      shiftType?: { isDeemedWork: boolean; noClockInRequired: boolean } | null
    } | null,
  ): Promise<{ status: string; isOncall: boolean }> {
    if (!shift) {
      return { status: 'oncall', isOncall: true }
    }

    // 간주근로(isDeemedWork) 유형은 출근 시각과 무관하게 deemed_work 로 판정
    if (shift.shiftType?.isDeemedWork) {
      return { status: 'deemed_work', isOncall: false }
    }

    const [lateGrace, clockinBefore] = await Promise.all([
      this.settingsService.getNumber(companyId, 'attendance', LATE_GRACE_MINUTES_KEY, 10),
      this.settingsService.getNumber(companyId, 'attendance', CLOCKIN_BEFORE_SHIFT_MINUTES_KEY, 30),
    ])

    const shiftStartMs = shift.startAt.getTime()
    const clockInMs = clockInAt.getTime()
    const lateThresholdMs = shiftStartMs + lateGrace * 60 * 1000
    const earlyThresholdMs = shiftStartMs - clockinBefore * 60 * 1000

    if (clockInMs > lateThresholdMs) {
      return { status: 'late', isOncall: false }
    }

    if (clockInMs < earlyThresholdMs) {
      return { status: 'oncall', isOncall: true }
    }

    return { status: 'normal', isOncall: false }
  }

  async findShiftForClockIn(
    employeeId: string,
    clockInAt: Date,
  ): Promise<{
    id: string
    startAt: Date
    endAt: Date
    shiftType: { isDeemedWork: boolean; noClockInRequired: boolean } | null
  } | null> {
    const dayStart = new Date(clockInAt)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(clockInAt)
    dayEnd.setHours(23, 59, 59, 999)

    return this.prisma.shift.findFirst({
      where: {
        employeeId,
        startAt: { gte: dayStart, lte: dayEnd },
      },
      orderBy: { startAt: 'asc' },
      select: {
        id: true,
        startAt: true,
        endAt: true,
        shiftType: { select: { isDeemedWork: true, noClockInRequired: true } },
      },
    })
  }

  async assertTimeclockAreaBelongsToCompany(companyId: string, timeclockAreaId: string) {
    const area = await this.prisma.timeclockArea.findFirst({
      where: { id: timeclockAreaId, isActive: true, companyId },
      select: {
        id: true,
        authMethod: true,
        locationLat: true,
        locationLng: true,
        locationRadiusMeters: true,
        organizations: { select: { organizationId: true } },
      },
    })
    if (!area) {
      throw new NotFoundException({
        code: 'TIMECLOCK_AREA_NOT_FOUND',
        message: '출퇴근 장소를 찾을 수 없습니다.',
      })
    }
    return area
  }

  /**
   * 직원이 해당 조직에 소속되어 있는지 검증 (무일정 출근 모달의 조직 선택 정합).
   */
  async assertOrgMembership(employeeId: string, organizationId: string): Promise<void> {
    const membership = await this.prisma.employeeOrganization.findFirst({
      where: { employeeId, organizationId },
      select: { employeeId: true },
    })
    if (!membership) {
      throw new BadRequestException({
        code: 'ATTENDANCE_ORG_NOT_MEMBER',
        message: '본인이 소속되지 않은 조직으로는 출근할 수 없습니다.',
      })
    }
  }

  /**
   * 선택한 직무가 자사 소속이며 활성인지 검증.
   */
  async assertPositionBelongsToCompany(
    companyId: string,
    positionId: string,
  ): Promise<void> {
    const position = await this.prisma.position.findFirst({
      where: { id: positionId, companyId, isActive: true },
      select: { id: true },
    })
    if (!position) {
      throw new NotFoundException({
        code: 'POSITION_NOT_FOUND',
        message: '직무를 찾을 수 없습니다.',
      })
    }
  }

  /**
   * 채널별 출퇴근 장소 사용 가능 여부 검증.
   *
   * 웹은 WiFi 검증 수단이 없으므로 WiFi가 필수인 장소(wifi 단독, gps_and_wifi)는 사용할 수 없다.
   * 모바일 앱(channel: 'app')만 WiFi 장소를 사용할 수 있다. (프론트에서도 웹에는 노출하지 않음 — 이중 방어)
   */
  assertAreaChannelAllowed(area: { authMethod: string }, channel: string): void {
    if (channel !== 'web') {
      return
    }
    const requiresWifi =
      area.authMethod === TimeclockAuthMethod.WIFI ||
      area.authMethod === TimeclockAuthMethod.GPS_AND_WIFI
    if (requiresWifi) {
      throw new BadRequestException({
        code: 'ATTENDANCE_WIFI_APP_ONLY',
        message: 'WiFi 인증이 필요한 출퇴근 장소는 모바일 앱에서만 사용할 수 있습니다.',
      })
    }
  }

  /**
   * 무일정 출근 정책 검증 (CLAUDE.md §6 — company_settings.attendance.allow_unscheduled)
   *
   * - 'always'      → 항상 허용
   * - 'if_no_shift' → 당일 Shift가 없으면 허용, Shift가 있는데 oncall(조기 출근 케이스)이면 거부
   * - 'never'       → 무일정 출근 거부
   */
  async assertUnscheduledAllowed(
    companyId: string,
    shift: { id: string } | null,
  ): Promise<void> {
    const policy = await this.settingsService.get<string>(
      companyId,
      'attendance',
      ALLOW_UNSCHEDULED_KEY,
      UnscheduledPolicy.ALWAYS,
    )

    const isNever = policy === UnscheduledPolicy.NEVER
    const isConditionalRejected = policy === UnscheduledPolicy.IF_NO_SHIFT && shift !== null

    if (isNever || isConditionalRejected) {
      throw new ForbiddenException({
        code: 'ATTENDANCE_UNSCHEDULED_NOT_ALLOWED',
        message: '무일정 출근이 허용되지 않습니다.',
      })
    }
  }

  /**
   * GPS 반경 검증 (haversine)
   *
   * - authMethod가 gps 계열(gps, gps_or_wifi, gps_and_wifi)이 아니면 검증 생략 (none/wifi)
   * - 장소 좌표 미설정 또는 반경 0/null → 무제한 허용
   * - lat/lng 미전송 + gps 필수 장소 → ATTENDANCE_LOCATION_REQUIRED
   * - 반경 초과 → ATTENDANCE_OUT_OF_RANGE
   * - gps_or_wifi는 모바일 앱(channel='app')에서만 GPS 실패 시 WiFi로 폴백(통과)한다.
   *   웹(channel='web')은 WiFi 검증 수단이 없으므로 gps_or_wifi도 GPS 필수로 취급한다.
   */
  assertWithinTimeclockArea(
    area: TimeclockAreaForGps,
    lat?: number,
    lng?: number,
    channel = 'web',
  ): void {
    if (!GPS_AUTH_METHODS.includes(area.authMethod)) {
      return // none / wifi → GPS 검증 생략
    }
    if (area.locationLat == null || area.locationLng == null) {
      return // 좌표 미설정 장소는 거리 검증 불가 → 허용
    }
    const radiusMeters = area.locationRadiusMeters
    if (!radiusMeters) {
      return // 반경 0 또는 null = 무제한 허용
    }

    // gps_or_wifi는 앱에서만 GPS 실패 시 WiFi 검증으로 폴백한다 (웹은 WiFi 수단 없음 → GPS 필수).
    const isGpsOptional = area.authMethod === TimeclockAuthMethod.GPS_OR_WIFI && channel === 'app'

    if (lat == null || lng == null) {
      if (isGpsOptional) {
        return
      }
      throw new BadRequestException({
        code: 'ATTENDANCE_LOCATION_REQUIRED',
        message: 'GPS 위치 정보(lat/lng)가 필요한 출퇴근 장소입니다.',
      })
    }

    const distanceMeters = this.haversineDistanceMeters(
      lat,
      lng,
      Number(area.locationLat),
      Number(area.locationLng),
    )

    if (distanceMeters > radiusMeters) {
      if (isGpsOptional) {
        return
      }
      throw new BadRequestException({
        code: 'ATTENDANCE_OUT_OF_RANGE',
        message: `출퇴근 장소 허용 반경을 벗어났습니다. (현재 거리 ${Math.round(distanceMeters)}m, 허용 반경 ${radiusMeters}m)`,
      })
    }
  }

  /** 두 좌표 간 haversine 거리(m) 계산 */
  private haversineDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const toRad = (deg: number): number => (deg * Math.PI) / 180

    const dLat = toRad(lat2 - lat1)
    const dLng = toRad(lng2 - lng1)

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

    return EARTH_RADIUS_METERS * c
  }

  /**
   * 퇴근 시 조퇴(early_leave) 판정.
   *
   * - 연결된 Shift가 없으면 상태 변경 없음
   * - clockOutAt < shift.endAt → 'early_leave'
   * - 단, 기존 status가 'late'면 유지: 지각 + 조퇴가 모두 해당하는 경우
   *   Shiftee 동작이 모호하므로 조퇴로 덮어쓰지 않고 'late'를 우선한다.
   */
  async resolveClockOutStatus(
    attendance: { shiftId: string | null; status: string },
    clockOutAt: Date,
  ): Promise<string | undefined> {
    if (!attendance.shiftId) {
      return undefined
    }

    const shift = await this.prisma.shift.findFirst({
      where: { id: attendance.shiftId },
      select: { endAt: true },
    })
    if (!shift || clockOutAt.getTime() >= shift.endAt.getTime()) {
      return undefined
    }

    // 지각 + 조퇴 모두 해당 → 'late' 유지 (조퇴로 덮지 않음)
    if (attendance.status === AttendanceStatus.LATE) {
      return undefined
    }

    return AttendanceStatus.EARLY_LEAVE
  }
}
