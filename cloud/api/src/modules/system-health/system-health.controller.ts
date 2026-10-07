import { Controller, Get, UseGuards } from '@nestjs/common';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';

const START_TIME = Date.now();

/** Safe sign-in-screen liveness probe. Database and device details remain behind platform auth. */
@Controller('api/v1/health')
export class PublicHealthController {
  @Get()
  check() { return { status: 'ok' }; }
}

/**
 * Every field here is a fact this process can actually check right now —
 * no synthetic "99.9% uptime" numbers, and no sync/device health, since
 * this phase has no sync engine or registered devices to report on yet.
 */
@Controller('api/v1/platform/system-health')
@UseGuards(PlatformAuthGuard)
export class SystemHealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    let database: 'UP' | 'DOWN' = 'DOWN';
    let databaseLatencyMs: number | null = null;
    try {
      const start = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      databaseLatencyMs = Date.now() - start;
      database = 'UP';
    } catch {
      database = 'DOWN';
    }

    return {
      api: 'UP' as const,
      database,
      databaseLatencyMs,
      uptimeSeconds: Math.round((Date.now() - START_TIME) / 1000),
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      arch: process.arch,
      platform: process.platform
    };
  }
}
