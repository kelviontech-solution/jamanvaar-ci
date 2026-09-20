import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OFFLINE_WARN_AFTER_DAYS } from '../../common/device-health';
import { pageOf, parsePaging } from '../../common/paging';
import { PrismaService } from '../../prisma/prisma.service';

export type NotificationSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface NotifyInput {
  type: string;
  severity: NotificationSeverity;
  title: string;
  body?: string | null;
  restaurantId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  link: string;
  /** The same underlying event must always use the same key so it is only announced once. */
  dedupeKey: string;
  /** Only this platform user sees it; omit to tell the whole team. */
  userId?: string | null;
}

export interface NotificationFilters {
  page?: unknown;
  pageSize?: unknown;
  unread?: string;
  severity?: string;
  type?: string;
  restaurantId?: string;
}

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const SUBSCRIPTION_WARN_DAYS = 7;
const KEY_WARN_DAYS = 3;
const OFFLINE_ALERT_AFTER_MS = HOUR_MS;

const isoDay = (d = new Date()) => d.toISOString().slice(0, 10);

/**
 * The platform team's notification centre (BUG-064). Conditions that need attention (a subscription
 * about to end, a failed backup, an overdue invoice, terminals gone quiet…) become stored
 * notifications exactly once each, carry a severity and a link to the exact record, and every team
 * member has their own read state. Audience is the whole team unless a notification is addressed to one person.
 */
