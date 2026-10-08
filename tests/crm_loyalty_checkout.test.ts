import { beforeEach, describe, expect, it } from 'vitest';
import { db, CustomerRepository, CustomerSync, OrderRepository } from '@jamanvaar/database';
import { mergeCustomerLoyalty } from '@jamanvaar/types';
import { mergeCustomerLoyalty as serverMerge } from '../cloud/api/src/modules/entity-sync/customer-loyalty-merge';
import { usePosStore } from '../apps/restaurant-system/pos/src/store/posStore';
import { PosRecoveryService } from '../apps/restaurant-system/pos/src/services/recoveryService';

const phone = '9888888888';
const pos = () => usePosStore.getState();
const customer = () => CustomerRepository.getByPhone(phone)!;
function startCart() {
  const item = { ...db.menuItems[0], id: 'loyalty-item', price: 500, isAvailable: true };
  db.menuItems.push(item);
  pos().addItemToCart(item);
  pos().setSelectedCustomer(customer());
}
beforeEach(() => {
  db.resetToDefaultSeed(); db.orders = []; db.customerAccounts = [];
  CustomerSync.reset();
  pos().clearCart(); pos().closeOverrideModal();
  usePosStore.setState({ currentUser: { id: 'cashier', fullName: 'Cashier', roleId: 'role-cashier' } as any, selectedCustomer: null, selectedTable: null, deliveryDetails: { name: '', phone: '', address: '' } });
  CustomerRepository.createCustomer({ phone, name: 'Daksh', loyaltyPoints: 200 });
  CustomerRepository.updateProgramSettings({ earnPoints: 1, perRupeesSpent: 10, enabled: true });
  CustomerRepository.updateReward('reward-100off', { discountAmount: 100, pointsCost: 150, isActive: true });
});

