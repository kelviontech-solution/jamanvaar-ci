import { ArgumentMetadata, BadRequestException, PipeTransform } from '@nestjs/common';
import { ZodSchema } from 'zod';

/**
 * DTO validation via zod — matches the convention already established in
 * packages/validation/src/schemas.ts, rather than introducing class-validator
 * as a second validation library for the same job.
 *
 * `@UsePipes()` at the method level runs a pipe against EVERY parameter of
 * the handler, not just `@Body()` — including custom param decorators like
 * `@CurrentPlatformUser()`. Without the `metadata.type === 'body'` guard
 * below, this pipe would also try to validate the platform-user object
 * against the body schema and reject the request with unrelated "field is
 * Required" errors.
 */
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown, metadata: ArgumentMetadata) {
    if (metadata.type !== 'body') {
      return value;
    }
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
      });
    }
    return result.data;
  }
}
