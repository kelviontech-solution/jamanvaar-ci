import { describe, it, expect, beforeEach } from 'vitest';
import { EndpointResolver, isOperationalPath } from '../packages/sync/src/endpoint_resolver';
import { DeviceGate, getAssignedStation, setAssignedStation } from '../packages/sync/src';

/**
 * Per-application Branch Core outage matrix (audit row OF-04). For each terminal app, the requests it really makes, in four
 * situations: everything up; the Branch Core down; the internet down; both down. Which server answers, or whether the call
 * fails, is asserted for every combination, so "what can POS / Kiosk / Captain / KDS / Restaurant Admin still do" is a fact.
 */
const CLOUD = 'https://cloud.example';
const CORE = 'http://192.168.1.20:5178';

type Up = 'up' | 'down';
function fakeFetch(b: { core: Up; cloud: Up }) {
  return async (url: string) => {
    const isCore = url.startsWith(CORE);
    if ((isCore ? b.core : b.cloud) === 'down') throw new TypeError('fetch failed');
    return new Response(JSON.stringify({ from: isCore ? 'core' : 'cloud' }), { status: 200 });
  };
}

/** What each app calls (paths taken from the app wiring: order sync, menu and floor entity sync, numbers, inventory, heartbeat, commands, payments, identity). */
const APPS: Record<string, string[]> = {
  POS: ['/api/v1/orders/sync', '/api/v1/entity-sync/MENU_ITEM', '/api/v1/entity-sync/DINING_TABLE', '/api/v1/sync/number-leases', '/api/v1/inventory/movements', '/api/v1/devices/me/heartbeat', '/api/v1/devices/me/commands', '/api/v1/payments/orders'],
  KDS: ['/api/v1/orders/sync', '/api/v1/entity-sync/STAFF_USER', '/api/v1/entity-sync/SERVICE_MESSAGE', '/api/v1/devices/me/heartbeat', '/api/v1/devices/me/commands'],
  CAPTAIN: ['/api/v1/orders/sync', '/api/v1/entity-sync/DINING_TABLE', '/api/v1/entity-sync/MENU_ITEM', '/api/v1/sync/number-leases', '/api/v1/devices/me/heartbeat'],
  KIOSK: ['/api/v1/orders/sync', '/api/v1/entity-sync/MENU_ITEM', '/api/v1/sync/number-leases', '/api/v1/devices/me/heartbeat', '/api/v1/payments/orders'],
  POS_ADMIN: ['/api/v1/orders/sync', '/api/v1/entity-sync/MENU_ITEM', '/api/v1/inventory/movements', '/api/v1/menu/publish', '/api/v1/devices/me/fleet', '/api/v1/devices/me/restaurant', '/api/v1/restaurant/qr/overview']
};

const TOPOLOGIES: Array<{ name: string; core: Up; cloud: Up }> = [
  { name: 'all up', core: 'up', cloud: 'up' },
  { name: 'Branch Core down', core: 'down', cloud: 'up' },
  { name: 'internet down', core: 'up', cloud: 'down' },
  { name: 'both down', core: 'down', cloud: 'down' }
];

/** The rule the resolver is designed around: operational traffic prefers the core and falls back to the cloud; everything else is cloud only. */
function expected(path: string, t: { core: Up; cloud: Up }): 'core' | 'cloud' | 'FAIL' {
  if (isOperationalPath(path)) {
    if (t.core === 'up') return 'core';
    return t.cloud === 'up' ? 'cloud' : 'FAIL';
  }
  return t.cloud === 'up' ? 'cloud' : 'FAIL';
}

describe('Branch Core outage matrix, per application', () => {
  let clock = 0;
  beforeEach(() => {
    clock = 1_000_000;
    EndpointResolver.reset({ now: () => clock });
    EndpointResolver.configure({ cloudBase: CLOUD, coreUrl: CORE });
  });

  for (const [app, paths] of Object.entries(APPS)) {
    for (const t of TOPOLOGIES) {
      it(`${app}, ${t.name}: every request goes where the design says, or fails cleanly`, async () => {
        for (const path of paths) {
          EndpointResolver.reset({ now: () => clock });
          EndpointResolver.configure({ cloudBase: CLOUD, coreUrl: CORE });
          const want = expected(path, t);
          const outcome = await EndpointResolver.fetch(path, {}, fakeFetch(t) as never)
            .then(async (r) => ((await r.json()) as { from: 'core' | 'cloud' }).from)
            .catch(() => 'FAIL' as const);
          expect(outcome, `${app} ${path} (${t.name})`).toBe(want);
        }
      });
    }
  }

  it('what each app can still do with the internet down and the Branch Core up: everything operational, nothing that needs the cloud', () => {
    const summary = Object.fromEntries(Object.entries(APPS).map(([app, paths]) => [app, {
      keepsWorking: paths.filter((p) => isOperationalPath(p)),
      needsInternet: paths.filter((p) => !isOperationalPath(p))
    }]));
    // Selling, kitchen, floor, menu, numbering, stock and heartbeats keep working locally in every app:
    for (const app of ['POS', 'KDS', 'CAPTAIN', 'KIOSK']) {
      expect(summary[app].keepsWorking).toContain('/api/v1/orders/sync');
      expect(summary[app].keepsWorking).toContain('/api/v1/devices/me/heartbeat');
    }
    // ...while payments, publishing the QR menu, restaurant identity and QR administration need the internet:
    expect(summary.POS.needsInternet).toEqual(['/api/v1/payments/orders']);
    expect(summary.KIOSK.needsInternet).toEqual(['/api/v1/payments/orders']);
    expect(summary.POS_ADMIN.needsInternet).toEqual(expect.arrayContaining(['/api/v1/menu/publish', '/api/v1/devices/me/restaurant', '/api/v1/restaurant/qr/overview']));
    expect(summary.KDS.needsInternet).toEqual([]);
    expect(summary.CAPTAIN.needsInternet).toEqual([]);
  });
});

describe('a KDS screen keeps the station the restaurant assigned it', () => {
  beforeEach(() => setAssignedStation(null));

  it('the heartbeat answer stores it, an unassigned answer clears it, and an answer without the field leaves it alone', () => {
    expect(getAssignedStation()).toBeNull();
    DeviceGate.applyHeartbeat({ ok: true, station: 'Bar' });
    expect(getAssignedStation()).toBe('Bar');
    DeviceGate.applyHeartbeat({ ok: true }); // an older server: no field, no change
    expect(getAssignedStation()).toBe('Bar');
    DeviceGate.applyHeartbeat({ ok: true, station: null });
    expect(getAssignedStation()).toBeNull();
  });
});
