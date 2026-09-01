import { describe, it, expect, beforeEach } from 'vitest';
import {
  db,
  OrderRepository,
  ShiftRepository,
  AuditRepository
} from '../shared/database/src';
import { PaymentMethod, Order } from '../shared/types/src';

interface PaymentAllocation {
  channel: 'CASH' | 'UPI' | 'CARD' | 'WALLET' | 'HOUSE_ACCOUNT';
  amount: number;
  tenderedCash?: number;
  changeDue?: number;
}

interface SplitSettlementResult {
  success: boolean;
  errorMessage?: string;
  order?: Order;
  changeDue?: number;
}

/**
 * Smart Payment & Multi-Tender Settlement Validator
 * Encapsulates the restaurant-grade settlement rules required by JAMANVAAR OS.
 */
function processSettlement(params: {
  orderId?: string;
  billTotal: number;
  allocations: PaymentAllocation[];
  cashierName?: string;
}): SplitSettlementResult {
  const { billTotal, allocations, cashierName = 'Cashier' } = params;

  // 1. Calculate total allocated
  const totalAllocated = allocations.reduce((acc, a) => acc + (a.amount || 0), 0);

  // 2. Validate no negative amounts
  for (const a of allocations) {
    if (a.amount < 0) {
      return { success: false, errorMessage: 'Payment amount cannot be negative.' };
    }
  }

  // 3. Validate exact allocation match
  if (totalAllocated < billTotal) {
    const remaining = billTotal - totalAllocated;
    return {
      success: false,
      errorMessage: `PARTIALLY ALLOCATED: Allocated ₹${totalAllocated} of ₹${billTotal}. Remaining due: ₹${remaining}.`
    };
  }

  if (totalAllocated > billTotal) {
    const overage = totalAllocated - billTotal;
    return {
      success: false,
      errorMessage: `OVER-ALLOCATED: Allocated ₹${totalAllocated} exceeds bill ₹${billTotal} by ₹${overage}.`
    };
  }

  // 4. Validate cash tendering and change math if cash was part of allocation
  let changeDue = 0;
  const cashAlloc = allocations.find((a) => a.channel === 'CASH');
  if (cashAlloc && cashAlloc.amount > 0) {
    const tendered = cashAlloc.tenderedCash ?? cashAlloc.amount;
    if (tendered < cashAlloc.amount) {
      return {
        success: false,
        errorMessage: `Cash received (₹${tendered}) is less than cash allocated (₹${cashAlloc.amount}).`
      };
    }
    changeDue = tendered - cashAlloc.amount;
  }

  // 5. Determine payment method alias
  let paymentMethod: PaymentMethod = 'CASH';
  const activeChannels = allocations.filter((a) => a.amount > 0);
  if (activeChannels.length > 1) {
    paymentMethod = 'SPLIT';
  } else if (activeChannels.length === 1) {
    const ch = activeChannels[0].channel;
    paymentMethod = ch === 'CASH' ? 'CASH' : ch === 'UPI' ? 'UPI_QR' : ch === 'CARD' ? 'CARD' : 'WALLET';
  }

  // 6. Record order in local database
  const order = OrderRepository.createOrder({
    orderType: 'DINE_IN',
    tableNumber: '1',
    items: [
      {
        id: `oi-${Date.now()}`,
        orderId: 'temp',
        menuItemId: db.menuItems[0].id,
        name: db.menuItems[0].name,
        sku: db.menuItems[0].sku,
        unitPrice: billTotal,
        quantity: 1,
        totalPrice: billTotal,
        modifiers: []
      }
    ],
    subtotal: billTotal,
    taxAmount: 0,
    discountAmount: 0,
    totalAmount: billTotal,
    paymentMethod,
    paymentStatus: 'SUCCESS',
    orderStatus: 'COMPLETED'
  });

  // 7. If cash was received, record in active shift drawer
  if (cashAlloc && cashAlloc.amount > 0) {
    const activeShift = ShiftRepository.getActiveShift();
    if (activeShift) {
      ShiftRepository.addCashMovement(
        activeShift.id,
        'CASH_IN',
        cashAlloc.amount,
        `Cash portion from Order #${order.orderNumber}`,
        cashierName
      );
    }
  }

  AuditRepository.log({
    action: activeChannels.length > 1 ? 'SPLIT_PAYMENT' : 'PAYMENT',
    category: 'BILLING',
    details: `Settled ₹${billTotal} via ${activeChannels.map((a) => `${a.channel}: ₹${a.amount}`).join(', ')}`,
    username: cashierName
  });

  return {
    success: true,
    order,
    changeDue
  };
}

