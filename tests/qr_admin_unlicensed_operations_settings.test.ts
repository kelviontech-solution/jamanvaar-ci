import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * OperationsSettings (Service Requests / Pickup Scheduling) used to always render the full
 * configurable form -- quiet hours, request types, pickup hours, everything -- even when the
 * restaurant's plan doesn't include it, just dimmed via disabled+opacity-60. An unlicensed
 * restaurant saw every control before being told it was locked. Now the locked message is the
 * whole story: the detail form only renders once the feature is actually licensed.
 */
const SRC = join(__dirname, '../apps/restaurant-system/pos-admin/src/components/qrconsole/QrOperations.tsx');

describe('OperationsSettings: unlicensed means the message is all you see, not a dimmed full form', () => {
  const src = readFileSync(SRC, 'utf8');

  it('the configuration fieldset only renders when licensed', () => {
    expect(src).toMatch(/\{licensed && \(\s*<fieldset disabled=\{busy\}/);
  });

  it('the fieldset no longer disables itself on license state (that job now belongs to the licensed && gate)', () => {
    expect(src).not.toMatch(/disabled=\{!licensed \|\| busy\}/);
  });
});
