import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PlanStatus, PlatformUser, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreatePlanDto, UpdatePlanDto } from './dto/plan.dto';

/**
 * Plan itself is platform-global (no restaurantId, no RLS), but every method
 * here that traverses into `subscriptions` also touches Subscription and
 * Restaurant — both RLS-protected. Using runAsPlatform uniformly (even for
 * the Plan-only methods) avoids a class of bug where a later edit adds a
 * relation include to a method that wasn't wrapped, and RLS silently
 * returns an empty result instead of an error.
 */
@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  /**
   * `excludeTestFixtures` filters out the `TEST `-prefixed plans e2e specs
   * create against this same database (see cloud/api/test/*.e2e.spec.ts —
   * every one of them names its fixtures this way) — the exact "plan picker
   * flooded with test plans" the QA audit found in Onboarding. Defaults to
   * false so Super Admin's own Plans management page keeps seeing
   * everything, including old/test plans it may want to clean up.
   */
  list(opts: { excludeTestFixtures?: boolean } = {}) {
    return this.prisma.runAsPlatform((tx) =>
      tx.plan.findMany({
        where: opts.excludeTestFixtures ? { name: { not: { startsWith: 'TEST ' } } } : undefined,
        orderBy: { createdAt: 'asc' },
        include: { _count: { select: { subscriptions: true } } }
      })
    );
  }

  async getById(id: string) {
    const plan = await this.prisma.runAsPlatform((tx) =>
      tx.plan.findUnique({
        where: { id },
        include: {
          subscriptions: {
            orderBy: { createdAt: 'desc' },
            include: { restaurant: { select: { id: true, name: true, status: true } } }
          }
        }
      })
    );
    if (!plan) throw new NotFoundException('Plan not found');
    return plan;
  }

  async create(dto: CreatePlanDto, actor: PlatformUser) {
    const plan = await this.prisma.runAsPlatform((tx) =>
      tx.plan.create({ data: dto as Prisma.PlanCreateInput })
    );
    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: actor.id,
      action: 'PLAN_CREATED',
      category: 'PLAN',
      details: { planId: plan.id, name: plan.name, tier: plan.tier }
    });
    return plan;
  }

  async update(id: string, dto: UpdatePlanDto, actor: PlatformUser) {
    const plan = await this.prisma.runAsPlatform(async (tx) => {
      const existing = await tx.plan.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Plan not found');
      return tx.plan.update({ where: { id }, data: dto as Prisma.PlanUpdateInput });
    });

    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: actor.id,
      action: 'PLAN_UPDATED',
      category: 'PLAN',
      details: { planId: plan.id, name: plan.name }
    });
    return plan;
  }

  async setStatus(id: string, status: PlanStatus, actor: PlatformUser) {
    const { plan, previousStatus } = await this.prisma.runAsPlatform(async (tx) => {
      const existing = await tx.plan.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Plan not found');
      if (existing.status === status) throw new ConflictException(`Plan is already ${status}`);

      const updated = await tx.plan.update({ where: { id }, data: { status } });
      return { plan: updated, previousStatus: existing.status };
    });

    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: actor.id,
      action: `PLAN_${status}`,
      category: 'PLAN',
      details: { planId: plan.id, previousStatus }
    });
    return plan;
  }
}
