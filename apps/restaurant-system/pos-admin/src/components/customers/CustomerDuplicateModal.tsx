import { useEffect, useState } from 'react';
import { Modal, Button, useConfirm } from '@jamanvaar/ui';
import {
  db,
  scanCustomerDuplicates,
  mergeCustomerDuplicates,
  customerCleanupReportIsCurrent,
  type CustomerCleanupReport
} from '@jamanvaar/database';
import { formatINR } from '@jamanvaar/utils';
import { getCurrentAdminName } from '../../currentAdminIdentity';

/** Owner-visible merge tool for CustomerRepository's duplicate detection (scanCustomerDuplicates). */
export function CustomerDuplicateModal({ onClose }: { onClose: () => void }) {
  const [report, setReport] = useState<CustomerCleanupReport>(() => scanCustomerDuplicates());
  const [canonical, setCanonical] = useState<Record<string, string>>({});
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const { confirm, confirmDialog } = useConfirm();
  useEffect(() => db.subscribe(() => setStale(!customerCleanupReportIsCurrent(report))), [report]);

  const rescan = () => {
    setReport(scanCustomerDuplicates());
    setStale(false);
    setMessage('');
  };

  const profile = (phone: string) => db.customerAccounts.find((c) => c.phone === phone);

  return (
    <>
      <Modal isOpen onClose={busy ? () => undefined : onClose} title="Find Duplicate Customers" maxWidth="3xl">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {report.totalCustomers} customer profile(s) scanned · {report.groups.length} group(s) share the same phone number once formatting is ignored (e.g. "+91 98765 43210" vs "9876543210").
            Merging combines loyalty points, visit history and consent into one profile and repoints their past orders; nothing is deleted without your confirmation.
          </p>
          {stale && <p role="alert" className="text-rose-700 font-bold text-sm">Customer records changed since this scan. Scan again before merging.</p>}
          <Button variant="outline" disabled={busy} onClick={rescan}>Scan Again</Button>

          {report.groups.length === 0 ? (
            <p className="text-sm text-slate-500 py-4">No duplicate phone numbers found. New accounts are already deduplicated automatically when created.</p>
          ) : (
            <div className="max-h-96 overflow-auto space-y-3">
              {report.groups.map((group) => {
                const chosen = canonical[group.id] || group.canonicalPhone;
                return (
                  <fieldset key={group.id} className="rounded-xl border border-jaman-border p-3 space-y-2">
                    <legend className="font-bold text-sm text-jaman-navy">{group.phones.length} profiles, same number</legend>
                    <label className="block text-xs font-bold text-slate-600">
                      Keep as the merged profile
                      <select
                        aria-label={`Canonical profile for group ${group.id}`}
                        disabled={busy}
                        value={chosen}
                        onChange={(e) => setCanonical((c) => ({ ...c, [group.id]: e.target.value }))}
                        className="block border border-jaman-border p-2 rounded-lg w-full mt-1 text-sm font-semibold"
                      >
                        {group.phones.map((phone) => {
                          const p = profile(phone);
                          return (
                            <option key={phone} value={phone}>
                              {phone} — {p?.name || 'Unnamed'} — {p?.loyaltyPoints ?? 0} pts — {formatINR(p?.totalSpend ?? 0)} lifetime
                            </option>
                          );
                        })}
                      </select>
                    </label>
                    <ul className="text-xs text-slate-600 space-y-0.5">
                      {group.phones.filter((p) => p !== chosen).map((phone) => {
                        const p = profile(phone);
                        return (
                          <li key={phone}>
                            Will merge into above: {phone} — {p?.name || 'Unnamed'} — {p?.loyaltyPoints ?? 0} pts, {p?.totalVisits ?? 0} visits
                          </li>
                        );
                      })}
                    </ul>
                    <Button
                      variant="danger"
                      disabled={busy || stale}
                      onClick={async () => {
                        if (!(await confirm({
                          title: 'Merge duplicate profiles?',
                          message: `Every other profile in this group will be merged into ${chosen}. Loyalty points and visit history combine; their past orders move to this profile. This cannot be undone automatically.`,
                          confirmLabel: 'Merge profiles',
                          tone: 'danger'
                        }))) return;
                        setBusy(true);
                        setMessage('');
                        try {
                          const result = mergeCustomerDuplicates(report, group.id, chosen, getCurrentAdminName());
                          setMessage(`Merged ${result.merged} duplicate profile(s); ${result.ordersRemapped} order(s) repointed to ${chosen}.`);
                          rescan();
                        } catch (error) {
                          setMessage(error instanceof Error ? error.message : 'Could not merge these profiles.');
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Merge This Group
                    </Button>
                  </fieldset>
                );
              })}
            </div>
          )}
          {message && <p role="status" className="text-sm font-bold text-jaman-navy">{message}</p>}
          <div className="flex justify-end">
            <Button variant="outline" disabled={busy} onClick={onClose}>Close</Button>
          </div>
        </div>
      </Modal>
      {confirmDialog}
    </>
  );
}
