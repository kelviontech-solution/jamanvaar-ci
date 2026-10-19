import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { db, OrderRepository, CustomerRepository, ShiftRepository } from '@jamanvaar/database';
import { usePosStore } from '../apps/restaurant-system/pos/src/store/posStore';
import { PosPrinterService } from '../apps/restaurant-system/pos/src/services/printerService';
import { DurableStorage, EngineBackend } from '../packages/database/src/durable/durable_storage';
import { SqlKvEngine } from '../packages/database/src/durable/sql_kv_engine';
import { NodeSqliteDriver } from '../packages/database/src/durable/node_driver';
import { unprotectRecovery } from '../packages/database/src/durable/protected_recovery';
import { commitOrderReturn, commitVerifiedOnlineCollection } from '../apps/restaurant-system/pos/src/services/financialActions';
import { reviewInterruptedOperation, finishInterruptedOperation } from '../apps/restaurant-system/pos/src/services/interruptedOperationRecovery';

let dir: string;
let sql: SqlKvEngine;
let storage: DurableStorage;
const fingerprint = 'a'.repeat(64);
const realOpenCashDrawer = usePosStore.getState().openCashDrawer;
const prepare = () => {
  const order = OrderRepository.createOrder({ id: 'atomic-bill', source_type: 'POS', items: [], subtotal: 0, totalAmount: 0, customerPhone: '9876500012' });
  OrderRepository.settleOrder(order.id, 'CASH', 0, 'original-collection');
  db.syncEvents.push({ id: 'outbox-for-bill', status: 'PENDING', payload: { orderId: order.id } } as any);
  db.paymentTransactions.push({ id: 'collection-record', orderId: order.id, amount: 0 } as any);
  db.receipts.push({ id: 'financial-receipt', orderId: order.id } as any);
  db.notify();
  return { orderId: order.id };
};

