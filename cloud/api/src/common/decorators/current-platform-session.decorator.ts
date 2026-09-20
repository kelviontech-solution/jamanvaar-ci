import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

/** The id of the login session behind this request. Only valid on a route guarded by PlatformAuthGuard. */
export const CurrentPlatformSession = createParamDecorator((_data: unknown, ctx: ExecutionContext): string | undefined => {
  return ctx.switchToHttp().getRequest<Request & { platformSessionId?: string }>().platformSessionId;
});
