import {
  ArgumentMetadata,
  BadRequestException,
  Logger,
  PipeTransform,
} from '@nestjs/common';
import { plainToClass } from 'class-transformer';
import { validate } from 'class-validator';

export class MarketplaceValidationPipe implements PipeTransform<any> {
  private logger = new Logger(MarketplaceValidationPipe.name);

  async transform(value: any, metadata: ArgumentMetadata): Promise<any> {
    if (!metadata.metatype || !this.toValidate(metadata.metatype)) {
      return value;
    }

    const object = plainToClass(metadata.metatype, value);
    const errors = await validate(object, {
      validationError: {
        target: false,
      },
      whitelist: true,
      forbidNonWhitelisted: true, // explicitly returning an error
    });

    if (errors.length > 0) {
      const error = new BadRequestException({
        error: 'ValidationFailed',
        message: 'Validation failed',
        errors,
      });
      this.logger.error(error);
      throw error;
    }

    return value;
  }

  toValidate(metatype: Function) {
    const types: Function[] = [String, Boolean, Number, Array, Object];

    return !types.includes(metatype);
  }
}
