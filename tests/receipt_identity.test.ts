import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { db, OrderRepository, ReceiptRepository, RestaurantIdentityRepository } from '@jamanvaar/database';
import { PosPrinterService } from '../apps/restaurant-system/pos/src/services/printerService';

/**
 * BUG-028 / BUG-021: a receipt printed the seeded demo identity ("JAMANVAAR RESTAURANT",
 * "Sindhu Bhavan Road", and a fake GSTIN 24ABCDE1234F1Z5 on a TAX INVOICE), a hardcoded
 * "BY KELVIONTECH" / "Authentic Heritage Dining", fixed "CGST (2.5%)" labels whatever the
 * real tax, and the kiosk id where the cashier's name belongs.
 */
describe('Receipts print only the restaurant\'s real details (BUG-028)', () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
  });

  function orderWith(extra: object = {}) {
    return OrderRepository.createOrder({
      orderType: 'DINE_IN',
      tableNumber: '3',
      items: [
        { id: 'oi-1', orderId: '', menuItemId: 'x', name: 'Test Dish', sku: 'T', quantity: 1, unitPrice: 200, modifiers: [], totalPrice: 200, kitchenStatus: 'PREPARING' } as any
      ],
      subtotal: 200,
      cgstAmount: 5,
      sgstAmount: 5,
      taxAmount: 10,
      totalAmount: 210,
      paymentMethod: 'CASH',
      paymentStatus: 'SUCCESS',
      orderStatus: 'COMPLETED',
      cashierName: 'Real Cashier',
      source_type: 'POS',
      ...extra
    } as any);
  }

  it('adopting a real restaurant with no GSTIN clears the seeded fake one instead of keeping it', () => {
    RestaurantIdentityRepository.adopt('rest-real-1', { name: 'royal pan', address: 'Ahmedabad Flagship Store' });
    const cfg = ReceiptRepository.getConfig();
    expect(cfg.restaurantName).toBe('royal pan');
    expect(cfg.gstin).toBe('');
    expect(cfg.fssaiNumber).toBe('');
    expect(cfg.address).toBe('Ahmedabad Flagship Store');
    expect(cfg.phone).toBe('');
    expect(db.restaurant.id).toBe('rest-real-1');
  });

  it('a printed receipt never contains the seed demo identity or a fake GSTIN', () => {
    RestaurantIdentityRepository.adopt('rest-real-1', { name: 'royal pan' });
    const text = PosPrinterService.generateReceiptText(orderWith(), '80mm');
    expect(text).toContain('ROYAL PAN');
    expect(text).not.toContain('24ABCDE1234F1Z5');
    expect(text).not.toContain('10722001000452');
    expect(text).not.toContain('Sindhu Bhavan');
    expect(text).not.toContain('KELVIONTECH');
    expect(text).not.toContain('Authentic Heritage');
    expect(text).toMatch(/GSTIN: Not registered/i);
  });

  it('prints the real GSTIN when the restaurant has one', () => {
    RestaurantIdentityRepository.adopt('rest-real-1', { name: 'royal pan', gstin: '24AAACR5055K1Z1', fssaiNumber: '12345678901234' });
    const text = PosPrinterService.generateReceiptText(orderWith(), '80mm');
    expect(text).toContain('GSTIN: 24AAACR5055K1Z1');
    expect(text).toContain('12345678901234');
  });

  it('labels the tax lines with the real rate, not a fixed 2.5%', () => {
    RestaurantIdentityRepository.adopt('rest-real-1', { name: 'royal pan' });
    // 200 taxable, 9% + 9% => 36 total tax
    const text = PosPrinterService.generateReceiptText(orderWith({ cgstAmount: 18, sgstAmount: 18, taxAmount: 36, totalAmount: 236 }), '80mm');
    expect(text).toContain('CGST (9%):');
    expect(text).toContain('SGST (9%):');
    expect(text).not.toContain('(2.5%)');
  });

  it('the CASHIER line is the cashier\'s name, matching the on-screen receipt, not the kiosk id', () => {
    RestaurantIdentityRepository.adopt('rest-real-1', { name: 'royal pan' });
    const text = PosPrinterService.generateReceiptText(orderWith(), '80mm');
    expect(text).toContain('CASHIER: Real Cashier');
  });
});

/**
 * BUG-123/124/125: the on-screen receipt printed CGST/SGST as "₹21.5" (and "₹0" when the order had no
 * split), the counter's own receipt said "POS: CLOUD-SYNC" for a table order that came from Captain, and
 * the demo footer "Thank you for dining at JAMANVAAR!" appeared on every restaurant's receipts.
 */
describe('Receipt wording and numbers (BUG-123/124/125)', () => {
  const source = readFileSync(join(__dirname, '../packages/ui/src/ThermalReceiptView.tsx'), 'utf8');

  it('tax lines always show two decimals and fall back to a proper CGST/SGST split of the tax', () => {
    expect(source).not.toMatch(/₹\{order\.cgstAmount \?\? 0\}/);
    expect(source).not.toMatch(/₹\{order\.sgstAmount \?\? 0\}/);
    expect(source).toMatch(/cgstAmount \?\? splitTax\(order\.taxAmount \|\| 0\)\.cgst\)\.toFixed\(2\)/);
  });

  it('the terminal line is left out when the order arrived from the cloud rather than being rung up here', () => {
    expect(source).toMatch(/kioskId !== 'CLOUD-SYNC'/);
  });
});
