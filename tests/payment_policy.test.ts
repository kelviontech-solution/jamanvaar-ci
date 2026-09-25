import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PaymentPolicy } from '../packages/database/src/payment_policy';
import { OrderRepository } from '../packages/database/src/repositories';
import { db } from '../packages/database/src/db';
import { EndpointResolver } from '../packages/sync/src/endpoint_resolver';
import { NetworkStatusService } from '../packages/api/src/services/network';

const makeOrder = (id: string) =>
  OrderRepository.createOrder({
    id, items: [{ id: `oi-${id}`, menuItemId: 'm', name: 'Tea', quantity: 1, unitPrice: 100, totalPrice: 100, modifiers: [], kitchenStatus: 'PENDING', kitchenStation: 'Main Kitchen' }] as never,
    subtotal: 100, totalAmount: 105, orderType: 'TAKEAWAY', idempotencyKey: `idem-${id}`
  } as never);

describe('payment rules that hold with the internet down', () => {
  beforeEach(() => { PaymentPolicy.reset(); db.orders.length = 0; });
  afterEach(() => PaymentPolicy.reset());

  it('cash is always available, online or not', () => {
    PaymentPolicy.setInternetVerifier(() => false);
    expect(PaymentPolicy.availability().CASH).toEqual({ available: true });
    PaymentPolicy.setInternetVerifier(() => true);
    expect(PaymentPolicy.availability().CASH).toEqual({ available: true });
  });

  it('gateway UPI is unavailable, with an honest reason, unless the internet has been verified', () => {
    PaymentPolicy.setInternetVerifier(() => false);
    const a = PaymentPolicy.availability();
    expect(a.UPI.available).toBe(false);
    expect(a.UPI.reason).toMatch(/verified internet/i);
    expect(a.UPI_QR.available).toBe(false);
    PaymentPolicy.setInternetVerifier(() => true);
    expect(PaymentPolicy.availability().UPI.available).toBe(true);
  });

  it('a card terminal that is physically present works offline; without one it is unavailable', () => {
    PaymentPolicy.setInternetVerifier(() => false);
    expect(PaymentPolicy.availability().CARD.available).toBe(false);
    PaymentPolicy.setCardTerminalPresent(true);
    expect(PaymentPolicy.availability().CARD.available).toBe(true);
  });

  it('a UPI bill cannot be marked PAID offline: the order stays unpaid and nothing is recorded', () => {
    PaymentPolicy.setInternetVerifier(() => false);
    const o = makeOrder('upi-offline');
    expect(() => OrderRepository.settleOrder(o.id, 'UPI', 105, 'UPI-REF-1', 'cashier')).toThrow(/UPI_REQUIRES_INTERNET/);
    expect(o.paymentStatus).not.toBe('SUCCESS');
    expect(o.paymentTransactionId).toBeUndefined();
  });

  it('cash settles offline, and the same for UPI once the internet is verified', () => {
    PaymentPolicy.setInternetVerifier(() => false);
    const cash = makeOrder('cash-offline');
    OrderRepository.settleOrder(cash.id, 'CASH_AT_COUNTER', 105, undefined, 'cashier');
    expect(cash.paymentStatus).toBe('SUCCESS');

    PaymentPolicy.setInternetVerifier(() => true);
    const upi = makeOrder('upi-online');
    OrderRepository.settleOrder(upi.id, 'UPI', 105, 'UPI-REF-2', 'cashier');
    expect(upi.paymentStatus).toBe('SUCCESS');
  });

  it('an order cannot be created already paid by UPI while offline, and one with no payment info is unpaid, never paid', () => {
    PaymentPolicy.setInternetVerifier(() => false);
    expect(() => OrderRepository.createOrder({ id: 'born-paid', items: [], subtotal: 0, totalAmount: 0, orderType: 'TAKEAWAY', paymentMethod: 'UPI', paymentStatus: 'SUCCESS', idempotencyKey: 'born-paid' } as never)).toThrow(/UPI_REQUIRES_INTERNET/);
    const plain = OrderRepository.createOrder({ id: 'no-payment-info', items: [], subtotal: 0, totalAmount: 0, orderType: 'TAKEAWAY', idempotencyKey: 'no-payment-info' } as never);
    expect(plain.paymentStatus).toBe('PENDING');
  });

  it('settling is idempotent: the same payment twice changes nothing, a different one is refused', () => {
    const o = makeOrder('idem-pay');
    OrderRepository.settleOrder(o.id, 'CASH_AT_COUNTER', 105, 'TXN-1', 'cashier');
    const paidAt = o.updatedAt;
    OrderRepository.settleOrder(o.id, 'CASH_AT_COUNTER', 105, 'TXN-1', 'cashier');
    expect(o.paymentTransactionId).toBe('TXN-1');
    expect(o.updatedAt).toBe(paidAt);
    expect(o.timeline!.filter((t) => t.status === 'PAID')).toHaveLength(1);
    expect(() => OrderRepository.settleOrder(o.id, 'CASH_AT_COUNTER', 105, 'TXN-2', 'cashier')).toThrow(/ORDER_ALREADY_PAID/);
    expect(o.paymentTransactionId).toBe('TXN-1');
  });
});

describe('the network indicator reflects verified reachability, not just "connected to Wi-Fi"', () => {
  afterEach(() => { EndpointResolver.reset(); PaymentPolicy.reset(); });

  it('the internet counts as verified only after a real request succeeded recently', async () => {
    EndpointResolver.reset();
    EndpointResolver.configure({ cloudBase: 'https://cloud.example' });
    expect(EndpointResolver.internetVerified()).toBe(false);
    await EndpointResolver.fetch('/api/v1/orders/sync', {}, (async () => new Response('{}', { status: 200 })) as never);
    expect(EndpointResolver.internetVerified()).toBe(true);
    await expect(EndpointResolver.fetch('/api/v1/orders/sync', {}, (async () => { throw new TypeError('fetch failed'); }) as never)).rejects.toThrow();
    expect(EndpointResolver.internetVerified()).toBe(false);
  });

  it('a device that reaches the branch core but not the cloud is shown as offline for internet features', async () => {
    EndpointResolver.reset();
    EndpointResolver.configure({ cloudBase: 'https://cloud.example', coreUrl: 'http://core.local:5178' });
    await EndpointResolver.fetch('/api/v1/orders/sync', {}, (async (u: string) => {
      if (u.startsWith('https://cloud')) throw new TypeError('fetch failed');
      return new Response('{}', { status: 200 });
    }) as never);
    expect(EndpointResolver.mode()).toBe('LOCAL');
    expect(NetworkStatusService.getNetworkState()).toBe('OFFLINE');
    expect(PaymentPolicy.availability().UPI.available).toBe(false);
  });

  it('when the cloud answers again the indicator returns to ONLINE and UPI comes back', async () => {
    EndpointResolver.reset();
    EndpointResolver.configure({ cloudBase: 'https://cloud.example', coreUrl: 'http://core.local:5178' });
    await EndpointResolver.fetch('/api/v1/payments/orders', {}, (async () => new Response('{}', { status: 200 })) as never);
    expect(EndpointResolver.mode()).toBe('ONLINE');
    expect(NetworkStatusService.getNetworkState()).toBe('ONLINE');
    expect(PaymentPolicy.availability().UPI.available).toBe(true);
  });
});
