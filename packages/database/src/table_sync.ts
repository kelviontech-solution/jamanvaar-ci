import type { DiningTable, TableStatus } from '@jamanvaar/types';
import { db } from './db';

/**
 * Cross-device dining-table sync (BUG-096/097). Every terminal keeps its own local copy of the
 * floor plan, so a table added in Restaurant Admin never reached Captain or POS, and a table seated
 * on Captain looked vacant on POS. This is the shared logic each app's sync tick uses: local edits
 * are detected and stamped with a time, changed tables are pushed, remote ones are applied, and the
 * newer change wins. A deleted table travels as a tombstone.
 *
 * A device that has never synced records a baseline instead of stamping — its untouched demo seed
 * must never overwrite a real floor plan someone else already pushed.
 */

const EPOCH = '1970-01-01T00:00:00.000Z';
const STORAGE_KEY = 'jamanvaar_table_sync_v1';
const STATUSES: TableStatus[] = ['AVAILABLE', 'OCCUPIED', 'RESERVED', 'BILLING', 'BILL_REQUESTED', 'CLEANING', 'BLOCKED'];

interface SyncState {
  /** Signature of every table the last time this device looked; undefined until the first baseline. */
  sigs?: Record<string, string>;
  /** Signature of every table as last pushed to the cloud. */
  pushed: Record<string, string>;
  /** Deleted tables not yet pushed: id -> deletion time. */
  tombstones: Record<string, string>;
}

export interface TableSyncRecord {
  externalId: string;
  payload: Record<string, unknown>;
}

let memory: SyncState = { pushed: {}, tombstones: {} };
let loaded = false;

function load(): SyncState {
  if (loaded) return memory;
  loaded = true;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SyncState>;
      memory = { sigs: parsed.sigs, pushed: parsed.pushed ?? {}, tombstones: parsed.tombstones ?? {} };
    }
  } catch {
    // Unreadable state just means this device re-baselines.
  }
  return memory;
}

function save(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch {
    // Storage unavailable — state stays in memory for this session.
  }
}

/** What counts as a change worth syncing. Daily counters and QR bookkeeping are left out on purpose. */
function signature(t: Partial<DiningTable>): string {
  return JSON.stringify([
    t.tableNumber,
    t.branchId ?? null,
    t.capacity,
    t.zone,
    t.floor,
    t.status,
    t.currentGuests ?? null,
    t.currentOrderId ?? null,
    t.isActive,
    t.openedById ?? null,
    t.openedByName ?? null,
    t.qrToken ?? null,
    t.qrStatus ?? null
  ]);
}

function time(value: unknown): number {
  const ms = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isNaN(ms) ? 0 : ms;
}

function toPayload(t: DiningTable): Record<string, unknown> {
  return {
    id: t.id,
    outletId: t.outletId,
    ...(t.branchId ? { branchId: t.branchId } : {}),
    tableNumber: t.tableNumber,
    capacity: t.capacity,
    zone: t.zone,
    floor: t.floor,
    status: t.status,
    isActive: t.isActive,
    currentGuests: t.currentGuests ?? null,
    currentOrderId: t.currentOrderId ?? null,
    openedById: t.openedById ?? null,
    openedByName: t.openedByName ?? null,
    qrCodeUrl: t.qrCodeUrl,
    qrShortCode: t.qrShortCode,
    qrToken: t.qrToken,
    qrStatus: t.qrStatus,
    updatedAt: t.updatedAt ?? EPOCH
  };
}

export class TableSync {
  /** Records local edits: stamps changed tables with `now`, and notes tables that disappeared. */
  public static stampChanges(now: string = new Date().toISOString()): void {
    const state = load();
    const baseline = state.sigs === undefined;
    const sigs: Record<string, string> = state.sigs ?? {};

    for (const t of db.tables) {
      const sig = signature(t);
      if (!baseline && sigs[t.id] !== sig) t.updatedAt = now;
      sigs[t.id] = sig;
    }
    if (!baseline) {
      const present = new Set(db.tables.map((t) => t.id));
      for (const id of Object.keys(sigs)) {
        if (!present.has(id)) {
          state.tombstones[id] = state.tombstones[id] ?? now;
          delete sigs[id];
        }
      }
    }
    state.sigs = sigs;
    save();
  }

  /** Called by `TableRepository.deleteTable` so a deletion is never missed. */
  public static recordDeletion(id: string, now: string = new Date().toISOString()): void {
    const state = load();
    state.tombstones[id] = now;
    if (state.sigs) delete state.sigs[id];
    delete state.pushed[id];
    save();
  }

