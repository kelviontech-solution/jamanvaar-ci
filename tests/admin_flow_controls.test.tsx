// @vitest-environment jsdom
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { currentAllocation } from '../cloud/super-admin-web/src/pages/Branches/branchAllocation';
import { viewForBranch, explainHidden, buildContent } from '../cloud/api/src/modules/menu-publications/menu-snapshot';
import { useKioskDraft } from '../apps/restaurant-system/pos-admin/src/components/kiosk/useKioskDraft';
import { useAdminProduct } from '../apps/restaurant-system/pos-admin/src/hooks/useAdminProduct';
import { requestQrLeave } from '../apps/restaurant-system/pos-admin/src/components/qrconsole/useQrUnsavedChanges';
vi.mock('@jamanvaar/database', () => ({ db: { restaurant: { id: 'restaurant-a' } }, KeyValueStore: { get: () => 'branch-a' },KioskConfigurationRepository:{snapshot:()=>({updatedAt:'current-version'})} }));
vi.mock('@jamanvaar/business', () => ({ SessionPersistence: { load: () => ({ userId: 'owner-a' }) } }));
vi.mock('@jamanvaar/ui', () => ({
  Modal: ({ isOpen, title, children, footer }: any) =>
    isOpen ? (
      <section aria-label={title}>
        {children}
        {footer}
      </section>
    ) : null
}));
describe('Actual branch allocation selection', () => {
  it('uses the currently effective revision rather than a cancelled or future override', () => {
    const base = { appCode: 'KIOSK', enabled: false, deviceQuota: 2, disabledFeatures: ['some-feature'], expiresAt: null, cancelledAt: null };
    const now = Date.now();
    const rows = [
      { ...base, revision: 1, effectiveAt: new Date(now - 5000).toISOString() },
      { ...base, revision: 2, effectiveAt: new Date(now + 5000).toISOString() },
      { ...base, revision: 3, cancelledAt: new Date().toISOString(), effectiveAt: new Date(now - 1000).toISOString() }
    ];
    expect(currentAllocation(rows, 'KIOSK', now)).toMatchObject({ revision: 1, enabled: false, deviceQuota: 2, disabledFeatures: ['some-feature'] });
    expect(currentAllocation(rows, 'POS', now)).toBeUndefined();
  });
});
describe('Task links in the real owner router', () => {
  it('opens the exact Operations task without treating query parameters as a page name', () => {
    window.history.replaceState({}, '', '/restaurant-admin/dashboard');
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    function Router() {
      const context = useAdminProduct('restaurant-a', ['POS_ADMIN'], true, ['POS_ADMIN']);
      return (
        <>
          <button
            onClick={() => {
              window.history.replaceState({}, '', '?opsTask=handover');
              context.navigate('POS_ADMIN', 'OPERATIONS_HUB');
            }}
          >
            Handover
          </button>
          <output>{context.page}</output>
        </>
      );
    }
    try {
      act(() => root.render(<Router />));
      act(() => host.querySelector('button')!.click());
      expect(window.location.pathname).toBe('/restaurant-admin/operations');
      expect(new URLSearchParams(window.location.search).get('opsTask')).toBe('handover');
      expect(host.querySelector('output')?.textContent).toBe('OPERATIONS_HUB');
    } finally {
      act(() => root.unmount());
      host.remove();
      window.history.replaceState({}, '', '/');
    }
  });
});
describe('Shared published channel visibility rules', () => {
  const content = buildContent([
    { entityType: 'MENU_CATEGORY', payload: { id: 'cat', name: 'Meals', qrVisible: false } },
    ...['POS', 'KIOSK', 'QR'].map((channel) => ({
      entityType: 'MENU_ITEM',
      payload: { id: channel, name: channel + ' dish', categoryId: 'cat', price: 100, salesChannels: [channel] }
    }))
  ]).content;
  it('does not apply QR category visibility to POS or Kiosk', () => {
    expect(viewForBranch(content, 'branch-a', 'POS').items.map((i) => i.id)).toEqual(['POS']);
    expect(viewForBranch(content, 'branch-a', 'KIOSK').items.map((i) => i.id)).toEqual(['KIOSK']);
    expect(viewForBranch(content, 'branch-a').items).toHaveLength(0);
  });
  it('explains the precise channel restriction', () => {
    expect(explainHidden(content, 'branch-a', 'KIOSK').find((i) => i.itemId === 'POS')?.reason).toBe('Not sold through KIOSK ordering');
  });
});
describe('Kiosk presentation draft recovery and departure choices', () => {
  let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
  const key = 'kiosk-draft:v1:restaurant-a:branch-a:owner-a:appearance';
  function Editor() {
    const [value, setValue] = useState('original');
    const draft = useKioskDraft({ scope: 'appearance', value, dirty: value !== 'original', restore: setValue, discard: () => setValue('original') });
    return (
      <>
        {draft.ui}
        <button onClick={() => setValue('edited')}>Edit</button>
        <output>{value}</output>
      </>
    );
  }
  beforeEach(() => {
    localStorage.clear();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });
  const click = (label: string) =>
    act(() => {
      const button = [...host.querySelectorAll('button')].find((b) => b.textContent === label);
      if (!button) throw Error('Missing ' + label);
      button.click();
    });
  it('keeps editing, saves a scoped draft before leave, and restores the actual edit', async () => {
    act(() => root.render(<Editor />));
    click('Edit');
    let leave!: Promise<boolean>;
    act(() => {
      leave = requestQrLeave();
    });
    click('Keep editing');
    expect(await leave).toBe(false);
    act(() => {
      leave = requestQrLeave();
    });
    click('Save draft & leave');
    expect(await leave).toBe(true);
    expect(JSON.parse(localStorage.getItem(key)!).value).toBe('edited');
    act(() => root.render(<Editor key="restored" />));
    expect(host.textContent).toContain('Restore');
    click('Restore preview');
    expect(host.querySelector('output')?.textContent).toBe('edited');
  });
  it('discards explicitly without retaining a draft', async () => {
    act(() => root.render(<Editor />));
    click('Edit');
    let leave!: Promise<boolean>;
    act(() => {
      leave = requestQrLeave();
    });
    click('Discard changes');
    expect(await leave).toBe(true);
    expect(localStorage.getItem(key)).toBeNull();
    expect(host.querySelector('output')?.textContent).toBe('original');
  });
  it('keeps current settings when a malformed draft cannot fit the editor',()=>{
    localStorage.setItem(key,JSON.stringify({value:{bad:'unexpected shape'}}));act(()=>root.render(<Editor/>));
    expect(host.textContent).toContain('does not match this editor');expect(host.querySelector('output')?.textContent).toBe('original');expect(host.querySelector('[aria-label="Restore your saved draft?"]')).toBeNull();
  });
});
