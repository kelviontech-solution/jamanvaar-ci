/**
 * Collision-free human numbers (orders, KOTs) across devices that may be offline at the same time.
 *
 * While online a device leases a block of numbers from the server (POST /sync/number-leases); blocks
 * are disjoint per branch and business day, so numbering from a block cannot collide with any other
 * device. If a block runs out (or none was ever leased) before the device can reach the server, it
 * falls back to `<branch>-<date>-<device>-<n>`, which no other device can produce. Every number is
 * persisted before it is handed out, so a restart never reissues one.
 *
 * Returns null when the device isn't configured (not activated), so callers keep their legacy numbering.
 */

export type NumberKind = 'ORDER' | 'KOT';

export interface NumberLease {
  kind: NumberKind;
  prefix: string;
  businessDate: string; // YYYYMMDD
  start: number;
  count: number;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface State {
  config: { deviceCode: string; branchCode: string; timezone: string } | null;
  /** Unused leased blocks, oldest first. `used` counts numbers already issued from the block. */
  leases: Array<NumberLease & { used: number }>;
  /** Fallback counters keyed `kind:date`. */
  fallback: Record<string, number>;
}

const KEY = 'jamanvaar_number_alloc_v1';

function businessDateOf(now: Date, timezone: string): string {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  } catch {
    parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  }
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}${get('month')}${get('day')}`;
}

const pad = (n: number) => String(n).padStart(3, '0');

export class NumberAllocator {
  private static storage: StorageLike | null = null;
  private static state: State = { config: null, leases: [], fallback: {} };

  private static defaultStorage(): StorageLike | null {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
      return null;
    }
  }

  private static persist(): void {
    try {
      (this.storage ?? this.defaultStorage())?.setItem(KEY, JSON.stringify(this.state));
    } catch {
      // Storage full/unavailable: numbering continues from memory for this session.
    }
  }

  /** Loads persisted state; call once at startup (and in tests to simulate a restart). */
  static reload(storage: StorageLike | null = this.defaultStorage()): void {
    this.storage = storage;
    try {
      const raw = storage?.getItem(KEY);
      if (raw) this.state = { config: null, leases: [], fallback: {}, ...JSON.parse(raw) };
    } catch {
      this.state = { config: null, leases: [], fallback: {} };
    }
  }

  static reset(storage: StorageLike | null = null): void {
    this.storage = storage;
    this.state = { config: null, leases: [], fallback: {} };
  }

  static configure(config: { deviceCode: string; branchCode: string; timezone?: string }): void {
    this.state.config = { deviceCode: config.deviceCode, branchCode: config.branchCode, timezone: config.timezone ?? 'Asia/Kolkata' };
    this.persist();
  }

  static isConfigured(): boolean {
    return this.state.config !== null;
  }

  static addLease(lease: NumberLease): void {
    this.state.leases.push({ ...lease, used: 0 });
    this.persist();
  }

  /** Numbers still available from leased blocks for today. */
  static remaining(kind: NumberKind, now: Date = new Date()): number {
    const cfg = this.state.config;
    if (!cfg) return 0;
    const date = businessDateOf(now, cfg.timezone);
    return this.state.leases
      .filter((l) => l.kind === kind && l.businessDate === date)
      .reduce((sum, l) => sum + (l.count - l.used), 0);
  }

  static needsRefill(kind: NumberKind, now: Date = new Date(), threshold = 10): boolean {
    return this.isConfigured() && this.remaining(kind, now) <= threshold;
  }

  static next(kind: NumberKind, now: Date = new Date()): string | null {
    const cfg = this.state.config;
    if (!cfg) return null;
    const date = businessDateOf(now, cfg.timezone);

    // Drop blocks from earlier days: they are never reused.
    this.state.leases = this.state.leases.filter((l) => l.businessDate >= date);

    const lease = this.state.leases.find((l) => l.kind === kind && l.businessDate === date && l.used < l.count);
    let result: string;
    if (lease) {
      result = `${lease.prefix}-${date}-${pad(lease.start + lease.used)}`;
      lease.used++;
    } else {
      const key = `${kind}:${date}`;
      const n = (this.state.fallback[key] ?? 0) + 1;
      this.state.fallback[key] = n;
      result = `${cfg.branchCode}-${date}-${cfg.deviceCode}-${pad(n)}`;
    }
    this.persist();
    return result;
  }
}
