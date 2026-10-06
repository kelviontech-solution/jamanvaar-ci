// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { ItemModal } from '../apps/restaurant-system/pos-admin/src/components/ItemModal';
import type { Category, MenuItem } from '@jamanvaar/types';

/**
 * Restaurant Admin's dish editor reverted a name a second after it was typed: the screen re-renders on a
 * 2-second poll, handing the modal fresh object identities for the same dish and category list, and the
 * form's load effect re-ran and overwrote what the person had typed. The modal must keep its typed values
 * across those re-renders, and only load a dish once per time it is opened.
 */
const category: Category = { id: 'cat-1', name: 'Starters', sortOrder: 1, isActive: true } as Category;
const dish = (name: string): MenuItem =>
  ({ id: 'dish-1', categoryId: 'cat-1', name, sku: 'SKU-1', price: 120, dietaryType: 'VEG', spiceLevel: 'NONE', kitchenStation: 'Main Kitchen', isAvailable: true, isPopular: false, isFeatured: false, modifierGroupIds: [], tags: [], updatedAt: '2026-10-01T00:00:00.000Z' }) as unknown as MenuItem;

let container: HTMLDivElement;
let root: Root | null = null;

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
});

function renderModal(props: { isOpen: boolean; itemToEdit: MenuItem | null; categories: Category[] }) {
  const element = React.createElement(ItemModal, { ...props, onClose: () => undefined, onSaved: () => undefined });
  act(() => root!.render(element));
}

function nameInput(): HTMLInputElement {
  return document.querySelector('input[placeholder="e.g. Paneer Butter Masala"]') as HTMLInputElement;
}

function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('dish editor keeps what the person typed across the 2-second re-render', () => {
  it('a typed name survives a re-render that passes new object identities for the same dish', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    renderModal({ isOpen: true, itemToEdit: dish('Paneer Tikka'), categories: [category] });
    expect(nameInput().value).toBe('Paneer Tikka');

    type(nameInput(), 'Paneer Tikka Angara');
    expect(nameInput().value).toBe('Paneer Tikka Angara');

    // The screen's poll re-renders with copies of the same dish and categories.
    renderModal({ isOpen: true, itemToEdit: dish('Paneer Tikka'), categories: [{ ...category }] });
    expect(nameInput().value).toBe('Paneer Tikka Angara');
  });

  it('opening a different dish loads that dish, and reopening the same one later loads it fresh', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    renderModal({ isOpen: true, itemToEdit: dish('Paneer Tikka'), categories: [category] });
    renderModal({ isOpen: false, itemToEdit: dish('Paneer Tikka'), categories: [category] });
    renderModal({ isOpen: true, itemToEdit: { ...dish('Paneer Tikka'), name: 'Saved Elsewhere' } as MenuItem, categories: [category] });
    expect(nameInput().value).toBe('Saved Elsewhere');
  });
});
