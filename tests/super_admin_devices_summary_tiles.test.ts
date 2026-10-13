import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Device Fleet / MDM's top summary tiles (Online/Degraded/Offline/Never seen/Revoked) read from
 * devices.extra?.healthCounts, which only ever populates when the "All devices" or "Needs
 * attention" view is active -- usePagedList('/api/v1/devices', ..., view !== 'RESTAURANTS') is
 * disabled (never fetches) while on "By restaurant", the page's DEFAULT view. Every tile showed
 * "-" even though the per-restaurant cards directly below, on the very same screen, were already
 * showing real online/degraded/offline counts. Now the tiles sum those same already-fetched rows
 * when in that view instead of reading a value that was never requested.
 */
const SRC = join(__dirname, '../cloud/super-admin-web/src/pages/Devices/DevicesListPage.tsx');

describe('Device Fleet: summary tiles have real numbers on the default "By restaurant" view', () => {
  const src = readFileSync(SRC, 'utf8');

  it('counts falls back to summing restaurants.items when in RESTAURANTS view, instead of only ever reading devices.extra', () => {
    expect(src).toMatch(/view === 'RESTAURANTS'\s*\n\s*\? restaurants\.items\.reduce/);
  });

  it('the restaurant-view sum covers every tile the cards below already show per restaurant', () => {
    expect(src).toMatch(/online: acc\.online \+ r\.online/);
    expect(src).toMatch(/degraded: acc\.degraded \+ r\.degraded/);
    expect(src).toMatch(/offline: acc\.offline \+ r\.offline/);
    expect(src).toMatch(/never_seen: acc\.never_seen \+ r\.neverSeen/);
    expect(src).toMatch(/revoked: acc\.revoked \+ r\.revoked/);
  });
});
