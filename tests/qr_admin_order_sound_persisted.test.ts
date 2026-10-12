import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * QR Orders' "New-order sound" toggle used to be in-memory only (plain useState(false)) -- leaving
 * the page and coming back silently reset it to off, with no indication, on a feature whose whole
 * job is alerting staff during live service. It now persists across visits via localStorage.
 */
const SRC = join(__dirname, '../apps/restaurant-system/pos-admin/src/components/qrconsole/QrAdvanced.tsx');

describe('QR Orders: "New-order sound" preference survives leaving and returning to the page', () => {
  const src = readFileSync(SRC, 'utf8');

  it('the initial value is read from localStorage, not hardcoded false', () => {
    expect(src).not.toMatch(/\[sound, setSound\] = useState\(false\)/);
    expect(src).toMatch(/localStorage\.getItem\(QR_ORDER_SOUND_KEY\)/);
  });

  it('every toggle writes the new value back to localStorage', () => {
    expect(src).toMatch(/localStorage\.setItem\(QR_ORDER_SOUND_KEY, checked \? "1" : "0"\)/);
  });
});