  /** Everything the cloud has not seen yet: changed tables plus pending deletions. */
  public static collectSyncRecords(): TableSyncRecord[] {
    const state = load();
    const records: TableSyncRecord[] = [];
    for (const t of db.tables) {
      if (state.pushed[t.id] !== signature(t)) records.push({ externalId: t.id, payload: toPayload(t) });
    }
    for (const [id, at] of Object.entries(state.tombstones)) {
      records.push({ externalId: id, payload: { id, deleted: true, updatedAt: at } });
    }
    return records;
  }

  /** Call after a successful push. */
  public static markPushed(records: TableSyncRecord[]): void {
    const state = load();
    for (const r of records) {
      if (r.payload.deleted) {
        delete state.tombstones[r.externalId];
        delete state.pushed[r.externalId];
      } else {
        state.pushed[r.externalId] = signature(r.payload as Partial<DiningTable>);
      }
    }
    save();
  }

  /** Applies one table pulled from the cloud. The newer change wins; equal or older changes are ignored. */
  public static applyRemote(remote: Record<string, unknown>): void {
    const id = remote?.id;
    if (typeof id !== 'string' || !id) return;
    const state = load();
    const remoteTime = time(remote.updatedAt);
    const idx = db.tables.findIndex((t) => t.id === id);

    if (remote.deleted === true) {
      if (idx >= 0 && time(db.tables[idx].updatedAt) <= remoteTime) {
        db.tables.splice(idx, 1);
        if (state.sigs) delete state.sigs[id];
        delete state.pushed[id];
        save();
        db.notify();
      }
      return;
    }

    if (typeof remote.tableNumber !== 'string' || !remote.tableNumber) return;
    const status = STATUSES.includes(remote.status as TableStatus) ? (remote.status as TableStatus) : 'AVAILABLE';
    const optional = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
    const incoming: DiningTable = {
      id,
      outletId: optional(remote.outletId) ?? db.outlet.id,
      branchId: optional(remote.branchId),
      tableNumber: remote.tableNumber,
      capacity: typeof remote.capacity === 'number' && remote.capacity > 0 ? remote.capacity : 4,
      zone: optional(remote.zone) ?? 'Main Hall',
      floor: typeof remote.floor === 'number' ? remote.floor : 1,
      status,
      isActive: remote.isActive !== false,
      currentGuests: typeof remote.currentGuests === 'number' ? remote.currentGuests : undefined,
      currentOrderId: optional(remote.currentOrderId),
      // A table that is free again is nobody's (it can still arrive carrying the last waiter's name).
      openedById: status === 'AVAILABLE' ? undefined : optional(remote.openedById),
      openedByName: status === 'AVAILABLE' ? undefined : optional(remote.openedByName),
      qrCodeUrl: optional(remote.qrCodeUrl),
      qrShortCode: optional(remote.qrShortCode),
      qrToken: optional(remote.qrToken),
      qrStatus: (optional(remote.qrStatus) as DiningTable['qrStatus']) ?? undefined,
      updatedAt: typeof remote.updatedAt === 'string' ? remote.updatedAt : EPOCH
    };

    if (idx < 0) {
      db.tables.push(incoming);
    } else {
      const local = db.tables[idx];
      if (remoteTime < time(local.updatedAt)) return;
      // Update in place: screens hold references to these table objects. Daily counters stay
      // local, and QR details a remote copy lacks are not blanked.
      const merged: DiningTable = {
        ...incoming,
        // The branch is set by the restaurant's console; a copy that lacks it must not erase it.
        branchId: incoming.branchId ?? local.branchId,
        qrCodeUrl: incoming.qrCodeUrl ?? local.qrCodeUrl,
        qrShortCode: incoming.qrShortCode ?? local.qrShortCode,
        qrToken: incoming.qrToken ?? local.qrToken,
        qrStatus: incoming.qrStatus ?? local.qrStatus,
        totalOrdersToday: local.totalOrdersToday,
        totalRevenueToday: local.totalRevenueToday,
        lastOrderId: local.lastOrderId,
        lastOrderTime: local.lastOrderTime
      };
      const target = local as unknown as Record<string, unknown>;
      for (const key of Object.keys(target)) delete target[key];
      for (const [key, value] of Object.entries(merged)) if (value !== undefined) target[key] = value;
    }

    const applied = db.tables.find((t) => t.id === id)!;
    if (state.sigs) state.sigs[id] = signature(applied);
    state.pushed[id] = signature(applied);
    save();
    db.notify();
  }

  /** Test helper: forget all sync bookkeeping. */
  public static resetForTests(): void {
    memory = { pushed: {}, tombstones: {} };
    loaded = true;
    save();
  }
}
