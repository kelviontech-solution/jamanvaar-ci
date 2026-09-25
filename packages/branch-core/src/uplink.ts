import { BranchCore } from './core';
import { nextAttemptState } from '../../sync/src/sync_protocol';

/** Entity types (menu, staff, tables...) the core mirrors in both directions. */
export const MIRRORED_ENTITY_TYPES = ['MENU_CATEGORY', 'MENU_ITEM', 'COMBO', 'COUPON', 'STAFF_USER', 'DINING_TABLE', 'CUSTOMER', 'SHIFT', 'CASH_MOVEMENT', 'SERVICE_MESSAGE', 'CUSTOMER_FEEDBACK'];

export interface UplinkOptions {
  cloudBase: string;
  /** The core's own device credential (a Restaurant Admin console device). */
  deviceToken: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface UplinkResult {
  reachable: boolean;
  uploaded: number;
  downloaded: number;
  error?: string;
}

/**
 * Keeps the branch and the cloud in step, automatically and without anyone pressing anything: uploads what
 * the branch did while offline (orders, stock movements, menu/staff edits), tells the cloud how each device
 * is doing, downloads what changed elsewhere, and refreshes who is allowed to connect. Everything uploaded is
 * idempotent on its event id, so a repeat after a lost response changes nothing. A failure never loses data:
 * the outbox keeps it and the next tick retries with backoff.
 */
export class CloudUplink {
  private running = false;

  constructor(
    private readonly core: BranchCore,
    private readonly opts: UplinkOptions
  ) {}

