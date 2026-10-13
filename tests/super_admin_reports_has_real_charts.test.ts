import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The page literally named "Platform Reports & Analytics" had zero charts across all 4 tabs --
 * just KPI number cards and data tables, despite the Executive Dashboard already having working
 * hand-rolled bar charts (same .mini-bar-chart/.chart-bar-pillar CSS, see DashboardPage.tsx).
 * Each tab already fetched a breakdown array (byPlan / cityBreakdown / byType / byStatus) that
 * was only ever rendered as plain cards -- no backend change needed, just actually charting it.
 */
const SRC = join(__dirname, '../cloud/super-admin-web/src/pages/Reports/ReportsPage.tsx');

describe('Reports & Analytics: every tab has a real chart, not just number cards', () => {
  const src = readFileSync(SRC, 'utf8');

  it('defines a reusable MiniBarChart using the same chart classes as the Dashboard', () => {
    expect(src).toMatch(/function MiniBarChart/);
    expect(src).toMatch(/className="mini-bar-chart"/);
    expect(src).toMatch(/import '\.\.\/Dashboard\/dashboard\.css'/);
  });

  it('Revenue tab charts revenue.byPlan', () => {
    expect(src).toMatch(/data=\{revenue\.byPlan\.map/);
  });

  it('Restaurant Cohorts tab charts cityBreakdown', () => {
    expect(src).toMatch(/data=\{restaurantData\.cityBreakdown\.map/);
  });

  it('Device Telemetry tab charts byType', () => {
    expect(src).toMatch(/data=\{deviceData\.byType\.map/);
  });

  it('Plan Distribution tab charts byStatus, with humanized status labels', () => {
    expect(src).toMatch(/data=\{subData\.byStatus\.map/);
    expect(src).toMatch(/function humanizeStatus/);
    expect(src).not.toMatch(/<span className="sub-status-label">\{s\.status\}<\/span>/);
  });
});