@Injectable()
export class PlatformNotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Creates the notification unless this event was already announced. Returns whether it was new. */
  async notify(input: NotifyInput): Promise<boolean> {
    const existing = await this.prisma.platformDb.platformNotification.findUnique({ where: { dedupeKey: input.dedupeKey }, select: { id: true } });
    if (existing) return false;
    try {
      await this.prisma.platformDb.platformNotification.create({
        data: {
          type: input.type,
          severity: input.severity,
          title: input.title,
          body: input.body ?? null,
          restaurantId: input.restaurantId ?? null,
          targetType: input.targetType ?? null,
          targetId: input.targetId ?? null,
          link: input.link,
          dedupeKey: input.dedupeKey,
          userId: input.userId ?? null
        }
      });
      return true;
    } catch (err) {
      // Two API instances scanning at once: the unique key makes the loser a no-op.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return false;
      throw err;
    }
  }

  /** What one person is allowed to see: team-wide notifications plus those addressed to them. */
  private audience(userId: string): Prisma.PlatformNotificationWhereInput {
    return { OR: [{ userId: null }, { userId }] };
  }

  async list(userId: string, filters: NotificationFilters) {
    const paging = parsePaging(filters);
    const where: Prisma.PlatformNotificationWhereInput = {
      AND: [
        this.audience(userId),
        filters.severity ? { severity: filters.severity } : {},
        filters.type ? { type: filters.type } : {},
        filters.restaurantId ? { restaurantId: filters.restaurantId } : {},
        filters.unread === 'true' ? { reads: { none: { userId } } } : {}
      ]
    };
    const scope: Prisma.PlatformNotificationWhereInput = { AND: [this.audience(userId), filters.restaurantId ? { restaurantId: filters.restaurantId } : {}] };

    const db = this.prisma.platformDb;
    const [rows, total, unreadCount, bySeverity] = await Promise.all([
      db.platformNotification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        include: { reads: { where: { userId }, select: { readAt: true } } },
        skip: paging.paged ? paging.skip : 0,
        take: paging.paged ? paging.take : 100
      }),
      db.platformNotification.count({ where }),
      db.platformNotification.count({ where: { AND: [scope, { reads: { none: { userId } } }] } }),
      db.platformNotification.groupBy({ by: ['severity'], where: { AND: [scope, { reads: { none: { userId } } }] }, _count: { _all: true } })
    ]);

    const items = rows.map(({ reads, ...n }) => ({ ...n, read: reads.length > 0, readAt: reads[0]?.readAt ?? null }));
    const severityCounts = { INFO: 0, WARNING: 0, CRITICAL: 0, ...Object.fromEntries(bySeverity.map((g) => [g.severity, g._count._all])) };
    return paging.paged ? { ...pageOf(items, total, paging), unreadCount, severityCounts } : items;
  }

  async unreadCount(userId: string) {
    const db = this.prisma.platformDb;
    const where = { AND: [this.audience(userId), { reads: { none: { userId } } }] };
    const [count, critical] = await Promise.all([
      db.platformNotification.count({ where }),
      db.platformNotification.count({ where: { AND: [where, { severity: 'CRITICAL' }] } })
    ]);
    return { count, critical };
  }

  async markRead(userId: string, id: string) {
    const found = await this.prisma.platformDb.platformNotification.findFirst({ where: { AND: [{ id }, this.audience(userId)] }, select: { id: true } });
    if (!found) throw new NotFoundException('Notification not found');
    await this.prisma.platformDb.platformNotificationRead.upsert({
      where: { notificationId_userId: { notificationId: id, userId } },
      create: { notificationId: id, userId },
      update: {}
    });
    return { ok: true };
  }

  async markAllRead(userId: string, restaurantId?: string) {
    const unread = await this.prisma.platformDb.platformNotification.findMany({
      where: { AND: [this.audience(userId), restaurantId ? { restaurantId } : {}, { reads: { none: { userId } } }] },
      select: { id: true }
    });
    if (unread.length) {
      await this.prisma.platformDb.platformNotificationRead.createMany({ data: unread.map((n) => ({ notificationId: n.id, userId })), skipDuplicates: true });
    }
    return { ok: true, marked: unread.length };
  }

  /** Old, already-read history is trimmed so the table does not grow without bound. */
  async purgeOld(olderThanDays = 90) {
    const { count } = await this.prisma.platformDb.platformNotification.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - olderThanDays * DAY_MS) } } });
    return { deleted: count };
  }

  /**
   * Looks at the platform's current state and announces whatever needs attention. Safe to run as
   * often as you like: every event has a stable key, so nothing is announced twice.
   */
  async scan() {
    const db = this.prisma.platformDb;
    const now = new Date();
    const day = isoDay(now);
    const created: Record<string, number> = {};
    const add = async (n: NotifyInput) => {
      if (await this.notify(n)) created[n.type] = (created[n.type] ?? 0) + 1;
    };
    const restaurantLink = (id: string, tab: string) => `/restaurants/${id}?tab=${tab}`;

    // Subscriptions ending within a week (or already ended but not yet renewed).
    const expiring = await db.subscription.findMany({
      where: { status: { in: ['ACTIVE', 'TRIAL', 'PAST_DUE'] }, expiresAt: { lte: new Date(now.getTime() + SUBSCRIPTION_WARN_DAYS * DAY_MS) }, restaurant: { status: 'ACTIVE' } },
      include: { restaurant: { select: { id: true, name: true } }, plan: { select: { name: true } } }
    });
    for (const s of expiring) {
      const days = Math.ceil((s.expiresAt.getTime() - now.getTime()) / DAY_MS);
      const ended = days <= 0;
      await add({
        type: 'SUBSCRIPTION_EXPIRING',
        severity: days <= 2 ? 'CRITICAL' : 'WARNING',
        title: ended ? `${s.restaurant.name}: subscription has ended` : `${s.restaurant.name}: subscription ends in ${days} day${days === 1 ? '' : 's'}`,
        body: `${s.plan.name} · ${s.status} · ends ${s.expiresAt.toISOString().slice(0, 10)}`,
        restaurantId: s.restaurantId,
        targetType: 'subscription',
        targetId: s.id,
        link: restaurantLink(s.restaurantId, 'subscription'),
        dedupeKey: `sub-exp:${s.id}:${s.expiresAt.toISOString().slice(0, 10)}`
      });
    }

    // Backups that failed in the last day.
    const failedBackups = await db.backup.findMany({
      where: { status: 'FAILED', createdAt: { gte: new Date(now.getTime() - DAY_MS) } },
      include: { restaurant: { select: { name: true } } }
    });
    for (const b of failedBackups) {
      await add({
        type: 'BACKUP_FAILED',
        severity: 'CRITICAL',
        title: `${b.restaurant.name}: backup failed`,
        body: b.errorMessage ?? 'The backup did not complete.',
        restaurantId: b.restaurantId,
        targetType: 'backup',
        targetId: b.id,
        link: restaurantLink(b.restaurantId, 'backups'),
        dedupeKey: `backup-failed:${b.id}`
      });
    }

    // Unpaid invoices past their due date.
    const overdue = await db.invoice.findMany({
      where: { status: { in: ['ISSUED', 'PAST_DUE'] }, dueDate: { lt: now } },
      include: { restaurant: { select: { name: true } } }
    });
    for (const i of overdue) {
      await add({
        type: 'INVOICE_OVERDUE',
        severity: 'WARNING',
        title: `${i.restaurant.name}: invoice ${i.invoiceNumber} is overdue`,
        body: `Due ${i.dueDate.toISOString().slice(0, 10)} · ₹${(i.totalAmount / 100).toLocaleString('en-IN')}`,
        restaurantId: i.restaurantId,
        targetType: 'invoice',
        targetId: i.id,
        link: restaurantLink(i.restaurantId, 'billing'),
        dedupeKey: `inv-overdue:${i.id}`
      });
    }

    // Terminals that have gone quiet, one notification per restaurant per day.
    const quiet = await db.device.findMany({
      where: { status: 'ACTIVE', restaurant: { status: 'ACTIVE' }, lastSeenAt: { lt: new Date(now.getTime() - OFFLINE_ALERT_AFTER_MS) } },
      select: { restaurantId: true, lastSeenAt: true, restaurant: { select: { name: true } } }
    });
    const byRestaurant = new Map<string, { name: string; count: number; longestMs: number }>();
    for (const d of quiet) {
      const silent = now.getTime() - (d.lastSeenAt as Date).getTime();
      const cur = byRestaurant.get(d.restaurantId) ?? { name: d.restaurant.name, count: 0, longestMs: 0 };
      cur.count += 1;
      cur.longestMs = Math.max(cur.longestMs, silent);
      byRestaurant.set(d.restaurantId, cur);
    }
    for (const [restaurantId, r] of byRestaurant) {
      const nearLock = r.longestMs >= OFFLINE_WARN_AFTER_DAYS * DAY_MS;
      await add({
        type: 'DEVICES_OFFLINE',
        severity: nearLock ? 'CRITICAL' : 'WARNING',
        title: `${r.name}: ${r.count} terminal${r.count === 1 ? '' : 's'} offline`,
        body: nearLock ? 'At least one has been silent for days and will lock itself soon.' : `Longest silence ${Math.round(r.longestMs / HOUR_MS)} h.`,
        restaurantId,
        targetType: 'devices',
        link: restaurantLink(restaurantId, 'devices'),
        dedupeKey: `dev-offline:${restaurantId}:${day}`
      });
    }

    // Activation keys about to expire unused.
    const keys = await db.activationKey.findMany({
      where: { status: 'ACTIVE', redeemedAt: null, expiresAt: { gt: now, lte: new Date(now.getTime() + KEY_WARN_DAYS * DAY_MS) }, restaurant: { status: 'ACTIVE' } },
      select: { restaurantId: true, restaurant: { select: { name: true } } }
    });
    const keysBy = new Map<string, { name: string; count: number }>();
    for (const k of keys) {
      const cur = keysBy.get(k.restaurantId) ?? { name: k.restaurant.name, count: 0 };
      cur.count += 1;
      keysBy.set(k.restaurantId, cur);
    }
    for (const [restaurantId, r] of keysBy) {
      await add({
        type: 'KEYS_EXPIRING',
        severity: 'INFO',
        title: `${r.name}: ${r.count} activation key${r.count === 1 ? '' : 's'} expire${r.count === 1 ? 's' : ''} soon`,
        body: `Unused keys that expire within ${KEY_WARN_DAYS} days.`,
        restaurantId,
        targetType: 'activation-keys',
        link: restaurantLink(restaurantId, 'devices'),
        dedupeKey: `keys-exp:${restaurantId}:${day}`
      });
    }

    // Terminals reporting a sync error.
    const failing = await db.device.findMany({
      where: { status: 'ACTIVE', restaurant: { status: 'ACTIVE' }, syncError: { not: null }, lastSeenAt: { gte: new Date(now.getTime() - DAY_MS) } },
      select: { restaurantId: true, restaurant: { select: { name: true } } }
    });
    const failBy = new Map<string, { name: string; count: number }>();
    for (const d of failing) {
      const cur = failBy.get(d.restaurantId) ?? { name: d.restaurant.name, count: 0 };
      cur.count += 1;
      failBy.set(d.restaurantId, cur);
    }
    for (const [restaurantId, r] of failBy) {
      await add({
        type: 'SYNC_FAILING',
        severity: 'WARNING',
        title: `${r.name}: ${r.count} terminal${r.count === 1 ? '' : 's'} failing to sync`,
        restaurantId,
        targetType: 'devices',
        link: restaurantLink(restaurantId, 'devices'),
        dedupeKey: `sync-failing:${restaurantId}:${day}`
      });
    }

    // Restaurants that are suspended (announced once, when first seen suspended).
    const suspended = await db.restaurant.findMany({ where: { status: 'SUSPENDED' }, select: { id: true, name: true, updatedAt: true } });
    for (const r of suspended) {
      await add({
        type: 'RESTAURANT_SUSPENDED',
        severity: 'WARNING',
        title: `${r.name} is suspended`,
        restaurantId: r.id,
        targetType: 'restaurant',
        targetId: r.id,
        link: restaurantLink(r.id, 'overview'),
        dedupeKey: `rest-suspended:${r.id}:${r.updatedAt.toISOString().slice(0, 10)}`
      });
    }

    const purged = await this.purgeOld();
    return { created, total: Object.values(created).reduce((a, b) => a + b, 0), purged: purged.deleted };
  }
}
