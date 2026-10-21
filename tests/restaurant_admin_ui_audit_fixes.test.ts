import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(join(__dirname, '..', file), 'utf8');
const admin = (file: string) => read(`apps/restaurant-system/pos-admin/src/${file}`);

describe('Restaurant Admin UI audit fixes', () => {
  it('wires the Ctrl/Cmd+K shortcut the header advertises to the global search', () => {
    const app = admin('App.tsx');
    expect(admin('components/header/PosAdminHeader.tsx')).toContain('Ctrl+K');
    expect(app).toMatch(/event\.key\.toLowerCase\(\) === 'k'/);
    expect(app).toMatch(/setIsGlobalSearchOpen\(true\);\s*\}\s*\};/);
  });

  it('gives the header-opened overlays dialog semantics and an accessible name', () => {
    expect(admin('components/EodReportModal.tsx')).toMatch(/role="dialog" aria-modal="true" aria-label="End of day report"/);
    expect(admin('components/reports/FinancialReconciliationModal.tsx')).toMatch(/role="dialog" aria-modal="true" aria-label="Financial reconciliation"/);
    expect(read('packages/ui/src/NotificationDrawerModal.tsx')).toMatch(/role="dialog" aria-modal="true" aria-label="Notifications"/);
  });

  it('keeps one page-title scale for module pages and clears the floating assistant at the bottom', () => {
    expect(admin('index.css')).toMatch(/\.jv-page h1\[class\]\s*\{[^}]*font-size: 1\.5rem/);
    expect(admin('App.tsx')).toContain("'jv-page p-3 sm:p-6 pb-24 sm:pb-24'");
  });

  it('does not repeat instructional copy on the dashboard', () => {
    const attention = admin('components/dashboard/AttentionTasks.tsx');
    expect(attention).not.toContain('Nothing needs attention.');
    expect(attention).toContain('All clear');
    expect(admin('components/header/AdminBranchWorkspace.tsx')).toMatch(/activeAdminBranch==='all'&&<span/);
  });

  it('labels the form controls the audit found unnamed', () => {
    expect(admin('components/kitchen/KitchenKotModule.tsx')).toContain('aria-label="Search kitchen tickets"');
    expect(admin('components/staff/StaffRolesModule.tsx')).toContain('aria-label="Schedule date"');
    expect(admin('components/receipts/ReceiptEBillPanel.tsx')).toMatch(/htmlFor="rcpt-field-1"[\s\S]*id="rcpt-field-1"/);
    expect(admin('components/hardware/KitchenPrinterRoutingPanel.tsx')).toContain('min-w-0');
  });
});
