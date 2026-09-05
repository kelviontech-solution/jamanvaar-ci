import { describe, it, expect } from 'vitest';
import { calculateCart, calculateItemTotal, calculateItemDiscountedTotal } from '../pricing';
import { CartItem, MenuItem } from '@jamanvaar/types';

describe('JAMANVAAR POS — Complete Discount & Billing Engine', () => {
  const sampleItems: CartItem[] = [
    {
      cartItemId: 'ci-1',
      menuItemId: 'dish-paneer-tikka',
      item: {
        id: 'dish-paneer-tikka',
        name: 'Paneer Tikka',
        price: 300,
        categoryId: 'cat-starters',
        sku: 'SKU-PT01',
        dietaryType: 'VEG',
        isAvailable: true
      } as MenuItem,
      quantity: 2,
      unitPrice: 300,
      selectedModifiers: [],
      itemTotal: 600
    },
    {
      cartItemId: 'ci-2',
      menuItemId: 'dish-dal-makhani',
      item: {
        id: 'dish-dal-makhani',
        name: 'Dal Makhani',
        price: 250,
        categoryId: 'cat-mains',
        sku: 'SKU-DM01',
        dietaryType: 'VEG',
        isAvailable: true
      } as MenuItem,
      quantity: 1,
      unitPrice: 250,
      selectedModifiers: [],
      itemTotal: 250
    }
  ];

  it('TEST 1: Calculate raw cart subtotal without discount', () => {
    const cart = calculateCart({ items: sampleItems });
    // Subtotal: 600 + 250 = 850
    expect(cart.subtotal).toBe(850);
    expect(cart.discountAmount).toBe(0);
    // GST 5% on 850 = 42.50 (CGST 21.25 + SGST 21.25)
    expect(cart.cgstAmount).toBe(21.25);
    expect(cart.sgstAmount).toBe(21.25);
    expect(cart.taxAmount).toBe(42.5);
    // Total: 850 + 42.50 = 892.50 => rounded to 893, roundOff: +0.50
    expect(cart.totalPayable).toBe(893);
    expect(cart.roundOffAmount).toBe(0.5);
  });

  it('TEST 2: Apply Bill-Level Percentage Discount (10% Off)', () => {
    const cart = calculateCart({
      items: sampleItems,
      discountType: 'PERCENTAGE',
      discountValue: 10,
      discountScope: 'BILL',
      discountReason: 'Customer Loyalty'
    });

    expect(cart.subtotal).toBe(850);
    // 10% of 850 = 85
    expect(cart.discountAmount).toBe(85);
    // Net Taxable Turnover = 850 - 85 = 765
    // GST 5% on 765 = 38.25 (CGST 19.13 + SGST 19.13)
    expect(cart.cgstAmount).toBe(19.13);
    expect(cart.sgstAmount).toBe(19.13);
    expect(cart.taxAmount).toBe(38.26);
    // Total: 765 + 38.26 = 803.26 => rounded to 803, roundOff: -0.26
    expect(cart.totalPayable).toBe(803);
    expect(cart.discountReason).toBe('Customer Loyalty');
  });

  it('TEST 3: Apply Bill-Level Fixed Amount Discount (₹100 Off)', () => {
    const cart = calculateCart({
      items: sampleItems,
      discountType: 'FIXED',
      discountValue: 100,
      discountScope: 'BILL',
      discountReason: 'Festival Offer',
      discountCode: 'DIWALI100'
    });

    expect(cart.subtotal).toBe(850);
    expect(cart.discountAmount).toBe(100);
    // Taxable: 850 - 100 = 750
    // GST 5% on 750 = 37.50 (CGST 18.75 + SGST 18.75)
    expect(cart.cgstAmount).toBe(18.75);
    expect(cart.sgstAmount).toBe(18.75);
    expect(cart.taxAmount).toBe(37.5);
    // Total: 750 + 37.50 = 787.50 => rounded to 788, roundOff: +0.50
    expect(cart.totalPayable).toBe(788);
    expect(cart.discountCode).toBe('DIWALI100');
  });

  it('TEST 4: Apply Item-Level Discount to specific dish', () => {
    const itemsWithItemDiscount: CartItem[] = [
      {
        ...sampleItems[0],
        itemDiscountPercent: 20, // 20% off on Paneer Tikka (₹600 -> ₹120 discount)
        discountReason: 'Chef Special'
      },
      {
        ...sampleItems[1] // Dal Makhani at full price
      }
    ];

    const cart = calculateCart({
      items: itemsWithItemDiscount,
      discountScope: 'ITEMS'
    });

    expect(cart.subtotal).toBe(850);
    expect(cart.discountAmount).toBe(120);
    // Taxable: 850 - 120 = 730
    // GST 5% on 730 = 36.50 (CGST 18.25 + SGST 18.25)
    expect(cart.cgstAmount).toBe(18.25);
    expect(cart.sgstAmount).toBe(18.25);
    expect(cart.taxAmount).toBe(36.5);
    // Total: 730 + 36.50 = 766.50 => rounded to 767, roundOff: +0.50
    expect(cart.totalPayable).toBe(767);
  });

  it('TEST 5: Ensure discount cannot exceed subtotal (100% cap)', () => {
    const cart = calculateCart({
      items: sampleItems,
      discountType: 'FIXED',
      discountValue: 99999, // Exceeds 850
      discountScope: 'BILL'
    });

    expect(cart.subtotal).toBe(850);
    expect(cart.discountAmount).toBe(850);
    expect(cart.cgstAmount).toBe(0);
    expect(cart.sgstAmount).toBe(0);
    expect(cart.taxAmount).toBe(0);
    expect(cart.totalPayable).toBe(0);
  });

  it('TEST 6: calculateItemDiscountedTotal helper calculates accurate line discounts', () => {
    const res = calculateItemDiscountedTotal(300, 2, [], 10, 0); // 10% on 600
    expect(res.rawTotal).toBe(600);
    expect(res.discountAmount).toBe(60);
    expect(res.finalTotal).toBe(540);
  });
});
