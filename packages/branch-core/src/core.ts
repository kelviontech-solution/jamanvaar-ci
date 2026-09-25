import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { BranchStore } from './store';
import { mergeOrderItems, paymentViolation } from './rules';

export class CoreError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly conflict?: { entityType: string; entityId: string; reason: string; local: unknown; cloud: unknown; deviceId: string }
  ) {
    super(message);
  }
}

export interface CoreConfig {
  restaurantId: string;
  branchId: string;
  branchCode: string;
  timezone?: string;
  /** How long the core keeps authorizing devices without hearing from the cloud (matches the terminals' own offline limit). */
  offlineGraceDays?: number;
  now?: () => number;
}

export interface AuthedDevice {
  id: string;
  type: string;
  branchId: string | null;
  restaurantId: string;
  name: string | null;
  isLocked: boolean;
  lockReason: string | null;
}

export interface RealtimeEvent {
  branchId: string | null;
  deviceId?: string;
  kind: 'orders' | 'inventory' | 'menu' | 'command' | 'entities';
  seq?: number;
  originDeviceId?: string;
}

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

// ---- Order event contract (identical to the cloud's, so the same client payload works against either) ----
const itemSchema = z.object({
  externalItemId: z.string().min(1),
  menuItemId: z.string().max(128).optional(),
  name: z.string().min(1),
  quantity: z.number().int().min(1).max(999),
  unitPrice: z.number().int().min(0),
  modifiers: z.array(z.string()).default([]),
  modifierDetails: z.array(z.object({ optionName: z.string(), priceDelta: z.number().int() })).optional(),
  kitchenStatus: z.string().optional(),
  originDeviceId: z.string().optional(),
  kitchenStation: z.string().max(64).optional(),
  specialInstructions: z.string().max(500).optional(),
  lineTotal: z.number().int().min(0)
});
const orderEventSchema = z.object({
  eventId: z.string().min(1).max(128).optional(),
  traceId: z.string().min(1).max(128).optional(),
  externalOrderId: z.string().min(1).max(64),
  orderType: z.string().min(1).max(32),
  status: z.string().min(1).max(32),
  tableId: z.string().optional(),
  tableLabel: z.string().optional(),
  items: z.array(itemSchema),
  subtotal: z.number().int(),
  taxAmount: z.number().int(),
  discountAmount: z.number().int().default(0),
  totalAmount: z.number().int(),
  notes: z.string().optional(),
  paymentStatus: z.string().max(32).optional(),
  paymentMethod: z.string().max(32).optional(),
  meta: z.record(z.unknown()).optional(),
  updatedAt: z.string().min(1)
});
type OrderEvent = z.infer<typeof orderEventSchema>;

const movementSchema = z.object({
  movementId: z.string().min(1).max(128),
  itemId: z.string().min(1).max(128),
  itemName: z.string().min(1).max(200),
  type: z.string().min(1).max(32),
  quantityDelta: z.number().finite(),
  unit: z.string().min(1).max(32),
  orderId: z.string().max(128).optional(),
  reason: z.string().max(500).default(''),
  occurredAt: z.string()
});

export interface OrderRow {
  externalOrderId: string;
  orderType: string;
  status: string;
  tableId: string | null;
  tableLabel: string | null;
  items: unknown[];
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  notes: string | null;
  paymentStatus: string | null;
  paymentMethod: string | null;
  meta: Record<string, unknown> | null;
  deviceId: string | null;
  syncVersion: number;
  seq: number;
  updatedAt: string;
}

const REDELIVER_AFTER_MS = 2 * 60 * 1000;
const MAX_REDELIVERIES = 3;
const FLEET_COMMANDS = new Set(['REQUEST_SYNC', 'REQUEST_HEALTH', 'REQUEST_DIAGNOSTICS', 'RESTART_APP', 'CLEAR_CACHE', 'LOCK', 'UNLOCK']);

export class BranchCore {
  readonly listeners = new Set<(e: RealtimeEvent) => void>();
  private readonly now: () => number;

  constructor(
    readonly store: BranchStore,
    readonly cfg: CoreConfig
  ) {
    this.now = cfg.now ?? Date.now;
  }

  publish(event: RealtimeEvent): void {
    this.listeners.forEach((l) => l(event));
  }

  // ------------------------------------------------------------------ roster & authorization