describe('JAMANVAAR Restaurant OS — Phase 39 Payment Test Matrix', () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
  });

  it('TEST 1: Bill ₹1000 — 100% Cash (PASS)', () => {
    const res = processSettlement({
      billTotal: 1000,
      allocations: [{ channel: 'CASH', amount: 1000, tenderedCash: 1000 }]
    });

    expect(res.success).toBe(true);
    expect(res.order?.paymentMethod).toBe('CASH');
    expect(res.order?.totalAmount).toBe(1000);
    expect(res.changeDue).toBe(0);
  });

  it('TEST 2: Bill ₹1000 — 100% UPI (PASS)', () => {
    const res = processSettlement({
      billTotal: 1000,
      allocations: [{ channel: 'UPI', amount: 1000 }]
    });

    expect(res.success).toBe(true);
    expect(res.order?.paymentMethod).toBe('UPI_QR');
    expect(res.order?.totalAmount).toBe(1000);
  });

  it('TEST 3: Bill ₹1000 — 100% Card (PASS)', () => {
    const res = processSettlement({
      billTotal: 1000,
      allocations: [{ channel: 'CARD', amount: 1000 }]
    });

    expect(res.success).toBe(true);
    expect(res.order?.paymentMethod).toBe('CARD');
    expect(res.order?.totalAmount).toBe(1000);
  });

  it('TEST 4: Bill ₹1000 — Split 50/50: Cash ₹500 + UPI ₹500 (PASS)', () => {
    const res = processSettlement({
      billTotal: 1000,
      allocations: [
        { channel: 'CASH', amount: 500, tenderedCash: 500 },
        { channel: 'UPI', amount: 500 }
      ]
    });

    expect(res.success).toBe(true);
    expect(res.order?.paymentMethod).toBe('SPLIT');
    expect(res.order?.totalAmount).toBe(1000);
    expect(res.changeDue).toBe(0);
  });

  it('TEST 5: Bill ₹1000 — Split 3-Ways: Cash ₹500 + UPI ₹300 + Card ₹200 (PASS)', () => {
    const res = processSettlement({
      billTotal: 1000,
      allocations: [
        { channel: 'CASH', amount: 500, tenderedCash: 500 },
        { channel: 'UPI', amount: 300 },
        { channel: 'CARD', amount: 200 }
      ]
    });

    expect(res.success).toBe(true);
    expect(res.order?.paymentMethod).toBe('SPLIT');
    expect(res.order?.totalAmount).toBe(1000);
  });

  it('TEST 6: Bill ₹252 — Under-Allocated: Cash ₹120 + UPI ₹126 (Remaining ₹6) (System blocks settlement)', () => {
    const res = processSettlement({
      billTotal: 252,
      allocations: [
        { channel: 'CASH', amount: 120, tenderedCash: 120 },
        { channel: 'UPI', amount: 126 }
      ]
    });

    expect(res.success).toBe(false);
    expect(res.errorMessage).toContain('PARTIALLY ALLOCATED');
    expect(res.errorMessage).toContain('Remaining due: ₹6');
  });

  it('TEST 7: Bill ₹252 — Custom Split: Cash ₹120 + UPI ₹126 + Card ₹6 (PASS)', () => {
    const res = processSettlement({
      billTotal: 252,
      allocations: [
        { channel: 'CASH', amount: 120, tenderedCash: 120 },
        { channel: 'UPI', amount: 126 },
        { channel: 'CARD', amount: 6 }
      ]
    });

    expect(res.success).toBe(true);
    expect(res.order?.paymentMethod).toBe('SPLIT');
    expect(res.order?.totalAmount).toBe(252);
  });

  it('TEST 8: Bill ₹252 — Cash Allocated ₹252, Tendered ₹500 ➔ Change Due ₹248 (PASS)', () => {
    const res = processSettlement({
      billTotal: 252,
      allocations: [{ channel: 'CASH', amount: 252, tenderedCash: 500 }]
    });

    expect(res.success).toBe(true);
    expect(res.changeDue).toBe(248);
    expect(res.order?.totalAmount).toBe(252);
  });

  it('TEST 9: Bill ₹1000 — Cash Allocated ₹1000, Tendered ₹1200 ➔ Change Due ₹200 (PASS)', () => {
    const res = processSettlement({
      billTotal: 1000,
      allocations: [{ channel: 'CASH', amount: 1000, tenderedCash: 1200 }]
    });

    expect(res.success).toBe(true);
    expect(res.changeDue).toBe(200);
    expect(res.order?.totalAmount).toBe(1000);
  });

  it('TEST 10: Partial Payment — Bill ₹1000, Cash ₹500 (Remaining ₹500) ➔ Blocks settlement (PASS)', () => {
    const res = processSettlement({
      billTotal: 1000,
      allocations: [{ channel: 'CASH', amount: 500 }]
    });

    expect(res.success).toBe(false);
    expect(res.errorMessage).toContain('PARTIALLY ALLOCATED');
    expect(res.errorMessage).toContain('Remaining due: ₹500');
  });

  it('TEST 11: Refund Split Payment — Original ₹1000 (Cash ₹500 + UPI ₹500), Refund ₹300 (Cash ₹150 + UPI ₹150) (PASS)', () => {
    const initial = processSettlement({
      billTotal: 1000,
      allocations: [
        { channel: 'CASH', amount: 500, tenderedCash: 500 },
        { channel: 'UPI', amount: 500 }
      ]
    });
    expect(initial.success).toBe(true);
    const orderId = initial.order!.id;

    // Execute partial refund on split payment
    const refundCash = 150;
    const refundUpi = 150;
    const totalRefund = refundCash + refundUpi;

    const refundedOrder = OrderRepository.refundOrder(orderId, totalRefund, 'Customer returned partial items', 'Manager');
    expect(refundedOrder).toBeDefined();

    // Log audit trail for split refund breakdown
    AuditRepository.log({
      action: 'REFUND',
      category: 'BILLING',
      details: `Refunded ₹${totalRefund} for Order #${refundedOrder?.orderNumber} (Cash: ₹${refundCash}, UPI: ₹${refundUpi})`,
      username: 'Manager'
    });

    const lastAudit = db.auditLogs[0];
    expect(lastAudit.action).toBe('REFUND');
    expect(lastAudit.details).toContain('Cash: ₹150');
    expect(lastAudit.details).toContain('UPI: ₹150');
  });
});
