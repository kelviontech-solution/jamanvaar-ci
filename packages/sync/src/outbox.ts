import { SyncEvent, SyncEventType, Order, OrderItem, PaymentSplit } from '@jamanvaar/types';
import { generateUUID, splitTaxPaise } from '@jamanvaar/utils';
import { db, KOTRepository, BusinessDayRepository, InventoryRepository, NumberAllocator, type NumberLease } from '@jamanvaar/database';
import { NetworkStatusService } from '@jamanvaar/api';
import { nextAttemptState } from './sync_protocol';

/** Money crosses the wire in paise (integers), matching cloud/api's schema. */
const toPaise = (rupees: number | undefined | null): number => Math.round((Number(rupees) || 0) * 100);
const fromPaise = (paise: number | undefined | null): number => Math.round(Number(paise) || 0) / 100;

export interface OrderSyncPushItem {
  externalItemId: string;
  menuItemId?: string;
  name: string;
  quantity: number;
  /** paise */
  unitPrice: number;
  modifiers: string[];
  /** Full modifier lines so the kitchen ticket can be rebuilt exactly (price in paise). */
  modifierDetails?: Array<{ optionName: string; priceDelta: number }>;
  kitchenStatus?: string;
  kitchenStation?: string;
  specialInstructions?: string;
  /** paise */
  lineTotal: number;
}

export interface OrderSyncMeta {
  orderNumber?: string;
  tokenNumber?: string;
  cashierName?: string;
  captainName?: string;
  customerName?: string;
  customerPhone?: string;
  guestCount?: number;
  createdAt?: string;
  sourceType?: string;
  businessDayId?: string;
  paymentTransactionId?: string;
  tenderedAmountPaise?: number;
  paymentSplits?: Array<{ method: string; amountPaise: number }>;
  cgstPaise?: number;
  sgstPaise?: number;
  roundOffPaise?: number;
  serviceChargePaise?: number;
  tipPaise?: number;
}

export interface OrderSyncPushEvent {
  /** Identifies this exact version of the order: stable across retries, new whenever the order changes. The server applies it once. */
  eventId?: string;
  externalOrderId: string;
  orderType: string;
  status: string;
  tableId?: string;
  tableLabel?: string;
  items: OrderSyncPushItem[];
  /** paise */
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  notes?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  meta?: OrderSyncMeta;
  updatedAt: string;
}

export interface OrderSyncPushResult {
  externalOrderId: string;
  status: 'ok' | 'error';
  syncVersion?: number;
  duplicate?: boolean;
  error?: string;
}

export interface CloudSyncedOrder {
  externalOrderId: string;
  orderType: string;
  status: string;
  tableId?: string | null;
  tableLabel?: string | null;
  items: OrderSyncPushItem[];
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  notes?: string | null;
  paymentStatus?: string | null;
  paymentMethod?: string | null;
  meta?: OrderSyncMeta | null;
  updatedAt: string;
}

/**
 * The one thing each app supplies: an already-authenticated HTTP client for
 * its own activated device (see cloudClient.ts's deviceFetch in pos/
 * pos-admin/captain — each app owns its own localStorage token and activation
 * flow). packages/sync deliberately knows nothing about those specifics, only
 * push/pull, so it stays reusable across apps that store credentials
 * differently.
 */
export interface OrderSyncTransport {
  push(events: OrderSyncPushEvent[]): Promise<{ results: OrderSyncPushResult[]; serverTime: string }>;
  /** `cursor` is either `seq:<n>` (preferred) or a legacy ISO timestamp; undefined means first pull. */
  pull(cursor?: string): Promise<{ orders: CloudSyncedOrder[]; serverTime: string; latestSeq?: number; hasMore?: boolean }>;
  /** Reserves a block of human order/KOT numbers for this device (POST /sync/number-leases). */
  leaseNumbers?(kind: 'ORDER' | 'KOT', count: number): Promise<NumberLease>;
  /** This device's id, used to derive the short code that keeps offline fallback numbers unique. */
  deviceId?(): string | null;
}

