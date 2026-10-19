import { describe, it, expect, beforeEach } from 'vitest';
import { db, OrderRepository, CustomerRepository, LoyaltyTierSync, LoyaltyRewardSync, LoyaltyProgramSettingsSync } from '@jamanvaar/database';

const makeOrder = (customerPhone?: string) =>
  OrderRepository.createOrder({
    orderType: 'TAKEAWAY',
    items: [],
    subtotal: 500,
    taxAmount: 25,
    totalAmount: 525,
    paymentMethod: 'CASH',
    paymentStatus: 'PENDING',
    orderStatus: 'PREPARING',
    source_type: 'POS',
    customerPhone
  });

describe('a settled order earns its attached customer real loyalty points, exactly once', () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
  });

  it('settling an order with a customer attached credits their account and records how much', () => {
    const phone = '9000000001';
    CustomerRepository.getOrCreateAccount(phone, 'Priya');
    const before = CustomerRepository.getByPhone(phone)!.loyaltyPoints;
    const order = makeOrder(phone);

    const settled = OrderRepository.settleOrder(order.id, 'CASH', 525, undefined, 'Cashier');

    expect(settled?.loyaltyPointsEarned).toBeGreaterThan(0);
    expect(CustomerRepository.getByPhone(phone)!.loyaltyPoints).toBe(before + settled!.loyaltyPointsEarned!);
  });

  it('an order with no customer attached earns nothing for anyone', () => {
    const order = makeOrder();
    const settled = OrderRepository.settleOrder(order.id, 'CASH', 525, undefined, 'Cashier');
    expect(settled?.loyaltyPointsEarned).toBeUndefined();
  });

  it('re-settling the same order (e.g. a retried sync) never credits the customer twice', () => {
    const phone = '9000000002';
    CustomerRepository.getOrCreateAccount(phone, 'Raj');
    const order = makeOrder(phone);
    const txnId = 'TXN-FIXED-1';

    const first = OrderRepository.settleOrder(order.id, 'CASH', 525, txnId, 'Cashier');
    const pointsAfterFirst = CustomerRepository.getByPhone(phone)!.loyaltyPoints;
    const second = OrderRepository.settleOrder(order.id, 'CASH', 525, txnId, 'Cashier');

    expect(second?.loyaltyPointsEarned).toBe(first?.loyaltyPointsEarned);
    expect(CustomerRepository.getByPhone(phone)!.loyaltyPoints).toBe(pointsAfterFirst);
  });
});

/**
 * security-audit HIGH kiosk-loyalty-02: a kiosk cash order used to earn AND redeem loyalty
 * points the moment the guest tapped "Get Token" -- before any cash had actually changed hands
 * at the counter. A guest could place a large order, take the token, and walk away with real,
 * spendable points for a purchase that was never paid for (and nothing reversed them if staff
 * later cancelled the unpaid order). Redemption is now only a request stamped on the order
 * (loyaltyPointsRedeemed) and deducted here, at the same real, payment-confirmed moment the
 * earn above already waits for.
 */
