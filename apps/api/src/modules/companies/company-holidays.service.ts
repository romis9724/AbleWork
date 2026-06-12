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

    await this.prisma.companyHoliday.delete({ where: { id } })
    return { deleted: true }
  }
}
