import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { v4 as uuidv4 } from 'uuid'
import { Readable } from 'stream'
import { PrismaService } from '../../prisma/prisma.service'
import { StorageService } from '../../common/storage/storage.service'
import { JwtPayload } from '../../common/types/jwt-payload.type'
import { AccessLevel, ACCESS_LEVEL_HIERARCHY } from '@ablework/shared-constants'
import { DocStatus } from './documents.constants'

/** 첨부 1건 최대 크기 (20MB) */
export const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024
/** 문서당 최대 첨부 개수 */
export const MAX_ATTACHMENTS_PER_DOC = 10

/** 기안자가 첨부를 추가/삭제할 수 있는 상태 (작성/수정 가능 상태) */
const EDITABLE_STATUSES: string[] = [DocStatus.DRAFT, DocStatus.RECALLED, DocStatus.REJECTED]

const ZIP_CONTENT_TYPES = ['application/zip', 'application/x-zip-compressed', 'multipart/x-zip']

interface UploadedFile {
  originalname: string
  buffer: Buffer
  size: number
  mimetype: string
}

/**
 * AP-02-01 기안 첨부파일 — MinIO 오브젝트 스토리지 연동.
 * 업로드/삭제는 기안자 본인 + 작성 가능 상태(DRAFT/RECALLED/REJECTED)에서만,
 * 목록/다운로드는 문서 열람 권한(기안자/결재 관계자/관리자)에서 허용한다.
 */
