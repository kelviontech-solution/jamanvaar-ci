import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { User } from '@prisma/client';
import { BackupsService } from './backups.service';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard';
import { CurrentTenantUser } from '../../common/decorators/current-tenant-user.decorator';

/**
 * security-audit MED-10: every route here used to be reachable by ANY tenant login,
 * including STAFF — meaning a low-privilege terminal login could create, list, or
 * download a full restaurant backup (every staff PIN hash, every customer record).
 * Restricted to OWNER, matching the bar this codebase already uses for other
 * financially/administratively sensitive tenant self-service actions.
 */
function assertOwner(user: User): void {
  if (user.role !== 'OWNER') {
    throw new ForbiddenException('Only the restaurant owner can manage cloud backups');
  }
}

/** A restaurant's own authenticated session backing up (or reviewing the history of) its own data — never another restaurant's. */
@Controller('api/v1/tenant/me/backups')
@UseGuards(TenantAuthGuard)
export class TenantBackupsController {
  constructor(private readonly backups: BackupsService) {}

  @Post()
  create(@Body() body: { data?: unknown }, @CurrentTenantUser() user: User) {
    assertOwner(user);
    if (body.data === undefined) throw new BadRequestException('Missing "data" field');
    return this.backups.createFromTenant(user, body.data);
  }

  @Get()
  list(@CurrentTenantUser() user: User) {
    assertOwner(user);
    return this.backups.listForRestaurant(user.restaurantId);
  }

  @Get(':id/download')
  async download(@Param('id') id: string, @CurrentTenantUser() user: User) {
    assertOwner(user);
    const url = await this.backups.getDownloadUrl(user.restaurantId, id, `/api/v1/tenant/me/backups/${id}/file`, { actorType: 'TENANT', actorId: user.id });
    return { url };
  }

  @Get(':id/file')
  async file(@Param('id') id: string, @CurrentTenantUser() user: User, @Res() res: Response) {
    assertOwner(user);
    const { body, filename } = await this.backups.getFile(user.restaurantId, id, { actorType: 'TENANT', actorId: user.id });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(body);
  }
}
