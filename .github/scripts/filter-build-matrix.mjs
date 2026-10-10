// Filters build-installers.yml's app matrix down to just the app(s) a given build run asked
// for, so fixing one app doesn't rebuild (and re-sign, re-release) all five every time.
// Reads APPS_INPUT ("all", or a comma-separated list of app names) and GITHUB_OUTPUT from the
// environment, writing desktop_matrix/android_matrix/apps_csv for the workflow's later jobs.
import { appendFileSync } from 'node:fs';

const ALL_APPS = [
  { name: 'POS', path: 'apps/restaurant-system/pos', binary: 'jamanvaar-pos.exe', title: 'JAMANVAAR POS — High-Speed Counter Billing Terminal' },
  { name: 'RestaurantAdmin', path: 'apps/restaurant-system/pos-admin', binary: 'jamanvaar-pos-admin.exe', title: 'JAMANVAAR POS Admin — Restaurant Operations & Intelligence' },
  { name: 'Kiosk', path: 'apps/kiosk-system/kiosk-user', binary: 'jamanvaar-kiosk-user.exe', title: 'JAMANVAAR Kiosk — Customer Self-Order Terminal' },
  { name: 'Captain', path: 'apps/restaurant-system/captain', binary: 'jamanvaar-captain.exe', title: 'JAMANVAAR Captain — Table-Side Ordering & Service' },
  { name: 'KDS', path: 'apps/restaurant-system/kds', binary: 'jamanvaar-kds.exe', title: 'JAMANVAAR Kitchen Display — Prep Queue & Order Timing' }
];

const input = (process.env.APPS_INPUT || 'all').trim();
const wantAll = !input || input.toLowerCase() === 'all';
const wanted = wantAll ? ALL_APPS.map((a) => a.name) : input.split(',').map((s) => s.trim()).filter(Boolean);

const unknown = wanted.filter((n) => !ALL_APPS.some((a) => a.name === n));
if (unknown.length > 0) {
  throw new Error(`Unknown app name(s): ${unknown.join(', ')}. Valid names: ${ALL_APPS.map((a) => a.name).join(', ')}`);
}

const selected = ALL_APPS.filter((a) => wanted.includes(a.name));
if (selected.length === 0) throw new Error(`No apps matched input "${input}"`);

const desktopMatrix = { app: selected };
const androidMatrix = { app: selected.map(({ name, path }) => ({ name, path })) };
const apiOutputsCsv = selected.map((a) => a.name).join(',');

const out = process.env.GITHUB_OUTPUT;
appendFileSync(out, `desktop_matrix=${JSON.stringify(desktopMatrix)}\n`);
appendFileSync(out, `android_matrix=${JSON.stringify(androidMatrix)}\n`);
appendFileSync(out, `apps_csv=${apiOutputsCsv}\n`);

console.log(`Building: ${apiOutputsCsv}`);
