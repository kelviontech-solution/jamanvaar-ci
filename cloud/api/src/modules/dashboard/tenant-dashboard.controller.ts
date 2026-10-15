import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { User } from '@prisma/client';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard';
import { CurrentTenantUser } from '../../common/decorators/current-tenant-user.decorator';
import { TenantDashboardService } from './tenant-dashboard.service';

@Controller('api/v1/tenant/dashboard')
@UseGuards(TenantAuthGuard)
export class TenantDashboardController {
  constructor(private readonly dashboard: TenantDashboardService) {}
  @Get('launch-acceptance')
  launch(@CurrentTenantUser() user: User, @Query('branchId') branchId: string, @Req() req: { tenantDeviceId?: string }) {
    return this.dashboard.launchAcceptance(user, branchId, req.tenantDeviceId);
  }
  @Post('launch-acceptance')
  accept(
    @CurrentTenantUser() user: User,
    @Query('branchId') branchId: string,
    @Body() input: Record<string, unknown>,
    @Req() req: { tenantDeviceId?: string }
  ) {
    return this.dashboard.launchAcceptance(user, branchId, req.tenantDeviceId, input);
  }
  @Get()
  get(
    @CurrentTenantUser() user: User,
    @Query() query: { branchId?: string; period?: string; from?: string; to?: string; source?: string },
    @Req() req: { tenantDeviceId?: string }
  ) {
    return this.dashboard.get(user, query, req.tenantDeviceId);
  }
}
