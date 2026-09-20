import { describe, it, expect, beforeEach } from 'vitest';
import { db, RestaurantIdentityRepository, SEED_RESTAURANT } from '@jamanvaar/database';

/**
 * BUG-158: a brand-new restaurant's Restaurant Admin showed the demo install's GSTIN, FSSAI number, address, phone
 * and email in the header that prints on bills and reports, next to the restaurant's own name. On sign-in it now
 * takes the profile the platform holds; a detail the platform does not have is left blank, never a demo value.
 */
describe('Restaurant Admin takes the real restaurant profile at sign-in (BUG-158)', () => {
  beforeEach(() => db.resetToDefaultSeed());

  it('replaces the demo legal details with the ones the platform holds', () => {
    RestaurantIdentityRepository.syncProfile({ id: 'rest-real-9', name: 'Spice Route', legalName: 'Spice Route LLP', gstin: '24AAACR5055K1Z1', address: '12 MG Road', city: 'Surat', state: 'Gujarat', fssaiNumber: '11223344556677' });
    expect(db.restaurant).toMatchObject({ id: 'rest-real-9', name: 'Spice Route', legalName: 'Spice Route LLP', gstin: '24AAACR5055K1Z1', address: '12 MG Road', city: 'Surat', state: 'Gujarat', fssaiNumber: '11223344556677' });
  });

  it('leaves a detail blank, never a demo value, when the platform has none', () => {
    RestaurantIdentityRepository.syncProfile({ id: 'rest-real-10', name: 'Bare Bistro' });
    const shown = JSON.stringify([db.restaurant.gstin, db.restaurant.fssaiNumber, db.restaurant.address, db.restaurant.phone, db.restaurant.email, db.restaurant.city]);
    expect(shown).not.toContain(SEED_RESTAURANT.gstin);
    expect(shown).not.toMatch(/Bodakdev|Sindhu|4890|jamanvaar\.com|Ahmedabad/);
    expect(db.restaurant.legalName ?? '').not.toMatch(/JAMANVAAR/);
    expect(db.receiptConfig.gstin).toBe('');
  });

  it('a detail the owner has already entered by hand is kept on later sign-ins', () => {
    RestaurantIdentityRepository.syncProfile({ id: 'rest-real-11', name: 'Owner Cafe' });
    db.restaurant.gstin = '24AAACO1111A1Z5';
    db.restaurant.phone = '+91 99999 00000';
    RestaurantIdentityRepository.syncProfile({ id: 'rest-real-11', name: 'Owner Cafe', gstin: '24AAACX9999X1Z9' });
    expect(db.restaurant.gstin).toBe('24AAACO1111A1Z5');
    expect(db.restaurant.phone).toBe('+91 99999 00000');
  });

  it('fills a blank detail from the platform on a later sign-in', () => {
    RestaurantIdentityRepository.syncProfile({ id: 'rest-real-12', name: 'Later Diner' });
    expect(db.restaurant.gstin).toBe('');
    RestaurantIdentityRepository.syncProfile({ id: 'rest-real-12', name: 'Later Diner', gstin: '24AAACL2222B1Z6' });
    expect(db.restaurant.gstin).toBe('24AAACL2222B1Z6');
  });
});
