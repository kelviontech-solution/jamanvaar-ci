import { useEffect, useState, type FormEvent } from 'react';
import { cloudRequestPasswordResetOwner, cloudVerifyPasswordResetOwner, cloudCompletePasswordResetOwner } from '../../cloud/cloudClient';
import './owner-password-recovery.css';

/** Shared by standalone QR Admin and Restaurant/Kiosk Admin. Secrets stay only in memory. */
export function OwnerPasswordRecovery({
  defaultRestaurantCode = '',
  onDone,
  onActivate
}: {
  defaultRestaurantCode?: string;
  onDone: () => void;
  onActivate?: () => void;
}) {
  const [step, setStep] = useState<'ID' | 'CODE' | 'PASSWORD' | 'DONE'>('ID');
  const [id, setId] = useState(defaultRestaurantCode),
    [otp, setOtp] = useState('');
  const [token, setToken] = useState(''),
    [password, setPassword] = useState(''),
    [confirm, setConfirm] = useState('');
  const [masked, setMasked] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [activation, setActivation] = useState(false),
    [show, setShow] = useState(false);
  const [resendAt, setResendAt] = useState(0),
    [expiresAt, setExpiresAt] = useState(0),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const remaining = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const fail = (err: unknown) => {
    const status = (err as { status?: number })?.status;
    setError(
      status === 429
        ? 'Too many attempts. Please wait a minute and try again.'
        : err instanceof Error
          ? err.message
          : 'Could not complete this step. Please try again.'
    );
  };
  async function send() {
    setBusy(true);
    setError('');
    setActivation(false);
    try {
      const result = await cloudRequestPasswordResetOwner(id.trim());
      if (result.activationRequired) {
        setActivation(true);
        setError('Activate your account using the invitation email before resetting its password.');
        return;
      }
      const time = Date.now();
      setNow(time);
      setMasked(result.maskedEmail);
      setResendAt(time + (result.retryAfterSeconds ?? 60) * 1000);
      setExpiresAt(time + (result.expiresInSeconds ?? 900) * 1000);
      setOtp('');
      setToken('');
      setPassword('');
      setConfirm('');
      setStep('CODE');
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (step === 'ID') return send();
    setError('');
    if (step === 'PASSWORD' && password !== confirm) return setError('The two passwords do not match.');
    setBusy(true);
    try {
      if (step === 'CODE') {
        const result = await cloudVerifyPasswordResetOwner(id.trim(), otp);
        const time = Date.now();
        setNow(time);
        setExpiresAt(time + result.expiresInSeconds * 1000);
        setToken(result.resetToken);
        setOtp('');
        setStep('PASSWORD');
      } else {
        await cloudCompletePasswordResetOwner(id.trim(), token, password);
        setToken('');
        setPassword('');
        setConfirm('');
        setStep('DONE');
      }
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="owner-recovery">
      <h2>
        {step === 'ID' ? 'Forgot your password?' : step === 'CODE' ? 'Check your email' : step === 'PASSWORD' ? 'Choose a new password' : 'Password changed'}
      </h2>
      <ol className="owner-recovery-steps" aria-label="Password recovery progress">
        {['Restaurant ID', 'Email code', 'New password'].map((label, index) => (
          <li key={label} aria-current={['ID', 'CODE', 'PASSWORD'].indexOf(step) === index ? 'step' : undefined}>
            {index + 1}. {label}
          </li>
        ))}
      </ol>
      {step === 'DONE' ? (
        <>
          <p role="status">Your password has been updated. Sign in with your new password. Your previous sessions have been signed out.</p>
          <button type="button" onClick={onDone}>
            Back to sign in
          </button>
        </>
      ) : (
        <>
          <p>
            {step === 'ID'
              ? 'Enter your Restaurant ID to request a code at your registered email.'
              : step === 'CODE'
                ? `A code was requested for ${masked || 'your registered email'}. Check your inbox and spam folder. Use the latest email if you requested another code.`
                : 'Your email code is verified. Enter your new password twice.'}
          </p>
          {step !== 'ID' && (
            <p className="owner-recovery-account">
              Restaurant ID: <strong>{id}</strong>
            </p>
          )}
          <form onSubmit={submit}>
            {step === 'ID' && (
              <label>
                Restaurant ID
                <input
                  aria-label="Restaurant ID"
                  autoComplete="username"
                  required
                  value={id}
                  onChange={(event) => setId(event.target.value.toUpperCase())}
                  maxLength={80}
                  placeholder="e.g. JM9876543210"
                />
              </label>
            )}
            {step === 'CODE' && (
              <label>
                6-digit recovery code
                <input
                  aria-label="6-digit recovery code"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  value={otp}
                  onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))}
                />
              </label>
            )}
            {step === 'PASSWORD' && (
              <>
                <label>
                  New password
                  <input
                    aria-label="New password"
                    autoComplete="new-password"
                    type={show ? 'text' : 'password'}
                    required
                    minLength={10}
                    maxLength={128}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </label>
                <label>
                  Confirm new password
                  <input
                    aria-label="Confirm new password"
                    autoComplete="new-password"
                    type={show ? 'text' : 'password'}
                    required
                    minLength={10}
                    maxLength={128}
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                  />
                </label>
                <p>Use at least 10 characters, including a letter and a number or symbol. Avoid common passwords.</p>
                <button className="owner-recovery-secondary" type="button" onClick={() => setShow((value) => !value)}>
                  {show ? 'Hide passwords' : 'Show passwords'}
                </button>
              </>
            )}
            {step !== 'ID' && (
              <p role="status">
                {remaining
                  ? `${step === 'CODE' ? 'Code' : 'Verified session'} expires in ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}.`
                  : 'This recovery step has expired. Request a new code below.'}
              </p>
            )}
            {error && (
              <p role="alert" className="owner-recovery-error">
                {error}
              </p>
            )}
            {activation && onActivate && (
              <button type="button" className="owner-recovery-secondary" onClick={onActivate}>
                Activate account
              </button>
            )}
            <button type="submit" disabled={busy || (step !== 'ID' && !remaining) || (step === 'CODE' && otp.length !== 6)}>
              {busy ? 'Please wait…' : step === 'ID' ? 'Email me a code' : step === 'CODE' ? 'Verify code' : 'Reset password'}
            </button>
          </form>
          {step !== 'ID' && (
            <>
              <button type="button" className="owner-recovery-secondary" disabled={busy || seconds > 0} onClick={() => void send()}>
                {seconds ? `Request a new code in ${seconds}s` : 'Send a new code'}
              </button>
              <p className="owner-recovery-hint">
                You can request another code after 60 seconds. Each new code works for 15 minutes and replaces the previous code.
              </p>
              <button
                type="button"
                className="owner-recovery-secondary"
                disabled={busy}
                onClick={() => {
                  setStep('ID');
                  setError('');
                  setOtp('');
                  setToken('');
                  setPassword('');
                  setConfirm('');
                }}
              >
                Use a different Restaurant ID
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
