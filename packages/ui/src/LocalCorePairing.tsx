import React, { useState } from 'react';

export interface LocalCorePairingProps {
  serverUrl: string;
  paired?: boolean;
  onPair: (pin: string, url: string) => Promise<void>;
}

/** Injected transport keeps the shared login UI independent of the database singleton. */
export function LocalCorePairing({ serverUrl, paired, onPair }: LocalCorePairingProps) {
  const [url, setUrl] = useState(serverUrl);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  return <form data-testid="local-core-pairing" className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-slate-800" onSubmit={async e => {
    e.preventDefault();
    setBusy(true); setMessage('');
    try { await onPair(pin, url); setPin(''); setMessage('Local Core paired and sync connected.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Pairing failed. Check the server address and PIN.'); }
    finally { setBusy(false); }
  }}>
    <div className="font-bold">Local Core {paired ? '(paired)' : 'setup'}</div>
    <p className="text-xs text-slate-600">Activate this device first. Enter the six-digit pairing PIN shown in the Local Core server console. Pair each app once for this restaurant and branch. Cloud login and cloud sync work independently.</p>
    <label className="block text-xs font-semibold">Local Core address
      <input aria-label="Local Core address" value={url} onChange={e => setUrl(e.target.value)} required className="mt-1 block w-full rounded-lg border p-2" placeholder="http://localhost:5178" />
    </label>
    <label className="block text-xs font-semibold">Pairing PIN
      <input aria-label="Local Core pairing PIN" type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={e => setPin(e.target.value)} required pattern="[0-9]{6}" className="mt-1 block w-full rounded-lg border p-2" />
    </label>
    <button disabled={busy} type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Pairing…' : 'Pair Local Core'}</button>
    {message && <p role="status" className="text-sm">{message}</p>}
  </form>;
}