  /** Replaces the local view of who may connect with the cloud's latest roster. */
  applyRoster(roster: {
    restaurant: { id: string; name: string; status: string };
    branches: Array<{ id: string; name: string; code: string; timezone: string; status: string }>;
    subscription: { active: boolean; expiresAt: string | null; enabledApps: string[] };
    devices: Array<{ id: string; type: string; name: string | null; branchId: string | null; status: string; isLocked: boolean; tokenHash: string | null; appEnabled: boolean }>;
  }): void {
    const now = this.now();
    this.store.transaction(() => {
      const seen = new Set<string>();
      for (const d of roster.devices) {
        seen.add(d.id);
        this.store.run(
          `INSERT INTO devices (id, type, name, branch_id, status, is_locked, token_hash, app_enabled, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET type = excluded.type, name = excluded.name, branch_id = excluded.branch_id, status = excluded.status,
             is_locked = excluded.is_locked, token_hash = excluded.token_hash, app_enabled = excluded.app_enabled, updated_at = excluded.updated_at`,
          d.id, d.type, d.name, d.branchId, d.status, d.isLocked ? 1 : 0, d.tokenHash, d.appEnabled ? 1 : 0, now
        );
      }
      // A device the cloud no longer lists has been removed: it must stop being trusted.
      for (const row of this.store.all<{ id: string }>('SELECT id FROM devices')) {
        if (!seen.has(row.id)) this.store.run("UPDATE devices SET status = 'REVOKED', updated_at = ? WHERE id = ?", now, row.id);
      }
      this.store.setConfig('restaurant', JSON.stringify(roster.restaurant));
      this.store.setConfig('branches', JSON.stringify(roster.branches));
      this.store.setConfig('subscription', JSON.stringify(roster.subscription));
      this.store.setConfig('last_cloud_contact', String(now));
    });
  }

  noteCloudContact(): void {
    this.store.setConfig('last_cloud_contact', String(this.now()));
  }

  lastCloudContact(): number | null {
    const v = this.store.getConfig('last_cloud_contact');
    return v ? Number(v) : null;
  }

  /** Who is calling? Enforces credentials, branch and restaurant isolation, and the cached entitlements. */
  authenticate(token: string | null, opts: { allowLocked?: boolean } = {}): AuthedDevice {
    if (!token) throw new CoreError(401, 'INVALID_DEVICE_CREDENTIAL', 'Missing device credential');
    const row = this.store.get<Record<string, any>>('SELECT * FROM devices WHERE token_hash = ?', hash(token));
    if (!row) throw new CoreError(401, 'INVALID_DEVICE_CREDENTIAL', 'Invalid device credential');
    if (row.status === 'REVOKED') throw new CoreError(401, 'DEVICE_REVOKED', 'This device has been revoked.');
    if (row.status !== 'ACTIVE') throw new CoreError(401, 'INVALID_DEVICE_CREDENTIAL', 'Invalid or inactive device credential');

    const restaurant = JSON.parse(this.store.getConfig('restaurant') ?? 'null') as { status: string } | null;
    const sub = JSON.parse(this.store.getConfig('subscription') ?? 'null') as { active: boolean } | null;
    const contact = this.lastCloudContact();
    if (!restaurant || !sub || contact === null) {
      throw new CoreError(403, 'BRANCH_CORE_NOT_SYNCED', 'This Branch Core has not yet downloaded its device list from the cloud.');
    }
    if (restaurant.status === 'SUSPENDED') throw new CoreError(403, 'RESTAURANT_SUSPENDED', 'This restaurant account is suspended.');
    if (restaurant.status !== 'ACTIVE') throw new CoreError(403, 'RESTAURANT_INACTIVE', 'This restaurant account is no longer active.');
    if (!sub.active) throw new CoreError(403, 'SUBSCRIPTION_INACTIVE', 'This restaurant has no active subscription.');
    const graceMs = (this.cfg.offlineGraceDays ?? 7) * 86_400_000;
    if (this.now() - contact > graceMs) {
      throw new CoreError(403, 'OFFLINE_LIMIT', 'This Branch Core has been offline from the cloud for too long. Reconnect to the internet.');
    }
    if (!row.app_enabled) throw new CoreError(403, 'APP_DISABLED', `${row.type} is not enabled for this restaurant.`);
    if (row.branch_id && row.branch_id !== this.cfg.branchId) throw new CoreError(403, 'WRONG_BRANCH', 'This device belongs to another branch.');
    if (row.is_locked && !opts.allowLocked) throw new CoreError(403, 'DEVICE_LOCKED', row.lock_reason ?? 'This device is locked.');

    return { id: row.id, type: row.type, branchId: row.branch_id, restaurantId: this.cfg.restaurantId, name: row.name, isLocked: !!row.is_locked, lockReason: row.lock_reason };
  }

