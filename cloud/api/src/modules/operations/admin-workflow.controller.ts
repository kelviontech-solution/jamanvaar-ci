import { BadRequestException, Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { User, PlatformUser } from '@prisma/client';
import { CurrentPlatformUser } from '../../common/decorators/current-platform-user.decorator';
import { permissionsForRole, PlatformRoleName } from '../../common/rbac/access';
import { z } from 'zod';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { CurrentTenantUser } from '../../common/decorators/current-tenant-user.decorator';
import { OperationsService, OpsScope } from './operations.service';
import { AdminWorkflowService, workflowPreferences } from './admin-workflow.service';

@Controller('api/v1/tenant/operations/launch')
@UseGuards(TenantAuthGuard)
export class AdminWorkflowController {
  constructor(
    private readonly ops: OperationsService,
    private readonly workflow: AdminWorkflowService
  ) {}
  @Get() async inspect(@CurrentTenantUser() user: User, @Query('branchId') branch?: string) {
    return this.workflow.inspect(await this.ops.scope(user, branch));
  }
  @Post('preferences') async preferences(@CurrentTenantUser() user: User, @Query('branchId') branch: string, @Body() input: unknown) {
    const parsed = workflowPreferences.safeParse(input);
    if (!parsed.success) throw new BadRequestException('Choose table service, printed receipts and the current version.');
    return this.workflow.preferences(await this.ops.scope(user, branch), parsed.data);
  }
  @Get('menu') async menu(@CurrentTenantUser() user: User, @Query('branchId') branch: string, @Query('channel') channel: string) {
    const parsed = z.enum(['POS', 'KIOSK', 'QR']).safeParse(channel);
    if (!parsed.success) throw new BadRequestException('Choose POS, Kiosk or QR');
    return this.workflow.menu(await this.ops.scope(user, branch), parsed.data);
  }
}
@Controller('api/v1/restaurants/:restaurantId/launch')
@UseGuards(PlatformAuthGuard)
export class PlatformAdminWorkflowController {
  constructor(
    private readonly ops: OperationsService,
    private readonly workflow: AdminWorkflowService
  ) {}
  @Get() async inspect(@Param('restaurantId') restaurantId: string, @Query('branchId') branchId: string, @CurrentPlatformUser() actor: PlatformUser) {
    const branch = await this.ops.prisma.runAsPlatform((tx) => tx.branch.findFirst({ where: { id: branchId, restaurantId, status: 'ACTIVE' } }));
    if (!branch) throw new BadRequestException('Choose an active branch for this restaurant');
    const result = await this.workflow.inspect({ restaurantId, branchId, userId: actor.id, role: 'OWNER', apps: [], timezone: branch.timezone } as OpsScope);
    const permissions = permissionsForRole(actor.role as PlatformRoleName);
    return {
      ...result,
      delivery: permissions.devices ? result.delivery : [],
      deliveryRestricted: !permissions.devices,
      handovers: result.handovers.map((h) => ({
        acceptedAt: (h as Record<string, unknown>).acceptedAt ?? null,
        updatedAt: (h as Record<string, unknown>).updatedAt ?? null
      }))
    };
  }
}
