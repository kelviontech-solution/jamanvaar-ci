import { describe, expect, it } from 'vitest';
import { priceSavedUnpaidOrder } from '@jamanvaar/business';
import type { MenuItem, Order, TaxGroup } from '@jamanvaar/types';

const group = { id: 'accepted-tax', name: 'Tax', cgstPercent: 2.5, sgstPercent: 2.5, isActive: true, isInclusive: false } as TaxGroup;
const dish = { id: 'meal', name: 'Meal', price: 999, taxGroupId: group.id } as MenuItem;
const order = (): Order => ({ id: 'saved-bill', paymentStatus: 'PENDING', orderStatus: 'PREPARING', subtotal: 300,
  discountAmount: 0, serviceChargeAmount: 0, tipAmount: 0, items: [
    { id: 'first', menuItemId: 'meal', name: 'First', quantity: 1, unitPrice: 100, totalPrice: 100, modifiers: [], kitchenStatus: 'CANCELLED' },
    { id: 'second', menuItemId: 'meal', name: 'Second', quantity: 1, unitPrice: 200, totalPrice: 200, modifiers: [], kitchenStatus: 'PREPARING',
      snapshot: { taxGroupId: group.id, taxRateBp: 500, taxInclusive: false, lineTax: 1000 } }
  ] } as unknown as Order);

describe('repricing accepted unpaid dishes', () => {
  it('keeps accepted unit prices and tax rates after the catalog changes', () => {
    const source = order();
    const result = priceSavedUnpaidOrder(source, [dish], [{ ...group, cgstPercent: 9, sgstPercent: 9 }]);
    expect(result).toMatchObject({ subtotal: 200, taxAmount: 10, totalAmount: 210 });
    expect(result.items[1].unitPrice).toBe(200); expect(result.items[1].snapshot?.taxRateBp).toBe(500);
    expect(source.items[1].snapshot?.taxGroupId).toBe(group.id);
  });
  it('reallocates a saved fixed discount and its line tax together', () => {
    const source = { ...order(), discountType: 'FIXED' as const, discountValue: 50, discountAmount: 50 };
    const result = priceSavedUnpaidOrder(source, [dish], [group]);
    expect(result).toMatchObject({ subtotal: 200, discountAmount: 50, taxAmount: 7.5, totalAmount: 158, roundOffAmount: 0.5 });
    expect(result.items[1].snapshot).toMatchObject({ taxGroupId: group.id, lineTax: 750 });
    expect(source.items[1].snapshot?.lineTax).toBe(1000);
  });
  it('does not charge modifier extras twice', () => {
    const source = order(); source.items[1].modifiers = [{ groupId: 'extras', groupName: 'Extras', optionId: 'cheese', optionName: 'Cheese', priceDelta: 20 }];
    expect(priceSavedUnpaidOrder(source, [dish], [group]).totalAmount).toBe(210);
  });
  it('preserves accepted fixed charges and drops them when every dish is cancelled', () => {
    const source = { ...order(), serviceChargeAmount: 10, tipAmount: 5 };
    expect(priceSavedUnpaidOrder(source, [dish], [group]).totalAmount).toBe(225);
    source.items[1].kitchenStatus = 'CANCELLED';
    expect(priceSavedUnpaidOrder(source, [dish], [group])).toMatchObject({ totalAmount: 0, serviceChargeAmount: 0, tipAmount: 0 });
  });
  it('does not reprice a collected or partially collected bill', () => {
    expect(() => priceSavedUnpaidOrder({ ...order(), paymentStatus: 'SUCCESS' }, [dish], [group])).toThrow('collected payments');
    expect(() => priceSavedUnpaidOrder({ ...order(), paymentStatus: 'REFUND_PENDING' } as unknown as Order, [dish], [group])).toThrow('collected payments');
    expect(() => priceSavedUnpaidOrder({ ...order(), paymentAllocationSummary: { collectedPaise: 1, outstandingPaise: 29999 } }, [dish], [group])).toThrow('collected payments');
  });
});
