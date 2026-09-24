import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PlatformUser, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AssignSubscriptionDto } from './dto/subscription.dto';
import { InvoicesService } from '../billing/invoices.service';
import { ApplicationEntitlementsService } from '../application-entitlements/application-entitlements.service';

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly invoices: InvoicesService,
    private readonly appEntitlements: ApplicationEntitlementsService
  ) {}

  list() {
    return this.prisma.runAsPlatform((tx) =>
      tx.subscription.findMany({
        orderBy: { createdAt: 'desc' },
        include: { plan: true, restaurant: { select: { id: true, name: true, status: true } } }
      })
    );
  }

  async getById(id: string) {
    const sub = await this.prisma.runAsPlatform((tx) =>
      tx.subscription.findUnique({
        where: { id },
        include: { plan: true, restaurant: { select: { id: true, name: true, status: true } } }
      })
    );
    if (!sub) throw new NotFoundException('Subscription not found');
    return sub;
  }

  /**
   * One active-lifecycle subscription per (restaurant, product family) — a restaurant may
   * hold a RESTAURANT-family subscription and a KIOSK-family one concurrently (Phase 2), but
   * not two of the same family; a restaurant that already has one in this plan's family must
   * use change-plan/renew instead.
   */
  async assign(dto: AssignSubscriptionDto, actor: PlatformUser) {
    return this.prisma.runAsPlatform(async (tx) => {
      const restaurant = await tx.restaurant.findFirst({ where: { id: dto.restaurantId, deletedAt: null } });
      if (!restaurant) throw new NotFoundException('Restaurant not found');

      const plan = await tx.plan.findUnique({ where: { id: dto.planId } });
      if (!plan) throw new NotFoundException('Plan not found');

      const existing = await tx.subscription.findFirst({
        where: {
          restaurantId: dto.restaurantId,
          status: { in: ['TRIAL', 'ACTIVE', 'PAST_DUE'] },
          plan: { productFamily: plan.productFamily }
        }
      });
      if (existing) {
        throw new ConflictException(
          `Restaurant already has an active ${plan.productFamily} subscription — use change-plan or renew`
        );
      }

      const sub = await tx.subscription.create({
        data: {
          restaurantId: dto.restaurantId,
          planId: dto.planId,
          status: dto.status,
          expiresAt: dto.expiresAt,
          trialEndsAt: dto.trialEndsAt
        },
        include: { plan: true }
      });

      // One ApplicationEntitlement row per AppCode, right away — a
      // subscription that exists but has never been given an explicit
      // application selection still needs a real, queryable answer to
      // "is Kiosk enabled here", not an absent row that every caller has
      // to interpret for itself.
      await this.appEntitlements.ensureRowsForSubscription(
        tx,
        dto.restaurantId,
        sub.id,
        plan.tier,
        dto.applications
      );

      // Automatically generate first invoice for this subscription if plan price > 0 or status is ACTIVE
      await this.invoices.createInitialSubscriptionInvoice(
        tx,
        sub.restaurantId,
        sub.id,
        plan.id,
        sub.expiresAt ?? new Date(Date.now() + 30 * 86400000),
        new Date()
      );

      await this.audit.log(
        {
          actorType: 'PLATFORM',
          actorId: actor.id,
          restaurantId: dto.restaurantId,
          action: 'SUBSCRIPTION_ASSIGNED',
          category: 'SUBSCRIPTION',
          details: { subscriptionId: sub.id, planId: plan.id, planName: plan.name }
        },
        tx
      );

      return sub;
    });
  }

  async changePlan(id: string, planId: string, actor: PlatformUser) {
    return this.prisma.runAsPlatform(async (tx) => {
      const existing = await tx.subscription.findUnique({ where: { id }, include: { plan: true } });
      if (!existing) throw new NotFoundException('Subscription not found');

      const newPlan = await tx.plan.findUnique({ where: { id: planId } });
      if (!newPlan) throw new NotFoundException('Plan not found');

      const updated = await tx.subscription.update({ where: { id }, data: { planId }, include: { plan: true } });

      // Resync application access to the new tier's defaults. This is a
      // deliberate reset, not a merge: a downgrade must actually turn off
      // apps the new plan doesn't include (that's the whole point of
      // enforcing entitlements at all — see assertAppEnabled), and an
      // upgrade should light up the new apps automatically rather than
      // leaving the operator to remember to flip six switches by hand. A
      // restaurant-specific deviceQuota/config override on an existing row
      // is untouched either way (see ensureRowsForSubscription).
      await this.appEntitlements.ensureRowsForSubscription(tx, existing.restaurantId, id, newPlan.tier);

      await this.audit.log(
        {
          actorType: 'PLATFORM',
          actorId: actor.id,
          restaurantId: existing.restaurantId,
          action: 'SUBSCRIPTION_PLAN_CHANGED',
          category: 'SUBSCRIPTION',
          details: { subscriptionId: id, fromPlan: existing.plan.name, toPlan: newPlan.name }
        },
        tx
      );

      return updated;
    });
  }

  async renew(id: string, expiresAt: Date, actor: PlatformUser) {
    return this.prisma.runAsPlatform(async (tx) => {
      const existing = await tx.subscription.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Subscription not found');

      const updated = await tx.subscription.update({
        where: { id },
        data: { expiresAt, status: 'ACTIVE' },
        include: { plan: true }
      });

      await this.audit.log(
        {
          actorType: 'PLATFORM',
          actorId: actor.id,
          restaurantId: existing.restaurantId,
          action: 'SUBSCRIPTION_RENEWED',
          category: 'SUBSCRIPTION',
          details: { subscriptionId: id, expiresAt: expiresAt.toISOString() }
        },
        tx
      );

      return updated;
    });
  }

  /**
   * Adds `days` to the later of the current expiry and now. Unlike `renew` it does not
   * force the status to ACTIVE: a trial stays a trial, and a lapsed one is revived to what
   * it was (trial if it had a trial end, otherwise active). A suspended subscription must
   * be reactivated on purpose, not by an extension.
   */
  async extend(id: string, days: number, actor: PlatformUser) {
    return this.prisma.runAsPlatform(async (tx) => {
      const existing = await tx.subscription.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Subscription not found');
      if (existing.status === 'SUSPENDED') {
        throw new ConflictException('This subscription is suspended. Reactivate it first, then extend it.');
      }

      const addMs = days * 24 * 60 * 60 * 1000;
      const base = Math.max(existing.expiresAt.getTime(), Date.now());
      const expiresAt = new Date(base + addMs);
      const revivedStatus: SubscriptionStatus = existing.trialEndsAt ? 'TRIAL' : 'ACTIVE';

      const updated = await tx.subscription.update({
        where: { id },
        data: {
          expiresAt,
          ...(existing.status === 'EXPIRED' ? { status: revivedStatus } : {}),
          ...(existing.trialEndsAt ? { trialEndsAt: new Date(Math.max(existing.trialEndsAt.getTime(), Date.now()) + addMs) } : {})
        },
        include: { plan: true }
      });

      await this.audit.log(
        {
          actorType: 'PLATFORM',
          actorId: actor.id,
          restaurantId: existing.restaurantId,
          action: 'SUBSCRIPTION_EXTENDED',
          category: 'SUBSCRIPTION',
          details: {
            subscriptionId: id,
            days,
            previousExpiresAt: existing.expiresAt.toISOString(),
            expiresAt: expiresAt.toISOString(),
            previousStatus: existing.status
          }
        },
        tx
      );

      return updated;
    });
  }

  async setStatus(id: string, status: SubscriptionStatus, actor: PlatformUser) {
    return this.prisma.runAsPlatform(async (tx) => {
      const existing = await tx.subscription.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Subscription not found');
      if (existing.status === status) throw new ConflictException(`Subscription is already ${status}`);

      const updated = await tx.subscription.update({ where: { id }, data: { status }, include: { plan: true } });

      await this.audit.log(
        {
          actorType: 'PLATFORM',
          actorId: actor.id,
          restaurantId: existing.restaurantId,
          action: `SUBSCRIPTION_${status}`,
          category: 'SUBSCRIPTION',
          details: { subscriptionId: id, previousStatus: existing.status }
        },
        tx
      );

      return updated;
    });
  }
}
