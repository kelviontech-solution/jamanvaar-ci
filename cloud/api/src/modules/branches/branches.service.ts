import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PlatformUser } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto';
import { pageOf, parsePaging } from '../../common/paging';

@Injectable()
export class BranchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  /**
   * Without `page` this is the plain array it always was. With `page` it is searched, filtered and
   * paged in the database, with per-status counts for the whole (unfiltered by status) scope, so the
   * browser never has to load every branch of every restaurant (BUG-047).
   */
  list(query: { restaurantId?: string; q?: string; status?: string; page?: unknown; pageSize?: unknown } = {}) {
    const paging = parsePaging(query);
    const scope = {
      ...(query.restaurantId ? { restaurantId: query.restaurantId } : {}),
      ...(query.q?.trim()
        ? {
            OR: [
              { name: { contains: query.q.trim(), mode: 'insensitive' as const } },
              { code: { contains: query.q.trim(), mode: 'insensitive' as const } },
              { restaurant: { name: { contains: query.q.trim(), mode: 'insensitive' as const } } }
            ]
          }
        : {})
    };
    const statusFilter: { status?: 'ACTIVE' | 'INACTIVE' } = query.status === 'ACTIVE' || query.status === 'INACTIVE' ? { status: query.status } : {};
    const where = { ...scope, ...statusFilter };
    const include = { restaurant: { select: { id: true, name: true } }, _count: { select: { devices: true, users: true } } };

    return this.prisma.runAsPlatform(async (tx) => {
      if (!paging.paged) return tx.branch.findMany({ where, orderBy: { createdAt: 'asc' }, include });
      const [items, total, grouped] = await Promise.all([
        tx.branch.findMany({ where, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], include, skip: paging.skip, take: paging.take }),
        tx.branch.count({ where }),
        tx.branch.groupBy({ by: ['status'], where: scope, _count: { _all: true } })
      ]);
      const statusCounts = { ACTIVE: 0, INACTIVE: 0 };
      for (const g of grouped) statusCounts[g.status] = g._count._all;
      return { ...pageOf(items, total, paging), statusCounts };
    });
  }

  /** One call for many branches (was one request per branch from the browser). Already-correct ones are skipped. */
  async bulkSetStatus(ids: string[], status: 'ACTIVE' | 'INACTIVE', actor: PlatformUser) {
    return this.prisma.runAsPlatform(async (tx) => {
      const targets = await tx.branch.findMany({ where: { id: { in: ids }, status: { not: status } }, select: { id: true, restaurantId: true, status: true } });
      if (targets.length) {
        await tx.branch.updateMany({ where: { id: { in: targets.map((t) => t.id) } }, data: { status } });
      }
      for (const t of targets) {
        await this.audit.log(
          { actorType: 'PLATFORM', actorId: actor.id, restaurantId: t.restaurantId, action: `BRANCH_${status}`, category: 'BRANCH', details: { branchId: t.id, previousStatus: t.status, bulk: true } },
          tx
        );
      }
      return { updated: targets.length, skipped: ids.length - targets.length };
    });
  }

  async create(dto: CreateBranchDto, actor: PlatformUser) {
    return this.prisma.runAsPlatform(async (tx) => {
      const restaurant = await tx.restaurant.findFirst({ where: { id: dto.restaurantId, deletedAt: null } });
      if (!restaurant) throw new NotFoundException('Restaurant not found');

      const [branchCount, activeSub] = await Promise.all([
        tx.branch.count({ where: { restaurantId: dto.restaurantId } }),
        tx.subscription.findFirst({
          where: { restaurantId: dto.restaurantId, status: { in: ['TRIAL', 'ACTIVE'] } },
          include: { plan: true },
          orderBy: { createdAt: 'desc' }
        })
      ]);

      if (activeSub && branchCount >= activeSub.plan.maxBranches) {
        throw new ConflictException(
          `Branch limit reached: ${activeSub.plan.name} allows up to ${activeSub.plan.maxBranches} branch(es)`
        );
      }

      let branch;
      try {
        branch = await tx.branch.create({ data: dto });
      } catch (err) {
        if (err instanceof Error && (err as { code?: string }).code === 'P2002') {
          throw new ConflictException(`Branch code "${dto.code}" is already used by this restaurant`);
        }
        throw err;
      }

      await this.audit.log(
        {
          actorType: 'PLATFORM',
          actorId: actor.id,
          restaurantId: dto.restaurantId,
          action: 'BRANCH_CREATED',
          category: 'BRANCH',
          details: { branchId: branch.id, name: branch.name, code: branch.code }
        },
        tx
      );

      return branch;
    });
  }

  async update(id: string, dto: UpdateBranchDto, actor: PlatformUser) {
    return this.prisma.runAsPlatform(async (tx) => {
      const existing = await tx.branch.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Branch not found');

      const branch = await tx.branch.update({ where: { id }, data: dto });

      await this.audit.log(
        {
          actorType: 'PLATFORM',
          actorId: actor.id,
          restaurantId: existing.restaurantId,
          action: 'BRANCH_UPDATED',
          category: 'BRANCH',
          details: { branchId: id }
        },
        tx
      );

      return branch;
    });
  }

  async setStatus(id: string, status: 'ACTIVE' | 'INACTIVE', actor: PlatformUser) {
    return this.prisma.runAsPlatform(async (tx) => {
      const existing = await tx.branch.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Branch not found');
      if (existing.status === status) throw new ConflictException(`Branch is already ${status}`);

      const branch = await tx.branch.update({ where: { id }, data: { status } });

      await this.audit.log(
        {
          actorType: 'PLATFORM',
          actorId: actor.id,
          restaurantId: existing.restaurantId,
          action: `BRANCH_${status}`,
          category: 'BRANCH',
          details: { branchId: id, previousStatus: existing.status }
        },
        tx
      );

      return branch;
    });
  }
}
