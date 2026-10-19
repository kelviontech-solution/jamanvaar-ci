import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { db, DurableStorage, WorkerBackend, KeyValueStore, ShiftRepository, OrderRepository } from '@jamanvaar/database';
import { SessionPersistence } from '@jamanvaar/business';
import { OrderDetailModal } from '../../../apps/restaurant-system/pos-admin/src/components/OrderDetailModal';
import { PosCart } from '../../../apps/restaurant-system/pos/src/components/cart/PosCart';
import { PosBillsView } from '../../../apps/restaurant-system/pos/src/components/bills/PosBillsView';
import { usePosStore } from '../../../apps/restaurant-system/pos/src/store/posStore';
import { PosPrinterService } from '../../../apps/restaurant-system/pos/src/services/printerService';
import { useCaptainStore } from '../../../apps/restaurant-system/captain/src/store/captainStore';
import { CaptainTableWorkspaceModal } from '../../../apps/restaurant-system/captain/src/components/tables/CaptainTableWorkspaceModal';
import { commitKioskDraft, commitKioskAdmission } from '../../../apps/kiosk-system/kiosk-user/src/kioskAdmission';
import '../../../apps/restaurant-system/pos/src/index.css';

async function boot() {
  const screen = new URLSearchParams(location.search).get('screen') || 'pos';
  let mode = 'normal', entered = false, release: (() => void) | null = null;
  const backend = new WorkerBackend(new Worker(new URL('../../../packages/database/src/durable/sqlite_worker.ts', import.meta.url), { type: 'module' }) as never, `kitchen-acceptance-${screen}`);
  const storage = await DurableStorage.open({ load: () => backend.load(), write: ops => backend.write(ops), close: () => backend.close(),
    command: async command => {
      const result = await backend.command(command);
      if (!command.operationId.endsWith(':prepare') && !command.operationId.endsWith(':ack')) {
        entered = true;
        if (mode === 'pause') await new Promise<void>(resolve => { release = resolve; });
        if (mode === 'lost') { mode = 'normal'; throw Error('Injected lost kitchen-save response'); }
      }
      return result;
    } });
  db.attachDurableStorage(storage); KeyValueStore.attach(storage, { migrateLegacy: false });
  db.orders = []; db.kots = []; db.shifts = []; db.customerAccounts = []; db.receiptRecords = [];
  db.menuItems = [{ ...db.menuItems[0], id: 'fixture-meal', name: 'Test meal', modifierGroupIds: [], price: 100, isAvailable: true, minQuantity: 1 }];
  db.tables = [{ ...db.tables[0], id: 'fixture-table', tableNumber: 'T1', currentOrderId: undefined, status: 'OCCUPIED' }];
  db.notify(); await storage.flush();
  usePosStore.setState({ currentUser: { id: 'fixture-user', fullName: 'Test cashier', roleId: 'role-cashier' } as any,
    posTerminalId: 'fixture-pos', selectedTable: null, runningOrderId: null, orderType: 'TAKEAWAY', isPaymentOpen: false });
  usePosStore.getState().clearCart(); usePosStore.getState().addItemToCart(db.menuItems[0]);
  useCaptainStore.setState({ currentCaptain: { id: 'fixture-user', name: 'Test captain', permissions: {} } as any,
    selectedTable: db.tables[0], selectedTableOrder: null, cartItems: [], attachedCustomer: null });
  useCaptainStore.getState().addItemToCart(db.menuItems[0], [], '', 'COURSE_1', 1);
  PosPrinterService.printKOT = async () => ({ status: 'PRINTED' } as any);
  PosPrinterService.printOrderReceipt = async () => ({ status: 'PRINTED' } as any);
  usePosStore.setState({ openCashDrawer: () => {} });
  if (screen === 'pos-cancel') {
    db.menuItems.push({ ...db.menuItems[0], id: 'fixture-second', name: 'Second meal', price: 200 });
    usePosStore.getState().addItemToCart(db.menuItems[1]);
    db.notify(); await storage.flush();
    await usePosStore.getState().sendKOTDurably();
  }
  if (screen === 'refund' || screen === 'admin-refund') {
    ShiftRepository.openShift('fixture-user', 'Test cashier', 200);
    db.notify(); await storage.flush();
    await usePosStore.getState().completePaymentDurably('CASH', 200, 'fixture-collection');
    // Approval identity is a fixture, not authentication acceptance.
    usePosStore.setState({ requestManagerOverride: (_action, _title, _details, approve) => { void Promise.resolve(approve('Test manager')); } });
  }
  SessionPersistence.save('admin', { userId: 'fixture-owner', fullName: 'Test owner', roleId: 'role-admin', restaurantId: db.restaurant.id });
  if (screen === 'admin-void') {
    OrderRepository.createOrder({ items: [], subtotal: 100, totalAmount: 100, source_type: 'POS', paymentStatus: 'PENDING', orderStatus: 'PREPARING' });
    await storage.flush();
  }
  const created = screen === 'kiosk' ? await commitKioskDraft({ kioskId: 'fixture-kiosk', orderType: 'TAKEAWAY',
    items: [{ id: 'fixture-line', orderId: '', menuItemId: 'fixture-meal', sku: 'MEAL', name: 'Test meal', quantity: 1, unitPrice: 100, totalPrice: 100, modifiers: [], kitchenStatus: 'PENDING' }],
    subtotal: 100, totalAmount: 100, paymentMethod: 'CASH_AT_COUNTER' }) : null;
  if (created) await db.acknowledgeFinancialMutation(created.operationId);
  entered = false;
  (window as any).__kitchen = { mode: (value: string) => { mode = value; }, release: () => release?.(),
    state: () => ({ entered, orders: db.orders.length, kots: db.kots.length,
      paid: db.orders.filter(order => order.paymentStatus === 'SUCCESS').length,
      posSent: usePosStore.getState().cart.items[0]?.kotSentQty || 0,
      captainSent: useCaptainStore.getState().cartItems.filter(line => line.isFired).length,
      refunded: db.orders[0]?.refundAmount || 0, returnEvents: db.orders[0]?.refundEvents?.length || 0,
      cancelled: db.orders.filter(order => order.orderStatus === 'CANCELLED').length,
      cancelledLines: db.orders[0]?.items.filter(line => line.kitchenStatus === 'CANCELLED').length || 0,
      cartLines: usePosStore.getState().cart.items.length,
      returnCashOuts: db.cashMovements.filter(movement => movement.id.startsWith('refund-cash-')).length,
      pending: db.hasPendingFinancialMutation() }) };
  function KioskFixture() {
    const [message, setMessage] = useState('Not confirmed'), [busy, setBusy] = useState(false);
    return <section><h1>Kiosk admission service fixture</h1><p>Real admission service with SQLite. The full customer app and payment provider are outside this fixture.</p>
      <button disabled={busy} onClick={async () => { setBusy(true); try {
        const saved = await commitKioskAdmission(created!.result.orderId); setMessage('Order saved — pay at counter');
        await db.acknowledgeFinancialMutation(saved.operationId);
      } catch (error) { setMessage(error instanceof Error ? error.message : 'Save needs recovery'); } finally { setBusy(false); } }}>Confirm kiosk order</button>
      <p role="status">{message}</p></section>;
  }
  function AdminFixture() {
    const [, render] = useState(0);
    return <OrderDetailModal order={db.orders[0]} isOpen onClose={() => {}} onOrderUpdated={() => render(value => value + 1)}/>;
  }
  createRoot(document.getElementById('root')!).render(screen === 'captain'
    ? <CaptainTableWorkspaceModal table={db.tables[0]} isOpen onClose={() => {}} onOpenTransferMerge={() => {}} onOpenSendMessage={() => {}}/>
    : screen.startsWith('admin-') ? <AdminFixture/> : screen === 'refund' ? <PosBillsView/> : screen === 'kiosk' ? <KioskFixture/> : <div style={{ width: '100%', maxWidth: 420, height: '100dvh' }}><PosCart/></div>);
}
boot().catch(error => { document.getElementById('root')!.textContent = error.message; throw error; });
