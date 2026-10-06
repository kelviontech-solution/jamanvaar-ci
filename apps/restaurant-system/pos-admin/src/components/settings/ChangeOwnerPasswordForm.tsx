import React, { useState } from 'react';
import { CloudApiError, cloudChangeOwnerPassword } from '../../cloud/cloudClient';

/** The signed-in owner changes their own password. Needs the current one, so anyone at an open terminal cannot take over the account. */
export const ChangeOwnerPasswordForm: React.FC = () => {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setDone(false);
    if (next.length < 8) {
      setError('Use at least 8 characters for the new password.');
      return;
    }
    if (next !== confirm) {
      setError('The two new passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await cloudChangeOwnerPassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      setDone(true);
    } catch (err) {
      setError(err instanceof CloudApiError ? err.message : 'Could not change the password. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-white rounded-2xl p-5 border border-jaman-border shadow-2xs space-y-3">
      <h3 className="text-sm font-bold text-jaman-navy">Change owner password</h3>
      <div className="form-grid">
        <div className="field">
          <label>Current password</label>
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </div>
        <div className="field">
          <label>New password</label>
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)} minLength={8} required />
        </div>
        <div className="field">
          <label>Confirm new password</label>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} required />
        </div>
      </div>
      {error && <div className="form-error">{error}</div>}
      {done && <div className="text-xs font-bold text-emerald-700">Your password was changed.</div>}
      <button
        type="submit"
        disabled={busy}
        className="w-full sm:w-auto px-6 py-2.5 bg-jaman-navy hover:bg-jaman-darkBorder disabled:opacity-40 text-white font-bold text-xs rounded-2xl transition-colors cursor-pointer"
      >
        {busy ? 'Saving…' : 'Change password'}
      </button>
    </form>
  );
};
