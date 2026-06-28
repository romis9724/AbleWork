import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Prisma } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import { randomBytes, createHash } from 'crypto'
import { PrismaService } from '../../prisma/prisma.service'
import { JwtPayload } from '../../common/types/jwt-payload.type'
import { CompanySettingsService } from '../companies/company-settings.service'
import { MailService } from '../mail/mail.service'
import { AccessLevel, ACCESS_LEVEL_HIERARCHY } from '@ablework/shared-constants'
import { CreateEmployeeDto, type BulkCreateEmployeeDto } from './dto/create-employee.dto'
import { UpdateEmployeeDto } from './dto/update-employee.dto'
import { EmployeeFilterDto } from './dto/employee-filter.dto'
import { CreateWageInfoDto } from '../wage-info/dto/create-wage-info.dto'
import { EVENTS } from '../../events/domain-events'
import { AuditService } from '../audit/audit.service'

// 계정 설정(초대) 토큰 유효기간 — 대량 등록 직원이 메일을 늦게 열어도 되도록 7일
const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000
const INVITE_TOKEN_BYTES = 32

@Injectable()
export class EmployeesService {
  private readonly logger = new Logger(EmployeesService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly settingsService: CompanySettingsService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  // ── 목록 조회 ───────────────────────────────────────────────────────────────

  async findAll(companyId: string, filter: EmployeeFilterDto, requester: JwtPayload) {
    const {
      search,
      organizationId,
      positionId,
      organizationIds,
      positionIds,
      excludeSuperAdmin,
      isActive,
      page,
      limit,
    } = filter
    const skip = (page - 1) * limit

    // ORG_ADMIN은 자신의 조직 소속 직원만 볼 수 있다
    const orgScope = await this.resolveOrgScope(requester)

    // 조직/직위 조건은 모두 organizations/positions 관계를 참조하므로
    // 단일 객체로 spread하면 키가 충돌해 마지막 조건만 남는다.
    // AND 배열로 합쳐 orgScope(보안)·조직 필터·직위 필터가 모두 적용되도록 한다.
    const and: Record<string, unknown>[] = []
    if (orgScope) {
      and.push({ organizations: { some: { organizationId: { in: orgScope } } } })
    }
    const orgIds = organizationIds?.length ? organizationIds : organizationId ? [organizationId] : null
    if (orgIds) {
      and.push({ organizations: { some: { organizationId: { in: orgIds } } } })
    }
    const posIds = positionIds?.length ? positionIds : positionId ? [positionId] : null
    if (posIds) {
      and.push({ positions: { some: { positionId: { in: posIds } } } })
    }

    const where: Record<string, unknown> = {
      companyId,
      ...(isActive !== undefined && { isActive }),
      // 인사관리 목록 전용: 최고관리자 제외 (별도 관계 키와 충돌 없어 직접 지정)
      ...(excludeSuperAdmin && { accessLevel: { not: AccessLevel.SUPER_ADMIN } }),
      ...(and.length > 0 && { AND: and }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
          { employeeNumber: { contains: search } },
        ],
      }),
    }