@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async upload(companyId: string, documentId: string, file: UploadedFile, user: JwtPayload) {
    if (!this.storage.isAvailable()) {
      throw new ServiceUnavailableException({
        code: 'STORAGE_UNAVAILABLE',
        message: '파일 스토리지를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.',
      })
    }
    if (!file) {
      throw new BadRequestException({ code: 'ATTACHMENT_FILE_REQUIRED', message: '파일이 필요합니다.' })
    }
    if (file.size > MAX_ATTACHMENT_SIZE) {
      throw new BadRequestException({
        code: 'ATTACHMENT_TOO_LARGE',
        message: '첨부파일은 20MB를 초과할 수 없습니다.',
      })
    }

    const document = await this.loadUploadableDocument(companyId, documentId, user)

    // 양식이 ZIP 업로드를 허용하지 않으면 압축파일 차단 (AP-01-06)
    if (!document.form.allowZipUpload && this.isZip(file)) {
      throw new BadRequestException({
        code: 'ATTACHMENT_ZIP_NOT_ALLOWED',
        message: '이 양식은 압축파일(zip) 첨부를 허용하지 않습니다.',
      })
    }

    const count = await this.prisma.documentAttachment.count({ where: { documentId } })
    if (count >= MAX_ATTACHMENTS_PER_DOC) {
      throw new BadRequestException({
        code: 'ATTACHMENT_LIMIT_EXCEEDED',
        message: `첨부파일은 문서당 최대 ${MAX_ATTACHMENTS_PER_DOC}개까지 등록할 수 있습니다.`,
      })
    }

    const storageKey = `documents/${documentId}/${uuidv4()}`
    const contentType = file.mimetype || 'application/octet-stream'
    await this.storage.putObject(storageKey, file.buffer, contentType)

    // 한글 등 multipart latin1 디코딩 보정
    const fileName = this.decodeFileName(file.originalname)

    return this.prisma.documentAttachment.create({
      data: {
        companyId,
        documentId,
        uploaderId: user.employeeId,
        fileName,
        storageKey,
        contentType,
        size: file.size,
      },
      select: this.listSelect(),
    })
  }

  async list(companyId: string, documentId: string, user: JwtPayload) {
    await this.loadReadableDocument(companyId, documentId, user)
    return this.prisma.documentAttachment.findMany({
      where: { documentId, companyId },
      orderBy: { createdAt: 'asc' },
      select: this.listSelect(),
    })
  }

  async download(companyId: string, documentId: string, attachmentId: string, user: JwtPayload) {
    await this.loadReadableDocument(companyId, documentId, user)
    const attachment = await this.prisma.documentAttachment.findFirst({
      where: { id: attachmentId, documentId, companyId },
    })
    if (!attachment) {
      throw new NotFoundException({
        code: 'ATTACHMENT_NOT_FOUND',
        message: '첨부파일을 찾을 수 없습니다.',
      })
    }
    const stream: Readable = await this.storage.getObjectStream(attachment.storageKey)
    return {
      stream,
      fileName: attachment.fileName,
      contentType: attachment.contentType,
      size: attachment.size,
    }
  }

  async remove(companyId: string, documentId: string, attachmentId: string, user: JwtPayload) {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, companyId },
    })
    if (!document) {
      throw new NotFoundException({ code: 'DOCUMENT_NOT_FOUND', message: '문서를 찾을 수 없습니다.' })
    }
    // 완료(APPROVED) 문서의 첨부는 보존 — 최종 결재된 근거 자료 삭제 차단
    if (document.status === DocStatus.APPROVED) {
      throw new ForbiddenException({
        code: 'ATTACHMENT_DELETE_LOCKED',
        message: '완료된 문서의 첨부파일은 삭제할 수 없습니다.',
      })
    }

    const attachment = await this.prisma.documentAttachment.findFirst({
      where: { id: attachmentId, documentId, companyId },
    })
    if (!attachment) {
      throw new NotFoundException({
        code: 'ATTACHMENT_NOT_FOUND',
        message: '첨부파일을 찾을 수 없습니다.',
      })
    }

    // 삭제 권한: 업로더 본인 / 작성 가능 상태의 기안자 / 관리자
    const isUploader = attachment.uploaderId === user.employeeId
    const isDrafterEditable =
      document.drafterId === user.employeeId && EDITABLE_STATUSES.includes(document.status)
    if (!isUploader && !isDrafterEditable && !this.isCompanyAdmin(user)) {
      throw new ForbiddenException({
        code: 'ATTACHMENT_DELETE_FORBIDDEN',
        message: '본인이 올린 첨부파일만 삭제할 수 있습니다.',
      })
    }

    await this.prisma.documentAttachment.delete({ where: { id: attachmentId } })
    await this.storage.removeObject(attachment.storageKey)
    return { deleted: true }
  }

  // ── 내부 헬퍼 ────────────────────────────────────────────────────────────────

  private listSelect() {
    return {
      id: true,
      fileName: true,
      contentType: true,
      size: true,
      createdAt: true,
      uploader: { select: { id: true, name: true } },
    }
  }

  /**
   * 첨부 업로드 가능 문서 로드.
   * - 작성 가능 상태(DRAFT/RECALLED/REJECTED): 기안자 본인만.
   * - 상신 후(PENDING/APPROVED 등): 기안자 + 결재 관계자(assignee/proxy) + 관리자.
   *   계약 기안 완료 후 최종날인 스캔본 등 사후 첨부를 허용한다(본문·결재선은 잠금 유지).
   */
  private async loadUploadableDocument(companyId: string, documentId: string, user: JwtPayload) {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, companyId },
      include: {
        form: { select: { allowZipUpload: true } },
        approvalLines: { select: { steps: { select: { assigneeId: true, proxyId: true } } } },
      },
    })
    if (!document) {
      throw new NotFoundException({ code: 'DOCUMENT_NOT_FOUND', message: '문서를 찾을 수 없습니다.' })
    }

    const isDrafter = document.drafterId === user.employeeId

    // 작성 가능 상태 — 기안자만
    if (EDITABLE_STATUSES.includes(document.status)) {
      if (!isDrafter) {
        throw new ForbiddenException({
          code: 'DOCUMENT_NOT_DRAFTER',
          message: '기안자 본인만 첨부를 변경할 수 있습니다.',
        })
      }
      return document
    }

    // 상신 후 — 기안자/관리자/결재 관계자
    if (isDrafter || this.isCompanyAdmin(user)) return document
    const isParticipant = document.approvalLines
      .flatMap((line: { steps: Array<{ assigneeId: string; proxyId: string | null }> }) => line.steps)
      .some((s) => s.assigneeId === user.employeeId || s.proxyId === user.employeeId)
    if (!isParticipant) {
      throw new ForbiddenException({
        code: 'DOCUMENT_ACCESS_FORBIDDEN',
        message: '첨부파일을 추가할 권한이 없습니다.',
      })
    }
    return document
  }

  /** 문서 열람 권한 확인 (기안자/결재 관계자/관리자) — 목록/다운로드용 */
  private async loadReadableDocument(companyId: string, documentId: string, user: JwtPayload) {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, companyId },
      include: {
        approvalLines: { select: { steps: { select: { assigneeId: true, proxyId: true } } } },
      },
    })
    if (!document) {
      throw new NotFoundException({ code: 'DOCUMENT_NOT_FOUND', message: '문서를 찾을 수 없습니다.' })
    }
    if (this.isCompanyAdmin(user)) return document
    if (document.drafterId === user.employeeId) return document

    const isParticipant = document.approvalLines
      .flatMap((line: { steps: Array<{ assigneeId: string; proxyId: string | null }> }) => line.steps)
      .some((s) => s.assigneeId === user.employeeId || s.proxyId === user.employeeId)
    if (!isParticipant) {
      throw new ForbiddenException({
        code: 'DOCUMENT_ACCESS_FORBIDDEN',
        message: '문서를 열람할 권한이 없습니다.',
      })
    }
    return document
  }

  private isCompanyAdmin(user: JwtPayload): boolean {
    return (
      ACCESS_LEVEL_HIERARCHY[user.accessLevel] >=
      ACCESS_LEVEL_HIERARCHY[AccessLevel.GENERAL_ADMIN]
    )
  }

  private isZip(file: UploadedFile): boolean {
    if (ZIP_CONTENT_TYPES.includes(file.mimetype)) return true
    return /\.zip$/i.test(file.originalname)
  }

  /** multipart 파일명은 latin1로 들어오는 경우가 많아 UTF-8로 보정 */
  private decodeFileName(raw: string): string {
    try {
      return Buffer.from(raw, 'latin1').toString('utf8')
    } catch {
      return raw
    }
  }
}