beforeEach(async () => {
  usePosStore.setState({ openCashDrawer: realOpenCashDrawer });
  dir = mkdtempSync(join(tmpdir(), 'jv-financial-repository-'));
  sql = new SqlKvEngine(new NodeSqliteDriver(join(dir, 'checkout.sqlite3')));
  storage = await DurableStorage.open(new EngineBackend(sql));
  db.attachDurableStorage(storage);
  db.orders = []; db.kots = []; db.syncEvents = []; db.paymentTransactions = []; db.receipts = [];
  db.customerAccounts = []; db.shifts = [];
  CustomerRepository.createCustomer({ name: 'Test customer', phone: '9876500012', loyaltyPoints: 200 });
  db.notify();
  await storage.flush();
});
afterEach(() => {
  vi.restoreAllMocks(); storage?.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('real repository preparation and durable financial acceptance', () => {
  it('commits order, loyalty, independent collection/receipt and outbox together, and reloads them', async () => {
    const outcome = await db.commitFinancialMutation(fingerprint, prepare);
    expect(outcome).toMatchObject({ outcome: 'COMMITTED', result: { orderId: 'atomic-bill' } });
    expect(db.orders.find(order => order.id === 'atomic-bill')?.paymentStatus).toBe('SUCCESS');
    expect(db.paymentTransactions).toHaveLength(1); expect(db.receipts).toHaveLength(1);
    expect(db.syncEvents.some(event => event.id === 'outbox-for-bill')).toBe(true);
    db.paymentTransactions = []; db.receipts = [];
    db.attachDurableStorage(storage);
    expect(db.paymentTransactions[0].id).toBe('collection-record');
    expect(db.receipts[0].id).toBe('financial-receipt');
    await db.acknowledgeFinancialMutation(outcome.operationId);
    expect(storage.keys().some(key => key.endsWith('financial_command_pending'))).toBe(false);
  });

  it('exports business data without serializing the storage backend, encryption key or pending command internals', () => {
    const snapshot = db.exportOperationalSnapshot();
    expect(snapshot.customerAccounts).toEqual(db.customerAccounts);
    expect(snapshot.paymentTransactions).toEqual(db.paymentTransactions);
    for (const key of ['store', 'piiKeyHex', 'financialBaseline', 'lastWritten', 'transactionEffects', 'listeners']) expect(Object.hasOwn(snapshot, key)).toBe(false);
    (snapshot.customerAccounts as any[])[0].loyaltyPoints = 0;
    expect(db.customerAccounts[0].loyaltyPoints).toBe(200);
  });

  it('encrypts the complete device snapshot and restores replay protection and the customer key into an empty SQLite target', async () => {
    await db.commitFinancialMutation(fingerprint, prepare);
    const passphrase = 'fixture recovery passphrase 2026';
    const file = await db.exportProtectedLocalRecovery(passphrase);
    expect(file).not.toContain('9876500012'); expect(file).not.toContain('original-collection');
    const snapshot = await unprotectRecovery(file, passphrase, db.localRecoveryScope());
    const target = await DurableStorage.open(new EngineBackend(new SqlKvEngine(new NodeSqliteDriver(join(dir, 'restored.sqlite3')))));
    try {
      await target.restoreRecovery(snapshot, db.localRecoveryScope()); db.attachDurableStorage(target);
      const recovered = await db.commitFinancialMutation(fingerprint, () => { throw Error('Recovery must retain replay history'); });
      expect(recovered.outcome).toBe('REPLAYED'); expect(db.orders).toHaveLength(1);
      expect(CustomerRepository.getByPhone('9876500012')?.loyaltyPoints).toBeGreaterThanOrEqual(200);
      await expect(target.restoreRecovery(snapshot, db.localRecoveryScope())).rejects.toThrow('empty');
    } finally { db.attachDurableStorage(storage); target.close(); }
  }, 15000);

  it('refuses a wrong passphrase, tampered ciphertext and another branch without modifying the live store', async () => {
    const passphrase = 'fixture recovery passphrase 2026';
    const file = await db.exportProtectedLocalRecovery(passphrase);
    await expect(unprotectRecovery(file, 'incorrect fixture passphrase', db.localRecoveryScope())).rejects.toThrow('incorrect or');
    const altered = JSON.parse(file); altered.ciphertext = (altered.ciphertext[0] === 'A' ? 'B' : 'A') + altered.ciphertext.slice(1);
    await expect(unprotectRecovery(JSON.stringify(altered), passphrase, db.localRecoveryScope())).rejects.toThrow('damaged');
    await expect(unprotectRecovery(file, passphrase, 'different branch')).rejects.toThrow('scope');
    expect(db.orders).toHaveLength(0); expect(db.customerAccounts[0].loyaltyPoints).toBe(200);
  }, 15000);

  it('blocks business JSON from replacing tenant ownership, live bills or saved operation history', async () => {
    await expect(db.assertOperationalRestoreSafe({ restaurant: { id: 'other-restaurant' } })).rejects.toThrow('ownership');
    await db.commitFinancialMutation(fingerprint, prepare);
    await expect(db.assertOperationalRestoreSafe({ orders: [] })).rejects.toThrow('financial history');
    db.orders = []; db.paymentTransactions = []; db.cashMovements = [];
    await expect(db.assertOperationalRestoreSafe({ orders: [] })).rejects.toThrow('operation history');
    await expect(db.assertOperationalRestoreSafe({ menuItems: [] })).resolves.toBeUndefined();
  });

  it('does not expose a prepared bill, notify observers or deliver effects before acknowledgement', async () => {
    let release!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    let mainEntered!: () => void;
    const entered = new Promise<void>(resolve => { mainEntered = resolve; });
    const original = (storage as any).backend.command.bind((storage as any).backend);
    vi.spyOn((storage as any).backend, 'command').mockImplementation(async (command: any) => {
      if (!command.operationId.endsWith(':prepare')) { mainEntered(); await blocked; }
      return original(command);
    });
    const delivered = vi.fn(); const seen: number[] = [];
    const unsubscribe = db.subscribe(() => seen.push(db.orders.length));
    try {
      const pending = db.commitFinancialMutation(fingerprint, () => { const result = prepare(); db.afterTransaction(delivered); return result; });
      await entered;
      expect(db.orders).toHaveLength(0); expect(delivered).not.toHaveBeenCalled(); expect(seen).toEqual([]);
      expect(JSON.parse(sql.loadAll().jamanvaar_db_orders ?? '[]')).toHaveLength(0);
      expect(() => db.transaction(() => db.orders.push({ id: 'racing-bill' } as any))).toThrow('being saved');
      release(); await pending;
      expect(delivered).toHaveBeenCalledOnce(); expect(seen).toEqual([1]);
    } finally { release(); unsubscribe(); }
  });

  it('rolls back preparation failure without persisting a command or spending customer points', async () => {
    const before = structuredClone(db.customerAccounts);
    await expect(db.commitFinancialMutation(fingerprint, () => { prepare(); db.customerAccounts[0].loyaltyPoints = 0; throw Error('Inventory failed'); })).rejects.toThrow('Inventory failed');
    expect(db.orders).toHaveLength(0); expect(db.customerAccounts).toEqual(before);
    expect(storage.keys().some(key => key.endsWith('financial_command_pending'))).toBe(false);
  });

  it('replays the original repository result after commit but lost acknowledgement, without preparing again', async () => {
    const original = (storage as any).backend.command.bind((storage as any).backend);
    let lose = true;
    vi.spyOn((storage as any).backend, 'command').mockImplementation(async (command: any) => {
      const result = await original(command);
      if (!command.operationId.endsWith(':prepare') && lose) { lose = false; throw Error('Worker acknowledgement lost'); }
      return result;
    });
    await expect(db.commitFinancialMutation(fingerprint, prepare)).rejects.toThrow('acknowledgement lost');
    expect(db.orders).toHaveLength(0);
    const mustNotPrepare = vi.fn(() => { throw Error('Must not create a second bill'); });
    const recovered = await db.commitFinancialMutation(fingerprint, mustNotPrepare);
    expect(recovered).toMatchObject({ outcome: 'REPLAYED', result: { orderId: 'atomic-bill' } });
    expect(mustNotPrepare).not.toHaveBeenCalled(); expect(db.orders).toHaveLength(1);
    expect(db.paymentTransactions).toHaveLength(1);
  });

  it('preserves the pending operation across a real SQLite reopen and rejects a different payment request', async () => {
    const completed = await db.commitFinancialMutation(fingerprint, prepare);
    storage.close();
    sql = new SqlKvEngine(new NodeSqliteDriver(join(dir, 'checkout.sqlite3')));
    storage = await DurableStorage.open(new EngineBackend(sql)); db.attachDurableStorage(storage);
    await expect(db.commitFinancialMutation('b'.repeat(64), prepare)).rejects.toThrow('earlier checkout needs recovery');
    const recovered = await db.commitFinancialMutation(fingerprint, () => { throw Error('No new effects'); });
    expect(recovered.operationId).toBe(completed.operationId); expect(recovered.outcome).toBe('REPLAYED');
    expect(db.orders).toHaveLength(1);
  });

  it('fails explicitly instead of silently downgrading to background storage', async () => {
    db.attachDurableStorage({ getItem: key => storage.getItem(key), setItem: (key, value) => storage.setItem(key, value), removeItem: key => storage.removeItem(key) });
    await expect(db.commitFinancialMutation(fingerprint, prepare)).rejects.toThrow('needs SQLite');
    expect(db.orders).toHaveLength(0);
  });

  it('rejects a sibling-terminal change under the SQLite lock and releases only the rejected intent for review', async () => {
    const original = (storage as any).backend.command.bind((storage as any).backend);
    let race = true;
    vi.spyOn((storage as any).backend, 'command').mockImplementation(async (command: any) => {
      if (race && !command.operationId.endsWith(':prepare')) {
        race = false;
        const key = command.expected.find((entry: any) => entry.key.endsWith('orders')).key;
        sql.applyBatch([{ op: 'set', key, value: JSON.stringify([{ id: 'sibling-order', items: [], createdAt: new Date().toISOString() }]) }]);
      }
      return original(command);
    });
    await expect(db.commitFinancialMutation(fingerprint, prepare)).rejects.toMatchObject({ code: 'LOCAL_VERSION_CONFLICT' });
    expect(sql.loadAll().jamanvaar_db_orders).not.toContain('atomic-bill');
    expect(storage.keys().some(key => key.endsWith('financial_command_pending'))).toBe(false);
  });
});

async function cashierCart() {
  const pos = usePosStore.getState(); pos.clearCart();
  usePosStore.setState({ currentUser: { id: 'cashier', fullName: 'Cashier', roleId: 'role-cashier' } as any,
    selectedCustomer: null, selectedTable: null, runningOrderId: null, cartOrderBaseline: null,
    lastCompletedOrder: null, isPaymentOpen: true, isReceiptOpen: false });
  const dish = { ...db.menuItems[0], id: 'atomic-meal', price: 100, isAvailable: true, modifierGroupIds: [], minQuantity: 1, maxQuantity: 10 };
  db.menuItems = [dish];
  ShiftRepository.openShift('cashier', 'Cashier', 0);
  pos.addItemToCart(dish);
  vi.spyOn(PosPrinterService, 'printOrderReceipt').mockResolvedValue({ status: 'PRINTED' } as any);
  vi.spyOn(usePosStore.getState(), 'openCashDrawer').mockImplementation(() => {});
  db.notify(); await storage.flush();
}

describe('actual POS acknowledged checkout', () => {
  async function interruptedPaidBill() {
    await cashierCart();
    const manager = { ...db.users[0], id: 'recovery-manager', fullName: 'Recovery manager', roleId: 'role-manager', isActive: true };
    db.users = [manager]; usePosStore.setState({ currentUser: manager, isAuthenticated: true });
    db.notify(); await storage.flush();
    const original = (storage as any).backend.command.bind((storage as any).backend);
    let lose = true;
    vi.spyOn((storage as any).backend, 'command').mockImplementation(async (command: any) => {
      const result = await original(command);
      if (!command.operationId.endsWith(':prepare') && !command.operationId.endsWith(':ack') && lose) { lose = false; throw Error('Lost original checkout response'); }
      return result;
    });
    await expect(usePosStore.getState().completePaymentDurably('CASH', 200, 'original-recovery-reference')).rejects.toThrow('Lost original');
    return db.getPendingFinancialRecovery()!;
  }
  it('recovers the exact saved bill after reopening SQLite without reconstructing its payment request', async () => {
    const pending = await interruptedPaidBill(); storage.close();
    sql = new SqlKvEngine(new NodeSqliteDriver(join(dir, 'checkout.sqlite3')));
    storage = await DurableStorage.open(new EngineBackend(sql)); db.attachDurableStorage(storage);
    expect(db.getPendingFinancialRecovery()).toEqual(pending);
    expect(Object.keys(pending).sort()).toEqual(['operationId', 'orderId']);
    const reviewed = await reviewInterruptedOperation(pending.operationId);
    expect(reviewed.collectedAmount).toBe(db.orders[0].totalAmount);
    expect(reviewed.outstandingAmount).toBe(0); expect(reviewed.refundedAmount).toBe(0);
    expect(reviewed.paymentStatus).toBe('SUCCESS'); expect(db.hasPendingFinancialMutation()).toBe(true);
    await expect(finishInterruptedOperation(pending.operationId, 'EMPTY')).rejects.toThrow('Identify');
    await finishInterruptedOperation(pending.operationId, 'RECOVERED_BILL');
    expect(db.hasPendingFinancialMutation()).toBe(false); expect(db.orders).toHaveLength(1);
    expect(db.orders[0].paymentTransactionId).toBe('original-recovery-reference');
    expect(usePosStore.getState().cart.items).toHaveLength(0);
    expect(PosPrinterService.printOrderReceipt).not.toHaveBeenCalled(); expect(usePosStore.getState().openCashDrawer).not.toHaveBeenCalled();
  });
  it('finishes a prepared but uncommitted original save without re-preparing the business effects', async () => {
    await cashierCart();
    const original = (storage as any).backend.command.bind((storage as any).backend); let fail = true;
    vi.spyOn((storage as any).backend, 'command').mockImplementation(async (command: any) => {
      if (!command.operationId.endsWith(':prepare') && fail) { fail = false; throw Error('Interrupted before commit'); }
      return original(command);
    });
    await expect(db.commitFinancialMutation(fingerprint, prepare)).rejects.toThrow('before commit');
    const pending = db.getPendingFinancialRecovery()!;
    expect(db.orders).toHaveLength(0);
    const recovered = await db.recoverPendingFinancialMutation(pending.operationId);
    expect(recovered.outcome).toBe('COMMITTED'); expect(db.orders).toHaveLength(1);
    expect(db.paymentTransactions).toHaveLength(1); expect(db.hasPendingFinancialMutation()).toBe(true);
    await db.acknowledgeFinancialMutation(recovered.operationId);
  });
  it('recovers a kitchen submission as an unpaid bill with one ticket and its actual balance due', async () => {
    await cashierCart();
    const manager = { ...db.users[0], id: 'recovery-manager', fullName: 'Recovery manager', roleId: 'role-manager', isActive: true };
    db.users = [manager]; usePosStore.setState({ currentUser: manager, isAuthenticated: true }); db.notify(); await storage.flush();
    const original = (storage as any).backend.command.bind((storage as any).backend); let lose = true;
    vi.spyOn((storage as any).backend, 'command').mockImplementation(async (command: any) => {
      const result = await original(command);
      if (!command.operationId.endsWith(':prepare') && lose) { lose = false; throw Error('Lost ticket response'); }
      return result;
    });
    await expect(usePosStore.getState().sendKOTDurably()).rejects.toThrow('Lost ticket');
    const pending = db.getPendingFinancialRecovery()!;
    const summary = await reviewInterruptedOperation(pending.operationId);
    expect(summary.paymentStatus).toBe('PENDING'); expect(summary.collectedAmount).toBe(0);
    expect(summary.outstandingAmount).toBe(db.orders[0].totalAmount);
    await finishInterruptedOperation(pending.operationId, 'RECOVERED_BILL');
    expect(db.orders).toHaveLength(1); expect(db.kots).toHaveLength(1); expect(db.orders[0].paymentStatus).toBe('PENDING');
    expect(usePosStore.getState().cart.items).toHaveLength(0); expect(PosPrinterService.printOrderReceipt).not.toHaveBeenCalled();
  });
  it('requires a current active manager before resuming or acknowledging a recovered operation', async () => {
    const pending = await interruptedPaidBill();
    usePosStore.setState({ isAuthenticated: false });
    await expect(reviewInterruptedOperation(pending.operationId)).rejects.toThrow('active manager');
    usePosStore.setState({ isAuthenticated: true });
    await reviewInterruptedOperation(pending.operationId);
    db.users[0].isActive = false;
    await expect(finishInterruptedOperation(pending.operationId, 'RECOVERED_BILL')).rejects.toThrow('active manager');
    expect(db.hasPendingFinancialMutation()).toBe(true); expect(usePosStore.getState().cart.items).toHaveLength(1);
  });
  it('does not discard newer cart edits during manager recovery review', async () => {
    const pending = await interruptedPaidBill(); await reviewInterruptedOperation(pending.operationId);
    const current = usePosStore.getState().cart;
    usePosStore.setState({ cart: { ...current, items: [...current.items, { ...current.items[0], cartItemId: 'new-separate-draft' }] } });
    await expect(finishInterruptedOperation(pending.operationId, 'RECOVERED_BILL')).rejects.toThrow('changed during review');
    expect(usePosStore.getState().cart.items).toHaveLength(2); expect(db.hasPendingFinancialMutation()).toBe(true);
  });
  it('keeps a separate cart only after explicit manager review and never repeats the collection', async () => {
    const pending = await interruptedPaidBill();
    await reviewInterruptedOperation(pending.operationId);
    const before = structuredClone(usePosStore.getState().cart);
    await finishInterruptedOperation(pending.operationId, 'SEPARATE_WORK');
    expect(usePosStore.getState().cart).toEqual(before); expect(db.orders).toHaveLength(1);
    expect(db.hasPendingFinancialMutation()).toBe(false); expect(PosPrinterService.printOrderReceipt).not.toHaveBeenCalled();
  });
  it('rejects a changed operation reference and a wrong branch without releasing the original recovery lock', async () => {
    const pending = await interruptedPaidBill();
    await expect(db.recoverPendingFinancialMutation('different-operation')).rejects.toThrow('changed');
    const originalBranch = db.outlet.id;
    db.outlet = { ...db.outlet, id: 'different-branch' };
    expect(() => db.getPendingFinancialRecovery()).toThrow('original account');
    db.outlet = { ...db.outlet, id: originalBranch };
    expect(db.getPendingFinancialRecovery()).toEqual(pending);
  });
  it('requires review again if the saved bill changes and never silently clears the current draft', async () => {
    const pending = await interruptedPaidBill();
    await expect(finishInterruptedOperation(pending.operationId, 'RECOVERED_BILL')).rejects.toThrow('review the original');
    await reviewInterruptedOperation(pending.operationId);
    db.orders[0].customerNotes = 'Updated by another window';
    await expect(finishInterruptedOperation(pending.operationId, 'RECOVERED_BILL')).rejects.toThrow('changed during review');
    expect(usePosStore.getState().cart.items).toHaveLength(1); expect(db.hasPendingFinancialMutation()).toBe(true);
  });
  it('retains recovery when its final acknowledgement response is lost and permits safe re-review', async () => {
    const pending = await interruptedPaidBill(); await reviewInterruptedOperation(pending.operationId);
    vi.mocked((storage as any).backend.command).mockRestore();
    const original = (storage as any).backend.command.bind((storage as any).backend); let lose = true;
    vi.spyOn((storage as any).backend, 'command').mockImplementation(async (command: any) => {
      const result = await original(command);
      if (command.operationId.endsWith(':ack') && lose) { lose = false; throw Error('Lost final recovery response'); }
      return result;
    });
    await expect(finishInterruptedOperation(pending.operationId, 'RECOVERED_BILL')).rejects.toThrow('Lost final');
    expect(usePosStore.getState().cart.items).toHaveLength(0); expect(db.hasPendingFinancialMutation()).toBe(true);
    await reviewInterruptedOperation(pending.operationId); await finishInterruptedOperation(pending.operationId, 'EMPTY');
    expect(db.orders).toHaveLength(1); expect(db.hasPendingFinancialMutation()).toBe(false);
    expect(PosPrinterService.printOrderReceipt).not.toHaveBeenCalled();
  });
  it('keeps damaged command data private and preserves it for support review', async () => {
    const key = 'jamanvaar_db_financial_command_pending';
    storage.setItem(key, '{"privateCustomer":"never-echo-this-private-value",'); await storage.flush();
    expect(() => db.getPendingFinancialRecovery()).toThrow('damaged');
    try { db.getPendingFinancialRecovery(); } catch (error) { expect(String(error)).not.toContain('never-echo'); }
    expect(storage.getItem(key)).toContain('never-echo');
  });
  it('does not overlook an unrestored saved draft when the visible cart is empty', async () => {
    const pending = await interruptedPaidBill();
    const { PosRecoveryService } = await import('../apps/restaurant-system/pos/src/services/recoveryService');
    const draft = PosRecoveryService.loadDraft()!;
    expect(draft.cart.items.length).toBeGreaterThan(0);
    usePosStore.setState({ cart: { ...usePosStore.getState().cart, items: [] }, recoverableDraft: draft });
    const review = await reviewInterruptedOperation(pending.operationId);
    expect(review.cartItems).toBe(0); expect(review.savedDraftItems).toBeGreaterThan(0);
    await expect(finishInterruptedOperation(pending.operationId, 'EMPTY')).rejects.toThrow('saved draft');
    await finishInterruptedOperation(pending.operationId, 'RECOVERED_BILL');
    expect(PosRecoveryService.loadDraft()).toBeNull(); expect(usePosStore.getState().recoverableDraft).toBeNull();
    expect(db.orders).toHaveLength(1); expect(db.hasPendingFinancialMutation()).toBe(false);
  });
  it.each(['counter', 'table'].flatMap(mode => ['PERCENTAGE', 'COUPON'].map(discount => ({ mode, discount }))))('restores accepted prices and $discount settings when reopening a $mode bill', async ({ mode, discount }) => {
    await cashierCart(); usePosStore.getState().clearCart();
    db.taxGroups = []; db.menuItems[0].taxGroupId = undefined;
    const table = mode === 'table' ? db.tables[0] : undefined;
    const order = OrderRepository.createOrder({ source_type: 'POS', orderStatus: 'PREPARING', paymentStatus: 'PENDING',
      tableId: table?.id, tableNumber: table?.tableNumber, orderType: table ? 'DINE_IN' : 'TAKEAWAY',
      items: [{ id: 'accepted-discount-line', orderId: '', menuItemId: db.menuItems[0].id, name: 'Meal', sku: 'MEAL', quantity: 2,
        unitPrice: 100, totalPrice: 200, modifiers: [], kitchenStatus: 'PREPARING' }], subtotal: 200, discountAmount: 20,
      discountType: discount as 'PERCENTAGE' | 'COUPON', discountValue: discount === 'COUPON' ? 20 : 10, discountScope: 'BILL', totalAmount: 180 });
    if (table) { table.currentOrderId = order.id; table.status = 'OCCUPIED'; }
    db.menuItems[0].price = 999; db.notify(); await storage.flush();
    const loaded = table ? usePosStore.getState().loadOrderFromTable(table) : usePosStore.getState().loadOrderForSettlement(order.id);
    expect(loaded.ok).toBe(true);
    expect(usePosStore.getState().cart.totalPayable).toBe(180);
    expect(usePosStore.getState().discountType).toBe(discount === 'COUPON' ? 'FIXED' : 'PERCENTAGE');
    expect(usePosStore.getState().discountValue).toBe(discount === 'COUPON' ? 20 : 10);
    expect(usePosStore.getState().cart.items[0].unitPrice).toBe(100);
    const paid = await usePosStore.getState().completePaymentDurably('CASH', 180, 'accepted-discount-collection');
    expect(paid).toMatchObject({ totalAmount: 180, discountAmount: 20, discountType: discount, discountValue: discount === 'COUPON' ? 20 : 10 });
  });
  it('keeps accepted tax snapshots through cancellation and settlement after menu prices and taxes change', async () => {
    await cashierCart();
    db.taxGroups = [{ id: 'accepted-gst', name: 'GST', cgstPercent: 2.5, sgstPercent: 2.5, igstPercent: 5, isInclusive: false, isActive: true }];
    db.menuItems[0].taxGroupId = 'accepted-gst';
    db.menuItems.push({ ...db.menuItems[0], id: 'second-meal', name: 'Second meal', price: 200 });
    usePosStore.getState().clearCart();
    usePosStore.getState().addItemToCart(db.menuItems[0]); usePosStore.getState().addItemToCart(db.menuItems[1]);
    db.notify(); await storage.flush(); await usePosStore.getState().sendKOTDurably();
    const firstId = usePosStore.getState().cart.items[0].cartItemId;
    db.taxGroups[0].cgstPercent = 9; db.taxGroups[0].sgstPercent = 9;
    db.menuItems[0].price = 999; db.menuItems[1].price = 888; db.notify(); await storage.flush();
    await usePosStore.getState().cancelSentItemDurably(firstId, 'Guest changed mind');
    expect(db.orders[0].totalAmount).toBe(210);
    const paid = await usePosStore.getState().completePaymentDurably('CASH', 210, 'accepted-tax-collection');
    expect(paid?.totalAmount).toBe(210);
    expect(paid?.items.find(line => line.menuItemId === 'second-meal')?.snapshot).toMatchObject({ taxRateBp: 500, lineTax: 1000 });
    expect(paid?.items.filter(line => line.kitchenStatus === 'CANCELLED')).toHaveLength(1);
  });
  it('frees a table after its last accepted dish is cancelled and starts a new bill for the next submission', async () => {
    await cashierCart();
    const table = db.tables[0]; usePosStore.setState({ selectedTable: table, orderType: 'DINE_IN' });
    await usePosStore.getState().sendKOTDurably();
    const cancelledId = db.orders[0].id, lineId = usePosStore.getState().cart.items[0].cartItemId;
    expect(await usePosStore.getState().cancelSentItemDurably(lineId, 'Guest left')).toBe(true);
    expect(db.orders[0]).toMatchObject({ id: cancelledId, orderStatus: 'CANCELLED', totalAmount: 0 });
    expect(db.tables.find(row => row.id === table.id)?.status).toBe('AVAILABLE');
    expect(db.tables.find(row => row.id === table.id)?.currentOrderId).toBeUndefined();
    expect(usePosStore.getState().runningOrderId).toBeNull();
    usePosStore.getState().addItemToCart(db.menuItems[0]);
    await usePosStore.getState().sendKOTDurably();
    expect(db.orders).toHaveLength(2); expect(db.orders.find(order => order.id === cancelledId)?.orderStatus).toBe('CANCELLED');
  });
  it('replays sent-line cancellation, keeps unsent work and retains cancellation history when the bill is amended', async () => {
    await cashierCart();
    db.menuItems.push({ ...db.menuItems[0], id: 'second-meal', name: 'Second meal', price: 200 }); db.notify(); await storage.flush();
    usePosStore.getState().addItemToCart(db.menuItems[1]);
    await usePosStore.getState().sendKOTDurably();
    const first = usePosStore.getState().cart.items[0], firstOrderItemId = first.orderItemId;
    usePosStore.getState().addItemToCart({ ...db.menuItems[0], id: 'unsent-extra', price: 50 });
    const original = (storage as any).backend.command.bind((storage as any).backend);
    let lose = true;
    vi.spyOn((storage as any).backend, 'command').mockImplementation(async (command: any) => {
      const result = await original(command);
      if (!command.operationId.endsWith(':prepare') && lose) { lose = false; throw Error('Lost sent-line cancellation'); }
      return result;
    });
    await expect(usePosStore.getState().cancelSentItemDurably(first.cartItemId, 'Guest changed mind')).rejects.toThrow('Lost sent-line cancellation');
    expect(usePosStore.getState().cart.items.some(line => line.cartItemId === first.cartItemId)).toBe(true);
    expect(await usePosStore.getState().cancelSentItemDurably(first.cartItemId, 'Guest changed mind')).toBe(true);
    expect(db.orders[0].items.find(line => line.id === firstOrderItemId)?.kitchenStatus).toBe('CANCELLED');
    expect(db.orders[0].items).toHaveLength(2); // the extra dish is still a private draft
    expect(usePosStore.getState().cart.items.find(line => line.menuItemId === 'unsent-extra')?.kotSentQty ?? 0).toBe(0);
    db.menuItems.push({ ...db.menuItems[0], id: 'unsent-extra', price: 50 }); db.notify(); await storage.flush();
    await usePosStore.getState().sendKOTDurably();
    expect(db.orders[0].items.find(line => line.id === firstOrderItemId)?.kitchenStatus).toBe('CANCELLED');
    expect(db.orders[0].items).toHaveLength(3);
    usePosStore.getState().clearCart();
    expect(usePosStore.getState().loadOrderForSettlement(db.orders[0].id).ok).toBe(true);
    expect(usePosStore.getState().cart.items.some(line => line.orderItemId === firstOrderItemId)).toBe(false);
  });
  it('replays server-verified collection after losing the local acknowledgement without another payment effect', async () => {
    await cashierCart();
    await usePosStore.getState().sendKOTDurably();
    const id = db.orders[0].id;
    OrderRepository.updateOrder(id, { paymentMethod: 'UPI', paymentTransactionId: 'original-server-payment' }); await storage.flush();
    const original = (storage as any).backend.command.bind((storage as any).backend);
    let lose = true;
    vi.spyOn((storage as any).backend, 'command').mockImplementation(async (command: any) => {
      const result = await original(command);
      if (!command.operationId.endsWith(':prepare') && lose) { lose = false; throw Error('Lost reconciliation response'); }
      return result;
    });
    await expect(commitVerifiedOnlineCollection(id, 'original-server-payment')).rejects.toThrow('Lost reconciliation response');
    expect(db.orders[0].paymentStatus).toBe('PENDING');
    const recovered = await commitVerifiedOnlineCollection(id, 'original-server-payment');
    expect(recovered.outcome).toBe('REPLAYED'); expect(recovered.order.paymentStatus).toBe('SUCCESS');
    expect(recovered.order.paymentTransactionId).toBe('original-server-payment');
    expect(db.orders).toHaveLength(1); expect(db.kots).toHaveLength(1);
    await db.acknowledgeFinancialMutation(recovered.operationId);
    await expect(commitVerifiedOnlineCollection(id, 'different-payment')).rejects.toThrow('different collection');
  });
  it('refuses to reopen a cancelled bill even when its online collection is verified', async () => {
    await cashierCart(); await usePosStore.getState().sendKOTDurably();
    OrderRepository.updateOrder(db.orders[0].id, { orderStatus: 'CANCELLED' }); await storage.flush();
    await expect(commitVerifiedOnlineCollection(db.orders[0].id, 'late-online-payment')).rejects.toThrow('closed bill');
    expect(db.orders[0].paymentStatus).toBe('PENDING');
  });
  it('records successive partial cash returns in the paying register and replays without another cash-out', async () => {
    await cashierCart();
    const paid = await usePosStore.getState().completePaymentDurably('CASH', 200, 'refundable-collection');
    const shiftId = ShiftRepository.getActiveShift()!.id;
    const first = { kind: 'REFUND' as const, orderId: paid!.id, amount: 20, reason: 'Returned part', actor: 'Manager', expectedRefundBefore: 0,
      returnOptions: { idempotencyKey: 'return-first', payingShiftId: shiftId, method: 'CASH' as const } };
    const result = await commitOrderReturn(first); await db.acknowledgeFinancialMutation(result.operationId);
    expect(result.order.refundAmount).toBe(20); expect(result.order.refundEvents).toHaveLength(1);
    const movements = db.cashMovements.filter(movement => movement.id === 'refund-cash-return-first');
    expect(movements).toHaveLength(1); expect(movements[0].amount).toBe(20);
    const replay = await commitOrderReturn(first); await db.acknowledgeFinancialMutation(replay.operationId);
    expect(db.cashMovements.filter(movement => movement.id === 'refund-cash-return-first')).toHaveLength(1);
    expect(db.orders[0].refundAmount).toBe(20);
    const second = await commitOrderReturn({ ...first, expectedRefundBefore: 20,
      returnOptions: { ...first.returnOptions, idempotencyKey: 'return-second' } });
    expect(second.order.refundAmount).toBe(40); expect(second.order.refundEvents).toHaveLength(2);
    await db.acknowledgeFinancialMutation(second.operationId);
    await expect(commitOrderReturn({ ...first, returnOptions: { ...first.returnOptions, idempotencyKey: 'stale-attempt' } })).rejects.toThrow('refund ledger changed');
    expect(db.orders[0].refundAmount).toBe(40);
  });
  it('recovers an actual return action after a lost response without another stock or loyalty reversal', async () => {
    await cashierCart();
    const paid = await usePosStore.getState().completePaymentDurably('CASH', 200, 'refundable-collection');
    const original = (storage as any).backend.command.bind((storage as any).backend);
    let lose = true;
    vi.spyOn((storage as any).backend, 'command').mockImplementation(async (command: any) => {
      const result = await original(command);
      if (!command.operationId.endsWith(':prepare') && lose) { lose = false; throw Error('Lost refund response'); }
      return result;
    });
    const request = { kind: 'REFUND' as const, orderId: paid!.id, amount: paid!.totalAmount, reason: 'Meal returned', actor: 'Manager' };
    await expect(commitOrderReturn(request)).rejects.toThrow('Lost refund response');
    const recovered = await commitOrderReturn(request);
    expect(recovered.outcome).toBe('REPLAYED'); expect(recovered.order.paymentStatus).toBe('REFUNDED');
    expect(recovered.order.refundAmount).toBe(paid!.totalAmount);
    expect(db.auditLogs.filter(log => log.action === 'REFUND' && log.details.includes(paid!.orderNumber))).toHaveLength(1);
  });

  it('records an unpaid void through the same acknowledged operation boundary', async () => {
    const created = await db.commitFinancialMutation('d'.repeat(64), prepare);
    await db.acknowledgeFinancialMutation(created.operationId);
    db.orders[0].paymentStatus = 'PENDING'; db.orders[0].orderStatus = 'CONFIRMED'; db.notify(); await storage.flush();
    const saved = await commitOrderReturn({ kind: 'VOID', orderId: db.orders[0].id, reason: 'Guest cancelled', actor: 'Manager' });
    expect(saved.order.orderStatus).toBe('CANCELLED');
    await db.acknowledgeFinancialMutation(saved.operationId);
  });
  it('keeps the cart and payment screen until SQLite acknowledges, then opens its saved receipt', async () => {
    await cashierCart();
    let release!: () => void, enter!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const entered = new Promise<void>(resolve => { enter = resolve; });
    const original = (storage as any).backend.command.bind((storage as any).backend);
    vi.spyOn((storage as any).backend, 'command').mockImplementation(async (command: any) => {
      if (!command.operationId.endsWith(':prepare') && !command.operationId.endsWith(':ack')) { enter(); await gate; }
      return original(command);
    });
    const payment = usePosStore.getState().completePaymentDurably('CASH', 200, 'first-transaction');
    try {
      await entered;
      expect(usePosStore.getState().cart.items).toHaveLength(1);
      expect(usePosStore.getState().isPaymentOpen).toBe(true);
      expect(usePosStore.getState().lastCompletedOrder).toBeNull();
      expect(PosPrinterService.printOrderReceipt).not.toHaveBeenCalled();
      expect(usePosStore.getState().openCashDrawer).not.toHaveBeenCalled();
      release();
      const paid = await payment;
      expect(paid?.paymentStatus).toBe('SUCCESS');
      expect(usePosStore.getState().cart.items).toHaveLength(0);
      expect(usePosStore.getState().isReceiptOpen).toBe(true);
      expect(PosPrinterService.printOrderReceipt).toHaveBeenCalledOnce();
      expect(usePosStore.getState().openCashDrawer).toHaveBeenCalledOnce();
    } finally { release(); }
  });

  it('recovers a lost checkout acknowledgement with the original payment reference and no automatic reprint', async () => {
    await cashierCart();
    const original = (storage as any).backend.command.bind((storage as any).backend);
    let lose = true;
    vi.spyOn((storage as any).backend, 'command').mockImplementation(async (command: any) => {
      const result = await original(command);
      if (!command.operationId.endsWith(':prepare') && lose) { lose = false; throw Error('Response lost'); }
      return result;
    });
    await expect(usePosStore.getState().completePaymentDurably('CASH', 200, 'original-reference')).rejects.toThrow('Response lost');
    expect(usePosStore.getState().cart.items).toHaveLength(1);
    const paid = await usePosStore.getState().completePaymentDurably('CASH', 200, 'new-ui-attempt-reference');
    expect(paid?.paymentTransactionId).toBe('original-reference');
    expect(db.orders).toHaveLength(1);
    expect(PosPrinterService.printOrderReceipt).not.toHaveBeenCalled();
    expect(usePosStore.getState().openCashDrawer).not.toHaveBeenCalled();
    expect(usePosStore.getState().isReceiptOpen).toBe(true);
  });

  it('refuses the legacy success-before-ack entry point on a durable store', async () => {
    await cashierCart();
    expect(() => usePosStore.getState().completePayment('CASH')).toThrow('acknowledged checkout');
    expect(db.orders).toHaveLength(0);
  });

  it('saves POS kitchen submission before updating sent quantities and replays a lost response once', async () => {
    await cashierCart();
    const original = (storage as any).backend.command.bind((storage as any).backend);
    let lose = true;
    vi.spyOn((storage as any).backend, 'command').mockImplementation(async (command: any) => {
      const result = await original(command);
      if (!command.operationId.endsWith(':prepare') && lose) { lose = false; throw Error('Lost POS ticket response'); }
      return result;
    });
    const print = vi.spyOn(PosPrinterService, 'printKOT').mockResolvedValue({ status: 'PRINTED' } as any);
    await expect(usePosStore.getState().sendKOTDurably()).rejects.toThrow('Lost POS ticket response');
    expect(usePosStore.getState().cart.items[0].kotSentQty || 0).toBe(0); expect(print).not.toHaveBeenCalled();
    const tickets = await usePosStore.getState().sendKOTDurably();
    expect(tickets).toHaveLength(1); expect(db.orders).toHaveLength(1); expect(db.kots).toHaveLength(1);
    expect(usePosStore.getState().cart.items[0].kotSentQty).toBe(1);
    expect(usePosStore.getState().cart.items[0].orderItemId).toBe(tickets![0].items[0].orderItemId);
    expect(print).not.toHaveBeenCalled();
    expect(await usePosStore.getState().sendKOTDurably()).toBeNull();
  });

  it('refuses to submit a POS kitchen ticket with missing required choices or an invalid quantity', async () => {
    await cashierCart();
    db.modifierGroups = [{ id: 'required-spice', name: 'Spice', isRequired: true, minSelection: 1, maxSelection: 1,
      options: [{ id: 'mild', name: 'Mild', price: 0, isAvailable: true }] } as any];
    db.menuItems[0].modifierGroupIds = ['required-spice']; db.notify(); await storage.flush();
    await expect(usePosStore.getState().sendKOTDurably()).rejects.toThrow(/Spice/);
    expect(db.orders).toHaveLength(0); expect(db.kots).toHaveLength(0);
    db.menuItems[0].modifierGroupIds = []; db.menuItems[0].minQuantity = 2; db.notify(); await storage.flush();
    await expect(usePosStore.getState().sendKOTDurably()).rejects.toThrow(/quantity/i);
    expect(db.orders).toHaveLength(0); expect(db.kots).toHaveLength(0);
  });

  it('uses the same acknowledgement boundary for Instant Bill and honours disabled automatic printing', async () => {
    await cashierCart();
    db.restaurant.instantBillConfig = { ...db.restaurant.instantBillConfig, enabled: true, paymentMethod: 'CASH', autoPrint: false, askConfirmation: false, defaultOrderType: 'TAKEAWAY', sendKotBeforeBill: true } as any;
    const printKot = vi.spyOn(PosPrinterService, 'printKOT').mockResolvedValue({ status: 'PRINTED' } as any);
    db.notify(); await storage.flush();
    const paid = await usePosStore.getState().executeInstantBill('CASH');
    expect(paid?.paymentStatus).toBe('SUCCESS'); expect(paid?.orderType).toBe('TAKEAWAY');
    expect(db.kots).toHaveLength(1); expect(printKot).toHaveBeenCalledOnce();
    expect(PosPrinterService.printOrderReceipt).not.toHaveBeenCalled();
    expect(db.receiptRecords[0].deliveryStatus).toBe('QUEUED');
    expect(usePosStore.getState().isInstantBillProcessing).toBe(false);
  });

  it('commits configured loyalty redemption with the bill and reverses it once through a durable full refund', async () => {
    await cashierCart();
    const pos = usePosStore.getState(); pos.clearCart();
    db.menuItems[0].price = 500;
    CustomerRepository.updateProgramSettings({ enabled: true, earnPoints: 1, perRupeesSpent: 10 });
    CustomerRepository.updateReward('reward-100off', { pointsCost: 150, discountAmount: 100, isActive: true });
    pos.addItemToCart(db.menuItems[0]); pos.setSelectedCustomer(CustomerRepository.getByPhone('9876500012')!);
    usePosStore.getState().selectLoyaltyReward('reward-100off');
    db.notify(); await storage.flush();
    const paid = await usePosStore.getState().completePaymentDurably('CASH', 500, 'loyalty-collection');
    expect(paid?.loyaltyPointsRedeemed).toBe(150);
    expect(CustomerRepository.getByPhone('9876500012')?.loyaltyPoints).toBe(50 + Math.floor(paid!.totalAmount / 10));
    const refund = await db.commitFinancialMutation('c'.repeat(64), () => {
      OrderRepository.refundOrder(paid!.id, paid!.totalAmount, 'Returned meal', 'Manager');
      return { orderId: paid!.id };
    });
    expect(refund.outcome).toBe('COMMITTED');
    expect(CustomerRepository.getByPhone('9876500012')?.loyaltyPoints).toBe(200);
    const replay = await db.commitFinancialMutation('c'.repeat(64), () => { throw Error('Refund must not run twice'); });
    expect(replay.outcome).toBe('REPLAYED');
    expect(CustomerRepository.getByPhone('9876500012')?.loyaltyPoints).toBe(200);
  });
});
