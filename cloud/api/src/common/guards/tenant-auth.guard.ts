import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { TenantUserStatus } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { assertSessionStillAllowed } from '../security/session-state';
import { enabledConsoleApps, requiredConsoleApps } from '../security/admin-product-access';
import {
  TENANT_JWT_AUDIENCE,
  TENANT_JWT_ISSUER,
  TenantAccessTokenPayload
} from '../../modules/tenant-auth/tenant-auth.service';

/**
 * Mirrors PlatformAuthGuard exactly, scoped to the tenant (`User`) identity
 * instead of `PlatformUser`. issuer/audience `jamanvaar-tenant` means a
 * forged or reused platform token is rejected here even with the same
 * secret — see platform-auth.e2e.spec.ts, which already proves the reverse
 * direction (a `jamanvaar-tenant` token is rejected by PlatformAuthGuard).
 */
@Injectable()
export class TenantAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    let payload: TenantAccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<TenantAccessTokenPayload>(token, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        issuer: TENANT_JWT_ISSUER,
        audience: TENANT_JWT_AUDIENCE
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const user = await this.prisma.runAsTenant(payload.restaurantId, (tx) =>
      tx.user.findUnique({ where: { id: payload.sub } })
    );
    if (!user || user.status !== TenantUserStatus.ACTIVE || user.restaurantId !== payload.restaurantId) {
      throw new UnauthorizedException('Invalid token');
    }

    // Impersonation tokens are support's window into a restaurant for debugging (even a
    // suspended one), so they skip the restaurant/device state check; everything else must pass it.
    if (!payload.impersonatedBy) {
      const path = ((request as Request).originalUrl ?? '').split('?')[0];
      await assertSessionStillAllowed(this.prisma, payload.restaurantId, payload.did, { allowSuspended: path.startsWith('/api/v1/tenant/billing') });
    }

    const resourceApps = requiredConsoleApps(request.originalUrl ?? request.url ?? '');
    if (resourceApps.length === 1) {
      const apps = await this.prisma.runAsTenant(user.restaurantId, tx => enabledConsoleApps(tx, user.restaurantId));
      if (!resourceApps.some(app => apps.includes(app))) throw new ForbiddenException({ statusCode: 403, code: 'PRODUCT_ACCESS_DENIED', message: 'Your subscription does not enable this application resource.' });
    }
    (request as Request & { tenantUser: typeof user }).tenantUser = user;
    (request as Request & { tenantDeviceId?: string }).tenantDeviceId = payload.did;
    return true;
  }

  private extractBearerToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) return null;
    return header.slice('Bearer '.length).trim() || null;
  }
}
