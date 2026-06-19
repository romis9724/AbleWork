import { Test, TestingModule } from '@nestjs/testing'
import {
  NotFoundException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { AttachmentsService, MAX_ATTACHMENT_SIZE } from './attachments.service'
import { PrismaService } from '../../prisma/prisma.service'
import { StorageService } from '../../common/storage/storage.service'
import { JwtPayload } from '../../common/types/jwt-payload.type'
import { AccessLevel } from '@ablework/shared-constants'

const COMPANY_ID = 'company-1'
const DRAFTER_ID = 'drafter-1'
const DOCUMENT_ID = 'document-1'

const makeUser = (
  accessLevel: AccessLevel = AccessLevel.EMPLOYEE,
  employeeId = DRAFTER_ID,
): JwtPayload => ({ sub: 'user-1', employeeId, companyId: COMPANY_ID, accessLevel })

const makeFile = (overrides: Partial<{ originalname: string; mimetype: string; size: number }> = {}) => ({
  originalname: overrides.originalname ?? '명세서.pdf',
  mimetype: overrides.mimetype ?? 'application/pdf',
  size: overrides.size ?? 1024,
  buffer: Buffer.from('hello'),
})

const mockPrisma = {
  document: { findFirst: jest.fn() },
  documentAttachment: {
    count: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    delete: jest.fn(),
  },
}

const mockStorage = {
  isAvailable: jest.fn().mockReturnValue(true),
  putObject: jest.fn().mockResolvedValue(undefined),
  getObjectStream: jest.fn().mockResolvedValue('STREAM'),
  removeObject: jest.fn().mockResolvedValue(undefined),
}

describe('AttachmentsService', () => {
  let service: AttachmentsService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttachmentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageService, useValue: mockStorage },
      ],
    }).compile()
    service = module.get(AttachmentsService)
    jest.clearAllMocks()
    mockStorage.isAvailable.mockReturnValue(true)
  })

  const draftDoc = (overrides: Record<string, unknown> = {}) => ({
    id: DOCUMENT_ID,
    companyId: COMPANY_ID,
    drafterId: DRAFTER_ID,
    status: 'DRAFT',
    form: { allowZipUpload: false },
    ...overrides,
  })

  describe('upload', () => {
    it('스토리지 미가용 시 503', async () => {
      mockStorage.isAvailable.mockReturnValue(false)
      await expect(
        service.upload(COMPANY_ID, DOCUMENT_ID, makeFile(), makeUser()),
      ).rejects.toThrow(ServiceUnavailableException)
    })

    it('20MB 초과 시 400', async () => {
      await expect(
        service.upload(COMPANY_ID, DOCUMENT_ID, makeFile({ size: MAX_ATTACHMENT_SIZE + 1 }), makeUser()),
      ).rejects.toMatchObject({ response: { code: 'ATTACHMENT_TOO_LARGE' } })
    })

    it('기안자가 아니면 403', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(draftDoc())
      await expect(
        service.upload(COMPANY_ID, DOCUMENT_ID, makeFile(), makeUser(AccessLevel.EMPLOYEE, 'other')),
      ).rejects.toMatchObject({ response: { code: 'DOCUMENT_NOT_DRAFTER' } })
    })

    it('상신된 문서면 400', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(draftDoc({ status: 'PENDING' }))
      await expect(
        service.upload(COMPANY_ID, DOCUMENT_ID, makeFile(), makeUser()),
      ).rejects.toMatchObject({ response: { code: 'DOCUMENT_ALREADY_SUBMITTED' } })
    })

    it('zip 비허용 양식에 zip 업로드 시 400', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(draftDoc({ form: { allowZipUpload: false } }))
      await expect(
        service.upload(
          COMPANY_ID,
          DOCUMENT_ID,
          makeFile({ originalname: 'a.zip', mimetype: 'application/zip' }),
          makeUser(),
        ),
      ).rejects.toMatchObject({ response: { code: 'ATTACHMENT_ZIP_NOT_ALLOWED' } })
    })

    it('첨부 개수 한도 초과 시 400', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(draftDoc())
      mockPrisma.documentAttachment.count.mockResolvedValue(10)
      await expect(
        service.upload(COMPANY_ID, DOCUMENT_ID, makeFile(), makeUser()),
      ).rejects.toMatchObject({ response: { code: 'ATTACHMENT_LIMIT_EXCEEDED' } })
    })

    it('정상 업로드: 스토리지 put + 메타 레코드 생성', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(draftDoc())
      mockPrisma.documentAttachment.count.mockResolvedValue(0)
      mockPrisma.documentAttachment.create.mockResolvedValue({ id: 'att-1', fileName: '명세서.pdf' })

      await service.upload(COMPANY_ID, DOCUMENT_ID, makeFile(), makeUser())

      expect(mockStorage.putObject).toHaveBeenCalledWith(
        expect.stringMatching(/^documents\/document-1\//),
        expect.any(Buffer),
        'application/pdf',
      )
      expect(mockPrisma.documentAttachment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: COMPANY_ID,
            documentId: DOCUMENT_ID,
            uploaderId: DRAFTER_ID,
            size: 1024,
          }),
        }),
      )
    })
  })

  describe('list / download 권한', () => {
    const readableDoc = (overrides: Record<string, unknown> = {}) => ({
      id: DOCUMENT_ID,
      companyId: COMPANY_ID,
      drafterId: DRAFTER_ID,
      approvalLines: [{ steps: [{ assigneeId: 'approver-1', proxyId: null }] }],
      ...overrides,
    })

    it('열람 권한 없는 직원은 list 403', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(readableDoc())
      await expect(
        service.list(COMPANY_ID, DOCUMENT_ID, makeUser(AccessLevel.EMPLOYEE, 'stranger')),
      ).rejects.toMatchObject({ response: { code: 'DOCUMENT_ACCESS_FORBIDDEN' } })
    })

    it('결재 관계자는 list 가능', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(readableDoc())
      mockPrisma.documentAttachment.findMany.mockResolvedValue([])
      await service.list(COMPANY_ID, DOCUMENT_ID, makeUser(AccessLevel.EMPLOYEE, 'approver-1'))
      expect(mockPrisma.documentAttachment.findMany).toHaveBeenCalled()
    })

    it('관리자는 list 가능', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(readableDoc())
      mockPrisma.documentAttachment.findMany.mockResolvedValue([])
      await service.list(COMPANY_ID, DOCUMENT_ID, makeUser(AccessLevel.GENERAL_ADMIN, 'admin'))
      expect(mockPrisma.documentAttachment.findMany).toHaveBeenCalled()
    })

    it('download: 첨부 미존재 시 404', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(readableDoc())
      mockPrisma.documentAttachment.findFirst.mockResolvedValue(null)
      await expect(
        service.download(COMPANY_ID, DOCUMENT_ID, 'att-x', makeUser()),
      ).rejects.toThrow(NotFoundException)
    })

    it('download: 정상 시 스트림/파일명 반환', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(readableDoc())
      mockPrisma.documentAttachment.findFirst.mockResolvedValue({
        id: 'att-1',
        storageKey: 'documents/document-1/abc',
        fileName: '명세서.pdf',
        contentType: 'application/pdf',
        size: 1024,
      })
      const res = await service.download(COMPANY_ID, DOCUMENT_ID, 'att-1', makeUser())
      expect(res).toMatchObject({ fileName: '명세서.pdf', contentType: 'application/pdf', size: 1024 })
      expect(mockStorage.getObjectStream).toHaveBeenCalledWith('documents/document-1/abc')
    })
  })

  describe('remove', () => {
    it('정상 삭제: 레코드 삭제 + 스토리지 오브젝트 제거', async () => {
      mockPrisma.document.findFirst.mockResolvedValue({
        id: DOCUMENT_ID,
        companyId: COMPANY_ID,
        drafterId: DRAFTER_ID,
        status: 'DRAFT',
        form: { allowZipUpload: false },
      })
      mockPrisma.documentAttachment.findFirst.mockResolvedValue({
        id: 'att-1',
        storageKey: 'documents/document-1/abc',
      })
      mockPrisma.documentAttachment.delete.mockResolvedValue({})

      const result = await service.remove(COMPANY_ID, DOCUMENT_ID, 'att-1', makeUser())
      expect(result).toEqual({ deleted: true })
      expect(mockPrisma.documentAttachment.delete).toHaveBeenCalledWith({ where: { id: 'att-1' } })
      expect(mockStorage.removeObject).toHaveBeenCalledWith('documents/document-1/abc')
    })

    it('기안자가 아니면 403 (스토리지 미접근)', async () => {
      mockPrisma.document.findFirst.mockResolvedValue({
        id: DOCUMENT_ID,
        companyId: COMPANY_ID,
        drafterId: DRAFTER_ID,
        status: 'DRAFT',
        form: { allowZipUpload: false },
      })
      await expect(
        service.remove(COMPANY_ID, DOCUMENT_ID, 'att-1', makeUser(AccessLevel.EMPLOYEE, 'other')),
      ).rejects.toThrow(ForbiddenException)
      expect(mockStorage.removeObject).not.toHaveBeenCalled()
    })
  })
})
