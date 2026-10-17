import { useMemo } from 'react';
import { Modal, Button } from '@jamanvaar/ui';
import { scanChannelConsistency, type ChannelConsistencyIssue } from '@jamanvaar/database';

const KIND_LABEL: Record<ChannelConsistencyIssue['kind'], string> = {
  CHANNEL_SPLIT: 'Shows differently across channels',
  MISSING_TAX_GROUP: 'Tax group missing',
  INACTIVE_TAX_GROUP: 'Tax group deactivated',
  MISSING_MODIFIER_GROUP: 'Customisation group missing'
};

/**
 * #3: POS, Kiosk and QR all read the one shared MenuItem record, so price/tax/modifiers cannot
 * literally diverge by data -- the real risk is each channel's own menu filter disagreeing on
 * WHICH items to show (confirmed and fixed for POS/Captain's missing salesChannels check; see
 * channel_consistency.ts) or a tax/modifier reference pointing at something that no longer
 * exists. This reviews both in one place instead of requiring item-by-item inspection.
 */
export function ChannelConsistencyModal({ onClose }: { onClose: () => void }) {
  const issues = useMemo(() => scanChannelConsistency(), []);
  const grouped = useMemo(() => {
    const byItem = new Map<string, { itemName: string; issues: ChannelConsistencyIssue[] }>();
    for (const issue of issues) {
      const entry = byItem.get(issue.itemId) ?? { itemName: issue.itemName, issues: [] };
      entry.issues.push(issue);
      byItem.set(issue.itemId, entry);
    }
    return [...byItem.entries()];
  }, [issues]);

  return (
    <Modal isOpen onClose={onClose} title="Channel & Menu Consistency Check" maxWidth="2xl">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          POS, Kiosk, QR and Captain all read the same menu record, so price, tax rate and customisations are always identical across channels.
          This checks the two things that can still differ: which channels actually show a dish, and whether its tax or customisation references are still valid.
        </p>
        {grouped.length === 0 ? (
          <p className="text-sm text-emerald-700 font-bold py-4">No inconsistencies found. Every active dish resolves the same way across channels, with valid tax and customisation references.</p>
        ) : (
          <div className="max-h-96 overflow-auto space-y-3">
            {grouped.map(([itemId, { itemName, issues: itemIssues }]) => (
              <div key={itemId} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="font-bold text-sm text-jaman-navy">{itemName}</p>
                <ul className="mt-1 space-y-1 text-xs text-slate-700">
                  {itemIssues.map((issue, i) => (
                    <li key={i}>
                      <b>{KIND_LABEL[issue.kind]}:</b> {issue.detail}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  );
}
