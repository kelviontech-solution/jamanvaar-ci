// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@jamanvaar/database';
import { usePosStore } from '../apps/restaurant-system/pos/src/store/posStore';
import { PosDiscountModal } from '../apps/restaurant-system/pos/src/components/cart/PosDiscountModal';
import { PosPaymentModal } from '../apps/restaurant-system/pos/src/components/payment/PosPaymentModal';
import { CustomerRepository } from '@jamanvaar/database';

let root: Root, container: HTMLDivElement;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  db.resetToDefaultSeed(); usePosStore.getState().clearCart(); usePosStore.getState().closeOverrideModal();
  usePosStore.setState({ currentUser: { id: 'cashier', fullName: 'Cashier', roleId: 'role-cashier' } as any });
  usePosStore.getState().addItemToCart(db.menuItems[0]);
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
const button = (name: string) => [...container.querySelectorAll('button')].find(b => b.textContent?.trim() === name)!;
describe('discount checkout dialog', () => {
  it('a zero-payable reward still exposes an enabled settlement button', () => {
    const guest = CustomerRepository.createCustomer({ phone: '9000011111', name: 'Free reward guest', loyaltyPoints: 200 });
    CustomerRepository.updateReward('reward-100off', { isActive: true, discountAmount: 10000 });
    CustomerRepository.updateProgramSettings({ earnPoints: 1, perRupeesSpent: 10, enabled: true });
    usePosStore.getState().setSelectedCustomer(guest); usePosStore.getState().selectLoyaltyReward('reward-100off'); usePosStore.getState().setIsPaymentOpen(true);
    act(() => root.render(<PosPaymentModal />));
    const settle = [...container.querySelectorAll('button')].find(b => b.textContent?.includes('CONFIRM & SETTLE'))!;
    expect(settle.disabled).toBe(false); expect(settle.textContent).toContain('₹0');
    act(() => usePosStore.getState().setIsPaymentOpen(false));
  });
  it('blank percentages cannot silently apply a zero discount', () => {
    const close = vi.fn(); act(() => root.render(<PosDiscountModal isOpen onClose={close} />));
    act(() => button('Apply Discount').click()); expect(close).not.toHaveBeenCalled(); expect(container.textContent).toContain('valid discount');
  });
  it('one successful manager approval applies a high discount without asking for another PIN', () => {
    const close = vi.fn(); act(() => root.render(<PosDiscountModal isOpen onClose={close} />));
    act(() => button('50%').click()); act(() => button('Apply Discount').click());
    const pending = usePosStore.getState().pendingOverride!; expect(pending?.action).toBe('HIGH_DISCOUNT');
    expect(usePosStore.getState().cart.discountAmount).toBe(0);
    act(() => { usePosStore.getState().closeOverrideModal(); pending.onApprove('Verified Manager'); });
    expect(usePosStore.getState().cart.discountValue).toBe(50); expect(usePosStore.getState().cart.discountAmount).toBeGreaterThan(0);
    expect(usePosStore.getState().pendingOverride).toBeNull(); expect(close).toHaveBeenCalledOnce();
  });
});
