import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');
const read = (file: string) => readFileSync(join(root, file), 'utf8');
const APPS = ['apps/restaurant-system/pos', 'apps/restaurant-system/captain', 'apps/restaurant-system/kds', 'apps/restaurant-system/pos-admin', 'apps/kiosk-system/kiosk-user', 'apps/qr-guest', 'cloud/super-admin-web'];

describe('UX baseline every app keeps', () => {
  it.each(APPS)('%s lets people pinch-zoom (no maximum-scale / user-scalable=no)', (app) => {
    const viewport = read(`${app}/index.html`).match(/<meta name="viewport" content="([^"]*)"/)![1];
    expect(viewport).not.toMatch(/user-scalable\s*=\s*(no|0)/);
    expect(viewport).not.toMatch(/maximum-scale/);
  });

  it('keeps the notification live region mounted even when empty, so announcements are not missed', () => {
    const toast = read('packages/ui/src/NotificationToastContainer.tsx');
    expect(toast).not.toMatch(/if \(activeToasts\.length === 0\) return null/);
    expect(toast).toContain('aria-live="polite"');
  });

  it('gives every backdrop dialog a role, an accessible name, Escape-to-cancel, a focus trap and focus return', () => {
    const controls = read('packages/ui/src/FormControls.tsx');
    expect(controls).toContain('role="dialog" aria-modal="true"');
    expect(controls).toContain("aria-labelledby");
    expect(controls).toContain("event.key !== 'Escape'");
    expect(controls).toContain("event.key === 'Tab'");
    expect(controls).toContain('lastFocusOutsideDialog');
  });

  it('applies the 44px touch floor above utility classes so explicit min-h-[40px] cannot defeat it', () => {
    expect(read('packages/ui/src/interaction.css')).toMatch(/\[data-jv-workspace\] :is\(button, \[role="button"\]\)\[class\]/);
    for (const app of ['captain', 'kds']) { const css = read(`apps/restaurant-system/${app}/src/index.css`); expect(css).toContain('[data-jv-workspace] :is(button, select, input:not([type="checkbox"]):not([type="radio"]))[class] { min-height: 44px; }'); }
  });

  it('keeps orange, grey and green text readable on the light surfaces', () => {
    for (const app of ['apps/restaurant-system/pos', 'apps/restaurant-system/captain', 'apps/restaurant-system/kds', 'apps/kiosk-system/kiosk-user']) {
      const cfg = read(`${app}/tailwind.config.js`);
      expect(cfg).toContain("saffronText: '#B04A0B'");
      expect(cfg).toContain("slate: { 500: '#5B6B82' }");
    }
    expect(read('packages/ui/src/interaction.css')).toContain('.bg-emerald-600.text-white { background-color: #047857; }');
  });

  it('shows no garbled text in the cart status label', () => {
    expect(read('apps/restaurant-system/pos/src/components/cart/PosCart.tsx')).toContain("'SAVED · WAITING TO SYNC'");
  });

  it('names the search and amount inputs that had only a placeholder', () => {
    expect(read('apps/restaurant-system/pos/src/components/orders/PosOrdersView.tsx')).toContain('aria-label="Search orders"');
    expect(read('apps/restaurant-system/pos/src/components/bills/PosBillsView.tsx')).toContain('aria-label="Search bills"');
    expect(read('apps/restaurant-system/pos/src/components/customers/PosCustomersView.tsx')).toContain('aria-label="Search customers"');
    expect(read('apps/restaurant-system/pos/src/components/payment/PosPaymentModal.tsx')).toContain('aria-label="Cash received"');
    expect(read('apps/kiosk-system/kiosk-user/src/App.tsx')).toContain('aria-label="Staff PIN"');
  });

  it('gives the touch apps a page heading for screen-reader navigation', () => {
    expect(read('apps/restaurant-system/captain/src/App.tsx')).toContain('<h1 className="sr-only">');
    expect(read('apps/restaurant-system/kds/src/App.tsx')).toContain('<h1 className="sr-only">');
  });
});

// Guard against the contrast swap regressing: nothing outside the intentional dark contexts should reintroduce the failing greys.
describe('failing text colours stay out of light-surface components', () => {
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.tsx') ? [join(dir, e.name)] : []);
  it('POS has no remaining text-slate-400 on a light-surface line', () => {
    const dark = /bg-(jaman-(navy|deepNavy|darkTeal)|slate-(700|800|900)|gray-(800|900)|black)|from-slate|from-jaman|bg-gradient|bg-jaman-saffron\b|bg-brand\b|bg-emerald-(600|700)|bg-rose-(600|700)|bg-blue-(600|700)|text-white/;
    const offenders = walk(join(root, 'apps/restaurant-system/pos/src')).flatMap((f) => readFileSync(f, 'utf8').split('\n').filter((l) => /(?<![\w-])text-slate-400\b/.test(l) && !dark.test(l)).map(() => f));
    expect(offenders).toEqual([]);
  });
});
