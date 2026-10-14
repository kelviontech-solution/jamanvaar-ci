// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { OrderActivityView, type CanonicalOrderActivity } from '../packages/ui/src/OrderActivityView';
import { inspectFrontendEntry } from '../cloud/super-admin-web/src/pages/SystemHealth/DeploymentHealthPanel';
import type { Order } from '@jamanvaar/types';

describe('Canonical activity and deployment diagnostics', () => {
  it('uses server collections instead of a stale locally paid mirror', async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const order = {
      id: 'same-order',
      createdAt: '2026-10-14T10:00:00Z',
      totalAmount: 250,
      paymentStatus: 'SUCCESS',
      orderStatus: 'READY',
      items: []
    } as unknown as Order;
    const history = {
      externalOrderId: order.id,
      source: 'KIOSK',
      branch: 'West',
      status: 'SERVED',
      paymentStatus: 'PENDING',
      version: 3,
      balance: { collectedPaise: 0, outstandingPaise: 25000, refundedPaise: 0 },
      events: [{ at: order.createdAt, label: 'Order created' }],
      generatedAt: order.createdAt
    } as CanonicalOrderActivity;
    try {
      await act(async () => root.render(<OrderActivityView order={order} loadActivity={async () => history} />));
      expect(container.textContent).toContain('West');
      expect(container.textContent).toMatch(/Balance due.*250/);
      expect(container.textContent).toContain('Order status: SERVED');
      expect(container.querySelectorAll('time')).toHaveLength(1);
      expect(container.textContent).not.toContain('Payment verified');
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });

  it('rejects a proxy fallback that returns HTML for a JavaScript bundle', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('<title>JAMANVAAR POS</title><script type="module" src="/pos/assets/app.js"></script>', { headers: { 'content-type': 'text/html' } })
      )
      .mockResolvedValueOnce(new Response('', { headers: { 'content-type': 'text/html' } }));
    await expect(inspectFrontendEntry('https://example.test/pos/', /POS/, request)).rejects.toThrow('wrong content type');
    expect(request.mock.calls[1][0]).toBe('https://example.test/pos/assets/app.js');
  });

  it('rejects another application entry and makes no bundle request', async () => {
    const request = vi.fn().mockResolvedValue(new Response('<title>Kiosk</title>', { headers: { 'content-type': 'text/html' } }));
    await expect(inspectFrontendEntry('https://example.test/pos/', /POS/, request)).rejects.toThrow('different application');
    expect(request).toHaveBeenCalledTimes(1);
  });
});
