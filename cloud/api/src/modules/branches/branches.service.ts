import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PlatformUser } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto';

@Injectable()
export class BranchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  list(restaurantId?: string) {
    return this.prisma.runAsPlatform((tx) =>
      tx.branch.findMany({
        where: restaurantId ? { restaurantId } : undefined,
        orderBy: { createdAt: 'asc' },
        include: { restaurant: { select: { id: true, name: true } }, _count: { select: { devices: true, users: true } } }
      })
    );
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
