import { Test, TestingModule } from '@nestjs/testing'
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { OrganizationsService } from './organizations.service'
import { PrismaService } from '../../prisma/prisma.service'

const makeOrg = (overrides: Partial<{
  id: string
  companyId: string
  parentId: string | null
  name: string
  depth: number
  sortOrder: number
  approverId: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}> = {}) => ({
  id: 'org-1',
  companyId: 'company-1',
  parentId: null,
  name: '개발팀',
  depth: 0,
  sortOrder: 0,
  approverId: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

const mockPrisma = {
  organization: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  organizationDocManager: {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  },
  organizationTimeclockArea: {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  },
  employee: {
    count: jest.fn(),
  },
  employeeOrganization: {
    count: jest.fn(),
  },
  timeclockArea: {
    count: jest.fn(),
  },
  shift: {
    count: jest.fn(),
  },
  $transaction: jest.fn(),
}

describe('OrganizationsService', () => {
  let service: OrganizationsService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile()

    service = module.get<OrganizationsService>(OrganizationsService)
    jest.clearAllMocks()
    mockPrisma.$transaction.mockImplementation(
      async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma),
    )
  })

  describe('buildTree', () => {
    it('플랫 배열을 트리 구조로 변환한다', () => {
      const orgs = [
        makeOrg({ id: 'org-1', parentId: null, depth: 0 }),
        makeOrg({ id: 'org-2', parentId: 'org-1', depth: 1, name: '프론트엔드' }),
        makeOrg({ id: 'org-3', parentId: 'org-1', depth: 1, name: '백엔드' }),
        makeOrg({ id: 'org-4', parentId: 'org-2', depth: 2, name: 'React팀' }),
      ]

      const tree = service.buildTree(orgs)

      expect(tree).toHaveLength(1)
      expect(tree[0].children).toHaveLength(2)
      expect(tree[0].children[0].children).toHaveLength(1)
    })

    it('루트 조직이 여러 개인 경우 모두 반환한다', () => {
      const orgs = [
        makeOrg({ id: 'org-1', parentId: null }),
        makeOrg({ id: 'org-2', parentId: null, name: '인사팀' }),
      ]

      const tree = service.buildTree(orgs)

      expect(tree).toHaveLength(2)
    })

    it('조직이 없으면 빈 배열을 반환한다', () => {
      const tree = service.buildTree([])
      expect(tree).toEqual([])
    })
  })

  describe('findTree', () => {
    it('조직 목록을 트리로 반환한다', async () => {
      const orgs = [
        makeOrg({ id: 'org-1', parentId: null }),
        makeOrg({ id: 'org-2', parentId: 'org-1', depth: 1 }),
      ]
      mockPrisma.organization.findMany.mockResolvedValue(orgs)

      const result = await service.findTree('company-1')

      expect(result).toHaveLength(1)
      expect(result[0].children).toHaveLength(1)
    })
  })

  describe('create', () => {
    it('루트 조직을 depth 0으로 생성한다', async () => {
      const org = makeOrg()
      mockPrisma.organization.create.mockResolvedValue(org)

      const result = await service.create('company-1', { name: '개발팀', sortOrder: 0 })

      expect(result.depth).toBe(0)
      expect(mockPrisma.organization.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ depth: 0 }) }),
      )
    })

    it('하위 조직은 부모 depth + 1로 생성한다', async () => {
      const parent = makeOrg({ id: 'org-1', depth: 1 })
      const child = makeOrg({ id: 'org-2', parentId: 'org-1', depth: 2 })
      mockPrisma.organization.findFirst.mockResolvedValue(parent)
      mockPrisma.organization.create.mockResolvedValue(child)

      const result = await service.create('company-1', {
        name: '프론트엔드',
        parentId: 'org-1',
        sortOrder: 0,
      })

      expect(mockPrisma.organization.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ depth: 2 }) }),
      )
      expect(result.depth).toBe(2)
    })

    it('존재하지 않는 parentId로 NotFoundException을 던진다', async () => {
      mockPrisma.organization.findFirst.mockResolvedValue(null)

      await expect(
        service.create('company-1', { name: '팀', parentId: 'non-existent', sortOrder: 0 }),
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('update', () => {
    it('조직 정보를 수정한다', async () => {
      const org = makeOrg()
      const updated = makeOrg({ name: '수정된 팀명' })
      mockPrisma.organization.findFirst.mockResolvedValue(org)
      mockPrisma.organization.update.mockResolvedValue(updated)

      const result = await service.update('org-1', 'company-1', { name: '수정된 팀명' })

      expect(result.name).toBe('수정된 팀명')
    })

    it('존재하지 않는 조직 수정 시 NotFoundException을 던진다', async () => {
      mockPrisma.organization.findFirst.mockResolvedValue(null)

      await expect(
        service.update('non-existent', 'company-1', { name: '팀' }),
      ).rejects.toThrow(NotFoundException)
    })

    it('문서담당자(docManagerId)를 지정/해제할 수 있다 (AP-04-07)', async () => {
      mockPrisma.organization.findFirst.mockResolvedValue(makeOrg())
      mockPrisma.organization.update.mockResolvedValue(makeOrg())

      // 지정
      await service.update('org-1', 'company-1', { docManagerId: 'emp-9' })
      expect(mockPrisma.organization.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ docManagerId: 'emp-9' }) }),
      )
      // 해제(null)
      await service.update('org-1', 'company-1', { docManagerId: null })
      expect(mockPrisma.organization.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ docManagerId: null }) }),
      )
    })

    it('자기 자신을 상위 조직으로 지정하면 ORG_PARENT_CYCLE로 차단한다', async () => {
      // findOneOrThrow + 부모 존재확인 모두 org-1 반환 → 순환 검증 첫 단계에서 차단
      mockPrisma.organization.findFirst.mockResolvedValue(
        makeOrg({ id: 'org-1', parentId: null }),
      )

      await expect(
        service.update('org-1', 'company-1', { parentId: 'org-1' }),
      ).rejects.toMatchObject({ response: { code: 'ORG_PARENT_CYCLE' } })
      expect(mockPrisma.organization.update).not.toHaveBeenCalled()
    })

    it('하위 조직을 상위 조직으로 지정하면 ORG_PARENT_CYCLE로 차단한다', async () => {
      // org-1(루트) ← org-2(자식). org-1의 부모를 org-2로 지정 시도 → 순환
      mockPrisma.organization.findFirst.mockImplementation(({ where }) => {
        if (where.id === 'org-1')
          return Promise.resolve(makeOrg({ id: 'org-1', parentId: null, depth: 0 }))
        if (where.id === 'org-2')
          return Promise.resolve(makeOrg({ id: 'org-2', parentId: 'org-1', depth: 1 }))
        return Promise.resolve(null)
      })

      await expect(
        service.update('org-1', 'company-1', { parentId: 'org-2' }),
      ).rejects.toMatchObject({ response: { code: 'ORG_PARENT_CYCLE' } })
      expect(mockPrisma.organization.update).not.toHaveBeenCalled()
    })

    it('하위가 아닌 다른 조직을 상위로 재지정하면 정상 처리한다 (회귀 방지)', async () => {
      // org-1, org-2 모두 루트. org-1의 부모를 org-2로 지정 → 순환 아님
      mockPrisma.organization.findFirst.mockImplementation(({ where }) => {
        if (where.id === 'org-1')
          return Promise.resolve(makeOrg({ id: 'org-1', parentId: null, depth: 0 }))
        if (where.id === 'org-2')
          return Promise.resolve(makeOrg({ id: 'org-2', parentId: null, depth: 0 }))
        return Promise.resolve(null)
      })
      mockPrisma.organization.update.mockResolvedValue(
        makeOrg({ id: 'org-1', parentId: 'org-2', depth: 1 }),
      )

      const result = await service.update('org-1', 'company-1', { parentId: 'org-2' })

      expect(result.parentId).toBe('org-2')
      expect(mockPrisma.organization.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ depth: 1 }) }),
      )
    })
  })

  describe('remove', () => {
    it('의존성이 없으면 소프트 삭제한다', async () => {
      mockPrisma.organization.findFirst.mockResolvedValue(makeOrg())
      mockPrisma.organization.count.mockResolvedValue(0)
      mockPrisma.employeeOrganization.count.mockResolvedValue(0)
      mockPrisma.timeclockArea.count.mockResolvedValue(0)
      mockPrisma.shift.count.mockResolvedValue(0)
      mockPrisma.organization.update.mockResolvedValue(makeOrg({ isActive: false }))

      await service.remove('org-1', 'company-1')

      expect(mockPrisma.organization.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isActive: false } }),
      )
    })

    it('하위 조직이 있으면 ForbiddenException을 던진다', async () => {
      mockPrisma.organization.findFirst.mockResolvedValue(makeOrg())
      mockPrisma.organization.count.mockResolvedValue(2)

      await expect(service.remove('org-1', 'company-1')).rejects.toThrow(ForbiddenException)
    })

    it('소속 활성 직원이 있으면 ORG_HAS_EMPLOYEES로 차단한다', async () => {
      mockPrisma.organization.findFirst.mockResolvedValue(makeOrg())
      mockPrisma.organization.count.mockResolvedValue(0)
      mockPrisma.employeeOrganization.count.mockResolvedValue(3)

      await expect(service.remove('org-1', 'company-1')).rejects.toMatchObject({
        response: { code: 'ORG_HAS_EMPLOYEES' },
      })
      expect(mockPrisma.organization.update).not.toHaveBeenCalled()
    })

    it('출퇴근 장소(N:N)는 조직 삭제를 막지 않는다 — 연결만 Cascade로 해제된다', async () => {
      mockPrisma.organization.findFirst.mockResolvedValue(makeOrg())
      mockPrisma.organization.count.mockResolvedValue(0)
      mockPrisma.employeeOrganization.count.mockResolvedValue(0)
      mockPrisma.shift.count.mockResolvedValue(0)
      mockPrisma.organization.update.mockResolvedValue(makeOrg({ isActive: false }))

      await service.remove('org-1', 'company-1')

      // 장소 연결 여부와 무관하게 소프트 삭제까지 진행
      expect(mockPrisma.organization.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isActive: false } }),
      )
    })

    it('근무일정이 있으면 ORG_HAS_SHIFTS로 차단한다', async () => {
      mockPrisma.organization.findFirst.mockResolvedValue(makeOrg())
      mockPrisma.organization.count.mockResolvedValue(0)
      mockPrisma.employeeOrganization.count.mockResolvedValue(0)
      mockPrisma.timeclockArea.count.mockResolvedValue(0)
      mockPrisma.shift.count.mockResolvedValue(5)

      await expect(service.remove('org-1', 'company-1')).rejects.toMatchObject({
        response: { code: 'ORG_HAS_SHIFTS' },
      })
      expect(mockPrisma.organization.update).not.toHaveBeenCalled()
    })

    it('존재하지 않는 조직 삭제 시 NotFoundException을 던진다', async () => {
      mockPrisma.organization.findFirst.mockResolvedValue(null)

      await expect(service.remove('non-existent', 'company-1')).rejects.toThrow(NotFoundException)
    })
  })

  describe('부서 문서담당자 (다중)', () => {
    it('getDocManagers: 조직이 없으면 404', async () => {
      mockPrisma.organization.findFirst.mockResolvedValue(null)
      await expect(service.getDocManagers('company-1', 'org-x')).rejects.toThrow(NotFoundException)
    })

    it('setDocManagers: 타사 직원 포함 시 EMPLOYEE_NOT_FOUND', async () => {
      mockPrisma.organization.findFirst.mockResolvedValue(makeOrg())
      mockPrisma.employee.count.mockResolvedValue(1) // 2명 중 1명만 자사

      await expect(
        service.setDocManagers('company-1', 'org-1', ['emp-1', 'emp-2']),
      ).rejects.toMatchObject({ response: { code: 'EMPLOYEE_NOT_FOUND' } })
    })

    it('setDocManagers: 집합 교체 + sortOrder 부여 + 대표를 docManagerId에 동기화', async () => {
      mockPrisma.organization.findFirst.mockResolvedValue(makeOrg())
      mockPrisma.employee.count.mockResolvedValue(2)
      mockPrisma.organizationDocManager.deleteMany.mockResolvedValue({ count: 0 })
      mockPrisma.organizationDocManager.createMany.mockResolvedValue({ count: 2 })
      mockPrisma.organization.update.mockResolvedValue(makeOrg())
      mockPrisma.organizationDocManager.findMany.mockResolvedValue([])

      await service.setDocManagers('company-1', 'org-1', ['emp-1', 'emp-2'])

      expect(mockPrisma.organizationDocManager.deleteMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
      })
      expect(mockPrisma.organizationDocManager.createMany).toHaveBeenCalledWith({
        data: [
          { organizationId: 'org-1', employeeId: 'emp-1', sortOrder: 0 },
          { organizationId: 'org-1', employeeId: 'emp-2', sortOrder: 1 },
        ],
      })
      expect(mockPrisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { docManagerId: 'emp-1' },
      })
    })

    it('setDocManagers: 빈 목록이면 docManagerId=null로 해제', async () => {
      mockPrisma.organization.findFirst.mockResolvedValue(makeOrg())
      mockPrisma.organizationDocManager.deleteMany.mockResolvedValue({ count: 1 })
      mockPrisma.organization.update.mockResolvedValue(makeOrg())
      mockPrisma.organizationDocManager.findMany.mockResolvedValue([])

      await service.setDocManagers('company-1', 'org-1', [])

      expect(mockPrisma.organizationDocManager.createMany).not.toHaveBeenCalled()
      expect(mockPrisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { docManagerId: null },
      })
    })
  })

  describe('조직 출퇴근 장소 연결 (N:N)', () => {
    it('getTimeclockAreas: 조직이 없으면 404', async () => {
      mockPrisma.organization.findFirst.mockResolvedValue(null)
      await expect(service.getTimeclockAreas('company-1', 'org-x')).rejects.toThrow(NotFoundException)
    })

    it('setTimeclockAreas: 타사/비활성 장소 포함 시 TIMECLOCK_AREA_NOT_FOUND', async () => {
      mockPrisma.organization.findFirst.mockResolvedValue(makeOrg())
      mockPrisma.timeclockArea.count.mockResolvedValue(1) // 2개 중 1개만 자사·활성

      await expect(
        service.setTimeclockAreas('company-1', 'org-1', ['area-1', 'area-2']),
      ).rejects.toMatchObject({ response: { code: 'TIMECLOCK_AREA_NOT_FOUND' } })
    })

    it('setTimeclockAreas: 조인 집합을 통째로 교체한다', async () => {
      mockPrisma.organization.findFirst.mockResolvedValue(makeOrg())
      mockPrisma.timeclockArea.count.mockResolvedValue(2)
      mockPrisma.organizationTimeclockArea.deleteMany.mockResolvedValue({ count: 0 })
      mockPrisma.organizationTimeclockArea.createMany.mockResolvedValue({ count: 2 })
      mockPrisma.organizationTimeclockArea.findMany.mockResolvedValue([])

      await service.setTimeclockAreas('company-1', 'org-1', ['area-1', 'area-2'])

      expect(mockPrisma.organizationTimeclockArea.deleteMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
      })
      expect(mockPrisma.organizationTimeclockArea.createMany).toHaveBeenCalledWith({
        data: [
          { organizationId: 'org-1', timeclockAreaId: 'area-1' },
          { organizationId: 'org-1', timeclockAreaId: 'area-2' },
        ],
      })
    })

    it('setTimeclockAreas: 빈 목록이면 연결만 모두 해제', async () => {
      mockPrisma.organization.findFirst.mockResolvedValue(makeOrg())
      mockPrisma.organizationTimeclockArea.deleteMany.mockResolvedValue({ count: 3 })
      mockPrisma.organizationTimeclockArea.findMany.mockResolvedValue([])

      await service.setTimeclockAreas('company-1', 'org-1', [])

      expect(mockPrisma.organizationTimeclockArea.deleteMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
      })
      expect(mockPrisma.organizationTimeclockArea.createMany).not.toHaveBeenCalled()
    })
  })
})
