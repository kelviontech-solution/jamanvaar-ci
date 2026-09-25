import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PlanStatus, PlanTier, PlatformUser, Prisma, ProductFamily } from '@prisma/client';
import { defaultAppsFor } from '../application-entitlements/application-entitlements.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreatePlanDto, UpdatePlanDto } from './dto/plan.dto';
import { ENTITLEMENT_KEYS } from './entitlements';

type TxClient = Prisma.TransactionClient;

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
    return this.prisma
      .runAsPlatform((tx) =>
        tx.plan.findMany({
          where: opts.excludeTestFixtures ? { name: { not: { startsWith: 'TEST ' } } } : undefined,
          orderBy: { createdAt: 'asc' },
          include: { _count: { select: { subscriptions: true } } }
        })
      )
      .then((plans) => plans.map((p) => this.withDefaultApps(p)));
  }

  /** Computed at read time from productFamily+tier — never stored. */
  private withDefaultApps<T extends { productFamily: ProductFamily; tier: PlanTier }>(plan: T) {
    return { ...plan, defaultApps: defaultAppsFor(plan.productFamily, plan.tier) };
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
    return this.withDefaultApps(plan);
  }

  /** Checks incoming keys against the live Feature.legacyEntitlementKey set and returns a dense object (missing keys false). */
  private async assertValidEntitlementKeys(
    tx: TxClient,
    incoming: Record<string, boolean>
  ): Promise<Record<string, boolean>> {
    const live = await tx.feature.findMany({
      where: { legacyEntitlementKey: { not: null } },
      select: { legacyEntitlementKey: true }
    });
    const validKeys = new Set<string>(ENTITLEMENT_KEYS);
    for (const f of live) if (f.legacyEntitlementKey) validKeys.add(f.legacyEntitlementKey);

    const unknown = Object.keys(incoming).filter((k) => !validKeys.has(k));
    if (unknown.length > 0) {
      throw new BadRequestException(`Unknown entitlement key${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}`);
    }
    const dense: Record<string, boolean> = {};
    for (const key of validKeys) dense[key] = incoming[key] ?? false;
    return dense;
  }

  async create(dto: CreatePlanDto, actor: PlatformUser) {
    const plan = await this.prisma.runAsPlatform(async (tx) => {
      const entitlements = await this.assertValidEntitlementKeys(tx, dto.entitlements);
      return tx.plan.create({ data: { ...dto, entitlements } as Prisma.PlanCreateInput });
    });
    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: actor.id,
      action: 'PLAN_CREATED',
      category: 'PLAN',
      details: { planId: plan.id, name: plan.name, tier: plan.tier }
    });
    return this.withDefaultApps(plan);
  }

  async update(id: string, dto: UpdatePlanDto, actor: PlatformUser) {
    const plan = await this.prisma.runAsPlatform(async (tx) => {
      const existing = await tx.plan.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Plan not found');
      const data = { ...dto } as Prisma.PlanUpdateInput;
      if (dto.entitlements !== undefined) {
        data.entitlements = await this.assertValidEntitlementKeys(tx, dto.entitlements);
      }
      return tx.plan.update({ where: { id }, data });
    });

    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: actor.id,
      action: 'PLAN_UPDATED',
      category: 'PLAN',
      details: { planId: plan.id, name: plan.name }
    });
    return this.withDefaultApps(plan);
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
    return this.withDefaultApps(plan);
  }
}
