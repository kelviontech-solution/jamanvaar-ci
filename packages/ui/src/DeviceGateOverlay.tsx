import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Lock, WifiOff, RefreshCw, Download } from 'lucide-react';
import { DeviceGate, type DeviceGateCode } from '@jamanvaar/sync';

export interface DeviceGateOverlayProps {
  /** Shown in the headline, e.g. "POS Terminal", "Kitchen Display". */
  appName: string;
  /** How often to re-check the offline grace period. Default: every minute. */
  offlineCheckMs?: number;
}

const TITLES: Record<DeviceGateCode, string> = {
  DEVICE_REVOKED: 'Device revoked',
  RESTAURANT_SUSPENDED: 'Account suspended',
  RESTAURANT_INACTIVE: 'Account inactive',
  SUBSCRIPTION_INACTIVE: 'No active subscription',
  APP_DISABLED: 'App not enabled',
  BRANCH_INACTIVE: 'Branch deactivated',
  DEVICE_LOCKED: 'Terminal locked',
  // Never actually shown by this overlay: DeviceGate resolves this automatically (see its own comment) rather
  // than locking the terminal. Kept here only because the type requires every DeviceGateCode to have a title.
  INVALID_DEVICE_CREDENTIAL: 'Device not recognised',
  UPDATE_REQUIRED: 'Update required',
  OFFLINE_LIMIT: 'Check-in required'
};

/**
 * Full-screen lock shown when the platform has stopped this RESTAURANT (or this terminal by admin decision)
 * from operating at all: the app is disabled, the restaurant is suspended or out of subscription, a branch was
 * deactivated, an admin locked this specific terminal, a required update has not been installed, or the
 * terminal has been offline too long. None of these are something the terminal can fix by itself, so a
 * full-screen block that says exactly that (and who to contact) is the right, honest thing to show — the same
 * way "this workspace has been suspended" pages work in other SaaS products.
 *
 * It deliberately never appears for a stale or revoked device credential (DEVICE_REVOKED,
 * INVALID_DEVICE_CREDENTIAL): that is not a decision about this restaurant, it is just this one terminal's own
 * saved sign-in going bad, fixed in seconds by activating again — DeviceGate handles that itself (see its own
 * `onIdentityInvalid`), unbinding the terminal and returning it to its own ordinary activation screen instead
 * of ever showing this overlay for it.
 */
export const DeviceGateOverlay: React.FC<DeviceGateOverlayProps> = ({ appName, offlineCheckMs = 60_000 }) => {
  const state = useSyncExternalStore(
    (cb) => DeviceGate.subscribe(cb),
    () => JSON.stringify(DeviceGate.getState()),
    () => JSON.stringify(DeviceGate.getState())
  );
  const gate = JSON.parse(state) as ReturnType<typeof DeviceGate.getState>;
  const [code, setCode] = useState('');
  const [codeMessage, setCodeMessage] = useState<string | null>(null);

  useEffect(() => {
    DeviceGate.evaluateOffline();
    const id = setInterval(() => DeviceGate.evaluateOffline(), offlineCheckMs);
    return () => clearInterval(id);
  }, [offlineCheckMs]);

  if (!gate.locked || !gate.code) return null;

  const Icon = gate.code === 'OFFLINE_LIMIT' ? WifiOff : Lock;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="device-gate-title"
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-[#0B253A]/95 p-6 backdrop-blur-sm"
    >
      <div className="w-full max-w-md space-y-5 rounded-3xl bg-white p-8 text-center shadow-2xl">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-red-200 bg-red-50">
          <Icon className="h-8 w-8 text-red-600" />
        </div>
        <div>
          <h1 id="device-gate-title" className="text-xl font-black text-[#0B253A]">
            {TITLES[gate.code]}
          </h1>
          <p className="mt-1 text-xs font-bold uppercase tracking-wider text-[#4A5568]">{appName}</p>
        </div>
        <p className="text-sm text-[#4A5568]">{gate.message}</p>
        {gate.reason && (
          <p className="rounded-xl border border-[#EBE6DD] bg-[#FAF7F2] px-3 py-2 text-xs font-semibold text-[#0B253A]">
            Reason: {gate.reason.replace(/\s*Download:\s*https?:\/\/\S+/, '')}
          </p>
        )}
        {gate.code === 'UPDATE_REQUIRED' && /https?:\/\/\S+/.test(gate.reason ?? '') && (
          <a
            href={/https?:\/\/\S+/.exec(gate.reason ?? '')![0]}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-[#E66817] px-4 py-2 text-sm font-bold text-white"
          >
            <Download className="h-4 w-4" />
            Download the update
          </a>
        )}
        {gate.code === 'OFFLINE_LIMIT' && (
          <div className="space-y-2 rounded-xl border border-[#EBE6DD] bg-[#FAF7F2] p-3 text-left">
            <label htmlFor="extension-code" className="text-xs font-bold text-[#0B253A]">
              Have an emergency extension code from support?
            </label>
            <textarea
              id="extension-code"
              rows={2}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Paste the code here"
              className="w-full rounded-lg border border-[#EBE6DD] p-2 text-xs"
            />
            <button
              type="button"
              disabled={!code.trim()}
              onClick={async () => {
                const result = await DeviceGate.applyExtensionCode(code);
                setCodeMessage(result.ok ? 'Extension applied.' : result.reason);
                if (result.ok) setCode('');
              }}
              className="rounded-lg bg-[#0B253A] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
            >
              Apply code
            </button>
            {codeMessage && <p className="text-xs font-semibold text-[#4A5568]" role="status">{codeMessage}</p>}
          </div>
        )}
        <p className="flex items-center justify-center gap-2 text-xs text-[#4A5568]">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          Checking again automatically. This screen clears once access is restored.
        </p>
        <div className="space-y-1 border-t border-[#EBE6DD] pt-4">
          <button
            type="button"
            onClick={() => DeviceGate.disconnectTerminal()}
            className="w-full rounded-xl border border-[#0B253A] px-4 py-2.5 text-sm font-bold text-[#0B253A] hover:bg-[#0B253A] hover:text-white"
          >
            Use a different activation key
          </button>
          <p className="text-[11px] text-[#8A94A6]">Disconnects this terminal from this restaurant and returns to the activation screen. Nothing is deleted.</p>
        </div>
        {gate.since && (
          <p className="text-[10px] text-[#8A94A6]">Locked since {new Date(gate.since).toLocaleString()}</p>
        )}
      </div>
    </div>
  );
};
