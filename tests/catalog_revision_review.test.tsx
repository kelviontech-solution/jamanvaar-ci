// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, MenuItemSync, CategorySync, ModifierGroupSync, TaxGroupSync } from '@jamanvaar/database';
import { catalogRevisionScope } from '@jamanvaar/sync';
import { MenuSyncReview } from '../apps/restaurant-system/pos-admin/src/components/menu/MenuSyncReview';
vi.mock('@jamanvaar/sync', async original => ({ ...await original<typeof import('@jamanvaar/sync')>(), syncMenuCatalog: vi.fn(async () => undefined) }));
let host: HTMLDivElement, root: Root;
const scope = () => catalogRevisionScope('MENU_ITEM');
beforeEach(() => {
  localStorage.clear();
  MenuItemSync.reset(); CategorySync.reset(); ModifierGroupSync.reset(); TaxGroupSync.reset();
  db.menuItems = [];
  MenuItemSync.applyRemote({ id: 'review-dish', name: 'Thepla', price: 70, updatedAt: '2026-10-01T00:00:00Z' }, { scope: scope(), syncVersion: 1 });
  MenuItemSync.stampChanges(); db.menuItems[0].price = 90; MenuItemSync.stampChanges();
  MenuItemSync.applyRemote({ id: 'review-dish', name: 'Thepla', price: 80, updatedAt: '2026-10-01T00:00:00Z' }, { scope: scope(), syncVersion: 2 });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  act(() => root.render(<MenuSyncReview />));
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.clearAllMocks(); });
describe('catalog conflict comparison', () => {
  it('shows both prices and preserves local work until an explicit choice', () => {
    expect(host.textContent).toContain('1 menu change needs review');
    expect(host.textContent).toContain('₹90.00'); expect(host.textContent).toContain('₹80.00');
    expect(db.menuItems[0].price).toBe(90);
  });
  it('uses the reviewed server revision when the administrator keeps their edit', async () => {
    await act(async () => { (Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Keep my edit and sync')!).click(); });
    expect(MenuItemSync.getConflicts(scope())).toEqual([]);
    expect(MenuItemSync.collectSyncRecords(scope())[0]).toMatchObject({ baseSyncVersion: 2, payload: { price: 90 } });
  });
  it('discards only the reviewed local edit when the published version is chosen', async () => {
    await act(async () => { (Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Use published version')!).click(); });
    expect(db.menuItems[0].price).toBe(80);
    expect(MenuItemSync.collectSyncRecords(scope())).toEqual([]);
  });
});
