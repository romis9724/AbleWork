import { Module } from '@nestjs/common'
import { DocumentsController } from './documents.controller'
import { DocumentsService } from './documents.service'
import { ApprovalActionsService } from './approval-actions.service'
import { DocumentFormsController } from './document-forms.controller'
import { DocumentFormsService } from './document-forms.service'
import { SharedApprovalLinesController } from './shared-approval-lines.controller'
import { SharedApprovalLinesService } from './shared-approval-lines.service'
import { ProxySettingsController } from './proxy-settings.controller'
import { ProxySettingsService } from './proxy-settings.service'

/**
 * Phase 2 전자결재 (Goal 11~16)
 * - /document-forms        기안 양식 + 문서번호 채번 규칙
 * - /shared-approval-lines 공용 결재선
 * - /proxy-settings        대리결재자 설정
 * - /documents             기안/상신/회수/문서함 + 결재 처리
 */
@Module({
  controllers: [
    DocumentFormsController,
    SharedApprovalLinesController,
    ProxySettingsController,
    DocumentsController,
  ],
  providers: [
    DocumentsService,
    ApprovalActionsService,
    DocumentFormsService,
    SharedApprovalLinesService,
    ProxySettingsService,
  ],
  exports: [DocumentsService, ApprovalActionsService],
})
export class DocumentsModule {}
