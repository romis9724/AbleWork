import { Test, TestingModule } from '@nestjs/testing'
import { NotFoundException, BadRequestException } from '@nestjs/common'
import { SharedApprovalLinesService } from './shared-approval-lines.service'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateSharedLineDto, UpdateSharedLineDto } from './dto/document-form.dto'

// ── 공통 픽스처 ────────────────────────────────────────────────────────────────

const COMPANY_ID = 'company-1'
const OTHER_COMPANY_ID = 'company-2'
const LINE_ID = 'line-1'

// 결재선 단계 — role/assigneeId/stepOrder (StepInput)
const baseSteps = [
  { role: 'APPROVER' as const, assigneeId: 'emp-1', stepOrder: 0 },
  { role: 'AGREEMENT' as const, assigneeId: 'emp-2', stepOrder: 1 },
]

const baseLine = {
  id: LINE_ID,
  companyId: COMPANY_ID,
  name: '표준 결재선',
  steps: baseSteps,
  version: 1,
}

// ── 모킹 ───────────────────────────────────────────────────────────────────────
// 서비스가 실제 사용하는 모델/메서드만 정의한다.

const mockPrisma = {
  sharedApprovalLine: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  employee: {
    count: jest.fn(),
    findMany: jest.fn(),
  },
}

// ── 테스트 ────────────────────────────────────────────────────────────────────