const CATCH_UP_CURSOR_KEY = 'jamanvaar_order_sync_cursor';

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable — the next catch-up just re-pulls from the default lookback window.
  }
}

function markSynced(order: Order): void {
  order.syncStatus = 'SYNCED';
  order.syncAttempts = 0;
  order.syncNextAttemptAt = undefined;
  order.syncLastError = undefined;
}

/** One more failed attempt: back off with jitter, and dead-letter (keep, never delete) after too many. */
function markFailedAttempt(order: Order, error: string): void {
  const next = nextAttemptState({ attemptCount: order.syncAttempts ?? 0, status: 'FAILED' }, Date.now());
  order.syncAttempts = next.attemptCount;
  order.syncStatus = next.status === 'DEAD_LETTER' ? 'DEAD_LETTER' : 'FAILED';
  order.syncNextAttemptAt = next.nextAttemptAt;
  order.syncLastError = error.slice(0, 300);
}

function toPushEvent(order: Order): OrderSyncPushEvent {
  return {
    eventId: `${order.id}@${order.updatedAt}`,
    externalOrderId: order.id,
    orderType: order.orderType,
    status: order.orderStatus,
    tableId: order.tableId,
    tableLabel: order.tableNumber,
    items: order.items.map((it) => ({
      externalItemId: it.id,
      menuItemId: it.menuItemId,
      name: it.name,
      quantity: it.quantity,
      unitPrice: toPaise(it.unitPrice),
      modifiers: (it.modifiers || []).map((m) => m.optionName),
      modifierDetails: (it.modifiers || []).map((m) => ({ optionName: m.optionName, priceDelta: toPaise(m.priceDelta) })),
      kitchenStatus: it.kitchenStatus,
      kitchenStation: db.menuItems.find((m) => m.id === it.menuItemId)?.kitchenStation,
      specialInstructions: it.specialInstructions,
      lineTotal: toPaise(it.totalPrice)
    })),
    subtotal: toPaise(order.subtotal),
    taxAmount: toPaise(order.taxAmount),
    discountAmount: toPaise(order.discountAmount),
    totalAmount: toPaise(order.totalAmount),
    notes: order.customerNotes,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    meta: {
      orderNumber: order.orderNumber,
      tokenNumber: order.tokenNumber,
      cashierName: order.cashierName,
      captainName: order.captainName,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      guestCount: order.guestCount,
      createdAt: order.createdAt,
      sourceType: order.source_type,
      businessDayId: order.businessDayId,
      paymentTransactionId: order.paymentTransactionId,
      tenderedAmountPaise: order.tenderedAmount !== undefined ? toPaise(order.tenderedAmount) : undefined,
      paymentSplits: order.paymentSplits?.map((l) => ({ method: l.method, amountPaise: toPaise(l.amount) })),
      cgstPaise: toPaise(order.cgstAmount),
      sgstPaise: toPaise(order.sgstAmount),
      roundOffPaise: toPaise(order.roundOffAmount),
      serviceChargePaise: toPaise(order.serviceChargeAmount),
      tipPaise: toPaise(order.tipAmount)
    },
    updatedAt: order.updatedAt
  };
}

function orderItemFromRemote(orderId: string, ri: OrderSyncPushItem): OrderItem {
  const details = ri.modifierDetails && ri.modifierDetails.length > 0
    ? ri.modifierDetails
    : (ri.modifiers || []).map((name) => ({ optionName: name, priceDelta: 0 }));
  return {
    id: ri.externalItemId,
    orderId,
    menuItemId: ri.menuItemId || ri.externalItemId,
    name: ri.name,
    sku: ri.menuItemId || ri.externalItemId,
    quantity: ri.quantity,
    unitPrice: fromPaise(ri.unitPrice),
    modifiers: details.map((d, i) => ({
      groupId: `remote-${i}`,
      optionId: `remote-${i}`,
      optionName: d.optionName,
      priceDelta: fromPaise(d.priceDelta)
    })) as OrderItem['modifiers'],
    specialInstructions: ri.specialInstructions,
    totalPrice: fromPaise(ri.lineTotal),
    kitchenStatus: (ri.kitchenStatus as OrderItem['kitchenStatus']) || 'PENDING'
  };
}

