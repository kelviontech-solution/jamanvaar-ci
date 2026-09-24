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

  beforeEach(() => {
    DeviceGate.reset();
    DeviceGate.consumeDisconnectReason();
    DeviceGate.onIdentityInvalid(() => undefined);
  });

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

  it('disappears again once the cloud accepts the terminal', async () => {
    await DeviceGate.observe(refusal(403, { code: 'SUBSCRIPTION_INACTIVE', message: 'No subscription.' }));
    expect(render()).toContain('No active subscription');
    await DeviceGate.observe(new Response('{}', { status: 200 }));
    expect(render()).toBe('');
  });

  // BUG-145 follow-up: a device the cloud no longer recognises (or has revoked) used to lock the whole screen
  // with no way back to the activation screen — reported as the terminal "going round and round". It is not
  // a decision about the restaurant, so it must never show here at all: DeviceGate resolves it by itself (the
  // registered app unbinds the terminal and reloads into its own ordinary activation screen instead).
  it('never shows anything for a rejected or revoked device credential', async () => {
    await DeviceGate.observe(refusal(401, { code: 'INVALID_DEVICE_CREDENTIAL', message: 'x' }));
    expect(render()).toBe('');
    await DeviceGate.observe(refusal(401, { code: 'DEVICE_REVOKED', message: 'x' }));
    expect(render()).toBe('');
  });
});
