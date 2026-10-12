import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Found by live-browser review of Advanced Features -> License (not by source-scanning alone):
 * the "Licensed capabilities and limits" card grid falls back to the raw capability code
 * (e.g. "QR_SERVICE_REQUESTS") whenever it's missing from the `labels` map and isn't one of the
 * `toggles` entries either. 4 of the 17 real QR_CAPABILITIES codes were missing from `labels`,
 * so a restaurant without those add-ons saw raw internal codes instead of human labels.
 */
const SRC = join(__dirname, '../apps/restaurant-system/pos-admin/src/components/qrconsole/QrCapabilities.tsx');

describe('Advanced Features / License: every QR capability code has a human label', () => {
  const src = readFileSync(SRC, 'utf8');
  const labelsBlock = /const labels: Record<string, string> = \{([^}]*)\}/.exec(src)?.[1] ?? '';
  const togglesBlock = /const toggles = \[([\s\S]*?)\] as const/.exec(src)?.[1] ?? '';

  // The full QR_CAPABILITIES code list from cloud/api/src/modules/application-entitlements/qr-capabilities.ts
  const allCodes = [
    'QR_SERVICE_REQUESTS', 'QR_SCHEDULED_PICKUP', 'QR_MENU_ANALYTICS', 'QR_BRANDING',
    'QR_GROUP_ORDERING', 'QR_KITCHEN_CAPACITY', 'QR_LOYALTY', 'QR_MULTILINGUAL',
    'QR_PROMOTIONS', 'QR_MULTI_BRANCH', 'QR_FEEDBACK', 'QR_SPLIT_PAYMENT',
    'QR_NOTIFICATIONS', 'QR_ORDER_HISTORY', 'QR_USAGE_LIMITS', 'QR_INVENTORY_SYNC',
    'QR_ACCESSIBILITY',
  ];

  it('every code is covered by either the labels map or the toggles list', () => {
    const uncovered = allCodes.filter((code) => !labelsBlock.includes(code) && !togglesBlock.includes(code));
    expect(uncovered, `these codes would render as raw strings: ${uncovered.join(', ')}`).toEqual([]);
  });
});
