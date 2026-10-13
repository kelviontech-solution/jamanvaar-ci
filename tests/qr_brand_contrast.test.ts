import { describe, expect, it } from 'vitest';
import { accentInk, accentText } from '../apps/qr-guest/src/brandContrast';
describe('QR restaurant accent readability', () => {
  it('uses dark ink on bright yellow and teal, white on dark navy', () => {
    expect(accentInk('#ffcc00')).toBe('#0b253a');
    expect(accentInk('#00a99d')).toBe('#0b253a');
    expect(accentInk('#0b253a')).toBe('#ffffff');
    expect(accentInk('#777777')).toBe('#000000');
  });
  it('keeps low-contrast decorative colors out of small text', () => {
    expect(accentText('#ffcc00')).toBe('#0b253a');
    expect(accentText('#c2570c')).toBe('#c2570c');
    expect(accentText('invalid')).toBe('#0b253a');
  });
});
