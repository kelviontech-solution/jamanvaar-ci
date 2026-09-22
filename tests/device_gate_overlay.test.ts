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

  it('names a rejected device credential instead of showing nothing (BUG-145)', async () => {
    await DeviceGate.observe(refusal(401, { code: 'INVALID_DEVICE_CREDENTIAL', message: 'Invalid device credential.' }));
    expect(render()).toContain('Device not recognised');
  });

  // BUG-145 follow-up: a device the cloud no longer recognises (or has revoked) used to lock the terminal
  // forever with no way back to the activation screen — reported as the terminal "going round and round".
  describe('resetting a terminal that a fresh activation would actually fix', () => {
    const renderWithReset = () => renderToStaticMarkup(React.createElement(DeviceGateOverlay, { appName: 'POS Terminal', onResetTerminal: () => undefined }));

    it('offers no reset button when the caller gives no onResetTerminal, even for a fixable code', async () => {
      await DeviceGate.observe(refusal(401, { code: 'INVALID_DEVICE_CREDENTIAL', message: 'x' }));
      expect(render()).not.toContain('Reset this terminal');
    });

    it('offers "Reset this terminal" for a rejected device credential', async () => {
      await DeviceGate.observe(refusal(401, { code: 'INVALID_DEVICE_CREDENTIAL', message: 'x' }));
      expect(renderWithReset()).toContain('Reset this terminal');
    });

    it('offers it for a revoked device too', async () => {
      await DeviceGate.observe(refusal(401, { code: 'DEVICE_REVOKED', message: 'x' }));
      expect(renderWithReset()).toContain('Reset this terminal');
    });

    it('does not offer it for a lock a fresh activation of this device would not fix', async () => {
      await DeviceGate.observe(refusal(403, { code: 'RESTAURANT_SUSPENDED', message: 'x' }));
      const html = renderWithReset();
      expect(html).toContain('Account suspended');
      expect(html).not.toContain('Reset this terminal');
    });

    it('does not offer it for a subscription or app-disabled lock either', async () => {
      await DeviceGate.observe(refusal(403, { code: 'SUBSCRIPTION_INACTIVE', message: 'x' }));
      expect(renderWithReset()).not.toContain('Reset this terminal');
      await DeviceGate.observe(refusal(403, { code: 'APP_DISABLED', message: 'x' }));
      expect(renderWithReset()).not.toContain('Reset this terminal');
    });
  });
});
