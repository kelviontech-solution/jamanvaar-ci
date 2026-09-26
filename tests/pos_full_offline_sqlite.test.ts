import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { db } from '../packages/database/src/db';
import {
  OrderRepository, KOTRepository, ShiftRepository, TableRepository, HeldOrderRepository, CustomerRepository,
  BusinessDayRepository, AuditRepository, MenuRepository
} from '../packages/database/src/repositories';
import { PaymentPolicy } from '../packages/database/src/payment_policy';
import { KeyValueStore } from '../packages/database/src/key_value_store';
import { SqlKvEngine } from '../packages/database/src/durable/sql_kv_engine';
import { NodeSqliteDriver } from '../packages/database/src/durable/node_driver';
import { DurableStorage, EngineBackend } from '../packages/database/src/durable/durable_storage';
import { Platform, type PrinterPort } from '../packages/api/src/platform';
import { PrinterService } from '../packages/api/src/printer';
import { SyncOutboxEngine, type OrderSyncTransport } from '../packages/sync/src/outbox';
import { EndpointResolver } from '../packages/sync/src/endpoint_resolver';
import { BranchStore } from '../packages/branch-core/src/store';
import { BranchCore } from '../packages/branch-core/src/core';
import { createServer } from '../packages/branch-core/src/server';

/**
 * "The POS works completely offline, on data saved in SQLite." The whole counter workflow runs against a
 * real SQLite file while every network call is rejected, then the application is restarted (new storage on
 * the same file, empty memory) and everything is still there, and when a server appears it receives every
 * order exactly once.
 */
const sha = (t: string) => createHash('sha256').update(t).digest('hex');
const TOKEN = 'tok-pos-offline';

let dir: string;
const file = () => join(dir, 'pos.sqlite3');
const openStorage = () => DurableStorage.open(new EngineBackend(new SqlKvEngine(new NodeSqliteDriver(file()))));

class RecordingPrinter implements PrinterPort {
  readonly name = 'recording';
  sent: string[] = [];
  async send(_p: { id: string }, bytes: Uint8Array) { this.sent.push(new TextDecoder('latin1').decode(bytes)); }
  async list() { return []; }
}

let netCalls: string[];
const realFetch = globalThis.fetch;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'jv-pos-'));
  netCalls = [];
  globalThis.fetch = vi.fn(async (u: unknown) => { netCalls.push(String(u)); throw new TypeError('fetch failed'); }) as never;
  KeyValueStore.reset();
  PaymentPolicy.reset();
  PaymentPolicy.setInternetVerifier(() => false);
  EndpointResolver.reset();
  EndpointResolver.configure({ cloudBase: 'https://cloud.example' });
  db.orders.length = 0;
  db.kots.length = 0;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  (db as any).store = null;
  PaymentPolicy.reset();
  EndpointResolver.reset();
  Platform.reset();
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* still closing */ }
});

const line = (id: string, name = 'Masala Chai', price = 100, qty = 1) => ({ id: `oi-${id}`, menuItemId: 'm-chai', name, quantity: qty, unitPrice: price, totalPrice: price * qty, modifiers: [], kitchenStatus: 'PENDING', kitchenStation: 'Main Kitchen' });
const newOrder = (id: string, extra: Record<string, unknown> = {}) =>
  OrderRepository.createOrder({ id, items: [line(id)] as never, subtotal: 100, totalAmount: 105, orderType: 'TAKEAWAY', idempotencyKey: `idem-${id}`, ...extra } as never);

