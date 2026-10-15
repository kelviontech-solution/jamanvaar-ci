import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Generating a "QR Ordering Console" activation key submits it to the backend as a plain
 * POS_ADMIN-typed key (GenerateActivationKeyModal.tsx's own comment: "no QR-specific Device.type
 * exists"). The key is created successfully, but RestaurantDetailPage.tsx's activation-keys list
 * only ever rendered formatDeviceTypeLabel(k.allowedDeviceType), which collapses POS_ADMIN to
 * "RESTAURANT ADMIN CONSOLE" -- identical to a real Restaurant Admin key. A Super Admin creating a
 * QR key therefore couldn't tell it apart from an existing Restaurant Admin key and reported it as
 * "created but not showing". It was never missing, only indistinguishable.
 */
const SRC = join(__dirname, '../cloud/super-admin-web/src');

describe('Super Admin: a QR Ordering Console activation key is distinguishable in the list, not just created', () => {
  it('GenerateActivationKeyModal defaults the label to "QR Ordering Console" when none is typed', () => {
    const src = readFileSync(join(SRC, 'pages/ActivationKeys/GenerateActivationKeyModal.tsx'), 'utf8');
    expect(src).toMatch(/label:\s*label\.trim\(\)\s*\|\|\s*\(deviceType === 'QR_ORDERING' \? 'QR Ordering Console' : undefined\)/);
  });

  it('RestaurantDetailPage renders activation key label (k.label) in both the card grid and table views, not just the generic device-type badge', () => {
    const src = readFileSync(join(SRC, 'pages/Restaurants/RestaurantDetailPage.tsx'), 'utf8');
    const labelRenders = [...src.matchAll(/\{k\.label\s*&&/g)];
    expect(labelRenders.length, 'expected k.label to be rendered in both activation-key list views').toBeGreaterThanOrEqual(2);
  });
});

/**
 * Reported live: a Super Admin generated a "Restaurant Admin Console" (POS_ADMIN) key for a
 * restaurant whose plan never had that application enabled. The key was created successfully
 * and handed to the owner, who redeemed it and hit a dead end -- "This application is not
 * enabled in your restaurant's current plan" / "No admin application is enabled. Ask your
 * platform administrator." -- with no way to connect that error back to anything actionable,
 * since the person who could fix it (the Super Admin) had already moved on believing the key
 * worked. The modal already fetches this restaurant's ApplicationEntitlement rows for the quota
 * preview; it just never looked at `enabled`. This forces the check to happen at key-generation
 * time, when it's still actionable, instead of at login time, when it's just a confusing wall.
 */
describe("Super Admin: generating a key for an app the restaurant's plan doesn't have enabled is blocked before it becomes a confusing dead end at login", () => {
  const src = readFileSync(join(SRC, 'pages/ActivationKeys/GenerateActivationKeyModal.tsx'), 'utf8');

  it('tracks whether the selected app is actually enabled on this restaurant\'s plan, not just its device quota', () => {
    expect(src).toMatch(/appEnabled/);
  });

  it('shows a clear, actionable warning instead of silently letting the key generate', () => {
    expect(src.toLowerCase()).toMatch(/isn.t enabled.*(restaurant|plan)|not enabled.*(restaurant|plan)/s);
    expect(src).toMatch(/Applications tab/);
  });

  it('disables the Generate key submit button while the app is not enabled, so a doomed key can\'t be created at all', () => {
    const submitButtonBlock = src.slice(src.indexOf('Generate key'), src.indexOf('Generate key') + 1).length
      ? src.slice(Math.max(0, src.lastIndexOf('<Button type="submit"', src.indexOf('Generate key'))), src.indexOf('Generate key') + 20)
      : '';
    expect(submitButtonBlock).toMatch(/appEnabled === false/);
  });
});
