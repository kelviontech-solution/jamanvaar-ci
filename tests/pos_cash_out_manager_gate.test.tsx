// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { db, ShiftRepository, KeyValueStore } from '@jamanvaar/database';
import { PosShiftAndCashView } from '../apps/restaurant-system/pos/src/components/shift/PosShiftAndCashView';
import { usePosStore } from '../apps/restaurant-system/pos/src/store/posStore';

/**
 * security-audit MEDIUM pos-cashout-01: PosCashDrawerModal already gates a cashier's Cash Out
 * behind a manager approval (security-audit MED-06); this screen's own, separate Cash Movement
 * form called the exact same ShiftRepository.addCashMovement with no such gate at all. These
 * tests prove the gate now applies here too, and that it still doesn't get in the way of a
 * manager's own Cash Out, or of Cash In (which was never gated, by design).
 */

let root: Root | undefined;
let container: HTMLDivElement | undefined;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.clear();
  KeyValueStore.reset();
  db.resetToDefaultSeed();
  db.shifts = [];
  db.cashMovements = [];
  usePosStore.setState({ pendingOverride: null });
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes(text))!;
const amountInput = () => document.querySelector<HTMLInputElement>('input[type=number]')!;
const nativeInputValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
const setAmount = (value: string) => {
  const input = amountInput();
  nativeInputValueSetter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

function renderView(shift: ReturnType<typeof ShiftRepository.openShift>, user: { id: string; fullName: string; roleId: string }) {
  usePosStore.setState({ currentUser: user as never, posTerminalId: shift.posId });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(<PosShiftAndCashView />));
}

function openCashOutForm() {
  act(() => button('+ Cash Movement').click());
  act(() => button('↑ Cash Out (Paid Out)').click());
}

describe('PosShiftAndCashView Cash Out requires manager approval (security-audit MED-06 parity)', () => {
  it('a plain cashier cannot Cash Out without triggering a manager override', () => {
    const shift = ShiftRepository.openShift('usr-cashier-1', 'Amit Dave', 2000, 'POS-01');
    renderView(shift, { id: 'usr-cashier-1', fullName: 'Amit Dave', roleId: 'role-cashier' });

    openCashOutForm();
    act(() => setAmount('500'));
    act(() => button('Confirm Movement').click());

    // No money has actually moved yet, and a manager override is now pending.
    expect(shift.expectedCash).toBe(2000);
    expect(ShiftRepository.getCashMovements(shift.id)).toHaveLength(0);
    expect(usePosStore.getState().pendingOverride?.action).toBe('MANUAL_CASH_DRAWER');
  });

  it('the Cash Out applies once the pending manager override is approved', () => {
    const shift = ShiftRepository.openShift('usr-cashier-1', 'Amit Dave', 2000, 'POS-01');
    renderView(shift, { id: 'usr-cashier-1', fullName: 'Amit Dave', roleId: 'role-cashier' });

    openCashOutForm();
    act(() => setAmount('500'));
    act(() => button('Confirm Movement').click());

    const pending = usePosStore.getState().pendingOverride!;
    act(() => { void pending.onApprove('Priya Manager'); });

    expect(shift.expectedCash).toBe(1500);
    expect(ShiftRepository.getCashMovements(shift.id)).toHaveLength(1);
  });

  it('a manager (or above) can Cash Out directly, with no override prompt', () => {
    const shift = ShiftRepository.openShift('usr-mgr-1', 'Priya Manager', 2000, 'POS-01');
    renderView(shift, { id: 'usr-mgr-1', fullName: 'Priya Manager', roleId: 'role-manager' });

    openCashOutForm();
    act(() => setAmount('500'));
    act(() => button('Confirm Movement').click());

    expect(shift.expectedCash).toBe(1500);
    expect(usePosStore.getState().pendingOverride).toBeNull();
  });

  it('Cash In still needs no manager approval -- only Cash Out does', () => {
    const shift = ShiftRepository.openShift('usr-cashier-1', 'Amit Dave', 2000, 'POS-01');
    renderView(shift, { id: 'usr-cashier-1', fullName: 'Amit Dave', roleId: 'role-cashier' });

    act(() => button('+ Cash Movement').click());
    // CASH_IN is the form's default movement type -- no need to toggle it.
    act(() => setAmount('300'));
    act(() => button('Confirm Movement').click());

    expect(shift.expectedCash).toBe(2300);
    expect(usePosStore.getState().pendingOverride).toBeNull();
  });
});
