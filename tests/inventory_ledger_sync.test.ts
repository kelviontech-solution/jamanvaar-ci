import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InventoryLedgerSync, LedgerTransport, RemoteMovement } from '../packages/sync/src/inventory_ledger_sync';
import { InventoryRepository } from '../packages/database/src/repositories';
import { db } from '../packages/database/src/db';

function seedItem(id = 'paneer', stock = 10) {
  db.inventoryItems.length = 0;
  db.stockMovements.length = 0;
  db.inventoryItems.push({
    id, name: 'Paneer', sku: 'P1', category: 'Dairy', unit: 'kg', currentStock: stock, minStockLevel: 2, reorderLevel: 3,
    costPerUnit: 300, status: 'IN_STOCK', updatedAt: new Date().toISOString()
  } as never);
}

function remote(id: string, itemId: string, delta: number, seq: number): RemoteMovement {
  return { movementId: id, itemId, itemName: 'Paneer', type: 'SALE', quantityDelta: delta, unit: 'kg', reason: 'remote', occurredAt: new Date().toISOString(), seq, deviceId: 'other' };
}

function fakeTransport(opts: { remoteMovements?: RemoteMovement[]; failPush?: boolean } = {}) {
  const pushed: string[] = [];
  const pulls: number[] = [];
  const transport: LedgerTransport = {
    async push(movements) {
      if (opts.failPush) throw new Error('offline');
      movements.forEach((m) => pushed.push(m.movementId));
      return { results: movements.map((m) => ({ movementId: m.movementId, status: 'ok' as const })) };
    },
    async pull(afterSeq) {
      pulls.push(afterSeq);
      const rows = (opts.remoteMovements ?? []).filter((m) => m.seq > afterSeq);
      return { movements: rows, latestSeq: rows.length ? rows[rows.length - 1].seq : afterSeq, hasMore: false };
    }
  };
  return { transport, pushed, pulls };
}

const store = new Map<string, string>();

describe('InventoryLedgerSync', () => {
  const original = (globalThis as any).localStorage;
  beforeEach(() => {
    store.clear();
    (globalThis as any).localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k)
    };
    seedItem();
  });
  afterEach(() => {
    InventoryLedgerSync.configureTransport(null);
    (globalThis as any).localStorage = original;
  });

  it('pushes each local stock movement once and marks it synced', async () => {
    const m = InventoryRepository.recordMovement({ itemId: 'paneer', itemName: 'Paneer', type: 'SALE', quantityDelta: -7, unit: 'kg', reason: 'sale', performedBy: 'x' });
    const { transport, pushed } = fakeTransport();
    InventoryLedgerSync.configureTransport(transport);
    await InventoryLedgerSync.sync();
    await InventoryLedgerSync.sync();
    expect(pushed).toEqual([m.id]);
    expect(db.stockMovements.find((x) => x.id === m.id)?.syncedAt).toBeTruthy();
  });

  it('keeps a movement unsynced (never drops it) when the push fails, and retries later', async () => {
    const m = InventoryRepository.recordMovement({ itemId: 'paneer', itemName: 'Paneer', type: 'SALE', quantityDelta: -1, unit: 'kg', reason: 'sale', performedBy: 'x' });
    InventoryLedgerSync.configureTransport(fakeTransport({ failPush: true }).transport);
    await InventoryLedgerSync.sync();
    expect(db.stockMovements.find((x) => x.id === m.id)?.syncedAt).toBeUndefined();

    const ok = fakeTransport();
    InventoryLedgerSync.configureTransport(ok.transport);
    await InventoryLedgerSync.sync();
    expect(ok.pushed).toEqual([m.id]);
  });

  it('applies another terminal\'s movement to local stock exactly once, so offline sales from two devices add up', async () => {
    InventoryRepository.recordMovement({ itemId: 'paneer', itemName: 'Paneer', type: 'SALE', quantityDelta: -7, unit: 'kg', reason: 'sale', performedBy: 'x' });
    expect(db.inventoryItems[0].currentStock).toBe(3);

    const { transport } = fakeTransport({ remoteMovements: [remote('other-1', 'paneer', -6, 1)] });
    InventoryLedgerSync.configureTransport(transport);
    await InventoryLedgerSync.sync();
    expect(db.inventoryItems[0].currentStock).toBe(-3);
    expect(db.inventoryItems[0].status).toBe('OUT_OF_STOCK');

    await InventoryLedgerSync.sync();
    expect(db.inventoryItems[0].currentStock).toBe(-3);
  });

  it('does not re-apply a movement this device made itself, and never re-pushes an applied remote one', async () => {
    const own = InventoryRepository.recordMovement({ itemId: 'paneer', itemName: 'Paneer', type: 'SALE', quantityDelta: -2, unit: 'kg', reason: 'sale', performedBy: 'x' });
    const echoed = { ...remote(own.id, 'paneer', -2, 1), deviceId: 'me' };
    const { transport, pushed } = fakeTransport({ remoteMovements: [echoed, remote('other-2', 'paneer', -1, 2)] });
    InventoryLedgerSync.configureTransport(transport);
    await InventoryLedgerSync.sync();
    expect(db.inventoryItems[0].currentStock).toBe(7);
    expect(pushed).toEqual([own.id]);
  });

  it('ignores movements for an item this device does not know without failing the sync', async () => {
    const { transport } = fakeTransport({ remoteMovements: [remote('other-3', 'unknown-item', -1, 1), remote('other-4', 'paneer', -1, 2)] });
    InventoryLedgerSync.configureTransport(transport);
    await expect(InventoryLedgerSync.sync()).resolves.toBeTruthy();
    expect(db.inventoryItems[0].currentStock).toBe(9);
  });

  it('resumes from its saved sequence cursor', async () => {
    const first = fakeTransport({ remoteMovements: [remote('other-5', 'paneer', -1, 5)] });
    InventoryLedgerSync.configureTransport(first.transport);
    await InventoryLedgerSync.sync();
    const second = fakeTransport({ remoteMovements: [remote('other-5', 'paneer', -1, 5)] });
    InventoryLedgerSync.configureTransport(second.transport);
    await InventoryLedgerSync.sync();
    expect(second.pulls[0]).toBe(5);
    expect(db.inventoryItems[0].currentStock).toBe(9);
  });
});
