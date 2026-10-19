import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { db, KeyValueStore } from '@jamanvaar/database';
import { DurableStorage, EngineBackend } from '../packages/database/src/durable/durable_storage';
import { SqlKvEngine } from '../packages/database/src/durable/sql_kv_engine';
import { NodeSqliteDriver } from '../packages/database/src/durable/node_driver';
import { useCaptainStore } from '../apps/restaurant-system/captain/src/store/captainStore';

let dir: string, sql: SqlKvEngine, storage: DurableStorage;
const captain = () => useCaptainStore.getState();
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'jv-captain-command-'));
  sql = new SqlKvEngine(new NodeSqliteDriver(join(dir, 'captain.sqlite3')));
  storage = await DurableStorage.open(new EngineBackend(sql)); db.attachDurableStorage(storage);
  KeyValueStore.attach(storage, { migrateLegacy: false });
  db.orders = []; db.kots = [];
  db.tables = [{ ...db.tables[0], id: 'table', tableNumber: 'T1', currentOrderId: undefined, status: 'OCCUPIED' }];
  db.menuItems = db.menuItems.slice(0, 2).map(item => ({ ...item, modifierGroupIds: [], isAvailable: true, minQuantity: 1, maxQuantity: 10 }));
  useCaptainStore.setState({ currentCaptain: { id: 'captain', name: 'Test captain' } as any, selectedTable: db.tables[0], selectedTableOrder: null,
    attachedCustomer: null, cartItems: [], guestCount: 2, kots: [] });
  captain().addItemToCart(db.menuItems[0], [], '', 'COURSE_1', 1);
  captain().addItemToCart(db.menuItems[1], [], '', 'COURSE_2', 1);
  db.notify(); await storage.flush();
});
afterEach(() => { vi.restoreAllMocks(); KeyValueStore.reset(); storage.close(); rmSync(dir, { recursive: true, force: true }); });

describe('actual Captain acknowledged kitchen action', () => {
  it('replays dish cancellation with the repriced bill and kitchen line in the same SQLite commit', async () => {
    await captain().sendKOTDurably();
    db.users.push({ ...db.users[0], id: 'captain', roleId: 'role-manager' }); db.notify(); await storage.flush();
    const order = captain().selectedTableOrder!;
    const line = order.items[0], remaining = order.items[1].totalPrice;
    const original = (storage as any).backend.command.bind((storage as any).backend);
    let lose = true;
    vi.spyOn((storage as any).backend, 'command').mockImplementation(async (command: any) => {
      const result = await original(command);
      if (!command.operationId.endsWith(':prepare') && lose) { lose = false; throw Error('Lost cancellation response'); }
      return result;
    });
    expect(await captain().cancelDish(line.id, 'Out of stock')).toMatchObject({ ok: false, error: 'Lost cancellation response' });
    expect(captain().cartItems.find(item => item.orderItemId === line.id)?.status).not.toBe('CANCELLED');
    expect(await captain().cancelDish(line.id, 'Out of stock')).toEqual({ ok: true });
    expect(db.orders[0].totalAmount).toBe(remaining);
    expect(db.orders[0].subtotal + db.orders[0].taxAmount + (db.orders[0].roundOffAmount ?? 0)).toBeCloseTo(remaining, 2);
    expect(db.orders[0].items[0]).toMatchObject({ kitchenStatus: 'CANCELLED', statusRev: 1, totalPrice: 0 });
    expect(db.kots.flatMap(kot => kot.items).find(item => item.orderItemId === line.id)?.status).toBe('CANCELLED');
    expect(db.auditLogs.filter(log => log.action === 'ORDER_ITEM_CANCELLED')).toHaveLength(1);
    storage.close(); sql = new SqlKvEngine(new NodeSqliteDriver(join(dir, 'captain.sqlite3')));
    storage = await DurableStorage.open(new EngineBackend(sql)); db.attachDurableStorage(storage);
    expect(db.orders[0].totalAmount).toBe(remaining);
    expect(db.orders[0].items[0].kitchenStatus).toBe('CANCELLED');
  });
  it('does not cancel a dish from a bill already paid at the counter', async () => {
    await captain().sendKOTDurably();
    db.users.push({ ...db.users[0], id: 'captain', roleId: 'role-manager' });
    db.orders[0].paymentStatus = 'SUCCESS'; db.notify(); await storage.flush();
    const result = await captain().cancelDish(db.orders[0].items[0].id, 'Guest changed mind');
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/paid or closed/) });
    expect(db.orders[0].items[0].kitchenStatus).toBe('PREPARING');
  });
  it('fires one course only after acknowledgement, then adds the second course to the same bill', async () => {
    const first = await captain().sendKOTDurably(['COURSE_1']);
    expect(first?.flatMap(kot => kot.items)).toHaveLength(1);
    expect(captain().cartItems.filter(line => line.isFired)).toHaveLength(1);
    const id = captain().selectedTableOrder?.id;
    await captain().sendKOTDurably(['COURSE_2']);
    expect(db.orders).toHaveLength(1); expect(captain().selectedTableOrder?.id).toBe(id);
    expect(db.orders[0].items).toHaveLength(2); expect(db.kots).toHaveLength(2);
  });
  it('preserves unfired cart state during a delayed real SQLite acknowledgement', async () => {
    let release!: () => void, enter!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; }), entered = new Promise<void>(resolve => { enter = resolve; });
    const original = (storage as any).backend.command.bind((storage as any).backend);
    vi.spyOn((storage as any).backend, 'command').mockImplementation(async (command: any) => {
      if (!command.operationId.endsWith(':prepare') && !command.operationId.endsWith(':ack')) { enter(); await gate; }
      return original(command);
    });
    const pending = captain().sendKOTDurably();
    try { await entered; expect(captain().cartItems.every(line => !line.isFired)).toBe(true); expect(db.orders).toHaveLength(0); release(); await pending; }
    finally { release(); }
    expect(captain().cartItems.every(line => line.isFired)).toBe(true);
  });
  it('replays a lost submission response without adding a second order or course', async () => {
    const original = (storage as any).backend.command.bind((storage as any).backend);
    let lose = true;
    vi.spyOn((storage as any).backend, 'command').mockImplementation(async (command: any) => {
      const result = await original(command);
      if (!command.operationId.endsWith(':prepare') && lose) { lose = false; throw Error('Lost Captain response'); }
      return result;
    });
    await expect(captain().sendKOTDurably()).rejects.toThrow('Lost Captain response');
    expect(captain().cartItems.every(line => !line.isFired)).toBe(true);
    const recovered = await captain().sendKOTDurably();
    expect(recovered).toHaveLength(1); expect(db.orders).toHaveLength(1); expect(db.orders[0].items).toHaveLength(2);
    expect(captain().cartItems.every(line => line.isFired)).toBe(true);
  });
  it('rejects a bill closed by the cashier rather than reopening it with new dishes', async () => {
    await captain().sendKOTDurably(['COURSE_1']);
    db.orders[0].paymentStatus = 'SUCCESS'; db.orders[0].orderStatus = 'COMPLETED'; db.notify(); await storage.flush();
    await expect(captain().sendKOTDurably(['COURSE_2'])).rejects.toThrow(/paid or closed|changed on another device/);
    expect(db.orders[0].items).toHaveLength(1);
    expect(db.orders[0].paymentStatus).toBe('SUCCESS');
  });
  it('does not let the compatibility synchronous action confirm an attached SQLite submission', () => {
    expect(() => captain().sendKOT()).toThrow('acknowledged kitchen');
    expect(db.orders).toHaveLength(0);
  });
});
