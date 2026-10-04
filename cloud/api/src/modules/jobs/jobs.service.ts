import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ActivationKeysService } from '../activation-keys/activation-keys.service';
import { BackupsService } from '../backups/backups.service';
import { InvoicesService } from '../billing/invoices.service';
import { OfflinePolicyService } from '../offline-policy/offline-policy.service';
import { PlatformNotificationsService } from '../platform-notifications/platform-notifications.service';
import { WhatsAppOutboundWebhookService } from '../whatsapp-outbound/whatsapp-outbound-webhook.service';

export interface JobDefinition {
  name: string;
  description: string;
  run: () => Promise<Record<string, unknown>>;
}

interface JobRecord {
  lastRunAt: string | null;
  lastOk: boolean | null;
  lastResult: Record<string, unknown> | null;
  lastError: string | null;
}

const INTERVAL_MS = 15 * 60 * 1000;

/**
 * The platform's scheduled work (BUG-053/060/074): things that used to happen only when someone
 * pressed a button, or never. Runs in-process on a timer, and can be triggered and inspected from
 * Super Admin. Every job is idempotent, so running twice (two API instances, or a manual run just
 * after a scheduled one) is harmless. Off under test, so runs there are deterministic.
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(JobsService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly records = new Map<string, JobRecord>();
  private readonly extra: JobDefinition[] = [];

  constructor(
    private readonly config: ConfigService,
    private readonly invoices: InvoicesService,
    private readonly keys: ActivationKeysService,
    private readonly offline: OfflinePolicyService,
    private readonly backups: BackupsService,
    private readonly notifications: PlatformNotificationsService,
    private readonly whatsappOutbound: WhatsAppOutboundWebhookService
  ) {}

  get schedulerEnabled(): boolean {
    return this.config.get<string>('NODE_ENV') !== 'test' && this.config.get<string>('JOBS_DISABLED') !== 'true';
  }

  /** Other modules add their own jobs here (backups) without this module depending on them. */
  register(job: JobDefinition) {
    if (!this.extra.some((j) => j.name === job.name)) this.extra.push(job);
  }

  private get jobs(): JobDefinition[] {
    return [
      { name: 'renewals', description: 'Issue renewal invoices for subscriptions ending within 7 days', run: () => this.invoices.checkAndGenerateRenewals() as unknown as Promise<Record<string, unknown>> },
      { name: 'overdue-invoices', description: 'Mark unpaid invoices past their due date as PAST_DUE', run: () => this.invoices.markOverdueInvoices() },
      { name: 'expire-activation-keys', description: 'Expire unredeemed activation keys past their expiry', run: () => this.keys.expireDueKeys() },
      { name: 'expire-offline-extensions', description: 'Expire emergency offline extensions past their end date', run: () => this.offline.expireDueExtensions() },
      { name: 'backup-retention', description: 'Delete backups past their retention period', run: () => this.backups.applyRetention() },
      { name: 'scheduled-backups', description: 'Snapshot every active restaurant without a backup in the last 24 hours', run: () => this.backups.snapshotStaleRestaurants() as unknown as Promise<Record<string, unknown>> },
      { name: 'notifications', description: 'Announce what needs attention (expiring subscriptions, failed backups, overdue invoices, offline terminals…) to the team, once each', run: () => this.notifications.scan() as unknown as Promise<Record<string, unknown>> },
      // Last-resort safety net -- the fast 20s interval inside WhatsAppOutboundWebhookService
      // itself handles near-real-time retries; this only matters if that interval ever dies.
      { name: 'whatsapp-outbound-webhook-retry', description: 'Retry any WhatsApp connector outbound webhook deliveries still pending after backoff', run: () => this.whatsappOutbound.retryDue() },
      ...this.extra
    ];
  }

  onApplicationBootstrap() {
    if (!this.schedulerEnabled) return;
    this.timer = setInterval(() => void this.runAll('schedule'), INTERVAL_MS);
    this.timer.unref();
    // Catch up shortly after start rather than waiting a whole interval.
    setTimeout(() => void this.runAll('startup'), 30_000).unref();
    this.logger.log(`Scheduler on: ${this.jobs.length} jobs every ${INTERVAL_MS / 60000} minutes`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async runAll(trigger: 'schedule' | 'startup' | 'manual' = 'manual') {
    if (this.running) return { skipped: true, results: [] as Array<{ name: string; ok: boolean; result?: unknown; error?: string }> };
    this.running = true;
    try {
      const results: Array<{ name: string; ok: boolean; result?: Record<string, unknown>; error?: string }> = [];
      for (const job of this.jobs) {
        try {
          const result = await job.run();
          this.records.set(job.name, { lastRunAt: new Date().toISOString(), lastOk: true, lastResult: result, lastError: null });
          results.push({ name: job.name, ok: true, result });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.error(`Job ${job.name} failed (${trigger}): ${message}`);
          this.records.set(job.name, { lastRunAt: new Date().toISOString(), lastOk: false, lastResult: null, lastError: message });
          results.push({ name: job.name, ok: false, error: message });
        }
      }
      return { skipped: false, results };
    } finally {
      this.running = false;
    }
  }

  status() {
    return {
      schedulerEnabled: this.schedulerEnabled,
      intervalMinutes: INTERVAL_MS / 60000,
      jobs: this.jobs.map((j) => ({ name: j.name, description: j.description, ...(this.records.get(j.name) ?? { lastRunAt: null, lastOk: null, lastResult: null, lastError: null }) }))
    };
  }
}
