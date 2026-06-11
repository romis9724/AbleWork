import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common'
import { ZodSchema } from 'zod'

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value)
    if (!result.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: '입력값이 올바르지 않습니다.',
        details: result.error.flatten(),
      })
    }
    return result.data
  }
}
