import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Res,
  StreamableFile,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiConsumes } from '@nestjs/swagger'
import type { Response } from 'express'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { ApprovalEnabledGuard } from '../../common/guards/approval-enabled.guard'
import { CompanyId } from '../../common/decorators/company-id.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { JwtPayload } from '../../common/types/jwt-payload.type'
import { AttachmentsService, MAX_ATTACHMENT_SIZE } from './attachments.service'

@ApiTags('document-attachments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, ApprovalEnabledGuard)
@Controller('documents/:id/attachments')
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  // AP-02-01 첨부 업로드 (multipart, field=file)
  @Post()
  @ApiOperation({ summary: '기안 첨부 업로드 (기안자, 작성 가능 상태)' })
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'id', type: String })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_ATTACHMENT_SIZE } }))
  upload(
    @CompanyId() companyId: string,
    @Param('id') documentId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.attachments.upload(companyId, documentId, file, user)
  }

  // 첨부 목록
  @Get()
  @ApiOperation({ summary: '기안 첨부 목록 (열람 권한자)' })
  @ApiParam({ name: 'id', type: String })
  list(
    @CompanyId() companyId: string,
    @Param('id') documentId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.attachments.list(companyId, documentId, user)
  }

  // 첨부 다운로드 (스트리밍)
  @Get(':attachmentId/download')
  @ApiOperation({ summary: '기안 첨부 다운로드 (열람 권한자)' })
  @ApiParam({ name: 'id', type: String })
  @ApiParam({ name: 'attachmentId', type: String })
  async download(
    @CompanyId() companyId: string,
    @Param('id') documentId: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { stream, fileName, contentType, size } = await this.attachments.download(
      companyId,
      documentId,
      attachmentId,
      user,
    )
    res.set({
      'Content-Type': contentType,
      'Content-Length': String(size),
      // RFC 5987 — 한글 파일명 안전 인코딩
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    })
    return new StreamableFile(stream)
  }

  // 첨부 삭제 (기안자, 작성 가능 상태)
  @Delete(':attachmentId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '기안 첨부 삭제 (기안자, 작성 가능 상태)' })
  @ApiParam({ name: 'id', type: String })
  @ApiParam({ name: 'attachmentId', type: String })
  remove(
    @CompanyId() companyId: string,
    @Param('id') documentId: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.attachments.remove(companyId, documentId, attachmentId, user)
  }
}
