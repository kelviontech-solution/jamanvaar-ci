import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { PlatformUser } from '@prisma/client';
import { Request } from 'express';

/** Only valid on a route guarded by PlatformAuthGuard, which attaches this. */
export const CurrentPlatformUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PlatformUser => {
    const request = ctx.switchToHttp().getRequest<Request & { platformUser: PlatformUser }>();
    return request.platformUser;
  }
);
