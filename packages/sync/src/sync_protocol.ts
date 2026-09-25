/**
 * The one shared vocabulary for every sync path (POS, KDS, Captain, Kiosk, QR): event identity,
 * retry policy, priority and conflict policy. Pure functions only, so apps and tests share it.
 */

export type SyncOpStatus = 'PENDING' | 'PROCESSING' | 'SYNCED' | 'FAILED' | 'CONFLICT' | 'DEAD_LETTER';

export type ConflictPolicy =
  | 'SERVER_AUTHORITATIVE'
  | 'IDEMPOTENT_MERGE'
  | 'EVENT_MERGE'
  | 'SINGLE_COMMIT'
  | 'STRICT_AUTHORIZATION'
  | 'STATE_TRANSITION'
  | 'LEDGER'
  | 'BRANCH_CONFLICT'
  | 'VERSIONED';

/** Per entity, never one universal rule. Nothing here is last-write-wins. */
export const CONFLICT_POLICY = {
  MENU: 'SERVER_AUTHORITATIVE',
  PRICE: 'SERVER_AUTHORITATIVE',
  ORDER: 'IDEMPOTENT_MERGE',
  ORDER_ITEM: 'EVENT_MERGE',
  PAYMENT: 'SINGLE_COMMIT',
  REFUND: 'STRICT_AUTHORIZATION',
  KOT_STATUS: 'STATE_TRANSITION',
  INVENTORY: 'LEDGER',
  TABLE: 'BRANCH_CONFLICT',
  DEVICE_CONFIG: 'VERSIONED',
  USER: 'SERVER_AUTHORITATIVE',
  SETTINGS: 'VERSIONED'
} as const satisfies Record<string, ConflictPolicy>;

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** `<deviceId>-<10 chars of time, sortable><10 random chars>`: unique per device, orderable by creation time. */
export function newEventId(deviceId: string, nowMs: number = Date.now(), rng: () => number = Math.random): string {
  let t = Math.floor(nowMs);
  let time = '';
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD[t % 32] + time;
    t = Math.floor(t / 32);
  }
  let rand = '';
  for (let i = 0; i < 10; i++) rand += CROCKFORD[Math.floor(rng() * 32) % 32];
  return `${deviceId}-${time}${rand}`;
}

const BACKOFF_STEPS_MS = [2000, 5000, 15000, 30000, 60000];
const BACKOFF_CAP_MS = 300000;
export const MAX_ATTEMPTS_BEFORE_DEAD_LETTER = 12;

/** Delay before retry number `attempt` (1-based), with +-20% jitter from rng() in [0,1]. */
export function backoffDelayMs(attempt: number, rng: () => number = Math.random): number {
  const base = attempt <= BACKOFF_STEPS_MS.length ? BACKOFF_STEPS_MS[Math.max(0, attempt - 1)] : BACKOFF_CAP_MS;
  const jitter = 0.8 + rng() * 0.4;
  return Math.round(base * jitter);
}

export interface AttemptState {
  attemptCount: number;
  status: SyncOpStatus;
  nextAttemptAt?: number;
}

/** State after one more failed attempt. Failed events are never deleted: after enough attempts they are dead-lettered for an operator. */
export function nextAttemptState(
  current: { attemptCount: number; status: SyncOpStatus },
  nowMs: number,
  rng: () => number = Math.random
): AttemptState {
  const attemptCount = current.attemptCount + 1;
  if (attemptCount >= MAX_ATTEMPTS_BEFORE_DEAD_LETTER) return { attemptCount, status: 'DEAD_LETTER' };
  return { attemptCount, status: 'FAILED', nextAttemptAt: nowMs + backoffDelayMs(attemptCount, rng) };
}

const PRIORITY_ORDER: string[][] = [
  ['PAYMENT', 'ORDER', 'KOT'],
  ['KDS_STATUS', 'INVENTORY'],
  ['MENU_AVAILABILITY', 'TABLE'],
  ['ANALYTICS', 'TELEMETRY']
];

export function eventPriorityRank(entityType: string): number {
  const idx = PRIORITY_ORDER.findIndex((tier) => tier.includes(entityType));
  return idx === -1 ? 2 : idx;
}

const STARVATION_AGE_MS = 60_000;

/** Highest priority first, but anything waiting over a minute is promoted so low priority never starves. */
export function pickNextBatch<T extends { entityType: string; createdAt: number }>(queue: T[], size: number, nowMs: number): T[] {
  const rank = (e: T) => (nowMs - e.createdAt > STARVATION_AGE_MS ? -1 : eventPriorityRank(e.entityType));
  return [...queue].sort((a, b) => rank(a) - rank(b) || a.createdAt - b.createdAt).slice(0, size);
}

/** Human number: `AHD-20260925-024`, or `AHD-20260925-POS02-001` when a device allocates it offline (no cross-device collision). */
export function formatDisplayNumber(branchCode: string, businessDate: Date, sequence: number, offlineDeviceCode?: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(businessDate)
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  const day = `${parts.year}${parts.month}${parts.day}`;
  const seq = String(sequence).padStart(3, '0');
  return offlineDeviceCode ? `${branchCode}-${day}-${offlineDeviceCode}-${seq}` : `${branchCode}-${day}-${seq}`;
}

/** Query string for GET /orders/sync: `seq:<n>` becomes `afterSeq`, anything else is the legacy timestamp `since`. */
export function orderSyncPullQuery(cursor?: string): string {
  if (!cursor) return '';
  if (cursor.startsWith('seq:')) return `?afterSeq=${encodeURIComponent(cursor.slice(4))}`;
  return `?since=${encodeURIComponent(cursor)}`;
}
