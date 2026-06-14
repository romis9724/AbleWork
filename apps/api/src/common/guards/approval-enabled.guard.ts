import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { CompanySettingsService } from '../../modules/companies/company-settings.service'
import { JwtPayload } from '../types/jwt-payload.type'

/**
 * 전자결재 서비스 사용 설정 게이트.
 * 회사 설정 `approval.enable_service`가 false면 전자결재 관련 API 접근을 차단한다(기본 ON).
 * 회사 설정(/company-settings)은 게이트하지 않으므로 재활성화 경로는 항상 열려 있다.
 * HR 요청(/requests) 내부의 문서 자동생성은 컨트롤러를 거치지 않으므로 영향받지 않는다.
 */
@Injectable()
export class ApprovalEnabledGuard implements CanActivate {
  constructor(private readonly settings: CompanySettingsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: JwtPayload }>()
    const companyId = request.user?.companyId
    // 인증 가드(JwtAuthGuard)가 선행되므로 companyId는 존재. 방어적으로 없으면 통과시키지 않는다.
    if (!companyId) {
      throw new ForbiddenException({
        code: 'APPROVAL_SERVICE_DISABLED',
        message: '전자결재 서비스를 사용할 수 없습니다.',
      })
    }
    const enabled = await this.settings.get<boolean>(companyId, 'approval', 'enable_service', true)
    if (!enabled) {
      throw new ForbiddenException({
        code: 'APPROVAL_SERVICE_DISABLED',
        message: '전자결재 서비스가 비활성화되어 있습니다. 관리자에게 문의하세요.',
      })
    }
    return true
  }
}
