import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { alertWaiter, isMyTable, isVibrationOn, setVibrationOn, vibrationPattern } from '../apps/restaurant-system/captain/src/alerts';
import { connectionLevel } from '@jamanvaar/sync';

const SYSTEM = join(__dirname, '../apps/restaurant-system');
const read = (p: string) => readFileSync(join(SYSTEM, p), 'utf8');

describe('the Captain and KDS install like apps and open without signal', () => {
  for (const app of ['captain', 'kds']) {
    describe(app, () => {
      const manifest = JSON.parse(read(`${app}/public/manifest.webmanifest`));

      it('has a manifest a phone can install from: name, standalone display, a start page and real icons', () => {
        expect(manifest.name).toMatch(/JAMANVAAR/);
        expect(manifest.short_name.length).toBeGreaterThan(0);
        expect(manifest.display).toBe('standalone');
        expect(manifest.start_url).toBeTruthy();
        const sizes = manifest.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}:${i.purpose}`);
        expect(sizes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']));
        for (const icon of manifest.icons) expect(existsSync(join(SYSTEM, app, 'public', icon.src)), icon.src).toBe(true);
      });

      it('links the manifest, the theme colour and the home-screen icon from the page', () => {
        const html = read(`${app}/index.html`);
        expect(html).toContain('rel="manifest"');
        expect(html).toContain('name="theme-color"');
        expect(html).toContain('rel="apple-touch-icon"');
      });

      it('registers the service worker in production builds only', () => {
        const main = read(`${app}/src/main.tsx`);
        expect(main).toMatch(/import\.meta\.env\.PROD[\s\S]{0,120}serviceWorker/);
        expect(main).toContain("register('./sw.js')");
      });

      it('the service worker caches only this app\'s own files: never the API, never a write', () => {
        const sw = read(`${app}/public/sw.js`);
        expect(sw).toMatch(/req\.method !== 'GET'\) return/);
        expect(sw).toMatch(/url\.origin !== self\.location\.origin\) return/);
        expect(sw).not.toMatch(/\/api\//);
      });
    });
  }
});

describe('a waiter is told when food is ready, even with the phone in a pocket', () => {
  const memory = new Map<string, string>();
  const g = globalThis as unknown as { localStorage: unknown; navigator: { vibrate?: (p: number[]) => boolean } };
  let savedStorage: unknown;
  let savedNavigator: unknown;
  let buzz: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    savedStorage = g.localStorage;
    savedNavigator = g.navigator;
    memory.clear();
    g.localStorage = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v), removeItem: (k: string) => void memory.delete(k) };
    buzz = vi.fn(() => true);
    Object.defineProperty(globalThis, 'navigator', { value: { vibrate: buzz, onLine: true }, configurable: true });
  });
  afterEach(() => {
    g.localStorage = savedStorage;
    Object.defineProperty(globalThis, 'navigator', { value: savedNavigator, configurable: true });
  });

  it('food ready buzzes longest, and a message the shortest', () => {
    expect(vibrationPattern('FOOD_READY').length).toBeGreaterThan(vibrationPattern('GUEST_HELP').length);
    expect(vibrationPattern('GUEST_HELP').length).toBeGreaterThan(vibrationPattern('MESSAGE').length);
  });

  it('buzzes by default, and stays still once the waiter turns vibration off', () => {
    expect(isVibrationOn()).toBe(true);
    alertWaiter('FOOD_READY');
    expect(buzz).toHaveBeenCalledWith(vibrationPattern('FOOD_READY'));

    buzz.mockClear();
    setVibrationOn(false);
    alertWaiter('FOOD_READY');
    expect(buzz).not.toHaveBeenCalled();
  });

  it('never throws on a phone with no vibration motor', () => {
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
    expect(() => alertWaiter('MESSAGE')).not.toThrow();
  });

  it('alerts for the waiter\'s own tables and for tables nobody owns, not for another waiter\'s', () => {
    expect(isMyTable({ openedById: 'me' }, 'me')).toBe(true);
    expect(isMyTable({}, 'me')).toBe(true);
    expect(isMyTable(undefined, 'me')).toBe(true);
    expect(isMyTable({ openedById: 'someone-else' }, 'me')).toBe(false);
  });
});

describe('the connection light tells the truth', () => {
  it('is live while the server answers, slow after a quiet spell, lost after a long one or when offline', () => {
    expect(connectionLevel(3000, true, 60000)).toBe('ok');
    expect(connectionLevel(20000, true, 60000)).toBe('slow');
    expect(connectionLevel(60000, true, 90000)).toBe('lost');
    expect(connectionLevel(500, false, 90000)).toBe('lost');
  });
});

describe('the screens fit a phone', () => {
  it('Restaurant Admin\'s menu is a drawer on small screens with a button to open it, and full width content', () => {
    const app = read('pos-admin/src/App.tsx');
    expect(app).toMatch(/aria-label="Main menu"/);
    expect(app).toMatch(/lg:static[\s\S]{0,60}lg:translate-x-0/);
    expect(app).toContain('onOpenNav={() => setNavOpen(true)}');
    expect(app).toMatch(/setActiveTab\(nav\.id as PosAdminTab\); setNavOpen\(false\)/);
    const header = read('pos-admin/src/components/header/PosAdminHeader.tsx');
    expect(header).toContain('aria-label="Open menu"');
    expect(header).toMatch(/lg:hidden[^"]*"[\s\S]{0,200}aria-label="Open menu"/);
  });

  it('the Captain\'s connection badge is the real server link, not the same-browser mesh', () => {
    const header = read('captain/src/components/layout/CaptainHeader.tsx');
    expect(header).toContain('EndpointResolver.msSinceLastContact()');
    expect(header).not.toMatch(/POS Terminal Link|KDS Kitchen Mesh/);
  });
});
