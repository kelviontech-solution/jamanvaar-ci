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
    db.loyaltyTiers.push({ id: 'tier-vip-test', name: 'VIP', minLifetimeSpend: 0, pointsMultiplier: 2, perks: ['Priority seating'] });
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
