import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common'
import * as bcrypt from 'bcryptjs'
import { PrismaService } from '../../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { CreateCompanyDto } from './dto/create-company.dto'
import { UpdateCompanyDto } from './dto/update-company.dto'
import { JoinCompanyDto } from './dto/join-company.dto'
import { AddCompanyDto } from './dto/add-company.dto'
import { AccessLevel } from '@ablework/shared-constants'

const INVITE_CODE_SECTION = 'invite'
const INVITE_CODE_KEY = 'code'

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * 신규 그룹 부트스트랩 (최초 가입, 공개).
   * 그룹 → 회사 → User → Employee(SUPER_ADMIN)를 한 트랜잭션으로 생성한다.
   * 신규 user 전제이므로 이메일 중복 시 에러.
   */
  async create(dto: CreateCompanyDto) {
    const { adminEmail, adminPassword, adminName, ...companyData } = dto

    const existingUser = await this.prisma.user.findUnique({ where: { email: adminEmail } })
    if (existingUser) {
      throw new BadRequestException({
        code: 'COMPANY_EMAIL_ALREADY_EXISTS',
        message: '이미 사용 중인 이메일입니다.',
      })
    }

    const passwordHash = await bcrypt.hash(adminPassword, 10)

    return this.prisma.$transaction(async (tx) => {
      const group = await tx.group.create({ data: { name: companyData.name } })

      const company = await tx.company.create({
        data: { ...companyData, groupId: group.id },
      })

      const user = await tx.user.create({
        data: {
          email: adminEmail,
          passwordHash,
          name: adminName,
          isActive: true,
          lastCompanyId: company.id,
        },
      })

      const employee = await tx.employee.create({
        data: {
          companyId: company.id,
          userId: user.id,
          name: adminName,
          accessLevel: AccessLevel.SUPER_ADMIN,
          employmentType: 'regular',
          joinedAt: new Date(),
          isActive: true,
        },
      })

      return { company, user: { id: user.id, email: user.email }, employee }
    })
  }

  /**
   * 같은 그룹에 새 회사 추가 (로그인한 SUPER_ADMIN).
   * 현재 활성 회사의 그룹에 새 회사를 만들고, 현재 사용자를 새 회사 SUPER_ADMIN으로 등록한다.
   */
  async addCompany(currentCompanyId: string, userId: string, dto: AddCompanyDto) {
    const current = await this.prisma.company.findFirst({
      where: { id: currentCompanyId, isActive: true },
      select: { groupId: true },
    })
    if (!current) {
      throw new NotFoundException({
        code: 'COMPANY_NOT_FOUND',
        message: '회사를 찾을 수 없습니다.',
      })
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    })
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: '사용자를 찾을 수 없습니다.',
      })
    }

    return this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: { ...dto, groupId: current.groupId },
      })

      const employee = await tx.employee.create({
        data: {
          companyId: company.id,
          userId,
          name: user.name,
          accessLevel: AccessLevel.SUPER_ADMIN,
          employmentType: 'regular',
          joinedAt: new Date(),
          isActive: true,
        },
      })

      return { company, employee }
    })
  }

  async findById(id: string, companyId: string) {
    const company = await this.prisma.company.findFirst({
      where: { id, isActive: true },
    })

    if (!company) {
      throw new NotFoundException({
        code: 'COMPANY_NOT_FOUND',
        message: '회사를 찾을 수 없습니다.',
      })
    }

    if (company.id !== companyId) {
      throw new ForbiddenException({
        code: 'COMPANY_FORBIDDEN',
        message: '접근 권한이 없습니다.',
      })
    }

    return company
  }

  async update(id: string, companyId: string, dto: UpdateCompanyDto, actorId?: string) {
    await this.findById(id, companyId)

    const updated = await this.prisma.company.update({
      where: { id },
      data: dto,
    })

    // 감사 로그 (회사 설정/정보 변경)
    try {
      await this.audit.record({
        companyId,
        actorId,
        action: 'SETTINGS_UPDATE',
        targetType: 'COMPANY',
        targetId: id,
        targetLabel: updated.name,
        result: 'SUCCESS',
        detail: { changedKeys: Object.keys(dto) },
      })
    } catch {
      // 감사 로그 실패가 본 동작을 막지 않도록 무시
    }

    return updated
  }

  async generateInviteCode(companyId: string): Promise<{ inviteCode: string }> {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, isActive: true },
    })
    if (!company) {
      throw new NotFoundException({
        code: 'COMPANY_NOT_FOUND',
        message: '회사를 찾을 수 없습니다.',
      })
    }

    const code = this.generateRandomCode(6)

    await this.prisma.companySetting.upsert({
      where: {
        companyId_section_key: {
          companyId,
          section: INVITE_CODE_SECTION,
          key: INVITE_CODE_KEY,
        },
      },
      update: { value: code },
      create: {
        companyId,
        section: INVITE_CODE_SECTION,
        key: INVITE_CODE_KEY,
        value: code,
      },
    })

    return { inviteCode: code }
  }

  /**
   * 합류코드로 다른 회사에 합류 (로그인한 사용자, 멀티컴퍼니 멤버십 추가).
   * 현재 사용자를 합류코드 대상 회사의 EMPLOYEE로 등록한다. 이미 멤버면 차단.
   */
  async joinByInviteCode(userId: string, dto: JoinCompanyDto) {
    const { inviteCode } = dto

    const setting = await this.prisma.companySetting.findFirst({
      where: {
        section: INVITE_CODE_SECTION,
        key: INVITE_CODE_KEY,
        value: { equals: inviteCode },
      },
    })

    if (!setting) {
      throw new BadRequestException({
        code: 'COMPANY_INVALID_INVITE_CODE',
        message: '유효하지 않은 합류코드입니다.',
      })
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    })
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: '사용자를 찾을 수 없습니다.',
      })
    }

    const existingMembership = await this.prisma.employee.findFirst({
      where: { companyId: setting.companyId, userId },
      select: { id: true },
    })
    if (existingMembership) {
      throw new BadRequestException({
        code: 'COMPANY_ALREADY_MEMBER',
        message: '이미 해당 회사에 소속되어 있습니다.',
      })
    }

    const employee = await this.prisma.employee.create({
      data: {
        companyId: setting.companyId,
        userId,
        name: user.name,
        accessLevel: AccessLevel.EMPLOYEE,
        employmentType: 'regular',
        joinedAt: new Date(),
        isActive: true,
      },
    })

    return { employee }
  }

  private generateRandomCode(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  }
}
