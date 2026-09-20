import { Controller, Delete, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { PlatformUser } from '@prisma/client';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { CurrentPlatformUser } from '../../common/decorators/current-platform-user.decorator';
import { CurrentPlatformSession } from '../../common/decorators/current-platform-session.decorator';
import { describeDevice } from '../../common/security/user-agent';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PlatformAuthService } from '../platform-auth/platform-auth.service';

/**
 * "Sessions" = this user's logins. A login renews its refresh token every ~15 minutes,
 * so the live (not rotated, not ended, not expired) token row per login IS the session:
 * one row per login, identified by its stable sessionId.
 */
@Controller('api/v1/platform/sessions')
@UseGuards(PlatformAuthGuard)
export class SessionsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: PlatformAuthService,
    private readonly audit: AuditService
  ) {}

  @Get()
  async list(@CurrentPlatformUser() user: PlatformUser, @CurrentPlatformSession() currentSessionId?: string) {
    const rows = await this.prisma.platformRefreshToken.findMany({
      where: { platformUserId: user.id, revokedAt: null, terminatedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { sessionStartedAt: 'desc' }
    });
    return rows.map((r) => ({
      id: r.sessionId,
      startedAt: r.sessionStartedAt,
      lastActiveAt: r.lastUsedAt,
      expiresAt: r.expiresAt,
      device: describeDevice(r.userAgent),
      ip: r.ip,
      location: r.location,
      current: r.sessionId === currentSessionId
    }));
  }

  @Post('revoke-others')
  async revokeOthers(@CurrentPlatformUser() user: PlatformUser, @CurrentPlatformSession() currentSessionId?: string) {
    const revoked = await this.auth.terminateSessions({ platformUserId: user.id, exceptSessionId: currentSessionId });
    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: user.id,
      action: 'PLATFORM_SESSIONS_REVOKED_OTHERS',
      category: 'AUTH',
      details: { revoked }
    });
    return { success: true, revoked };
  }

  @Delete(':id')
  async revoke(@Param('id') id: string, @CurrentPlatformUser() user: PlatformUser, @CurrentPlatformSession() currentSessionId?: string) {
    const session = await this.prisma.platformRefreshToken.findFirst({
      where: { sessionId: id, platformUserId: user.id, terminatedAt: null }
    });
    if (!session) throw new NotFoundException('Session not found');

    await this.auth.terminateSessions({ sessionId: id });
    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: user.id,
      action: 'PLATFORM_SESSION_REVOKED',
      category: 'AUTH',
      details: { sessionId: id, device: describeDevice(session.userAgent), ip: session.ip, wasCurrent: id === currentSessionId }
    });
    return { success: true, current: id === currentSessionId };
  }
}
