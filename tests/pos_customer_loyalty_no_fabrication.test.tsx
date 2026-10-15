// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { db, KeyValueStore } from '@jamanvaar/database';
import { PosCustomersView } from '../apps/restaurant-system/pos/src/components/customers/PosCustomersView';
import { usePosStore } from '../apps/restaurant-system/pos/src/store/posStore';

/**
 * security-audit MEDIUM pos-loyalty-01: the "Welcome Loyalty Points" field on this screen used
 * to let a cashier assign ANY numeric points balance to a brand-new customer, with no cap or
 * manager approval -- and that balance became real, server-accepted QR-ordering discount value.
 * The field is gone; a new customer now only ever gets the repository's own standard welcome
 * bonus, same as every other creation path in the app.
 */

let root: Root | undefined;
let container: HTMLDivElement | undefined;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.clear();
  KeyValueStore.reset();
  db.resetToDefaultSeed();
  db.customerAccounts = [];
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes(text))!;
const nativeInputValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
const setInputValue = (input: HTMLInputElement, value: string) => {
  nativeInputValueSetter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

describe('PosCustomersView cannot fabricate a loyalty-points balance on customer creation', () => {
  it('has no free-text points field on the create-customer form at all', () => {
    usePosStore.setState({ currentUser: { id: 'usr-cashier-1', fullName: 'Amit Dave', roleId: 'role-cashier' } as never });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root!.render(<PosCustomersView />));

    act(() => button('+ New Customer').click());

    expect(document.body.textContent).not.toContain('Welcome Loyalty Points');
    expect(document.querySelector('input[type=number]')).toBeNull();
  });

  it('a new customer created here gets only the repository default welcome bonus, never an attacker-chosen amount', () => {
    usePosStore.setState({ currentUser: { id: 'usr-cashier-1', fullName: 'Amit Dave', roleId: 'role-cashier' } as never });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root!.render(<PosCustomersView />));

    act(() => button('+ New Customer').click());
    const phoneInput = document.querySelector<HTMLInputElement>('input[type=tel]')!;
    act(() => setInputValue(phoneInput, '9876500000'));
    act(() => button('Save & Attach to Order').click());

    const created = db.customerAccounts.find((c) => c.phone === '9876500000');
    expect(created).toBeDefined();
    expect(created!.loyaltyPoints).toBe(50); // CustomerRepository.createCustomer's own default, not an attacker-chosen value
  });
});