describe('security-audit HIGH kiosk-loyalty-02: a requested redemption is only deducted once the order is actually settled', () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
  });

  it('deducts the requested redemption only when the order is settled, not before', () => {
    const phone = '9000000011';
    CustomerRepository.getOrCreateAccount(phone, 'Priya');
    CustomerRepository.earnPointsForOrder(phone, 10000); // give them a real balance to redeem from
    const before = CustomerRepository.getByPhone(phone)!.loyaltyPoints;
    expect(before).toBeGreaterThan(100);

    const order = OrderRepository.createOrder({
      orderType: 'TAKEAWAY', items: [], subtotal: 500, taxAmount: 25, totalAmount: 425,
      paymentMethod: 'CASH', paymentStatus: 'PENDING', orderStatus: 'CONFIRMED', source_type: 'KIOSK',
      customerPhone: phone, loyaltyPointsRedeemed: 100
    });

    // Not deducted yet: the order is confirmed (a token was issued) but nobody has paid.
    expect(CustomerRepository.getByPhone(phone)!.loyaltyPoints).toBe(before);

    const settled = OrderRepository.settleOrder(order.id, 'CASH', 425, undefined, 'Cashier');
    expect(settled).not.toBeNull();
    // Settling also earns new points for this order's own total (the existing, already-correct
    // behaviour) -- the redemption is the ONE additional thing this fix adds: a -100 on top of that.
    expect(CustomerRepository.getByPhone(phone)!.loyaltyPoints).toBe(before + settled!.loyaltyPointsEarned! - 100);
    expect(CustomerRepository.getByPhone(phone)!.loyaltyLedger?.[`redeem:${order.id}`]?.points).toBe(-100);
  });

  it('cannot use points earned by the same bill to fund an unaffordable legacy redemption', () => {
    const phone = '9000000014';
    CustomerRepository.createCustomer({ phone, name: 'Low balance', loyaltyPoints: 10 });
    const order = OrderRepository.createOrder({ orderType: 'TAKEAWAY', items: [], subtotal: 10000, totalAmount: 9900, paymentMethod: 'CASH', paymentStatus: 'PENDING', orderStatus: 'CONFIRMED', source_type: 'KIOSK', customerPhone: phone, loyaltyPointsRedeemed: 100 });
    expect(() => OrderRepository.settleOrder(order.id, 'CASH', 9900, 'insufficient-points')).toThrow('Not enough loyalty points');
    expect(CustomerRepository.getByPhone(phone)!.loyaltyPoints).toBe(10);
    expect(CustomerRepository.getByPhone(phone)!.totalVisits ?? 0).toBe(0);
    expect(OrderRepository.getOrderById(order.id)?.paymentStatus).toBe('PENDING');
  });

  it('re-settling the same order never deducts the redemption twice', () => {
    const phone = '9000000012';
    CustomerRepository.getOrCreateAccount(phone, 'Raj');
    CustomerRepository.earnPointsForOrder(phone, 10000);
    const before = CustomerRepository.getByPhone(phone)!.loyaltyPoints;

    const order = OrderRepository.createOrder({
      orderType: 'TAKEAWAY', items: [], subtotal: 500, taxAmount: 25, totalAmount: 425,
      paymentMethod: 'CASH', paymentStatus: 'PENDING', orderStatus: 'CONFIRMED', source_type: 'KIOSK',
      customerPhone: phone, loyaltyPointsRedeemed: 100
    });
    const txnId = 'TXN-REDEEM-FIXED-1';

    const first = OrderRepository.settleOrder(order.id, 'CASH', 425, txnId, 'Cashier');
    const pointsAfterFirst = CustomerRepository.getByPhone(phone)!.loyaltyPoints;
    OrderRepository.settleOrder(order.id, 'CASH', 425, txnId, 'Cashier');

    expect(CustomerRepository.getByPhone(phone)!.loyaltyPoints).toBe(pointsAfterFirst);
    expect(pointsAfterFirst).toBe(before + first!.loyaltyPointsEarned! - 100);
  });

  it('an order that is never settled (e.g. cancelled unpaid) never deducts the requested redemption at all', () => {
    const phone = '9000000013';
    CustomerRepository.getOrCreateAccount(phone, 'Meena');
    CustomerRepository.earnPointsForOrder(phone, 10000);
    const before = CustomerRepository.getByPhone(phone)!.loyaltyPoints;

    OrderRepository.createOrder({
      orderType: 'TAKEAWAY', items: [], subtotal: 500, taxAmount: 25, totalAmount: 425,
      paymentMethod: 'CASH', paymentStatus: 'PENDING', orderStatus: 'CONFIRMED', source_type: 'KIOSK',
      customerPhone: phone, loyaltyPointsRedeemed: 100
    });

    expect(CustomerRepository.getByPhone(phone)!.loyaltyPoints).toBe(before);
  });
});