  // ------------------------------------------------------------------ orders

  private orderFromRow(r: Record<string, any>): OrderRow {
    return {
      externalOrderId: r.external_order_id, orderType: r.order_type, status: r.status, tableId: r.table_id, tableLabel: r.table_label,
      items: JSON.parse(r.items), subtotal: r.subtotal, taxAmount: r.tax_amount, discountAmount: r.discount_amount, totalAmount: r.total_amount,
      notes: r.notes, paymentStatus: r.payment_status, paymentMethod: r.payment_method, meta: r.meta ? JSON.parse(r.meta) : null,
      deviceId: r.device_id, syncVersion: r.sync_version, seq: r.seq, updatedAt: new Date(r.updated_at).toISOString()
    };
  }

  /**
   * Applies order events exactly once. `origin` 'device' events are also queued for the cloud; 'cloud'
   * events (changes made elsewhere and pulled down) are not sent back.
   */
  ingestOrders(device: { id: string; type: string; branchId?: string | null }, rawEvents: unknown[], origin: 'device' | 'cloud' = 'device') {
    const results: Array<{ externalOrderId: string; status: 'ok' | 'error'; syncVersion?: number; duplicate?: boolean; error?: string }> = [];
    let latestSeq: number | undefined;
    const now = this.now();

    this.store.transaction(() => {
      for (const raw of rawEvents) {
        const parsed = orderEventSchema.safeParse(raw);
        if (!parsed.success) {
          const id = raw && typeof raw === 'object' && typeof (raw as { externalOrderId?: unknown }).externalOrderId === 'string' ? (raw as { externalOrderId: string }).externalOrderId : 'unknown';
          const problem = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ').slice(0, 500);
          this.store.run('INSERT INTO sync_log (entity_id, status, error, device_id, at) VALUES (?, ?, ?, ?, ?)', id, 'FAILED', `Invalid order payload: ${problem}`, device.id, now);
          results.push({ externalOrderId: id, status: 'error', error: `Invalid order payload: ${problem}` });
          continue;
        }
        const evt: OrderEvent = parsed.data;
        const attempt = this.store.attempt(() => this.applyOrderEvent(device, evt, origin, now));
        if (attempt.ok) {
          const r = attempt.value;
          if (r.seq !== undefined) latestSeq = r.seq;
          results.push(r.result);
        } else {
          const message = attempt.error instanceof CoreError ? `${attempt.error.code}: ${attempt.error.message}` : attempt.error.message;
          const c = attempt.error instanceof CoreError ? attempt.error.conflict : undefined;
          if (c) {
            this.store.run('INSERT INTO conflicts (entity_type, entity_id, reason, local_version, cloud_version, device_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', c.entityType, c.entityId, c.reason, JSON.stringify(c.local), JSON.stringify(c.cloud), c.deviceId, now);
          }
          this.store.run('INSERT INTO sync_log (trace_id, event_id, entity_id, status, error, device_id, at) VALUES (?, ?, ?, ?, ?, ?, ?)', evt.traceId ?? evt.externalOrderId, evt.eventId ?? null, evt.externalOrderId, 'FAILED', message, device.id, now);
          results.push({ externalOrderId: evt.externalOrderId, status: 'error', error: message });
        }
      }
    });

    if (latestSeq !== undefined) this.publish({ branchId: null, kind: 'orders', seq: latestSeq, originDeviceId: origin === 'device' ? device.id : undefined });
    return { results, serverTime: new Date(now).toISOString() };
  }