function applyPaymentAndTotals(local: Order, remote: CloudSyncedOrder): void {
  local.orderStatus = remote.status as Order['orderStatus'];
  local.totalAmount = fromPaise(remote.totalAmount);
  local.subtotal = fromPaise(remote.subtotal);
  local.taxAmount = fromPaise(remote.taxAmount);
  local.discountAmount = fromPaise(remote.discountAmount);
  local.updatedAt = remote.updatedAt;
  if (remote.paymentStatus) local.paymentStatus = remote.paymentStatus as Order['paymentStatus'];
  if (remote.paymentMethod) local.paymentMethod = remote.paymentMethod as Order['paymentMethod'];
  const m = remote.meta;
  if (m) {
    if (m.paymentSplits && m.paymentSplits.length > 0) {
      local.paymentSplits = m.paymentSplits.map((l) => ({
        method: l.method as PaymentSplit['method'],
        amount: fromPaise(l.amountPaise)
      }));
    }
    if (m.tenderedAmountPaise !== undefined) local.tenderedAmount = fromPaise(m.tenderedAmountPaise);
    if (m.paymentTransactionId) local.paymentTransactionId = m.paymentTransactionId;
    if (m.cgstPaise !== undefined) local.cgstAmount = fromPaise(m.cgstPaise);
    if (m.sgstPaise !== undefined) local.sgstAmount = fromPaise(m.sgstPaise);
    if (m.roundOffPaise !== undefined) local.roundOffAmount = fromPaise(m.roundOffPaise);
  }
}

/** Merges a remote copy into an order this device already has locally. Returns true if items were added. */
function applyRemoteToLocalOrder(local: Order, remote: CloudSyncedOrder): boolean {
  applyPaymentAndTotals(local, remote);
  let addedItems = false;
  remote.items.forEach((ri) => {
    const li = local.items.find((i) => i.id === ri.externalItemId);
    if (li) {
      // Item-level kitchenStatus is what another device (KDS marking
      // PREPARING/READY, Captain marking SERVED) is actually changing.
      if (ri.kitchenStatus) li.kitchenStatus = ri.kitchenStatus as OrderItem['kitchenStatus'];
      if (ri.quantity !== li.quantity) {
        li.quantity = ri.quantity;
        li.totalPrice = fromPaise(ri.lineTotal);
      }
    } else {
      // An add-on round: an item the other device added after the first KOT.
      local.items.push(orderItemFromRemote(local.id, ri));
      addedItems = true;
    }
  });
  return addedItems;
}

/**
 * Reconstructs a local Order from a cloud mirror for a device that didn't
 * create it (e.g. KDS/Captain pulling an order POS created). Deliberately a
 * read-mirror, not a real order-creation event - it bypasses
 * OrderRepository.createOrder()'s business side effects (inventory
 * deduction, shift totals, business-day metrics) since only the originating
 * device should book those once.
 */
