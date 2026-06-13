import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateCompanyHolidayDto } from './dto/create-company-holiday.dto'

@Injectable()
export class CompanyHolidaysService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string) {
    return this.prisma.companyHoliday.findMany({
      where: { companyId },
      orderBy: { holidayDate: 'asc' },
    })
  }

  async create(companyId: string, dto: CreateCompanyHolidayDto) {
    const holidayDate = new Date(dto.holidayDate)

    const duplicate = await this.prisma.companyHoliday.findFirst({
      where: { companyId, holidayDate },
    })
    if (duplicate) {
      throw new BadRequestException({
        code: 'COMPANY_HOLIDAY_ALREADY_EXISTS',
        message: '해당 날짜에 이미 지정된 휴일이 있습니다.',
      })
    }

    return this.prisma.companyHoliday.create({
      data: {
        companyId,
        name: dto.name,
        holidayDate,
        isAnnualRepeat: dto.isAnnualRepeat ?? false,
        type: dto.type ?? 'custom',
      },
    })
  }

  async remove(companyId: string, id: string) {
    const holiday = await this.prisma.companyHoliday.findFirst({
      where: { id, companyId },
    })
    if (!holiday) {
      throw new NotFoundException({
        code: 'COMPANY_HOLIDAY_NOT_FOUND',
        message: '휴일을 찾을 수 없습니다.',
      })
    }

    // 멀티테넌시 방어: delete의 where는 unique 필드(id)만 허용하므로
    // companyId 조건을 강제하려면 deleteMany를 사용한다.
    await this.prisma.companyHoliday.deleteMany({ where: { id, companyId } })
    return { deleted: true }
  }
}
