import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard';

/**
 * A restaurant's own read-only view of the app catalog and its current downloadable
 * version — the same release data Super Admin publishes via ApplicationsController,
 * filtered (in ApplicationsService.listForTenant) to exclude platform-wide fleet/device
 * counts that belong to Super Admin only, not a single tenant. Backs the Downloads page
 * in Restaurant Admin / Kiosk Admin.
 */
@Controller('api/v1/tenant/applications')
@UseGuards(TenantAuthGuard)
export class TenantApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @Get()
  list() {
    return this.applications.listForTenant();
  }
}
