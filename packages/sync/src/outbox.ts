import { StaffSession } from './staff_session';
import { KeyValueStore } from '@jamanvaar/database';
import { SyncEvent, SyncEventType, Order, OrderItem, PaymentSplit } from '@jamanvaar/types';
import { generateUUID, splitTaxPaise } from '@jamanvaar/utils';
import { db, KOTRepository, BusinessDayRepository, InventoryRepository, NumberAllocator, resolveKitchenState, refreshBillState, compareKitchenPriority, type NumberLease } from '@jamanvaar/database';
import { NetworkStatusService } from '@jamanvaar/api';
import { nextAttemptState } from './sync_protocol';
import { EndpointResolver } from './endpoint_resolver';
import { jsonBatches } from './batches';

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
  modifierDetails?: Array<{ optionName: string; priceDelta: number; optionId?: string; groupId?: string; groupName?: string }>;
  /** What the order was priced with when it was placed; carried unchanged by every device. */
  snapshot?: { menuVersion?: number; basePrice?: number; taxGroupId?: string; taxRateBp?: number; taxInclusive?: boolean; lineTax?: number };
  kitchenStatus?: string;
  /** Revision of the kitchen status: a recall or cancellation raises it so it beats older copies (see kitchen_status.ts). */
  statusRev?: number;
  course?: string;
  cancelReason?: string;
  /** paise: what the dish was worth before it was cancelled */
  cancelledAmount?: number;
  cancelledBy?: string;
  cancelledAt?: string;
  seat?: number;
  sentAt?: string;
  readyAt?: string;
  kitchenStation?: string;
  specialInstructions?: string;
  /** paise */
  lineTotal: number;
}

export interface OrderSyncMeta {
  kitchenPriority?: 'NORMAL' | 'URGENT';
  kitchenPriorityRev?: number;
  kitchenPriorityChangeId?: string;
  orderNumber?: string;
  tokenNumber?: string;
  cashierName?: string;
  captainName?: string;
  billRequestedAt?: string;
  billSplitNote?: string;
  customerName?: string;
  customerPhone?: string;
  guestCount?: number;
  createdAt?: string;
  sourceType?: string;
  acceptedBy?: string;
  businessDayId?: string;
  paymentTransactionId?: string;
  refundAmountPaise?: number;
  tenderedAmountPaise?: number;
  paymentSplits?: Array<{ method: string; amountPaise: number }>;
  cgstPaise?: number;
  sgstPaise?: number;
  roundOffPaise?: number;
  serviceChargePaise?: number;
  tipPaise?: number;
  /** Signed proof of who was signed in / which manager approved; the server verifies it (see staff_session.ts). */
  staffSession?: string;
  approvalSession?: string;
}

export interface OrderSyncPushEvent {
  /** Identifies this exact version of the order: stable across retries, new whenever the order changes. The server applies it once. */
  eventId?: string;
  /** The order's syncVersion this device last saw; a push against an older version cannot overwrite newer totals or table. */
  baseSyncVersion?: number;
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
  /** Assigned by the cloud: the gapless position of this order's latest change, and how many times it has changed. */
  seq?: number;
  syncVersion?: number;
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
  pull(cursor?: string): Promise<{ orders: CloudSyncedOrder[]; serverTime: string; latestSeq?: number; hasMore?: boolean; serverKey?: 'cloud' | 'core' }>;
  /** Reserves a block of human order/KOT numbers for this device (POST /sync/number-leases). */
  leaseNumbers?(kind: 'ORDER' | 'KOT', count: number): Promise<NumberLease>;
  /** This device's id, used to derive the short code that keeps offline fallback numbers unique. */
  deviceId?(): string | null;
}

const CATCH_UP_CURSOR_KEY = 'jamanvaar_order_sync_cursor';

