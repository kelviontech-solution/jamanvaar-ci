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
