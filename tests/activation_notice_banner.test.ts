import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DeviceGate } from '@jamanvaar/sync';
import { ActivationNoticeBanner } from '@jamanvaar/ui';

/**
 * BUG-145 follow-up: what an app's own activation/connect screen shows when DeviceGate has just unbound this
 * terminal because its saved credential went bad — the explanation belongs here, at activation time, never as
 * a blocking lock screen over whatever the terminal was doing.
 */
describe('ActivationNoticeBanner', () => {
  const render = () => renderToStaticMarkup(React.createElement(ActivationNoticeBanner));

  beforeEach(() => DeviceGate.consumeDisconnectReason());

  it('renders nothing when there is no reason to explain', () => {
    expect(render()).toBe('');
  });

  it('shows a remembered reason', () => {
    DeviceGate.rememberDisconnectReason('This terminal was reactivated elsewhere. Please activate it again.');
    const html = render();
    expect(html).toContain('reactivated elsewhere');
    expect(html).toContain('role="alert"');
  });

  // The component peeks (never clears) in its own render, so React 18 StrictMode calling that lazy initializer
  // twice on mount can never make the banner see nothing on the very mount it is supposed to appear on. The
  // real clearing happens once, afterwards, as an effect (renderToStaticMarkup does not run effects, so this
  // asserts the two halves directly rather than through a live DOM mount).
  it('is only marked as shown by the effect, not by rendering it', () => {
    DeviceGate.rememberDisconnectReason('x');
    render();
    render();
    expect(DeviceGate.peekDisconnectReason()).toBe('x');
    expect(DeviceGate.consumeDisconnectReason()).toBe('x');
    expect(DeviceGate.peekDisconnectReason()).toBeNull();
  });
});
