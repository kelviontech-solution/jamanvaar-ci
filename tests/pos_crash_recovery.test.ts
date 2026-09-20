import { describe, it, expect, beforeEach } from 'vitest';
import { PosRecoveryService } from '../apps/restaurant-system/pos/src/services/recoveryService';

describe('POS Crash Recovery & Auto-Save Tests', () => {
  beforeEach(() => {
    PosRecoveryService.clearDraft();
  });

  it('saves active draft session and loads it correctly', () => {
    const mockCart = {
      items: [
        {
          cartItemId: 'ci-draft-1',
          menuItemId: 'item-pt',
          item: {
            id: 'item-pt',
            categoryId: 'cat-starters',
            sku: 'PT',
            name: 'Paneer Tikka',
            description: '',
            price: 240,
            dietaryType: 'VEG' as const,
            spiceLevel: 'MEDIUM' as const,
            isPopular: true,
            isNew: false,
            isFeatured: false,
            isAvailable: true,
            prepTimeMinutes: 15,
            allergens: [],
            modifierGroupIds: [],
            sortOrder: 1
          },
          quantity: 2,
          unitPrice: 240,
          selectedModifiers: [],
          specialInstructions: 'No Onion Garlic',
          itemTotal: 480
        }
      ],
      subtotal: 480,
      discountAmount: 0,
      cgstAmount: 12,
      sgstAmount: 12,
      taxAmount: 24,
      serviceChargeAmount: 0,
      tipAmount: 0,
      roundOffAmount: 0,
      totalPayable: 504
    };

    PosRecoveryService.saveDraft({
      terminalId: 'POS-01',
      orderType: 'DINE_IN',
      selectedTable: {
        id: 'tbl-12',
        outletId: 'out-1',
        tableNumber: '12',
        capacity: 4,
        status: 'OCCUPIED',
        zone: 'Main Dining',
        floor: 1,
        isActive: true
      },
      selectedCustomer: null,
      guestCount: 4,
      cart: mockCart,
      billDiscountPercent: 0,
      billDiscountFlat: 0
    });

    const loaded = PosRecoveryService.loadDraft();
    expect(loaded).not.toBeNull();
    expect(loaded?.selectedTableNumber).toBe('12');
    expect(loaded?.cart.items.length).toBe(1);
    expect(loaded?.cart.totalPayable).toBe(504);

    // Test discard
    PosRecoveryService.clearDraft();
    expect(PosRecoveryService.loadDraft()).toBeNull();
  });

  // BUG-154: after Send KOT the auto-saved draft offered to "restore" dishes already in the kitchen.
  it('does not offer to restore a cart whose dishes were all already sent to the kitchen', () => {
    const line = (kotSentQty: number) => ({
      cartItemId: 'ci-1', menuItemId: 'm1', item: { id: 'm1', name: 'Paneer Tikka', price: 240 }, quantity: 2, unitPrice: 240,
      selectedModifiers: [], itemTotal: 480, kotSentQty
    });
    const save = (kotSentQty: number) =>
      PosRecoveryService.saveDraft({
        terminalId: 'POS-01', orderType: 'DINE_IN', selectedTable: null, selectedCustomer: null, guestCount: 2,
        cart: { items: [line(kotSentQty)], subtotal: 480, discountAmount: 0, cgstAmount: 12, sgstAmount: 12, taxAmount: 24, serviceChargeAmount: 0, tipAmount: 0, roundOffAmount: 0, totalPayable: 504 } as never,
        billDiscountPercent: 0, billDiscountFlat: 0
      });

    save(2);
    expect(PosRecoveryService.loadDraft()).toBeNull();

    save(1); // one of the two is still unsent: that is genuinely unfinished
    expect(PosRecoveryService.loadDraft()).not.toBeNull();
  });
});
