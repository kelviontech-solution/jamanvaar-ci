import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@jamanvaar/database';
import { usePosStore, isHighDiscount, computeDiscountImpactRupees } from '../apps/restaurant-system/pos/src/store/posStore';

/**
 * SEC-013 regression suite. Before this fix, the >25%/>₹500 manager-approval
 * threshold was checked only inside PosDiscountModal.tsx — a UI component —
 * so calling the store's applyDiscount() directly (as any other code path, or
 * a cashier via devtools on this fully client-side app, could) bypassed it
 * entirely and applied an unlimited discount with no PIN prompt at all.
 */
describe('POS discount manager-approval enforcement (SEC-013)', () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
    usePosStore.getState().clearCart();
    usePosStore.getState().closeOverrideModal();

    const item = db.menuItems[0];
    usePosStore.getState().addItemToCart(item, [], '', 1);
  });

  it('a cashier applying a >25% discount does NOT change the cart immediately — it is held pending manager approval', () => {
    usePosStore.setState({ currentUser: { id: 'u-cashier', roleId: 'role-cashier', fullName: 'Test Cashier' } as any });

    usePosStore.getState().applyDiscount({
      scope: 'BILL',
      type: 'PERCENTAGE',
      value: 50,
      reason: 'Test high discount'
    });

    // Not applied yet — cart discount must still be zero.
    expect(usePosStore.getState().cart.discountAmount).toBe(0);
    expect(usePosStore.getState().pendingOverride).not.toBeNull();
    expect(usePosStore.getState().pendingOverride?.action).toBe('HIGH_DISCOUNT');
  });

  it('a cashier applying a >₹500 fixed discount is also held pending approval', () => {
    usePosStore.setState({ currentUser: { id: 'u-cashier', roleId: 'role-cashier', fullName: 'Test Cashier' } as any });

    usePosStore.getState().applyDiscount({
      scope: 'BILL',
      type: 'FIXED',
      value: 1000,
      reason: 'Test high fixed discount'
    });

    expect(usePosStore.getState().cart.discountAmount).toBe(0);
    expect(usePosStore.getState().pendingOverride?.action).toBe('HIGH_DISCOUNT');
  });

  it('the discount is applied only after the pending override is approved', () => {
    usePosStore.setState({ currentUser: { id: 'u-cashier', roleId: 'role-cashier', fullName: 'Test Cashier' } as any });

    usePosStore.getState().applyDiscount({
      scope: 'BILL',
      type: 'PERCENTAGE',
      value: 50,
      reason: 'Test high discount'
    });

    const pending = usePosStore.getState().pendingOverride;
    expect(pending).not.toBeNull();

    // Simulate a manager successfully authorizing via ManagerOverrideModal.
    pending!.onApprove('Test Manager');

    expect(usePosStore.getState().cart.discountAmount).toBeGreaterThan(0);
  });

  it('a manager/owner can apply a high discount directly without triggering an override', () => {
    usePosStore.setState({ currentUser: { id: 'u-mgr', roleId: 'role-manager', fullName: 'Test Manager' } as any });

    usePosStore.getState().applyDiscount({
      scope: 'BILL',
      type: 'PERCENTAGE',
      value: 50,
      reason: 'Manager self-approved discount'
    });

    expect(usePosStore.getState().pendingOverride).toBeNull();
    expect(usePosStore.getState().cart.discountAmount).toBeGreaterThan(0);
  });

  it('a discount at or below the threshold applies immediately for any role', () => {
    usePosStore.setState({ currentUser: { id: 'u-cashier', roleId: 'role-cashier', fullName: 'Test Cashier' } as any });

    usePosStore.getState().applyDiscount({
      scope: 'BILL',
      type: 'PERCENTAGE',
      value: 10,
      reason: 'Small discount'
    });

    expect(usePosStore.getState().pendingOverride).toBeNull();
    expect(usePosStore.getState().cart.discountAmount).toBeGreaterThan(0);
  });
});

/**
 * MED-08 regression suite. The threshold check used to compare only the raw
 * per-application parameter against >25%/>₹500, so an ITEMS-scope FIXED
 * discount of, say, ₹300 applied to every item in the cart never triggered
 * approval no matter how many items it hit — the actual bill impact could be
 * ₹300 x N items. computeDiscountImpactRupees/isHighDiscount now sum the real
 * rupee impact across every affected item before comparing to the threshold.
 */
describe('POS discount manager-approval enforcement — aggregate bill impact (MED-08)', () => {
  const cartItems = [
    { cartItemId: 'ci-1', itemTotal: 400 },
    { cartItemId: 'ci-2', itemTotal: 400 },
    { cartItemId: 'ci-3', itemTotal: 400 }
  ] as any;

  it('a per-item FIXED discount that is individually under ₹500 is flagged high once it hits enough items to exceed ₹500 in aggregate', () => {
    expect(
      isHighDiscount({ scope: 'ITEMS', type: 'FIXED', value: 300, itemIds: ['ci-1', 'ci-2', 'ci-3'] }, cartItems)
    ).toBe(true);
    expect(computeDiscountImpactRupees({ scope: 'ITEMS', type: 'FIXED', value: 300, itemIds: ['ci-1', 'ci-2', 'ci-3'] }, cartItems)).toBe(900);
  });

  it('the same per-item value applied to a single item stays under the threshold', () => {
    expect(isHighDiscount({ scope: 'ITEMS', type: 'FIXED', value: 300, itemIds: ['ci-1'] }, cartItems)).toBe(false);
  });

  it('a per-item FIXED discount larger than one item total is capped at that item total when computing impact', () => {
    expect(computeDiscountImpactRupees({ scope: 'ITEMS', type: 'FIXED', value: 1000, itemIds: ['ci-1'] }, cartItems)).toBe(400);
  });

  it('end-to-end: applying a sub-threshold per-item discount to the whole cart is held pending approval, not applied silently', () => {
    usePosStore.setState({ currentUser: { id: 'u-cashier', roleId: 'role-cashier', fullName: 'Test Cashier' } as any });
    usePosStore.getState().clearCart();

    const items = db.menuItems.slice(0, 3);
    items.forEach((item) => usePosStore.getState().addItemToCart(item, [], '', 20));
    const cartItemIds = usePosStore.getState().cart.items.map((ci) => ci.cartItemId);
    expect(cartItemIds.length).toBe(3);

    usePosStore.getState().applyDiscount({
      scope: 'ITEMS',
      type: 'FIXED',
      value: 300,
      reason: 'Split under per-item threshold',
      itemIds: cartItemIds
    });

    expect(usePosStore.getState().cart.discountAmount).toBe(0);
    expect(usePosStore.getState().pendingOverride?.action).toBe('HIGH_DISCOUNT');
  });
});
