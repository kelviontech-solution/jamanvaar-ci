import React, { useEffect, useState } from 'react';
import { Modal } from '@jamanvaar/ui';
import { fetchCloudBranches, CloudBranch, CloudApiError } from '../../cloud/cloudClient';
import { Building2, Laptop2, Users as UsersIcon } from 'lucide-react';

interface BranchDirectoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Read-only directory of sibling branches under this restaurant. This app is
 * local-first and tied to one physical outlet's own database — there is no
 * live data pipe to another branch's terminal, so this deliberately does NOT
 * pretend to "switch" into another branch's menu/orders/tables. It answers
 * "how many outlets do I have and what's their status", which was previously
 * unanswerable from inside Restaurant Admin at all.
 */
export const BranchDirectoryModal: React.FC<BranchDirectoryModalProps> = ({ isOpen, onClose }) => {
  const [branches, setBranches] = useState<CloudBranch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    fetchCloudBranches()
      .then(setBranches)
      .catch((err) => setError(err instanceof CloudApiError ? err.message : 'Failed to load branches'))
      .finally(() => setLoading(false));
  }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Your Restaurant's Branches" maxWidth="lg">
      <div className="space-y-3 py-1">
        <p className="text-xs text-slate-500">
          Use the Workspace selector in the header to view consolidated restaurant totals
          or manage a specific branch. Branch creation and deactivation remain in Super Admin.
        </p>

        {loading && <div className="text-xs text-slate-500 py-6 text-center">Loading branches…</div>}

        {!loading && error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-xl px-3 py-2">
            {error}
          </div>
        )}

        {!loading && !error && branches.length === 0 && (
          <div className="text-xs text-slate-500 py-6 text-center">
            No other branches found. Ask Super Admin to add one for this restaurant.
          </div>
        )}

        {!loading && !error && branches.length > 0 && (
          <div className="space-y-2">
            {branches.map((b) => (
              <div key={b.id} className="flex items-center justify-between p-3 bg-jaman-ivory border border-jaman-border rounded-xl">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-brand/[0.07] text-brand flex items-center justify-center shrink-0">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-jaman-navy truncate">{b.name}</span>
                      <span className="text-[11px] font-mono text-slate-500">{b.code}</span>
                    </div>
                    {b.address && <div className="text-[11px] text-slate-500 truncate">{b.address}</div>}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="flex items-center gap-1 text-[11px] text-slate-500" title="Terminals">
                    <Laptop2 className="w-3.5 h-3.5" />{b._count.devices}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] text-slate-500" title="Staff logins">
                    <UsersIcon className="w-3.5 h-3.5" />{b._count.users}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                      b.status === 'ACTIVE'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-slate-100 text-slate-500 border-slate-200'
                    }`}
                  >
                    {b.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};
