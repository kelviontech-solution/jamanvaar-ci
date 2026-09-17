import { SyncEvent, SyncEventType, Order, OrderItem } from '@jamanvaar/types';
import { generateUUID } from '@jamanvaar/utils';
import { db, KOTRepository } from '@jamanvaar/database';
import { NetworkStatusService } from '@jamanvaar/api';

export interface OrderSyncPushItem {
  externalItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  modifiers: string[];
  kitchenStatus?: string;
  lineTotal: number;
}

export interface OrderSyncPushEvent {
  externalOrderId: string;
  orderType: string;
  status: string;
  tableId?: string;
  tableLabel?: string;
  items: OrderSyncPushItem[];
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  notes?: string;
  updatedAt: string;
}

export interface OrderSyncPushResult {
  externalOrderId: string;
  status: 'ok' | 'error';
  syncVersion?: number;
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
  pull(since?: string): Promise<{ orders: CloudSyncedOrder[]; serverTime: string }>;
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

function toPushEvent(order: Order): OrderSyncPushEvent {
  return {
    externalOrderId: order.id,
    orderType: order.orderType,
    status: order.orderStatus,
    tableId: order.tableId,
    tableLabel: order.tableNumber,
    items: order.items.map((it) => ({
      externalItemId: it.id,
      name: it.name,
      quantity: it.quantity,
      unitPrice: Math.round(it.unitPrice),
      modifiers: (it.modifiers || []).map((m) => m.optionName),
      kitchenStatus: it.kitchenStatus,
      lineTotal: Math.round(it.totalPrice)
    })),
    subtotal: Math.round(order.subtotal),
    taxAmount: Math.round(order.taxAmount),
    discountAmount: Math.round(order.discountAmount || 0),
    totalAmount: Math.round(order.totalAmount),
    notes: order.customerNotes,
    updatedAt: order.updatedAt
  };
}

/** Merges a remote copy into an order this device already has locally. */
function applyRemoteToLocalOrder(local: Order, remote: CloudSyncedOrder): void {
  local.orderStatus = remote.status as Order['orderStatus'];
  local.totalAmount = remote.totalAmount;
  local.subtotal = remote.subtotal;
  local.taxAmount = remote.taxAmount;
  local.discountAmount = remote.discountAmount;
  local.updatedAt = remote.updatedAt;
  // Item-level kitchenStatus is the field another device (KDS marking
  // PREPARING/READY, Captain marking SERVED) is actually changing — merge
  // just that in rather than overwriting pricing/quantity this device
  // already has correct.
  remote.items.forEach((ri) => {
    const li = local.items.find((i) => i.id === ri.externalItemId);
    if (li && ri.kitchenStatus) li.kitchenStatus = ri.kitchenStatus as OrderItem['kitchenStatus'];
  });
}

/**
 * Reconstructs a local Order from a cloud mirror for a device that didn't
 * create it (e.g. KDS/Captain pulling an order POS created). Deliberately a
 * read-mirror, not a real order-creation event — it bypasses
 * OrderRepository.createOrder()'s business side effects (inventory
 * deduction, shift totals, business-day metrics) since only the originating
 * device should book those once.
 */
function buildLocalOrderFromRemote(remote: CloudSyncedOrder): Order {
  const nowIso = remote.updatedAt || new Date().toISOString();
  const items: OrderItem[] = remote.items.map((ri) => ({
    id: ri.externalItemId,
    orderId: remote.externalOrderId,
    menuItemId: ri.externalItemId,
    name: ri.name,
    sku: ri.externalItemId,
    quantity: ri.quantity,
    unitPrice: ri.unitPrice,
    modifiers: [],
    totalPrice: ri.lineTotal,
    kitchenStatus: (ri.kitchenStatus as OrderItem['kitchenStatus']) || 'PENDING'
  }));

  return {
    id: remote.externalOrderId,
    orderNumber: remote.externalOrderId,
    tokenNumber: remote.externalOrderId.slice(-4).toUpperCase(),
    restaurantId: db.restaurant.id,
    outletId: db.outlet?.id || db.restaurant.id,
    kioskId: 'CLOUD-SYNC',
    sessionId: 'cloud-sync',
    idempotencyKey: remote.externalOrderId,
    orderType: (remote.orderType as Order['orderType']) || 'DINE_IN',
    tableId: remote.tableId || undefined,
    tableNumber: remote.tableLabel || undefined,
    items,
    subtotal: remote.subtotal,
    discountAmount: remote.discountAmount,
    cgstAmount: remote.taxAmount / 2,
    sgstAmount: remote.taxAmount / 2,
    taxAmount: remote.taxAmount,
    serviceChargeAmount: 0,
    tipAmount: 0,
    roundOffAmount: 0,
    totalAmount: remote.totalAmount,
    paymentMethod: 'CASH_AT_COUNTER',
    paymentStatus: 'PENDING',
    orderStatus: (remote.status as Order['orderStatus']) || 'NEW',
    estimatedWaitMinutes: 15,
    createdAt: nowIso,
    updatedAt: nowIso,
    source_type: 'OTHER',
    syncStatus: 'SYNCED',
    isSynced: true
  };
}

/** Gives a pulled-in order a kitchen ticket if it doesn't have one yet — otherwise a KDS that only just caught up would show the order without anything to prepare against. */
function ensureKotForOrder(order: Order): void {
  const alreadyHasKot = db.kots.some((k) => k.orderId === order.id);
  if (alreadyHasKot || order.items.length === 0) return;

  KOTRepository.generateKOT({
    orderId: order.id,
    orderNumber: order.orderNumber,
    tokenNumber: order.tokenNumber,
    tableNumber: order.tableNumber,
    orderType: order.orderType,
    items: order.items.map((it) => ({
      id: it.id,
      menuItemId: it.menuItemId,
      name: it.name,
      quantity: it.quantity,
      modifiers: it.modifiers,
      specialInstructions: it.specialInstructions,
      // This device hasn't necessarily synced the originating device's menu
      // catalog (menu sync is a later phase), so the item's real kitchen
      // station can't be resolved here — it routes to Main Kitchen until it can.
      kitchenStation: 'Main Kitchen',
      status: it.kitchenStatus || 'PENDING'
    })),
    cashierName: 'Cloud Sync'
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
    this.unsubscribeNetwork?.();
    this.unsubscribeNetwork = null;

    if (transport) {
      let wasOnline = NetworkStatusService.isOnline();
      this.unsubscribeNetwork = NetworkStatusService.subscribe((state) => {
        const isOnlineNow = state === 'ONLINE';
        if (isOnlineNow && !wasOnline) {
          void this.processOutbox();
          void this.catchUpFromCloud();
        }
        wasOnline = isOnlineNow;
      });
    }
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

  public static async processOutbox(): Promise<{ processed: number; failed: number }> {
    if (this.isSyncing) return { processed: 0, failed: 0 };
    this.isSyncing = true;
    NetworkStatusService.setNetworkState('SYNCING', NetworkStatusService.getLatency());

    let processed = 0;
    let failed = 0;

    // 1. Push orders the local app has marked as needing a cloud copy.
    const pendingOrders = db.orders.filter((o) => o.syncStatus === 'SAVED_LOCALLY' || o.syncStatus === 'FAILED');

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
              ord.syncStatus = 'SYNCED';
              processed++;
            } else {
              ord.syncStatus = 'FAILED';
              failed++;
            }
          }
          NetworkStatusService.setNetworkState('ONLINE', 18);
        } catch {
          for (const ord of pendingOrders) {
            ord.syncStatus = 'FAILED';
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

    const since = safeGet(CATCH_UP_CURSOR_KEY) ?? undefined;
    let pulled = 0;
    let created = 0;

    try {
      const { orders, serverTime } = await this.transport.pull(since);
      for (const remote of orders) {
        const existing = db.orders.find((o) => o.id === remote.externalOrderId);
        if (existing) {
          if (new Date(remote.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) {
            applyRemoteToLocalOrder(existing, remote);
          }
        } else {
          const localOrder = buildLocalOrderFromRemote(remote);
          db.orders.push(localOrder);
          ensureKotForOrder(localOrder);
          created++;
        }
        pulled++;
      }
      safeSet(CATCH_UP_CURSOR_KEY, serverTime);
      if (pulled > 0) db.notify();
    } catch {
      // Leave the cursor untouched — the next attempt retries from the same point.
    }

    return { pulled, created };
  }

  public static getSyncStats(): { pendingCount: number; syncedCount: number; failedCount: number } {
    const pendingOrders = db.orders.filter((o) => o.syncStatus === 'SAVED_LOCALLY' || o.syncStatus === 'SYNCING').length;
    const syncedOrders = db.orders.filter((o) => !o.syncStatus || o.syncStatus === 'SYNCED').length;
    const failedOrders = db.orders.filter((o) => o.syncStatus === 'FAILED').length;

    const pendingEvents = db.syncEvents.filter((e) => e.status === 'PENDING' || e.status === 'PROCESSING').length;
    const failedEvents = db.syncEvents.filter((e) => e.status === 'FAILED').length;

    return {
      pendingCount: pendingOrders + pendingEvents,
      syncedCount: syncedOrders,
      failedCount: failedOrders + failedEvents
    };
  }
}
