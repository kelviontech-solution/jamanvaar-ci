import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { CommandActivity } from '@jamanvaar/sync';

/** Human labels for the command types a Super Admin / Restaurant Admin can dispatch remotely. */
const COMMAND_LABEL: Record<string, string> = {
  REQUEST_SYNC: 'Request Sync',
  REQUEST_HEALTH: 'Diagnostic Health Check',
  REQUEST_DIAGNOSTICS: 'Diagnostics',
  RESTART_APP: 'Application Restart',
  CLEAR_CACHE: 'Clear Application Cache',
  LOCK: 'Lock Terminal',
  UNLOCK: 'Unlock Terminal',
  FORCE_LOGOUT: 'Force Session Logout',
  APP_UPDATE: 'App Update'
};

/**
 * A brief, self-dismissing toast confirming a remotely dispatched command actually ran on this
 * terminal. Request Sync/Health/Diagnostics otherwise have zero visible effect -- without this, a
 * command that genuinely executed looked, from the screen, identical to one that never arrived.
 */
export const CommandActivityToast: React.FC = () => {
  const snapshot = useSyncExternalStore(
    (cb) => CommandActivity.subscribe(cb),
    () => CommandActivity.get(),
    () => CommandActivity.get()
  );
  const [visible, setVisible] = useState<typeof snapshot>(null);

  useEffect(() => {
    if (!snapshot) return;
    setVisible(snapshot);
    const timer = setTimeout(() => setVisible(null), 6000);
    return () => clearTimeout(timer);
  }, [snapshot]);

  if (!visible) return null;
  const ok = visible.status === 'SUCCEEDED';
  const label = COMMAND_LABEL[visible.commandType] ?? visible.commandType;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-[9500] flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-lg ${
        ok ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
      }`}
    >
      {ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
      <span>
        {label} {ok ? 'completed' : `failed${visible.error ? `: ${visible.error}` : ''}`}
      </span>
    </div>
  );
};
