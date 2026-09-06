import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { User } from '@prisma/client';
import { BackupsService } from './backups.service';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard';
import { CurrentTenantUser } from '../../common/decorators/current-tenant-user.decorator';

/** A restaurant's own authenticated session backing up (or reviewing the history of) its own data — never another restaurant's. */
@Controller('api/v1/tenant/me/backups')
@UseGuards(TenantAuthGuard)
export class TenantBackupsController {
  constructor(private readonly backups: BackupsService) {}

  @Post()
  create(@Body() body: { data?: unknown }, @CurrentTenantUser() user: User) {
    if (body.data === undefined) throw new BadRequestException('Missing "data" field');
    return this.backups.createFromTenant(user, body.data);
  }

  @Get()
  list(@CurrentTenantUser() user: User) {
    return this.backups.listForRestaurant(user.restaurantId);
  }

  @Get(':id/download')
  async download(@Param('id') id: string, @CurrentTenantUser() user: User) {
    const url = await this.backups.getDownloadUrl(user.restaurantId, id);
    return { url };
  }
}
