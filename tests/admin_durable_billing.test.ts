import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { db, KeyValueStore, OrderRepository, ShiftRepository } from '@jamanvaar/database';
import { SessionPersistence } from '@jamanvaar/business';
import { DurableStorage, EngineBackend } from '../packages/database/src/durable/durable_storage';
import { SqlKvEngine } from '../packages/database/src/durable/sql_kv_engine';
import { NodeSqliteDriver } from '../packages/database/src/durable/node_driver';
import { refundBillingOrder, voidBillingOrder } from '../apps/restaurant-system/pos-admin/src/components/billing/billingCommands';

let dir: string, storage: DurableStorage;
beforeEach(async () => {
  const sessionStorage = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => sessionStorage.get(key) ?? null,
    setItem: (key: string, value: string) => { sessionStorage.set(key, value); }, removeItem: (key: string) => { sessionStorage.delete(key); } });
  dir = mkdtempSync(join(tmpdir(), 'jv-admin-return-'));
  storage = await DurableStorage.open(new EngineBackend(new SqlKvEngine(new NodeSqliteDriver(join(dir, 'admin.sqlite3')))));
  db.attachDurableStorage(storage); KeyValueStore.reset();
  db.orders = []; db.kots = []; db.shifts = []; db.cashMovements = []; db.auditLogs = [];
  SessionPersistence.save('admin', { userId: 'owner', fullName: 'Original owner', roleId: 'role-admin', restaurantId: db.restaurant.id });
  ShiftRepository.openShift('owner', 'Original owner', 500, 'counter');
  db.notify(); await storage.flush();
});
afterEach(() => { vi.restoreAllMocks(); storage.close(); KeyValueStore.reset(); vi.unstubAllGlobals(); rmSync(dir, { recursive: true, force: true }); });

function loseNextResponse() {
  const original = (storage as any).backend.command.bind((storage as any).backend);
  let lose = true;
  vi.spyOn((storage as any).backend, 'command').mockImplementation(async (command: any) => {
    const result = await original(command);
    if (!command.operationId.endsWith(':prepare') && !command.operationId.endsWith(':ack') && lose) { lose = false; throw Error('Lost admin response'); }
    return result;
  });
}

describe('actual Admin billing actions acknowledge SQLite', () => {
  it('recovers one return and one register cash-out after a lost response', async () => {
    const shift = db.shifts[0];
    const order = OrderRepository.createOrder({ items: [], subtotal: 100, totalAmount: 100, source_type: 'POS', kioskId: 'counter',
      shiftId: shift.id, paymentMethod: 'CASH', paymentStatus: 'SUCCESS', orderStatus: 'COMPLETED' });
    await storage.flush(); loseNextResponse();
    await expect(refundBillingOrder(order, 'Guest returned meal', true, 'CASH', 100, shift.id)).rejects.toThrow('Lost admin response');
    expect(db.orders[0].refundAmount ?? 0).toBe(0); expect(db.cashMovements).toHaveLength(0);
    await refundBillingOrder(order, 'Guest returned meal', true, 'CASH', 100, shift.id);
    expect(db.orders[0]).toMatchObject({ paymentStatus: 'REFUNDED', refundAmount: 100 });
    expect(db.orders[0].refundEvents).toHaveLength(1); expect(db.cashMovements).toHaveLength(1);
    expect(db.hasPendingFinancialMutation()).toBe(false);
  });
  it('recovers void, ticket cancellation and table release after losing the save response', async () => {
    const table = db.tables[0];
    const order = OrderRepository.createOrder({ items: [], subtotal: 100, totalAmount: 100, source_type: 'POS',
      paymentStatus: 'PENDING', orderStatus: 'PREPARING', tableId: table.id });
    table.currentOrderId = order.id; table.status = 'OCCUPIED';
    db.kots.push({ id: 'ticket', orderId: order.id, status: 'PREPARING', items: [{ id: 'line', status: 'PREPARING' }] } as any);
    db.notify(); await storage.flush(); loseNextResponse();
    await expect(voidBillingOrder(order, 'Guest left')).rejects.toThrow('Lost admin response');
    expect(db.orders[0].orderStatus).toBe('PREPARING');
    await voidBillingOrder(order, 'Guest left');
    expect(db.orders[0].orderStatus).toBe('CANCELLED'); expect(db.kots[0].status).toBe('CANCELLED');
    expect(db.tables.find(row => row.id === table.id)?.status).toBe('AVAILABLE');
    expect(db.auditLogs.filter(log => log.action === 'ORDER_VOID')).toHaveLength(1);
  });
  it('does not edit a bill when the Admin session is locked', async () => {
    const order = OrderRepository.createOrder({ items: [], paymentStatus: 'PENDING' }); await storage.flush();
    SessionPersistence.clear('admin');
    await expect(voidBillingOrder(order, 'Guest left')).rejects.toThrow('Sign in');
    expect(db.orders[0].orderStatus).not.toBe('CANCELLED');
  });
});
