import { createHash, createHmac } from 'crypto';
import { createServer, Server, IncomingMessage } from 'http';
import { AddressInfo } from 'net';
import { INestApplication } from '@nestjs/common';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createTestApp } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { WhatsAppOutboundWebhookService } from '../src/modules/whatsapp-outbound/whatsapp-outbound-webhook.service';

const SERVICE_SECRET = 'test-jamanvaar-service-secret-for-outbound-webhook-e2e';

interface ReceivedRequest {
  method: string;
  path: string;
  headers: IncomingMessage['headers'];
  rawBody: string;
}

/** Polls until `check()` returns truthy or the timeout elapses — the delivery itself is a
 *  real (if localhost) HTTP round trip inside a fire-and-forget promise `enqueue()` doesn't
 *  await, so the test can't just await enqueue() and assume delivery already happened. */
async function waitUntil<T>(check: () => Promise<T | undefined | null | false>, timeoutMs = 3000, intervalMs = 25): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await check();
    if (result) return result;
    if (Date.now() > deadline) throw new Error('waitUntil: timed out');
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

describe('WhatsAppOutboundWebhookService — kiosk calling INTO product/whatsapp', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let service: WhatsAppOutboundWebhookService;
  let receiver: Server;
  let receiverPort: number;
  let received: ReceivedRequest[] = [];
  let receiverStatusCode = 200;
  const stamp = Date.now();

  beforeAll(async () => {
    receiver = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        received.push({ method: req.method ?? '', path: req.url ?? '', headers: req.headers, rawBody: Buffer.concat(chunks).toString('utf8') });
        res.statusCode = receiverStatusCode;
        res.end(JSON.stringify({ received: true }));
      });
    });
    await new Promise<void>((resolve) => receiver.listen(0, '127.0.0.1', resolve));
    receiverPort = (receiver.address() as AddressInfo).port;

    process.env.JAMANVAAR_SERVICE_SECRET = SERVICE_SECRET;
    process.env.WHATSAPP_CONNECTOR_BASE_URL = `http://127.0.0.1:${receiverPort}`;
    app = await createTestApp();
    prisma = app.get(PrismaService);
    service = app.get(WhatsAppOutboundWebhookService);
  });

  afterEach(() => {
    received = [];
    receiverStatusCode = 200;
  });

  afterAll(async () => {
    // Phase 7 fix: this restaurant row (and, via onDelete: Cascade, every
    // OutboundWebhookDelivery it owns) was never cleaned up here -- every run of this
    // file left one more real, ACTIVE restaurant behind in the shared dev database.
    // Found via snapshotStaleRestaurants() (backups-local.e2e.spec.ts's own BUG-072 test)
    // failing against the real, accumulated orphans, not by inspection.
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } })).catch(() => undefined);
    delete process.env.WHATSAPP_CONNECTOR_BASE_URL;
    await app.close();
    await new Promise<void>((resolve) => receiver.close(() => resolve()));
  });

  const restaurantId = `00000000-0000-4000-8000-${String(stamp).padStart(12, '0')}`;

  it('signs and delivers order.confirmed with the exact HMAC scheme a receiver would verify', async () => {
    await prisma.runAsPlatform((tx) =>
      tx.restaurant.upsert({ where: { id: restaurantId }, create: { id: restaurantId, name: `TEST Outbound Webhook ${stamp}` }, update: {} })
    );

    await service.enqueue(restaurantId, 'order.confirmed', { paymentId: 'pay-1', orderId: 'order-1', publicOrderId: 'WA-1', status: 'NEW' });

    const req = await waitUntil(async () => received[0]);
    expect(req.method).toBe('POST');
    expect(req.path).toBe('/api/v1/webhooks/jamanvaar/order-event');

    const timestamp = req.headers['x-timestamp'] as string;
    const signature = req.headers['x-signature'] as string;
    expect(timestamp).toBeTruthy();
    expect(signature).toMatch(/^[0-9a-f]{64}$/);

    // Recomputes the signature exactly the way a real receiver (ServiceSignatureGuard's
    // mirror image on product/whatsapp's side) must -- proves the wire format is
    // self-consistent with what this service documents it sends.
    const bodyHash = createHash('sha256').update(req.rawBody).digest('hex');
    const expected = createHmac('sha256', SERVICE_SECRET).update(`POST\n/api/v1/webhooks/jamanvaar/order-event\n${timestamp}\n${bodyHash}`).digest('hex');
    expect(signature).toBe(expected);

    const body = JSON.parse(req.rawBody);
    expect(body).toEqual({
      type: 'order.confirmed',
      restaurantId,
      data: { paymentId: 'pay-1', orderId: 'order-1', publicOrderId: 'WA-1', status: 'NEW' }
    });

    // waitUntil's predicate must reject a row still PENDING, not just "any row found" --
    // the row is created synchronously (status PENDING) before enqueue()'s fire-and-forget
    // delivery attempt has actually run; under light load that attempt usually finishes
    // before this poll's first tick, but under the full suite's heavier load the first
    // tick can catch it mid-flight, and a bare "row exists" predicate would return that
    // still-PENDING row immediately instead of waiting for it to actually resolve (found
    // as a real, if rare, flake — not a service bug).
    const row = await waitUntil(async () => {
      const r = await prisma.runAsPlatform((tx) => tx.outboundWebhookDelivery.findFirst({ where: { restaurantId, eventType: 'order.confirmed' }, orderBy: { createdAt: 'desc' } }));
      return r && r.status !== 'PENDING' ? r : null;
    });
    expect(row.status).toBe('DELIVERED');
    expect(row.deliveredAt).not.toBeNull();
    expect(row.attempts).toBe(1);
  });

  it('a non-2xx response leaves the row PENDING with a later nextAttemptAt and an incremented attempt count', async () => {
    receiverStatusCode = 500;
    await service.enqueue(restaurantId, 'order.status', { paymentId: 'pay-2', orderId: 'order-2', publicOrderId: 'WA-2', status: 'PREPARING', previousStatus: 'NEW' });

    const row = await waitUntil(async () => {
      const r = await prisma.runAsPlatform((tx) => tx.outboundWebhookDelivery.findFirst({ where: { restaurantId, eventType: 'order.status' }, orderBy: { createdAt: 'desc' } }));
      return r && r.attempts > 0 ? r : null;
    });
    expect(row.status).toBe('PENDING');
    expect(row.attempts).toBe(1);
    expect(row.lastError).toContain('HTTP 500');
    expect(row.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('retryDue() redelivers a row once its backoff has elapsed, and succeeds once the receiver recovers', async () => {
    receiverStatusCode = 503;
    await service.enqueue(restaurantId, 'order.status', { paymentId: 'pay-3', orderId: 'order-3', publicOrderId: 'WA-3', status: 'READY', previousStatus: 'PREPARING' });
    const afterFirstFailure = await waitUntil(async () => {
      const r = await prisma.runAsPlatform((tx) => tx.outboundWebhookDelivery.findFirst({ where: { restaurantId, eventType: 'order.status', payload: { path: ['paymentId'], equals: 'pay-3' } } }));
      return r && r.attempts > 0 ? r : null;
    });
    expect(afterFirstFailure.status).toBe('PENDING');

    // Force the backoff window closed so retryDue() actually picks this row up now, rather
    // than the test waiting out a real multi-second backoff.
    await prisma.runAsPlatform((tx) => tx.outboundWebhookDelivery.update({ where: { id: afterFirstFailure.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } }));

    receiverStatusCode = 200;
    const result = await service.retryDue();
    expect(result.attempted).toBeGreaterThanOrEqual(1);

    const delivered = await prisma.runAsPlatform((tx) => tx.outboundWebhookDelivery.findUniqueOrThrow({ where: { id: afterFirstFailure.id } }));
    expect(delivered.status).toBe('DELIVERED');
    expect(delivered.attempts).toBe(2);
  });

  it('exhausts to FAILED after repeated failures instead of retrying forever', async () => {
    receiverStatusCode = 500;
    const created = await prisma.runAsPlatform((tx) =>
      tx.outboundWebhookDelivery.create({ data: { restaurantId, eventType: 'order.status', payload: { paymentId: 'pay-4' }, attempts: 7, nextAttemptAt: new Date() } })
    );

    await service.attempt(created.id);

    const row = await prisma.runAsPlatform((tx) => tx.outboundWebhookDelivery.findUniqueOrThrow({ where: { id: created.id } }));
    expect(row.status).toBe('FAILED');
    expect(row.attempts).toBe(8);
  });

  it('does not attempt a row that is not PENDING (e.g. already DELIVERED or FAILED)', async () => {
    const created = await prisma.runAsPlatform((tx) =>
      tx.outboundWebhookDelivery.create({ data: { restaurantId, eventType: 'order.status', payload: { paymentId: 'pay-5' }, status: 'DELIVERED', deliveredAt: new Date() } })
    );
    await service.attempt(created.id);
    expect(received.length).toBe(0);
  });
});
