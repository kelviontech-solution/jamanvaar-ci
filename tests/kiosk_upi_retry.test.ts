import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

/**
 * The kiosk's UPI tile kept a "Being set up" or "Unavailable" flag from an earlier attempt (made before the
 * restaurant's online payments were activated) and returned early on every tap, so the guest could never ask the
 * server for a QR again until the next checkout. The tap must clear the flag and ask the server, which decides.
 */
describe('the kiosk UPI tile asks the server again on every tap', () => {
  const source = readFileSync('apps/kiosk-system/kiosk-user/src/App.tsx', 'utf8');
  const tap = source.slice(source.indexOf("setPaymentMethod('UPI');") - 900, source.indexOf("setPaymentMethod('UPI');") + 400);

  it('does not return early on a stale unavailable flag before requesting the QR', () => {
    expect(tap).not.toMatch(/if \(onlinePaymentUnavailable\) \{/);
  });

  it('clears the stale flags on tap', () => {
    expect(tap).toMatch(/setRazorpayUnavailable\(false\);/);
    expect(tap).toMatch(/setOnlinePaymentsPending\(false\);/);
  });
});
