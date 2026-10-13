import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Restaurant Admin usability review: every other empty state in this app (Menu, Tables, Printers,
 * Backup) has a direct actionable button; Kiosk Terminals' empty state was plain instructional text
 * with nothing to click. Key generation is Super-Admin-only (this app only redeems keys on the
 * device itself), so the right action here is pointing the owner at Support to request one --
 * not a fabricated "generate key" button this app doesn't actually have the capability to do.
 */
const SRC = join(__dirname, '../apps/restaurant-system/pos-admin/src/App.tsx');

describe('Restaurant Admin: Kiosk Terminals empty state has a real action, not just text', () => {
  const src = readFileSync(SRC, 'utf8');
  const block = src.slice(src.indexOf('No Kiosk Terminals yet'), src.indexOf('No Kiosk Terminals yet') + 700);

  it('has a button that routes to Support to request an activation key', () => {
    expect(block).toMatch(/setActiveTab\('SUPPORT'\)/);
    expect(block).toMatch(/Request Activation Key/);
  });
});
