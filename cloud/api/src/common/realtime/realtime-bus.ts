import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { Subject } from 'rxjs';

export type RealtimeKind = 'orders' | 'inventory' | 'menu' | 'command';

export interface RealtimeEvent {
  restaurantId: string;
  /** Null means every device of the restaurant; otherwise that branch plus restaurant-wide (branchless) devices. */
  branchId: string | null;
  /** When set, only this device receives the event. */
  deviceId?: string;
  kind: RealtimeKind;
  seq?: number;
  /** The device that caused the change; it is not woken by its own write. */
  originDeviceId?: string;
}

const CHANNEL = 'jv_realtime';

/** node-postgres cannot read Prisma's `?schema=` URL parameter, so the connection string is rebuilt without Prisma-only options. */
export function pgConnectionString(url: string): string {
  const u = new URL(url);
  for (const key of ['schema', 'connection_limit', 'pool_timeout', 'pgbouncer']) u.searchParams.delete(key);
  return u.toString();
}

/**
 * Fan-out of "something changed" wake-ups. Events carry no business data: they only tell a device to pull by cursor, so
 * losing one (a restart, a dropped connection) can never lose a change. Delivery is in-process for devices connected to
 * this instance, and relayed to every OTHER API instance through PostgreSQL LISTEN/NOTIFY (no Redis): a device connected to
 * instance B is woken by a write handled by instance A. The relay is best-effort by design; devices still pull periodically.
 */
@Injectable()
export class RealtimeBus implements OnModuleInit, OnModuleDestroy {
  readonly events$ = new Subject<RealtimeEvent>();
  /** Restaurant ids whose cached QR resolution must be dropped (raised here and by every other instance). */
  readonly invalidations$ = new Subject<string>();
  private readonly log = new Logger('RealtimeBus');
  private readonly instanceId = randomUUID();
  private client: Client | null = null;
  private closing = false;
  private retry: NodeJS.Timeout | null = null;

  async onModuleInit(): Promise<void> {
    if (process.env.REALTIME_PG_RELAY === 'off' || !process.env.DATABASE_URL) return;
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    this.closing = true;
    if (this.retry) clearTimeout(this.retry);
    const c = this.client;
    this.client = null;
    await c?.end().catch(() => undefined);
  }

  private async connect(): Promise<void> {
    if (this.closing) return;
    const client = new Client({ connectionString: pgConnectionString(process.env.DATABASE_URL as string) });
    client.on('error', (e) => this.lost(client, e));
    client.on('end', () => this.lost(client));
    client.on('notification', (msg) => {
      if (msg.channel !== CHANNEL || !msg.payload) return;
      try {
        const { i, e, inv } = JSON.parse(msg.payload) as { i: string; e?: RealtimeEvent; inv?: string };
        if (i === this.instanceId) return;
        if (typeof inv === 'string') this.invalidations$.next(inv);
        else if (e && typeof e.restaurantId === 'string') this.events$.next(e);
      } catch {
        /* a malformed wake-up is ignored: devices still pull */
      }
    });
    try {
      await client.connect();
      await client.query(`LISTEN ${CHANNEL}`);
      this.client = client;
    } catch (e) {
      this.lost(client, e as Error);
    }
  }

  private lost(client: Client, err?: Error): void {
    if (this.client !== client && this.client !== null) return;
    this.client = null;
    client.end().catch(() => undefined);
    if (this.closing || this.retry) return;
    if (err) this.log.warn(`realtime relay disconnected (${err.message}); local delivery continues, retrying`);
    this.retry = setTimeout(() => { this.retry = null; void this.connect(); }, 2000);
    this.retry.unref?.();
  }

  /** Tells every instance that this restaurant's cached QR state (codes, settings, entitlement) changed. */
  publishInvalidation(restaurantId: string): void {
    this.invalidations$.next(restaurantId);
    this.client?.query('SELECT pg_notify($1, $2)', [CHANNEL, JSON.stringify({ i: this.instanceId, inv: restaurantId })]).catch(() => undefined);
  }

  publish(event: RealtimeEvent): void {
    this.events$.next(event);
    if (!this.client) return;
    const payload = JSON.stringify({ i: this.instanceId, e: event });
    if (Buffer.byteLength(payload) > 7000) return;
    this.client.query('SELECT pg_notify($1, $2)', [CHANNEL, payload]).catch(() => undefined);
  }

  /** Whether `event` may be delivered to a device with these credentials. Scope comes from the authenticated device, never from the client. */
  static isVisibleTo(event: RealtimeEvent, device: { id: string; restaurantId: string; branchId: string | null }): boolean {
    if (event.restaurantId !== device.restaurantId) return false;
    if (event.originDeviceId && event.originDeviceId === device.id) return false;
    if (event.deviceId) return event.deviceId === device.id;
    if (event.branchId && device.branchId && event.branchId !== device.branchId) return false;
    return true;
  }
}
