import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DeviceGate } from '@jamanvaar/sync';
import { DeviceGateOverlay } from '@jamanvaar/ui';

/**
 * BUG-049 / BUG-068 / BUG-089: what the terminal actually shows when the platform
 * has stopped allowing it to run. The overlay must say why, and must render
 * nothing at all while the terminal is allowed.
 */
describe('DeviceGateOverlay', () => {
  const render = () => renderToStaticMarkup(React.createElement(DeviceGateOverlay, { appName: 'POS Terminal' }));
  const refusal = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

  beforeEach(() => DeviceGate.reset());

  it('renders nothing while the terminal is allowed', () => {
    expect(render()).toBe('');
  });

  it('tells the operator the app is disabled, with the cloud message', async () => {
    await DeviceGate.observe(refusal(403, { code: 'APP_DISABLED', message: 'POS is not enabled for this restaurant.' }));
    const html = render();
    expect(html).toContain('App not enabled');
    expect(html).toContain('POS is not enabled for this restaurant.');
    expect(html).toContain('POS Terminal');
    expect(html).toContain('role="alertdialog"');
  });

  it('shows the lock reason an admin typed when a terminal is locked', async () => {
    await DeviceGate.observe(refusal(403, { code: 'DEVICE_LOCKED', message: 'Locked.', reason: 'Stolen terminal' }));
    const html = render();
    expect(html).toContain('Terminal locked');
    expect(html).toContain('Stolen terminal');
  });

  it('shows a revoked device as revoked', async () => {
    await DeviceGate.observe(refusal(401, { code: 'DEVICE_REVOKED', message: 'Revoked.' }));
    expect(render()).toContain('Device revoked');
  });

  it('disappears again once the cloud accepts the terminal', async () => {
    await DeviceGate.observe(refusal(403, { code: 'SUBSCRIPTION_INACTIVE', message: 'No subscription.' }));
    expect(render()).toContain('No active subscription');
    await DeviceGate.observe(new Response('{}', { status: 200 }));
    expect(render()).toBe('');
  });
});
