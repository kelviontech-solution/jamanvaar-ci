// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GuestAssistanceStrip } from '../packages/ui/src/GuestAssistanceStrip';
import { usePosStore } from '../apps/restaurant-system/pos/src/store/posStore';
import { db } from '@jamanvaar/database';

let container: HTMLDivElement, root: Root;
beforeEach(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => {act(() => root.unmount());container.remove();vi.useRealTimers();});
const render = (node: React.ReactNode) => act(() => root.render(node));
const button = (text: string) => [...container.querySelectorAll('button')].find(b => b.textContent?.includes(text))!;
describe('Guest assistance preserves staff workflow', () => {
  it('does not take payment focus or create a modal, and accepts explicitly', () => {
    const accept = vi.fn();
    render(<><input aria-label="Cash received" /><GuestAssistanceStrip id="request-1" title="Table 2 needs help" message="Water please" waiting={1} onAccept={accept} /></>);
    container.querySelector('input')!.focus();
    expect(document.activeElement).toBe(container.querySelector('input')!);
    expect(container.querySelector('[role=alertdialog]')).toBeNull();
    act(() => button('Accept').click());
    expect(accept).toHaveBeenCalledTimes(1);
  });
  it('reminds after one minute without accepting the request', () => {
    vi.useFakeTimers();
    const accept = vi.fn();
    render(<GuestAssistanceStrip id="request-2" title="Guest help" message="Water" waiting={0} onAccept={accept} />);
    act(() => button('Remind in 1 min').click());
    expect(container.querySelector('[aria-label="Guest assistance"]')).toBeNull();
    act(() => vi.advanceTimersByTime(60000));
    expect(container.querySelector('[aria-label="Guest assistance"]')).toBeTruthy();
    expect(accept).not.toHaveBeenCalled();
  });
});
describe('Cash requires a register shift', () => {
  beforeEach(() => {
    db.resetToDefaultSeed(); db.shifts = []; localStorage.clear();
    usePosStore.getState().clearCart();
    usePosStore.setState({runningOrderId:null, selectedTable:null, selectedCustomer:null, isInstantBillProcessing:false});
    usePosStore.getState().addItemToCart(db.menuItems[0]);
  });
  it('blocks collection without creating an order or clearing the cart', () => {
    const ids = db.orders.map(o => o.id), cart = usePosStore.getState().cart;
    expect(() => usePosStore.getState().completePayment('CASH')).toThrow('Open a cash shift');
    expect(db.orders.map(o => o.id)).toEqual(ids);
    expect(usePosStore.getState().cart).toEqual(cart);
  });
  it('takes Instant Bill to shift setup and preserves the order', async () => {
    const ids = db.orders.map(o => o.id), cart = usePosStore.getState().cart;
    expect(await usePosStore.getState().executeInstantBill('CASH')).toBeNull();
    expect(usePosStore.getState().activeTab).toBe('SHIFTS');
    expect(db.orders.map(o => o.id)).toEqual(ids);
    expect(usePosStore.getState().cart).toEqual(cart);
  });
});
