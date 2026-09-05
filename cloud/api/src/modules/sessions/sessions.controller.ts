import { Controller, Delete, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { PlatformUser } from '@prisma/client';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { CurrentPlatformUser } from '../../common/decorators/current-platform-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';

/** "Sessions" = this user's live (non-revoked, non-expired) refresh tokens — real rows from PlatformRefreshToken, not a mock list. */
@Controller('api/v1/platform/sessions')
@UseGuards(PlatformAuthGuard)
export class SessionsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@CurrentPlatformUser() user: PlatformUser) {
    return this.prisma.platformRefreshToken.findMany({
      where: { platformUserId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true, expiresAt: true }
    });
  }

  @Delete(':id')
  async revoke(@Param('id') id: string, @CurrentPlatformUser() user: PlatformUser) {
    const session = await this.prisma.platformRefreshToken.findFirst({
      where: { id, platformUserId: user.id }
    });
    if (!session) throw new NotFoundException('Session not found');

    await this.prisma.platformRefreshToken.update({ where: { id }, data: { revokedAt: new Date() } });
    return { success: true };
  }
}