    const [items, total] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { email: true } },
          organizations: {
            include: { organization: { select: { id: true, name: true } } },
          },
          positions: {
            include: { position: { select: { id: true, name: true, color: true } } },
          },
        },
      }),
      this.prisma.employee.count({ where }),
    ])

    return { items, total, page, limit }
  }

  // ── 단일 조회 ───────────────────────────────────────────────────────────────

  async findOne(companyId: string, id: string, requester: JwtPayload) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, companyId },
      include: {
        user: { select: { email: true } },
        organizations: {
          include: { organization: { select: { id: true, name: true } } },
        },
        positions: {
          include: { position: { select: { id: true, name: true, color: true } } },
        },
        wageInfos: { orderBy: { effectiveFrom: 'desc' }, take: 1 },
      },
    })

    if (!employee) {
      throw new NotFoundException({
        code: 'EMPLOYEE_NOT_FOUND',
        message: '직원을 찾을 수 없습니다.',
      })
    }

    await this.guardOrgScope(requester, employee)
    return employee
  }

  // ── 직원 등록 ───────────────────────────────────────────────────────────────

  async create(companyId: string, dto: CreateEmployeeDto, requester?: JwtPayload) {
    const { email, initialPassword, organizationIds, primaryOrganizationId, positionIds, joinedAt, ...rest } =
      dto

    // 조직이 같은 회사 소속인지 확인
    await this.validateOrganizationsBelongToCompany(companyId, organizationIds)

    // 같은 회사에 같은 이메일(계정)의 직원이 이미 있으면:
    //  - 재직 중: 중복 등록 차단
    //  - 퇴사(비활성): 재입사로 보고 기존 레코드를 재활성화 + 새 정보로 갱신
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    })
    if (existingUser) {
      const existingEmp = await this.prisma.employee.findFirst({
        where: { companyId, userId: existingUser.id },
        select: { id: true, isActive: true },
      })
      if (existingEmp?.isActive) {
        throw new BadRequestException({
          code: 'EMPLOYEE_ALREADY_EXISTS',
          message: '이미 등록된 직원입니다. (동일 이메일이 재직 중)',
        })
      }
      if (existingEmp) {
        return this.reactivateForReentry(existingEmp.id, dto)
      }
    }

    // 초기 비밀번호가 있으면 즉시 로그인 가능한 활성 계정을 만든다.
    // 없으면 비활성 계정으로 생성하고, 추후 비밀번호 재설정으로 활성화한다.
    const passwordHash = initialPassword ? await bcrypt.hash(initialPassword, 10) : ''

    const created = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // User 조회 또는 신규 생성
      let user = await tx.user.findUnique({ where: { email } })
      if (!user) {
        user = await tx.user.create({
          data: {
            email,
            passwordHash,
            name: rest.name,
            isActive: Boolean(initialPassword), // 비밀번호 설정 시에만 활성
          },
        })
      }

      // Employee 생성
      const employee = await tx.employee.create({
        data: {
          companyId,
          userId: user.id,
          joinedAt: new Date(joinedAt),
          ...rest,
        },
      })

      // 조직 연결
      await tx.employeeOrganization.createMany({
        data: organizationIds.map((orgId) => ({
          employeeId: employee.id,
          organizationId: orgId,
          isPrimary: orgId === primaryOrganizationId,
        })),
      })

      // 직위 연결
      if (positionIds.length > 0) {
        await tx.employeePosition.createMany({
          data: positionIds.map((positionId) => ({
            employeeId: employee.id,
            positionId,
          })),
        })
      }

      // 직원 등록 도메인 이벤트 (감사/알림 확장용)
      this.events.emit(EVENTS.EMPLOYEE_CREATED, {
        employeeId: employee.id,
        email,
        name: rest.name,
        companyId,
      })

      return employee
    })

    // 초기 비밀번호를 입력하지 않은 경우(비활성 계정) → 직원에게 비밀번호 설정(초대) 메일 발송
    if (!initialPassword && created.userId) {
      await this.sendSetupInvite(created.userId, email, rest.name)
    }

    await this.audit.record({
      companyId,
      actorId: requester?.employeeId ?? null,
      action: 'EMPLOYEE_CREATE',
      targetType: 'EMPLOYEE',
      targetId: created.id,
      targetLabel: created.name,
    })

    return created
  }

  /**
   * 퇴사(비활성) 직원의 재입사 처리 — 기존 Employee 레코드를 재활성화하고
   * 새 정보(이름·입사일·고용형태·권한·조직·직위 등)로 갱신한다.
   * 과거 이력(출퇴근·결재 등)은 같은 레코드에 그대로 연결되어 보존된다.
   */
  private async reactivateForReentry(id: string, dto: CreateEmployeeDto) {
    const {
      initialPassword,
      organizationIds,
      primaryOrganizationId,
      positionIds,
      joinedAt,
      // email은 기존 계정과 동일하므로 갱신 대상에서 제외
      email: _email,
      ...rest
    } = dto
    const passwordHash = initialPassword ? await bcrypt.hash(initialPassword, 10) : undefined

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const employee = await tx.employee.update({
        where: { id },
        data: {
          ...rest, // name, employmentType, accessLevel, phone?, employeeNumber?
          joinedAt: new Date(joinedAt),
          isActive: true,
          resignedAt: null,
        },
      })

      // 조직 재설정
      await tx.employeeOrganization.deleteMany({ where: { employeeId: id } })
      await tx.employeeOrganization.createMany({
        data: organizationIds.map((orgId) => ({
          employeeId: id,
          organizationId: orgId,
          isPrimary: orgId === primaryOrganizationId,
        })),
      })

      // 직위 재설정
      await tx.employeePosition.deleteMany({ where: { employeeId: id } })
      if (positionIds.length > 0) {
        await tx.employeePosition.createMany({
          data: positionIds.map((positionId) => ({ employeeId: id, positionId })),
        })
      }

      // 연결된 User 동기화 (이름/전화, 비밀번호 지정 시 활성화)
      if (employee.userId) {
        await tx.user.update({
          where: { id: employee.userId },
          data: {
            name: rest.name,
            ...(rest.phone !== undefined && { phone: rest.phone }),
            ...(passwordHash !== undefined && { passwordHash, isActive: true }),
          },
        })
      }

      return employee
    })
  }

  // ── 직원 일괄 등록 (CSV) ────────────────────────────────────────────────────

  async bulkCreate(
    companyId: string,
    rows: BulkCreateEmployeeDto['rows'],
    requester: JwtPayload,
  ): Promise<{ created: number; errors: { row: number; message: string }[] }> {
    const orgs = await this.prisma.organization.findMany({
      where: { companyId },
      select: { id: true, name: true },
    })
    const orgByName = new Map(orgs.map((o) => [o.name.trim(), o.id]))

    // 직위(이름→id) — 활성 직위만
    const positions = await this.prisma.position.findMany({
      where: { companyId, isActive: true },
      select: { id: true, name: true },
    })
    const posByName = new Map(positions.map((p) => [p.name.trim(), p.id]))

    const employmentMap: Record<string, 'regular' | 'contract' | 'part_time' | 'daily'> = {
      regular: 'regular', 정규직: 'regular',
      contract: 'contract', 계약직: 'contract',
      part_time: 'part_time', 단시간: 'part_time', 파트타임: 'part_time',
      daily: 'daily', 일용직: 'daily',
    }
    // 권한 라벨 → AccessLevel (최고관리자는 업로드 불가)
    const accessLevelMap: Record<string, AccessLevel> = {
      직원: AccessLevel.EMPLOYEE,
      사원: AccessLevel.EMPLOYEE,
      조직관리자: AccessLevel.ORG_ADMIN,
      총괄관리자: AccessLevel.GENERAL_ADMIN,
    }

    // 세미콜론(또는 콤마) 구분 다중 값 → trim 배열
    const splitMulti = (v: string | undefined): string[] =>
      (v ?? '').split(/[;,]/).map((s) => s.trim()).filter(Boolean)

    let created = 0
    const errors: { row: number; message: string }[] = []

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      const rowNo = i + 2 // CSV 헤더(1행) + 1-기준
      try {
        // 조직(다중) — 첫 번째가 본조직
        const orgNames = splitMulti(r.organizationName)
        if (orgNames.length === 0) throw new Error('조직을 입력하세요.')
        const orgIds: string[] = []
        for (const n of orgNames) {
          const id = orgByName.get(n)
          if (!id) throw new Error(`조직 '${n}'을(를) 찾을 수 없습니다.`)
          orgIds.push(id)
        }

        // 직위(다중) — 이름 매칭
        const positionIds: string[] = []
        for (const n of splitMulti(r.positionName)) {
          const id = posByName.get(n)
          if (!id) throw new Error(`직위 '${n}'을(를) 찾을 수 없습니다.`)
          positionIds.push(id)
        }

        // 권한 — 라벨 매핑(최고관리자 거부, 미지정 시 직원)
        const levelLabel = (r.accessLevel ?? '').trim()
        if (levelLabel === '최고관리자') {
          throw new Error('최고관리자는 업로드로 등록할 수 없습니다.')
        }
        const accessLevel =
          levelLabel === '' ? AccessLevel.EMPLOYEE : accessLevelMap[levelLabel]
        if (!accessLevel) throw new Error(`권한 '${levelLabel}'을(를) 인식할 수 없습니다.`)

        const employmentType = employmentMap[(r.employmentType ?? '').trim()] ?? 'regular'
        const employee = await this.create(
          companyId,
          {
            name: r.name.trim(),
            email: r.email.trim(),
            joinedAt: r.joinedAt,
            employmentType,
            accessLevel,
            organizationIds: orgIds,
            primaryOrganizationId: orgIds[0],
            positionIds,
            ...(r.employeeNumber ? { employeeNumber: r.employeeNumber.trim() } : {}),
            ...(r.phone ? { phone: r.phone.trim() } : {}),
          } as CreateEmployeeDto,
          requester,
        )
        created++
        // 비활성 계정 → 비밀번호 설정(초대) 메일 발송 (실패해도 등록은 유지)
        if (employee.userId) {
          await this.sendSetupInvite(employee.userId, r.email.trim(), r.name.trim())
        }
      } catch (e: unknown) {
        const msg =
          (e as { response?: { message?: string }; message?: string })?.response?.message ??
          (e instanceof Error ? e.message : '알 수 없는 오류')
        errors.push({ row: rowNo, message: msg })
      }
    }

    return { created, errors }
  }

  /**
   * 계정 설정(초대) 메일 발송 — 비활성 계정에 비밀번호 설정 링크를 보낸다.
   * 토큰은 비밀번호 재설정 토큰과 동일 체계(직원이 설정 시 계정 활성화).
   * 발송 실패는 로깅만 하고 throw 하지 않는다(등록 자체는 유지).
   */
  private async sendSetupInvite(userId: string, email: string, name: string): Promise<void> {
    try {
      const token = randomBytes(INVITE_TOKEN_BYTES).toString('hex')
      const tokenHash = createHash('sha256').update(token).digest('hex')
      await this.prisma.passwordResetToken.create({
        data: {
          userId,
          tokenHash,
          expiresAt: new Date(Date.now() + INVITE_TOKEN_TTL_MS),
        },
      })
      await this.mail.sendAccountSetup(email, token, name)
    } catch (error) {
      this.logger.error(`계정 설정 메일 발송 실패 (userId: ${userId})`, error)
    }
  }

  // ── 직원 수정 ───────────────────────────────────────────────────────────────

  async update(companyId: string, id: string, dto: UpdateEmployeeDto, requester: JwtPayload) {
    const existing = await this.assertEmployee(companyId, id)
    await this.guardOrgScope(requester, existing)
    this.guardUpdatePermission(requester, id, dto, existing.accessLevel)

    // 본인 수정(이름/전화번호)은 권한 설정의 영향을 받지 않는다
    if (requester.employeeId !== id) {
      await this.guardOrgAdminManagePermission(requester)
    }

    const { organizationIds, primaryOrganizationId, positionIds, joinedAt, resignedAt, ...rest } = dto

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const employee = await tx.employee.update({
        where: { id },
        data: {
          ...rest,
          // date-only 문자열(YYYY-MM-DD)은 Prisma에 그대로 넘기면 실패하므로 Date로 변환
          ...(joinedAt !== undefined && { joinedAt: new Date(joinedAt) }),
          ...(resignedAt !== undefined && {
            resignedAt: resignedAt === null ? null : new Date(resignedAt),
          }),
        },
      })

      // 이름/전화번호 변경 시 연결된 User 계정 정보도 동기화 (프로필 일관성)
      if (existing.userId && (rest.name !== undefined || rest.phone !== undefined)) {
        await tx.user.update({
          where: { id: existing.userId },
          data: {
            ...(rest.name !== undefined && { name: rest.name }),
            ...(rest.phone !== undefined && { phone: rest.phone }),
          },
        })
      }

      if (organizationIds) {
        await this.validateOrganizationsBelongToCompany(companyId, organizationIds)
        await tx.employeeOrganization.deleteMany({ where: { employeeId: id } })
        await tx.employeeOrganization.createMany({
          data: organizationIds.map((orgId) => ({
            employeeId: id,
            organizationId: orgId,
            isPrimary: orgId === (primaryOrganizationId ?? organizationIds[0]),
          })),
        })
      }

      if (positionIds !== undefined) {
        await tx.employeePosition.deleteMany({ where: { employeeId: id } })
        if (positionIds.length > 0) {
          await tx.employeePosition.createMany({
            data: positionIds.map((positionId) => ({ employeeId: id, positionId })),
          })
        }
      }

      return employee
    })
  }

  // ── 퇴사 처리 ───────────────────────────────────────────────────────────────

  async deactivate(
    companyId: string,
    id: string,
    resignedAt: string | undefined,
    requester: JwtPayload,
  ) {
    const existing = await this.assertEmployee(companyId, id)
    await this.guardOrgScope(requester, existing)
    await this.guardOrgAdminManagePermission(requester)

    if (!existing.isActive) {
      throw new BadRequestException({
        code: 'EMPLOYEE_ALREADY_DEACTIVATED',
        message: '이미 퇴사 처리된 직원입니다.',
      })
    }

    // 미결 결재가 있는 직원은 퇴사 처리 전 결재를 먼저 위임/처리해야 한다 (결재 정합성)
    const pendingApprovals = await this.prisma.approvalStep.count({
      where: { assigneeId: id, status: { in: ['PENDING', 'WAITING'] } },
    })
    if (pendingApprovals > 0) {
      throw new ForbiddenException({
        code: 'EMPLOYEE_HAS_PENDING_APPROVALS',
        message: '미결 결재가 있어 퇴사 처리할 수 없습니다. 결재를 먼저 위임/처리하세요.',
      })
    }

    // isActive=false 설정과 조직 결재자 해제를 하나의 트랜잭션으로 묶는다 (원자성)
    const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 비활성 직원이 조직 결재자로 남지 않도록 approverId를 해제한다
      await tx.organization.updateMany({
        where: { approverId: id, companyId },
        data: { approverId: null },
      })

      return tx.employee.update({
        where: { id },
        data: {
          isActive: false,
          resignedAt: resignedAt ? new Date(resignedAt) : new Date(),
        },
      })
    })

    await this.audit.record({
      companyId,
      actorId: requester.employeeId,
      action: 'EMPLOYEE_DEACTIVATE',
      targetType: 'EMPLOYEE',
      targetId: id,
      targetLabel: existing.name,
    })

    return result
  }

  // ── 재활성화 ────────────────────────────────────────────────────────────────

  async activate(companyId: string, id: string, requester: JwtPayload) {
    const existing = await this.assertEmployee(companyId, id)
    await this.guardOrgScope(requester, existing)
    await this.guardOrgAdminManagePermission(requester)

    if (existing.isActive) {
      throw new BadRequestException({
        code: 'EMPLOYEE_ALREADY_ACTIVE',
        message: '이미 재직 중인 직원입니다.',
      })
    }

    return this.prisma.employee.update({
      where: { id },
      data: {
        isActive: true,
        resignedAt: null,
      },
    })
  }

  // ── 완전 삭제 (hard delete) ──────────────────────────────────────────────────

  /**
   * 직원 완전 삭제 — 출퇴근·근무일정·휴가·결재 등 이력성 참조가 없을 때만 허용한다.
   * (오등록 정리 용도) 이력이 있으면 차단하고 비활성화(퇴사)를 안내한다.
   * 부속 관계(조직·직위·커스텀필드·휴가잔액·근로정보)는 함께 정리한다.
   */
  async remove(companyId: string, id: string, requester: JwtPayload, force = false) {
    const existing = await this.assertEmployee(companyId, id)
    await this.guardOrgScope(requester, existing)

    if (force) {
      // 이력까지 모두 삭제 (강제). 트랜잭션이므로 중간 실패 시 전체 롤백되어 데이터가 손상되지 않는다.
      await this.forceRemoveCascade(companyId, id, requester.employeeId)
    } else {
      // 이력성 참조 검사 — 하나라도 있으면 완전 삭제 불가
      const [att, shift, leave, req, doc, step, hist] = await Promise.all([
        this.prisma.attendance.count({ where: { OR: [{ employeeId: id }, { confirmedBy: id }] } }),
        this.prisma.shift.count({
          where: { OR: [{ employeeId: id }, { confirmedBy: id }, { createdBy: id }] },
        }),
        this.prisma.leave.count({ where: { employeeId: id } }),
        this.prisma.request.count({ where: { requesterId: id } }),
        this.prisma.document.count({ where: { drafterId: id } }),
        this.prisma.approvalStep.count({ where: { OR: [{ assigneeId: id }, { proxyId: id }] } }),
        this.prisma.approvalHistory.count({ where: { actorId: id } }),
      ])
      if (att + shift + leave + req + doc + step + hist > 0) {
        throw new ForbiddenException({
          code: 'EMPLOYEE_HAS_REFERENCES',
          message:
            '출퇴근·근무일정·휴가·결재 이력이 있어 완전 삭제할 수 없습니다. 이력까지 삭제하려면 "이력 포함" 옵션을 사용하거나 비활성화(퇴사)를 사용하세요.',
        })
      }

      try {
        await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          await tx.organization.updateMany({ where: { approverId: id, companyId }, data: { approverId: null } })
          await tx.organization.updateMany({ where: { docManagerId: id, companyId }, data: { docManagerId: null } })
          await tx.employeeOrganization.deleteMany({ where: { employeeId: id } })
          await tx.employeePosition.deleteMany({ where: { employeeId: id } })
          await tx.employeeCustomFieldValue.deleteMany({ where: { employeeId: id } })
          await tx.leaveBalance.deleteMany({ where: { employeeId: id } })
          await tx.wageInfo.deleteMany({ where: { employeeId: id } })
          await tx.employee.delete({ where: { id } })
        })
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
          throw new ForbiddenException({
            code: 'EMPLOYEE_HAS_REFERENCES',
            message: '연관 데이터가 있어 완전 삭제할 수 없습니다. 비활성화(퇴사)를 사용하세요.',
          })
        }
        throw e
      }
    }

    await this.audit.record({
      companyId,
      actorId: requester.employeeId,
      action: force ? 'EMPLOYEE_FORCE_DELETE' : 'EMPLOYEE_DELETE',
      targetType: 'EMPLOYEE',
      targetId: id,
      targetLabel: existing.name,
    })
  }

  /**
   * 직원 + 모든 관련 이력 강제 삭제 (force).
   * 단일 트랜잭션이라 중간에 실패하면 전체 롤백되어 데이터가 손상되지 않는다.
   * - 본인 소유 데이터(출퇴근·근무일정·휴가·요청·기안문서 등): 삭제
   * - 타 대상의 "행위자" 참조(확정자·작성자·업로더 등): null 처리 또는 삭제 실행자로 재할당
   */
  private async forceRemoveCascade(companyId: string, id: string, actorEmployeeId: string) {
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 1) 행위자 참조 정리 (nullable → null, not-null → 삭제 실행자로 재할당하여 타 데이터 보존)
      await tx.organization.updateMany({ where: { approverId: id, companyId }, data: { approverId: null } })
      await tx.organization.updateMany({ where: { docManagerId: id, companyId }, data: { docManagerId: null } })
      await tx.attendance.updateMany({ where: { confirmedBy: id }, data: { confirmedBy: null } })
      await tx.shift.updateMany({ where: { confirmedBy: id }, data: { confirmedBy: null } })
      await tx.shift.updateMany({ where: { createdBy: id }, data: { createdBy: actorEmployeeId } })
      await tx.reportSnapshot.updateMany({ where: { lockedBy: id }, data: { lockedBy: null } })
      await tx.message.updateMany({ where: { senderId: id }, data: { senderId: null } })
      await tx.documentAttachment.updateMany({ where: { uploaderId: id }, data: { uploaderId: actorEmployeeId } })
      await tx.approvalStep.updateMany({ where: { proxyId: id }, data: { proxyId: null } })

      // 2) 대리 설정·요청 승인자 (not-null Restrict) 삭제
      await tx.proxySettings.deleteMany({ where: { OR: [{ principalId: id }, { proxyId: id }] } })
      await tx.requestApproval.deleteMany({ where: { approverId: id } })

      // 3) 기안 문서 삭제 (ApprovalHistory는 documentId Restrict라 먼저, 나머지는 Cascade)
      const docs = await tx.document.findMany({ where: { drafterId: id }, select: { id: true } })
      const docIds = docs.map((d) => d.id)
      if (docIds.length > 0) {
        await tx.approvalHistory.deleteMany({ where: { documentId: { in: docIds } } })
        await tx.document.deleteMany({ where: { id: { in: docIds } } })
      }

      // 4) 이 직원이 결재자/이력 행위자인 잔여(타 문서) 정리
      await tx.approvalHistory.deleteMany({ where: { actorId: id } })
      const steps = await tx.approvalStep.findMany({ where: { assigneeId: id }, select: { id: true } })
      const stepIds = steps.map((s) => s.id)
      if (stepIds.length > 0) {
        await tx.approvalHistory.deleteMany({ where: { stepId: { in: stepIds } } })
        await tx.approvalStep.deleteMany({ where: { assigneeId: id } })
      }

      // 5) 본인 요청과 그에 연결된 문서
      const reqs = await tx.request.findMany({ where: { requesterId: id }, select: { id: true } })
      const reqIds = reqs.map((r) => r.id)
      if (reqIds.length > 0) {
        const reqDocs = await tx.document.findMany({
          where: { requestId: { in: reqIds } },
          select: { id: true },
        })
        const reqDocIds = reqDocs.map((d) => d.id)
        if (reqDocIds.length > 0) {
          await tx.approvalHistory.deleteMany({ where: { documentId: { in: reqDocIds } } })
          await tx.document.deleteMany({ where: { id: { in: reqDocIds } } })
        }
        await tx.request.deleteMany({ where: { requesterId: id } })
      }

      // 6) 본인 소유 데이터
      await tx.leave.deleteMany({ where: { employeeId: id } })
      await tx.leaveBalance.deleteMany({ where: { employeeId: id } })
      await tx.attendance.deleteMany({ where: { employeeId: id } })
      await tx.shift.deleteMany({ where: { employeeId: id } })
      await tx.wageInfo.deleteMany({ where: { employeeId: id } })
      await tx.employeeCustomFieldValue.deleteMany({ where: { employeeId: id } })
      await tx.employeeOrganization.deleteMany({ where: { employeeId: id } })
      await tx.employeePosition.deleteMany({ where: { employeeId: id } })
      // messengerAccount·organizationDocManager는 Cascade로 자동 삭제
      await tx.employee.delete({ where: { id } })
    })
  }

  // ── 기기 초기화 ─────────────────────────────────────────────────────────────

  async resetDevice(companyId: string, id: string, requester: JwtPayload) {
    const existing = await this.assertEmployee(companyId, id)
    await this.guardOrgScope(requester, existing)

    return this.prisma.employee.update({
      where: { id },
      data: { deviceId: null, deviceBoundAt: null },
    })
  }

  // ── 비밀번호 재설정 (관리자가 직원 로그인 자격 발급/초기화) ──────────────────

  /**
   * 관리자가 직원의 로그인 비밀번호를 설정/재설정한다.
   * 연결된 User 계정을 활성화하여 즉시 로그인 가능하게 한다.
   * 권한: GENERAL_ADMIN 이상은 무조건, ORG_ADMIN은 조직 스코프 + 관리 권한 설정이 켜진 경우.
   */
  async resetPassword(companyId: string, id: string, newPassword: string, requester: JwtPayload) {
    const existing = await this.assertEmployee(companyId, id)
    await this.guardOrgScope(requester, existing)
    await this.guardOrgAdminManagePermission(requester)

    if (!existing.userId) {
      throw new BadRequestException({
        code: 'EMPLOYEE_USER_NOT_FOUND',
        message: '로그인 계정이 연결되지 않은 직원입니다.',
      })
    }

    const passwordHash = await bcrypt.hash(newPassword, 10)
    await this.prisma.user.update({
      where: { id: existing.userId },
      data: { passwordHash, isActive: true },
    })

    return { success: true }
  }

  // ── 근로정보 이력 ───────────────────────────────────────────────────────────

  async findWageInfos(companyId: string, employeeId: string, requester: JwtPayload) {
    const existing = await this.assertEmployee(companyId, employeeId)
    await this.guardOrgScope(requester, existing)

    return this.prisma.wageInfo.findMany({
      where: { employeeId },
      orderBy: { effectiveFrom: 'desc' },
    })
  }

  // ── 근로정보 등록 ───────────────────────────────────────────────────────────

  async createWageInfo(
    companyId: string,
    employeeId: string,
    dto: CreateWageInfoDto,
    requester: JwtPayload,
  ) {
    const existing = await this.assertEmployee(companyId, employeeId)
    await this.guardOrgScope(requester, existing)

    return this.prisma.wageInfo.create({
      data: {
        employeeId,
        hourlyWage: dto.hourlyWage,
        contractedWorkDays: dto.contractedWorkDays,
        contractedHoursPerWeek: dto.contractedHoursPerWeek,
        weeklyPaidHolidayDay: dto.weeklyPaidHolidayDay ?? null,
        maxHoursPerWeek: dto.maxHoursPerWeek ?? 52,
        effectiveFrom: new Date(dto.effectiveFrom),
      },
    })
  }

  // ── 근로정보 수정/삭제 ──────────────────────────────────────────────────────

  private async assertWageInfo(employeeId: string, wageId: string) {
    const wage = await this.prisma.wageInfo.findFirst({ where: { id: wageId, employeeId } })
    if (!wage) {
      throw new NotFoundException({
        code: 'WAGE_INFO_NOT_FOUND',
        message: '근로정보를 찾을 수 없습니다.',
      })
    }
    return wage
  }

  async updateWageInfo(
    companyId: string,
    employeeId: string,
    wageId: string,
    dto: CreateWageInfoDto,
    requester: JwtPayload,
  ) {
    const existing = await this.assertEmployee(companyId, employeeId)
    await this.guardOrgScope(requester, existing)
    await this.assertWageInfo(employeeId, wageId)

    return this.prisma.wageInfo.update({
      where: { id: wageId },
      data: {
        hourlyWage: dto.hourlyWage,
        contractedWorkDays: dto.contractedWorkDays,
        contractedHoursPerWeek: dto.contractedHoursPerWeek,
        weeklyPaidHolidayDay: dto.weeklyPaidHolidayDay ?? null,
        maxHoursPerWeek: dto.maxHoursPerWeek ?? 52,
        effectiveFrom: new Date(dto.effectiveFrom),
      },
    })
  }

  async deleteWageInfo(
    companyId: string,
    employeeId: string,
    wageId: string,
    requester: JwtPayload,
  ) {
    const existing = await this.assertEmployee(companyId, employeeId)
    await this.guardOrgScope(requester, existing)
    await this.assertWageInfo(employeeId, wageId)

    await this.prisma.wageInfo.delete({ where: { id: wageId } })
    return { success: true }
  }

  // ── 내부 헬퍼 ───────────────────────────────────────────────────────────────

  /**
   * 직원 수정 권한 검증 (보안):
   * - 본인: 이름/전화번호만 수정 가능
   * - 타인: ORG_ADMIN 이상만 수정 가능
   * - accessLevel 변경: GENERAL_ADMIN 이상 + 본인 권한 변경 금지 + 자신과 같거나 높은 권한 부여 금지
   */
  private guardUpdatePermission(
    requester: JwtPayload,
    targetId: string,
    dto: UpdateEmployeeDto,
    currentAccessLevel?: string,
  ) {
    const requesterLevel = ACCESS_LEVEL_HIERARCHY[requester.accessLevel]
    const isSelf = requester.employeeId === targetId

    if (isSelf) {
      // 본인 권한(accessLevel)을 현재와 다른 값으로 바꾸려는 시도는 권한 셀프 상승 위험 — 항상 금지
      if (dto.accessLevel !== undefined && dto.accessLevel !== currentAccessLevel) {
        throw new ForbiddenException({
          code: 'EMPLOYEE_SELF_LEVEL_FORBIDDEN',
          message: '본인의 권한(액세스 레벨)은 변경할 수 없습니다.',
        })
      }
      // 관리자(ORG_ADMIN 이상)는 본인의 관리 정보(조직·직위·고용형태 등)도 수정 가능.
      // 일반 직원은 셀프서비스로 이름/전화번호만 수정 가능.
      if (requesterLevel < ACCESS_LEVEL_HIERARCHY[AccessLevel.ORG_ADMIN]) {
        const SELF_EDITABLE_FIELDS = new Set(['name', 'phone'])
        const forbidden = Object.entries(dto)
          .filter(([key, value]) => value !== undefined && !SELF_EDITABLE_FIELDS.has(key))
          .map(([key]) => key)
        if (forbidden.length > 0) {
          throw new ForbiddenException({
            code: 'EMPLOYEE_SELF_UPDATE_FORBIDDEN',
            message: `본인은 이름/전화번호만 수정할 수 있습니다. (불가 필드: ${forbidden.join(', ')})`,
          })
        }
      }
      return
    }

    if (requesterLevel < ACCESS_LEVEL_HIERARCHY[AccessLevel.ORG_ADMIN]) {
      throw new ForbiddenException({
        code: 'EMPLOYEE_UPDATE_FORBIDDEN',
        message: '직원 정보 수정 권한이 없습니다.',
      })
    }

    if (dto.accessLevel !== undefined) {
      if (requesterLevel < ACCESS_LEVEL_HIERARCHY[AccessLevel.GENERAL_ADMIN]) {
        throw new ForbiddenException({
          code: 'EMPLOYEE_ACCESS_LEVEL_FORBIDDEN',
          message: '권한 변경은 GENERAL_ADMIN 이상만 가능합니다.',
        })
      }
      if (ACCESS_LEVEL_HIERARCHY[dto.accessLevel] >= requesterLevel) {
        throw new ForbiddenException({
          code: 'EMPLOYEE_ACCESS_LEVEL_ESCALATION',
          message: '자신과 같거나 높은 권한은 부여할 수 없습니다.',
        })
      }
    }
  }

  /**
   * 권한 설정(permission.org_admin_can_manage_employees, 기본 true)이 꺼져 있으면
   * ORG_ADMIN의 직원 추가/수정/퇴사 처리를 차단한다.
   */
  private async guardOrgAdminManagePermission(requester: JwtPayload) {
    if (requester.accessLevel !== AccessLevel.ORG_ADMIN) return

    const canManage = await this.settingsService.get<boolean>(
      requester.companyId,
      'permission',
      'org_admin_can_manage_employees',
      true,
    )

    if (canManage === false) {
      throw new ForbiddenException({
        code: 'EMPLOYEE_MANAGE_PERMISSION_DENIED',
        message: '조직관리자의 직원 관리 권한이 비활성화되어 있습니다.',
      })
    }
  }

  private async assertEmployee(companyId: string, id: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, companyId },
      include: {
        organizations: { select: { organizationId: true } },
      },
    })
    if (!employee) {
      throw new NotFoundException({
        code: 'EMPLOYEE_NOT_FOUND',
        message: '직원을 찾을 수 없습니다.',
      })
    }
    return employee
  }

  /**
   * SUPER_ADMIN / GENERAL_ADMIN은 전체 접근 허용.
   * ORG_ADMIN은 자신의 조직에 속한 직원만 접근 가능하다.
   * EMPLOYEE는 본인 레코드만 접근 가능하다(동료 PII/임금 열람 차단).
   */
  async guardOrgScope(
    requester: JwtPayload,
    employee: { id: string; organizations: { organizationId: string }[] },
  ) {
    if (
      requester.accessLevel === AccessLevel.SUPER_ADMIN ||
      requester.accessLevel === AccessLevel.GENERAL_ADMIN
    ) {
      return
    }

    if (requester.accessLevel === AccessLevel.EMPLOYEE) {
      if (requester.employeeId !== employee.id) {
        throw new ForbiddenException('해당 직원에 대한 접근 권한이 없습니다.')
      }
      return
    }

    const requesterOrgs = await this.prisma.employeeOrganization.findMany({
      where: { employeeId: requester.employeeId },
      select: { organizationId: true },
    })

    const requesterOrgIds = new Set(
      requesterOrgs.map((o: { organizationId: string }) => o.organizationId),
    )
    const targetOrgIds = employee.organizations.map((o) => o.organizationId)

    const hasOverlap = targetOrgIds.some((orgId) => requesterOrgIds.has(orgId))
    if (!hasOverlap) {
      throw new ForbiddenException('해당 직원에 대한 접근 권한이 없습니다.')
    }
  }

  /**
   * ORG_ADMIN의 경우 소속 조직 ID 목록 반환, 그 외 null 반환.
   */
  private async resolveOrgScope(requester: JwtPayload): Promise<string[] | null> {
    if (
      requester.accessLevel === AccessLevel.SUPER_ADMIN ||
      requester.accessLevel === AccessLevel.GENERAL_ADMIN
    ) {
      return null
    }

    const orgs = await this.prisma.employeeOrganization.findMany({
      where: { employeeId: requester.employeeId },
      select: { organizationId: true },
    })

    return orgs.map((o: { organizationId: string }) => o.organizationId)
  }

  private async validateOrganizationsBelongToCompany(companyId: string, orgIds: string[]) {
    const count = await this.prisma.organization.count({
      where: { id: { in: orgIds }, companyId },
    })
    if (count !== orgIds.length) {
      throw new BadRequestException({
        code: 'INVALID_ORGANIZATION',
        message: '유효하지 않은 조직이 포함되어 있습니다.',
      })
    }
  }
}
