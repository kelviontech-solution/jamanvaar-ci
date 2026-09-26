import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConnectionPanel, ConnectionBadge } from '@jamanvaar/ui';
import { EndpointResolver } from '@jamanvaar/sync';
import { db } from '@jamanvaar/database';

beforeEach(() => { EndpointResolver.reset(); EndpointResolver.configure({ cloudBase: 'https://cloud.example' }); db.orders.length = 0; });
afterEach(() => { EndpointResolver.reset(); db.orders.length = 0; });

describe('connection screens render for staff', () => {
  it('shows the offline state in plain words, with Sync now and the Branch Core box', async () => {
    await expect(EndpointResolver.fetch('/api/v1/orders/sync', {}, (async () => { throw new TypeError('x'); }) as never)).rejects.toThrow();
    db.orders.push({ id: 'w', syncStatus: 'SAVED_LOCALLY' } as never);
    const html = renderToStaticMarkup(React.createElement(ConnectionPanel, { appVersion: '9.9.9' }));
    expect(html).toContain('LOCAL OFFLINE');
    expect(html).toContain('Working locally');
    expect(html).toContain('Sync now');
    expect(html).toContain('Branch Core');
    expect(html).toContain('9.9.9');
    expect(html).toContain('UPI is unavailable');
  });

  it('the header badge shows the status and a Sync now button', () => {
    const html = renderToStaticMarkup(React.createElement(ConnectionBadge));
    expect(html).toMatch(/LOCAL OFFLINE|ONLINE|SYNC/);
    expect(html).toContain('Sync now');
  });
});
