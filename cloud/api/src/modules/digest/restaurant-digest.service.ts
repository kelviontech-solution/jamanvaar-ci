import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../notifications/email.service';

const COLLECTED_STATUSES = ['SUCCESS', 'PAID', 'PARTIALLY_REFUNDED', 'REFUND_PENDING', 'REFUNDED'];
const CLOSED_STATUSES = ['DRAFT', 'CANCELLED', 'VOID', 'VOIDED'];

function formatInr(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

/**
 * #15: "Send routine summaries at the owner's preferred time while keeping urgent service
 * problems visible immediately." Urgent problems already are immediate -- QR/Kiosk's own Alerts
 * feed (QrCapabilities.tsx) is live/reactive, never batched; this only adds the other half, a
 * once-daily routine summary, off by default (Restaurant.digestEnabled), sent at the restaurant's
 * own local hour (Restaurant.digestHour + timezone) rather than a fixed platform time. Window is
 * the trailing 24h rather than a strict local-calendar-day boundary (that needs the same
 * timezone-aware SQL dashboardDates/TenantDashboardService uses) -- for a once-a-day digest at a
 * fixed hour the two are the same window in practice, and this avoids duplicating that SQL for a
 * routine summary where exact precision matters far less than it does for Reports.
 */
@Injectable()
export class RestaurantDigestService {
  private readonly logger = new Logger(RestaurantDigestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService
  ) {}

  async sendDueDigests() {
    const restaurants = await this.prisma.runAsPlatform((tx) =>
      tx.restaurant.findMany({
        where: { digestEnabled: true, status: 'ACTIVE', deletedAt: null },
        select: { id: true, name: true, timezone: true, digestHour: true }
      })
    );

    let sent = 0;
    let skipped = 0;
    for (const r of restaurants) {
      try {
        const localHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: r.timezone, hour: 'numeric', hour12: false }).format(new Date()));
        if (localHour !== r.digestHour) {
          skipped++;
          continue;
        }
        const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: r.timezone }).format(new Date());
        const settingKey = `digest.restaurant.${r.id}`;
        const already = await this.prisma.runAsPlatform((tx) => tx.platformSetting.findUnique({ where: { key: settingKey } }));
        if ((already?.value as { date?: string } | undefined)?.date === dateKey) {
          skipped++;
          continue;
        }

        const owner = await this.prisma.runAsTenant(r.id, (tx) => tx.user.findFirst({ where: { restaurantId: r.id, role: 'OWNER', status: 'ACTIVE' }, select: { email: true } }));
        if (!owner?.email) {
          skipped++;
          continue;
        }

        const summary = await this.computeTrailing24h(r.id);
        const ok = await this.email.send(owner.email, `${r.name} — Daily Summary`, this.renderDigest(r.name, summary));

        await this.prisma.runAsPlatform((tx) =>
          tx.platformSetting.upsert({
            where: { key: settingKey },
            update: { value: { date: dateKey } },
            create: { key: settingKey, value: { date: dateKey }, category: 'DIGEST', description: `Last restaurant daily-digest send date for ${r.id}` }
          })
        );
        if (ok) sent++;
        else this.logger.warn(`Daily digest computed for ${r.name} (${r.id}) but not emailed (SMTP not configured)`);
      } catch (err) {
        this.logger.error(`Daily digest failed for restaurant ${r.id}: ${err instanceof Error ? err.message : err}`);
        skipped++;
      }
    }
    return { sent, skipped, totalEnabled: restaurants.length };
  }

  private async computeTrailing24h(restaurantId: string) {
    return this.prisma.runAsTenant(restaurantId, async (tx) => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const orders = await tx.syncedOrder.findMany({
        where: { restaurantId, createdAt: { gte: since }, status: { notIn: CLOSED_STATUSES } },
        select: { totalAmount: true, status: true, paymentStatus: true }
      });
      const paid = orders.filter((o) => COLLECTED_STATUSES.includes(o.paymentStatus ?? ''));
      const refunded = orders.filter((o) => ['REFUNDED', 'PARTIALLY_REFUNDED'].includes(o.paymentStatus ?? ''));
      return {
        orders: orders.length,
        paidOrders: paid.length,
        grossPaise: paid.reduce((sum, o) => sum + o.totalAmount, 0),
        refundedOrders: refunded.length
      };
    });
  }

  private renderDigest(restaurantName: string, summary: { orders: number; paidOrders: number; grossPaise: number; refundedOrders: number }): string {
    return `
      <h2>${restaurantName} — Daily Summary</h2>
      <table cellpadding="6" style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">
        <tr><td><strong>Orders (last 24h)</strong></td><td>${summary.orders}</td></tr>
        <tr><td><strong>Paid orders</strong></td><td>${summary.paidOrders}</td></tr>
        <tr><td><strong>Gross collected</strong></td><td>${formatInr(summary.grossPaise)}</td></tr>
        <tr><td><strong>Refunded orders</strong></td><td>${summary.refundedOrders}</td></tr>
      </table>
      <p style="color:#64748b;font-size:12px;">Sent automatically at your chosen daily time. Urgent service problems are never held for this summary — they already appear live in your Admin console. Change this time, or turn it off, under Settings.</p>
    `;
  }
}
