import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { EmailService } from '../notifications/email.service';

const DIGEST_SETTING_KEY = 'digest.lastSentAt';
const DIGEST_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

function formatInr(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

/**
 * Super Admin feature request: scheduled weekly digest email. Reuses DashboardService.getSummary()
 * -- the same numbers the Executive Dashboard already computes -- instead of a second aggregation,
 * and EmailService's existing graceful no-op when SMTP isn't configured. Runs inside the 15-minute
 * job tick (jobs.service.ts) but only actually sends once the configured interval has elapsed,
 * tracked via a PlatformSetting row rather than a dedicated table.
 */
@Injectable()
export class DigestService {
  private readonly logger = new Logger(DigestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboard: DashboardService,
    private readonly email: EmailService
  ) {}

  async sendIfDue() {
    const setting = await this.prisma.runAsPlatform((tx) => tx.platformSetting.findUnique({ where: { key: DIGEST_SETTING_KEY } }));
    const lastSentAt = setting ? new Date((setting.value as { at: string }).at) : null;
    if (lastSentAt && Date.now() - lastSentAt.getTime() < DIGEST_INTERVAL_MS) {
      return { sent: false, reason: 'not due yet', nextDueAt: new Date(lastSentAt.getTime() + DIGEST_INTERVAL_MS).toISOString() };
    }

    const summary = await this.dashboard.getSummary();
    const html = this.renderDigest(summary);

    const recipients = await this.prisma.runAsPlatform((tx) =>
      tx.platformUser.findMany({
        where: { status: 'ACTIVE', role: { in: ['PLATFORM_OWNER', 'SUPER_ADMIN'] } },
        select: { email: true }
      })
    );

    let delivered = 0;
    for (const r of recipients) {
      const ok = await this.email.send(r.email, 'JAMANVAAR Platform — Weekly Digest', html);
      if (ok) delivered++;
    }

    await this.prisma.runAsPlatform((tx) =>
      tx.platformSetting.upsert({
        where: { key: DIGEST_SETTING_KEY },
        update: { value: { at: new Date().toISOString() } },
        create: { key: DIGEST_SETTING_KEY, value: { at: new Date().toISOString() }, category: 'DIGEST', description: 'Last time the weekly platform digest email went out' }
      })
    );

    if (!this.email.configured) {
      this.logger.warn(`Weekly digest computed but not emailed (SMTP not configured) -- would have gone to ${recipients.length} recipient(s)`);
    }
    return { sent: true, recipients: recipients.length, delivered };
  }

  private renderDigest(summary: Awaited<ReturnType<DashboardService['getSummary']>>): string {
    return `
      <h2>JAMANVAAR Platform — Weekly Digest</h2>
      <table cellpadding="6" style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">
        <tr><td><strong>Total restaurants</strong></td><td>${summary.totalRestaurants}</td></tr>
        <tr><td><strong>New this month</strong></td><td>${summary.newRestaurantsThisMonth}</td></tr>
        <tr><td><strong>MRR</strong></td><td>${formatInr(summary.mrr)}</td></tr>
        <tr><td><strong>Overdue invoices</strong></td><td>${summary.overdueInvoices}</td></tr>
        <tr><td><strong>Pending sync conflicts</strong></td><td>${summary.operations.syncHealth.pendingConflicts}</td></tr>
        <tr><td><strong>Failed backups</strong></td><td>${summary.operations.backupHealth.failedBackups}</td></tr>
      </table>
      <p style="color:#64748b;font-size:12px;">Sent automatically, once a week. See the Executive Dashboard in Super Admin for live numbers.</p>
    `;
  }
}