describe('configured loyalty rewards at the actual POS settlement boundary', () => {
  it('150 points buy ₹100 off; selecting, abandoning and removing do not spend points', () => {
    startCart(); pos().selectLoyaltyReward('reward-100off');
    expect(pos().cart.discountAmount).toBe(100); expect(customer().loyaltyPoints).toBe(200);
    pos().setIsPaymentOpen(false); expect(customer().loyaltyPoints).toBe(200);
    pos().removeDiscount(); expect(customer().loyaltyPoints).toBe(200); expect(pos().cart.loyaltyRedemption).toBeUndefined();
    expect(PosRecoveryService.loadDraft()?.cart.loyaltyRedemption).toBeUndefined();
    expect(PosRecoveryService.loadDraft()?.cart.discountAmount).toBe(0);
  });
  it('successful payment spends exactly 150 and earns on the discounted paid bill, once', () => {
    startCart(); pos().selectLoyaltyReward('reward-100off');
    const payable = pos().cart.totalPayable;
    const order = pos().completePayment('CASH', payable, 'loyalty-paid')!;
    expect(order.loyaltyPointsRedeemed).toBe(150); expect(order.discountAmount).toBe(100);
    expect(customer().loyaltyPoints).toBe(50 + Math.floor(payable / 10));
    OrderRepository.settleOrder(order.id, 'CASH', payable, 'loyalty-paid');
    expect(customer().totalVisits).toBe(1); expect(customer().loyaltyPoints).toBe(50 + order.loyaltyPointsEarned!);
    expect(pos().completePayment('CASH')).toBeNull();
  });
  it('keeping points earns normally and a repeat purchase increments points, spend, visits and history', () => {
    startCart(); const first = pos().completePayment('CASH')!;
    startCart(); const second = pos().completePayment('CARD')!;
    expect(customer().loyaltyPoints).toBe(200 + first.loyaltyPointsEarned! + second.loyaltyPointsEarned!);
    expect(customer().totalSpend).toBe(first.totalAmount + second.totalAmount); expect(customer().totalVisits).toBe(2);
    expect(customer().recentOrderIds).toContain(first.id); expect(customer().recentOrderIds).toContain(second.id);
  });
  it.each(['CASH', 'CARD', 'SPLIT'] as const)('redemption also works for %s payment', method => {
    startCart(); pos().selectLoyaltyReward('reward-100off'); const amount = pos().cart.totalPayable;
    const order = pos().completePayment(method, amount, undefined, method === 'SPLIT' ? [{ method: 'CASH', amount }] as any : undefined)!;
    expect(order.loyaltyPointsRedeemed).toBe(150); expect(customer().totalVisits).toBe(1);
  });
  it('changing or detaching the customer clears the reward without spending points', () => {
    startCart(); pos().selectLoyaltyReward('reward-100off'); pos().setSelectedCustomer(null);
    expect(pos().cart.discountAmount).toBe(0); expect(pos().cart.loyaltyRedemption).toBeUndefined(); expect(customer().loyaltyPoints).toBe(200);
  });
  it('replacing a reward with a manual discount keeps the points', () => {
    startCart(); pos().selectLoyaltyReward('reward-100off'); pos().applyDiscount({ scope: 'BILL', type: 'PERCENTAGE', value: 10, reason: 'Promotion' });
    const order = pos().completePayment('CASH')!; expect(order.loyaltyPointsRedeemed).toBeUndefined(); expect(customer().loyaltyPoints).toBe(200 + order.loyaltyPointsEarned!);
  });
  it('paused rewards, disabled program, insufficient points and invalid costs are refused', () => {
    startCart(); CustomerRepository.updateReward('reward-100off', { isActive: false });
    expect(() => pos().selectLoyaltyReward('reward-100off')).toThrow();
    CustomerRepository.updateReward('reward-100off', { isActive: true, pointsCost: -5 }); expect(() => pos().selectLoyaltyReward('reward-100off')).toThrow();
    CustomerRepository.updateReward('reward-100off', { pointsCost: 250 }); expect(() => pos().selectLoyaltyReward('reward-100off')).toThrow();
    CustomerRepository.updateReward('reward-100off', { pointsCost: 150 }); CustomerRepository.updateProgramSettings({ earnPoints: 1, perRupeesSpent: 10, enabled: false });
    expect(() => pos().selectLoyaltyReward('reward-100off')).toThrow(); const order = pos().completePayment('CASH')!; expect(order.loyaltyPointsEarned).toBe(0); expect(customer().loyaltyPoints).toBe(200);
  });
  it('checks balance again before accepting payment if another purchase spent the points', () => {
    startCart(); pos().selectLoyaltyReward('reward-100off'); CustomerRepository.redeemPoints(phone, 100);
    expect(() => pos().completePayment('CASH')).toThrow('Not enough'); expect(db.orders).toHaveLength(0); expect(customer().loyaltyPoints).toBe(100);
  });
  it('a reward paused after selection cannot be used at payment', () => {
    startCart(); pos().selectLoyaltyReward('reward-100off'); CustomerRepository.updateReward('reward-100off', { isActive: false });
    expect(() => pos().completePayment('CASH')).toThrow('changed'); expect(customer().loyaltyPoints).toBe(200);
  });
  it('unpaid KOT does not earn/spend; attachment after KOT is retained at settlement', () => {
    startCart(); pos().setSelectedCustomer(null); const kots = pos().sendKOT()!; expect(kots.length).toBeGreaterThan(0);
    expect(customer().loyaltyPoints).toBe(200); pos().setSelectedCustomer(customer()); pos().selectLoyaltyReward('reward-100off');
    const order = pos().completePayment('CASH')!; expect(order.customerPhone).toBe(phone); expect(order.loyaltyPointsRedeemed).toBe(150); expect(db.orders).toHaveLength(1);
  });
  it('quantity changes retain the selected reward; clearing the cart never spends points', () => {
    startCart(); pos().selectLoyaltyReward('reward-100off'); pos().updateItemQuantity(pos().cart.items[0].cartItemId, 2);
    expect(pos().cart.loyaltyRedemption?.pointsCost).toBe(150); pos().clearCart(); expect(customer().loyaltyPoints).toBe(200);
  });
  it('held orders retain their customer and reward through recall and payment', () => {
    startCart(); pos().selectLoyaltyReward('reward-100off'); expect(pos().holdCurrentOrder('Daksh reward')).toBe(true);
    pos().setSelectedCustomer(null); pos().recallHeldOrder(db.heldOrders[0].id);
    expect(pos().selectedCustomer?.phone).toBe(phone); expect(pos().cart.loyaltyRedemption?.pointsCost).toBe(150);
    const order = pos().completePayment('CASH')!; expect(order.loyaltyPointsRedeemed).toBe(150);
  });
  it('instant bill settles a selected reward once', async () => {
    startCart(); pos().selectLoyaltyReward('reward-100off');
    const order = await pos().executeInstantBill('CASH'); expect(order?.loyaltyPointsRedeemed).toBe(150);
    expect(customer().loyaltyPoints).toBe(50 + order!.loyaltyPointsEarned!);
  });
  it('a full refund reverses earnings and restores the reward cost once', () => {
    startCart(); pos().selectLoyaltyReward('reward-100off'); const order = pos().completePayment('CASH')!;
    OrderRepository.refundOrder(order.id, order.totalAmount, 'Returned', 'Manager'); expect(customer().loyaltyPoints).toBe(200); expect(customer().totalSpend).toBe(0); expect(customer().totalVisits).toBe(0);
    expect(() => OrderRepository.refundOrder(order.id, order.totalAmount, 'Retry', 'Manager')).toThrow(); expect(customer().loyaltyPoints).toBe(200);
    expect(() => OrderRepository.settleOrder(order.id, 'CASH')).toThrow('cannot be settled');
  });
  it('a fully covered reward settles a zero-payable bill without collecting money or earning points', () => {
    startCart(); CustomerRepository.updateReward('reward-100off', { discountAmount: 500 }); pos().selectLoyaltyReward('reward-100off');
    expect(pos().cart.totalPayable).toBe(0); const order = pos().completePayment('CASH', 0)!;
    expect(order.paymentStatus).toBe('SUCCESS'); expect(order.loyaltyPointsEarned).toBe(0); expect(customer().loyaltyPoints).toBe(50);
  });
  it('partial refunds reverse proportional earnings, preserving the consumed reward', () => {
    startCart(); pos().selectLoyaltyReward('reward-100off'); const order = pos().completePayment('CASH')!;
    const prior = customer().loyaltyPoints; OrderRepository.refundOrder(order.id, order.totalAmount / 2, 'Partial', 'Manager'); expect(customer().loyaltyPoints).toBe(prior - Math.floor(order.loyaltyPointsEarned! / 2));
  });
  it('paid-at-creation orders earn once, including payment retry', () => {
    const order = OrderRepository.createOrder({ customerPhone: phone, items: [], subtotal: 500, totalAmount: 500, paymentMethod: 'CASH', paymentStatus: 'SUCCESS', paymentTransactionId: 'paid-create' });
    expect(customer().loyaltyPoints).toBe(250); OrderRepository.settleOrder(order.id, 'CASH', 500, 'paid-create'); expect(customer().loyaltyPoints).toBe(250);
  });
  it('free-item rewards cover one eligible item, cap the value and do not discount other categories', () => {
    startCart(); const reward = CustomerRepository.createReward({ name: 'Free dessert', description: '', pointsCost: 100, isActive: true, discountKind: 'ITEM', discountAmount: 200, categoryId: 'not-on-bill' });
    expect(() => pos().selectLoyaltyReward(reward.id)).toThrow('eligible'); CustomerRepository.updateReward(reward.id, { categoryId: pos().cart.items[0].item.categoryId });
    pos().selectLoyaltyReward(reward.id); expect(pos().cart.discountAmount).toBe(200);
  });
});

