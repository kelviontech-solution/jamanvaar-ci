import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User } from '@prisma/client';
import { Request } from 'express';

/** Only valid on a route guarded by TenantAuthGuard, which attaches this. */
export const CurrentTenantUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User => {
    const request = ctx.switchToHttp().getRequest<Request & { tenantUser: User }>();
    return request.tenantUser;
  }
);
