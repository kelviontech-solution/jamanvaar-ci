// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DisplayPreferences, initializeDisplayPreferences } from '../packages/ui/src/DisplayPreferences';
import {
  configureDisplayButtonScope, displayButtonPreferenceKey, displayButtonSnapshot,
  notifyDisplayPreferenceScopeChange, saveDisplayButtonVisibility
} from '../packages/ui/src/displayButtonPreference';
import { StaffLanguagePicker } from '../packages/ui/src/StaffLanguage';

let host: HTMLDivElement;
let root: Root;
const configure = (application = 'pos') => configureDisplayButtonScope({ application, restaurantKey: 'restaurant' });
const render = (children = <><DisplayPreferences /><DisplayPreferences compact /></>) => act(() => root.render(children));
const toggle = () => host.querySelector<HTMLButtonElement>('[role="switch"]')!;
const floating = () => host.querySelector('.jv-display-control');
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  window.history.replaceState({}, '', '/');
  localStorage.setItem('restaurant', 'tenant-a');
  configure();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount()); host.remove(); vi.restoreAllMocks();
});

describe('device-local Display Button settings', () => {
  it('defaults on and provides a labelled setting and the existing floating workflow', () => {
    render();
    expect(toggle().getAttribute('aria-label')).toBe('Display Button');
    expect(toggle().getAttribute('aria-checked')).toBe('true');
    expect(host.textContent).toContain('Show or hide the floating Display button on this screen.');
    expect(floating()?.querySelector('summary')?.textContent).toBe('Display');
  });

  it('removes the floating control completely when off and restores it when on', () => {
    render();
    act(() => toggle().click());
    expect(floating()).toBeNull();
    expect(toggle().getAttribute('aria-checked')).toBe('false');
    act(() => toggle().click());
    expect(floating()).not.toBeNull();
  });

  it('persists off across component remounts and application initialization', () => {
    render(); act(() => toggle().click());
    act(() => root.unmount()); root = createRoot(host);
    initializeDisplayPreferences({ application: 'pos', restaurantKey: 'restaurant' });
    render();
    expect(toggle().getAttribute('aria-checked')).toBe('false');
    expect(floating()).toBeNull();
  });

  it.each([[true,true],[true,false],[false,true],[false,false]])('keeps POS=%s and Restaurant Admin=%s independent', (pos, admin) => {
    saveDisplayButtonVisibility(pos);
    configure('restaurant-admin'); saveDisplayButtonVisibility(admin);
    render(); expect(Boolean(floating())).toBe(admin);
    act(() => configure('pos')); expect(Boolean(floating())).toBe(pos);
  });

  it('does not leak a saved preference into another restaurant', () => {
    render(); act(() => toggle().click());
    const firstKey = displayButtonPreferenceKey();
    act(() => { localStorage.setItem('restaurant', 'tenant-b'); notifyDisplayPreferenceScopeChange(); });
    expect(floating()).not.toBeNull();
    expect(displayButtonPreferenceKey()).not.toBe(firstKey);
    act(() => { localStorage.setItem('restaurant', 'tenant-a'); notifyDisplayPreferenceScopeChange(); });
    expect(floating()).toBeNull();
  });

  it('keeps all supported applications independent even on the same origin and root path', () => {
    const applications = ['pos','restaurant-admin','kiosk-admin','qr-admin','kiosk-user','captain','kds'];
    const keys = applications.map(application => { configure(application); return displayButtonPreferenceKey(); });
    expect(new Set(keys).size).toBe(applications.length);
    configure('pos'); saveDisplayButtonVisibility(false);
    for (const application of applications.slice(1)) {
      configure(application); expect(displayButtonSnapshot().endsWith(':on')).toBe(true);
    }
  });

  it('follows product navigation without applying another product preference', () => {
    configureDisplayButtonScope({ application: () => location.pathname.startsWith('/kiosk-admin') ? 'kiosk-admin' : 'restaurant-admin', restaurantKey: 'restaurant' });
    render(); act(() => toggle().click());
    act(() => { history.pushState({}, '', '/kiosk-admin/settings'); notifyDisplayPreferenceScopeChange(); });
    expect(floating()).not.toBeNull();
    act(() => { history.pushState({}, '', '/restaurant-admin/settings'); window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(floating()).toBeNull();
  });

  it('updates when another window changes this scope', () => {
    render();
    act(() => { localStorage.setItem(displayButtonPreferenceKey(), 'off'); window.dispatchEvent(new StorageEvent('storage')); });
    expect(floating()).toBeNull(); expect(toggle().getAttribute('aria-checked')).toBe('false');
  });

  it('preserves saved display presets and keeps settings and floating selectors synchronized', () => {
    localStorage.setItem('jamanvaar-display:app', 'large'); initializeDisplayPreferences(); render();
    expect(document.documentElement.dataset.jvDisplay).toBe('large');
    const select = host.querySelector<HTMLSelectElement>('.jv-display-control select')!;
    act(() => { select.value = 'contrast'; select.dispatchEvent(new Event('change', {bubbles:true})); });
    expect(document.documentElement.dataset.jvDisplay).toBe('contrast');
    expect([...host.querySelectorAll('select')].every(e => e.value === 'contrast')).toBe(true);
    act(() => toggle().click());
    expect(document.documentElement.dataset.jvDisplay).toBe('contrast');
  });

  it('shows load failures and permits retry without showing a false saved state', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw Error('Storage blocked'); });
    render(); expect(toggle().disabled).toBe(true);
    expect(host.textContent).toContain('Could not load');
    get.mockRestore();
    act(() => [...host.querySelectorAll('button')].find(e => e.textContent === 'Try again')!.click());
    expect(toggle().disabled).toBe(false); expect(host.textContent).not.toContain('Could not load');
  });

  it('preserves the existing in-session display mode when optional preset storage is unavailable', () => {
    initializeDisplayPreferences(); render();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('Storage blocked'); });
    const select = host.querySelector<HTMLSelectElement>('.jv-display-control select')!;
    act(() => { select.value='large'; select.dispatchEvent(new Event('change',{bubbles:true})); });
    expect(document.documentElement.dataset.jvDisplay).toBe('large');
    expect([...host.querySelectorAll('select')].every(e=>e.value==='large')).toBe(true);
  });

  it('keeps the saved value and floating button on a failed write, then allows retry', () => {
    render();
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('Quota exceeded'); });
    act(() => toggle().click());
    expect(toggle().getAttribute('aria-checked')).toBe('true'); expect(floating()).not.toBeNull();
    expect(host.textContent).toContain('Could not save');
    set.mockRestore(); act(() => toggle().click());
    expect(floating()).toBeNull(); expect(host.textContent).not.toContain('Could not save');
  });

  it('refreshes identity from the existing device subscription and cleans up on unmount', () => {
    let listener = () => {};
    const unsubscribe = vi.fn();
    configureDisplayButtonScope({ application:'pos',restaurantKey:'restaurant',subscribe:cb=>{listener=cb;return unsubscribe;} });
    render(); act(() => toggle().click());
    act(() => { localStorage.setItem('restaurant','tenant-b'); listener(); });
    expect(floating()).not.toBeNull();
    render(<div />); expect(unsubscribe).toHaveBeenCalled();
  });
});

describe('POS sidebar language picker', () => {
  it('retains the same three languages, persisted choice, and shared language updates', () => {
    render(<><StaffLanguagePicker variant="sidebar" /><StaffLanguagePicker /></>);
    const selects = [...host.querySelectorAll('select')];
    expect([...selects[0].options].map(o=>o.value)).toEqual(['en','gu','hi']);
    act(() => { selects[0].value='gu'; selects[0].dispatchEvent(new Event('change',{bubbles:true})); });
    expect(localStorage.getItem('jamanvaar_staff_language')).toBe('gu'); expect(selects[1].value).toBe('gu');
    expect(selects[0].getAttribute('aria-label')).toBe('Staff interface language');
  });
});
