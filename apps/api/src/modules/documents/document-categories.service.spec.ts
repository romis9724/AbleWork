import { Test, TestingModule } from '@nestjs/testing'
import { NotFoundException, BadRequestException } from '@nestjs/common'
import { DocumentCategoriesService } from './document-categories.service'
import { PrismaService } from '../../prisma/prisma.service'

const COMPANY_ID = 'company-1'
const OTHER_COMPANY_ID = 'company-2'
const CAT_ID = 'dcat-1'

const mockPrisma = {
  documentCategory: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  document: { count: jest.fn() },
}

describe('DocumentCategoriesService', () => {
  let service: DocumentCategoriesService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DocumentCategoriesService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile()
    service = module.get(DocumentCategoriesService)
    jest.clearAllMocks()
  })

  it('findAll: 활성 문서성격만 정렬 조회 (companyId 스코프)', async () => {
    mockPrisma.documentCategory.findMany.mockResolvedValue([])
    await service.findAll(COMPANY_ID)
    expect(mockPrisma.documentCategory.findMany).toHaveBeenCalledWith({
      where: { companyId: COMPANY_ID, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })
  })

  it('create: 중복 없으면 companyId·약어와 함께 생성', async () => {
    mockPrisma.documentCategory.findFirst.mockResolvedValue(null)
    mockPrisma.documentCategory.create.mockResolvedValue({ id: CAT_ID })
    await service.create(COMPANY_ID, { name: '사업관리', abbreviation: '사업', sortOrder: 0 })
    expect(mockPrisma.documentCategory.create).toHaveBeenCalledWith({
      data: { companyId: COMPANY_ID, name: '사업관리', abbreviation: '사업', sortOrder: 0 },
    })
  })

  it('create: 이름/약어 중복이면 DOCUMENT_CATEGORY_DUPLICATE', async () => {
    mockPrisma.documentCategory.findFirst.mockResolvedValue({ id: 'dup' })
    await expect(
      service.create(COMPANY_ID, { name: '사업관리', abbreviation: '사업', sortOrder: 0 }),
    ).rejects.toMatchObject({ response: { code: 'DOCUMENT_CATEGORY_DUPLICATE' } })
    expect(mockPrisma.documentCategory.create).not.toHaveBeenCalled()
  })

  it('create: 중복 검사 where에 companyId·이름·약어 OR가 포함된다 (멀티테넌시)', async () => {
    mockPrisma.documentCategory.findFirst.mockResolvedValue(null)
    mockPrisma.documentCategory.create.mockResolvedValue({ id: CAT_ID })
    await service.create(COMPANY_ID, { name: '인사관리', abbreviation: '인사', sortOrder: 0 })
    expect(mockPrisma.documentCategory.findFirst).toHaveBeenCalledWith({
      where: { companyId: COMPANY_ID, OR: [{ name: '인사관리' }, { abbreviation: '인사' }] },
      select: { id: true },
    })
  })

  it('update: 타사 문서성격이면 404', async () => {
    mockPrisma.documentCategory.findFirst.mockResolvedValue(null)
    await expect(service.update(OTHER_COMPANY_ID, CAT_ID, { name: 'x' })).rejects.toThrow(
      NotFoundException,
    )
    expect(mockPrisma.documentCategory.update).not.toHaveBeenCalled()
  })

  it('remove: 사용 중이면 DOCUMENT_CATEGORY_IN_USE', async () => {
    mockPrisma.documentCategory.findFirst.mockResolvedValue({ id: CAT_ID })
    mockPrisma.document.count.mockResolvedValue(2)
    await expect(service.remove(COMPANY_ID, CAT_ID)).rejects.toMatchObject({
      response: { code: 'DOCUMENT_CATEGORY_IN_USE' },
    })
    expect(mockPrisma.documentCategory.delete).not.toHaveBeenCalled()
  })

  it('remove: 미사용이면 삭제하고 companyId 방어 where 적용', async () => {
    mockPrisma.documentCategory.findFirst.mockResolvedValue({ id: CAT_ID })
    mockPrisma.document.count.mockResolvedValue(0)
    mockPrisma.documentCategory.delete.mockResolvedValue({})
    const result = await service.remove(COMPANY_ID, CAT_ID)
    expect(result).toEqual({ deleted: true })
    expect(mockPrisma.documentCategory.delete).toHaveBeenCalledWith({
      where: { id: CAT_ID, companyId: COMPANY_ID },
    })
  })
})

// 미사용 import 정리용
void BadRequestException
