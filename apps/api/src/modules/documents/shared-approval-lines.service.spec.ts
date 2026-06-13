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
        where: { companyId: COMPANY_ID },
        orderBy: { name: 'asc' },
      })
    })

    it('멀티테넌시 — findMany where에 companyId 필터가 포함된다', async () => {
      mockPrisma.sharedApprovalLine.findMany.mockResolvedValue([])

      await service.findAll(OTHER_COMPANY_ID)

      expect(mockPrisma.sharedApprovalLine.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId: OTHER_COMPANY_ID } }),
      )
    })
  })

  // ── create ───────────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto: CreateSharedLineDto = { name: '표준 결재선', steps: baseSteps }

    it('자사 소속 검증 후 공용 결재선을 생성한다', async () => {
      // 결재선 구성원 2명이 모두 자사 소속
      mockPrisma.employee.count.mockResolvedValue(2)
      mockPrisma.sharedApprovalLine.create.mockResolvedValue(baseLine)

      const result = await service.create(COMPANY_ID, dto)

      expect(result).toEqual(baseLine)
      expect(mockPrisma.sharedApprovalLine.create).toHaveBeenCalledWith({
        data: { companyId: COMPANY_ID, name: '표준 결재선', steps: baseSteps },
      })
    })

    it('멀티테넌시 — assignee 소속 검증 쿼리 where에 companyId가 포함된다', async () => {
      mockPrisma.employee.count.mockResolvedValue(2)
      mockPrisma.sharedApprovalLine.create.mockResolvedValue(baseLine)

      await service.create(COMPANY_ID, dto)

      // assigneeIds 중복 제거된 목록으로 count 호출, companyId 필터 포함
      expect(mockPrisma.employee.count).toHaveBeenCalledWith({
        where: { id: { in: ['emp-1', 'emp-2'] }, companyId: COMPANY_ID },
      })
    })

    it('[HIGH] assignee가 타 회사 직원이면 EMPLOYEE_NOT_FOUND로 거부한다', async () => {
      // 2명 요청했으나 자사 소속 count가 1명 → 거부
      mockPrisma.employee.count.mockResolvedValue(1)

      await expect(service.create(COMPANY_ID, dto)).rejects.toThrow(BadRequestException)
      expect(mockPrisma.sharedApprovalLine.create).not.toHaveBeenCalled()
    })

    it('[HIGH] 존재하지 않는 assigneeId가 포함되면 EMPLOYEE_NOT_FOUND로 거부한다', async () => {
      // count(0) — 요청 직원 수(2)와 불일치
      mockPrisma.employee.count.mockResolvedValue(0)

      await expect(service.create(COMPANY_ID, dto)).rejects.toThrow(BadRequestException)
      expect(mockPrisma.sharedApprovalLine.create).not.toHaveBeenCalled()
    })

    it('중복 assigneeId는 한 번만 검증하여 count 대상에서 제거한다', async () => {
      const dupDto: CreateSharedLineDto = {
        name: '중복 결재선',
        steps: [
          { role: 'APPROVER', assigneeId: 'emp-1', stepOrder: 0 },
          { role: 'AGREEMENT', assigneeId: 'emp-1', stepOrder: 1 },
        ],
      }
      mockPrisma.employee.count.mockResolvedValue(1)
      mockPrisma.sharedApprovalLine.create.mockResolvedValue(baseLine)

      await service.create(COMPANY_ID, dupDto)

      // 고유 assigneeId 1명만 검증
      expect(mockPrisma.employee.count).toHaveBeenCalledWith({
        where: { id: { in: ['emp-1'] }, companyId: COMPANY_ID },
      })
    })
  })

  // ── update ────────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('name만 변경할 때 version은 증가하지 않는다', async () => {
      mockPrisma.sharedApprovalLine.findFirst.mockResolvedValue(baseLine)
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
      mockPrisma.sharedApprovalLine.findFirst.mockResolvedValue(baseLine)
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
        where: { id: LINE_ID, companyId: OTHER_COMPANY_ID },
      })
    })

    it('[버그수정] update where에 companyId가 포함되어 타 회사 라인 수정을 방어한다', async () => {
      mockPrisma.sharedApprovalLine.findFirst.mockResolvedValue(baseLine)
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
        where: { id: LINE_ID, companyId: OTHER_COMPANY_ID },
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
})
