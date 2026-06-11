import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common'
import * as bcrypt from 'bcryptjs'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateCompanyDto } from './dto/create-company.dto'
import { UpdateCompanyDto } from './dto/update-company.dto'
import { JoinCompanyDto } from './dto/join-company.dto'
import { AccessLevel } from '@ablework/shared-constants'

const INVITE_CODE_SECTION = 'invite'
const INVITE_CODE_KEY = 'code'

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

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
      const company = await tx.company.create({ data: companyData })

      const user = await tx.user.create({
        data: {
          email: adminEmail,
          passwordHash,
          name: adminName,
          isActive: true,
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

  async update(id: string, companyId: string, dto: UpdateCompanyDto) {
    await this.findById(id, companyId)

    return this.prisma.company.update({
      where: { id },
      data: dto,
    })
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

  async joinByInviteCode(dto: JoinCompanyDto) {
    const { inviteCode, email, password, name } = dto

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

    const existingUser = await this.prisma.user.findUnique({ where: { email } })
    if (existingUser) {
      throw new BadRequestException({
        code: 'COMPANY_EMAIL_ALREADY_EXISTS',
        message: '이미 사용 중인 이메일입니다.',
      })
    }

    const passwordHash = await bcrypt.hash(password, 10)

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          name,
          isActive: true,
        },
      })

      const employee = await tx.employee.create({
        data: {
          companyId: setting.companyId,
          userId: user.id,
          name,
          accessLevel: AccessLevel.EMPLOYEE,
          employmentType: 'regular',
          joinedAt: new Date(),
          isActive: true,
        },
      })

      return { user: { id: user.id, email: user.email }, employee }
    })
  }

  private generateRandomCode(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  }
}
