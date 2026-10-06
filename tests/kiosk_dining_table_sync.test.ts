import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

/**
 * Tables set up in Restaurant Admin never reached the self-order kiosk: its table picker reads the local
 * table list, but nothing in the kiosk ever pulled tables from the cloud, so every Dine-In guest saw
 * "No dining tables are set up". POS, Captain, KDS and Restaurant Admin all pull tables; the kiosk must too,
 * both when it starts and on its periodic sync tick.
 */
describe('the self-order kiosk pulls dining tables from the cloud', () => {
  const source = readFileSync('apps/kiosk-system/kiosk-user/src/App.tsx', 'utf8');

  it('imports the dining-table sync', () => {
    expect(source).toMatch(/import \{[^}]*\bsyncDiningTables\b[^}]*\} from '@jamanvaar\/sync'/);
  });

  it('runs the table sync when the kiosk starts and on every periodic tick', () => {
    const calls = source.match(/void syncDiningTables\(\);/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });
});
