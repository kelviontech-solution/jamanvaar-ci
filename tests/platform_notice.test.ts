import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DeviceGate, PlatformNotice } from '@jamanvaar/sync';
import { PlatformNoticeBanner } from '@jamanvaar/ui';

/**
 * BUG-091: the maintenance notice a platform admin publishes must reach the screens
 * of every restaurant app. It arrives in the heartbeat answer (terminals) or a poll
 * (Restaurant Admin), is remembered for offline use, and can be dismissed for the
 * session without ever blocking billing.
 */
describe('PlatformNotice', () => {
  const notice = { kind: 'MAINTENANCE' as const, message: 'Upgrade tonight 2-3am', startsAt: null, endsAt: null };

  beforeEach(() => PlatformNotice.reset());

  it('starts empty', () => {
    expect(PlatformNotice.get()).toBeNull();
  });

  it('a heartbeat carrying a notice shows it, and one without clears it', () => {
    DeviceGate.applyHeartbeat({ ok: true, locked: false, notice } as any);
    expect(PlatformNotice.get()?.message).toBe('Upgrade tonight 2-3am');
    DeviceGate.applyHeartbeat({ ok: true, locked: false, notice: null } as any);
    expect(PlatformNotice.get()).toBeNull();
  });

  it('a heartbeat that says nothing about a notice leaves the remembered one alone (older API)', () => {
    PlatformNotice.set(notice);
    DeviceGate.applyHeartbeat({ ok: true, locked: false } as any);
    expect(PlatformNotice.get()?.message).toBe('Upgrade tonight 2-3am');
  });

  it('drops a notice whose end time has passed, even while offline', () => {
    PlatformNotice.set({ ...notice, endsAt: new Date(Date.now() - 1000).toISOString() });
    expect(PlatformNotice.get()).toBeNull();
  });

  it('dismissing hides that message, but a different message shows again', () => {
    PlatformNotice.set(notice);
    PlatformNotice.dismiss();
    expect(PlatformNotice.getVisible()).toBeNull();
    expect(PlatformNotice.get()).not.toBeNull();
    PlatformNotice.set({ ...notice, message: 'Now it is an outage' });
    expect(PlatformNotice.getVisible()?.message).toBe('Now it is an outage');
  });

  it('notifies subscribers', () => {
    let calls = 0;
    const off = PlatformNotice.subscribe(() => calls++);
    PlatformNotice.set(notice);
    expect(calls).toBeGreaterThanOrEqual(1);
    off();
  });

  describe('banner', () => {
    const render = () => renderToStaticMarkup(React.createElement(PlatformNoticeBanner));

    it('renders nothing without a notice', () => {
      expect(render()).toBe('');
    });

    it('shows the message, says billing is not affected, and offers to dismiss', () => {
      PlatformNotice.set(notice);
      const html = render();
      expect(html).toContain('Upgrade tonight 2-3am');
      expect(html).toMatch(/keep(s)? (working|selling|billing)|not affected|continue/i);
      expect(html).toContain('role="status"');
      expect(html).toMatch(/Dismiss/);
    });

    it('is gone after dismissing', () => {
      PlatformNotice.set(notice);
      PlatformNotice.dismiss();
      expect(render()).toBe('');
    });
  });
});
