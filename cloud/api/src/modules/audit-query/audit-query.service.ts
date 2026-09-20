import { Injectable } from '@nestjs/common';
import { AuditActorType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditQueryFilters {
  actorType?: AuditActorType;
  restaurantId?: string;
  category?: string;
  action?: string;
  page: number;
  limit: number;
}

@Injectable()
export class AuditQueryService {
  constructor(private readonly prisma: PrismaService) {}

  // AuditLog carries no RLS in this phase (see schema.prisma comment) — a
  // plain query is correct here, matching the model's platform-readable design.
  async query(filters: AuditQueryFilters) {
    const where = {
      ...(filters.actorType ? { actorType: filters.actorType } : {}),
      ...(filters.restaurantId ? { restaurantId: filters.restaurantId } : {}),
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.action ? { action: { contains: filters.action, mode: 'insensitive' as const } } : {})
    };

    const [rows, total] = await Promise.all([
      this.prisma.platformDb.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit
      }),
      this.prisma.platformDb.auditLog.count({ where })
    ]);

    return { rows, total, page: filters.page, limit: filters.limit };
  }

  distinctCategories() {
    return this.prisma.platformDb.auditLog.findMany({
      distinct: ['category'],
      select: { category: true },
      orderBy: { category: 'asc' }
    });
  }
}
