import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');
const admin = (file: string) => readFileSync(join(root, 'apps/restaurant-system/pos-admin/src', file), 'utf8').replace(/\r\n/g, '\n');
const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() && e.name !== 'node_modules' && e.name !== 'dist' ? walk(join(dir, e.name)) : e.name.endsWith('.tsx') ? [join(dir, e.name)] : []);

describe('Restaurant Admin enterprise polish', () => {
  const css = admin('index.css');

  it('uses one primary-action colour: navy-filled buttons, links and file labels take the brand orange', () => {
    expect(css).toMatch(/button\.bg-jaman-navy\.text-white,\s*a\.bg-jaman-navy\.text-white,\s*label\.bg-jaman-navy\.text-white\s*\{\s*background-color: var\(--jv-brand\)/);
  });

  it('sets key figures in the interface font instead of monospace', () => {
    expect(css).toMatch(/\.jv-page :is\(\.text-xl, \.text-2xl, \.text-3xl, \.text-4xl\)\.font-mono \{\s*font-family: inherit;/);
  });

  it('defines the form primitives the password, device-login, WhatsApp and plan forms rely on', () => {
    for (const cls of ['.form-grid', '.field', '.form-error']) expect(css).toContain(cls);
    const users = ['settings/ChangeOwnerPasswordForm.tsx', 'settings/CloudDeviceLoginsPanel.tsx', 'settings/WhatsAppChannelPanel.tsx', 'settings/SubscriptionPlansView.tsx'];
    for (const file of users) expect(admin(`components/${file}`)).toMatch(/className="(field|form-grid|form-error)/);
  });

  it('has no invalid Tailwind spacing steps (there is no 4.5) that silently drop padding', () => {
    const offenders = ['apps', 'packages/ui/src', 'cloud/super-admin-web/src'].flatMap((dir) => walk(join(root, dir)))
      .filter((f) => /\b(p|w|h)-4\.5\b/.test(readFileSync(f, 'utf8')));
    // Captain's navigation icons are the only deliberate exception and now use a valid size.
    expect(offenders).toEqual([]);
  });

  it('keeps one toolbar hierarchy on Menu: Add Dish is the filled primary, other actions are secondary', () => {
    const menu = admin('components/menu/MenuCategoriesModule.tsx');
    expect(menu).toContain('<div className="flex flex-col gap-4">');
    expect(menu).not.toContain('py-2bg-jaman-navy');
    expect(menu).toMatch(/=== 1 \? 'ITEM' : 'ITEMS'/);
  });

  it('pluralises counts correctly', () => {
    expect(admin('components/menu/MenuCategoriesModule.tsx')).toMatch(/=== 1 \? 'dish' : 'dishes'/);
    expect(admin('components/menu/MenuOptionsModule.tsx')).toMatch(/=== 1 \? 'category is' : 'categories are'/);
  });

  it('puts the rarely-used kitchen station setup after the live queue and does not centre the page', () => {
    const kot = admin('components/kitchen/KitchenKotModule.tsx');
    expect(kot.indexOf('<KitchenStationsPanel/>')).toBeGreaterThan(kot.indexOf('Header & Quick Action Row'));
    expect(kot).not.toContain('max-w-7xl mx-auto');
  });

  it('left-aligns Support and gives the dashboard section room under Launch & handover', () => {
    const support = admin('components/support/SupportTicketsModule.tsx');
    for (const width of ['max-w-3xl', 'max-w-4xl']) expect(support).not.toContain(`${width} mx-auto`);
    expect(admin('components/dashboard/BranchBusinessDashboard.tsx')).toContain('space-y-5 mt-6 first:mt-0');
  });

  it('shows the receipt preview note above the receipt, not beside it', () => {
    expect(admin('components/receipts/ReceiptEBillPanel.tsx')).toContain('<div className="flex flex-col items-center">\n              {db.orders.length === 0 && (');
  });

  it('treats an export as a secondary action, not a crimson primary', () => {
    expect(admin('components/billing/BillingInvoicesModule.tsx')).not.toContain('bg-rose-700 hover:bg-rose-800 text-white');
  });
});

describe('One card standard across every tab', () => {
  const css = admin('index.css');
  it('gives every content card the same radius, border and no drop shadow, including the older premium card classes', () => {
    expect(css).toMatch(/\.card-luxury, \.card-metric-premium[\s\S]*?border: 1px solid var\(--jv-border\);\s*border-radius: 1rem;\s*box-shadow: none;/);
    expect(css).toMatch(/\.jv-page :is\(div, section, article, form, details\)\[class~="border"\]:is\(\[class\*="rounded-2xl"\], \[class\*="rounded-3xl"\]\) \{\s*border-radius: 1rem;\s*box-shadow: none;/);
  });
  it('sets KPI figures at 24px / 700 and padding at 16px in the shared KpiCard and the page KPI cards', () => {
    const kpi = readFileSync(join(root, 'packages/ui/src/KpiCard.tsx'), 'utf8');
    expect(kpi).toContain('text-2xl font-bold tabular-nums');
    expect(kpi).toContain('p-4 border border-[#EBE6DD]');
    expect(admin('components/dashboard/BranchBusinessDashboard.tsx')).toContain('mt-1.5 text-2xl font-bold tabular-nums text-jaman-navy');
    expect(admin('components/inventory/InventoryRecipesModule.tsx')).not.toContain('p-[18px]');
  });
  it('shows every Orders KPI label in the same neutral grey, with no per-card colour coding', () => {
    const orders = admin('components/orders/OrdersModule.tsx');
    const ribbon = orders.slice(orders.indexOf('Daily Reconciled Financials'), orders.indexOf('Daily Secondary Performance'));
    expect(ribbon).not.toMatch(/text-(sky|rose|amber|emerald|brand)-?\d*/);
    expect(ribbon.match(/text-\[11px\] font-bold uppercase tracking-wider text-slate-500 block/g)).toHaveLength(6);
  });
  it('keeps the Reports actions on their own row with one filled primary (Download PDF)', () => {
    const reports = admin('components/reports/ReportsDashboard.tsx');
    expect(reports).not.toContain('max-w-7xl mx-auto');
    expect(reports).not.toMatch(/bg-jaman-navy hover:bg-jaman-darkBorder text-white rounded-xl text-xs font-bold flex items-center gap-1\.5 shadow-2xs transition-all cursor-pointer active:scale-95/);
  });
  it('titles the CRM, staff and inventory pages with the same words as their sidebar entries', () => {
    expect(admin('components/customers/CustomersCrmModule.tsx')).toContain('Customers & Loyalty');
    expect(admin('components/staff/StaffRolesModule.tsx')).toContain('Team & Permissions');
    expect(admin('components/inventory/InventoryRecipesModule.tsx')).toContain('Inventory & Recipes');
    for (const jargon of ['(CRM)', '(RBAC)', '(BOM)']) {
      for (const f of ['customers/CustomersCrmModule.tsx', 'staff/StaffRolesModule.tsx', 'inventory/InventoryRecipesModule.tsx']) {
        expect(admin(`components/${f}`).split('\n').filter((l) => l.includes('Customers & Loyalty') || l.includes('Team & Permissions') || l.includes('Inventory & Recipes')).join('')).not.toContain(jargon);
      }
    }
  });
});
