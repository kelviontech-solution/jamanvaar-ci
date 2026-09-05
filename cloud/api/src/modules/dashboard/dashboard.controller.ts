import { Controller, Get, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';

@Controller('api/v1/platform/dashboard')
@UseGuards(PlatformAuthGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  summary() {
    return this.dashboard.getSummary();
  }
}
