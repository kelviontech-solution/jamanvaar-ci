// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { db } from '@jamanvaar/database';
import { usePosStore } from '../apps/restaurant-system/pos/src/store/posStore';
import { PosCustomizationModal } from '../apps/restaurant-system/pos/src/components/menu/PosCustomizationModal';
import { KioskSearchKeyboard } from '../apps/kiosk-system/kiosk-user/src/KioskSearchKeyboard';
import type { ModifierGroup, MenuItem } from '@jamanvaar/types';
let container: HTMLDivElement, root: Root;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  db.resetToDefaultSeed();
  usePosStore.getState().clearCart();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
const button = (text: string) => [...container.querySelectorAll('button')].find((button) => button.textContent?.includes(text))!;
const group = (available = true) =>
  ({
    id: 'size',
    name: 'Size',
    isRequired: true,
    minSelections: 1,
    maxSelections: 1,
    sortOrder: 0,
    options: [
      { id: 'small', name: 'Small', priceDelta: 0, isAvailable: available, isDefault: false, sortOrder: 0 },
      { id: 'large', name: 'Large', priceDelta: 20, isAvailable: available, isDefault: false, sortOrder: 1 }
    ]
  }) as ModifierGroup;
describe('Modifier selection and touch search', () => {
  it('requires a valid option and resets choices when another dish opens', () => {
    db.modifierGroups = [group()];
    const dish = { ...db.menuItems[0], id: 'custom-dish', modifierGroupIds: ['size'] } as MenuItem;
    act(() => usePosStore.getState().setCustomizingItem(dish));
    act(() => root.render(<PosCustomizationModal />));
    expect(button('Add to Order').disabled).toBe(true);
    act(() => button('Large').click());
    expect(button('Add to Order').disabled).toBe(false);
    act(() => usePosStore.getState().setCustomizingItem({ ...dish, id: 'another-dish' }));
    expect(button('Add to Order').disabled).toBe(true);
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(usePosStore.getState().customizingItem).toBeNull();
  });
  it('cannot bypass a required group when every option is sold out', () => {
    db.modifierGroups = [group(false)];
    act(() => usePosStore.getState().setCustomizingItem({ ...db.menuItems[0], modifierGroupIds: ['size'] }));
    act(() => root.render(<PosCustomizationModal />));
    expect(button('Add to Order').disabled).toBe(true);
    expect(container.textContent).toContain('no options available');
  });
  it('types and corrects a dish search without a physical keyboard', () => {
    function Wrapper() {
      const [value, setValue] = useState('');
      return <KioskSearchKeyboard title="Search dishes" value={value} onChange={setValue} onClose={() => undefined} />;
    }
    act(() => root.render(<Wrapper />));
    for (const key of 'tea') act(() => container.querySelector<HTMLButtonElement>(`button[aria-label="Search key ${key}"]`)!.click());
    expect(container.querySelector('input')!.value).toBe('tea');
    expect(container.querySelector('input')!.readOnly).toBe(true);
    act(() => button('Delete').click());
    expect(container.querySelector('input')!.value).toBe('te');
    act(() => button('Clear').click());
    expect(container.querySelector('input')!.value).toBe('');
  });
});
