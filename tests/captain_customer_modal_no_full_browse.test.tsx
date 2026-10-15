// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { captainDb, KeyValueStore } from '@jamanvaar/database';
import { CaptainCustomerModal } from '../apps/restaurant-system/captain/src/components/customers/CaptainCustomerModal';
import { useCaptainStore } from '../apps/restaurant-system/captain/src/store/captainStore';

/**
 * security-audit LOW captain-crm-01: this modal used to list every guest the restaurant has
 * ever served -- name, phone, loyalty points -- the moment it opened, with no search needed.
 * CUSTOMER stays a restaurant-wide shared resource on purpose (see branch-entity-scope.ts's own
 * comment: a guest's loyalty history is meant to follow them across branches, not reset at each
 * one), so the fix is narrower than branch-scoping the data -- a waiter can still look up any
 * guest by phone or name, they just can no longer browse the whole CRM with an empty search box.
 */

let root: Root | undefined;
let container: HTMLDivElement | undefined;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.clear();
  KeyValueStore.reset();
  captainDb.resetToDefaultSeed();
  captainDb.customerAccounts = [
    { phone: '9876500001', name: 'Priya Sharma', loyaltyPoints: 50, tags: [], favoriteItemIds: [], recentOrderIds: [], totalVisits: 0, totalSpend: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { phone: '9876500002', name: 'Rahul Mehta', loyaltyPoints: 120, tags: [], favoriteItemIds: [], recentOrderIds: [], totalVisits: 0, totalSpend: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  ] as never;
  useCaptainStore.setState({ isCustomerModalOpen: true, attachedCustomer: null });
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

function render() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(<CaptainCustomerModal />));
}

const nativeInputValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
const typeInSearch = (value: string) => {
  const input = document.querySelector<HTMLInputElement>('input[type=tel]')!;
  nativeInputValueSetter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

describe('CaptainCustomerModal does not browse the full restaurant-wide customer list', () => {
  it('shows no guest records at all with an empty search box', () => {
    render();
    expect(document.body.textContent).not.toContain('Priya Sharma');
    expect(document.body.textContent).not.toContain('Rahul Mehta');
    expect(document.body.textContent).toContain('Type a phone number or name to find a guest');
  });

  it('finds a specific guest once the waiter actually searches for them', () => {
    render();
    act(() => typeInSearch('9876500001'));
    expect(document.body.textContent).toContain('Priya Sharma');
    expect(document.body.textContent).not.toContain('Rahul Mehta');
  });

  it('a name search still works the same way', () => {
    render();
    act(() => typeInSearch('Rahul'));
    expect(document.body.textContent).toContain('Rahul Mehta');
    expect(document.body.textContent).not.toContain('Priya Sharma');
  });

  it('clearing the search box goes back to showing nothing, not the full list', () => {
    render();
    act(() => typeInSearch('Rahul'));
    expect(document.body.textContent).toContain('Rahul Mehta');
    act(() => typeInSearch(''));
    expect(document.body.textContent).not.toContain('Priya Sharma');
    expect(document.body.textContent).not.toContain('Rahul Mehta');
  });
});
