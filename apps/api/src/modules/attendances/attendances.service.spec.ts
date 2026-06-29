import { Test, TestingModule } from '@nestjs/testing'
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { AccessLevel } from '@ablework/shared-constants'
import { AttendancesService } from './attendances.service'
import { PrismaService } from '../../prisma/prisma.service'
import { CompanySettingsService } from '../companies/company-settings.service'
import { AuditService } from '../audit/audit.service'
import { EVENTS } from '../../events/domain-events'
import { JwtPayload } from '../../common/types/jwt-payload.type'

// ── 픽스처 ───────────────────────────────────────────────────────────────────

const COMPANY_ID = 'company-1'
const EMPLOYEE_ID = 'emp-1'
const ATTENDANCE_ID = 'att-1'
const ORG_ID = 'org-1'

const baseEmployee = {
  id: EMPLOYEE_ID,
  companyId: COMPANY_ID,
  name: '홍길동',
  isActive: true,
}

const baseAttendance = {
  id: ATTENDANCE_ID,
  employeeId: EMPLOYEE_ID,
  shiftId: null,
  timeclockAreaId: null,
  clockInAt: new Date('2024-06-10T09:00:00.000Z'),
  clockOutAt: null,
  status: 'normal',
  isOncall: false,
  isConfirmed: false,
  note: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const makeRequester = (accessLevel: AccessLevel, employeeId = 'req-emp-1'): JwtPayload => ({
  sub: 'user-1',
  employeeId,
  companyId: COMPANY_ID,
  accessLevel,
})

// ── 목 ──────────────────────────────────────────────────────────────────────

const mockPrisma = {
  attendance: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  },
  attendanceBreak: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  },
  employee: {
    findFirst: jest.fn(),
  },
  employeeOrganization: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  position: {
    findFirst: jest.fn(),
  },
  shift: {
    findFirst: jest.fn(),
  },
  timeclockArea: {
    findFirst: jest.fn(),
  },
  $transaction: jest.fn(),
}

// $transaction 콜백에 mockPrisma 자신을 tx로 전달
mockPrisma.$transaction.mockImplementation(
  (callback: (tx: typeof mockPrisma) => Promise<unknown>) => callback(mockPrisma),
)

const mockEvents = { emit: jest.fn() }

const mockSettings = {
  get: jest.fn(),
  getNumber: jest.fn(),
  invalidate: jest.fn(),
}

// ── 테스트 ───────────────────────────────────────────────────────────────────

