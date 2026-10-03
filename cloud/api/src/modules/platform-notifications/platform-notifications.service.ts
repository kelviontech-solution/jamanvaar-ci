import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OFFLINE_WARN_AFTER_DAYS } from '../../common/device-health';
import { pageOf, parsePaging } from '../../common/paging';
import { PrismaService } from '../../prisma/prisma.service';
import { type Area, type PlatformRoleName, permissionsForRole } from '../../common/rbac/access';

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

// B2-052 item 5: a team-wide notification (backup failed, terminals offline, keys expiring…)
// was counted for every platform user regardless of role, so e.g. Finance Admin (no
// devices/ops access at all) saw an unread count made up mostly of notifications about pages
// it gets a 403 on if it opens them. Same class of bug as B2-051/B2-053, same fix shape: gate
// by the role's own area permissions, reusing the one shared table instead of a second one
// that could drift from it. A notification addressed to one specific person (userId set) is
// always visible to them regardless of area — it was deliberately sent to that person.
const NOTIFICATION_TYPE_AREA: Record<string, Area> = {
  SUBSCRIPTION_EXPIRING: 'subscriptions',
  BACKUP_FAILED: 'ops',
  INVOICE_OVERDUE: 'billing',
  DEVICES_OFFLINE: 'devices',
  KEYS_EXPIRING: 'devices',
  SYNC_FAILING: 'devices',
  RESTAURANT_SUSPENDED: 'restaurants',
  // Phase 7 of the Jamanvaar WhatsApp connector -- see notifyWhatsAppConnectionLocked below.
  WHATSAPP_CONNECTION_LOCKED: 'ops'
};

/** Team-wide notification types this role CANNOT even open the linked page for — an explicit
 *  deny-list, not an allow-list. That matters: a type with no entry in the map above (a
 *  future notification type nobody has classified yet, e.g. TICKET_CREATED) must stay visible
 *  to everyone by default. An allow-list would silently hide every unclassified type from any
 *  role that isn't granted literally every area — caught by restaurant-tickets.e2e.spec.ts,
 *  which expects a support-ticket notification to reach a role this map never mentions. */
function deniedTeamTypesFor(role: PlatformRoleName | null | undefined): string[] {
  const allTypes = Object.keys(NOTIFICATION_TYPE_AREA);
  if (!role) return allTypes;
  const perms = permissionsForRole(role);
  return allTypes.filter((t) => !perms[NOTIFICATION_TYPE_AREA[t]]);
}

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

  /**
   * Phase 7 of the Jamanvaar WhatsApp connector (docs/integrations/
   * JAMANVAAR_WHATSAPP_CONNECTOR_IMPLEMENTATION_PLAN.md) -- "alerting on invalid/expired
   * connections." Called from WhatsAppChannelService.requireEntitled() the moment a real,
   * customer-facing channel call (menu/quote/checkout/order-status) is refused because a
   * restaurant that HAS a live, CONNECTED WhatsAppChannelConnection just lost its
   * WHATSAPP_ORDERING entitlement -- a plan downgrade, an expired subscription, or a
   * manual override, not a restaurant that was never connected in the first place (that's
   * just an unconfigured integration, not an alert-worthy regression).
   *
   * Unlike every notification in scanAndNotify() below, this isn't found by a periodic
   * scan -- it's raised inline, at the exact moment a real customer's order would
   * otherwise have silently failed, so the team can reach out before the restaurant
   * notices lost orders on its own. Deduped to once per restaurant per day so a customer
   * repeatedly hitting a locked restaurant's menu can't spam the team with the same alert
   * on every request.
   */
  async notifyWhatsAppConnectionLocked(restaurantId: string, reason: string): Promise<void> {
    const restaurant = await this.prisma.platformDb.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true } });
    if (!restaurant) return; // deleted mid-request -- nothing left to alert anyone about
    await this.notify({
      type: 'WHATSAPP_CONNECTION_LOCKED',
      severity: 'WARNING',
      title: `${restaurant.name}: WhatsApp orders are being blocked`,
      body: `A customer tried to use the WhatsApp channel, but it's locked (${reason}). The restaurant is still connected -- re-enable the entitlement to let orders through again.`,
      restaurantId,
      targetType: 'whatsapp-channel',
      link: `/restaurants/${restaurantId}?tab=applications`,
      dedupeKey: `whatsapp-locked:${restaurantId}:${isoDay()}`
    });
  }

  /** What one person is allowed to see: team-wide notifications whose area their role can at
   *  least read, plus anything addressed to them personally (always visible — it was sent to
   *  that exact person on purpose, not broadcast). */
  private audience(userId: string, role: PlatformRoleName | null | undefined): Prisma.PlatformNotificationWhereInput {
    const denied = deniedTeamTypesFor(role);
    const teamWide: Prisma.PlatformNotificationWhereInput = denied.length === 0 ? { userId: null } : { userId: null, type: { notIn: denied } };
    return { OR: [teamWide, { userId }] };
  }

  async list(userId: string, role: PlatformRoleName | null | undefined, filters: NotificationFilters) {
    const paging = parsePaging(filters);
    const where: Prisma.PlatformNotificationWhereInput = {
      AND: [
        this.audience(userId, role),
        filters.severity ? { severity: filters.severity } : {},
        filters.type ? { type: filters.type } : {},
        filters.restaurantId ? { restaurantId: filters.restaurantId } : {},
        filters.unread === 'true' ? { reads: { none: { userId } } } : {}
      ]
    };
    const scope: Prisma.PlatformNotificationWhereInput = { AND: [this.audience(userId, role), filters.restaurantId ? { restaurantId: filters.restaurantId } : {}] };

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

  async unreadCount(userId: string, role: PlatformRoleName | null | undefined) {
    const db = this.prisma.platformDb;
    const where = { AND: [this.audience(userId, role), { reads: { none: { userId } } }] };
    const [count, critical] = await Promise.all([
      db.platformNotification.count({ where }),
      db.platformNotification.count({ where: { AND: [where, { severity: 'CRITICAL' }] } })
    ]);
    return { count, critical };
  }

  async markRead(userId: string, role: PlatformRoleName | null | undefined, id: string) {
    const found = await this.prisma.platformDb.platformNotification.findFirst({ where: { AND: [{ id }, this.audience(userId, role)] }, select: { id: true } });
    if (!found) throw new NotFoundException('Notification not found');
    await this.prisma.platformDb.platformNotificationRead.upsert({
      where: { notificationId_userId: { notificationId: id, userId } },
      create: { notificationId: id, userId },
      update: {}
    });
    return { ok: true };
  }

  async markAllRead(userId: string, role: PlatformRoleName | null | undefined, restaurantId?: string) {
    const unread = await this.prisma.platformDb.platformNotification.findMany({
      where: { AND: [this.audience(userId, role), restaurantId ? { restaurantId } : {}, { reads: { none: { userId } } }] },
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
