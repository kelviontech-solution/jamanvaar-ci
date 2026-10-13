import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Reported bug: every staff PIN sign-in screen (POS/Captain/KDS, all built on this shared
 * JamanvaarAuthLayout) showed only a generic app name ("Kitchen Display System", "POS Counter")
 * under "WELCOME TO" -- never the restaurant's own name, even though the device is already
 * activated and bound to one specific restaurant by the time this screen renders. The owner
 * expects "Welcome to <their restaurant>" once a terminal is activated, matching what the Kiosk
 * customer-facing welcome screen already does with its own restaurantName prop.
 */
const SRC = join(__dirname, '../packages/ui/src/JamanvaarAuthLayout.tsx');

describe('JamanvaarAuthLayout: shows the activated restaurant\'s own name once known', () => {
  const src = readFileSync(SRC, 'utf8');

  it('accepts an optional restaurantName prop', () => {
    expect(src).toMatch(/restaurantName\?:\s*string/);
  });

  it('shows the restaurant name as the headline once provided, falling back to appTitle otherwise', () => {
    expect(src).toMatch(/\{restaurantName\s*\|\|\s*appTitle\}/);
  });
});
