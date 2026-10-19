import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { db, CustomerRepository, KOTRepository, OrderRepository } from '@jamanvaar/database';
import { DurableStorage, EngineBackend } from '../packages/database/src/durable/durable_storage';
import { SqlKvEngine } from '../packages/database/src/durable/sql_kv_engine';
import { NodeSqliteDriver } from '../packages/database/src/durable/node_driver';
import { commitKioskAdmission, commitKioskDraft, commitKioskQuote } from '../apps/kiosk-system/kiosk-user/src/kioskAdmission';
import type { Order } from '@jamanvaar/types';

let dir: string, sql: SqlKvEngine, storage: DurableStorage;
const request = (): Partial<Order> => ({ kioskId: 'test-kiosk', sessionId: 'guest-session', orderType: 'TAKEAWAY',
  items: [{ id: 'first-line-id', orderId: '', menuItemId: 'meal', sku: 'meal', name: 'Meal', quantity: 1, unitPrice: 500, totalPrice: 500, modifiers: [], kitchenStatus: 'PENDING' }],
  subtotal: 500, totalAmount: 500, paymentMethod: 'CASH_AT_COUNTER' });
async function draft(overrides: Partial<Order> = {}) {
  const created = await commitKioskDraft({ ...request(), ...overrides });
  await db.acknowledgeFinancialMutation(created.operationId);
  return created.result.orderId;
}
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'jv-kiosk-admission-'));
  sql = new SqlKvEngine(new NodeSqliteDriver(join(dir, 'kiosk.sqlite3')));
  storage = await DurableStorage.open(new EngineBackend(sql)); db.attachDurableStorage(storage);
  db.orders = []; db.kots = []; db.receiptRecords = []; db.customerAccounts = []; db.coupons = [];
  db.menuItems = [{ ...db.menuItems[0], id: 'meal', price: 500, modifierGroupIds: [], isAvailable: true }];
  db.notify(); await storage.flush();
});
afterEach(() => { vi.restoreAllMocks(); storage.close(); rmSync(dir, { recursive: true, force: true }); });

