import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * BUG-127: Kiosk Admin and Captain ask for a "Restaurant ID" before they will connect, but nobody
 * could find it. Super Admin showed it only as 11-pixel grey text at the end of a subtitle line,
 * with no label and no way to copy it; Restaurant Admin did not show it at all; and the connect
 * screens only said "from your restaurant's admin dashboard". It is now shown clearly, with a
 * copy button, where the person setting a terminal up already is — and the connect screens say
 * where to find it.
 */
const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('The Restaurant ID can be found and copied (BUG-127)', () => {
  const detail = read('cloud/super-admin-web/src/pages/Restaurants/RestaurantDetailPage.tsx');

  it('Super Admin shows a labelled Restaurant ID with a copy button on the restaurant page', () => {
    expect(detail).toMatch(/Restaurant ID/);
    expect(detail).toMatch(/<CopyButton[^>]*text=\{restaurant\.id\}/);
  });

  it('the activation keys panel, where terminals are set up, shows it and explains which apps ask for it', () => {
    const panel = detail.slice(detail.indexOf('Hardware &amp; Terminal Activation Keys'));
    expect(panel.slice(0, 3500)).toMatch(/Restaurant ID/);
    expect(panel.slice(0, 3500)).toMatch(/Kiosk Admin/);
  });

  it('Restaurant Admin shows the Restaurant ID next to the device logins it creates', () => {
    const panel = read('apps/restaurant-system/pos-admin/src/components/settings/CloudDeviceLoginsPanel.tsx');
    expect(panel).toMatch(/Restaurant ID/);
    expect(panel).toMatch(/getStoredRestaurantId\(\)/);
  });

  it.each([
    ['Kiosk Admin', 'apps/kiosk-system/kiosk-admin/src/App.tsx'],
    ['Captain', 'apps/restaurant-system/captain/src/App.tsx']
  ])('the %s connect screen says where to find the ID', (_name, file) => {
    const source = read(file);
    expect(source).not.toContain("From your restaurant's admin dashboard");
    expect(source).toMatch(/Super Admin[\s\S]{0,200}Restaurant ID|Restaurant ID[\s\S]{0,300}Super Admin/);
  });
});
