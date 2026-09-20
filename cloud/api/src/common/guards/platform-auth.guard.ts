import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PlatformUserStatus } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { areaForPath, canAccess, PlatformRoleName } from '../rbac/access';
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
  private readonly logger = new Logger(PlatformAuthGuard.name);

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

    // A session that was revoked, logged out, or ended by a password change is refused at
    // once - its access token would otherwise stay valid for up to 15 minutes.
    if (payload.sid) {
      const ended = await this.prisma.platformRefreshToken.findFirst({
        where: { sessionId: payload.sid, terminatedAt: { not: null } },
        select: { id: true }
      });
      if (ended) {
        throw new UnauthorizedException({ statusCode: 401, message: 'This session was signed out.', code: 'SESSION_REVOKED' });
      }
    }

    // Authorisation: the token proves who the caller is; the role decides what
    // they may do. Deny by default - every platform endpoint belongs to an
    // area and each role is granted only its areas (see common/rbac/access.ts).
    const area = areaForPath(request.originalUrl ?? request.url ?? '');
    if (!canAccess(user.role as PlatformRoleName, area, request.method)) {
      this.logger.warn(`Denied ${request.method} ${request.originalUrl} for ${user.email} (${user.role}, area ${area ?? 'unmapped'})`);
      throw new ForbiddenException('Your role does not have access to this area');
    }

    (request as Request & { platformUser: typeof user; platformSessionId?: string }).platformUser = user;
    (request as Request & { platformSessionId?: string }).platformSessionId = payload.sid;
    return true;
  }

  private extractBearerToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) return null;
    return header.slice('Bearer '.length).trim() || null;
  }
}
