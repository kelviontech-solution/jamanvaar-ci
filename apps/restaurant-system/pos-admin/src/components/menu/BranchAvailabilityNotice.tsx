import { useEffect, useState } from 'react';
import { qrApi } from '../../cloud/cloudClient';
import { activeAdminBranch } from '../../adminBranchScope';

/** A task may be unavailable at one branch while the shared dish is still enabled. */
export function BranchAvailabilityNotice({ itemId }: { itemId?: string }) {
  const [off, setOff] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const branchId = activeAdminBranch && activeAdminBranch !== 'all' ? activeAdminBranch : null;
  useEffect(() => {
    let live = true;
    setOff(false);
    setMessage('');
    if (!itemId || !branchId) return;
    void qrApi<{ overrides: { itemId: string; isAvailable?: boolean }[] }>('/api/v1/menu/branch-overrides?branchId=' + encodeURIComponent(branchId))
      .then((r) => {
        if (live) setOff(r.overrides.some((o) => o.itemId === itemId && o.isAvailable === false));
      })
      .catch((e) => {
        if (live) setMessage(e.message);
      });
    return () => {
      live = false;
    };
  }, [itemId, branchId]);
  if (!itemId || !branchId || (!off && !message)) return null;
  return (
    <section aria-label="Branch availability task" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm space-y-2">
      <strong>{off ? 'This dish has a branch availability override.' : 'Branch availability check'}</strong>
      {off && (
        <p>
          The shared dish may show In Stock below while this branch keeps it unavailable. Restore this branch to the shared menu setting; other branches retain
          their overrides.
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {off && (
        <button
          type="button"
          disabled={busy}
          className="min-h-11 rounded-xl border bg-white px-4 font-bold disabled:opacity-50"
          onClick={async () => {
            setBusy(true);
            setMessage('');
            try {
              await qrApi('/api/v1/menu/branch-overrides', { method: 'PUT', body: JSON.stringify({ branchId, itemId, isAvailable: null }) });
              setOff(false);
              setMessage('Branch override removed. The shared dish setting now applies. Publish and check delivery in Devices & sync.');
            } catch (e) {
              setMessage(e instanceof Error ? e.message : 'Could not restore availability');
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Restoring…' : 'Use shared availability for this branch'}
        </button>
      )}
    </section>
  );
}