function buildLocalOrderFromRemote(remote: CloudSyncedOrder): Order {
  const m = remote.meta || {};
  const nowIso = remote.updatedAt || new Date().toISOString();
  const items: OrderItem[] = remote.items.map((ri) => orderItemFromRemote(remote.externalOrderId, ri));

  const order: Order = {
    id: remote.externalOrderId,
    orderNumber: m.orderNumber || remote.externalOrderId,
    tokenNumber: m.tokenNumber || remote.externalOrderId.slice(-4).toUpperCase(),
    businessDayId: m.businessDayId,
    restaurantId: db.restaurant.id,
    outletId: db.outlet?.id || db.restaurant.id,
    kioskId: 'CLOUD-SYNC',
    sessionId: 'cloud-sync',
    idempotencyKey: remote.externalOrderId,
    orderType: (remote.orderType as Order['orderType']) || 'DINE_IN',
    tableId: remote.tableId || undefined,
    tableNumber: remote.tableLabel || undefined,
    guestCount: m.guestCount,
    customerName: m.customerName,
    customerPhone: m.customerPhone,
    cashierName: m.cashierName,
    captainName: m.captainName,
    items,
    subtotal: fromPaise(remote.subtotal),
    discountAmount: fromPaise(remote.discountAmount),
    cgstAmount: m.cgstPaise !== undefined ? fromPaise(m.cgstPaise) : fromPaise(splitTaxPaise(remote.taxAmount).cgst),
    sgstAmount: m.sgstPaise !== undefined ? fromPaise(m.sgstPaise) : fromPaise(splitTaxPaise(remote.taxAmount).sgst),
    taxAmount: fromPaise(remote.taxAmount),
    serviceChargeAmount: fromPaise(m.serviceChargePaise),
    tipAmount: fromPaise(m.tipPaise),
    roundOffAmount: fromPaise(m.roundOffPaise),
    totalAmount: fromPaise(remote.totalAmount),
    paymentMethod: (remote.paymentMethod as Order['paymentMethod']) || 'CASH_AT_COUNTER',
    paymentStatus: (remote.paymentStatus as Order['paymentStatus']) || 'PENDING',
    orderStatus: (remote.status as Order['orderStatus']) || 'NEW',
    estimatedWaitMinutes: 15,
    createdAt: m.createdAt || nowIso,
    updatedAt: nowIso,
    source_type: ((m.sourceType as Order['source_type']) || 'OTHER'),
    customerNotes: remote.notes || undefined,
    syncStatus: 'SYNCED',
    isSynced: true
  };
  applyPaymentAndTotals(order, remote);
  return order;
}

/**
 * Gives a pulled-in order the kitchen tickets it is missing. Quantity already
 * covered by an existing ticket is skipped, so a follow-up round (extra items
 * or extra quantity added after the first KOT) produces a ticket for just the
 * new part. Orders that are already finished never get prep tickets.
 */
function ensureKotsForOrder(order: Order): void {
  if (['COMPLETED', 'CANCELLED', 'REFUNDED'].includes(order.orderStatus)) return;

  const covered = new Map<string, number>();
  db.kots
    .filter((k) => k.orderId === order.id)
    .forEach((k) => k.items.forEach((i) => covered.set(i.menuItemId, (covered.get(i.menuItemId) || 0) + i.quantity)));

  const missing = order.items
    .map((it) => {
      const already = covered.get(it.menuItemId) || 0;
      const take = Math.min(already, it.quantity);
      covered.set(it.menuItemId, already - take);
      return { it, qty: it.quantity - take };
    })
    .filter((x) => x.qty > 0);
  if (missing.length === 0) return;

  KOTRepository.generateKOT({
    orderId: order.id,
    orderNumber: order.orderNumber,
    tokenNumber: order.tokenNumber,
    tableNumber: order.tableNumber,
    orderType: order.orderType,
    items: missing.map(({ it, qty }) => ({
      id: `${it.id}-r${Date.now()}`,
      menuItemId: it.menuItemId,
      name: it.name,
      quantity: qty,
      modifiers: it.modifiers,
      specialInstructions: it.specialInstructions,
      // The station travels with the item; fall back to this device's own
      // menu, and only then to the main kitchen.
      kitchenStation:
        (it as OrderItem & { kitchenStation?: string }).kitchenStation ||
        db.menuItems.find((mi) => mi.id === it.menuItemId)?.kitchenStation ||
        'Main Kitchen',
      status: it.kitchenStatus || 'PENDING'
    })),
    cashierName: order.captainName || order.cashierName || '',
    serverName: order.captainName,
    orderNotes: order.customerNotes
  });
}