describe('CRM point integrity and cross-device delivery', () => {
  it('zero points stays zero; normalized phone adjustments share the same account', () => {
    CustomerRepository.createCustomer({ phone: '9777777777', name: 'Zero', loyaltyPoints: 0 }); expect(CustomerRepository.getByPhone('9777777777')!.loyaltyPoints).toBe(0);
    CustomerRepository.addPoints('+91 98888 88888', 50); expect(customer().loyaltyPoints).toBe(250); expect(CustomerRepository.redeemPoints(phone, -100)).toBe(false); expect(CustomerRepository.redeemPoints(phone, NaN)).toBe(false);
  });
  it('two terminals buying concurrently preserve both purchases on the client and API', () => {
    const opening = structuredClone(customer()); CustomerRepository.earnPointsForOrder(phone, 500, 'terminal-a'); const a = structuredClone(customer());
    db.customerAccounts = [opening]; CustomerRepository.earnPointsForOrder(phone, 300, 'terminal-b'); const b = structuredClone(customer());
    const merged = mergeCustomerLoyalty(a, b); const cloud = serverMerge(a as any, b as any);
    expect(merged.loyaltyPoints).toBe(280); expect(merged.totalSpend).toBe(800); expect(merged.totalVisits).toBe(2); expect(cloud).toEqual(merged);
    expect(mergeCustomerLoyalty(merged, a).loyaltyPoints).toBe(280);
    CustomerSync.applyRemote(merged as any); expect(customer().loyaltyPoints).toBe(280);
    CustomerSync.applyRemote(a as any); expect(customer().loyaltyPoints).toBe(280); expect(CustomerSync.collectSyncRecords().length).toBeGreaterThan(0);
  });
  it('replaying an order credit after refresh is idempotent, independent of the order marker', () => {
    CustomerRepository.earnPointsForOrder(phone, 500, 'repeat'); const saved = JSON.parse(JSON.stringify(customer())); db.customerAccounts = [saved];
    CustomerRepository.earnPointsForOrder(phone, 500, 'repeat'); expect(customer().loyaltyPoints).toBe(250); expect(customer().totalVisits).toBe(1);
  });
});
