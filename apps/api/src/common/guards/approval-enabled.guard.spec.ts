import { ForbiddenException } from '@nestjs/common'
import { ExecutionContext } from '@nestjs/common'
import { ApprovalEnabledGuard } from './approval-enabled.guard'
import { CompanySettingsService } from '../../modules/companies/company-settings.service'

const makeContext = (user: unknown): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext

describe('ApprovalEnabledGuard', () => {
  let guard: ApprovalEnabledGuard
  const settings = { get: jest.fn() }

  beforeEach(() => {
    guard = new ApprovalEnabledGuard(settings as unknown as CompanySettingsService)
    jest.clearAllMocks()
  })

  it('approval.enable_service=true면 통과', async () => {
    settings.get.mockResolvedValue(true)
    await expect(
      guard.canActivate(makeContext({ companyId: 'c1', employeeId: 'e1' })),
    ).resolves.toBe(true)
    expect(settings.get).toHaveBeenCalledWith('c1', 'approval', 'enable_service', true)
  })

  it('approval.enable_service=false면 APPROVAL_SERVICE_DISABLED 403', async () => {
    settings.get.mockResolvedValue(false)
    await expect(
      guard.canActivate(makeContext({ companyId: 'c1', employeeId: 'e1' })),
    ).rejects.toMatchObject({ response: { code: 'APPROVAL_SERVICE_DISABLED' } })
  })

  it('companyId 없으면 403 (방어적)', async () => {
    await expect(guard.canActivate(makeContext(undefined))).rejects.toThrow(ForbiddenException)
    expect(settings.get).not.toHaveBeenCalled()
  })
})
