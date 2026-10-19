import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Restaurant Admin usability review: every other empty state in this app (Menu, Tables, Printers,
 * Backup) has a direct actionable button; Kiosk Terminals' empty state was plain instructional text
 * with nothing to click. Key generation is Super-Admin-only (this app only redeems keys on the
 * device itself), so the right action is requesting one from Support.
 *
 * Since this test was first written, the plain "route to the Support tab" button was replaced by
 * KioskSetupPanel.tsx — a real in-context request flow (not a navigation) that submits an actual
 * support ticket asking for a KIOSK terminal activation key, tracks it while open, and lets the
 * owner view replies without leaving this screen. This revalidates the same underlying requirement
 * (a real, clickable path to a key — not inert text) against the current implementation.
 */
const SRC = join(__dirname, '../apps/restaurant-system/pos-admin/src/components/kiosk/KioskSetupPanel.tsx');

describe('Restaurant Admin: Kiosk Terminals empty state has a real action, not just text', () => {
  const src = readFileSync(SRC, 'utf8');

  it('App.tsx mounts KioskSetupPanel on the Kiosk Terminals tab, not a dead instructional paragraph', () => {
    const appSrc = readFileSync(join(__dirname, '../apps/restaurant-system/pos-admin/src/App.tsx'), 'utf8');
    const kiosksTabBlock = appSrc.slice(appSrc.indexOf("activeTab === 'KIOSKS'"), appSrc.indexOf("activeTab === 'KIOSKS'") + 700);
    expect(kiosksTabBlock).toMatch(/<KioskSetupPanel/);
  });

  it('has a real button that requests an activation key, independent of whether any terminal is already activated', () => {
    expect(src).toMatch(/Request activation key/);
    expect(src).toMatch(/Request another kiosk key/);
    // terminalCount is accepted but never gates whether the request button can render — the owner
    // can always ask for another kiosk key, not only on a literal zero-terminal empty state.
    expect(src).not.toMatch(/terminalCount\s*===\s*0\s*&&[^}]*Request activation key/);
  });

  it('submitting the request actually creates a support ticket asking for a KIOSK terminal key, not just a page navigation', () => {
    expect(src).toMatch(/createSupportTicket/);
    expect(src).toMatch(/KIOSK terminal activation key/);
  });

  it('shows the already-open request instead of letting the owner file a silent duplicate', () => {
    expect(src).toMatch(/already open for this branch/);
    expect(src).toMatch(/View request and replies/);
  });
});
