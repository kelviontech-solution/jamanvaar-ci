import { describe, it, expect, beforeEach } from 'vitest';
import { db, OrderRepository, isUnpaidOpenOrder } from '@jamanvaar/database';

/**
 * An abandoned unpaid bill can be voided from Restaurant Admin. A paid bill cannot be voided (it must be refunded).
 */
describe('voiding an unpaid bill from admin', () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
  });

  const bill = (id: string, paymentStatus: string) => ({
    id, orderNumber: `MAIN-${id}`, tokenNumber: 'K-1', restaurantId: db.restaurant.id, outletId: 'o', kioskId: 'KIOSK-1',
    sessionId: `s-${id}`, idempotencyKey: `i-${id}`, orderType: 'DINE_IN', items: [], subtotal: 300, discountAmount: 0,
    cgstAmount: 0, sgstAmount: 0, taxAmount: 0, serviceChargeAmount: 0, tipAmount: 0, roundOffAmount: 0, totalAmount: 300,
    paymentStatus, orderStatus: 'CONFIRMED', estimatedWaitMinutes: 15, createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(), isSynced: true
  } as never);

  it('an unpaid open bill is voided and no longer counts as open', () => {
    db.orders.push(bill('open-1', 'PENDING'));
    expect(isUnpaidOpenOrder(db.orders.find((o) => o.id === 'open-1')! as never)).toBe(true);
    const voided = OrderRepository.voidOrder('open-1', 'Abandoned by guest', 'Restaurant Admin');
    expect(voided?.orderStatus).toBe('CANCELLED');
    expect(isUnpaidOpenOrder(db.orders.find((o) => o.id === 'open-1')! as never)).toBe(false);
  });

  it('a paid bill cannot be voided; it must be refunded', () => {
    db.orders.push(bill('paid-1', 'SUCCESS'));
    expect(() => OrderRepository.voidOrder('paid-1', 'nope', 'Restaurant Admin')).toThrow(/already been paid/);
  });
});
