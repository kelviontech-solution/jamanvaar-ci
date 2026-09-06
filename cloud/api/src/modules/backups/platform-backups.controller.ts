import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { BackupsService } from './backups.service';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';

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
  async download(@Param('id') restaurantId: string, @Param('backupId') backupId: string) {
    const url = await this.backups.getDownloadUrl(restaurantId, backupId);
    return { url };
  }
}

/** Fleet-wide backup health, storage counters, and operator triggers. */
@Controller('api/v1/platform/backups')
@UseGuards(PlatformAuthGuard)
export class PlatformBackupsFleetController {
  constructor(private readonly backups: BackupsService) {}

  @Get()
  listFleet() {
    return this.backups.listAllForPlatform();
  }

  @Post(':restaurantId/trigger')
  trigger(@Param('restaurantId') restaurantId: string) {
    return this.backups.triggerForRestaurant(restaurantId);
  }
}
