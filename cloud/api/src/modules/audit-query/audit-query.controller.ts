import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditActorType } from '@prisma/client';
import { AuditQueryService } from './audit-query.service';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';

@Controller('api/v1/audit-logs')
@UseGuards(PlatformAuthGuard)
export class AuditQueryController {
  constructor(private readonly auditQuery: AuditQueryService) {}

  @Get()
  list(
    @Query('actorType') actorType?: AuditActorType,
    @Query('restaurantId') restaurantId?: string,
    @Query('category') category?: string,
    @Query('action') action?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '25'
  ) {
    return this.auditQuery.query({
      actorType,
      restaurantId,
      category,
      action,
      page: Math.max(1, Number(page) || 1),
      limit: Math.min(100, Math.max(1, Number(limit) || 25))
    });
  }

  @Get('categories')
  categories() {
    return this.auditQuery.distinctCategories();
  }
}