export class SyncOutboxEngine {
  private static isSyncing = false;
  private static transport: OrderSyncTransport | null = null;
  private static unsubscribeNetwork: (() => void) | null = null;

  /**
   * Called once at app startup by whichever local app has an activated
   * device. Also arms an auto-sync on reconnect (NetworkStatusService
   * already listens to the browser's real online/offline events) so a
   * terminal that comes back online doesn't wait for a manual trigger.
   */
  public static configureTransport(transport: OrderSyncTransport | null): void {
    this.transport = transport;
    NumberAllocator.reload();
    this.unsubscribeNetwork?.();
    this.unsubscribeNetwork = null;

    if (transport) {
      let wasOnline = NetworkStatusService.isOnline();
      this.unsubscribeNetwork = NetworkStatusService.subscribe((state) => {
        const isOnlineNow = state === 'ONLINE';
        if (isOnlineNow && !wasOnline) {
          void this.processOutbox({ ignoreBackoff: true });
          void this.catchUpFromCloud();
        }
        wasOnline = isOnlineNow;
      });
    }
  }

  /** Tops up the leased number blocks while online. A failure just means fallback numbering keeps working. */
  private static async refillNumberLeases(): Promise<void> {
    const t = this.transport;
    if (!t?.leaseNumbers) return;
    for (const kind of ['ORDER', 'KOT'] as const) {
      if (NumberAllocator.isConfigured() && !NumberAllocator.needsRefill(kind)) continue;
      try {
        const lease = await t.leaseNumbers(kind, 100);
        if (!NumberAllocator.isConfigured()) {
          const id = t.deviceId?.();
          if (!id) return;
          NumberAllocator.configure({ deviceCode: 'D' + id.replace(/-/g, '').slice(0, 6).toUpperCase(), branchCode: lease.prefix });
        }
        NumberAllocator.addLease(lease);
      } catch {
        return;
      }
    }
  }

  /** Push pending orders right now (used after Send KOT / payment) instead of waiting for the next timer tick. */
  public static flush(): void {
    if (!this.transport) return;
    void this.processOutbox();
  }

  public static queueEvent(eventType: SyncEventType, payload: any, kioskId: string = 'KIOSK-01'): SyncEvent {
    const event: SyncEvent = {
      id: generateUUID(),
      kioskId,
      eventType,
      payload,
      status: 'PENDING',
      retryCount: 0,
      createdAt: new Date().toISOString()
    };

    db.syncEvents.push(event);
    db.notify();
    return event;
  }

