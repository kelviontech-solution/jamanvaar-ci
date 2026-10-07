import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { User } from '@prisma/client';
import { BranchesService } from './branches.service';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard';
import { CurrentTenantUser } from '../../common/decorators/current-tenant-user.decorator';
import { TenantDashboardService } from '../dashboard/tenant-dashboard.service';

/**
 * A restaurant's own authenticated session listing its own sibling branches
 * — never another restaurant's. Read-only: branch creation/status changes
 * stay a Super Admin action via BranchesController. Backs the multi-outlet
 * switcher in Restaurant Admin, which previously had no way to see other
 * branches under the same restaurant at all.
 */
@Controller('api/v1/tenant/branches')
@UseGuards(TenantAuthGuard)
export class TenantBranchesController {
  constructor(private readonly branches: BranchesService,private readonly scope:TenantDashboardService) {}

  @Get()
  async list(@CurrentTenantUser() user: User,@Req() request:{tenantDeviceId?:string}) {
    const branchId=await this.scope.branchScope(user,undefined,request.tenantDeviceId);
    return this.branches.list({ restaurantId: user.restaurantId,...(branchId?{branchId}:{}) });
  }
}
