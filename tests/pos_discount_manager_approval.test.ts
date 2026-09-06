import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@jamanvaar/database';
import { usePosStore } from '../apps/restaurant-system/pos/src/store/posStore';

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