  public static async processOutbox(opts: { ignoreBackoff?: boolean } = {}): Promise<{ processed: number; failed: number }> {
    if (this.isSyncing) return { processed: 0, failed: 0 };
    this.isSyncing = true;
    NetworkStatusService.setNetworkState('SYNCING', NetworkStatusService.getLatency());
    void this.refillNumberLeases();

    let processed = 0;
    let failed = 0;

    // 1. Push orders the local app has marked as needing a cloud copy.
    const nowMs = Date.now();
    const pendingOrders = db.orders.filter(
      (o) =>
        o.syncStatus === 'SAVED_LOCALLY' ||
        (o.syncStatus === 'FAILED' && (opts.ignoreBackoff || (o.syncNextAttemptAt ?? 0) <= nowMs))
    );

    if (pendingOrders.length > 0) {
      if (!this.transport) {
        // No transport configured is a device-activation gap, not a
        // connectivity blip — fail loud instead of the old stub's silent
        // "SYNCED" so a caller can never mistake this for a real round-trip.
        for (const ord of pendingOrders) {
          ord.syncStatus = 'FAILED';
          failed++;
        }
      } else {
        pendingOrders.forEach((o) => {
          o.syncStatus = 'SYNCING';
        });
        try {
          const { results } = await this.transport.push(pendingOrders.map(toPushEvent));
          const byId = new Map(results.map((r) => [r.externalOrderId, r]));
          for (const ord of pendingOrders) {
            const res = byId.get(ord.id);
            if (res && res.status === 'ok') {
              markSynced(ord);
              processed++;
            } else {
              markFailedAttempt(ord, res?.error ?? 'Not acknowledged by the server');
              failed++;
            }
          }
          NetworkStatusService.setNetworkState('ONLINE', 18);
        } catch (err) {
          for (const ord of pendingOrders) {
            markFailedAttempt(ord, err instanceof Error ? err.message : 'Network error');
            failed++;
          }
          NetworkStatusService.setNetworkState('OFFLINE', 0);
        }
      }
    }

    // 2. Resolve queued outbox events. An ORDER_CREATED/ORDER_UPDATED event
    // queued alongside an order mirrors one of the pushes above rather than
    // a second independent transmission, so it's resolved from that
    // outcome. Anything else has no cloud endpoint yet (menu/CRM/inventory
    // sync is a later phase) and fails loud rather than faking success.
    const pendingEvents = db.syncEvents.filter((e) => e.status === 'PENDING' || e.status === 'FAILED');
    for (const evt of pendingEvents) {
      evt.lastAttemptAt = new Date().toISOString();
      const relatedOrderId =
        (evt.eventType === 'ORDER_CREATED' || evt.eventType === 'ORDER_UPDATED') &&
        evt.payload &&
        typeof evt.payload === 'object'
          ? (evt.payload as { id?: string }).id
          : undefined;
      const relatedOrder = relatedOrderId ? pendingOrders.find((o) => o.id === relatedOrderId) : undefined;

      if (relatedOrder) {
        if (relatedOrder.syncStatus === 'SYNCED') {
          evt.status = 'COMPLETED';
        } else {
          evt.status = 'FAILED';
          evt.retryCount += 1;
          evt.errorMessage = 'Order push failed — see the order record for details';
        }
      } else {
        evt.status = 'FAILED';
        evt.retryCount += 1;
        evt.errorMessage = this.transport
          ? `No cloud sync endpoint for ${evt.eventType} yet`
          : 'Sync transport not configured for this device';
      }
    }

    db.notify();
    this.isSyncing = false;
    return { processed, failed };
  }