describe("the base earn rate is the admin's own setting, not a fixed number", () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
  });

  it('defaults to 1 point per ₹10 spent — the rate that used to be hardcoded, so an existing restaurant is unaffected until it actually changes something', () => {
    expect(CustomerRepository.getProgramSettings()).toMatchObject({ earnPoints: 1, perRupeesSpent: 10 });
  });

  it('changing the rate changes what a real purchase actually earns', () => {
    CustomerRepository.updateProgramSettings({ earnPoints: 2, perRupeesSpent: 5 }); // 4x the default rate
    const phone = '9000000003';
    CustomerRepository.getOrCreateAccount(phone, 'Meera');
    const before = CustomerRepository.getByPhone(phone)!.loyaltyPoints;
    const order = makeOrder(phone);

    const settled = OrderRepository.settleOrder(order.id, 'CASH', 525, undefined, 'Cashier');

    // ₹525 / ₹5 = 105 lots, × 2 points each = 210 (a fresh account's first order stays in the entry
    // tier — ₹525 is well under every seeded tier's spend threshold, so the multiplier is ×1 here).
    expect(settled?.loyaltyPointsEarned).toBe(210);
    expect(CustomerRepository.getByPhone(phone)!.loyaltyPoints).toBe(before + 210);
  });

  it('a rate set in Restaurant Admin applies on a device that only ever pulls it', () => {
    CustomerRepository.updateProgramSettings({ earnPoints: 3, perRupeesSpent: 20 });
    const record = LoyaltyProgramSettingsSync.collectSyncRecords().find((r) => r.externalId === 'default')!;
    expect(record.payload).toMatchObject({ earnPoints: 3, perRupeesSpent: 20 });

    // Simulates POS: still on the old default, only ever receives the admin's change.
    db.loyaltyProgramSettings = [{ id: 'default', earnPoints: 1, perRupeesSpent: 10 }];
    LoyaltyProgramSettingsSync.applyRemote(record.payload);
    expect(CustomerRepository.getProgramSettings()).toMatchObject({ earnPoints: 3, perRupeesSpent: 20 });
  });
});

describe("the admin's loyalty program configuration reaches the counter, not just Restaurant Admin's own screen", () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
  });

  it('a tier created in Restaurant Admin applies on a device (POS) that only ever pulls it', () => {
    db.loyaltyTiers.push({ id: 'tier-vip-test', name: 'VIP', minLifetimeSpend: 0, pointsMultiplier: 2, perks: ['Priority seating'], colorHex: '#B5651D' });
    // Every tier on this device is a pending record, seeded ones included — find the one just added.
    const record = LoyaltyTierSync.collectSyncRecords().find((r) => r.externalId === 'tier-vip-test')!;
    expect(record.payload).toMatchObject({ name: 'VIP', pointsMultiplier: 2 });

    // Simulates POS: a device that never created this tier itself, only ever receives it.
    db.loyaltyTiers = [];
    LoyaltyTierSync.applyRemote(record.payload);
    expect(db.loyaltyTiers.find((t) => t.id === 'tier-vip-test')?.pointsMultiplier).toBe(2);
  });

  it('a reward added to the catalog in Restaurant Admin is redeemable on a device that only ever pulls it', () => {
    db.loyaltyRewards.push({ id: 'reward-free-drink-test', name: 'Free Drink', description: '', pointsCost: 50, isActive: true });
    const record = LoyaltyRewardSync.collectSyncRecords().find((r) => r.externalId === 'reward-free-drink-test')!;

    db.loyaltyRewards = [];
    LoyaltyRewardSync.applyRemote(record.payload);
    expect(db.loyaltyRewards.find((r) => r.id === 'reward-free-drink-test')?.pointsCost).toBe(50);
  });
});
