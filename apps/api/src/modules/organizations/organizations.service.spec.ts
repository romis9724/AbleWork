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
  })

  describe('remove', () => {
    it('하위 조직이 없으면 소프트 삭제한다', async () => {
      mockPrisma.organization.findFirst.mockResolvedValue(makeOrg())
      mockPrisma.organization.count.mockResolvedValue(0)
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

    it('존재하지 않는 조직 삭제 시 NotFoundException을 던진다', async () => {
      mockPrisma.organization.findFirst.mockResolvedValue(null)

      await expect(service.remove('non-existent', 'company-1')).rejects.toThrow(NotFoundException)
    })
  })
})