  /**
   * Catch-up/replay pull for a (re)connecting device — not just a live push
   * target. Persists the server's own clock (`serverTime`) as the next
   * cursor rather than this device's clock, so client/server clock skew
   * can't cause a missed or re-fetched window.
   */
  public static async catchUpFromCloud(): Promise<{ pulled: number; created: number }> {
    if (!this.transport) return { pulled: 0, created: 0 };

    let cursor = safeGet(CATCH_UP_CURSOR_KEY) ?? undefined;
    let pulled = 0;
    let created = 0;

    try {
      // Follow `hasMore` so a long outage catches up page by page, saving the cursor after each applied page.
      for (let page = 0; page < 50; page++) {
      const { orders, serverTime, latestSeq, hasMore } = await this.transport.pull(cursor);
      const touchedDays = new Set<string>();
      for (const remote of orders) {
        const existing = db.orders.find((o) => o.id === remote.externalOrderId);
        if (existing) {
          if (new Date(remote.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) {
            const added = applyRemoteToLocalOrder(existing, remote);
            if (added || remote.status === 'PREPARING' || remote.status === 'NEW') ensureKotsForOrder(existing);
            if (existing.businessDayId) touchedDays.add(existing.businessDayId);
            // B2-045: a synced-in order used to never have its ingredients deducted anywhere —
            // buildLocalOrderFromRemote deliberately bypasses OrderRepository.createOrder()'s
            // side effects (this function's own docstring), and the device that actually sold
            // the dish (POS/Kiosk) has no recipe/inventory data to deduct from at all (BUG-159:
            // neither is in the cross-device sync bridge). reconcileOrder is safe to call here
            // regardless: it is idempotent per order (`order.stockConsumedQty`, see BUG-044), it
            // only deducts the quantity not already accounted for, and on a device with no
            // matching recipe (still true for POS/Kiosk today) it is a complete no-op. This
            // naturally becomes the one place a sale's ingredients get booked, on whichever
            // device actually owns the recipe/inventory data (Restaurant Admin) — without needing
            // to sync inventory/recipes themselves bidirectionally to every terminal. Skipped for
            // a CANCELLED order — it was never actually served, so nothing was consumed.
            // (A synced-in REFUND is a known, smaller follow-up: restoreForOrder's exact
            // full-vs-partial-refund rule isn't replicated here yet, only the base deduction.)
            if (existing.orderStatus !== 'CANCELLED') {
              try { InventoryRepository.reconcileOrder(existing); } catch { /* no recipe data on this device — nothing to deduct */ }
            }
          }
        } else {
          const localOrder = buildLocalOrderFromRemote(remote);
          db.orders.push(localOrder);
          ensureKotsForOrder(localOrder);
          if (localOrder.businessDayId) touchedDays.add(localOrder.businessDayId);
          created++;
          if (localOrder.orderStatus !== 'CANCELLED') {
            try { InventoryRepository.reconcileOrder(localOrder); } catch { /* no recipe data on this device — nothing to deduct */ }
          }
        }
        pulled++;
      }
      // Keep this device's own day totals in step with the orders it just received.
      touchedDays.forEach((dayId) => {
        try {
          BusinessDayRepository.recalculateMetrics(dayId);
        } catch {
          // The day may not exist on this device yet; its totals build up when it does.
        }
      });
      // Kitchen tickets are per device: bring them in line with the order state just received, so a
      // dish the kitchen finished shows as ready here and a settled order's ticket clears (BUG-098/113).
      KOTRepository.reconcileWithOrders();
      // Prefer the gapless sequence; use the server clock only while no sequenced row has been seen.
      cursor = latestSeq && latestSeq > 0 ? `seq:${latestSeq}` : serverTime;
      safeSet(CATCH_UP_CURSOR_KEY, cursor);
      if (!hasMore) break;
      }
      if (pulled > 0) db.notify();
    } catch {
      // Leave the cursor untouched — the next attempt retries from the same point.
    }

    return { pulled, created };
  }

  /** Orders the outbox gave up on. Kept for an operator to inspect and retry; never deleted. */
  public static getDeadLetters(): Order[] {
    return db.orders.filter((o) => o.syncStatus === 'DEAD_LETTER');
  }

  public static retryDeadLetter(orderId: string): boolean {
    const order = db.orders.find((o) => o.id === orderId && o.syncStatus === 'DEAD_LETTER');
    if (!order) return false;
    order.syncStatus = 'SAVED_LOCALLY';
    order.syncAttempts = 0;
    order.syncNextAttemptAt = undefined;
    db.notify();
    return true;
  }

  public static getSyncStats(): { pendingCount: number; syncedCount: number; failedCount: number; deadLetterCount: number } {
    const pendingOrders = db.orders.filter((o) => o.syncStatus === 'SAVED_LOCALLY' || o.syncStatus === 'SYNCING').length;
    const syncedOrders = db.orders.filter((o) => !o.syncStatus || o.syncStatus === 'SYNCED').length;
    const failedOrders = db.orders.filter((o) => o.syncStatus === 'FAILED').length;

    const pendingEvents = db.syncEvents.filter((e) => e.status === 'PENDING' || e.status === 'PROCESSING').length;
    const failedEvents = db.syncEvents.filter((e) => e.status === 'FAILED').length;

    return {
      pendingCount: pendingOrders + pendingEvents,
      syncedCount: syncedOrders,
      failedCount: failedOrders + failedEvents,
      deadLetterCount: db.orders.filter((o) => o.syncStatus === 'DEAD_LETTER').length
    };
  }
}