describe('kiosk durable submission and kitchen admission', () => {
  it('saves and replays the priced quote without confirming collection or changing ownership', async () => {
    const id = await draft();
    const original = (storage as any).backend.command.bind((storage as any).backend);
    let lose = true;
    vi.spyOn((storage as any).backend, 'command').mockImplementation(async (command: any) => {
      const result = await original(command);
      if (!command.operationId.endsWith(':prepare') && lose) { lose = false; throw Error('Lost quote response'); }
      return result;
    });
    const changes = { totalAmount: 525, taxAmount: 25, paymentStatus: 'SUCCESS' as const, source_type: 'POS' as const };
    await expect(commitKioskQuote(id, 'original-gateway-reference', changes)).rejects.toThrow('Lost quote response');
    expect(db.orders[0].totalAmount).toBe(500);
    const retried = await commitKioskQuote(id, 'original-gateway-reference', changes);
    expect(retried.outcome).toBe('REPLAYED'); expect(retried.result.paymentId).toBe('original-gateway-reference');
    expect(db.orders[0]).toMatchObject({ subtotal: 500, totalAmount: 525, taxAmount: 25, paymentStatus: 'PENDING', orderStatus: 'DRAFT', source_type: 'KIOSK', kioskId: 'test-kiosk' });
    expect(db.orders[0].items).toHaveLength(1);
    expect(db.kots).toHaveLength(0);
  });
  it('rejects an invalid quote and repricing after kitchen admission', async () => {
    const id = await draft();
    await expect(commitKioskQuote(id, 'gateway-reference', { totalAmount: NaN })).rejects.toThrow('invalid amount');
    await expect(commitKioskQuote(id, '', { totalAmount: 525 })).rejects.toThrow('reference is missing');
    await expect(commitKioskQuote(id, 'gateway-reference', { items: [] })).rejects.toThrow('no longer matches');
    expect(db.orders[0].totalAmount).toBe(500);
    const admitted = await commitKioskAdmission(id); await db.acknowledgeFinancialMutation(admitted.operationId);
    await expect(commitKioskQuote(id, 'gateway-reference', { totalAmount: 525 })).rejects.toThrow('checkout has changed');
    expect(db.orders[0].totalAmount).toBe(500);
  });
  it('saves a recoverable unpaid draft before any token confirmation', async () => {
    const result = await commitKioskDraft(request());
    expect(db.orders).toHaveLength(1); expect(db.orders[0]).toMatchObject({ orderStatus: 'DRAFT', paymentStatus: 'PENDING', source_type: 'KIOSK' });
    expect(db.kots).toHaveLength(0); expect(db.orders[0].tokenNumber).toMatch(/^K-/);
    expect(result.result.orderId).toBe(db.orders[0].id);
  });
  it('retries draft creation with the original order ID despite newly generated UI line/session IDs', async () => {
    const original = (storage as any).backend.command.bind((storage as any).backend);
    let lose = true;
    vi.spyOn((storage as any).backend, 'command').mockImplementation(async (command: any) => {
      const result = await original(command);
      if (!command.operationId.endsWith(':prepare') && lose) { lose = false; throw Error('Lost draft response'); }
      return result;
    });
    await expect(commitKioskDraft(request())).rejects.toThrow('Lost draft response');
    const retried = request(); retried.sessionId = 'new-ui-session'; retried.items![0].id = 'new-ui-line';
    const result = await commitKioskDraft(retried);
    expect(result.outcome).toBe('REPLAYED'); expect(db.orders).toHaveLength(1);
    expect(db.orders[0].sessionId).toBe('guest-session');
  });
  it('cash admission saves tickets and receipt intent while preserving unpaid status and loyalty points', async () => {
    CustomerRepository.createCustomer({ name: 'Guest', phone: '9876500012', loyaltyPoints: 200 });
    const id = await draft({ customerPhone: '9876500012' });
    const result = await commitKioskAdmission(id);
    expect(db.orders[0]).toMatchObject({ paymentStatus: 'PENDING', paymentMethod: 'CASH_AT_COUNTER', orderStatus: 'CONFIRMED' });
    expect(db.kots).toHaveLength(1); expect(db.receiptRecords[0]).toMatchObject({ orderId: id, deliveryStatus: 'QUEUED' });
    expect(CustomerRepository.getByPhone('9876500012')?.loyaltyPoints).toBe(200);
    expect(result.result.kotIds).toHaveLength(1);
  });
  it('does not expose tickets or accepted status until the real SQLite command response arrives', async () => {
    const id = await draft();
    const original = (storage as any).backend.command.bind((storage as any).backend);
    let release!: () => void, enter!: () => void;
    const wait = new Promise<void>(resolve => { release = resolve; }), entered = new Promise<void>(resolve => { enter = resolve; });
    vi.spyOn((storage as any).backend, 'command').mockImplementation(async (command: any) => {
      if (!command.operationId.endsWith(':prepare')) { enter(); await wait; }
      return original(command);
    });
    const admission = commitKioskAdmission(id);
    try { await entered; expect(db.kots).toHaveLength(0); expect(db.orders[0].orderStatus).toBe('DRAFT'); release(); await admission; }
    finally { release(); }
    expect(db.kots).toHaveLength(1);
  });
  it('loses an admission response and recovers it after SQLite reopen without another ticket or coupon use', async () => {
    db.coupons = [{ id: 'coupon', code: 'MEAL', usageCount: 0, isActive: true } as any];
    db.notify(); await storage.flush();
    const id = await draft({ couponCode: 'MEAL', discountAmount: 10, totalAmount: 490 });
    const original = (storage as any).backend.command.bind((storage as any).backend);
    let lose = true;
    vi.spyOn((storage as any).backend, 'command').mockImplementation(async (command: any) => {
      const result = await original(command);
      if (!command.operationId.endsWith(':prepare') && lose) { lose = false; throw Error('Lost admission response'); }
      return result;
    });
    await expect(commitKioskAdmission(id)).rejects.toThrow('Lost admission response');
    storage.close(); sql = new SqlKvEngine(new NodeSqliteDriver(join(dir, 'kiosk.sqlite3')));
    storage = await DurableStorage.open(new EngineBackend(sql)); db.attachDurableStorage(storage);
    const recovered = await commitKioskAdmission(id);
    expect(recovered.outcome).toBe('REPLAYED'); expect(db.kots).toHaveLength(1); expect(db.coupons[0].usageCount).toBe(1);
    await db.acknowledgeFinancialMutation(recovered.operationId);
    const repeated = await commitKioskAdmission(id);
    expect(repeated.result.firstAdmission).toBe(false); expect(db.kots).toHaveLength(1); expect(db.coupons[0].usageCount).toBe(1);
  });
  it('atomically records verified collection and spends loyalty before earning using the saved customer', async () => {
    CustomerRepository.createCustomer({ name: 'Original guest', phone: '9876500012', loyaltyPoints: 200 });
    CustomerRepository.updateProgramSettings({ enabled: true, earnPoints: 1, perRupeesSpent: 10 });
    CustomerRepository.updateReward('reward-100off', { pointsCost: 150, discountAmount: 100, isActive: true });
    const id = await draft({ customerPhone: '9876500012', discountAmount: 100, totalAmount: 400,
      loyaltyRedemption: { rewardId: 'reward-100off', name: '100 off', pointsCost: 150, discountAmount: 100, customerPhone: '9876500012' } });
    const result = await commitKioskAdmission(id, 'server-confirmed-payment');
    expect(OrderRepository.getOrderById(id)).toMatchObject({ paymentStatus: 'SUCCESS', paymentTransactionId: 'server-confirmed-payment', orderStatus: 'CONFIRMED', loyaltyPointsRedeemed: 150 });
    expect(CustomerRepository.getByPhone('9876500012')?.loyaltyPoints).toBe(90);
    await db.acknowledgeFinancialMutation(result.operationId);
    await commitKioskAdmission(id, 'server-confirmed-payment');
    expect(CustomerRepository.getByPhone('9876500012')?.loyaltyPoints).toBe(90); expect(db.kots).toHaveLength(1);
  });
  it('rolls back collection, points and ticket intent together if ticket creation fails', async () => {
    const id = await draft();
    vi.spyOn(KOTRepository, 'generateKOT').mockImplementation(() => { throw Error('Ticket preparation failed'); });
    await expect(commitKioskAdmission(id, 'verified-payment')).rejects.toThrow('Ticket preparation failed');
    expect(db.orders[0]).toMatchObject({ paymentStatus: 'PENDING', orderStatus: 'DRAFT' });
    expect(db.kots).toHaveLength(0); expect(db.receiptRecords).toHaveLength(0);
  });
  it('never admits a cancelled draft when a payment arrives late', async () => {
    const id = await draft(); OrderRepository.updateOrderStatus(id, 'CANCELLED', 'Guest left'); await storage.flush();
    await expect(commitKioskAdmission(id, 'late-payment')).rejects.toThrow('counter reconciliation');
    expect(db.orders[0].orderStatus).toBe('CANCELLED'); expect(db.kots).toHaveLength(0);
  });
});
