import { beforeEach, describe, expect, it } from 'vitest';
import { db, ShiftRepository, OrderRepository, TableRepository, BusinessDayRepository, BusinessDayAccountingService, isUnpaidOpenOrder, getTerminalId, getOrderTenders } from '@jamanvaar/database';
import { BusinessDayService } from '@jamanvaar/business';
import { usePosStore } from '../apps/restaurant-system/pos/src/store/posStore';
import { JamanvaarLocalCore } from '@jamanvaar/database';

describe('Cash, table release and multi-register integrity', () => {
  beforeEach(() => { db.resetToDefaultSeed(); db.orders = []; db.shifts = []; db.cashMovements = []; db.kots = []; });

  it('preserves zero float and never invents a startup shift', () => {
    const day = BusinessDayRepository.getActiveBusinessDay(); day.openingCash = 0;
    expect(BusinessDayAccountingService.getBusinessDaySummary(day.id).opening_cash).toBe(0);
    expect(BusinessDayService.recoverBusinessDayState().activeShift).toBeUndefined();
    const result = BusinessDayService.closeBusinessDay({ businessDayId: day.id, actualCash: 0 });
    expect(result.newDay.openingCash).toBe(0);
    expect(db.shifts).toHaveLength(0);
  });

  it('keeps two registers independent and refuses synthetic shift replacement', () => {
    const a = ShiftRepository.openShift('a', 'Asha', 0, 'counter-a');
    const b = ShiftRepository.openShift('b', 'Bina', 750, 'counter-b');
    expect(a.status).toBe('OPEN'); expect(b.openingCash).toBe(750);
    expect(BusinessDayAccountingService.getBusinessDaySummary(a.businessDayId!).opening_cash).toBe(750);
    expect(ShiftRepository.getActiveShift('counter-a')?.id).toBe(a.id);
    expect(() => ShiftRepository.openShift('c', 'Charu', 100, 'counter-a')).toThrow(/close/);
    expect(() => BusinessDayService.closeBusinessDay({ forceCloseWithExceptions: true })).toThrow(/each register/);
    expect(ShiftRepository.getShiftOrders(a, [{ id: 'other', shiftId: b.id, createdAt: a.openedAt } as never])).toHaveLength(0);
    ShiftRepository.closeShift(a.id, 0);
    expect(() => BusinessDayService.closeBusinessDay({ forceCloseWithExceptions: true, actualCash: 750 })).toThrow(/each register/);
    expect(b.status).toBe('OPEN');
    ShiftRepository.closeShift(b.id, 750);
    expect(BusinessDayService.closeBusinessDay({ businessDayId: a.businessDayId, actualCash: 750 }).closedDay.closingCash).toBe(750);
  });

  it('releases occupancy without payment, preparation changes or reoccupying from the old QR order', () => {
    const table = db.tables[0]; table.status = 'OCCUPIED';
    const order = OrderRepository.createOrder({ orderType: 'DINE_IN', tableId: table.id, tableNumber: table.tableNumber, source_type: 'QR_TABLE', totalAmount: 250, items: [], paymentStatus: 'PENDING', orderStatus: 'PREPARING' });
    table.currentOrderId = order.id;
    TableRepository.updateTableStatus(table.id, 'AVAILABLE');
    expect(order.orderStatus).toBe('PREPARING'); expect(order.paymentStatus).toBe('PENDING');
    expect(order.tableReleasedAt).toBeTruthy();
    TableRepository.reconcileQrTableOrders(); expect(table.status).toBe('AVAILABLE');
    expect(isUnpaidOpenOrder({orderStatus: 'COMPLETED', paymentStatus: 'PENDING'})).toBe(true);
    OrderRepository.updateOrderStatus(order.id, 'COMPLETED');
    expect(BusinessDayRepository.recalculateMetrics(order.businessDayId!)?.cashSales).toBe(0);
  });

  it('reports recorded split amounts instead of guessing equal cash and UPI', () => {
    const order = OrderRepository.createOrder({ orderType: 'TAKEAWAY', totalAmount: 1000, items: [], paymentStatus: 'SUCCESS', orderStatus: 'COMPLETED', paymentMethod: 'SPLIT', paymentSplits: [{method: 'CASH', amount: 100}, {method: 'UPI', amount: 900}] });
    const summary = BusinessDayAccountingService.getBusinessDaySummary(order.businessDayId!);
    expect(summary.cash_sales).toBe(100); expect(summary.upi_sales).toBe(900);
  });

  it('retains a unique role-specific fallback identity', () => {
    expect(getTerminalId('POS')).toBe(getTerminalId('POS'));
    expect(getTerminalId('POS')).not.toBe(getTerminalId('KDS'));
    expect(getTerminalId('POS')).not.toBe('POS-01');
  });
  it('never converts a prior unattributed collection into cash when collecting the remainder', () => {
    const order=OrderRepository.createOrder({source_type:'QR_TABLE',orderType:'DINE_IN',items:[],totalAmount:250,paymentStatus:'PARTIALLY_PAID',orderStatus:'SERVED',paymentMethod:'CASH_AT_COUNTER'});
    order.paymentAllocationSummary={collectedPaise:10000,outstandingPaise:15000};
    OrderRepository.settleOrder(order.id,'CASH',150,'counter-once','Cashier',[{method:'CASH',amount:150}]);
    expect(getOrderTenders(order).cash).toBe(150);
    expect(getOrderTenders(order).other).toBe(100);
    expect(() => OrderRepository.settleOrder(order.id,'CASH',150,'counter-twice')).toThrow(/already paid/);
  });
  it('counter settlement loads a released kiosk bill by ID and settles that exact bill once', () => {
    ShiftRepository.openShift("qa-cashier", "QA Cashier", 0);
    const item=db.menuItems[0];
    const order=OrderRepository.createOrder({source_type:'KIOSK',orderType:'TAKEAWAY',items:[{id:'original-line',orderId:'',menuItemId:item.id,sku:item.sku,name:item.name,quantity:1,unitPrice:250,totalPrice:250,modifiers:[],kitchenStatus:'SERVED'}],totalAmount:250,paymentStatus:'PENDING',orderStatus:'COMPLETED',paymentMethod:'CASH_AT_COUNTER'});
    const pos=usePosStore.getState();pos.clearCart();
    // Simultaneous-edit protection (W01/EC-11,EC-12): loadOrderForSettlement now returns a
    // structured CartSwitchResult ({ok: true} | {ok: false, reason}), not a bare boolean, so a
    // blocked/preserved-work outcome always carries a human-readable reason instead of a silent
    // false. Object truthiness is not success: check `.ok` explicitly.
    expect(pos.loadOrderForSettlement(order.id)).toMatchObject({ ok: true });
    expect(usePosStore.getState().runningOrderId).toBe(order.id);
    expect(usePosStore.getState().cart.totalPayable).toBe(250);
    expect(usePosStore.getState().completePayment('CASH',250,'counter-existing',[{method:'CASH',amount:250}])?.id).toBe(order.id);
    expect(db.orders).toHaveLength(1);
    expect(OrderRepository.getOrderById(order.id)?.paymentStatus).toBe('SUCCESS');
    const reloadResult = usePosStore.getState().loadOrderForSettlement(order.id);
    expect(reloadResult.ok).toBe(false);
    expect((reloadResult as { ok: false; reason: string }).reason).toBeTruthy();
  });
  it('legacy core health does not invent devices or use another restaurant identity', () => {
    db.devices=[];
    expect(JamanvaarLocalCore.getRegisteredDevices()).toEqual([]);
    const health=JamanvaarLocalCore.getHealth();
    expect(health.connected_devices_count).toBe(0);
    expect(health.restaurant_id).toBe(db.restaurant.id);
    expect(health.outlet_id).toBe(db.outlet.id);
    expect(health.core_status).toBe('UNAVAILABLE');
  });
});
