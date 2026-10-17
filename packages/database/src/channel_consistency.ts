import type { MenuItem } from '@jamanvaar/types';
import { db } from './db';

export type SalesChannel = 'POS' | 'KIOSK' | 'QR' | 'CAPTAIN';
const CHANNELS: SalesChannel[] = ['POS', 'KIOSK', 'QR', 'CAPTAIN'];

/**
 * The one precedence rule every channel's own menu filter is supposed to follow (domain.ts's
 * own comment on MenuItem.salesChannels: "When present it must include the channel; when
 * absent the per-channel switches above apply"). Kiosk (standardMenu.ts) and the QR backend
 * (qr-menu.service.ts) already implement this; POS and Captain's catalog filters did not check
 * salesChannels at all until now (#3) -- this mirrors the same rule so the admin-facing check
 * reports what a guest/staff member actually sees, not a second guess at it.
 */
export function resolvedChannelVisibility(item: MenuItem, channel: SalesChannel): boolean {
  if (item.archivedAt || item.isAvailable === false) return false;
  if (item.salesChannels) return item.salesChannels.includes(channel);
  if (channel === 'QR') return item.isQrOrderingEnabled !== false;
  if (channel === 'KIOSK') return item.isKioskEnabled !== false;
  return true; // POS and Captain have no dedicated legacy switch; only salesChannels can restrict them.
}

export interface ChannelConsistencyIssue {
  itemId: string;
  itemName: string;
  kind: 'CHANNEL_SPLIT' | 'MISSING_TAX_GROUP' | 'INACTIVE_TAX_GROUP' | 'MISSING_MODIFIER_GROUP';
  detail: string;
}

/**
 * Flags real, checkable discrepancies -- not every item, only the ones where a channel would
 * actually show something different from the others, or where a tax/modifier reference is
 * broken. Loyalty is intentionally not checked here: points accrue on the order total
 * (CustomerRepository.earnPointsForOrder), there is no per-item eligibility flag to diverge.
 */
export function scanChannelConsistency(): ChannelConsistencyIssue[] {
  const issues: ChannelConsistencyIssue[] = [];
  const activeTaxGroupIds = new Set(db.taxGroups.filter((t) => t.isActive).map((t) => t.id));
  const allTaxGroupIds = new Set(db.taxGroups.map((t) => t.id));
  const modifierGroupIds = new Set(db.modifierGroups.map((g) => g.id));

  for (const item of db.menuItems) {
    if (item.archivedAt) continue;

    const visibility = CHANNELS.map((c) => [c, resolvedChannelVisibility(item, c)] as const);
    const distinct = new Set(visibility.map(([, v]) => v));
    if (distinct.size > 1) {
      issues.push({
        itemId: item.id,
        itemName: item.name,
        kind: 'CHANNEL_SPLIT',
        detail: visibility.map(([c, v]) => `${c}: ${v ? 'Shown' : 'Hidden'}`).join(' · ')
      });
    }

    if (item.taxGroupId && !allTaxGroupIds.has(item.taxGroupId)) {
      issues.push({ itemId: item.id, itemName: item.name, kind: 'MISSING_TAX_GROUP', detail: 'Assigned tax group no longer exists; falls back to the restaurant default rate.' });
    } else if (item.taxGroupId && !activeTaxGroupIds.has(item.taxGroupId)) {
      issues.push({ itemId: item.id, itemName: item.name, kind: 'INACTIVE_TAX_GROUP', detail: 'Assigned tax group is deactivated; check whether the applied rate is still correct.' });
    }

    const missingGroups = item.modifierGroupIds.filter((id) => !modifierGroupIds.has(id));
    if (missingGroups.length) {
      issues.push({ itemId: item.id, itemName: item.name, kind: 'MISSING_MODIFIER_GROUP', detail: `${missingGroups.length} customisation group(s) referenced here no longer exist.` });
    }
  }
  return issues;
}
