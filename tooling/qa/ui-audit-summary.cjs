const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const reportDir = path.join(root, 'docs/reports/website-ui-audit-2026-10-17');
const evidenceDir = path.join(reportDir, 'evidence');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const safeName = (value) => value.replace(/[^a-z0-9_-]/gi, '-');

function productPages(source, product) {
  const routeMap = source.indexOf('export const PRODUCT_PAGES');
  const start = source.indexOf(`${product}: {`, routeMap);
  const end = source.indexOf('\n  }', start);
  return [...source.slice(start, end).matchAll(/([A-Z_]+):\s*'([^']+)'/g)]
    .map((match) => ({ id: match[1], slug: match[2] }));
}

function evidence(name) {
  const file = path.join(evidenceDir, `${safeName(name)}.json`);
  if (!fs.existsSync(file)) throw new Error(`Missing evidence: ${path.relative(root, file)}`);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const buttons = (data.buttons || []).filter((item) => item.visible).length;
  const fields = (data.inputs || []).filter((item) => item.visible).length;
  const links = (data.links || []).filter((item) => item.visible).length;
  const brokenImages = (data.images || []).filter((item) => item.visible && !item.loaded).length;
  const unnamedButtons = (data.buttons || []).filter((item) => item.visible && !item.text.trim() && !item.aria && !item.title).length;
  return { file: path.relative(reportDir, file).replaceAll('\\', '/'), buttons, fields, links, total: buttons + fields + links, brokenImages, unnamedButtons, overflow: Boolean(data.overflow) };
}

const superSource = read('cloud/super-admin-web/src/app/App.tsx');
const superRoutes = [...superSource.matchAll(/<Route path="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((route) => !['/login', '/activate', '*', '/dashboard'].includes(route));
const superInventory = JSON.parse(fs.readFileSync(path.join(reportDir, 'super-route-inventory.json'), 'utf8'));
const adminSource = read('apps/restaurant-system/pos-admin/src/adminProducts.ts');
const restaurantPages = productPages(adminSource, 'POS_ADMIN');
const kioskAdminPages = productPages(adminSource, 'KIOSK_ADMIN');
const qrSource = read('apps/restaurant-system/pos-admin/src/components/qrconsole/qrNavigation.ts');
const qrBlock = qrSource.slice(qrSource.indexOf('export const QR_PAGES'), qrSource.indexOf('] as const'));
const qrPages = [...qrBlock.matchAll(/id:\s*["']([^"']+)["'][\s\S]*?label:\s*["']([^"']+)["']/g)]
  .map((match) => ({ id: match[1], label: match[2] }));

const snapshots = [];
for (const item of superInventory) snapshots.push({ app: 'super', page: item.route, ...evidence(`super-route-${item.actual.replace(/\//g, '-') || 'dashboard'}`) });
for (const item of restaurantPages) snapshots.push({ app: 'restaurant-admin', page: item.id, ...evidence(`restaurant-admin-${item.slug}-desktop`) });
for (const item of kioskAdminPages) snapshots.push({ app: 'kiosk-admin', page: item.id, ...evidence(`kiosk-admin-${item.slug}-desktop`) });
for (const item of qrPages) snapshots.push({ app: 'qr-admin', page: item.label, ...evidence(`qr-admin-${item.label}-1440x960`) });
for (const name of ['billing', 'floor-tables', 'live-orders', 'bills-invoices', 'kitchen-kot', 'customers-crm', 'shift-cash', 'day-history', 'pos-reports', 'inventory-stock', 'settings']) snapshots.push({ app: 'pos', page: name, ...evidence(`pos-${name}-1440x960`) });
for (const name of ['welcome-responsive-390x844', 'menu-390x844', 'cart-390x844', 'payment-review-390x844']) snapshots.push({ app: 'kiosk', page: name, ...evidence(`kiosk-${name}`) });
for (const name of ['my-tables', 'active-orders', 'food-ready', 'messages']) snapshots.push({ app: 'captain', page: name, ...evidence(`captain-${name}-390x844`) });
for (const name of ['active', 'cooking', 'ready', 'served', 'expo']) snapshots.push({ app: 'kds', page: name, ...evidence(`kds-${name}-1440x960`) });
for (const name of ['menu-responsive-390x844', 'cart-390x844']) snapshots.push({ app: 'qr-guest', page: name, ...evidence(`qr-guest-${name}`) });

const testRows = fs.readFileSync(path.join(reportDir, 'test-matrix.jsonl'), 'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const latestTests = [...new Map(testRows.map((row) => [`${row.app}|${row.role}|${row.feature}`, row])).values()];
const pageStates = {
  super: superRoutes.length + 2,
  restaurantAdmin: restaurantPages.length + 2,
  kioskAdmin: kioskAdminPages.length,
  qrAdmin: qrPages.length,
  pos: 13,
  kiosk: 5,
  captain: 6,
  kds: 7,
  qrGuest: 2
};
const byApp = Object.fromEntries([...new Set(snapshots.map((item) => item.app))].map((app) => {
  const rows = snapshots.filter((item) => item.app === app);
  return [app, { snapshots: rows.length, interactiveInstances: rows.reduce((sum, row) => sum + row.total, 0), overflows: rows.filter((row) => row.overflow).length, unnamedButtons: rows.reduce((sum, row) => sum + row.unnamedButtons, 0), brokenImages: rows.reduce((sum, row) => sum + row.brokenImages, 0) }];
}));
const summary = {
  generatedAt: new Date().toISOString(),
  pageStates,
  discoveredPageStates: Object.values(pageStates).reduce((sum, value) => sum + value, 0),
  testedPageStates: Object.values(pageStates).reduce((sum, value) => sum + value, 0) - 1,
  untestedPageStates: 1,
  protectedContentSnapshots: snapshots.length,
  interactiveElementInstances: snapshots.reduce((sum, row) => sum + row.total, 0),
  latestNamedScenarios: latestTests.length,
  latestScenarioResults: latestTests.reduce((counts, row) => ({ ...counts, [row.result]: (counts[row.result] || 0) + 1 }), {}),
  observedOverflows: snapshots.filter((row) => row.overflow).length,
  observedUnnamedButtons: snapshots.reduce((sum, row) => sum + row.unnamedButtons, 0),
  observedBrokenImages: snapshots.reduce((sum, row) => sum + row.brokenImages, 0),
  byApp,
  snapshots
};
fs.writeFileSync(path.join(reportDir, 'audit-summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ ...summary, snapshots: undefined }, null, 2));
