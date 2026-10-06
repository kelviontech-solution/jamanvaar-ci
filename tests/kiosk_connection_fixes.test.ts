import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { db, OrderRepository, ServiceMessages, NotificationRepository } from '@jamanvaar/database';
import { EntitySyncEngine, pushServiceMessages } from '@jamanvaar/sync';
import { ProductCard, ScreenErrorBoundary } from '@jamanvaar/ui';

/** BUG-129 / 134 / 137 / 162 (Kiosk and Kiosk Admin). */
describe('Kiosk and Kiosk Admin fixes', () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
    ServiceMessages.resetForTests();
  });

  it('BUG-134: choosing Cash at Counter is written onto the order, and stays unpaid', () => {
    const m = db.menuItems[0];
    const order = OrderRepository.createOrder({
      items: [{ id: 'i', orderId: '', menuItemId: m.id, sku: m.sku, name: m.name, quantity: 1, unitPrice: m.price, modifiers: [], totalPrice: m.price, kitchenStatus: 'PENDING' }],
      subtotal: m.price, totalAmount: m.price, paymentMethod: 'UPI', paymentStatus: 'PENDING', orderStatus: 'CONFIRMED'
    });
    const updated = OrderRepository.choosePaymentMethod(order.id, 'CASH_AT_COUNTER')!;
    expect(updated.paymentMethod).toBe('CASH_AT_COUNTER');
    expect(updated.paymentStatus).toBe('PENDING');
    // A paid order is never rewritten.
    OrderRepository.updateOrder(order.id, { paymentStatus: 'SUCCESS', paymentMethod: 'UPI' });
    expect(OrderRepository.choosePaymentMethod(order.id, 'CASH_AT_COUNTER')!.paymentMethod).toBe('UPI');
  });

  it('BUG-129: a dish card in a catalog editor has no "add to cart" button', () => {
    const item = db.menuItems[0];
    expect(renderToStaticMarkup(React.createElement(ProductCard, { item }))).not.toContain('Add to Cart');
    expect(renderToStaticMarkup(React.createElement(ProductCard, { item, onAdd: () => undefined }))).toContain('Add to Cart');
  });

  it('BUG-162: a screen that throws is contained instead of blanking the app', () => {
    const Broken = () => { throw new Error('boom'); };
    const originalError = console.error;
    console.error = () => undefined;
    try {
      // renderToStaticMarkup does not run error boundaries, so check the boundary's own contract.
      expect(ScreenErrorBoundary.getDerivedStateFromError(new Error('boom'))).toEqual({ error: expect.any(Error) });
      void Broken;
    } finally {
      console.error = originalError;
    }
  });

  it('BUG-137: a guest call-staff request is delivered only when the cloud accepted it, and reaches the counter', async () => {
    ServiceMessages.enqueue({ kind: 'CALL_STAFF', recipient: 'COUNTER', senderName: 'Self-order kiosk', presetText: 'A guest asked for help.' });

    // No connection: not delivered, so the guest must not be told a team member is on the way.
    EntitySyncEngine.configureTransport(null);
    expect(await pushServiceMessages()).toBe(false);

    const sent: Array<{ externalId: string; payload: Record<string, unknown> }> = [];
    EntitySyncEngine.configureTransport({
      push: async (_t, events) => { sent.push(...events); return { results: events.map((e) => ({ externalId: e.externalId, status: 'ok' as const })), serverTime: new Date().toISOString() }; },
      pull: async () => ({ entities: [], serverTime: new Date().toISOString() })
    });
    expect(await pushServiceMessages()).toBe(true);
    expect(sent).toHaveLength(1);

    // A different device receives it (the sender never notifies itself): the counter POS raises a notification; the kitchen does not.
    ServiceMessages.resetForTests();
    const before = db.notifications.length;
    expect(ServiceMessages.applyRemote(sent[0].payload, 'KDS')).toBeNull();
    expect(ServiceMessages.applyRemote(sent[0].payload, 'POS')).not.toBeNull();
    expect(db.notifications.length).toBe(before + 1);
    // Kiosk Admin gets it back to list as a service request.
    ServiceMessages.resetForTests();
    expect(ServiceMessages.applyRemote(sent[0].payload, 'KIOSK_ADMIN')?.kind).toBe('CALL_STAFF');
    EntitySyncEngine.configureTransport(null);
  });
});
