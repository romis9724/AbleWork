import { Test, TestingModule } from '@nestjs/testing'
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { AttendancesService } from './attendances.service'
import { PrismaService } from '../../prisma/prisma.service'
import { CompanySettingsService } from '../companies/company-settings.service'
import { EVENTS } from '../../events/domain-events'

// ── 픽스처 ───────────────────────────────────────────────────────────────────

const COMPANY_ID = 'company-1'
const EMPLOYEE_ID = 'emp-1'
const ATTENDANCE_ID = 'att-1'

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
    update: jest.fn(),
  },
  employee: {
    findFirst: jest.fn(),
  },
  shift: {
    findFirst: jest.fn(),
  },
  timeclockArea: {
    findFirst: jest.fn(),
  },
}

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
      ],
    }).compile()

    service = module.get<AttendancesService>(AttendancesService)
    jest.clearAllMocks()

    // 기본 설정: 지각 유예 10분, 사전 출근 30분 (defaultValue 그대로 반환)
    mockSettings.getNumber.mockImplementation(
      (_companyId: string, _section: string, _key: string, defaultValue: number) =>
        Promise.resolve(defaultValue),
    )
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
})
