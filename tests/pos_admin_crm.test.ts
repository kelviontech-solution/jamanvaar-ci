import { describe, it, expect } from 'vitest';
import { db, CustomerRepository } from '@jamanvaar/database';

describe('JAMANVAAR Restaurant Admin — Customer Relationship Management (CRM)', () => {
  // The database no longer ships with 8 fabricated demo customer profiles
  // (see db.ts's customerAccounts — they had invented loyalty history that
  // never corresponded to any real order). This suite creates its own real
  // customer via CustomerRepository, the same path a real order attaching a
  // guest goes through.
  it('should list customer accounts with contact details and loyalty points', () => {
    const phone = '9876500001';
    CustomerRepository.createCustomer({
      phone,
      name: 'Test VIP Guest',
      tags: ['VIP'],
      loyaltyPoints: 50
    });

    const customers = CustomerRepository.getAll();
    expect(customers.length).toBeGreaterThan(0);

    const guest = CustomerRepository.getByPhone(phone);
    expect(guest).toBeDefined();
    expect(guest?.name).toBe('Test VIP Guest');
    expect(guest?.loyaltyPoints).toBeGreaterThan(0);
    expect(guest?.tags).toContain('VIP');

    CustomerRepository.deleteCustomer(phone);
  });

  it('should support adding and redeeming loyalty points with audit accuracy', () => {
    const phone = '9876500002';
    CustomerRepository.createCustomer({ phone, name: 'Test Loyalty Guest', loyaltyPoints: 0 });
    const initial = CustomerRepository.getByPhone(phone)?.loyaltyPoints || 0;

    CustomerRepository.addLoyaltyPoints(phone, 50);
    const afterAdd = CustomerRepository.getByPhone(phone)?.loyaltyPoints;
    expect(afterAdd).toBe(initial + 50);

    const redeemSuccess = CustomerRepository.redeemPoints(phone, 30);
    expect(redeemSuccess).toBe(true);
    const afterRedeem = CustomerRepository.getByPhone(phone)?.loyaltyPoints;
    expect(afterRedeem).toBe(initial + 20);

    CustomerRepository.deleteCustomer(phone);
  });

  it('should create new customer record with CRM tags, address, and anniversary', () => {
    const testPhone = '9998887766';
    const newCust = CustomerRepository.createCustomer({
      phone: testPhone,
      name: 'Vikramaditya Singhania',
      email: 'vikram@singhania.org',
      address: 'Skyline Penthouse, SG Highway',
      dob: '1985-05-15',
      anniversary: '2012-11-20',
      notes: 'Loves Royal Veg Dum Biryani and extra cheese.',
      tags: ['VIP', 'FAMILY'],
      loyaltyPoints: 100
    });

    expect(newCust).toBeDefined();
    expect(newCust.phone).toBe(testPhone);
    expect(newCust.loyaltyPoints).toBe(100);

    // Clean up
    CustomerRepository.deleteCustomer(testPhone);
  });
});