function safeGet(key: string): string | null {
  try {
    return KeyValueStore.get(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    KeyValueStore.set(key, value);
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

/** A short, stable fingerprint of what a push says. Same content -> same fingerprint (a retry is recognised); any real change -> a different one. */
function contentFingerprint(order: Order): string {
  const text = JSON.stringify([
    order.orderStatus, order.tableId, order.paymentStatus, order.totalAmount, order.customerNotes,
    order.items.map((i) => [i.id, i.quantity, i.unitPrice, i.kitchenStatus, i.statusRev ?? 0, i.specialInstructions])
  ]);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

function toPushEvent(order: Order): OrderSyncPushEvent {
  return {
    // Unique per distinct change: the order, when it changed, and what it said. Two different changes that share a millisecond
    // no longer collide (the second used to be dropped as a "duplicate"); a retry of the same change still carries the same id.
    eventId: `${order.id}@${order.updatedAt}#${contentFingerprint(order)}`,
    ...(order.remoteSyncVersion !== undefined ? { baseSyncVersion: order.remoteSyncVersion } : {}),
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
      modifierDetails: (it.modifiers || []).map((m) => ({ optionName: m.optionName, priceDelta: toPaise(m.priceDelta), ...(m.optionId && !m.optionId.startsWith('remote-') ? { optionId: m.optionId } : {}), ...(m.groupId && !m.groupId.startsWith('remote-') ? { groupId: m.groupId } : {}), ...(m.groupName ? { groupName: m.groupName } : {}) })),
      ...(it.snapshot ? { snapshot: it.snapshot } : {}),
      kitchenStatus: it.kitchenStatus,
      ...(it.statusRev ? { statusRev: it.statusRev } : {}),
      ...(it.course ? { course: it.course } : {}),
      ...(it.cancelReason ? { cancelReason: it.cancelReason } : {}),
      ...(it.cancelledAmount !== undefined ? { cancelledAmount: toPaise(it.cancelledAmount) } : {}),
      ...(it.cancelledBy ? { cancelledBy: it.cancelledBy } : {}),
      ...(it.cancelledAt ? { cancelledAt: it.cancelledAt } : {}),
      ...(it.seat ? { seat: it.seat } : {}),
      ...(it.sentAt ? { sentAt: it.sentAt } : {}),
      ...(it.readyAt ? { readyAt: it.readyAt } : {}),
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
      kitchenPriority: order.kitchenPriority,
      kitchenPriorityRev: order.kitchenPriorityRev,
      kitchenPriorityChangeId: order.kitchenPriorityChangeId,
      orderNumber: order.orderNumber,
      tokenNumber: order.tokenNumber,
      cashierName: order.cashierName,
      captainName: order.captainName,
      billRequestedAt: order.billRequestedAt,
      billSplitNote: order.billSplitNote,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      guestCount: order.guestCount,
      createdAt: order.createdAt,
      sourceType: order.source_type,
      acceptedBy: order.acceptedByDeviceId,
      businessDayId: order.businessDayId,
      paymentTransactionId: order.paymentTransactionId,
      refundAmountPaise: order.refundAmount === undefined ? undefined : toPaise(order.refundAmount),
      tenderedAmountPaise: order.tenderedAmount !== undefined ? toPaise(order.tenderedAmount) : undefined,
      paymentSplits: order.paymentSplits?.map((l) => ({ method: l.method, amountPaise: toPaise(l.amount) })),
      cgstPaise: toPaise(order.cgstAmount),
      sgstPaise: toPaise(order.sgstAmount),
      roundOffPaise: toPaise(order.roundOffAmount),
      serviceChargePaise: toPaise(order.serviceChargeAmount),
      tipPaise: toPaise(order.tipAmount),
      staffSession: StaffSession.sessionToken(),
      approvalSession: StaffSession.approvalToken()
    },
    updatedAt: order.updatedAt
  };
}

function orderItemFromRemote(orderId: string, ri: OrderSyncPushItem): OrderItem {
  const details: NonNullable<OrderSyncPushItem['modifierDetails']> = ri.modifierDetails && ri.modifierDetails.length > 0
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
      groupId: d.groupId ?? `remote-${i}`,
      groupName: d.groupName ?? '',
      optionId: d.optionId ?? `remote-${i}`,
      optionName: d.optionName,
      priceDelta: fromPaise(d.priceDelta)
    })) as OrderItem['modifiers'],
    ...(ri.snapshot ? { snapshot: ri.snapshot } : {}),
    specialInstructions: ri.specialInstructions,
    totalPrice: fromPaise(ri.lineTotal),
    kitchenStatus: (ri.kitchenStatus as OrderItem['kitchenStatus']) || 'PENDING',
    ...(ri.statusRev ? { statusRev: ri.statusRev } : {}),
    ...(ri.course ? { course: ri.course } : {}),
    ...(ri.cancelReason ? { cancelReason: ri.cancelReason } : {}),
    ...(ri.cancelledAmount !== undefined ? { cancelledAmount: fromPaise(ri.cancelledAmount) } : {}),
    ...(ri.cancelledBy ? { cancelledBy: ri.cancelledBy } : {}),
    ...(ri.cancelledAt ? { cancelledAt: ri.cancelledAt } : {}),
    ...(ri.seat ? { seat: ri.seat } : {}),
    ...(ri.sentAt ? { sentAt: ri.sentAt } : {}),
    ...(ri.readyAt ? { readyAt: ri.readyAt } : {}),
    // The station travels with the item, so a pulled order splits into the same tickets on every device.
    ...(ri.kitchenStation ? { kitchenStation: ri.kitchenStation } : {})
  } as OrderItem;
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
    if (m.kitchenPriority && compareKitchenPriority(m, local) >= 0) {
      local.kitchenPriority = m.kitchenPriority;
      local.kitchenPriorityRev = m.kitchenPriorityRev;
      local.kitchenPriorityChangeId = m.kitchenPriorityChangeId;
    }
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
  // A Captain table transfer changes an existing order, not its kitchen identity.
  // Update every already-created ticket instead of leaving the old destination on KDS/reprints.
  if (remote.tableLabel !== undefined) {
    local.tableNumber = remote.tableLabel || undefined;
    const destination = db.tables.find(t => t.tableNumber === local.tableNumber);
    if (destination) local.tableId = destination.id;
    db.kots.filter(k => k.orderId === local.id).forEach(k => { k.tableNumber = local.tableNumber; });
  }
  if (remote.meta?.acceptedBy) local.acceptedByDeviceId = remote.meta.acceptedBy;
  if (remote.meta?.billRequestedAt) local.billRequestedAt = remote.meta.billRequestedAt;
  if (remote.meta?.billSplitNote) local.billSplitNote = remote.meta.billSplitNote;
  if (remote.meta?.refundAmountPaise !== undefined) local.refundAmount = fromPaise(remote.meta.refundAmountPaise);
  let addedItems = false;
  remote.items.forEach((ri) => {
    const li = local.items.find((i) => i.id === ri.externalItemId);
    if (li) {
      // Item-level kitchenStatus is what another device (KDS marking
      // PREPARING/READY, Captain marking SERVED) is actually changing.
      // Progress only moves forward, except that a copy with a higher revision (an undo or a cancellation) replaces an older one.
      const merged = resolveKitchenState({ status: li.kitchenStatus, rev: li.statusRev }, { status: ri.kitchenStatus, rev: ri.statusRev });
      if (merged.status) li.kitchenStatus = merged.status as OrderItem['kitchenStatus'];
      if (merged.rev > 0) li.statusRev = merged.rev;
      if (ri.course && !li.course) li.course = ri.course;
      if (ri.seat && !li.seat) li.seat = ri.seat;
      if (ri.sentAt && !li.sentAt) li.sentAt = ri.sentAt;
      // The time a dish was done belongs to it only while it is done; an undo clears it everywhere.
      if (li.kitchenStatus === 'READY' || li.kitchenStatus === 'SERVED') li.readyAt = li.readyAt ?? ri.readyAt;
      else li.readyAt = undefined;
      if (li.kitchenStatus === 'CANCELLED') {
        // A cancelled dish is at no charge on every device.
        li.cancelReason = ri.cancelReason ?? li.cancelReason;
        if (ri.cancelledAmount !== undefined && li.cancelledAmount === undefined) li.cancelledAmount = fromPaise(ri.cancelledAmount);
        li.cancelledBy = li.cancelledBy ?? ri.cancelledBy;
        li.cancelledAt = li.cancelledAt ?? ri.cancelledAt;
        li.unitPrice = 0;
        li.totalPrice = 0;
      } else if (ri.quantity !== li.quantity) {
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
    refundAmount: m.refundAmountPaise === undefined ? undefined : fromPaise(m.refundAmountPaise),
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
    acceptedByDeviceId: m.acceptedBy,
    billRequestedAt: m.billRequestedAt,
    billSplitNote: m.billSplitNote,
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
/** Which round of tickets this is for the order (1 for the first, 2 for the first add-on round, ...), read from the tickets already made. */
function qrKotIdentity(order: Order): { idBase: string; numberBase: string } {
  const rounds = db.kots
    .filter((k) => k.orderId === order.id)
    .map((k) => /-r(\d+)(?:-|$)/.exec(k.id)?.[1])
    .filter((n): n is string => !!n)
    .map(Number);
  const round = (rounds.length ? Math.max(...rounds) : 0) + 1;
  const label = String(order.tokenNumber || order.orderNumber || order.id).replace(/[^A-Za-z0-9-]/g, '');
  return { idBase: `kot-${order.id}-r${round}`, numberBase: round === 1 ? `KOT-${label}` : `KOT-${label}-R${round}` };
}

function ensureKotsForOrder(order: Order): void {
  if (['DRAFT', 'CANCELLED', 'REFUNDED'].includes(order.orderStatus)) return;
  // A paid counter bill may still have submitted dishes being prepared; unsent historical bills must not become tickets.
  if (order.orderStatus === 'COMPLETED' && order.source_type !== 'KIOSK' && !order.items.some(it => it.sentAt)) return;
  if (order.source_type === 'KIOSK' && order.paymentMethod === 'UPI' && order.paymentStatus !== 'SUCCESS') return;

  // A ticket line that knows its order line covers exactly that line; older ones cover by dish and quantity.
  const coveredLineIds = new Set<string>();
  const covered = new Map<string, number>();
  db.kots
    .filter((k) => k.orderId === order.id)
    .forEach((k) => k.items.forEach((i) => {
      if (i.orderItemId) coveredLineIds.add(i.orderItemId);
      else if (i.status !== 'CANCELLED') covered.set(i.menuItemId, (covered.get(i.menuItemId) || 0) + i.quantity);
    }));

  const missing = order.items
    .filter((it) => !['CANCELLED', 'SERVED'].includes(it.kitchenStatus ?? 'PENDING') && !coveredLineIds.has(it.id))
    .map((it) => {
      const already = covered.get(it.menuItemId) || 0;
      const take = Math.min(already, it.quantity);
      covered.set(it.menuItemId, already - take);
      return { it, qty: it.quantity - take };
    })
    .filter((x) => x.qty > 0);
  if (missing.length === 0) return;

  // A QR order's kitchen ticket is derived from the order itself, never from this device's clock or counters, so every
  // POS, Kiosk and KDS that pulls the order builds the SAME ticket (same id, same number) and none can collide.
  const qr = order.source_type === 'QR_TABLE' ? qrKotIdentity(order) : undefined;
  KOTRepository.generateKOT({
    ...(qr ?? {}),
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
      status: it.kitchenStatus || 'PENDING',
      orderItemId: it.id,
      ...(it.course ? { course: it.course } : {}),
      ...(it.seat ? { seat: it.seat } : {}),
      ...(it.statusRev ? { rev: it.statusRev } : {})
    })),
    cashierName: order.captainName || order.cashierName || '',
    serverName: order.captainName,
    orderNotes: order.customerNotes
  });
}

export class SyncOutboxEngine {
  private static isSyncing = false;
  private static runAgain = false;
  private static leasing = false;
  private static pullInFlight: Promise<{ pulled: number; created: number }> | null = null;
  private static pullAgain = false;
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
    const deviceId = transport?.deviceId?.();
    EndpointResolver.setIdentity(deviceId ? `${deviceId}:${KeyValueStore.get('jamanvaar_bound_branch_id') || 'all'}` : null);
    if (transport && !this.isSyncing) {
      for (const order of db.orders) if (order.syncStatus === 'SYNCING') order.syncStatus = 'SAVED_LOCALLY';
      // Rebuild a missing local projection at startup even if the cursor already acknowledged that order's latest version.
      db.batch(() => db.orders.forEach(ensureKotsForOrder));
    }
    NumberAllocator.reload();
    this.unsubscribeNetwork?.();
    this.unsubscribeNetwork = null;

    if (transport) {
      let wasOnline = NetworkStatusService.isOnline();
      this.unsubscribeNetwork = NetworkStatusService.subscribe((state) => {
        // SYNCING is still connected. Only a real offline-to-online transition is a reconnect.
        if (state === 'SYNCING') return;
        const reconnect = state === 'ONLINE' && !wasOnline;
        wasOnline = state === 'ONLINE';
        if (reconnect && !this.isSyncing) {
          void this.processOutbox({ ignoreBackoff: true });
          void this.catchUpFromCloud();
        }
      });
    }
  }

  /** Tops up the leased number blocks while online. A failure just means fallback numbering keeps working. */
  private static async refillNumberLeases(): Promise<void> {
    const t = this.transport;
    if (!t?.leaseNumbers || this.leasing) return; // one refill at a time, never two overlapping requests for the same block
    this.leasing = true;
    try {
      await this.refillLeasesInner(t);
    } finally {
      this.leasing = false;
    }
  }

  private static async refillLeasesInner(t: OrderSyncTransport): Promise<void> {
    if (!t.leaseNumbers) return;
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
    if (this.isSyncing) {
      // A change made while a push is in flight is not sent by it; remember to run again the moment it finishes
      // instead of leaving that change (a dish marked ready, say) waiting for the next timer tick.
      this.runAgain = true;
      return { processed: 0, failed: 0 };
    }
    this.isSyncing = true;
    this.runAgain = false;
    const transport = this.transport;
    try {
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
      if (!transport) {
        // No transport configured is a device-activation gap, not a
        // connectivity blip — fail loud instead of the old stub's silent
        // "SYNCED" so a caller can never mistake this for a real round-trip.
        for (const ord of pendingOrders) {
          ord.syncStatus = 'FAILED';
          failed++;
        }
      } else {
        const events = new Map(pendingOrders.map((order) => [order.id, toPushEvent(order)]));
        for (const payload of jsonBatches([...events.values()], 100, 1_500_000)) {
        if (transport !== this.transport) break;
        const ids = new Set(payload.map((event) => event.externalOrderId));
        const batch = pendingOrders.filter((order) => ids.has(order.id));
        const startedAt = Date.now();
        batch.forEach((o) => {
          o.syncStatus = 'SYNCING';
        });
        try {
          const { results } = await transport.push(payload);
          if (transport !== this.transport) break;
          const byId = new Map(results.map((r) => [r.externalOrderId, r]));
          for (const ord of batch) {
            const res = byId.get(ord.id);
            if (res && res.status === 'ok') {
              // While this push was in flight the order shows SYNCING. If it shows SAVED_LOCALLY now, something changed it
              // after the push was built (a cook tapped another dish): that change is not in what the server just received,
              // so the order must stay queued rather than be marked as delivered.
              if (ord.syncStatus !== 'SAVED_LOCALLY') markSynced(ord);
              if (typeof res.syncVersion === 'number') ord.remoteSyncVersion = res.syncVersion;
              processed++;
            } else {
              markFailedAttempt(ord, res?.error ?? 'Not acknowledged by the server');
              if (/BRANCH_FORBIDDEN|Invalid order payload/.test(res?.error ?? '')) ord.syncStatus = 'DEAD_LETTER';
              failed++;
            }
          }
          NetworkStatusService.setNetworkState('ONLINE', Date.now() - startedAt);
        } catch (err) {
          for (const ord of batch) {
            markFailedAttempt(ord, err instanceof Error ? err.message : 'Network error');
            if ([400, 403, 404, 409, 413, 422].includes((err as { status?: number })?.status ?? 0)) ord.syncStatus = 'DEAD_LETTER';
            failed++;
          }
          if (err instanceof TypeError || (err as { code?: string })?.code === 'REQUEST_TIMEOUT') NetworkStatusService.setNetworkState('OFFLINE', 0);
        }
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
      const relatedOrder = relatedOrderId ? db.orders.find((o) => o.id === relatedOrderId) : undefined;

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
    return { processed, failed };
    } finally {
    if (NetworkStatusService.getNetworkState() === 'SYNCING') NetworkStatusService.setNetworkState('ONLINE', NetworkStatusService.getLatency());
    this.isSyncing = false;
    // Run again only when a change really is waiting: the network-state change this function itself causes must not re-trigger it.
    if (this.runAgain) {
      this.runAgain = false;
      if (db.orders.some((o) => o.syncStatus === 'SAVED_LOCALLY')) void this.processOutbox();
    }
    }
  }

  /**
   * Catch-up/replay pull for a (re)connecting device — not just a live push
   * target. Persists the server's own clock (`serverTime`) as the next
   * cursor rather than this device's clock, so client/server clock skew
   * can't cause a missed or re-fetched window.
   */
  public static catchUpFromCloud(): Promise<{ pulled: number; created: number }> {
    if (this.pullInFlight) { this.pullAgain = true; return this.pullInFlight; }
    this.pullInFlight = (async () => {
      let total = { pulled: 0, created: 0 };
      do {
        this.pullAgain = false;
        const result = await this.pullPages();
        total = { pulled: total.pulled + result.pulled, created: total.created + result.created };
      } while (this.pullAgain);
      return total;
    })().finally(() => { this.pullInFlight = null; });
    return this.pullInFlight;
  }

  private static async pullPages(): Promise<{ pulled: number; created: number }> {
    if (!this.transport) return { pulled: 0, created: 0 };

    // A position on the Branch Core means nothing on the cloud (and vice versa), so each has its own cursor.
    const ORDERS_PATH = '/api/v1/orders/sync';
    const cursorKey = EndpointResolver.cursorKey(CATCH_UP_CURSOR_KEY, ORDERS_PATH);
    const predicted = EndpointResolver.serverKeyFor(ORDERS_PATH);
    const savedCursor = safeGet(cursorKey);
    let cursor = savedCursor?.startsWith('seq:') ? savedCursor : 'seq:0';
    let pulled = 0;
    let created = 0;

    try {
      // Follow `hasMore` so a long outage catches up page by page, saving the cursor after each applied page.
      for (let page = 0; page < 50; page++) {
      const transport: OrderSyncTransport = this.transport;
      const { orders, serverTime, latestSeq, hasMore, serverKey } = await transport.pull(cursor);
      if (transport !== this.transport || cursorKey !== EndpointResolver.cursorKey(CATCH_UP_CURSOR_KEY, ORDERS_PATH)) break;
      let deferred = false;
      // If the other server answered (fallback), the orders are still applied (safe, idempotent) but the
      // position it returned belongs to a different server than the cursor that was sent: do not store it.
      const answeredByPredicted = (serverKey ?? EndpointResolver.lastResponder() ?? predicted) === predicted;
      const touchedDays = new Set<string>();
      for (const remote of orders) {
        const existing = db.orders.find((o) => o.id === remote.externalOrderId);
        if (existing) {
          // Who accepted an order is a claim decided by the server (first accept wins), not by timestamps: adopt it
          // even when this device's own copy is newer.
          if (remote.meta?.acceptedBy && existing.acceptedByDeviceId !== remote.meta.acceptedBy) existing.acceptedByDeviceId = remote.meta.acceptedBy;
          // Which copy is newer is decided by the cloud's sequence, never by comparing the cloud's clock with this device's. A device
          // whose clock runs ahead used to ignore every server update. With unsent local changes the push goes first; the merged
          // result comes back on the next pull. Older cloud rows without a sequence still use the timestamp.
          const localPending = existing.syncStatus === 'SAVED_LOCALLY' || existing.syncStatus === 'SYNCING' || existing.syncStatus === 'FAILED';
          if (localPending) deferred = true;
          const remoteIsNewer =
            typeof remote.seq === 'number'
              ? remote.seq > (existing.remoteSeq ?? 0) && !localPending
              : new Date(remote.updatedAt).getTime() >= new Date(existing.updatedAt).getTime();
          if (remoteIsNewer) {
            if (typeof remote.seq === 'number') existing.remoteSeq = remote.seq;
            if (typeof remote.syncVersion === 'number') existing.remoteSyncVersion = remote.syncVersion;
            const added = applyRemoteToLocalOrder(existing, remote);
            // Admission can change without adding lines (online DRAFT -> paid CONFIRMED). Reconcile tickets on every accepted version.
            ensureKotsForOrder(existing);
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
          if (typeof remote.seq === 'number') localOrder.remoteSeq = remote.seq;
          if (typeof remote.syncVersion === 'number') localOrder.remoteSyncVersion = remote.syncVersion;
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
      // Table bill states and bill notifications follow the orders just received, so a bill that arrives before its
      // table (or the other way round) still shows up on this device.
      refreshBillState();
      // Prefer the gapless sequence; use the server clock only while no sequenced row has been seen.
      if (deferred) break; // retry this page after the local push; do not acknowledge unapplied updates
      cursor = typeof latestSeq === 'number' ? `seq:${latestSeq}` : serverTime;
      if (!answeredByPredicted) break;
      safeSet(cursorKey, cursor);
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