  private applyOrderEvent(device: { id: string; type: string }, evt: OrderEvent, origin: 'device' | 'cloud', now: number) {
    if (evt.eventId) {
      const prior = this.store.get<{ result: string }>('SELECT result FROM processed_events WHERE event_id = ?', evt.eventId);
      if (prior) {
        const p = JSON.parse(prior.result) as { syncVersion?: number };
        return { result: { externalOrderId: evt.externalOrderId, status: 'ok' as const, syncVersion: p.syncVersion, duplicate: true }, seq: undefined };
      }
    }

    const existingRow = this.store.get<Record<string, any>>('SELECT * FROM orders WHERE external_order_id = ?', evt.externalOrderId);
    const existing = existingRow ? this.orderFromRow(existingRow) : undefined;

    if (existing) {
      const violation = paymentViolation(existing, { paymentStatus: evt.paymentStatus, meta: evt.meta }, device);
      if (violation) {
        // The refusal rolls this event back, so the conflict is recorded by the caller afterwards.
        throw new CoreError(409, violation.code, violation.message, {
          entityType: 'ORDER', entityId: evt.externalOrderId,
          reason: `${violation.code}: ${device.type} device sent paymentStatus ${evt.paymentStatus} on an order already ${existing.paymentStatus}`,
          local: evt, cloud: { paymentStatus: existing.paymentStatus, status: existing.status, meta: existing.meta }, deviceId: device.id
        });
      }
    }

    const merge = mergeOrderItems((existing?.items as never[] | undefined) ?? undefined, evt.items as never[], device.id);
    const prior = existing?.meta ?? {};
    const incoming = evt.meta ?? {};
    const meta = existing || evt.meta || merge.foreignItemsKept ? { ...prior, ...incoming, ...(merge.foreignItemsKept ? { needsTotalsReview: true } : {}) } : null;

    const next = {
      orderType: evt.orderType, status: evt.status, tableId: evt.tableId ?? existing?.tableId ?? null, tableLabel: evt.tableLabel ?? existing?.tableLabel ?? null,
      items: merge.items, subtotal: evt.subtotal, taxAmount: evt.taxAmount, discountAmount: evt.discountAmount, totalAmount: evt.totalAmount,
      notes: evt.notes ?? existing?.notes ?? null, paymentStatus: evt.paymentStatus ?? existing?.paymentStatus ?? null,
      paymentMethod: evt.paymentMethod ?? existing?.paymentMethod ?? null, meta
    };
    const unchanged =
      existing &&
      JSON.stringify([existing.orderType, existing.status, existing.tableId, existing.tableLabel, existing.items, existing.subtotal, existing.taxAmount, existing.discountAmount, existing.totalAmount, existing.notes, existing.paymentStatus, existing.paymentMethod, existing.meta]) ===
        JSON.stringify([next.orderType, next.status, next.tableId, next.tableLabel, next.items, next.subtotal, next.taxAmount, next.discountAmount, next.totalAmount, next.notes, next.paymentStatus, next.paymentMethod, next.meta]);

    let seq: number | undefined;
    let syncVersion = existing?.syncVersion ?? 1;
    if (!unchanged) {
      seq = this.store.nextSeq();
      syncVersion = (existing?.syncVersion ?? 0) + 1;
      this.store.run(
        `INSERT INTO orders (external_order_id, order_type, status, table_id, table_label, items, subtotal, tax_amount, discount_amount, total_amount, notes, payment_status, payment_method, meta, device_id, sync_version, seq, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(external_order_id) DO UPDATE SET order_type = excluded.order_type, status = excluded.status, table_id = excluded.table_id, table_label = excluded.table_label,
           items = excluded.items, subtotal = excluded.subtotal, tax_amount = excluded.tax_amount, discount_amount = excluded.discount_amount, total_amount = excluded.total_amount,
           notes = excluded.notes, payment_status = excluded.payment_status, payment_method = excluded.payment_method, meta = excluded.meta, device_id = excluded.device_id,
           sync_version = excluded.sync_version, seq = excluded.seq, updated_at = excluded.updated_at`,
        evt.externalOrderId, next.orderType, next.status, next.tableId, next.tableLabel, JSON.stringify(next.items), next.subtotal, next.taxAmount, next.discountAmount, next.totalAmount,
        next.notes, next.paymentStatus, next.paymentMethod, next.meta ? JSON.stringify(next.meta) : null, device.id, syncVersion, seq, existing ? Date.parse(existing.updatedAt) : now, now
      );
    }

    if (origin === 'device') {
      this.store.run(
        "INSERT OR IGNORE INTO cloud_outbox (kind, dedupe_key, payload, created_at) VALUES ('order', ?, ?, ?)",
        evt.eventId ?? `order:${evt.externalOrderId}:${evt.updatedAt}`, JSON.stringify(evt), now
      );
    }
    const result = { externalOrderId: evt.externalOrderId, status: 'ok' as const, syncVersion };
    if (evt.eventId) this.store.run('INSERT INTO processed_events (event_id, result, created_at) VALUES (?, ?, ?)', evt.eventId, JSON.stringify({ syncVersion, seq }), now);
    this.store.run('INSERT INTO sync_log (trace_id, event_id, entity_id, status, device_id, at) VALUES (?, ?, ?, ?, ?, ?)', evt.traceId ?? evt.externalOrderId, evt.eventId ?? null, evt.externalOrderId, 'SUCCESS', device.id, now);
    return { result, seq };
  }

