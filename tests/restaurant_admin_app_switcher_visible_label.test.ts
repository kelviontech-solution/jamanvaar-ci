import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Restaurant Admin usability review: the Restaurant Admin / Kiosk Admin switcher's only visible
 * label was screen-reader-only ("sr-only") -- a sighted user saw a bare select with no indication
 * it switches the entire application context. Fixed with a visible "App" label and a distinct
 * bordered/tinted + icon treatment so it reads as an app switcher, not a stray settings dropdown.
 */
const SRC = join(__dirname, '../apps/restaurant-system/pos-admin/src/components/header/PosAdminHeader.tsx');

describe('Restaurant Admin: the Restaurant Admin / Kiosk Admin switcher has a visible label', () => {
  const src = readFileSync(SRC, 'utf8');
  const block = src.slice(src.indexOf('availableProducts.length > 1 && onSwitchProduct'), src.indexOf('availableProducts.length > 1 && onSwitchProduct') + 700);

  it('has a visible text label, not only an sr-only one', () => {
    expect(block).not.toMatch(/sr-only/);
    expect(block).toMatch(/>App</);
  });

  it('is visually distinguished with a border/tint so it reads as an app switcher', () => {
    expect(block).toMatch(/border-brand/);
  });
});
