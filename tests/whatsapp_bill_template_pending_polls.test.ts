import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Reported bug: "Bill message template: waiting for Meta approval" kept showing a full day after
 * submission. Root cause: the panel fetched settings once on mount and never again unless the
 * admin happened to press the unrelated phone-number "Check again" button -- an approval that
 * landed on Meta's side hours ago had no way to reach the screen. Fixed by silently re-polling
 * the same recheck endpoint (which already returns the live templateStatus) while PENDING.
 */
const SRC = join(__dirname, '../apps/restaurant-system/pos-admin/src/components/receipts/WhatsAppBillNumberPanel.tsx');

describe('WhatsApp bill template: a PENDING status resolves itself instead of sitting stale', () => {
  const src = readFileSync(SRC, 'utf8');

  it('polls recheckWhatsAppBillNumber on an interval while the template is PENDING', () => {
    const idx = src.indexOf("templateStatus !== 'PENDING'");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 300);
    expect(block).toMatch(/setInterval/);
    expect(block).toMatch(/recheckWhatsAppBillNumber\(\)/);
  });

  it('stops polling once the status leaves PENDING (clears the interval)', () => {
    const idx = src.indexOf("templateStatus !== 'PENDING'");
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/clearInterval/);
  });
});
