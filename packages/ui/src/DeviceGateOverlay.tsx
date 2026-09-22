import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Lock, WifiOff, ShieldOff, RefreshCw, Download, Unlink } from 'lucide-react';
import { DeviceGate, type DeviceGateCode } from '@jamanvaar/sync';

export interface DeviceGateOverlayProps {
  /** Shown in the headline, e.g. "POS Terminal", "Kitchen Display". */
  appName: string;
  /** How often to re-check the offline grace period. Default: every minute. */
  offlineCheckMs?: number;
  /**
   * Clears this terminal's own saved activation (restaurant id, device id/token) and reloads it back to the
   * connect/activation screen. Offered only for the two lock reasons a fresh activation actually fixes
   * (DEVICE_REVOKED, INVALID_DEVICE_CREDENTIAL) — the other reasons need the platform admin to change
   * something elsewhere, so re-activating this device would not help.
   *
   * Without this, a terminal that genuinely needs re-activating had no way back to the activation screen at
   * all: the overlay covers the whole app and nothing on it ever led anywhere, so it just sat "checking again
   * automatically" forever (BUG-145 follow-up — reported as the terminal "going round and round").
   */
  onResetTerminal?: () => void;
}

/** Lock reasons a fresh activation of THIS terminal actually resolves. */
const RESET_FIXES_CODES: ReadonlySet<DeviceGateCode> = new Set(['DEVICE_REVOKED', 'INVALID_DEVICE_CREDENTIAL']);

const TITLES: Record<DeviceGateCode, string> = {
  DEVICE_REVOKED: 'Device revoked',
  RESTAURANT_SUSPENDED: 'Account suspended',
  RESTAURANT_INACTIVE: 'Account inactive',
  SUBSCRIPTION_INACTIVE: 'No active subscription',
  APP_DISABLED: 'App not enabled',
  BRANCH_INACTIVE: 'Branch deactivated',
  DEVICE_LOCKED: 'Terminal locked',
  INVALID_DEVICE_CREDENTIAL: 'Device not recognised',
  UPDATE_REQUIRED: 'Update required',
  OFFLINE_LIMIT: 'Check-in required'
};

/**
 * Full-screen lock shown when the platform has stopped allowing this terminal
 * to run (app disabled, device locked or revoked, restaurant suspended,
 * subscription lapsed, or offline for too long). It is an overlay, not a
 * replacement for the app, so the app's sync loop keeps running underneath and
 * the screen goes away by itself as soon as the cloud accepts the terminal again.
 */
export const DeviceGateOverlay: React.FC<DeviceGateOverlayProps> = ({ appName, offlineCheckMs = 60_000, onResetTerminal }) => {
  const state = useSyncExternalStore(
    (cb) => DeviceGate.subscribe(cb),
    () => JSON.stringify(DeviceGate.getState()),
    () => JSON.stringify(DeviceGate.getState())
  );
  const gate = JSON.parse(state) as ReturnType<typeof DeviceGate.getState>;
  const [code, setCode] = useState('');
  const [codeMessage, setCodeMessage] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);

  // A fresh lock reason means "reset it" is no longer the right offer for whatever is showing now — collapse
  // the confirm step rather than leaving it open under a different message.
  useEffect(() => {
    setConfirmingReset(false);
  }, [gate.code]);

  useEffect(() => {
    DeviceGate.evaluateOffline();
    const id = setInterval(() => DeviceGate.evaluateOffline(), offlineCheckMs);
    return () => clearInterval(id);
  }, [offlineCheckMs]);

  if (!gate.locked || !gate.code) return null;

  const Icon = gate.code === 'OFFLINE_LIMIT' ? WifiOff : gate.code === 'DEVICE_REVOKED' ? ShieldOff : Lock;

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
        {onResetTerminal && gate.code && RESET_FIXES_CODES.has(gate.code) && (
          <div className="space-y-2 rounded-xl border border-[#EBE6DD] bg-[#FAF7F2] p-3 text-left">
            {!confirmingReset ? (
              <button
                type="button"
                onClick={() => setConfirmingReset(true)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#0B253A]/20 px-4 py-2 text-sm font-bold text-[#0B253A] hover:bg-white"
              >
                <Unlink className="h-4 w-4" />
                Reset this terminal
              </button>
            ) : (
              <>
                <p className="text-xs font-semibold text-[#0B253A]">
                  This clears this terminal's saved sign-in and returns it to the activation screen. You will need a new activation key from your platform administrator.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmingReset(false)}
                    className="flex-1 rounded-lg border border-[#EBE6DD] px-3 py-1.5 text-xs font-bold text-[#4A5568]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={onResetTerminal}
                    className="flex-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700"
                  >
                    Reset terminal
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        <p className="flex items-center justify-center gap-2 text-xs text-[#4A5568]">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          Checking again automatically. This screen clears once access is restored.
        </p>
        {gate.since && (
          <p className="text-[10px] text-[#8A94A6]">Locked since {new Date(gate.since).toLocaleString()}</p>
        )}
      </div>
    </div>
  );
};
