import { createHash, createHmac } from 'crypto';
import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const MAX_ATTEMPTS = 8;
const BASE_DELAY_MS = 5_000;
const MAX_DELAY_MS = 10 * 60_000;
const FAST_RETRY_INTERVAL_MS = 20_000;
const ORDER_EVENT_PATH = '/api/v1/webhooks/jamanvaar/order-event';

function backoffMs(attempts: number): number {
  return Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempts);
}

export type WhatsAppOutboundEventType = 'order.confirmed' | 'order.status';

/**
 * Phase 5 of the Jamanvaar<->WhatsApp connector: the outbound half of the relationship --
 * this platform calling INTO product/whatsapp (order.confirmed once a WhatsApp order is
 * paid and visible on POS/KDS; order.status on every later status change) -- signed the
 * identical way product/whatsapp already signs ITS calls into kiosk
 * (HMAC-SHA256(secret, METHOD\nPATH\nTIMESTAMP\nSHA256(BODY)), the same shared
 * JAMANVAAR_SERVICE_SECRET, verified by a new equivalent guard on that side -- see
 * jamanvaar_webhooks.py). This is the mirror image of ServiceSignatureGuard, which verifies
 * the other direction.
 *
 * A row (OutboundWebhookDelivery) is written durably BEFORE the first attempt, so "retried
 * on failure, never lost" (the plan's own requirement) holds even across a process crash
 * mid-delivery -- the retry sweep (retryDue) picks up anything still PENDING.
 *
 * Deliberately its own small module (see whatsapp-outbound-webhook.module.ts) rather than
 * living inside whatsapp-channel: both PaymentsModule (fires order.confirmed) and
 * OrderSyncModule (fires order.status) need to inject this, and WhatsAppChannelModule
 * already imports PaymentsModule -- putting this service there would make PaymentsModule
 * need to import WhatsAppChannelModule right back, a circular dependency.
 */
@Injectable()
export class WhatsAppOutboundWebhookService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(WhatsAppOutboundWebhookService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  onApplicationBootstrap() {
    // Off under test, same reasoning JobsService's own scheduler gives -- deterministic
    // test runs, no background timer racing an in-memory app instance being torn down.
    if (this.config.get<string>('NODE_ENV') === 'test') return;
    this.timer = setInterval(() => void this.retryDue(), FAST_RETRY_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Durably records the event, then makes one immediate best-effort delivery attempt --
   *  fire-and-forget, never blocks the caller (a payment webhook handler, an order-sync
   *  push) on an external HTTP call to product/whatsapp. */
  async enqueue(restaurantId: string, eventType: WhatsAppOutboundEventType, payload: Record<string, unknown>): Promise<void> {
    const row = await this.prisma.runAsPlatform((tx) =>
      tx.outboundWebhookDelivery.create({ data: { restaurantId, eventType, payload: payload as unknown as Prisma.InputJsonValue } })
    );
    void this.attempt(row.id).catch((err) =>
      this.logger.warn(`Immediate delivery attempt failed for ${row.id}, will retry: ${err instanceof Error ? err.message : String(err)}`)
    );
  }

  /** One delivery attempt for one row. Safe to call more than once for the same row (e.g.
   *  the immediate attempt and a concurrent retry-sweep tick both reaching it) -- only a
   *  still-PENDING row is ever actually sent, so a race just means one of the two calls
   *  is a harmless no-op. */
  async attempt(id: string): Promise<void> {
    const row = await this.prisma.runAsPlatform((tx) => tx.outboundWebhookDelivery.findUnique({ where: { id } }));
    if (!row || row.status !== 'PENDING') return;

    const baseUrl = this.config.get<string>('WHATSAPP_CONNECTOR_BASE_URL');
    const secret = this.config.get<string>('JAMANVAAR_SERVICE_SECRET');
    if (!baseUrl || !secret) {
      await this.fail(row.id, row.attempts, 'WHATSAPP_CONNECTOR_BASE_URL or JAMANVAAR_SERVICE_SECRET not configured on this server');
      return;
    }

    const rawBody = JSON.stringify({ type: row.eventType, restaurantId: row.restaurantId, data: row.payload });
    const timestamp = String(Date.now());
    const bodyHash = createHash('sha256').update(rawBody).digest('hex');
    const signature = createHmac('sha256', secret).update(`POST\n${ORDER_EVENT_PATH}\n${timestamp}\n${bodyHash}`).digest('hex');

    try {
      const res = await fetch(`${baseUrl}${ORDER_EVENT_PATH}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Signature': signature, 'X-Timestamp': timestamp },
        body: rawBody
      });
      if (res.ok) {
        await this.prisma.runAsPlatform((tx) =>
          tx.outboundWebhookDelivery.update({
            where: { id: row.id },
            data: { status: 'DELIVERED', deliveredAt: new Date(), lastError: null, attempts: { increment: 1 } }
          })
        );
        return;
      }
      const text = await res.text().catch(() => '');
      await this.fail(row.id, row.attempts, `HTTP ${res.status}: ${text.slice(0, 500)}`);
    } catch (err) {
      await this.fail(row.id, row.attempts, err instanceof Error ? err.message : String(err));
    }
  }

  private async fail(id: string, priorAttempts: number, message: string): Promise<void> {
    const attempts = priorAttempts + 1;
    const exhausted = attempts >= MAX_ATTEMPTS;
    await this.prisma.runAsPlatform((tx) =>
      tx.outboundWebhookDelivery.update({
        where: { id },
        data: {
          attempts,
          lastError: message,
          status: exhausted ? 'FAILED' : 'PENDING',
          nextAttemptAt: new Date(Date.now() + backoffMs(attempts))
        }
      })
    );
  }

  /** Every still-PENDING row whose backoff has elapsed. Called by the fast dedicated
   *  interval above (near-real-time retries) AND registered with JobsService's slower
   *  15-minute sweep as a last-resort safety net if the fast interval ever dies (e.g. an
   *  unhandled exception unrefs it) -- idempotent, so running both is harmless. */
  async retryDue(): Promise<{ attempted: number }> {
    const due = await this.prisma.runAsPlatform((tx) =>
      tx.outboundWebhookDelivery.findMany({
        where: { status: 'PENDING', nextAttemptAt: { lte: new Date() } },
        select: { id: true },
        take: 100
      })
    );
    for (const row of due) await this.attempt(row.id);
    return { attempted: due.length };
  }
}
