import React, { useState } from 'react';
import { AlertCircle, KeyRound } from 'lucide-react';
import { CloudApiError, cloudActivateOwner } from '../../cloud/cloudClient';

interface Props {
  defaultRestaurantCode?: string;
  defaultEmail?: string;
  defaultToken?: string;
  onBack: () => void;
  /** Called once the password is set; the sign-in screen can say so and take the Restaurant ID over. */
  onDone: (restaurantCode: string) => void;
}

/**
 * First-time activation for the restaurant owner: the Restaurant ID, the owner's email, the invitation token from the
 * welcome email, and the password they choose. Opening the emailed link pre-fills all three.
 */
export const ActivateOwnerPanel: React.FC<Props> = ({ defaultRestaurantCode = '', defaultEmail = '', defaultToken = '', onBack, onDone }) => {
  const [restaurantCode, setRestaurantCode] = useState(defaultRestaurantCode);
  const [email, setEmail] = useState(defaultEmail);
  const [token, setToken] = useState(defaultToken);
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const inputClass =
    'w-full bg-jaman-cream border border-jaman-border focus:border-brand focus:bg-white rounded-2xl px-4 py-3 text-sm text-jaman-navy font-semibold focus:outline-hidden transition-all';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 8) {
      setError('Use at least 8 characters for the password.');
      return;
    }
    if (newPassword !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await cloudActivateOwner({ restaurantCode: restaurantCode.trim(), email: email.trim(), activationToken: token.trim(), newPassword });
      onDone(restaurantCode.trim());
    } catch (err) {
      setError(err instanceof CloudApiError ? err.message : 'Could not activate the account. Check the details and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3.5 pt-2">
      <div className="flex items-center gap-2">
        <KeyRound className="w-4 h-4 text-slate-500" />
        <h3 className="text-sm font-bold text-jaman-navy">Activate your owner account</h3>
      </div>
      <p className="text-xs text-slate-500">
        Use the details from your JAMANVAAR welcome email. The invitation token works once and expires on the date shown in that email.
      </p>

      <div>
        <label htmlFor="owner-restaurant-id" className="text-xs font-bold text-slate-700 block mb-1.5">Restaurant ID *</label>
        <input id="owner-restaurant-id" className={`${inputClass} font-mono`} value={restaurantCode} onChange={(e) => setRestaurantCode(e.target.value)} placeholder="e.g. JM9876543210" required />
      </div>
      <div>
        <label htmlFor="owner-owner-email" className="text-xs font-bold text-slate-700 block mb-1.5">Owner email *</label>
        <input id="owner-owner-email" type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div>
        <label htmlFor="owner-invitation-token" className="text-xs font-bold text-slate-700 block mb-1.5">Invitation token *</label>
        <input id="owner-invitation-token" className={`${inputClass} font-mono`} value={token} onChange={(e) => setToken(e.target.value)} required />
      </div>
      <div>
        <label htmlFor="owner-new-password" className="text-xs font-bold text-slate-700 block mb-1.5">New password *</label>
        <input id="owner-new-password" type="password" className={inputClass} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} required />
      </div>
      <div>
        <label htmlFor="owner-confirm-new-password" className="text-xs font-bold text-slate-700 block mb-1.5">Confirm new password *</label>
        <input id="owner-confirm-new-password" type="password" className={inputClass} value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} required />
      </div>

      {error && (
        <div className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-3.5 py-2 rounded-xl text-center flex items-center justify-center gap-1.5" role="alert">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full py-3.5 rounded-2xl bg-brand hover:bg-brand-hover active:bg-brand-press disabled:opacity-50 text-white font-bold text-xs sm:text-sm uppercase tracking-wider transition-all"
      >
        {busy ? 'Activating…' : 'Activate Account'}
      </button>
      <div className="text-center">
        <button type="button" onClick={onBack} className="text-xs font-bold text-slate-500 hover:text-jaman-navy underline cursor-pointer">
          Back to sign in
        </button>
      </div>
    </form>
  );
};
