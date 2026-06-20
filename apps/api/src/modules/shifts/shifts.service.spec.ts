import { Test, TestingModule } from '@nestjs/testing'
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common'
import { ShiftsService } from './shifts.service'
import { PrismaService } from '../../prisma/prisma.service'
import { AccessLevel, ShiftStatus } from '@ablework/shared-constants'
import { JwtPayload } from '../../common/types/jwt-payload.type'

// ── 픽스처 ────────────────────────────────────────────────────────────────────

const COMPANY_ID = 'company-1'
const SHIFT_ID = 'shift-1'
const EMPLOYEE_ID = 'employee-1'
const ORG_ID = 'org-1'
const SHIFT_TYPE_ID = 'shift-type-1'
const TEMPLATE_ID = 'template-1'

const makeRequester = (accessLevel: AccessLevel, employeeId = 'req-emp-1'): JwtPayload => ({
  sub: 'user-1',
  employeeId,
  companyId: COMPANY_ID,
  accessLevel,
})

const baseShift = {
  id: SHIFT_ID,
  employeeId: EMPLOYEE_ID,
  organizationId: ORG_ID,
  shiftTypeId: SHIFT_TYPE_ID,
  templateId: null,
  startAt: new Date('2024-06-10T09:00:00.000Z'),
  endAt: new Date('2024-06-10T18:00:00.000Z'),
  isOffsite: false,
  offsiteAddress: null,
  offsiteLat: null,
  offsiteLng: null,
  status: ShiftStatus.DRAFT,
  confirmedBy: null,
  confirmedAt: null,
  createdBy: 'req-emp-1',
  createdAt: new Date(),
  updatedAt: new Date(),
}

const mockPrisma = {
  shift: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  shiftTemplate: {
    findFirst: jest.fn(),
  },
  shiftType: {
    findFirst: jest.fn(),
  },
  organization: {
    findFirst: jest.fn(),
  },
  employee: {
    count: jest.fn(),
  },
}

// ── 테스트 ────────────────────────────────────────────────────────────────────

