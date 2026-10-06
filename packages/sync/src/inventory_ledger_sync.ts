import { KeyValueStore } from '@jamanvaar/database';
import { db } from '@jamanvaar/database';
import type { StockMovement } from '@jamanvaar/types';

/**
 * Client half of cloud/api's inventory ledger. Stock is never overwritten: every local stock change is
 * a movement pushed exactly once, and movements made on other devices are pulled and applied to local
 * stock exactly once, so offline sales from several terminals add up.
 */

export interface PushedMovement {
  movementId: string;
  itemId: string;
  itemName: string;
  type: string;
  quantityDelta: number;
  unit: string;
  orderId?: string;
  reason: string;
  occurredAt: string;
  /** Only honoured by the server for a restaurant-wide device. */
  branchId?: string;
}

export interface RemoteMovement extends PushedMovement {
  seq: number;
  deviceId?: string | null;
}

export interface LedgerTransport {
  push(movements: PushedMovement[]): Promise<{ results: Array<{ movementId: string; status: 'ok' | 'error'; duplicate?: boolean; error?: string }> }>;
  pull(afterSeq: number): Promise<{ movements: RemoteMovement[]; latestSeq: number; hasMore: boolean; serverKey?: 'cloud' | 'core' }>;
}

import { EndpointResolver } from './endpoint_resolver';

const CURSOR_KEY = 'jamanvaar_inventory_ledger_cursor';
const LEDGER_PATH = '/api/v1/inventory/movements';
const PUSH_BATCH = 100;
const MAX_PAGES = 20;

function readCursor(): number {
  try {
    const n = Number(KeyValueStore.get(EndpointResolver.cursorKey(CURSOR_KEY, LEDGER_PATH)));
    return Number.isInteger(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeCursor(seq: number): void {
  try {
    KeyValueStore.set(EndpointResolver.cursorKey(CURSOR_KEY, LEDGER_PATH), String(seq));
  } catch {
    // Storage unavailable: the next sync re-pulls, and applied movements are skipped by their mirror rows.
  }
}

export class InventoryLedgerSync {
  private static transport: LedgerTransport | null = null;
  private static running = false;

  static configureTransport(transport: LedgerTransport | null): void {
    this.transport = transport;
  }

  /** Pushes unsynced local movements, then pulls and applies other devices' movements. Safe to call on every sync tick. */
  static async sync(): Promise<{ pushed: number; applied: number }> {
    const t = this.transport;
    if (!t || this.running) return { pushed: 0, applied: 0 };
    this.running = true;
    let pushed = 0;
    let applied = 0;
    try {
      pushed = await this.pushPending(t);
      applied = await this.pullAndApply(t);
    } finally {
      this.running = false;
    }
    return { pushed, applied };
  }

  private static async pushPending(t: LedgerTransport): Promise<number> {
    const pending = db.stockMovements.filter((m) => !m.syncedAt && !m.remote);
    let pushed = 0;
    for (let i = 0; i < pending.length; i += PUSH_BATCH) {
      if (t !== this.transport) break;
      const batch = pending.slice(i, i + PUSH_BATCH);
      try {
        const { results } = await t.push(
          batch.map((m) => ({
            movementId: m.id, itemId: m.itemId, itemName: m.itemName, type: m.type, quantityDelta: m.quantityDelta,
            unit: m.unit, orderId: m.orderId, reason: m.reason || '', occurredAt: m.timestamp
          }))
        );
        const ok = new Set(results.filter((r) => r.status === 'ok').map((r) => r.movementId));
        const now = new Date().toISOString();
        for (const m of batch) {
          if (ok.has(m.id)) {
            m.syncedAt = now;
            pushed++;
          }
        }
      } catch {
        return pushed; // offline: everything stays unsynced and is retried next tick
      }
    }
    if (pushed > 0) db.notify();
    return pushed;
  }

  private static async pullAndApply(t: LedgerTransport): Promise<number> {
    let applied = 0;
    const cursorKey = EndpointResolver.cursorKey(CURSOR_KEY, LEDGER_PATH);
    const predicted = EndpointResolver.serverKeyFor(LEDGER_PATH);
    try {
      for (let page = 0; page < MAX_PAGES; page++) {
        const { movements, latestSeq, hasMore, serverKey } = await t.pull(readCursor());
        if (t !== this.transport || cursorKey !== EndpointResolver.cursorKey(CURSOR_KEY, LEDGER_PATH)) break;
        for (const r of movements) {
          if (this.applyRemote(r)) applied++;
        }
        if ((serverKey ?? EndpointResolver.lastResponder() ?? predicted) !== predicted) break;
        writeCursor(latestSeq);
        if (!hasMore) break;
      }
    } catch {
      // Leave the cursor where it was; the next tick continues from the same point.
    }
    if (applied > 0) db.notify();
    return applied;
  }

  /** Applies one movement from another device. Returns false when it was already known (our own, or applied before). */
  private static applyRemote(r: RemoteMovement): boolean {
    if (db.stockMovements.some((m) => m.id === r.movementId || m.id === `remote:${r.movementId}`)) return false;

    const item = db.inventoryItems.find((i) => i.id === r.itemId);
    const mirror: StockMovement = {
      id: `remote:${r.movementId}`,
      itemId: r.itemId,
      itemName: r.itemName,
      type: r.type as StockMovement['type'],
      quantityDelta: r.quantityDelta,
      unit: r.unit,
      orderId: r.orderId,
      reason: r.reason,
      performedBy: 'Another device',
      timestamp: r.occurredAt,
      syncedAt: new Date().toISOString(),
      remote: true
    };
    db.stockMovements.unshift(mirror);
    if (!item) return true; // history is kept; there is no local item to adjust

    // Overselling shows as a negative balance (the real shortfall), exactly as for a local sale.
    item.currentStock = item.currentStock + r.quantityDelta;
    item.status = item.currentStock <= 0 ? 'OUT_OF_STOCK' : item.currentStock <= item.minStockLevel ? 'LOW_STOCK' : 'IN_STOCK';
    if (r.type === 'RESTOCK' || r.type === 'PURCHASE') item.lastRestockedAt = r.occurredAt;
    item.updatedAt = r.occurredAt;
    return true;
  }
}
