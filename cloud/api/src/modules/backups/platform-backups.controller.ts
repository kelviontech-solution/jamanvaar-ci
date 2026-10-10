import { Body, Controller, ForbiddenException, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { PlatformUser } from '@prisma/client';
import { BackupsService } from './backups.service';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { CurrentPlatformUser } from '../../common/decorators/current-platform-user.decorator';
import { permissionsForRole } from '../../common/rbac/access';

/**
 * security-audit HIGH-03: downloading a backup (as opposed to listing its metadata)
 * returns the restaurant's full data — every staff PIN hash, every customer record,
 * every synced order. `list` stays at the generic `ops:'read'` level (READ_ONLY,
 * SUPPORT_ADMIN, PLATFORM_OPS); `download`/`file` require `ops:'write'` regardless of
 * HTTP method, since a GET can't otherwise be told apart from the metadata listing by
 * this codebase's method-based read/write rule.
 */
function assertCanDownloadBackups(actor: PlatformUser): void {
  if (permissionsForRole(actor.role as never).ops !== 'write') {
    throw new ForbiddenException('Downloading a restaurant backup requires ops:write access');
  }
}

/** Super Admin visibility into a restaurant's backup history — read-only, no restore trigger here (restore stays a tenant/operator action to avoid Super Admin silently overwriting a restaurant's live data). */
@Controller('api/v1/restaurants/:id/backups')
@UseGuards(PlatformAuthGuard)
export class PlatformBackupsController {
  constructor(private readonly backups: BackupsService) {}

  @Get()
  list(@Param('id') restaurantId: string) {
    return this.backups.listForRestaurant(restaurantId);
  }

  @Get(':backupId/download')
  async download(@Param('id') restaurantId: string, @Param('backupId') backupId: string, @CurrentPlatformUser() actor: PlatformUser) {
    assertCanDownloadBackups(actor);
    const url = await this.backups.getDownloadUrl(restaurantId, backupId, `/api/v1/restaurants/${restaurantId}/backups/${backupId}/file`, { actorType: 'PLATFORM', actorId: actor.id });
    return { url };
  }

  /** The decrypted backup as a JSON download, for storage that cannot hand out a direct link. */
  @Get(':backupId/file')
  async file(@Param('id') restaurantId: string, @Param('backupId') backupId: string, @Res() res: Response, @CurrentPlatformUser() actor: PlatformUser) {
    assertCanDownloadBackups(actor);
    const { body, filename } = await this.backups.getFile(restaurantId, backupId, { actorType: 'PLATFORM', actorId: actor.id });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(body);
  }

  /** A full, readable PDF of the same backup -- a human-readable archive copy alongside the JSON above. */
  @Get(':backupId/pdf')
  async pdf(@Param('id') restaurantId: string, @Param('backupId') backupId: string, @Res() res: Response, @CurrentPlatformUser() actor: PlatformUser) {
    assertCanDownloadBackups(actor);
    const { buffer, filename } = await this.backups.getPdf(restaurantId, backupId, { actorType: 'PLATFORM', actorId: actor.id });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}

/** Fleet-wide backup health, storage counters, and operator triggers. */
@Controller('api/v1/platform/backups')
@UseGuards(PlatformAuthGuard)
export class PlatformBackupsFleetController {
  constructor(private readonly backups: BackupsService) {}

  @Get()
  listFleet(@Query() query: Record<string, string>) {
    return this.backups.listAllForPlatform(query);
  }

  /** Writes and removes a probe object: "is backup storage working right now". */
  @Get('storage-health')
  storageHealth() {
    return this.backups.storageHealth();
  }

  @Post(':restaurantId/trigger')
  trigger(@Param('restaurantId') restaurantId: string) {
    return this.backups.triggerForRestaurant(restaurantId);
  }

  @Post(':backupId/verify')
  verify(
    @Param('backupId') backupId: string,
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    return this.backups.verifyBackup(backupId, actor);
  }

  @Post(':backupId/preview-restore')
  previewRestore(
    @Param('backupId') backupId: string,
    @Body('targetType') targetType: 'STAGING_PREVIEW' | 'PRODUCTION_RESTORE',
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    return this.backups.previewRestore(backupId, targetType || 'STAGING_PREVIEW', actor);
  }

  @Post('restore-jobs/:jobId/confirm')
  confirmRestore(
    @Param('jobId') jobId: string,
    @Body('confirmed') confirmed: boolean,
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    return this.backups.executeRestore(jobId, confirmed, actor);
  }
}