describe('SharedApprovalLinesService', () => {
  let service: SharedApprovalLinesService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SharedApprovalLinesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile()

    service = module.get<SharedApprovalLinesService>(SharedApprovalLinesService)
    jest.clearAllMocks()
  })

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('회사에 속한 공용 결재선을 이름순으로 조회한다', async () => {
      const lines = [
        { ...baseLine, id: 'line-a', name: '가결재선' },
        { ...baseLine, id: 'line-b', name: '나결재선' },
      ]
      mockPrisma.sharedApprovalLine.findMany.mockResolvedValue(lines)

      const result = await service.findAll(COMPANY_ID)

      expect(result).toEqual(lines)
      expect(mockPrisma.sharedApprovalLine.findMany).toHaveBeenCalledWith({
        where: { companyId: COMPANY_ID, scope: 'COMPANY' },
        orderBy: { name: 'asc' },
        include: { createdBy: { select: { id: true, name: true } } },
      })
    })

    it('search 필터 시 name contains 조건을 적용한다', async () => {
      mockPrisma.sharedApprovalLine.findMany.mockResolvedValue([])
      await service.findAll(COMPANY_ID, { search: '표준' })
      expect(mockPrisma.sharedApprovalLine.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: COMPANY_ID, scope: 'COMPANY', name: { contains: '표준' } },
        }),
      )
    })

    it('멀티테넌시 — findMany where에 companyId 필터가 포함된다', async () => {
      mockPrisma.sharedApprovalLine.findMany.mockResolvedValue([])

      await service.findAll(OTHER_COMPANY_ID)

      expect(mockPrisma.sharedApprovalLine.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId: OTHER_COMPANY_ID, scope: 'COMPANY' } }),
      )
    })

    // ── C-9b: 작성자/결재자/작성일 필터 ──────────────────────────────────────────
    it('[C-9b] author 필터 시 createdBy(이름/사번) 조건을 적용한다', async () => {
      mockPrisma.sharedApprovalLine.findMany.mockResolvedValue([])
      await service.findAll(COMPANY_ID, { author: '홍길동' })
      expect(mockPrisma.sharedApprovalLine.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            companyId: COMPANY_ID,
            scope: 'COMPANY',
            createdBy: {
              is: {
                OR: [
                  { name: { contains: '홍길동' } },
                  { employeeNumber: { contains: '홍길동' } },
                ],
              },
            },
          },
        }),
      )
    })

    it('[C-9b] dateFrom/dateTo 필터 시 createdAt 범위(KST) 조건을 적용한다', async () => {
      mockPrisma.sharedApprovalLine.findMany.mockResolvedValue([])
      await service.findAll(COMPANY_ID, { dateFrom: '2026-01-01', dateTo: '2026-01-31' })
      expect(mockPrisma.sharedApprovalLine.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            companyId: COMPANY_ID,
            scope: 'COMPANY',
            createdAt: {
              gte: new Date('2026-01-01T00:00:00.000+09:00'),
              lte: new Date('2026-01-31T23:59:59.999+09:00'),
            },
          },
        }),
      )
    })

    it('[C-9b] approver 필터 시 매칭 직원이 결재선 steps에 포함된 라인만 반환한다', async () => {
      // 결재자명으로 emp-1이 조회됨
      mockPrisma.employee.findMany.mockResolvedValue([{ id: 'emp-1' }])
      mockPrisma.sharedApprovalLine.findMany.mockResolvedValue([
        { ...baseLine, id: 'match', steps: [{ role: 'APPROVER', assigneeId: 'emp-1', stepOrder: 0 }] },
        { ...baseLine, id: 'nomatch', steps: [{ role: 'APPROVER', assigneeId: 'emp-9', stepOrder: 0 }] },
      ])

      const result = await service.findAll(COMPANY_ID, { approver: '김결재' })

      // 매칭 직원 조회 — companyId 스코프 + 이름/사번 OR
      expect(mockPrisma.employee.findMany).toHaveBeenCalledWith({
        where: {
          companyId: COMPANY_ID,
          OR: [{ name: { contains: '김결재' } }, { employeeNumber: { contains: '김결재' } }],
        },
        select: { id: true },
      })
      // steps에 emp-1을 포함한 라인만 남음
      expect(result.map((l: { id: string }) => l.id)).toEqual(['match'])
    })

    it('[C-9b] approver 매칭 직원이 없으면 결재선 조회 없이 빈 배열을 반환한다', async () => {
      mockPrisma.employee.findMany.mockResolvedValue([])

      const result = await service.findAll(COMPANY_ID, { approver: '없는사람' })

      expect(result).toEqual([])
      expect(mockPrisma.sharedApprovalLine.findMany).not.toHaveBeenCalled()
    })
  })

  // ── create ───────────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto: CreateSharedLineDto = { name: '표준 결재선', steps: baseSteps }

    it('자사 소속 검증 후 공용 결재선을 생성한다', async () => {
      // 결재선 구성원 2명이 모두 자사 소속
      mockPrisma.employee.count.mockResolvedValue(2)
      mockPrisma.sharedApprovalLine.create.mockResolvedValue(baseLine)

      const result = await service.create(COMPANY_ID, dto, 'creator-1')

      expect(result).toEqual(baseLine)
      expect(mockPrisma.sharedApprovalLine.create).toHaveBeenCalledWith({
        data: {
          companyId: COMPANY_ID,
          name: '표준 결재선',
          steps: baseSteps,
          createdById: 'creator-1',
          scope: 'COMPANY',
        },
      })
    })

    it('멀티테넌시 — assignee 소속 검증 쿼리 where에 companyId가 포함된다', async () => {
      mockPrisma.employee.count.mockResolvedValue(2)
      mockPrisma.sharedApprovalLine.create.mockResolvedValue(baseLine)

      await service.create(COMPANY_ID, dto, 'creator-1')

      // assigneeIds 중복 제거된 목록으로 count 호출, companyId 필터 포함
      expect(mockPrisma.employee.count).toHaveBeenCalledWith({
        where: { id: { in: ['emp-1', 'emp-2'] }, companyId: COMPANY_ID },
      })
    })

    it('[HIGH] assignee가 타 회사 직원이면 EMPLOYEE_NOT_FOUND로 거부한다', async () => {
      // 2명 요청했으나 자사 소속 count가 1명 → 거부
      mockPrisma.employee.count.mockResolvedValue(1)

      await expect(service.create(COMPANY_ID, dto, 'creator-1')).rejects.toThrow(BadRequestException)
      expect(mockPrisma.sharedApprovalLine.create).not.toHaveBeenCalled()
    })

    it('[HIGH] 존재하지 않는 assigneeId가 포함되면 EMPLOYEE_NOT_FOUND로 거부한다', async () => {
      // count(0) — 요청 직원 수(2)와 불일치
      mockPrisma.employee.count.mockResolvedValue(0)

      await expect(service.create(COMPANY_ID, dto, 'creator-1')).rejects.toThrow(BadRequestException)
      expect(mockPrisma.sharedApprovalLine.create).not.toHaveBeenCalled()
    })

    it('중복 assigneeId는 한 번만 검증하여 count 대상에서 제거한다', async () => {
      // 동일인을 두 APPROVER 단계에 — 최종결재자=협조자 충돌을 피하면서 dedup만 검증
      const dupDto: CreateSharedLineDto = {
        name: '중복 결재선',
        steps: [
          { role: 'APPROVER', assigneeId: 'emp-1', stepOrder: 0 },
          { role: 'APPROVER', assigneeId: 'emp-1', stepOrder: 1 },
        ],
      }
      mockPrisma.employee.count.mockResolvedValue(1)
      mockPrisma.sharedApprovalLine.create.mockResolvedValue(baseLine)

      await service.create(COMPANY_ID, dupDto, 'creator-1')

      // 고유 assigneeId 1명만 검증
      expect(mockPrisma.employee.count).toHaveBeenCalledWith({
        where: { id: { in: ['emp-1'] }, companyId: COMPANY_ID },
      })
    })

    it('같은 이름이 이미 있으면 SHARED_LINE_DUPLICATE_NAME', async () => {
      mockPrisma.employee.count.mockResolvedValue(2)
      mockPrisma.sharedApprovalLine.findFirst.mockResolvedValue({ id: 'dup' })

      await expect(service.create(COMPANY_ID, dto, 'creator-1')).rejects.toMatchObject({
        response: { code: 'SHARED_LINE_DUPLICATE_NAME' },
      })
      expect(mockPrisma.sharedApprovalLine.create).not.toHaveBeenCalled()
    })

    it('최종 결재자가 협조자로도 지정되면 FINAL_APPROVER_IS_COLLABORATOR', async () => {
      mockPrisma.employee.count.mockResolvedValue(1)
      const conflictDto: CreateSharedLineDto = {
        name: '충돌 결재선',
        steps: [
          { role: 'AGREEMENT', assigneeId: 'emp-1', stepOrder: 0 },
          { role: 'APPROVER', assigneeId: 'emp-1', stepOrder: 1 },
        ],
      }
      await expect(service.create(COMPANY_ID, conflictDto, 'creator-1')).rejects.toMatchObject({
        response: { code: 'FINAL_APPROVER_IS_COLLABORATOR' },
      })
      expect(mockPrisma.sharedApprovalLine.create).not.toHaveBeenCalled()
    })
  })

  // ── update ────────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('name만 변경할 때 version은 증가하지 않는다', async () => {
      // 1차 findFirst=소속검증(baseLine), 2차=이름중복검증(null)
      mockPrisma.sharedApprovalLine.findFirst
        .mockResolvedValueOnce(baseLine)
        .mockResolvedValueOnce(null)
      mockPrisma.sharedApprovalLine.update.mockResolvedValue({
        ...baseLine,
        name: '수정된 결재선',
      })

      const dto: UpdateSharedLineDto = { name: '수정된 결재선' }
      const result = await service.update(COMPANY_ID, LINE_ID, dto)

      expect(result.name).toBe('수정된 결재선')
      // version increment 없음, steps 미포함
      expect(mockPrisma.sharedApprovalLine.update).toHaveBeenCalledWith({
        where: { id: LINE_ID, companyId: COMPANY_ID },
        data: { name: '수정된 결재선' },
      })
      // assignee 검증은 호출되지 않음 (steps 미제공)
      expect(mockPrisma.employee.count).not.toHaveBeenCalled()
    })

    it('[MEDIUM] steps 변경 시 version이 increment된다', async () => {
      mockPrisma.sharedApprovalLine.findFirst.mockResolvedValue(baseLine)
      mockPrisma.employee.count.mockResolvedValue(2)
      mockPrisma.sharedApprovalLine.update.mockResolvedValue({
        ...baseLine,
        version: 2,
      })

      const newSteps = [
        { role: 'APPROVER' as const, assigneeId: 'emp-1', stepOrder: 0 },
        { role: 'REFERENCE' as const, assigneeId: 'emp-2', stepOrder: 1 },
      ]
      const dto: UpdateSharedLineDto = { steps: newSteps }
      await service.update(COMPANY_ID, LINE_ID, dto)

      expect(mockPrisma.sharedApprovalLine.update).toHaveBeenCalledWith({
        where: { id: LINE_ID, companyId: COMPANY_ID },
        data: { steps: newSteps, version: { increment: 1 } },
      })
    })

    it('[MEDIUM] name과 steps를 동시에 변경하면 둘 다 반영되고 version이 increment된다', async () => {
      mockPrisma.sharedApprovalLine.findFirst
        .mockResolvedValueOnce(baseLine)
        .mockResolvedValueOnce(null)
      mockPrisma.employee.count.mockResolvedValue(1)
      mockPrisma.sharedApprovalLine.update.mockResolvedValue({
        ...baseLine,
        name: '복합 수정',
        version: 2,
      })

      const newSteps = [{ role: 'APPROVER' as const, assigneeId: 'emp-1', stepOrder: 0 }]
      const dto: UpdateSharedLineDto = { name: '복합 수정', steps: newSteps }
      await service.update(COMPANY_ID, LINE_ID, dto)

      expect(mockPrisma.sharedApprovalLine.update).toHaveBeenCalledWith({
        where: { id: LINE_ID, companyId: COMPANY_ID },
        data: { name: '복합 수정', steps: newSteps, version: { increment: 1 } },
      })
    })

    it('[HIGH] steps 변경 시 새 assignee가 타 회사 직원이면 거부한다', async () => {
      mockPrisma.sharedApprovalLine.findFirst.mockResolvedValue(baseLine)
      // 요청 2명 중 자사 소속 1명 → 거부
      mockPrisma.employee.count.mockResolvedValue(1)

      const dto: UpdateSharedLineDto = { steps: baseSteps }
      await expect(service.update(COMPANY_ID, LINE_ID, dto)).rejects.toThrow(
        BadRequestException,
      )
      expect(mockPrisma.sharedApprovalLine.update).not.toHaveBeenCalled()
    })

    it('[HIGH] 존재하지 않는 lineId면 NotFoundException을 던진다', async () => {
      mockPrisma.sharedApprovalLine.findFirst.mockResolvedValue(null)

      await expect(
        service.update(COMPANY_ID, 'nonexistent', { name: 'x' }),
      ).rejects.toThrow(NotFoundException)
      expect(mockPrisma.sharedApprovalLine.update).not.toHaveBeenCalled()
    })

    it('[HIGH] 멀티테넌시 — 타 회사 lineId 접근 시 거부 (findFirst where에 companyId 포함)', async () => {
      mockPrisma.sharedApprovalLine.findFirst.mockResolvedValue(null)

      await expect(
        service.update(OTHER_COMPANY_ID, LINE_ID, { name: 'x' }),
      ).rejects.toThrow(NotFoundException)

      // 소속 검증 쿼리에 companyId 필터 포함
      expect(mockPrisma.sharedApprovalLine.findFirst).toHaveBeenCalledWith({
        where: { id: LINE_ID, companyId: OTHER_COMPANY_ID, scope: 'COMPANY' },
      })
    })

    it('[버그수정] update where에 companyId가 포함되어 타 회사 라인 수정을 방어한다', async () => {
      mockPrisma.sharedApprovalLine.findFirst
        .mockResolvedValueOnce(baseLine)
        .mockResolvedValueOnce(null)
      mockPrisma.sharedApprovalLine.update.mockResolvedValue(baseLine)

      await service.update(COMPANY_ID, LINE_ID, { name: '방어 검증' })

      expect(mockPrisma.sharedApprovalLine.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: COMPANY_ID }),
        }),
      )
    })
  })

  // ── remove ────────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('[MEDIUM] 참조 중이 아닌 결재선을 삭제하고 { deleted: true }를 반환한다', async () => {
      mockPrisma.sharedApprovalLine.findFirst.mockResolvedValue(baseLine)
      mockPrisma.sharedApprovalLine.delete.mockResolvedValue(baseLine)

      const result = await service.remove(COMPANY_ID, LINE_ID)

      expect(result).toEqual({ deleted: true })
      expect(mockPrisma.sharedApprovalLine.delete).toHaveBeenCalledWith({
        where: { id: LINE_ID, companyId: COMPANY_ID },
      })
    })

    it('[HIGH] 존재하지 않는 lineId면 NotFoundException을 던진다', async () => {
      mockPrisma.sharedApprovalLine.findFirst.mockResolvedValue(null)

      await expect(service.remove(COMPANY_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      )
      expect(mockPrisma.sharedApprovalLine.delete).not.toHaveBeenCalled()
    })

    it('[HIGH] 멀티테넌시 — 타 회사 lineId 접근 시 거부 (findFirst where에 companyId 포함)', async () => {
      mockPrisma.sharedApprovalLine.findFirst.mockResolvedValue(null)

      await expect(service.remove(OTHER_COMPANY_ID, LINE_ID)).rejects.toThrow(
        NotFoundException,
      )

      expect(mockPrisma.sharedApprovalLine.findFirst).toHaveBeenCalledWith({
        where: { id: LINE_ID, companyId: OTHER_COMPANY_ID, scope: 'COMPANY' },
      })
    })

    it('[HIGH] 사용 중인 결재선(P2003)이면 SHARED_LINE_IN_USE로 BadRequestException을 던진다', async () => {
      mockPrisma.sharedApprovalLine.findFirst.mockResolvedValue(baseLine)
      mockPrisma.sharedApprovalLine.delete.mockRejectedValue({ code: 'P2003' })

      await expect(service.remove(COMPANY_ID, LINE_ID)).rejects.toThrow(BadRequestException)

      // 에러 코드 검증
      await expect(service.remove(COMPANY_ID, LINE_ID)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'SHARED_LINE_IN_USE' }),
      })
    })

    it('P2003 외의 예상치 못한 에러는 그대로 전파한다', async () => {
      mockPrisma.sharedApprovalLine.findFirst.mockResolvedValue(baseLine)
      const unexpected = Object.assign(new Error('DB down'), { code: 'P1001' })
      mockPrisma.sharedApprovalLine.delete.mockRejectedValue(unexpected)

      await expect(service.remove(COMPANY_ID, LINE_ID)).rejects.toBe(unexpected)
    })

    it('[버그수정] delete where에 companyId가 포함되어 타 회사 라인 삭제를 방어한다', async () => {
      mockPrisma.sharedApprovalLine.findFirst.mockResolvedValue(baseLine)
      mockPrisma.sharedApprovalLine.delete.mockResolvedValue(baseLine)

      await service.remove(COMPANY_ID, LINE_ID)

      expect(mockPrisma.sharedApprovalLine.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: COMPANY_ID }),
        }),
      )
    })
  })

  // ── 개인 결재선 (PERSONAL) — 빠른 결재선 불러오기 ──────────────────────────────

  describe('findPersonal', () => {
    it('본인 소유 개인 결재선만 scope·createdById로 이름순 조회한다', async () => {
      const personalLine = { ...baseLine, scope: 'PERSONAL', createdById: 'owner-1' }
      mockPrisma.sharedApprovalLine.findMany.mockResolvedValue([personalLine])

      const result = await service.findPersonal(COMPANY_ID, 'owner-1')

      expect(result).toEqual([personalLine])
      expect(mockPrisma.sharedApprovalLine.findMany).toHaveBeenCalledWith({
        where: { companyId: COMPANY_ID, scope: 'PERSONAL', createdById: 'owner-1' },
        orderBy: { name: 'asc' },
      })
    })

    it('search 필터 시 name contains 조건을 추가한다', async () => {
      mockPrisma.sharedApprovalLine.findMany.mockResolvedValue([])
      await service.findPersonal(COMPANY_ID, 'owner-1', { search: '자주쓰는' })
      expect(mockPrisma.sharedApprovalLine.findMany).toHaveBeenCalledWith({
        where: {
          companyId: COMPANY_ID,
          scope: 'PERSONAL',
          createdById: 'owner-1',
          name: { contains: '자주쓰는' },
        },
        orderBy: { name: 'asc' },
      })
    })
  })

  describe('createPersonal', () => {
    const dto: CreateSharedLineDto = { name: '내 결재선', steps: baseSteps }

    it('scope=PERSONAL·소유자(createdById)로 개인 결재선을 생성한다', async () => {
      mockPrisma.employee.count.mockResolvedValue(2)
      mockPrisma.sharedApprovalLine.findFirst.mockResolvedValue(null) // 이름 중복 없음
      mockPrisma.sharedApprovalLine.create.mockResolvedValue({ ...baseLine, scope: 'PERSONAL' })

      await service.createPersonal(COMPANY_ID, dto, 'owner-1')

      expect(mockPrisma.sharedApprovalLine.create).toHaveBeenCalledWith({
        data: {
          companyId: COMPANY_ID,
          name: '내 결재선',
          steps: baseSteps,
          createdById: 'owner-1',
          scope: 'PERSONAL',
        },
      })
    })

    it('이름 중복 검증은 본인(createdById)·PERSONAL 범위로만 수행한다', async () => {
      mockPrisma.employee.count.mockResolvedValue(2)
      mockPrisma.sharedApprovalLine.findFirst.mockResolvedValue(null)
      mockPrisma.sharedApprovalLine.create.mockResolvedValue(baseLine)

      await service.createPersonal(COMPANY_ID, dto, 'owner-1')

      expect(mockPrisma.sharedApprovalLine.findFirst).toHaveBeenCalledWith({
        where: {
          companyId: COMPANY_ID,
          scope: 'PERSONAL',
          name: '내 결재선',
          createdById: 'owner-1',
        },
        select: { id: true },
      })
    })

    it('[중복 허용] 동일 인원을 여러 결재 단계에 배치해도 생성된다', async () => {
      const dupDto: CreateSharedLineDto = {
        name: '중복 인원 결재선',
        steps: [
          { role: 'APPROVER', assigneeId: 'emp-1', stepOrder: 0 },
          { role: 'APPROVER', assigneeId: 'emp-1', stepOrder: 1 },
        ],
      }
      mockPrisma.employee.count.mockResolvedValue(1)
      mockPrisma.sharedApprovalLine.findFirst.mockResolvedValue(null)
      mockPrisma.sharedApprovalLine.create.mockResolvedValue(baseLine)

      await expect(service.createPersonal(COMPANY_ID, dupDto, 'owner-1')).resolves.toBeDefined()
      expect(mockPrisma.sharedApprovalLine.create).toHaveBeenCalled()
    })
  })

  describe('updatePersonal / removePersonal — 소유자 격리', () => {
    const ownLine = { ...baseLine, scope: 'PERSONAL', createdById: 'owner-1' }

    it('[HIGH] 타인 소유 결재선 수정 시 PERSONAL_LINE_FORBIDDEN', async () => {
      mockPrisma.sharedApprovalLine.findFirst.mockResolvedValue({
        ...baseLine,
        scope: 'PERSONAL',
        createdById: 'other-owner',
      })

      await expect(
        service.updatePersonal(COMPANY_ID, LINE_ID, { name: 'x' }, 'owner-1'),
      ).rejects.toMatchObject({ response: { code: 'PERSONAL_LINE_FORBIDDEN' } })
      expect(mockPrisma.sharedApprovalLine.update).not.toHaveBeenCalled()
    })

    it('[HIGH] 존재하지 않으면 PERSONAL_LINE_NOT_FOUND', async () => {
      mockPrisma.sharedApprovalLine.findFirst.mockResolvedValue(null)

      await expect(
        service.removePersonal(COMPANY_ID, 'nope', 'owner-1'),
      ).rejects.toMatchObject({ response: { code: 'PERSONAL_LINE_NOT_FOUND' } })
      expect(mockPrisma.sharedApprovalLine.delete).not.toHaveBeenCalled()
    })

    it('소유자 검증 findFirst는 scope=PERSONAL로 한정한다 (공용 결재선 오접근 차단)', async () => {
      mockPrisma.sharedApprovalLine.findFirst.mockResolvedValue(null)

      await expect(service.removePersonal(COMPANY_ID, LINE_ID, 'owner-1')).rejects.toThrow(
        NotFoundException,
      )
      expect(mockPrisma.sharedApprovalLine.findFirst).toHaveBeenCalledWith({
        where: { id: LINE_ID, companyId: COMPANY_ID, scope: 'PERSONAL' },
      })
    })

    it('본인 소유분 수정은 검증 후 반영된다', async () => {
      mockPrisma.sharedApprovalLine.findFirst
        .mockResolvedValueOnce(ownLine) // 소유자 검증
        .mockResolvedValueOnce(null) // 이름 중복 없음
      mockPrisma.sharedApprovalLine.update.mockResolvedValue({ ...ownLine, name: '수정' })

      await service.updatePersonal(COMPANY_ID, LINE_ID, { name: '수정' }, 'owner-1')

      expect(mockPrisma.sharedApprovalLine.update).toHaveBeenCalledWith({
        where: { id: LINE_ID, companyId: COMPANY_ID },
        data: { name: '수정' },
      })
    })

    it('본인 소유분 삭제는 { deleted: true }를 반환한다', async () => {
      mockPrisma.sharedApprovalLine.findFirst.mockResolvedValue(ownLine)
      mockPrisma.sharedApprovalLine.delete.mockResolvedValue(ownLine)

      const result = await service.removePersonal(COMPANY_ID, LINE_ID, 'owner-1')

      expect(result).toEqual({ deleted: true })
      expect(mockPrisma.sharedApprovalLine.delete).toHaveBeenCalledWith({
        where: { id: LINE_ID, companyId: COMPANY_ID },
      })
    })
  })
})
