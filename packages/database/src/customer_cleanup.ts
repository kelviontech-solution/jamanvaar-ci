import type { CustomerAccount } from '@jamanvaar/types';
import { mergeCustomerLoyalty } from '@jamanvaar/types';
import { normalizeIndianPhone } from '@jamanvaar/utils';
import { db } from './db';
import { KeyValueStore } from './key_value_store';
import { stableCollectionSignature } from './collection_sync';
import { AuditRepository } from './repositories';

/**
 * Duplicate-customer merge, mirroring menu_cleanup.ts's scan -> confirm -> archive-and-remap
 * shape. CustomerRepository.getOrCreateAccount/createCustomer already stop *new* duplicates by
 * normalizing the phone at the shared creation choke point (B2-043) -- this tool finds existing
 * accounts created before that normalization, or imported/restored around it, where two stored
 * phone strings resolve to the same number.
 */
export interface CustomerDuplicateGroup { id: string; canonicalPhone: string; phones: string[] }
export interface CustomerCleanupReport { tenantId: string | null; groups: CustomerDuplicateGroup[]; totalCustomers: number; fingerprint: string }

const fingerprint = () =>
  stableCollectionSignature([...db.customerAccounts].sort((a, b) => a.phone.localeCompare(b.phone)).map((c) => {
    const { updatedAt, ...record } = c;
    return record;
  }));

export const customerCleanupReportIsCurrent = (report: CustomerCleanupReport) =>
  report.tenantId === KeyValueStore.get('jamanvaar_tenant_id') && report.fingerprint === fingerprint();

export function scanCustomerDuplicates(): CustomerCleanupReport {
  const buckets = new Map<string, CustomerAccount[]>();
  for (const cust of db.customerAccounts) {
    const key = normalizeIndianPhone(cust.phone) || cust.phone;
    buckets.set(key, [...(buckets.get(key) || []), cust]);
  }
  const groups: CustomerDuplicateGroup[] = [];
  for (const [key, accounts] of buckets) {
    if (accounts.length < 2) continue;
    // Canonical = the profile with the most real activity, so its order/loyalty history reads
    // naturally after the merge rather than being overwritten by a near-empty duplicate.
    const ranked = [...accounts].sort((a, b) =>
      (b.totalVisits ?? 0) - (a.totalVisits ?? 0) ||
      (Date.parse(b.lastVisitAt ?? '') || 0) - (Date.parse(a.lastVisitAt ?? '') || 0) ||
      (b.loyaltyPoints ?? 0) - (a.loyaltyPoints ?? 0)
    );
    groups.push({ id: key, canonicalPhone: ranked[0].phone, phones: ranked.map((a) => a.phone) });
  }
  return { tenantId: KeyValueStore.get('jamanvaar_tenant_id'), groups, totalCustomers: db.customerAccounts.length, fingerprint: fingerprint() };
}

/**
 * Merges every other profile in the group into `canonicalPhone`. Loyalty points, baseline and
 * ledger go through mergeCustomerLoyalty (the same routine the sync bridge uses to combine two
 * devices' copies of one account) so merging never double-counts or drops an earned adjustment.
 * Every order referencing a merged-away phone is repointed to the canonical one so order history,
 * reports and receipts keep working. Explicit confirmation only; nothing is deleted silently.
 */
export function mergeCustomerDuplicates(
  report: CustomerCleanupReport,
  groupId: string,
  canonicalPhone: string,
  actorName: string
): { merged: number; ordersRemapped: number } {
  if (report.tenantId !== KeyValueStore.get('jamanvaar_tenant_id') || report.fingerprint !== fingerprint()) {
    throw Error('Customer records changed since this scan. Scan again before merging.');
  }
  const group = report.groups.find((g) => g.id === groupId);
  if (!group) throw Error('This duplicate group no longer exists. Scan again.');
  if (!group.phones.includes(canonicalPhone)) throw Error('Choose a profile that belongs to this duplicate group.');

  return db.transaction(() => {
    const canonical = db.customerAccounts.find((c) => c.phone === canonicalPhone);
    if (!canonical) throw Error('The chosen profile no longer exists. Scan again.');
    const duplicatePhones = group.phones.filter((p) => p !== canonicalPhone);
    const duplicates = duplicatePhones.map((p) => db.customerAccounts.find((c) => c.phone === p)).filter((c): c is CustomerAccount => !!c);
    let ordersRemapped = 0;
    for (const dup of duplicates) {
      const merged = mergeCustomerLoyalty(canonical, dup);
      // mergeCustomerLoyalty keeps whichever side is "newer" for plain fields (it is built for
      // reconciling two snapshots of the SAME identity) -- here the two phones are different
      // people's separate entries of one real guest, so union/prefer-non-empty is the correct
      // merge for name/contact/segment fields instead of a wholesale pick.
      canonical.loyaltyBaseline = merged.loyaltyBaseline;
      canonical.loyaltyLedger = merged.loyaltyLedger;
      canonical.loyaltyPoints = merged.loyaltyPoints;
      canonical.totalSpend = merged.totalSpend;
      canonical.totalVisits = merged.totalVisits;
      canonical.marketingConsent = merged.marketingConsent;
      canonical.followups = merged.followups;
      canonical.recentOrderIds = Array.from(new Set([...(canonical.recentOrderIds ?? []), ...(dup.recentOrderIds ?? [])])).slice(0, 20);
      canonical.favoriteItemIds = Array.from(new Set([...(canonical.favoriteItemIds ?? []), ...(dup.favoriteItemIds ?? [])]));
      canonical.tags = Array.from(new Set([...(canonical.tags ?? []), ...(dup.tags ?? [])]));
      canonical.email ||= dup.email;
      canonical.address ||= dup.address;
      canonical.dob ||= dup.dob;
      canonical.anniversary ||= dup.anniversary;
      if (dup.notes && dup.notes !== canonical.notes) canonical.notes = canonical.notes ? `${canonical.notes}\n${dup.notes}` : dup.notes;
      for (const order of db.orders) {
        if (order.customerPhone === dup.phone) {
          order.customerPhone = canonical.phone;
          ordersRemapped++;
        }
      }
      db.customerAccounts = db.customerAccounts.filter((c) => c.phone !== dup.phone);
    }
    canonical.updatedAt = new Date().toISOString();
    AuditRepository.log({
      action: 'CUSTOMER_PROFILES_MERGED',
      category: 'CUSTOMER',
      details: `Merged ${duplicates.length} duplicate profile(s) (${duplicatePhones.join(', ')}) into ${canonical.phone} (${canonical.name || 'unnamed'}); ${ordersRemapped} order(s) repointed.`,
      username: actorName
    });
    db.notify();
    return { merged: duplicates.length, ordersRemapped };
  });
}
