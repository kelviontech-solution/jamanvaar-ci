import { describe, it, expect, beforeEach } from 'vitest';
import { db, RestaurantIdentityRepository } from '@jamanvaar/database';

/**
 * BUG-110: after activating against "Captain Verify Bistro", POS and Restaurant Admin still showed
 * the demo branch "Ahmedabad Flagship Store" (code AHM-01, a Bodakdev address and a demo phone
 * number) because activation only adopted the restaurant's own name, not the branch that hangs off it.
 */
describe('Activation replaces the demo branch (BUG-110)', () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
    // The demo install's receipt footer (a reset does not restore it, so set it explicitly).
    db.receiptConfig = { ...db.receiptConfig, thankYouMessage: 'Thank you for dining at JAMANVAAR! Please visit again.', footerMessage: 'Freshly Prepared • Zero Preservatives • Pure Heritage Taste' };
  });

  it('the branch takes the restaurant\'s name and drops the demo code, address, city and phone', () => {
    RestaurantIdentityRepository.adopt('rest-real-1', { name: 'Captain Verify Bistro' });

    expect(db.outlet.name).toBe('Captain Verify Bistro');
    expect(db.outlet.restaurantId).toBe('rest-real-1');
    expect(db.outlet.code).toBe('');
    expect(db.outlet.address).toBe('');
    expect(db.outlet.city).toBe('');
    expect(db.outlet.phone).toBe('');
    expect(JSON.stringify(db.outlet)).not.toMatch(/Ahmedabad|Bodakdev|Sindhu|98765/);
  });

  it('uses the restaurant\'s own address and phone when it has them', () => {
    RestaurantIdentityRepository.adopt('rest-real-2', { name: 'Spice Route', address: '12 MG Road', phone: '+91 90000 11111' });
    expect(db.outlet).toMatchObject({ name: 'Spice Route', address: '12 MG Road', phone: '+91 90000 11111' });
  });

  it('keeps the branch id, so tables and orders that point at it stay linked', () => {
    const id = db.outlet.id;
    RestaurantIdentityRepository.adopt('rest-real-3', { name: 'Anything' });
    expect(db.outlet.id).toBe(id);
  });
  it('Restaurant Admin, which only learns the id and name at sign-in, replaces the demo branch too without touching the saved legal details of the restaurant', () => {
    db.restaurant.gstin = '24AAACR5055K1Z1';
    RestaurantIdentityRepository.adoptBranch('rest-real-4', 'Admin Bistro');

    expect(db.outlet).toMatchObject({ name: 'Admin Bistro', restaurantId: 'rest-real-4', code: '' });
    expect(JSON.stringify(db.outlet)).not.toMatch(/Ahmedabad|Bodakdev|98765/);
    expect(db.restaurant.gstin).toBe('24AAACR5055K1Z1');
  });

  it('a branch already adopted for this restaurant is left as the owner set it', () => {
    RestaurantIdentityRepository.adoptBranch('rest-real-5', 'First Name');
    db.outlet.name = 'Owner Renamed Branch';
    RestaurantIdentityRepository.adoptBranch('rest-real-5', 'First Name');
    expect(db.outlet.name).toBe('Owner Renamed Branch');
  });
  it('the receipt footer no longer thanks guests on behalf of the demo brand (BUG-125)', () => {
    RestaurantIdentityRepository.adopt('rest-real-6', { name: 'Spice Route' });
    expect(db.receiptConfig.thankYouMessage).toBe('Thank you for dining at Spice Route! Please visit again.');
    expect(db.receiptConfig.footerMessage ?? '').not.toMatch(/Heritage|JAMANVAAR/i);
  });

  it('a footer the restaurant wrote itself is kept', () => {
    db.receiptConfig = { ...db.receiptConfig, thankYouMessage: 'See you soon!', footerMessage: 'Fresh daily' };
    RestaurantIdentityRepository.adopt('rest-real-7', { name: 'Spice Route' });
    expect(db.receiptConfig.thankYouMessage).toBe('See you soon!');
    expect(db.receiptConfig.footerMessage).toBe('Fresh daily');
  });
});