describe('ShiftsService', () => {
  let service: ShiftsService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShiftsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile()

    service = module.get<ShiftsService>(ShiftsService)
    jest.clearAllMocks()

    // 멀티테넌시 검증 기본 통과: 요청된 직원 수만큼 자사 소속으로 간주
    mockPrisma.employee.count.mockImplementation(
      ({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(where.id.in.length),
    )
  })

  // ── findAll (조회 스코핑, C6-4 보안) ─────────────────────────────────────────

  describe('findAll', () => {
    beforeEach(() => {
      mockPrisma.shift.findMany.mockResolvedValue([])
    })

    it('EMPLOYEE는 filter.employeeId를 무시하고 본인 일정만 조회한다', async () => {
      await service.findAll(
        COMPANY_ID,
        { employeeId: 'someone-else' },
        makeRequester(AccessLevel.EMPLOYEE, 'me-1'),
      )

      const where = mockPrisma.shift.findMany.mock.calls[0][0].where
      expect(where.employeeId).toBe('me-1') // 타인 id 무시, 본인으로 강제
      expect(where.organization).toEqual({ companyId: COMPANY_ID })
    })

    it('EMPLOYEE가 필터를 생략해도 본인 일정만 조회한다 (전직원 노출 차단)', async () => {
      await service.findAll(COMPANY_ID, {}, makeRequester(AccessLevel.EMPLOYEE, 'me-1'))

      const where = mockPrisma.shift.findMany.mock.calls[0][0].where
      expect(where.employeeId).toBe('me-1')
    })

    it('ORG_ADMIN은 filter.employeeId로 타 직원 일정을 조회할 수 있다', async () => {
      await service.findAll(
        COMPANY_ID,
        { employeeId: 'target-emp' },
        makeRequester(AccessLevel.ORG_ADMIN, 'admin-1'),
      )

      const where = mockPrisma.shift.findMany.mock.calls[0][0].where
      expect(where.employeeId).toBe('target-emp')
    })

    it('ORG_ADMIN이 employeeId 필터 없이 조회하면 회사 전체(employeeId 무제한)를 조회한다', async () => {
      await service.findAll(COMPANY_ID, {}, makeRequester(AccessLevel.GENERAL_ADMIN, 'admin-1'))

      const where = mockPrisma.shift.findMany.mock.calls[0][0].where
      expect(where.employeeId).toBeUndefined()
      expect(where.organization).toEqual({ companyId: COMPANY_ID })
    })
  })

  // ── create ───────────────────────────────────────────────────────────────────

  describe('create', () => {
    const validDto = {
      employeeId: EMPLOYEE_ID,
      organizationId: ORG_ID,
      shiftTypeId: SHIFT_TYPE_ID,
      startAt: '2024-06-10T09:00:00.000Z',
      endAt: '2024-06-10T18:00:00.000Z',
      isOffsite: false,
    }

    it('유효한 DTO로 근무일정을 생성한다', async () => {
      mockPrisma.organization.findFirst.mockResolvedValue({ id: ORG_ID })
      mockPrisma.shiftType.findFirst.mockResolvedValue({ id: SHIFT_TYPE_ID })
      mockPrisma.shift.create.mockResolvedValue(baseShift)
      mockPrisma.shift.findMany.mockResolvedValue([baseShift]) // 주 시간 계산용

      const requester = makeRequester(AccessLevel.ORG_ADMIN)
      const result = await service.create(COMPANY_ID, validDto, requester)

      expect(result.id).toBe(SHIFT_ID)
      expect(mockPrisma.shift.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            employeeId: EMPLOYEE_ID,
            status: ShiftStatus.DRAFT,
          }),
        }),
      )
    })

    it('유효하지 않은 조직이면 BadRequestException을 던진다', async () => {
      mockPrisma.organization.findFirst.mockResolvedValue(null)

      await expect(
        service.create(COMPANY_ID, validDto, makeRequester(AccessLevel.ORG_ADMIN)),
      ).rejects.toThrow(BadRequestException)
    })

    it('유효하지 않은 근무유형이면 BadRequestException을 던진다', async () => {
      mockPrisma.organization.findFirst.mockResolvedValue({ id: ORG_ID })
      mockPrisma.shiftType.findFirst.mockResolvedValue(null)

      await expect(
        service.create(COMPANY_ID, validDto, makeRequester(AccessLevel.ORG_ADMIN)),
      ).rejects.toThrow(BadRequestException)
    })
  })

  // ── checkWeeklyHours ─────────────────────────────────────────────────────────

  describe('checkWeeklyHours', () => {
    it('52시간 이하이면 null을 반환한다', async () => {
      // 40시간 근무 (5일 × 8시간)
      const shifts = Array.from({ length: 5 }, (_, i) => ({
        startAt: new Date(`2024-06-${String(10 + i).padStart(2, '0')}T09:00:00.000Z`),
        endAt: new Date(`2024-06-${String(10 + i).padStart(2, '0')}T17:00:00.000Z`),
      }))
      mockPrisma.shift.findMany.mockResolvedValue(shifts)

      const result = await service.checkWeeklyHours(EMPLOYEE_ID, new Date('2024-06-10T09:00:00.000Z'))
      expect(result).toBeNull()
    })

    it('52시간 초과 시 경고 메시지를 반환한다', async () => {
      // 54시간 근무 (6일 × 9시간)
      const shifts = Array.from({ length: 6 }, (_, i) => ({
        startAt: new Date(`2024-06-${String(10 + i).padStart(2, '0')}T08:00:00.000Z`),
        endAt: new Date(`2024-06-${String(10 + i).padStart(2, '0')}T17:00:00.000Z`),
      }))
      mockPrisma.shift.findMany.mockResolvedValue(shifts)

      const result = await service.checkWeeklyHours(EMPLOYEE_ID, new Date('2024-06-10T09:00:00.000Z'))
      expect(result).toContain('52시간을 초과')
    })
  })

  // ── collectWeeklyWarnings (A-8: 패턴 적용 등 대량 생성 시 주52h 경고 일괄 수집) ──

  describe('collectWeeklyWarnings', () => {
    it('같은 직원·같은 주 항목은 한 번만 검사한다(중복 제거)', async () => {
      mockPrisma.shift.findMany.mockResolvedValue([]) // 경고 없음
      const items = [
        { employeeId: 'e1', startAt: new Date('2024-06-10T09:00:00.000Z') }, // 같은 주
        { employeeId: 'e1', startAt: new Date('2024-06-11T09:00:00.000Z') }, // 같은 주
        { employeeId: 'e1', startAt: new Date('2024-06-18T09:00:00.000Z') }, // 다음 주
      ]
      const warnings = await service.collectWeeklyWarnings(items)
      expect(warnings).toEqual([])
      // e1의 고유 주 2개 → 주간 합계 조회(findMany) 2회만
      expect(mockPrisma.shift.findMany).toHaveBeenCalledTimes(2)
    })

    it('52시간 초과 주는 "직원ID: 메시지" 형태로 경고를 모은다', async () => {
      // 55시간(2024-06-10 00:00 ~ 06-12 07:00) 분량 한 건
      mockPrisma.shift.findMany.mockResolvedValue([
        { startAt: new Date('2024-06-10T00:00:00.000Z'), endAt: new Date('2024-06-12T07:00:00.000Z') },
      ])
      const warnings = await service.collectWeeklyWarnings([
        { employeeId: 'e1', startAt: new Date('2024-06-10T09:00:00.000Z') },
      ])
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toMatch(/^e1: /)
      expect(warnings[0]).toContain('52시간을 초과')
    })
  })

  // ── update ───────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('드래프트 일정을 수정한다', async () => {
      mockPrisma.shift.findFirst.mockResolvedValue(baseShift)
      mockPrisma.shift.update.mockResolvedValue({ ...baseShift, offsiteAddress: '서울시 강남구' })

      const result = await service.update(COMPANY_ID, SHIFT_ID, { offsiteAddress: '서울시 강남구' })
      expect(result.offsiteAddress).toBe('서울시 강남구')
    })

    it('확정된 일정을 수정하면 SHIFT_ALREADY_CONFIRMED 에러를 던진다', async () => {
      mockPrisma.shift.findFirst.mockResolvedValue({
        ...baseShift,
        status: ShiftStatus.CONFIRMED,
      })

      await expect(
        service.update(COMPANY_ID, SHIFT_ID, { offsiteAddress: '수정 시도' }),
      ).rejects.toThrow(BadRequestException)
    })

    it('존재하지 않는 일정이면 NotFoundException을 던진다', async () => {
      mockPrisma.shift.findFirst.mockResolvedValue(null)

      await expect(service.update(COMPANY_ID, 'nonexistent', {})).rejects.toThrow(NotFoundException)
    })
  })

  // ── remove ───────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('드래프트 일정을 삭제한다', async () => {
      mockPrisma.shift.findFirst.mockResolvedValue(baseShift)
      mockPrisma.shift.delete.mockResolvedValue(baseShift)

      await expect(service.remove(COMPANY_ID, SHIFT_ID)).resolves.toBeDefined()
      expect(mockPrisma.shift.delete).toHaveBeenCalledWith({ where: { id: SHIFT_ID } })
    })

    it('확정된 일정을 삭제하면 SHIFT_ALREADY_CONFIRMED 에러를 던진다', async () => {
      mockPrisma.shift.findFirst.mockResolvedValue({
        ...baseShift,
        status: ShiftStatus.CONFIRMED,
      })

      await expect(service.remove(COMPANY_ID, SHIFT_ID)).rejects.toThrow(BadRequestException)
    })
  })

  // ── confirm ──────────────────────────────────────────────────────────────────

  describe('confirm', () => {
    it('드래프트 일정을 확정한다', async () => {
      const requester = makeRequester(AccessLevel.ORG_ADMIN)
      mockPrisma.shift.findFirst.mockResolvedValue(baseShift)
      mockPrisma.shift.update.mockResolvedValue({
        ...baseShift,
        status: ShiftStatus.CONFIRMED,
        confirmedBy: requester.employeeId,
        confirmedAt: new Date(),
      })
      mockPrisma.shift.findMany.mockResolvedValue([baseShift])

      const result = await service.confirm(COMPANY_ID, SHIFT_ID, requester)
      expect(result.status).toBe(ShiftStatus.CONFIRMED)
    })

    it('이미 확정된 일정이면 SHIFT_ALREADY_CONFIRMED 에러를 던진다', async () => {
      const requester = makeRequester(AccessLevel.ORG_ADMIN)
      mockPrisma.shift.findFirst.mockResolvedValue({
        ...baseShift,
        status: ShiftStatus.CONFIRMED,
      })

      await expect(service.confirm(COMPANY_ID, SHIFT_ID, requester)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'SHIFT_ALREADY_CONFIRMED' }),
      })
    })
  })

  // ── unconfirm ────────────────────────────────────────────────────────────────

  describe('unconfirm', () => {
    it('GENERAL_ADMIN이 확정된 일정을 해제한다', async () => {
      const requester = makeRequester(AccessLevel.GENERAL_ADMIN)
      mockPrisma.shift.findFirst.mockResolvedValue({
        ...baseShift,
        status: ShiftStatus.CONFIRMED,
      })
      mockPrisma.shift.update.mockResolvedValue({
        ...baseShift,
        status: ShiftStatus.DRAFT,
        confirmedBy: null,
        confirmedAt: null,
      })

      const result = await service.unconfirm(COMPANY_ID, SHIFT_ID, requester)
      expect(result.status).toBe(ShiftStatus.DRAFT)
    })

    it('ORG_ADMIN이 확정 해제를 시도하면 ForbiddenException을 던진다', async () => {
      const requester = makeRequester(AccessLevel.ORG_ADMIN)

      await expect(service.unconfirm(COMPANY_ID, SHIFT_ID, requester)).rejects.toThrow(
        ForbiddenException,
      )
    })

    it('확정되지 않은 일정을 해제하려 하면 BadRequestException을 던진다', async () => {
      const requester = makeRequester(AccessLevel.GENERAL_ADMIN)
      mockPrisma.shift.findFirst.mockResolvedValue(baseShift) // status: draft

      await expect(service.unconfirm(COMPANY_ID, SHIFT_ID, requester)).rejects.toThrow(
        BadRequestException,
      )
    })
  })

  // ── bulkCreate ───────────────────────────────────────────────────────────────

  describe('bulkCreate', () => {
    const baseTemplate = {
      id: TEMPLATE_ID,
      companyId: COMPANY_ID,
      shiftTypeId: SHIFT_TYPE_ID,
      name: '오전 근무',
      startTime: new Date(1970, 0, 1, 9, 0, 0),
      endTime: new Date(1970, 0, 1, 18, 0, 0),
      isActive: true,
    }

    it('날짜 범위와 직원 목록으로 일정을 일괄 생성한다', async () => {
      const requester = makeRequester(AccessLevel.ORG_ADMIN)
      mockPrisma.shiftTemplate.findFirst.mockResolvedValue(baseTemplate)
      mockPrisma.organization.findFirst.mockResolvedValue({ id: ORG_ID })
      mockPrisma.shift.createMany.mockResolvedValue({ count: 2 })
      mockPrisma.shift.findMany.mockResolvedValue([])

      const dto = {
        templateId: TEMPLATE_ID,
        organizationId: ORG_ID,
        employeeIds: [EMPLOYEE_ID],
        startDate: '2024-06-10',
        endDate: '2024-06-11', // 2일
      }

      const result = await service.bulkCreate(COMPANY_ID, dto, requester)
      expect(result.created).toBe(2) // 2일 × 1명
      expect(mockPrisma.shift.createMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.any(Array) }),
      )
    })

    it('유효하지 않은 템플릿이면 BadRequestException을 던진다', async () => {
      mockPrisma.shiftTemplate.findFirst.mockResolvedValue(null)
      const requester = makeRequester(AccessLevel.ORG_ADMIN)

      await expect(
        service.bulkCreate(
          COMPANY_ID,
          {
            templateId: 'bad-id',
            organizationId: ORG_ID,
            employeeIds: [EMPLOYEE_ID],
            startDate: '2024-06-10',
            endDate: '2024-06-10',
          },
          requester,
        ),
      ).rejects.toThrow(BadRequestException)
    })
  })
})
