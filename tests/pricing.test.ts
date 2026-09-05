import { describe, expect, it } from 'vitest';
import { calculateCart, calculateItemTotal, calculateItemUnitPrice } from '../packages/business/src/pricing';
import { CartItem, MenuItem } from '../packages/types/src/domain';

const mockDish: MenuItem = {
  id: 'item-1',
  categoryId: 'cat-1',
  sku: 'HBK',
  name: 'Hara Bhara Kebab',
  description: 'Appetizer',
  price: 220,
  dietaryType: 'VEG',
  spiceLevel: 'NONE',
  isPopular: true,
  isNew: false,
  isFeatured: true,
  isAvailable: true,
  prepTimeMinutes: 10,
  allergens: [],
  modifierGroupIds: [],
  sortOrder: 1
};

describe('Pricing Engine & Tax Calculations', () => {
  it('calculates unit price with modifiers correctly', () => {
    const modifiers = [
      { groupId: 'g1', groupName: 'Addon', optionId: 'o1', optionName: 'Cheese', priceDelta: 35 }
    ];
    const unitPrice = calculateItemUnitPrice(mockDish.price, modifiers);
    expect(unitPrice).toBe(255);
  });

  it('calculates line total for quantity', () => {
    const total = calculateItemTotal(mockDish.price, 3, []);
    expect(total).toBe(660);
  });

  it('calculates accurate GST (2.5% CGST + 2.5% SGST = 5%) on cart subtotal', () => {
    const cartItems: CartItem[] = [
      {
        cartItemId: 'c1',
        menuItemId: mockDish.id,
        item: mockDish,
        quantity: 2,
        unitPrice: 220,
        selectedModifiers: [],
        itemTotal: 440
      }
    ];

    const cart = calculateCart({
      items: cartItems,
      coupon: null
    });

    expect(cart.subtotal).toBe(440);
    expect(cart.cgstAmount).toBe(11); // 2.5% of 440
    expect(cart.sgstAmount).toBe(11); // 2.5% of 440
    expect(cart.taxAmount).toBe(22);
    expect(cart.totalPayable).toBe(462);
  });

  it('applies discount and calculates taxes on net taxable amount', () => {
    const cartItems: CartItem[] = [
      {
        cartItemId: 'c1',
        menuItemId: mockDish.id,
        item: mockDish,
        quantity: 2,
        unitPrice: 220,
        selectedModifiers: [],
        itemTotal: 440
      }
    ];

    const coupon = {
      id: 'cpn-1',
      code: 'WELCOME50',
      description: '₹50 OFF',
      discountType: 'FLAT' as const,
      discountValue: 50,
      minOrderValue: 200,
      validFrom: '2026-01-01',
      validUntil: '2027-01-01',
      usageCount: 0,
      isActive: true
    };

    const cart = calculateCart({
      items: cartItems,
      coupon
    });

    expect(cart.subtotal).toBe(440);
    expect(cart.discountAmount).toBe(50);
    // Taxable amount = 440 - 50 = 390
    // CGST 2.5% of 390 = 9.75
    // SGST 2.5% of 390 = 9.75
    expect(cart.cgstAmount).toBe(9.75);
    expect(cart.sgstAmount).toBe(9.75);
    // 390 + 19.50 = 409.50 -> rounded to 410 with round-off +0.50
    expect(cart.totalPayable).toBe(410);
  });
});
