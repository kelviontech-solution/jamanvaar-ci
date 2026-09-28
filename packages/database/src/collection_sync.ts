import { KeyValueStore } from './key_value_store';
import type { CashMovement, Category, ComboDeal, Coupon, CustomerAccount, CustomerFeedback, MenuItem, ModifierGroup, ShiftRecord, TaxGroup } from '@jamanvaar/types';
import { db } from './db';

/**
 * Cross-device sync for a list of records that any device may edit (BUG-149) - used for the menu (dishes and
 * categories). It replaces "every device uploads its whole list every 15 seconds", which had three faults:
 * a device overwrote the cloud's newer edit with its own stale copy before it downloaded anything; a deleted
 * dish came back within seconds because whoever still held it re-uploaded it; and the same 135 dishes were
 * re-written on every tick.
 *
 * Instead, like the floor plan (`TableSync`): local edits are detected and stamped with a time, only what
 * changed is pushed, a remote change is applied only when it is newer than the local copy, and a deletion
 * travels as a tombstone that stops the record coming back. A device that has never synced records a baseline
 * instead of stamping, so its untouched starter data can never overwrite a real menu someone else pushed.
 *
 * Deletions are recorded only when a person deletes a record (`recordDeletion`), never inferred from a record
 * being absent: clearing the demo menu on activation, or replacing a menu, must not delete anything in the cloud.
 */

const EPOCH = '1970-01-01T00:00:00.000Z';

interface SyncState {
  /** Signature of every record the last time this device looked; undefined until the first baseline. */
  sigs?: Record<string, string>;
  /** Signature of every record as last pushed to (or received from) the cloud. */
  pushed: Record<string, string>;
  /** Deleted records not yet pushed: id -> deletion time. */
  tombstones: Record<string, string>;
}

export interface CollectionSyncRecord {
  externalId: string;
  payload: Record<string, unknown>;
}

