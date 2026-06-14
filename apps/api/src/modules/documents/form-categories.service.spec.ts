import { Test, TestingModule } from '@nestjs/testing'
import { NotFoundException, ForbiddenException } from '@nestjs/common'
import { FormCategoriesService } from './form-categories.service'
import { PrismaService } from '../../prisma/prisma.service'

const COMPANY_ID = 'company-1'
const CAT_ID = 'cat-1'

const mockPrisma = {
  formCategory: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  documentForm: { count: jest.fn() },
}

describe('FormCategoriesService', () => {
  let service: FormCategoriesService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FormCategoriesService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile()
    service = module.get(FormCategoriesService)
    jest.clearAllMocks()
  })

  it('findAll: 활성 분류만 정렬 조회', async () => {
    mockPrisma.formCategory.findMany.mockResolvedValue([])
    await service.findAll(COMPANY_ID)
    expect(mockPrisma.formCategory.findMany).toHaveBeenCalledWith({
      where: { companyId: COMPANY_ID, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })
  })

  it('create: companyId 주입', async () => {
    mockPrisma.formCategory.create.mockResolvedValue({ id: CAT_ID })
    await service.create(COMPANY_ID, { name: '인사', sortOrder: 1 })
    expect(mockPrisma.formCategory.create).toHaveBeenCalledWith({
      data: { companyId: COMPANY_ID, name: '인사', sortOrder: 1 },
    })
  })

  it('update: 타사 분류면 404', async () => {
    mockPrisma.formCategory.findFirst.mockResolvedValue(null)
    await expect(
      service.update(COMPANY_ID, CAT_ID, { name: 'x' }),
    ).rejects.toThrow(NotFoundException)
  })

  it('remove: 사용 중이면 FORM_CATEGORY_IN_USE', async () => {
    mockPrisma.formCategory.findFirst.mockResolvedValue({ id: CAT_ID })
    mockPrisma.documentForm.count.mockResolvedValue(2)
    await expect(service.remove(COMPANY_ID, CAT_ID)).rejects.toMatchObject({
      response: { code: 'FORM_CATEGORY_IN_USE' },
    })
    expect(mockPrisma.formCategory.delete).not.toHaveBeenCalled()
  })

  it('remove: 미사용이면 삭제', async () => {
    mockPrisma.formCategory.findFirst.mockResolvedValue({ id: CAT_ID })
    mockPrisma.documentForm.count.mockResolvedValue(0)
    mockPrisma.formCategory.delete.mockResolvedValue({})
    const result = await service.remove(COMPANY_ID, CAT_ID)
    expect(result).toEqual({ deleted: true })
    expect(mockPrisma.formCategory.delete).toHaveBeenCalledWith({ where: { id: CAT_ID } })
  })
})

// ForbiddenException은 in-use 가드에서 사용 (import 유지 확인용)
void ForbiddenException
