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

  // Kiosk Admin's own connect screen is retired (Phase 2 Task 11) -- its Restaurant Admin
  // merge console (pos-admin) is now the one login screen a Kiosk-only or Restaurant-only
  // subscriber alike uses, so this is the only "connect screen" left to check.
  it('the Restaurant Admin (pos-admin) login screen says where to find the Restaurant ID', () => {
    const source = read('apps/restaurant-system/pos-admin/src/App.tsx');
    expect(source).not.toContain("From your restaurant's admin dashboard");
    expect(source).toMatch(/Super Admin[\s\S]{0,200}Restaurant ID|Restaurant ID[\s\S]{0,300}Super Admin/);
  });

  // Captain no longer asks for a Restaurant ID at all: it activates with the Welcome Kit key alone
  // (like POS and KDS), the same way this file's own BUG-127 fix asks every OTHER screen to make an
  // awkward manual field easy to find — the better fix here was removing the field.
  it('the Captain connect screen asks only for the activation key, not a Restaurant ID', () => {
    const source = read('apps/restaurant-system/captain/src/App.tsx');
    expect(source).not.toMatch(/Restaurant ID/);
    expect(source).toMatch(/Activation Key/);
  });
});