type Syncable = { updatedAt?: string };

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(obj[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function time(value: unknown): number {
  const ms = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isNaN(ms) ? 0 : ms;
}

export class CollectionSync<T extends Syncable> {
  private memory: SyncState = { pushed: {}, tombstones: {} };
  private loaded = false;

  constructor(
    private readonly storageKey: string,
    /** The live array (read each time: an app may replace the array itself). */
    private readonly list: () => T[],
    /** Whether a remote payload is a record of this kind at all. */
    private readonly accepts: (remote: Record<string, unknown>) => boolean,
    /** The field that identifies a record: `id`, or `phone` for a customer. */
    private readonly idKey: string = 'id'
  ) {}

  private idOf(record: T): string {
    return String((record as unknown as Record<string, unknown>)[this.idKey] ?? '');
  }

  private load(): SyncState {
    if (this.loaded) return this.memory;
    this.loaded = true;
    try {
      const raw = KeyValueStore.get(this.storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SyncState>;
        this.memory = { sigs: parsed.sigs, pushed: parsed.pushed ?? {}, tombstones: parsed.tombstones ?? {} };
      }
    } catch {
      // Unreadable state just means this device re-baselines.
    }
    return this.memory;
  }

  private save(): void {
    try {
      KeyValueStore.set(this.storageKey, JSON.stringify(this.memory));
    } catch {
      // Storage unavailable - state stays in memory for this session.
    }
  }

  /** What counts as a change: every field except the change time itself. */
  private signature(record: Record<string, unknown>): string {
    const { updatedAt: _ignored, ...rest } = record;
    return stable(rest);
  }

  /** Records local edits: stamps changed records with `now`. The first call only records a baseline. */
  public stampChanges(now: string = new Date().toISOString()): void {
    const state = this.load();
    const baseline = state.sigs === undefined;
    const sigs: Record<string, string> = state.sigs ?? {};
    for (const record of this.list()) {
      const sig = this.signature(record as unknown as Record<string, unknown>);
      if (!baseline && sigs[this.idOf(record)] !== sig) record.updatedAt = now;
      sigs[this.idOf(record)] = sig;
    }
    state.sigs = sigs;
    this.save();
  }

  /** Called when a person deletes a record, so the deletion reaches the other devices. */
  public recordDeletion(id: string, now: string = new Date().toISOString()): void {
    const state = this.load();
    state.tombstones[id] = now;
    if (state.sigs) delete state.sigs[id];
    delete state.pushed[id];
    this.save();
  }

  /** Everything the cloud has not seen yet: changed records plus pending deletions. */
  public collectSyncRecords(): CollectionSyncRecord[] {
    const state = this.load();
    const records: CollectionSyncRecord[] = [];
    for (const record of this.list()) {
      const asRecord = record as unknown as Record<string, unknown>;
      if (state.pushed[this.idOf(record)] !== this.signature(asRecord)) {
        records.push({ externalId: this.idOf(record), payload: { ...asRecord, updatedAt: record.updatedAt ?? EPOCH } });
      }
    }
    for (const [id, at] of Object.entries(state.tombstones)) {
      records.push({ externalId: id, payload: { [this.idKey]: id, deleted: true, updatedAt: at } });
    }
    return records;
  }

  /** Call after the cloud confirmed a push. */
  public markPushed(records: CollectionSyncRecord[]): void {
    const state = this.load();
    for (const r of records) {
      if (r.payload.deleted) {
        delete state.tombstones[r.externalId];
        delete state.pushed[r.externalId];
      } else {
        state.pushed[r.externalId] = this.signature(r.payload);
      }
    }
    this.save();
  }

  /** Applies one record pulled from the cloud. The newer change wins; an older one is ignored. */
  public applyRemote(remote: Record<string, unknown>): void {
    const id = remote?.[this.idKey];
    if (typeof id !== 'string' || !id) return;
    const state = this.load();
    const remoteTime = time(remote.updatedAt);
    const list = this.list();
    const idx = list.findIndex((r) => this.idOf(r) === id);

    if (remote.deleted === true) {
      if (idx >= 0 && time(list[idx].updatedAt) <= remoteTime) {
        list.splice(idx, 1);
        if (state.sigs) delete state.sigs[id];
        delete state.pushed[id];
        this.save();
        db.notify();
      }
      return;
    }
    if (!this.accepts(remote)) return;

    // We deleted it more recently than this copy was written: the deletion stands.
    const deletedAt = state.tombstones[id];
    if (deletedAt && time(deletedAt) >= remoteTime) return;

    const incoming = { ...remote } as unknown as T;
    if (typeof remote.updatedAt !== 'string') incoming.updatedAt = EPOCH;

    if (idx < 0) {
      list.push(incoming);
    } else {
      const local = list[idx];
      if (remoteTime < time(local.updatedAt)) return;
      // Update in place: screens may hold references to these objects.
      const target = local as unknown as Record<string, unknown>;
      for (const key of Object.keys(target)) delete target[key];
      Object.assign(target, incoming);
    }

    const applied = this.list().find((r) => this.idOf(r) === id)!;
    const sig = this.signature(applied as unknown as Record<string, unknown>);
    if (state.sigs) state.sigs[id] = sig;
    state.pushed[id] = sig;
    delete state.tombstones[id];
    this.save();
    db.notify();
  }

  /** True when this device holds no record of this kind at all. */
  public isEmpty(): boolean {
    return this.list().length === 0;
  }

  /** Forget all bookkeeping: the next stamp is a fresh baseline (used when a device is activated to a restaurant). */
  public reset(): void {
    this.memory = { pushed: {}, tombstones: {} };
    this.loaded = true;
    this.save();
  }
}

export const MenuItemSync = new CollectionSync<MenuItem>(
  'jamanvaar_menu_item_sync_v1',
  () => db.menuItems,
  (r) => typeof r.name === 'string' && r.name.length > 0
);

/**
 * A dish's modifier groups and its tax group are part of its price, so they travel with the menu. The guest ordering
 * page prices from the restaurant's OWN groups and rates (never a platform-wide list), which means the restaurant has to
 * publish them next to its dishes.
 */
export const ModifierGroupSync = new CollectionSync<ModifierGroup & { updatedAt?: string }>(
  'jamanvaar_modifier_group_sync_v1',
  () => db.modifierGroups as Array<ModifierGroup & { updatedAt?: string }>,
  (r) => typeof r.name === 'string' && r.name.length > 0 && Array.isArray(r.options)
);

export const TaxGroupSync = new CollectionSync<TaxGroup & { updatedAt?: string }>(
  'jamanvaar_tax_group_sync_v1',
  () => db.taxGroups as Array<TaxGroup & { updatedAt?: string }>,
  (r) => typeof r.name === 'string' && r.name.length > 0
);

export const CategorySync = new CollectionSync<Category>(
  'jamanvaar_menu_category_sync_v1',
  () => db.categories,
  (r) => typeof r.name === 'string' && r.name.length > 0
);

// Kiosk Admin's combos and coupons and the guests' feedback (BUG-130/133/136): each lives in one device's local
// storage, so none of it reached the other devices. Same rules as the menu.
export const ComboSync = new CollectionSync<ComboDeal>(
  'jamanvaar_combo_sync_v1',
  () => db.combos,
  (r) => typeof r.name === 'string' && r.name.length > 0
);

export const CouponSync = new CollectionSync<Coupon>(
  'jamanvaar_coupon_sync_v1',
  () => db.coupons,
  (r) => typeof r.code === 'string' && r.code.length > 0
);

export const FeedbackSync = new CollectionSync<CustomerFeedback>(
  'jamanvaar_feedback_sync_v1',
  () => db.feedbacks,
  (r) => typeof r.rating === 'number'
);

// Guests (BUG-159): registered at the POS, but the owner's CRM in Restaurant Admin never saw them. A guest is
// identified by phone number.
export const CustomerSync = new CollectionSync<CustomerAccount>(
  'jamanvaar_customer_sync_v1',
  () => db.customerAccounts,
  (r) => typeof r.phone === 'string' && r.phone.length > 0,
  'phone'
);

// B2-056: cash-drawer shifts and their cash movements (payouts/cash-drops) only ever lived on the
// POS device that opened them — Restaurant Admin's own Shift & Cash Drawer Ledger, Reconciliation
// and Official EOD Z-Report pages read from a local `db.shifts`/`db.cashMovements` that never
// received them, so it showed "No Active Register Shift" while POS had one genuinely open. Only
// POS ever opens/edits its own shift, so this is push-from-POS, pull-everywhere-else, the same
// shape as the menu. `ShiftRepository.getActiveShift()` already recomputes totals from this
// device's own (already-synced) orders on every read, so a synced-in shift's *identity* (id,
// status, openedAt, cashierName, posId) is what matters — its pulled totals get immediately
// overwritten by that device's own correct recompute the next time anything reads it.
export const ShiftSync = new CollectionSync<ShiftRecord>(
  'jamanvaar_shift_sync_v1',
  () => db.shifts,
  (r) => typeof r.posId === 'string' && r.posId.length > 0 && typeof r.status === 'string'
);

export const CashMovementSync = new CollectionSync<CashMovement>(
  'jamanvaar_cash_movement_sync_v1',
  () => db.cashMovements,
  (r) => typeof r.shiftId === 'string' && r.shiftId.length > 0
);
