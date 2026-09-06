import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Device } from '@prisma/client';
import { Request } from 'express';

/** Only valid on a route guarded by DeviceAuthGuard, which attaches this. */
export const CurrentDevice = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Device => {
    const request = ctx.switchToHttp().getRequest<Request & { device: Device }>();
    return request.device;
  }
);
