import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, KeyRound } from 'lucide-react';
import { CloudApiError, requestPasswordResetOwner, resetPasswordOwner, getConnectedRestaurantId } from '../cloud/cloudClient';

interface Props {
  onBack: () => void;
  /** Called after the password was changed; the sign-in screen can say so. */
  onDone: () => void;
}

/**
 * "Forgot password" for the restaurant owner (spec section 34): this terminal already knows
 * which restaurant it's connected to, so there's no Restaurant ID to type — just request the
 * code (sent to the owner's recovery email, shown masked) and enter it with a new password.
 */
export const KioskForgotPasswordPanel: React.FC<Props> = ({ onBack, onDone }) => {
  const [step, setStep] = useState<'REQUEST' | 'CODE'>('REQUEST');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');

  const restaurantId = getConnectedRestaurantId();
  const fail = (err: unknown, fallback: string) => setError(err instanceof CloudApiError ? err.message : fallback);
  const inputClass = 'w-full bg-jaman-cream border border-jaman-border focus:border-jaman-saffron focus:bg-white rounded-2xl px-4 py-3 text-sm text-jaman-navy font-semibold focus:outline-hidden transition-colors';

  const sendCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!restaurantId) {
      setError('This terminal is not connected to a restaurant yet.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      const { maskedEmail: masked } = await requestPasswordResetOwner({ restaurantId });
      setMaskedEmail(masked);
      setStep('CODE');
    } catch (err) {
      fail(err, 'Could not send the code. Check your internet connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const submitReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!restaurantId) {
      setError('This terminal is not connected to a restaurant yet.');
      return;
    }
    if (newPassword.length < 8) return setError('Choose a password of at least 8 characters.');
    if (newPassword !== confirm) return setError('The two passwords do not match.');
    setBusy(true);
    try {
      await resetPasswordOwner({ restaurantId }, otp.trim(), newPassword);
      onDone();
    } catch (err) {
      fail(err, 'Could not reset the password. Check the code and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 pt-1">
      <div className="text-center space-y-1">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-bold">
          <KeyRound className="w-3.5 h-3.5 text-amber-600" />
          <span>FORGOT PASSWORD</span>
        </div>
        <h3 className="text-base font-black text-jaman-navy pt-1">Reset your password</h3>
        <p className="text-xs text-slate-500 max-w-xs mx-auto">
          {step === 'REQUEST' ? "We'll email a 6-digit code to your restaurant's recovery email." : 'Enter the code from your email and choose a new password.'}
        </p>
      </div>

      {step === 'REQUEST' ? (
        <form onSubmit={sendCode} className="space-y-3">
          {error && (
            <div className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-3.5 py-2 rounded-xl text-center flex items-center justify-center gap-1.5" role="alert">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <button type="submit" disabled={busy} className="w-full py-3.5 rounded-2xl bg-jaman-saffron hover:bg-[#EA580C] disabled:opacity-40 text-white font-black text-xs sm:text-sm uppercase tracking-wider transition-all shadow-md shadow-orange-500/20 active:scale-[0.99] cursor-pointer mt-2">
            {busy ? 'Sending…' : 'Email me a code'}
          </button>
        </form>
      ) : (
        <form onSubmit={submitReset} className="space-y-3">
          {maskedEmail && (
            <div className="text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3.5 py-2 rounded-xl flex items-start gap-1.5" role="status">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-px" />
              <span>Code sent to {maskedEmail}. It works for 15 minutes.</span>
            </div>
          )}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5 text-left">6-digit code *</label>
            <input type="text" inputMode="numeric" maxLength={6} value={otp} onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '')); setError(''); }} placeholder="123456" autoFocus required className={`${inputClass} text-center font-mono tracking-[0.4em]`} />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5 text-left">New password *</label>
            <input type="password" value={newPassword} onChange={(e) => { setNewPassword(e.target.value); setError(''); }} placeholder="At least 8 characters" required className={inputClass} />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5 text-left">Confirm new password *</label>
            <input type="password" value={confirm} onChange={(e) => { setConfirm(e.target.value); setError(''); }} placeholder="Type it again" required className={inputClass} />
          </div>
          {error && (
            <div className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-3.5 py-2 rounded-xl text-center flex items-center justify-center gap-1.5" role="alert">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <button type="submit" disabled={busy || otp.length !== 6} className="w-full py-3.5 rounded-2xl bg-jaman-saffron hover:bg-[#EA580C] disabled:opacity-40 text-white font-black text-xs sm:text-sm uppercase tracking-wider transition-all shadow-md shadow-orange-500/20 active:scale-[0.99] cursor-pointer mt-2">
            {busy ? 'Saving…' : 'Set new password'}
          </button>
          <button type="button" disabled={busy} onClick={() => void sendCode()} className="w-full py-2 text-center text-xs font-bold text-jaman-saffron hover:underline cursor-pointer">
            Send a new code
          </button>
        </form>
      )}

      <button type="button" onClick={onBack} className="w-full py-2.5 text-center text-xs font-bold text-slate-500 hover:text-jaman-navy transition-colors cursor-pointer">
        ← Back to Sign In
      </button>
    </div>
  );
};