describe('AttendancesService', () => {
  let service: AttendancesService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendancesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventEmitter2, useValue: mockEvents },
        { provide: CompanySettingsService, useValue: mockSettings },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile()

    service = module.get<AttendancesService>(AttendancesService)
    jest.clearAllMocks()

    // 기본 설정: 지각 유예 10분, 사전 출근 30분 (defaultValue 그대로 반환)
    mockSettings.getNumber.mockImplementation(
      (_companyId: string, _section: string, _key: string, defaultValue: number) =>
        Promise.resolve(defaultValue),
    )
    // 기본 설정: 무일정 출근 'always' 등 (defaultValue 그대로 반환)
    mockSettings.get.mockImplementation(
      (_companyId: string, _section: string, _key: string, defaultValue: unknown) =>
        Promise.resolve(defaultValue),
    )
    // 조직 경계 가드 기본 통과: 요청자·대상 모두 ORG_ID 소속으로 간주
    mockPrisma.employeeOrganization.findMany.mockResolvedValue([{ organizationId: ORG_ID }])
    // 조직 소속/직무 검증 기본 통과
    mockPrisma.employeeOrganization.findFirst.mockResolvedValue({ employeeId: EMPLOYEE_ID })
    mockPrisma.position.findFirst.mockResolvedValue({ id: 'pos-1' })
  })

  // ── determineStatus ──────────────────────────────────────────────────────

  describe('determineStatus', () => {
    it('Shift 없으면 oncall(무일정 근무)로 판정한다', async () => {
      const clockInAt = new Date('2024-06-10T09:00:00.000Z')
      const result = await service.determineStatus(COMPANY_ID, EMPLOYEE_ID, clockInAt, null)
      expect(result.status).toBe('oncall')
      expect(result.isOncall).toBe(true)
    })

    it('출근 시각이 Shift 시작 + 유예시간 이내면 normal로 판정한다', async () => {
      // Shift 09:00, clockIn 09:05 (유예 10분 이내)
      const shift = { startAt: new Date('2024-06-10T09:00:00.000Z') }
      const clockInAt = new Date('2024-06-10T09:05:00.000Z')

      const result = await service.determineStatus(COMPANY_ID, EMPLOYEE_ID, clockInAt, shift)
      expect(result.status).toBe('normal')
      expect(result.isOncall).toBe(false)
    })

    it('간주근로(isDeemedWork) 유형이면 출근 시각과 무관하게 deemed_work로 판정한다', async () => {
      // 지각 시각이어도 간주근로면 deemed_work
      const shift = {
        startAt: new Date('2024-06-10T09:00:00.000Z'),
        shiftType: { isDeemedWork: true, noClockInRequired: false },
      }
      const clockInAt = new Date('2024-06-10T11:00:00.000Z')

      const result = await service.determineStatus(COMPANY_ID, EMPLOYEE_ID, clockInAt, shift)
      expect(result.status).toBe('deemed_work')
      expect(result.isOncall).toBe(false)
    })

    it('출근 시각이 Shift 시작 + 유예시간 초과면 late로 판정한다', async () => {
      // Shift 09:00, clockIn 09:11 (유예 10분 초과)
      const shift = { startAt: new Date('2024-06-10T09:00:00.000Z') }
      const clockInAt = new Date('2024-06-10T09:11:00.000Z')

      const result = await service.determineStatus(COMPANY_ID, EMPLOYEE_ID, clockInAt, shift)
      expect(result.status).toBe('late')
      expect(result.isOncall).toBe(false)
    })

    it('출근 시각이 Shift 시작 - 사전 허용 시간보다 이르면 oncall로 판정한다', async () => {
      // Shift 09:00, clockIn 08:00 (사전 허용 30분보다 60분 이른 출근)
      const shift = { startAt: new Date('2024-06-10T09:00:00.000Z') }
      const clockInAt = new Date('2024-06-10T08:00:00.000Z')

      const result = await service.determineStatus(COMPANY_ID, EMPLOYEE_ID, clockInAt, shift)
      expect(result.status).toBe('oncall')
      expect(result.isOncall).toBe(true)
    })

    it('출근 시각이 Shift 시작 - 사전 허용 시간 이내면 normal로 판정한다', async () => {
      // Shift 09:00, clockIn 08:40 (사전 허용 30분 이내 = 08:30 이후)
      const shift = { startAt: new Date('2024-06-10T09:00:00.000Z') }
      const clockInAt = new Date('2024-06-10T08:40:00.000Z')

      const result = await service.determineStatus(COMPANY_ID, EMPLOYEE_ID, clockInAt, shift)
      expect(result.status).toBe('normal')
      expect(result.isOncall).toBe(false)
    })

    it('회사 설정에서 유예 시간을 읽어 판정한다', async () => {
      // 유예 시간 5분으로 설정
      mockSettings.getNumber.mockImplementation(
        (_companyId: string, _section: string, key: string, defaultValue: number) =>
          Promise.resolve(key === 'late_grace_minutes' ? 5 : defaultValue),
      )

      // Shift 09:00, clockIn 09:06 (유예 5분 초과)
      const shift = { startAt: new Date('2024-06-10T09:00:00.000Z') }
      const clockInAt = new Date('2024-06-10T09:06:00.000Z')

      const result = await service.determineStatus(COMPANY_ID, EMPLOYEE_ID, clockInAt, shift)
      expect(result.status).toBe('late')
    })
  })

  // ── clockIn ──────────────────────────────────────────────────────────────

  describe('clockIn', () => {
    beforeEach(() => {
      mockPrisma.employee.findFirst.mockResolvedValue(baseEmployee)
      mockPrisma.attendance.findFirst.mockResolvedValue(null) // 진행 중 없음
      mockPrisma.shift.findFirst.mockResolvedValue(null) // 무일정
      mockPrisma.attendance.create.mockResolvedValue({
        ...baseAttendance,
        status: 'oncall',
        isOncall: true,
      })
    })

    it('출근 기록을 생성하고 attendance.clock_in 이벤트를 발행한다', async () => {
      const result = await service.clockIn(COMPANY_ID, EMPLOYEE_ID, { method: 'web' })

      expect(result).toBeDefined()
      expect(mockEvents.emit).toHaveBeenCalledWith(
        EVENTS.ATTENDANCE_CLOCK_IN,
        expect.objectContaining({ companyId: COMPANY_ID, employeeId: EMPLOYEE_ID }),
      )
    })

    it('지각이면 attendance.late 이벤트도 추가로 발행한다', async () => {
      // 1시간 전에 시작한 shift → 유예 10분 초과 → late
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
      mockPrisma.shift.findFirst.mockResolvedValue({
        id: 'shift-1',
        startAt: oneHourAgo,
        endAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
      })
      mockPrisma.attendance.create.mockResolvedValue({
        ...baseAttendance,
        status: 'late',
      })

      await service.clockIn(COMPANY_ID, EMPLOYEE_ID, { method: 'web' })

      expect(mockEvents.emit).toHaveBeenCalledWith(
        EVENTS.ATTENDANCE_LATE,
        expect.objectContaining({ companyId: COMPANY_ID, employeeId: EMPLOYEE_ID }),
      )
    })

    it('이미 출근 중이면 ConflictException(ATTENDANCE_ALREADY_CLOCKED_IN)을 던진다', async () => {
      mockPrisma.attendance.findFirst.mockResolvedValue(baseAttendance) // 진행 중 있음

      await expect(service.clockIn(COMPANY_ID, EMPLOYEE_ID, { method: 'web' })).rejects.toThrow(
        ConflictException,
      )
    })

    it('직원이 없으면 NotFoundException(EMPLOYEE_NOT_FOUND)을 던진다', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(null)

      await expect(service.clockIn(COMPANY_ID, EMPLOYEE_ID, { method: 'web' })).rejects.toThrow(
        NotFoundException,
      )
    })

    it('타사 출퇴근 장소 ID를 보내면 NotFoundException(TIMECLOCK_AREA_NOT_FOUND)을 던진다', async () => {
      mockPrisma.timeclockArea.findFirst.mockResolvedValue(null)

      await expect(
        service.clockIn(COMPANY_ID, EMPLOYEE_ID, { method: 'gps', timeclockAreaId: 'other-company-area' }),
      ).rejects.toThrow(NotFoundException)
    })

    it('선택한 직무를 출근 기록에 저장한다', async () => {
      await service.clockIn(COMPANY_ID, EMPLOYEE_ID, {
        method: 'web',
        organizationId: ORG_ID,
        positionId: 'pos-1',
      })

      expect(mockPrisma.attendance.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ positionId: 'pos-1' }) }),
      )
    })

    it('본인이 소속되지 않은 조직으로 출근하면 ATTENDANCE_ORG_NOT_MEMBER로 거부한다', async () => {
      mockPrisma.employeeOrganization.findFirst.mockResolvedValue(null) // 소속 아님

      await expect(
        service.clockIn(COMPANY_ID, EMPLOYEE_ID, { method: 'web', organizationId: 'other-org' }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'ATTENDANCE_ORG_NOT_MEMBER' }),
      })
      expect(mockPrisma.attendance.create).not.toHaveBeenCalled()
    })

    it('조직과 장소가 불일치하면 TIMECLOCK_AREA_ORG_MISMATCH로 거부한다', async () => {
      mockPrisma.timeclockArea.findFirst.mockResolvedValue({
        id: 'area-1',
        authMethod: 'none',
        locationLat: null,
        locationLng: null,
        locationRadiusMeters: null,
        organizations: [{ organizationId: 'org-other' }], // 다른 조직에만 연결
      })

      await expect(
        service.clockIn(COMPANY_ID, EMPLOYEE_ID, {
          method: 'web',
          organizationId: ORG_ID,
          timeclockAreaId: 'area-1',
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'TIMECLOCK_AREA_ORG_MISMATCH' }),
      })
    })
  })

  // ── clockIn: 무일정 출근 정책 (allow_unscheduled) ─────────────────────────

  describe('clockIn — 무일정 출근 정책', () => {
    beforeEach(() => {
      mockPrisma.employee.findFirst.mockResolvedValue(baseEmployee)
      mockPrisma.attendance.findFirst.mockResolvedValue(null)
      mockPrisma.shift.findFirst.mockResolvedValue(null) // 무일정
      mockPrisma.attendance.create.mockResolvedValue({
        ...baseAttendance,
        status: 'oncall',
        isOncall: true,
      })
    })

    it("정책이 'never'면 무일정 출근을 ForbiddenException(ATTENDANCE_UNSCHEDULED_NOT_ALLOWED)으로 거부한다", async () => {
      mockSettings.get.mockImplementation(
        (_companyId: string, _section: string, key: string, defaultValue: unknown) =>
          Promise.resolve(key === 'allow_unscheduled' ? 'never' : defaultValue),
      )

      await expect(service.clockIn(COMPANY_ID, EMPLOYEE_ID, { method: 'web' })).rejects.toThrow(
        ForbiddenException,
      )
      expect(mockPrisma.attendance.create).not.toHaveBeenCalled()
    })

    it("정책이 'if_no_shift'이고 당일 Shift가 없으면 무일정 출근을 허용한다", async () => {
      mockSettings.get.mockImplementation(
        (_companyId: string, _section: string, key: string, defaultValue: unknown) =>
          Promise.resolve(key === 'allow_unscheduled' ? 'if_no_shift' : defaultValue),
      )

      const result = await service.clockIn(COMPANY_ID, EMPLOYEE_ID, { method: 'web' })

      expect(result).toBeDefined()
      expect(mockPrisma.attendance.create).toHaveBeenCalled()
    })

    it("정책이 'if_no_shift'이고 당일 Shift가 있는데 조기 출근(oncall)이면 거부한다", async () => {
      mockSettings.get.mockImplementation(
        (_companyId: string, _section: string, key: string, defaultValue: unknown) =>
          Promise.resolve(key === 'allow_unscheduled' ? 'if_no_shift' : defaultValue),
      )
      // Shift 시작이 2시간 뒤 → 사전 허용 30분보다 이른 출근 → oncall
      mockPrisma.shift.findFirst.mockResolvedValue({
        id: 'shift-1',
        startAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        endAt: new Date(Date.now() + 10 * 60 * 60 * 1000),
      })

      await expect(service.clockIn(COMPANY_ID, EMPLOYEE_ID, { method: 'web' })).rejects.toThrow(
        ForbiddenException,
      )
      expect(mockPrisma.attendance.create).not.toHaveBeenCalled()
    })

    it("정책이 'always'면 무일정 출근을 허용한다 (기본값)", async () => {
      const result = await service.clockIn(COMPANY_ID, EMPLOYEE_ID, { method: 'web' })

      expect(result).toBeDefined()
      expect(mockPrisma.attendance.create).toHaveBeenCalled()
    })
  })

  // ── clockIn: GPS 반경 검증 (haversine) ─────────────────────────────────────

  describe('clockIn — GPS 반경 검증', () => {
    // 서울시청 좌표 기준
    const AREA_LAT = 37.5665
    const AREA_LNG = 126.978

    const makeArea = (overrides: Record<string, unknown> = {}) => ({
      id: 'area-1',
      authMethod: 'gps',
      locationLat: AREA_LAT,
      locationLng: AREA_LNG,
      locationRadiusMeters: 100,
      ...overrides,
    })

    beforeEach(() => {
      mockPrisma.employee.findFirst.mockResolvedValue(baseEmployee)
      mockPrisma.attendance.findFirst.mockResolvedValue(null)
      mockPrisma.shift.findFirst.mockResolvedValue(null)
      mockPrisma.attendance.create.mockResolvedValue({
        ...baseAttendance,
        status: 'oncall',
        isOncall: true,
      })
    })

    it('반경을 초과하면 BadRequestException(ATTENDANCE_OUT_OF_RANGE)을 던진다', async () => {
      mockPrisma.timeclockArea.findFirst.mockResolvedValue(makeArea())

      // 약 4km 떨어진 좌표 (반경 100m 초과)
      await expect(
        service.clockIn(COMPANY_ID, EMPLOYEE_ID, {
          method: 'gps',
          timeclockAreaId: 'area-1',
          lat: 37.6,
          lng: 127.0,
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'ATTENDANCE_OUT_OF_RANGE' }),
      })
      expect(mockPrisma.attendance.create).not.toHaveBeenCalled()
    })

    it('반경이 0이면 거리와 무관하게 허용한다 (무제한)', async () => {
      mockPrisma.timeclockArea.findFirst.mockResolvedValue(
        makeArea({ locationRadiusMeters: 0 }),
      )

      const result = await service.clockIn(COMPANY_ID, EMPLOYEE_ID, {
        method: 'gps',
        timeclockAreaId: 'area-1',
        lat: 37.6,
        lng: 127.0,
      })

      expect(result).toBeDefined()
      expect(mockPrisma.attendance.create).toHaveBeenCalled()
    })

    it('반경 이내면 허용한다', async () => {
      mockPrisma.timeclockArea.findFirst.mockResolvedValue(makeArea())

      // 장소 좌표와 동일한 위치 (거리 0m)
      const result = await service.clockIn(COMPANY_ID, EMPLOYEE_ID, {
        method: 'gps',
        timeclockAreaId: 'area-1',
        lat: AREA_LAT,
        lng: AREA_LNG,
      })

      expect(result).toBeDefined()
    })

    it('GPS 필수 장소에 lat/lng 없이 출근하면 BadRequestException(ATTENDANCE_LOCATION_REQUIRED)을 던진다', async () => {
      mockPrisma.timeclockArea.findFirst.mockResolvedValue(makeArea())

      await expect(
        service.clockIn(COMPANY_ID, EMPLOYEE_ID, { method: 'gps', timeclockAreaId: 'area-1' }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'ATTENDANCE_LOCATION_REQUIRED' }),
      })
    })

    it('gps_or_wifi 장소는 앱(channel=app)에서 반경을 초과해도 거부하지 않는다 (WiFi 폴백)', async () => {
      mockPrisma.timeclockArea.findFirst.mockResolvedValue(
        makeArea({ authMethod: 'gps_or_wifi' }),
      )

      const result = await service.clockIn(COMPANY_ID, EMPLOYEE_ID, {
        method: 'gps',
        channel: 'app',
        timeclockAreaId: 'area-1',
        lat: 37.6,
        lng: 127.0,
      })

      expect(result).toBeDefined()
    })

    it('gps_or_wifi 장소는 웹(channel=web)에서 반경 초과 시 거부한다 (WiFi 수단 없음 → GPS 필수)', async () => {
      mockPrisma.timeclockArea.findFirst.mockResolvedValue(
        makeArea({ authMethod: 'gps_or_wifi' }),
      )

      await expect(
        service.clockIn(COMPANY_ID, EMPLOYEE_ID, {
          method: 'gps',
          channel: 'web',
          timeclockAreaId: 'area-1',
          lat: 37.6,
          lng: 127.0,
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'ATTENDANCE_OUT_OF_RANGE' }),
      })
    })

    it('웹(channel=web)에서 WiFi 필수 장소(wifi)는 ATTENDANCE_WIFI_APP_ONLY로 거부한다', async () => {
      mockPrisma.timeclockArea.findFirst.mockResolvedValue(makeArea({ authMethod: 'wifi' }))

      await expect(
        service.clockIn(COMPANY_ID, EMPLOYEE_ID, {
          method: 'web',
          channel: 'web',
          timeclockAreaId: 'area-1',
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'ATTENDANCE_WIFI_APP_ONLY' }),
      })
      expect(mockPrisma.attendance.create).not.toHaveBeenCalled()
    })

    it('웹(channel=web)에서 gps_and_wifi 장소도 ATTENDANCE_WIFI_APP_ONLY로 거부한다', async () => {
      mockPrisma.timeclockArea.findFirst.mockResolvedValue(makeArea({ authMethod: 'gps_and_wifi' }))

      await expect(
        service.clockIn(COMPANY_ID, EMPLOYEE_ID, {
          method: 'gps',
          channel: 'web',
          timeclockAreaId: 'area-1',
          lat: AREA_LAT,
          lng: AREA_LNG,
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'ATTENDANCE_WIFI_APP_ONLY' }),
      })
    })

    it("authMethod가 'none'이면 GPS 검증을 생략한다", async () => {
      mockPrisma.timeclockArea.findFirst.mockResolvedValue(makeArea({ authMethod: 'none' }))

      const result = await service.clockIn(COMPANY_ID, EMPLOYEE_ID, {
        method: 'web',
        timeclockAreaId: 'area-1',
      })

      expect(result).toBeDefined()
    })
  })

  // ── clockOut ─────────────────────────────────────────────────────────────

  describe('clockOut', () => {
    it('퇴근 기록을 업데이트한다', async () => {
      const clockOutAt = new Date()
      mockPrisma.attendance.findFirst.mockResolvedValue(baseAttendance)
      mockPrisma.attendance.update.mockResolvedValue({
        ...baseAttendance,
        clockOutAt,
      })

      const result = await service.clockOut(COMPANY_ID, EMPLOYEE_ID, { method: 'web' })
      expect(result.clockOutAt).toEqual(clockOutAt)
    })

    it('확정된 기록이면 BadRequestException(ATTENDANCE_ALREADY_CONFIRMED)을 던진다', async () => {
      mockPrisma.attendance.findFirst.mockResolvedValue({
        ...baseAttendance,
        isConfirmed: true,
      })

      await expect(service.clockOut(COMPANY_ID, EMPLOYEE_ID, { method: 'web' })).rejects.toThrow(
        BadRequestException,
      )
    })

    it('Shift 종료 전에 퇴근하면 status를 early_leave로 갱신한다', async () => {
      const shiftEndAt = new Date(Date.now() + 2 * 60 * 60 * 1000) // 2시간 뒤 종료
      mockPrisma.attendance.findFirst.mockResolvedValue({
        ...baseAttendance,
        shiftId: 'shift-1',
        status: 'normal',
      })
      mockPrisma.shift.findFirst.mockResolvedValue({ endAt: shiftEndAt })
      mockPrisma.attendance.update.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ ...baseAttendance, ...data }),
      )

      const result = await service.clockOut(COMPANY_ID, EMPLOYEE_ID, { method: 'web' })

      expect(result.status).toBe('early_leave')
      expect(mockPrisma.attendance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'early_leave' }),
        }),
      )
    })

    it('지각(late) 상태에서 조퇴해도 late를 유지한다 (조퇴로 덮지 않음)', async () => {
      const shiftEndAt = new Date(Date.now() + 2 * 60 * 60 * 1000)
      mockPrisma.attendance.findFirst.mockResolvedValue({
        ...baseAttendance,
        shiftId: 'shift-1',
        status: 'late',
      })
      mockPrisma.shift.findFirst.mockResolvedValue({ endAt: shiftEndAt })
      mockPrisma.attendance.update.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ ...baseAttendance, status: 'late', ...data }),
      )

      const result = await service.clockOut(COMPANY_ID, EMPLOYEE_ID, { method: 'web' })

      expect(result.status).toBe('late')
      expect(mockPrisma.attendance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({ status: expect.anything() }),
        }),
      )
    })

    it('Shift 종료 이후 퇴근하면 status를 변경하지 않는다', async () => {
      const shiftEndAt = new Date(Date.now() - 60 * 60 * 1000) // 1시간 전 종료
      mockPrisma.attendance.findFirst.mockResolvedValue({
        ...baseAttendance,
        shiftId: 'shift-1',
        status: 'normal',
      })
      mockPrisma.shift.findFirst.mockResolvedValue({ endAt: shiftEndAt })
      mockPrisma.attendance.update.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ ...baseAttendance, ...data }),
      )

      const result = await service.clockOut(COMPANY_ID, EMPLOYEE_ID, { method: 'web' })

      expect(result.status).toBe('normal')
      expect(mockPrisma.attendance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({ status: expect.anything() }),
        }),
      )
    })

    it('연결된 Shift가 없으면 status를 변경하지 않는다', async () => {
      mockPrisma.attendance.findFirst.mockResolvedValue(baseAttendance) // shiftId: null
      mockPrisma.attendance.update.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ ...baseAttendance, ...data }),
      )

      await service.clockOut(COMPANY_ID, EMPLOYEE_ID, { method: 'web' })

      expect(mockPrisma.shift.findFirst).not.toHaveBeenCalled()
      expect(mockPrisma.attendance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({ status: expect.anything() }),
        }),
      )
    })
  })

  // ── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('확정되지 않은 기록을 수정한다', async () => {
      mockPrisma.attendance.findFirst.mockResolvedValue(baseAttendance)
      mockPrisma.attendance.update.mockResolvedValue({
        ...baseAttendance,
        status: 'late',
      })

      const result = await service.update(COMPANY_ID, ATTENDANCE_ID, { status: 'late' })
      expect(result.status).toBe('late')
    })

    it('확정된 기록이면 ATTENDANCE_ALREADY_CONFIRMED 에러를 던진다', async () => {
      mockPrisma.attendance.findFirst.mockResolvedValue({
        ...baseAttendance,
        isConfirmed: true,
      })

      await expect(
        service.update(COMPANY_ID, ATTENDANCE_ID, { status: 'late' }),
      ).rejects.toThrow(BadRequestException)
    })
  })

  // ── remove ───────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('확정되지 않은 기록을 삭제한다', async () => {
      mockPrisma.attendance.findFirst.mockResolvedValue(baseAttendance)
      mockPrisma.attendance.delete.mockResolvedValue(baseAttendance)

      await expect(service.remove(COMPANY_ID, ATTENDANCE_ID)).resolves.toBeDefined()
      expect(mockPrisma.attendance.delete).toHaveBeenCalledWith({
        where: { id: ATTENDANCE_ID },
      })
    })

    it('확정된 기록은 삭제할 수 없다', async () => {
      mockPrisma.attendance.findFirst.mockResolvedValue({
        ...baseAttendance,
        isConfirmed: true,
      })

      await expect(service.remove(COMPANY_ID, ATTENDANCE_ID)).rejects.toThrow(BadRequestException)
    })
  })

  // ── confirmPeriod ────────────────────────────────────────────────────────

  describe('confirmPeriod', () => {
    it('기간 내 미확정 기록을 확정 처리한다', async () => {
      mockPrisma.attendance.updateMany.mockResolvedValue({ count: 5 })

      const result = await service.confirmPeriod(
        COMPANY_ID,
        { startDate: '2024-06-01', endDate: '2024-06-30' },
        'confirmer-emp-id',
      )

      expect(result.confirmed).toBe(5)
      expect(mockPrisma.attendance.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isConfirmed: true }),
        }),
      )
    })
  })

  // ── unconfirm ────────────────────────────────────────────────────────────

  describe('unconfirm', () => {
    it('GENERAL_ADMIN이 ID 목록으로 확정을 해제한다', async () => {
      mockPrisma.attendance.updateMany.mockResolvedValue({ count: 2 })

      const result = await service.unconfirm(
        COMPANY_ID,
        { attendanceIds: ['11111111-1111-1111-1111-111111111111'] },
        makeRequester(AccessLevel.GENERAL_ADMIN),
      )

      expect(result.unconfirmed).toBe(2)
      expect(mockPrisma.attendance.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            employee: { companyId: COMPANY_ID },
            isConfirmed: true,
          }),
          data: { isConfirmed: false, confirmedBy: null, confirmedAt: null },
        }),
      )
    })

    it('기간(startDate/endDate)으로 확정을 해제한다', async () => {
      mockPrisma.attendance.updateMany.mockResolvedValue({ count: 3 })

      const result = await service.unconfirm(
        COMPANY_ID,
        { startDate: '2024-06-01', endDate: '2024-06-30' },
        makeRequester(AccessLevel.SUPER_ADMIN),
      )

      expect(result.unconfirmed).toBe(3)
      expect(mockPrisma.attendance.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isConfirmed: true,
            clockInAt: expect.any(Object),
          }),
        }),
      )
    })

    it('ORG_ADMIN이 확정 해제를 시도하면 ForbiddenException을 던진다', async () => {
      await expect(
        service.unconfirm(
          COMPANY_ID,
          { startDate: '2024-06-01', endDate: '2024-06-30' },
          makeRequester(AccessLevel.ORG_ADMIN),
        ),
      ).rejects.toThrow(ForbiddenException)
      expect(mockPrisma.attendance.updateMany).not.toHaveBeenCalled()
    })
  })

  // ── createManual (관리자 수기 추가) ─────────────────────────────────────────

  describe('createManual', () => {
    it('status 미지정 시 determineStatus로 자동 판정하여 수기 기록을 생성한다', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(baseEmployee)
      mockPrisma.shift.findFirst.mockResolvedValue(null) // 당일 Shift 없음 → oncall
      mockPrisma.attendance.create.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ ...baseAttendance, ...data }),
      )

      const result = await service.createManual(COMPANY_ID, {
        employeeId: EMPLOYEE_ID,
        clockInAt: '2024-06-10T09:00:00.000Z',
        clockOutAt: '2024-06-10T18:00:00.000Z',
        note: '수기 등록',
      })

      expect(result.status).toBe('oncall')
      expect(mockPrisma.attendance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            employeeId: EMPLOYEE_ID,
            clockInMethod: 'manual',
            clockOutMethod: 'manual',
            status: 'oncall',
            isOncall: true,
            note: '수기 등록',
          }),
        }),
      )
    })

    it('직원이 회사 소속이 아니면 NotFoundException(EMPLOYEE_NOT_FOUND)을 던진다', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(null)

      await expect(
        service.createManual(COMPANY_ID, {
          employeeId: 'other-company-emp',
          clockInAt: '2024-06-10T09:00:00.000Z',
        }),
      ).rejects.toThrow(NotFoundException)
      expect(mockPrisma.attendance.create).not.toHaveBeenCalled()
    })
  })

  // ── updateBreaks (휴게 전체 교체) ───────────────────────────────────────────

  describe('updateBreaks', () => {
    it('$transaction으로 휴게 기록을 전체 교체한다 (확정 기록은 차단)', async () => {
      // 미확정 기록 → 교체 수행
      mockPrisma.attendance.findFirst.mockResolvedValue(baseAttendance)
      mockPrisma.attendanceBreak.deleteMany.mockResolvedValue({ count: 1 })
      mockPrisma.attendanceBreak.createMany.mockResolvedValue({ count: 2 })
      const replaced = [
        { id: 'brk-1', attendanceId: ATTENDANCE_ID, breakType: 'rest' },
        { id: 'brk-2', attendanceId: ATTENDANCE_ID, breakType: 'meal' },
      ]
      mockPrisma.attendanceBreak.findMany.mockResolvedValue(replaced)

      const result = await service.updateBreaks(
        COMPANY_ID,
        ATTENDANCE_ID,
        {
          breaks: [
            { breakType: 'rest', startAt: '2024-06-10T12:00:00.000Z', endAt: '2024-06-10T13:00:00.000Z' },
            { breakType: 'meal', startAt: '2024-06-10T15:00:00.000Z' },
          ],
        },
        makeRequester(AccessLevel.GENERAL_ADMIN),
      )

      expect(result).toEqual(replaced)
      expect(mockPrisma.attendanceBreak.deleteMany).toHaveBeenCalledWith({
        where: { attendanceId: ATTENDANCE_ID },
      })
      expect(mockPrisma.attendanceBreak.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ breakType: 'rest', isManual: true }),
            expect.objectContaining({ breakType: 'meal', endAt: null }),
          ]),
        }),
      )

      // 확정된 기록 → BadRequestException(ATTENDANCE_ALREADY_CONFIRMED)
      mockPrisma.attendance.findFirst.mockResolvedValue({
        ...baseAttendance,
        isConfirmed: true,
      })
      await expect(
        service.updateBreaks(
          COMPANY_ID,
          ATTENDANCE_ID,
          { breaks: [] },
          makeRequester(AccessLevel.GENERAL_ADMIN),
        ),
      ).rejects.toThrow(BadRequestException)
    })

    it('ORG_ADMIN이 타 조직 출퇴근 휴게를 교체하면 ForbiddenException을 던진다', async () => {
      mockPrisma.attendance.findFirst.mockResolvedValue(baseAttendance) // 대상 직원 EMPLOYEE_ID
      // 요청자 org-A, 대상 org-B → 교집합 없음
      mockPrisma.employeeOrganization.findMany.mockImplementation(
        ({ where }: { where: { employeeId: string } }) =>
          Promise.resolve(
            where.employeeId === 'admin-1'
              ? [{ organizationId: 'org-A' }]
              : [{ organizationId: 'org-B' }],
          ),
      )

      await expect(
        service.updateBreaks(
          COMPANY_ID,
          ATTENDANCE_ID,
          { breaks: [] },
          makeRequester(AccessLevel.ORG_ADMIN, 'admin-1'),
        ),
      ).rejects.toThrow(ForbiddenException)
    })

    it('ORG_ADMIN이 본인 조직 출퇴근 휴게를 교체하면 통과한다', async () => {
      mockPrisma.attendance.findFirst.mockResolvedValue(baseAttendance)
      mockPrisma.attendanceBreak.deleteMany.mockResolvedValue({ count: 0 })
      mockPrisma.attendanceBreak.findMany.mockResolvedValue([])
      // 요청자·대상 모두 org-B 공유 → 통과
      mockPrisma.employeeOrganization.findMany.mockResolvedValue([{ organizationId: 'org-B' }])

      await expect(
        service.updateBreaks(
          COMPANY_ID,
          ATTENDANCE_ID,
          { breaks: [] },
          makeRequester(AccessLevel.ORG_ADMIN, 'admin-1'),
        ),
      ).resolves.toEqual([])
    })
  })

  // ── getMyToday (내 오늘 출근 상태) ──────────────────────────────────────────

  describe('getMyToday', () => {
    it('미퇴근 레코드와 열린 휴게를 반환하고, 출근 기록이 없으면 null을 반환한다', async () => {
      const openBreak = { id: 'brk-1', attendanceId: ATTENDANCE_ID, endAt: null }
      mockPrisma.attendance.findFirst.mockResolvedValue({
        ...baseAttendance,
        breaks: [
          { id: 'brk-0', attendanceId: ATTENDANCE_ID, endAt: new Date() },
          openBreak,
        ],
      })

      const withRecord = await service.getMyToday(COMPANY_ID, EMPLOYEE_ID)
      expect(withRecord.attendance?.id).toBe(ATTENDANCE_ID)
      expect(withRecord.openBreak).toEqual(openBreak)

      mockPrisma.attendance.findFirst.mockResolvedValue(null)
      const empty = await service.getMyToday(COMPANY_ID, EMPLOYEE_ID)
      expect(empty).toEqual({ attendance: null, openBreak: null })
    })
  })
})
