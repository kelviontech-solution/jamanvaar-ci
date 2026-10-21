import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRODUCT_PAGES, adminPagePath, parseAdminRoute, type AdminProduct } from '../apps/restaurant-system/pos-admin/src/adminProducts';
import { productNavSections } from '../apps/restaurant-system/pos-admin/src/navSections';

const src = (file: string) => readFileSync(join(__dirname, '../apps/restaurant-system/pos-admin/src', file), 'utf8');
const products: AdminProduct[] = ['POS_ADMIN', 'KIOSK_ADMIN'];

describe('Restaurant Admin navigation contract', () => {
  it.each(products)('%s: every sidebar item has its own page, and every slug is unique', (product) => {
    const pages = PRODUCT_PAGES[product];
    const slugs = Object.values(pages);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const section of productNavSections(product)) {
      for (const item of section.items) {
        expect(Object.hasOwn(pages, item.id), `${product} ${item.id}`).toBe(true);
      }
    }
  });

  it.each(products)('%s: a page path always resolves back to the same page', (product) => {
    for (const page of Object.keys(PRODUCT_PAGES[product]) as (keyof (typeof PRODUCT_PAGES)[AdminProduct])[]) {
      const route = parseAdminRoute(adminPagePath(product, page));
      expect(route.page, `${product} ${String(page)}`).toBe(page);
      expect(route.invalid).toBe(false);
    }
  });

  it('keeps Menu templates and Restaurant Settings on separate routes', () => {
    expect(parseAdminRoute('/restaurant-admin/templates').page).toBe('TEMPLATES');
    expect(parseAdminRoute('/restaurant-admin/settings').page).toBe('SETTINGS');
    expect(parseAdminRoute('/kiosk-admin/templates').page).toBe('TEMPLATES');
    expect(adminPagePath('POS_ADMIN', 'TEMPLATES')).not.toBe(adminPagePath('POS_ADMIN', 'SETTINGS'));
  });

  it('renders a real page header for Menu templates and Kiosk payment settings', () => {
    const app = src('App.tsx');
    expect(app).toMatch(/activeTab === 'TEMPLATES' && <SettingsPageHeader title="Menu Templates"/);
    expect(app).toMatch(/activeTab === 'KIOSK_PAYMENTS' && [^\n]*SettingsPageHeader title="Kiosk payment settings"/);
  });
});

describe('Operations Hub layout', () => {
  const css = src('components/operations/operations.css');
  it('bounds the sticky task list to the workspace so its lower entries stay reachable', () => {
    expect(css).toMatch(/\.ops-layout > nav \{[^}]*position: sticky;[^}]*max-height: calc\(100dvh - 176px\);[^}]*overflow-y: auto/s);
  });
  it('shows the selected task as a tint with an accent bar, not a filled navy block', () => {
    expect(css).toMatch(/button\[aria-current='page'\] \{\s*background: rgb\(191 84 15 \/ 0\.09\)/);
    expect(css).not.toMatch(/aria-current='page'\] \{\s*background: #0b253a/);
  });
  it('lays the restore checkboxes out as a wrapping row of chips', () => {
    expect(css).toMatch(/\.ops-check-group \{[^}]*display: flex;[^}]*flex-wrap: wrap/s);
    const form = src('components/operations/ConfigurationRollback.tsx');
    expect(form).toContain('className="ops-check-group"');
    expect(form).toMatch(/<label key=\{value\} className="ops-check">/);
  });
  it('uses one main landmark and no width cap', () => {
    expect(src('components/operations/OperationsConsole.tsx')).not.toMatch(/<main key=/);
    expect(css).toMatch(/\.ops-console \{[^}]*max-width: none/s);
  });
});

describe('Page widths and the payment information card', () => {
  it('does not cap Settings or the other full pages at a narrow centred width', () => {
    expect(src('App.tsx')).not.toMatch(/space-y-6 max-w-5xl/);
    expect(src('components/backup/BackupRestoreModule.tsx')).not.toContain('max-w-4xl mx-auto');
    expect(src('components/inventory/InventoryControlModule.tsx')).not.toContain('max-w-6xl mx-auto');
    expect(src('components/reservations/ReservationsModule.tsx')).not.toContain('max-w-6xl mx-auto');
  });
  it('shows the split-payment explainer on a light surface with readable text', () => {
    const payments = src('components/payments/PaymentsSplitModule.tsx');
    expect(payments).not.toContain('text-brand/30');
    expect(payments).not.toContain('bg-jaman-navy rounded-2xl text-white');
    expect(payments).toContain('Understanding Split Multi-Tender Payments');
    expect(payments).toContain('Smart Settlement Active');
  });
});
