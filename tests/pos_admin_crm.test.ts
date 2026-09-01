import { describe, it, expect } from 'vitest';
import { db, CustomerRepository } from '@jamanvaar/database';

describe('JAMANVAAR Restaurant Admin — Customer Relationship Management (CRM)', () => {
  it('should list customer accounts with contact details and loyalty points', () => {
    const customers = CustomerRepository.getAll();
    expect(customers.length).toBeGreaterThan(0);

    const ramesh = CustomerRepository.getByPhone('9876543210');
    expect(ramesh).toBeDefined();
    expect(ramesh?.name).toBe('Ramesh Patel');
    expect(ramesh?.loyaltyPoints).toBeGreaterThan(0);
    expect(ramesh?.tags).toContain('VIP');
  });

  it('should support adding and redeeming loyalty points with audit accuracy', () => {
    const phone = '9822334455';
    const initial = CustomerRepository.getByPhone(phone)?.loyaltyPoints || 0;

    CustomerRepository.addLoyaltyPoints(phone, 50);
    const afterAdd = CustomerRepository.getByPhone(phone)?.loyaltyPoints;
    expect(afterAdd).toBe(initial + 50);

    const redeemSuccess = CustomerRepository.redeemPoints(phone, 30);
    expect(redeemSuccess).toBe(true);
    const afterRedeem = CustomerRepository.getByPhone(phone)?.loyaltyPoints;
    expect(afterRedeem).toBe(initial + 20);
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
