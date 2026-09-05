import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PlatformUserStatus } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import {
  PLATFORM_JWT_AUDIENCE,
  PLATFORM_JWT_ISSUER,
  PlatformAccessTokenPayload
} from '../../modules/platform-auth/platform-auth.service';

/**
 * Rejects: no token, a malformed token, an expired token, and — critically —
 * any token that isn't signed with issuer/audience `jamanvaar-platform`. A
 * token minted for a future TenantAuthModule (issuer `jamanvaar-tenant`)
 * fails signature verification here even if it were signed with the exact
 * same secret, because `verify()` is called with `issuer`/`audience`
 * constraints — see platform-auth.e2e.spec.ts for a token-forgery test that
 * proves this, not just asserts it.
 */
@Injectable()
export class PlatformAuthGuard implements CanActivate {
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

    let payload: PlatformAccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<PlatformAccessTokenPayload>(token, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        issuer: PLATFORM_JWT_ISSUER,
        audience: PLATFORM_JWT_AUDIENCE
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const user = await this.prisma.platformUser.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== PlatformUserStatus.ACTIVE) {
      throw new UnauthorizedException('Invalid token');
    }

    (request as Request & { platformUser: typeof user }).platformUser = user;
    return true;
  }

  private extractBearerToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) return null;
    return header.slice('Bearer '.length).trim() || null;
  }
}