describe('POS: every counter function works with no network, on SQLite', () => {
  it('runs a full service: shift, tables, orders, KOTs, printing, cash, refunds, loyalty, reports; survives a restart', async () => {
    const printer = new RecordingPrinter();
    Platform.use({ printer });
    db.configuredPrinters.splice(0, db.configuredPrinters.length, { id: 'p1', name: 'Counter', type: 'THERMAL', connection: 'NETWORK_LAN', status: 'ONLINE', paperSize: '80mm', ipAddress: '10.0.0.5', port: 9100, roles: ['RECEIPT', 'KITCHEN'], isDefault: true } as never);

    const storage = await openStorage();
    db.attachDurableStorage(storage);
    KeyValueStore.attach(storage);

    // Menu is already on the device (seeded / synced earlier): browsing needs no server.
    expect(MenuRepository.getAllMenuItems().length).toBeGreaterThan(0);

    // Shift
    const shift = ShiftRepository.openShift('c1', 'Asha', 2000);
    expect(ShiftRepository.getActiveShift()?.id).toBe(shift.id);

    // Dine-in on a table, KOT, kitchen progress, held order recalled
    const table = TableRepository.createTable({ tableNumber: 'T-OFF-1', capacity: 4, zone: 'Main' } as never);
    const dine = newOrder('dine-1', { orderType: 'DINE_IN', tableId: table.id, tableNumber: table.tableNumber });
    KOTRepository.generateKOT({ orderId: dine.id, orderNumber: dine.orderNumber, tokenNumber: dine.tokenNumber, orderType: 'DINE_IN', items: dine.items as never, cashierName: 'Asha', station: 'Main Kitchen' } as never);
    const kot = KOTRepository.getKOTsForOrder(dine.id)[0];
    expect(kot).toBeTruthy();
    KOTRepository.updateKOTStatus(kot.id, 'PREPARING');
    expect(KOTRepository.getKOTsForOrder(dine.id)[0].status).toBe('PREPARING');
    const held = HeldOrderRepository.holdOrder({ id: 'held-1', items: [line('h')] } as never);
    expect(HeldOrderRepository.recallOrder(held.id)?.id).toBe(held.id);

    // Cash, split-free; UPI is honestly refused offline
    expect(() => OrderRepository.settleOrder(dine.id, 'UPI', 105, 'UPI-1', 'Asha')).toThrow(/UPI_REQUIRES_INTERNET/);
    expect(OrderRepository.getOrderById(dine.id)?.paymentStatus).not.toBe('SUCCESS');
    const paid = OrderRepository.settleOrder(dine.id, 'CASH_AT_COUNTER', 200, undefined, 'Asha')!;
    expect(paid.paymentStatus).toBe('SUCCESS');
    expect(paid.changeAmount).toBe(95);
    expect(TableRepository.getTableById(table.id)?.status).toBe('AVAILABLE');

    // Printing and the cash drawer are local
    expect((await PrinterService.printReceipt(paid)).success).toBe(true);
    expect(printer.sent.some((s) => s.includes('Masala Chai'))).toBe(true);
    expect((await PrinterService.openCashDrawer()).success).toBe(true);

    // Takeaway with a loyalty customer, cash movement, void and refund (manager-authorised, audited)
    CustomerRepository.createCustomer({ phone: '9876500099', name: 'Ravi' });
    const take = newOrder('take-1', { customerPhone: '9876500099' });
    OrderRepository.settleOrder(take.id, 'CASH_AT_COUNTER', 105, undefined, 'Asha');
    expect(CustomerRepository.getAccount('9876500099')!.totalVisits).toBeGreaterThan(0);
    ShiftRepository.addCashMovement(shift.id, 'CASH_OUT', 100, 'Milk purchase', 'Asha', 'Manager');
    const toRefund = newOrder('refund-1');
    OrderRepository.settleOrder(toRefund.id, 'CASH_AT_COUNTER', 105, undefined, 'Asha');
    OrderRepository.refundOrder(toRefund.id, 105, 'Wrong item', 'Manager');
    const toVoid = newOrder('void-1');
    OrderRepository.voidOrder(toVoid.id, 'Customer left', 'Manager');
    expect(AuditRepository.getAll().length).toBeGreaterThan(0);

    // End of shift and business-day figures are computed from local data
    const metrics = ShiftRepository.getShiftMetrics(ShiftRepository.getActiveShift());
    expect(metrics).toBeTruthy();
    ShiftRepository.closeShift(shift.id, 2100 + 5);
    expect(ShiftRepository.getAllShifts().find((s) => s.id === shift.id)?.status).toBe('CLOSED');
    const day = BusinessDayRepository.getActiveBusinessDay();
    expect(BusinessDayRepository.recalculateMetrics(day.id)).toBeTruthy();

    // None of this touched the network as a requirement (legacy best-effort local relay calls are allowed to fail silently)
    expect(netCalls.filter((u) => u.includes('cloud.example'))).toEqual([]);

    await storage.flush();
    storage.close();

    // ---- The application restarts: brand-new storage on the same SQLite file, empty memory.
    db.orders = [];
    db.kots = [];
    const again = await openStorage();
    db.attachDurableStorage(again);
    const ids = db.orders.map((o) => o.id);
    expect(ids).toEqual(expect.arrayContaining(['dine-1', 'take-1', 'refund-1', 'void-1']));
    expect(db.orders.find((o) => o.id === 'dine-1')?.paymentStatus).toBe('SUCCESS');
    expect(db.kots.some((k) => k.orderId === 'dine-1')).toBe(true);
    expect(ShiftRepository.getAllShifts().some((s) => s.id === shift.id && s.status === 'CLOSED')).toBe(true);
    expect(ShiftRepository.getCashMovements(shift.id).length).toBe(1);
    expect(CustomerRepository.getAccount('9876500099')).toBeTruthy();
    expect(OrderRepository.getOrderById('refund-1')?.paymentStatus).not.toBe('PENDING');

    // ---- A Branch Core appears on the LAN (still no internet): everything goes out, once.
    const core = new BranchCore(new BranchStore(':memory:'), { restaurantId: 'rest-1', branchId: 'br-1', branchCode: 'AHD' });
    core.applyRoster({
      restaurant: { id: 'rest-1', name: 'Demo', status: 'ACTIVE' },
      branches: [{ id: 'br-1', name: 'A', code: 'AHD', timezone: 'Asia/Kolkata', status: 'ACTIVE' }],
      subscription: { active: true, expiresAt: null, enabledApps: ['POS'] },
      devices: [{ id: 'pos-1', type: 'POS', name: 'POS 1', branchId: 'br-1', status: 'ACTIVE', isLocked: false, tokenHash: sha(TOKEN), appEnabled: true }]
    });
    const server: http.Server = createServer(core);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const coreUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    globalThis.fetch = realFetch;
    EndpointResolver.reset();
    EndpointResolver.setTransport((u, i) => (u.startsWith(coreUrl) ? realFetch(u, i) : Promise.reject(new TypeError('fetch failed'))));
    EndpointResolver.configure({ cloudBase: 'https://cloud.example', coreUrl });
    const transport: OrderSyncTransport = {
      async push(events) {
        const res = await EndpointResolver.fetch('/api/v1/orders/sync', { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ events }) });
        if (!res.ok) throw new Error(`push ${res.status}`);
        return res.json();
      },
      async pull() { return { orders: [], latestSeq: 0, serverTime: new Date().toISOString() } as never; }
    };
    SyncOutboxEngine.configureTransport(transport);
    await SyncOutboxEngine.processOutbox({ ignoreBackoff: true });
    await SyncOutboxEngine.processOutbox({ ignoreBackoff: true }); // a second pass must add nothing
    const inCore = core.store.all<{ external_order_id: string }>('SELECT external_order_id FROM orders').map((r) => r.external_order_id).sort();
    expect(inCore).toEqual(expect.arrayContaining(['dine-1', 'take-1', 'refund-1']));
    expect(new Set(inCore).size).toBe(inCore.length);
    expect(core.store.get<{ payment_status: string }>('SELECT payment_status FROM orders WHERE external_order_id = ?', 'dine-1')!.payment_status).toBe('SUCCESS');

    SyncOutboxEngine.configureTransport(null);
    EndpointResolver.setTransport(null);
    await new Promise<void>((r) => { server.closeAllConnections?.(); server.close(() => r()); });
    core.store.close();
    again.close();
  }, 60_000);
});
