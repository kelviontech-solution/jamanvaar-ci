import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * JamanvaarAuthLayout now supports a restaurantName prop (see
 * jamanvaar_auth_layout_shows_restaurant_name.test.ts), but it only helps if each terminal's
 * post-activation staff sign-in screen actually passes it. This pins the three PIN sign-in
 * screens -- not their activation-key screens, where the restaurant genuinely isn't known yet.
 */
describe('POS/Captain/KDS staff sign-in passes the activated restaurant\'s own name', () => {
  it('POS: PosLogin passes restaurantName from db.restaurant.name', () => {
    const src = readFileSync(join(__dirname, '../apps/restaurant-system/pos/src/components/auth/PosLogin.tsx'), 'utf8');
    expect(src).toMatch(/restaurantName=\{db\.restaurant\.name\}/);
  });

  it('Captain: the PIN sign-in JamanvaarAuthLayout (not the activation one) passes restaurantName', () => {
    const src = readFileSync(join(__dirname, '../apps/restaurant-system/captain/src/App.tsx'), 'utf8');
    const signInIdx = src.indexOf('Floor Captain Sign In');
    expect(signInIdx).toBeGreaterThan(-1);
    const layoutIdx = src.lastIndexOf('<JamanvaarAuthLayout', signInIdx);
    const block = src.slice(layoutIdx, signInIdx);
    expect(block).toMatch(/restaurantName=\{captainDb\.restaurant(\?\.|\.)name\}/);
  });

  it('KDS: the PIN sign-in JamanvaarAuthLayout (not the activation one) passes restaurantName', () => {
    const src = readFileSync(join(__dirname, '../apps/restaurant-system/kds/src/App.tsx'), 'utf8');
    const signInIdx = src.indexOf('Kitchen Staff Sign In');
    expect(signInIdx).toBeGreaterThan(-1);
    const layoutIdx = src.lastIndexOf('<JamanvaarAuthLayout', signInIdx);
    const block = src.slice(layoutIdx, signInIdx);
    expect(block).toMatch(/restaurantName=\{kdsDb\.restaurant(\?\.|\.)name\}/);
  });
});
