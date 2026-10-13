import { Controller, Get, UseGuards } from '@nestjs/common';
import { RestaurantHealthService } from './restaurant-health.service';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';

/** Lives under /platform/dashboard so it reuses the existing 'reports' RBAC area (access.ts) rather than needing a new rule. */
@Controller('api/v1/platform/dashboard/restaurant-health')
@UseGuards(PlatformAuthGuard)
export class RestaurantHealthController {
  constructor(private readonly health: RestaurantHealthService) {}

  @Get()
  getBoard() {
    return this.health.getBoard();
  }
}
