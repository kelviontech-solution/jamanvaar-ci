import React from 'react';
import { createRoot } from 'react-dom/client';
import { db, DurableStorage, WorkerBackend, ShiftRepository, KeyValueStore } from '@jamanvaar/database';
import { PosPaymentModal } from '../../../apps/restaurant-system/pos/src/components/payment/PosPaymentModal';
import { usePosStore } from '../../../apps/restaurant-system/pos/src/store/posStore';
import { PosPrinterService } from '../../../apps/restaurant-system/pos/src/services/printerService';
import { PosRecoveryService } from '../../../apps/restaurant-system/pos/src/services/recoveryService';
import { DeviceRecoveryPanel } from '../../../apps/restaurant-system/pos/src/components/settings/DeviceRecoveryPanel';
import { InterruptedOperationRecoveryPanel } from '../../../apps/restaurant-system/pos/src/components/settings/InterruptedOperationRecoveryPanel';
import '../../../apps/restaurant-system/pos/src/index.css';

// Runs only in this loopback fixture: real app UI/store and SQLite OPFS worker;
// simulated hardware, staff identity and failures. No production credentials.
async function boot() {
  const fixture = new URLSearchParams(location.search).get('case') || 'fixture';
  if (!/^[a-z0-9-]+$/.test(fixture)) throw Error('Invalid isolated fixture name');
  const backend = new WorkerBackend(new Worker(new URL('../../../packages/database/src/durable/sqlite_worker.ts', import.meta.url), { type: 'module' }) as never, `acceptance-${fixture}`);
  let mode = 'normal', entered = false, release: (() => void) | null = null;
  let printed = 0, drawer = 0;
  const storage = await DurableStorage.open({
    load: () => backend.load(), write: ops => backend.write(ops), close: () => backend.close(),
    exportRecovery: scope => backend.exportRecovery(scope),
    command: async command => {
      const result = await backend.command(command);
      if (!command.operationId.endsWith(':prepare') && !command.operationId.endsWith(':ack')) {
        entered = true;
        if (mode === 'pause') await new Promise<void>(resolve => { release = resolve; });
        if (mode === 'lost') { mode = 'normal'; throw Error('Injected lost worker acknowledgement'); }
      }
      return result;
    }
  });
  db.attachDurableStorage(storage); KeyValueStore.attach(storage, { migrateLegacy: false });
  if (!storage.getItem('acceptance-initialized')) {
    db.orders = []; db.kots = []; db.shifts = []; db.receiptRecords = []; db.customerAccounts = [];
    db.restaurant = { ...db.restaurant, id: 'fixture-restaurant', name: 'Acceptance restaurant' };
    db.outlet = { ...db.outlet, id: 'fixture-branch' };
    db.menuItems = [{ ...db.menuItems[0], id: 'fixture-meal', name: 'Test meal', price: 100, isAvailable: true, modifierGroupIds: [], minQuantity: 1 }];
    db.users = [{ ...db.users[0], id: 'fixture-manager', fullName: 'Test manager', roleId: 'role-manager', isActive: true }];
    ShiftRepository.openShift('fixture-cashier', 'Test cashier', 0);
    db.notify(); storage.setItem('acceptance-initialized', 'true'); await storage.flush();
  }
  usePosStore.setState({ currentUser: { id: 'fixture-cashier', fullName: 'Test cashier', roleId: 'role-cashier' } as any,
    posTerminalId: 'fixture-pos', orderType: 'TAKEAWAY', openCashDrawer: () => { drawer++; } });
  const draft = PosRecoveryService.loadDraft();
  if (draft) { usePosStore.setState({ recoverableDraft: draft }); usePosStore.getState().recoverDraftSession(); }
  else usePosStore.getState().addItemToCart(db.menuItems[0]);
  usePosStore.setState({ isPaymentOpen: true });
  if (new URLSearchParams(location.search).get('screen') === 'interrupted') {
    usePosStore.setState({ currentUser: db.users[0], isAuthenticated: true, isPaymentOpen: false });
  }
  PosPrinterService.printOrderReceipt = async () => { printed++; return { status: 'PRINTED' } as any; };
  PosPrinterService.printKOT = async () => ({ status: 'PRINTED' } as any);
  (window as any).__checkout = {
    mode: (value: string) => { mode = value; }, release: () => release?.(),
    state: () => ({ entered, orders: db.orders.length, paid: db.orders.filter(order => order.paymentStatus === 'SUCCESS').length,
      cart: usePosStore.getState().cart.items.length, receipt: usePosStore.getState().isReceiptOpen,
      pending: storage.keys().some(key => key.endsWith('financial_command_pending')), printed, drawer,
      reference: usePosStore.getState().lastCompletedOrder?.paymentTransactionId, storage: storage.health().commitState })
  };
  const App = () => {
    const saved = usePosStore(state => state.lastCompletedOrder);
    return new URLSearchParams(location.search).get('screen') === 'interrupted'
      ? <main style={{ maxWidth: 760, margin: '24px auto', padding: 16 }}><InterruptedOperationRecoveryPanel/></main>
      : new URLSearchParams(location.search).get('screen') === 'recovery'
      ? <main style={{ maxWidth: 760, margin: '24px auto', padding: 16 }}><DeviceRecoveryPanel/></main>
      : <main><PosPaymentModal/>{saved && <p role="status">Saved receipt: {saved.orderNumber}</p>}</main>;
  };
  createRoot(document.getElementById('root')!).render(<App/>);
}
boot().catch(error => { document.getElementById('root')!.textContent = error.message; throw error; });