  /** Orders changed after the cursor, in sequence order. This is the cursor KDS and every device recovers from. */
  pullOrders(afterSeq: number) {
    const rows = this.store.all<Record<string, any>>('SELECT * FROM orders WHERE seq > ? ORDER BY seq ASC LIMIT 501', afterSeq);
    const hasMore = rows.length > 500;
    const orders = (hasMore ? rows.slice(0, 500) : rows).map((r) => this.orderFromRow(r));
    return { orders, latestSeq: orders.length ? orders[orders.length - 1].seq : afterSeq, hasMore, serverTime: new Date(this.now()).toISOString() };
  }

  // ------------------------------------------------------------------ inventory ledger

  pushMovements(device: { id: string }, raw: unknown[], origin: 'device' | 'cloud' = 'device') {
    const results: Array<{ movementId: string; status: 'ok' | 'error'; duplicate?: boolean; seq?: number; error?: string }> = [];
    let any = false;
    const now = this.now();
    this.store.transaction(() => {
      for (const r of raw) {
        const parsed = movementSchema.safeParse(r);
        if (!parsed.success) {
          const id = r && typeof r === 'object' && typeof (r as { movementId?: unknown }).movementId === 'string' ? (r as { movementId: string }).movementId : 'unknown';
          results.push({ movementId: id, status: 'error', error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ').slice(0, 300) });
          continue;
        }
        const m = parsed.data;
        if (this.store.get('SELECT 1 FROM movements WHERE movement_id = ?', m.movementId)) {
          results.push({ movementId: m.movementId, status: 'ok', duplicate: true });
          continue;
        }
        const seq = this.store.nextSeq();
        this.store.run(
          'INSERT INTO movements (movement_id, device_id, item_id, item_name, type, quantity_delta, unit, order_id, reason, occurred_at, seq) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          m.movementId, device.id, m.itemId, m.itemName, m.type, m.quantityDelta, m.unit, m.orderId ?? null, m.reason, m.occurredAt, seq
        );
        if (origin === 'device') this.store.run("INSERT OR IGNORE INTO cloud_outbox (kind, dedupe_key, payload, created_at) VALUES ('movement', ?, ?, ?)", `mv:${m.movementId}`, JSON.stringify(m), now);
        results.push({ movementId: m.movementId, status: 'ok', seq });
        any = true;
      }
    });
    if (any) this.publish({ branchId: null, kind: 'inventory', originDeviceId: origin === 'device' ? device.id : undefined });
    return { results };
  }

  pullMovements(afterSeq: number) {
    const rows = this.store.all<Record<string, any>>('SELECT * FROM movements WHERE seq > ? ORDER BY seq ASC LIMIT 501', afterSeq);
    const hasMore = rows.length > 500;
    const list = hasMore ? rows.slice(0, 500) : rows;
    return {
      movements: list.map((r) => ({ movementId: r.movement_id, deviceId: r.device_id, itemId: r.item_id, itemName: r.item_name, type: r.type, quantityDelta: r.quantity_delta, unit: r.unit, orderId: r.order_id, reason: r.reason, occurredAt: r.occurred_at, seq: r.seq })),
      latestSeq: list.length ? list[list.length - 1].seq : afterSeq,
      hasMore
    };
  }

  balances() {
    return this.store
      .all<Record<string, any>>('SELECT item_id, item_name, unit, SUM(quantity_delta) AS net, COUNT(*) AS n FROM movements GROUP BY item_id, item_name, unit')
      .map((r) => ({ branchId: this.cfg.branchId, itemId: r.item_id, itemName: r.item_name, unit: r.unit, netQuantity: Math.round(Number(r.net) * 1000) / 1000, movementCount: Number(r.n) }));
  }

  // ------------------------------------------------------------------ numbering

  businessDate(nowMs = this.now()): string {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: this.cfg.timezone ?? 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(nowMs));
    const g = (t: string) => parts.find((p) => p.type === t)!.value;
    return `${g('year')}${g('month')}${g('day')}`;
  }

  /** Reserves a block of order/KOT numbers for a device; blocks never overlap, even offline from the cloud. */
  leaseNumbers(kind: 'ORDER' | 'KOT', count: number) {
    if (!['ORDER', 'KOT'].includes(kind) || !Number.isInteger(count) || count < 1 || count > 500) throw new CoreError(400, 'BAD_REQUEST', 'kind must be ORDER or KOT and count 1-500');
    const date = this.businessDate();
    const next = this.store.transaction(() => {
      this.store.run('INSERT INTO number_seq (kind, business_date, next) VALUES (?, ?, ?) ON CONFLICT(kind, business_date) DO UPDATE SET next = next + ?', kind, date, count + 1, count);
      return Number(this.store.get<{ next: number }>('SELECT next FROM number_seq WHERE kind = ? AND business_date = ?', kind, date)!.next);
    });
    return { kind, prefix: this.cfg.branchCode, businessDate: date, start: next - count, count };
  }

  // ------------------------------------------------------------------ generic entities (menu, staff, tables ...)

  pushEntities(device: { id: string }, type: string, events: Array<{ externalId: string; payload: Record<string, any> }>, origin: 'device' | 'cloud' = 'device') {
    const results: Array<{ externalId: string; status: 'ok' | 'error'; syncVersion?: number }> = [];
    let changed = false;
    const now = this.now();
    this.store.transaction(() => {
      for (const e of events) {
        const existing = this.store.get<Record<string, any>>('SELECT * FROM entities WHERE entity_type = ? AND external_id = ?', type, e.externalId);
        const existingPayload = existing ? JSON.parse(existing.payload) : null;
        // A deletion is sticky: a device holding an old copy can never bring the record back.
        if (existingPayload?.deleted === true && e.payload.deleted !== true) {
          results.push({ externalId: e.externalId, status: 'ok', syncVersion: existing!.sync_version });
          continue;
        }
        const inTime = Date.parse(e.payload.updatedAt ?? '') || 0;
        const haveTime = Date.parse(existingPayload?.updatedAt ?? '') || 0;
        if (existing && inTime && haveTime && inTime < haveTime && e.payload.deleted !== true) {
          results.push({ externalId: e.externalId, status: 'ok', syncVersion: existing.sync_version });
          continue;
        }
        const version = (existing?.sync_version ?? 0) + 1;
        this.store.run(
          `INSERT INTO entities (entity_type, external_id, payload, sync_version, updated_at, dirty) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(entity_type, external_id) DO UPDATE SET payload = excluded.payload, sync_version = excluded.sync_version, updated_at = excluded.updated_at, dirty = excluded.dirty`,
          type, e.externalId, JSON.stringify(e.payload), version, now, origin === 'device' ? 1 : 0
        );
        results.push({ externalId: e.externalId, status: 'ok', syncVersion: version });
        changed = true;
      }
    });
    if (changed) this.publish({ branchId: null, kind: type.startsWith('MENU') ? 'menu' : 'entities', originDeviceId: origin === 'device' ? device.id : undefined });
    return { results, serverTime: new Date(now).toISOString() };
  }

  pullEntities(type: string, since?: string) {
    const sinceMs = since ? Date.parse(since) || 0 : 0;
    const rows = this.store.all<Record<string, any>>('SELECT * FROM entities WHERE entity_type = ? AND updated_at > ? ORDER BY updated_at ASC LIMIT 500', type, sinceMs);
    return {
      entities: rows.map((r) => ({ externalId: r.external_id, payload: JSON.parse(r.payload), updatedAt: new Date(r.updated_at).toISOString() })),
      serverTime: new Date(this.now()).toISOString()
    };
  }

  // ------------------------------------------------------------------ devices, heartbeat, commands

  heartbeat(device: AuthedDevice, body: { syncStatus?: string; appVersion?: string; pendingSyncCount?: number; syncError?: string | null; menuVersion?: number }) {
    this.store.run(
      'UPDATE devices SET last_seen_at = ?, app_version = COALESCE(?, app_version), pending = COALESCE(?, pending), sync_error = ?, menu_version = COALESCE(?, menu_version) WHERE id = ?',
      this.now(), body.appVersion ?? null, body.pendingSyncCount ?? null, body.syncError === undefined ? null : body.syncError, body.menuVersion ?? null, device.id
    );
    return {
      ok: true, serverTime: new Date(this.now()).toISOString(), locked: device.isLocked, lockCode: device.isLocked ? 'DEVICE_LOCKED' : null,
      lockReason: device.lockReason, notice: null, update: null, extension: null, displayScalePercent: 100
    };
  }

  fleet(issuer: AuthedDevice) {
    if (issuer.type !== 'KIOSK_ADMIN' && issuer.type !== 'POS_ADMIN') throw new CoreError(403, 'FORBIDDEN', 'Only an admin console can list the device fleet');
    const now = this.now();
    const rows = this.store.all<Record<string, any>>("SELECT * FROM devices WHERE status != 'REVOKED' ORDER BY type, id");
    const devices = rows
      .filter((d) => issuer.type !== 'KIOSK_ADMIN' || d.type === 'KIOSK' || d.type === 'KIOSK_ADMIN')
      .map((d) => {
        const silent = d.last_seen_at === null ? null : now - d.last_seen_at;
        const health = silent === null ? 'never_seen' : silent <= 120_000 ? 'online' : silent <= 900_000 ? 'degraded' : 'offline';
        return { id: d.id, type: d.type, name: d.name, appVersion: d.app_version, lastSeenAt: d.last_seen_at ? new Date(d.last_seen_at).toISOString() : null, health, isLocked: !!d.is_locked, lockReason: d.lock_reason, pendingSyncCount: d.pending, syncError: d.sync_error, menuVersion: d.menu_version };
      });
    return { devices, serverTime: new Date(now).toISOString() };
  }

  issueCommand(issuer: AuthedDevice, targetId: string, dto: { commandType: string; payload?: unknown; idempotencyKey?: string }) {
    if (issuer.type !== 'KIOSK_ADMIN' && issuer.type !== 'POS_ADMIN') throw new CoreError(403, 'FORBIDDEN', 'Only an admin console can send commands to other devices');
    if (!FLEET_COMMANDS.has(dto.commandType)) throw new CoreError(400, 'BAD_REQUEST', `${dto.commandType} cannot be sent from a restaurant console`);
    const target = this.store.get<Record<string, any>>("SELECT * FROM devices WHERE id = ? AND status != 'REVOKED'", targetId);
    if (!target) throw new CoreError(404, 'NOT_FOUND', 'Device not found');
    if (issuer.type === 'KIOSK_ADMIN' && target.type !== 'KIOSK') throw new CoreError(403, 'FORBIDDEN', 'Kiosk Admin can only manage kiosks');
    if (dto.idempotencyKey) {
      const prior = this.store.get<Record<string, any>>('SELECT * FROM commands WHERE device_id = ? AND idempotency_key = ?', targetId, dto.idempotencyKey);
      if (prior) return { id: prior.id, deviceId: targetId, commandType: prior.type, status: prior.status };
    }
    const id = randomUUID();
    this.store.transaction(() => {
      this.store.run('INSERT INTO commands (id, device_id, type, payload, idempotency_key, issued_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', id, targetId, dto.commandType, JSON.stringify(dto.payload ?? {}), dto.idempotencyKey ?? null, issuer.id, this.now());
      if (dto.commandType === 'LOCK') this.store.run('UPDATE devices SET is_locked = 1, lock_reason = ? WHERE id = ?', (dto.payload as { reason?: string } | undefined)?.reason ?? 'Locked by an administrator', targetId);
      if (dto.commandType === 'UNLOCK') this.store.run('UPDATE devices SET is_locked = 0, lock_reason = NULL WHERE id = ?', targetId);
    });
    this.publish({ branchId: null, deviceId: targetId, kind: 'command' });
    return { id, deviceId: targetId, commandType: dto.commandType, status: 'PENDING' };
  }

  pendingCommands(device: { id: string }) {
    const now = this.now();
    return this.store.transaction(() => {
      this.store.run("UPDATE commands SET status = 'FAILED', error = ? WHERE device_id = ? AND status = 'SENT' AND sent_at < ? AND retry_count >= ?", `No acknowledgement after ${MAX_REDELIVERIES + 1} deliveries`, device.id, now - REDELIVER_AFTER_MS, MAX_REDELIVERIES);
      const rows = this.store.all<Record<string, any>>(
        "SELECT * FROM commands WHERE device_id = ? AND (status = 'PENDING' OR (status = 'SENT' AND sent_at < ? AND retry_count < ?)) ORDER BY created_at",
        device.id, now - REDELIVER_AFTER_MS, MAX_REDELIVERIES
      );
      for (const r of rows) {
        this.store.run("UPDATE commands SET status = 'SENT', sent_at = ?, retry_count = retry_count + ? WHERE id = ?", now, r.status === 'SENT' ? 1 : 0, r.id);
      }
      return rows.map((r) => ({ id: r.id, commandType: r.type, payload: r.payload ? JSON.parse(r.payload) : {} }));
    });
  }

  ackCommand(device: { id: string }, id: string, outcome: { status: 'SUCCEEDED' | 'FAILED'; result?: unknown; error?: string }) {
    const r = this.store.run('UPDATE commands SET status = ?, result = ?, error = ? WHERE id = ? AND device_id = ?', outcome.status, outcome.result ? JSON.stringify(outcome.result) : null, outcome.error ?? null, id, device.id);
    if (r.changes === 0) throw new CoreError(404, 'NOT_FOUND', 'Command not found for this device');
    return { id, status: outcome.status };
  }

  // ------------------------------------------------------------------ what still has to go to the cloud

  /** Pending uploads of one kind that are due, oldest first. Nothing is ever deleted: sent items are only marked. */
  dueOutbox(kind: 'order' | 'movement', limit: number): Array<{ id: number; payload: any; attempts: number }> {
    return this.store
      .all<Record<string, any>>("SELECT id, payload, attempts FROM cloud_outbox WHERE kind = ? AND status = 'PENDING' AND next_attempt_at <= ? ORDER BY id LIMIT ?", kind, this.now(), limit)
      .map((r) => ({ id: r.id, payload: JSON.parse(r.payload), attempts: r.attempts }));
  }

  markOutboxSent(ids: number[]): void {
    this.store.transaction(() => ids.forEach((id) => this.store.run("UPDATE cloud_outbox SET status = 'SENT', last_error = NULL WHERE id = ?", id)));
  }

  /** A failed upload is kept and retried later; after too many attempts it is set aside (never dropped) for an operator. */
  markOutboxFailed(items: Array<{ id: number; attempts: number }>, error: string, delayMs: number, deadLetter: boolean): void {
    this.store.transaction(() =>
      items.forEach((i) =>
        this.store.run('UPDATE cloud_outbox SET attempts = attempts + 1, last_error = ?, next_attempt_at = ?, status = ? WHERE id = ?', error.slice(0, 300), this.now() + delayMs, deadLetter ? 'DEAD_LETTER' : 'PENDING', i.id)
      )
    );
  }

  dirtyEntities(limit = 200): Array<{ type: string; externalId: string; payload: any }> {
    return this.store
      .all<Record<string, any>>('SELECT entity_type, external_id, payload FROM entities WHERE dirty = 1 ORDER BY updated_at LIMIT ?', limit)
      .map((r) => ({ type: r.entity_type, externalId: r.external_id, payload: JSON.parse(r.payload) }));
  }

  clearDirty(type: string, externalId: string): void {
    this.store.run('UPDATE entities SET dirty = 0 WHERE entity_type = ? AND external_id = ?', type, externalId);
  }

  /** What the cloud should know about each device this core serves. */
  deviceReports() {
    return this.store
      .all<Record<string, any>>("SELECT id, last_seen_at, pending, sync_error, app_version, menu_version FROM devices WHERE status = 'ACTIVE' AND last_seen_at IS NOT NULL")
      .map((r) => ({ deviceId: r.id, lastSeenAt: new Date(r.last_seen_at).toISOString(), pendingSyncCount: r.pending, syncError: r.sync_error, appVersion: r.app_version, menuVersion: r.menu_version, syncStatus: r.sync_error ? 'error' : r.pending > 0 ? 'pending' : 'ok' }));
  }

  // ------------------------------------------------------------------ status for support / diagnostics

  status() {
    const q = (sql: string) => Number(this.store.get<{ n: number }>(sql)?.n ?? 0);
    const now = this.now();
    const contact = this.lastCloudContact();
    return {
      service: 'jamanvaar-branch-core',
      restaurantId: this.cfg.restaurantId,
      branchId: this.cfg.branchId,
      schemaVersion: this.store.schemaVersion,
      sequence: this.store.currentSeq(),
      pendingCloudEvents: q("SELECT COUNT(*) AS n FROM cloud_outbox WHERE status = 'PENDING'"),
      failedCloudEvents: q("SELECT COUNT(*) AS n FROM cloud_outbox WHERE status = 'DEAD_LETTER'"),
      lastCloudContactAt: contact ? new Date(contact).toISOString() : null,
      cloud: contact !== null && now - contact < 120_000 ? 'CONNECTED' : contact !== null ? 'OFFLINE' : 'NEVER_CONNECTED',
      unresolvedConflicts: q('SELECT COUNT(*) AS n FROM conflicts WHERE resolved = 0'),
      devices: q("SELECT COUNT(*) AS n FROM devices WHERE status = 'ACTIVE'"),
      serverTime: new Date(now).toISOString()
    };
  }
}
