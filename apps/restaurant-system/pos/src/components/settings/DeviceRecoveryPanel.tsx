import React, { useState } from 'react';
import { db, unprotectRecovery } from '@jamanvaar/database';

/** Local device recovery is separate from a restaurant's cloud business snapshot. */
export function DeviceRecoveryPanel() {
  const [passphrase, setPassphrase] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setMessage(''); setError(false);
    try { await action(); }
    catch (failure) { setError(true); setMessage(failure instanceof Error ? failure.message : 'Recovery action failed. Your data was not replaced.'); }
    finally { setBusy(false); }
  };
  const download = () => run(async () => {
    if (passphrase !== confirmation) throw Error('The recovery passphrases do not match.');
    const file = await db.exportProtectedLocalRecovery(passphrase);
    const url = URL.createObjectURL(new Blob([file], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `jamanvaar-device-recovery-${new Date().toISOString().replace(/[:.]/g, '-')}.jvrecovery`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setPassphrase(''); setConfirmation('');
    setMessage('Encrypted recovery file prepared for download. Keep a copy off this device and keep its passphrase separately. Download preparation does not verify that an off-device copy exists.');
  });
  const verify = (file: File) => run(async () => {
    if (file.size > 96 * 1024 * 1024) throw Error('This recovery file exceeds the supported size.');
    const snapshot = await unprotectRecovery(await file.text(), passphrase, db.localRecoveryScope());
    setPassphrase(''); setConfirmation('');
    setMessage(`File decrypted and its restaurant/branch verified: ${snapshot.commands.length} saved operation records. This check did not restore or replace data. A complete restore still needs an empty compatible target and a verified recovery procedure.`);
  });
  return <section className="rounded-2xl border border-jaman-border bg-white p-5 space-y-4">
    <div><h3 className="text-lg font-bold text-jaman-navy">Device recovery backup</h3>
      <p className="text-sm text-slate-600 mt-1">Protect this terminal's SQLite data, replay history and local keys in one encrypted file. This covers this device's local store; cloud files and other devices need their own backups.</p></div>
    <fieldset disabled={busy} className="space-y-3 min-w-0">
      <label className="block text-sm font-semibold">Recovery passphrase
        <input type="password" autoComplete="new-password" minLength={12} maxLength={1024} value={passphrase} onChange={event => setPassphrase(event.target.value)} className="mt-1 block w-full min-h-11 rounded-xl border border-jaman-border px-3"/>
      </label>
      <label className="block text-sm font-semibold">Confirm passphrase for a new backup
        <input type="password" autoComplete="new-password" maxLength={1024} value={confirmation} onChange={event => setConfirmation(event.target.value)} className="mt-1 block w-full min-h-11 rounded-xl border border-jaman-border px-3"/>
      </label>
      <p className="text-xs text-slate-600">Use at least 12 characters. The passphrase is not saved; a forgotten passphrase cannot be recovered from this file.</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={passphrase.length < 12 || passphrase !== confirmation} onClick={download} className="min-h-11 rounded-xl bg-jaman-navy text-white px-4 font-bold disabled:opacity-40">Download encrypted device backup</button>
        <label className={`min-h-11 inline-flex items-center rounded-xl border border-jaman-border px-4 font-semibold ${passphrase.length < 12 ? 'opacity-40' : 'cursor-pointer'}`}>Verify an existing recovery file
          <input aria-label="Verify encrypted device recovery file" type="file" accept=".jvrecovery" disabled={passphrase.length < 12} className="sr-only" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void verify(file); }}/>
        </label>
      </div>
    </fieldset>
    {busy && <p role="status" className="text-sm">Processing encrypted recovery file…</p>}
    {message && <p role={error ? 'alert' : 'status'} className={`text-sm rounded-xl p-3 ${error ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800'}`}>{message}</p>}
  </section>;
}