  private async request(method: string, path: string, body?: unknown): Promise<{ status: number; data: any }> {
    const f = this.opts.fetchImpl ?? fetch;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.opts.timeoutMs ?? 10_000);
    try {
      const res = await f(`${this.opts.cloudBase}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.opts.deviceToken}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctl.signal
      });
      const data = await res.json().catch(() => null);
      return { status: res.status, data };
    } finally {
      clearTimeout(timer);
    }
  }

  async syncOnce(): Promise<UplinkResult> {
    if (this.running) return { reachable: true, uploaded: 0, downloaded: 0 };
    this.running = true;
    const out: UplinkResult = { reachable: false, uploaded: 0, downloaded: 0 };
    try {
      // 1. Who may connect (and proof the cloud is reachable).
      const roster = await this.request('GET', '/api/v1/devices/me/roster');
      if (roster.status === 401 || roster.status === 403) {
        out.reachable = true;
        out.error = `Cloud refused this Branch Core (${roster.data?.code ?? roster.status})`;
        return out;
      }
      if (roster.status !== 200) throw new Error(`roster ${roster.status}`);
      out.reachable = true;
      this.core.applyRoster(roster.data);

      out.uploaded += await this.uploadOrders();
      out.uploaded += await this.uploadMovements();
      out.uploaded += await this.uploadEntities();
      await this.reportDevices();
      out.downloaded += await this.downloadOrders();
      out.downloaded += await this.downloadMovements();
      out.downloaded += await this.downloadEntities();
      return out;
    } catch (err) {
      out.error = err instanceof Error ? err.message : String(err);
      return out;
    } finally {
      this.running = false;
    }
  }

  private async uploadOrders(): Promise<number> {
    let total = 0;
    for (;;) {
      const due = this.core.dueOutbox('order', 100);
      if (due.length === 0) return total;
      const res = await this.request('POST', '/api/v1/orders/sync', { events: due.map((d) => d.payload) });
      if (res.status !== 201 && res.status !== 200) {
        this.fail(due, `orders ${res.status}`);
        throw new Error(`orders upload ${res.status}`);
      }
      const results: Array<{ status: string; error?: string; externalOrderId: string }> = res.data.results;
      const ok: number[] = [];
      const bad: Array<{ id: number; attempts: number; error: string }> = [];
      due.forEach((d, i) => {
        const r = results[i];
        if (r && r.status === 'ok') ok.push(d.id);
        else bad.push({ id: d.id, attempts: d.attempts, error: r?.error ?? 'not acknowledged' });
      });
      this.core.markOutboxSent(ok);
      bad.forEach((b) => this.fail([b], b.error));
      total += ok.length;
      if (ok.length === 0) return total; // nothing moved: leave the rest for the next tick
    }
  }

  private async uploadMovements(): Promise<number> {
    let total = 0;
    for (;;) {
      const due = this.core.dueOutbox('movement', 200);
      if (due.length === 0) return total;
      const res = await this.request('POST', '/api/v1/inventory/movements', { movements: due.map((d) => d.payload) });
      if (res.status !== 201 && res.status !== 200) {
        this.fail(due, `movements ${res.status}`);
        throw new Error(`movements upload ${res.status}`);
      }
      const results: Array<{ status: string; error?: string }> = res.data.results;
      const ok: number[] = [];
      due.forEach((d, i) => {
        if (results[i]?.status === 'ok') ok.push(d.id);
        else this.fail([d], results[i]?.error ?? 'not acknowledged');
      });
      this.core.markOutboxSent(ok);
      total += ok.length;
      if (ok.length === 0) return total;
    }
  }

  private async uploadEntities(): Promise<number> {
    const dirty = this.core.dirtyEntities();
    let total = 0;
    const byType = new Map<string, typeof dirty>();
    dirty.forEach((d) => byType.set(d.type, [...(byType.get(d.type) ?? []), d]));
    for (const [type, list] of byType) {
      const res = await this.request('POST', `/api/v1/entity-sync/${type}`, { events: list.map((e) => ({ externalId: e.externalId, payload: e.payload })) });
      if (res.status !== 201 && res.status !== 200) throw new Error(`entities ${type} ${res.status}`);
      (res.data.results as Array<{ externalId: string; status: string }>).forEach((r) => {
        if (r.status === 'ok') {
          this.core.clearDirty(type, r.externalId);
          total++;
        }
      });
    }
    return total;
  }

  private async reportDevices(): Promise<void> {
    const devices = this.core.deviceReports();
    if (devices.length === 0) return;
    await this.request('POST', '/api/v1/devices/me/branch-report', { devices });
  }

  // ---- downlink: what happened elsewhere (cloud admin edits, QR orders...) becomes local, exactly once

  private cursor(key: string): string | null {
    return this.core.store.getConfig(key);
  }

  private async downloadOrders(): Promise<number> {
    let total = 0;
    for (let page = 0; page < 20; page++) {
      const after = Number(this.cursor('cloud_cursor_orders') ?? 0);
      const res = await this.request('GET', `/api/v1/orders/sync?afterSeq=${after}`);
      if (res.status !== 200) throw new Error(`orders download ${res.status}`);
      const events = (res.data.orders as any[]).map((o) => ({
        eventId: `cloud:${o.externalOrderId}:${o.syncVersion}`,
        externalOrderId: o.externalOrderId, orderType: o.orderType, status: o.status,
        tableId: o.tableId ?? undefined, tableLabel: o.tableLabel ?? undefined, items: o.items, subtotal: o.subtotal, taxAmount: o.taxAmount,
        discountAmount: o.discountAmount ?? 0, totalAmount: o.totalAmount, notes: o.notes ?? undefined, paymentStatus: o.paymentStatus ?? undefined,
        paymentMethod: o.paymentMethod ?? undefined, meta: o.meta ?? undefined, updatedAt: o.updatedAt
      }));
      if (events.length > 0) {
        const applied = this.core.ingestOrders({ id: 'cloud', type: 'POS_ADMIN', branchId: null }, events, 'cloud');
        // Never move the cursor past something that was not applied: it would be skipped forever.
        const failed = applied.results.find((r) => r.status === 'error');
        if (failed) throw new Error(`could not apply cloud order ${failed.externalOrderId}: ${failed.error}`);
      }
      total += events.length;
      this.core.store.setConfig('cloud_cursor_orders', String(res.data.latestSeq ?? after));
      if (!res.data.hasMore) break;
    }
    return total;
  }

  private async downloadMovements(): Promise<number> {
    let total = 0;
    for (let page = 0; page < 20; page++) {
      const after = Number(this.cursor('cloud_cursor_movements') ?? 0);
      const res = await this.request('GET', `/api/v1/inventory/movements?afterSeq=${after}`);
      if (res.status !== 200) throw new Error(`movements download ${res.status}`);
      const list = (res.data.movements as any[]).map((m) => ({ movementId: m.movementId, itemId: m.itemId, itemName: m.itemName, type: m.type, quantityDelta: m.quantityDelta, unit: m.unit, orderId: m.orderId ?? undefined, reason: m.reason ?? '', occurredAt: typeof m.occurredAt === 'string' ? m.occurredAt : new Date(m.occurredAt).toISOString() }));
      if (list.length > 0) {
        const applied = this.core.pushMovements({ id: 'cloud' }, list, 'cloud');
        const failed = applied.results.find((r) => r.status === 'error');
        if (failed) throw new Error(`could not apply cloud movement ${failed.movementId}: ${failed.error}`);
      }
      total += list.length;
      this.core.store.setConfig('cloud_cursor_movements', String(res.data.latestSeq ?? after));
      if (!res.data.hasMore) break;
    }
    return total;
  }

  private async downloadEntities(): Promise<number> {
    let total = 0;
    for (const type of MIRRORED_ENTITY_TYPES) {
      const key = `cloud_since_${type}`;
      const res = await this.request('GET', `/api/v1/entity-sync/${type}?since=${encodeURIComponent(this.cursor(key) ?? new Date(0).toISOString())}`);
      if (res.status !== 200) continue; // a type the cloud does not serve is skipped, not fatal
      const entities = res.data.entities as Array<{ externalId: string; payload: any; updatedAt: string }>;
      if (entities.length > 0) this.core.pushEntities({ id: 'cloud' }, type, entities.map((e) => ({ externalId: e.externalId, payload: e.payload })), 'cloud');
      total += entities.length;
      const last = entities[entities.length - 1];
      this.core.store.setConfig(key, entities.length >= 500 && last ? last.updatedAt : res.data.serverTime);
    }
    return total;
  }

  private fail(items: Array<{ id: number; attempts: number }>, error: string): void {
    for (const i of items) {
      const next = nextAttemptState({ attemptCount: i.attempts, status: 'FAILED' }, Date.now());
      this.core.markOutboxFailed([i], error, (next.nextAttemptAt ?? Date.now()) - Date.now(), next.status === 'DEAD_LETTER');
    }
  }
}

/**
 * Runs syncOnce on a timer and whenever asked (network restored, queue growing). Retries with the
 * normal backoff while the cloud is unreachable, and drops back to a calm interval when it is healthy.
 */
export class UplinkScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  private failures = 0;

  constructor(
    private readonly uplink: CloudUplink,
    private readonly opts: { healthyMs?: number; onResult?: (r: UplinkResult) => void } = {}
  ) {}

  start(): void {
    this.stopped = false;
    this.schedule(0);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  /** Sync soon (e.g. an order was just accepted). */
  poke(): void {
    if (!this.stopped) this.schedule(200);
  }

  private schedule(ms: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.tick(), ms);
  }

  private async tick(): Promise<void> {
    const r = await this.uplink.syncOnce();
    this.opts.onResult?.(r);
    this.failures = r.reachable && !r.error ? 0 : this.failures + 1;
    if (this.stopped) return;
    const delay = this.failures === 0 ? (this.opts.healthyMs ?? 10_000) : Math.min(60_000, 2_000 * 2 ** Math.min(this.failures, 5));
    this.schedule(delay);
  }
}
