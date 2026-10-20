import { useState, type FormEvent } from 'react';
import { cloudRecoverRestaurantId } from '../../cloud/cloudClient';
import { OwnerPasswordRecovery } from './OwnerPasswordRecovery';

interface Props {
  defaultRestaurantCode?: string;
  onBack: () => void;
  onActivate: () => void;
  onDone: () => void;
}
export function ForgotPasswordPanel({ defaultRestaurantCode, onBack, onActivate, onDone }: Props) {
  const [discovery, setDiscovery] = useState(false),
    [email, setEmail] = useState('');
  const [sent, setSent] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function recoverId(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await cloudRecoverRestaurantId(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not request recovery. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="owner-recovery">
      {discovery ? (
        <>
          <h2>Find your Restaurant ID</h2>
          <form onSubmit={recoverId}>
            <label>
              Registered owner email
              <input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <p>Restaurant IDs are sent only to the registered owner email. No passwords or activation keys are disclosed.</p>
            {sent && (
              <p role="status">If this email owns an active restaurant, its Restaurant IDs have been requested by email. Check your inbox and spam folder.</p>
            )}
            {error && (
              <p role="alert" className="owner-recovery-error">
                {error}
              </p>
            )}
            <button type="submit" disabled={busy}>
              {busy ? 'Please wait...' : 'Email my Restaurant IDs'}
            </button>
          </form>
          <button
            type="button"
            className="owner-recovery-secondary"
            onClick={() => {
              setDiscovery(false);
              setError('');
            }}
          >
            I have my Restaurant ID
          </button>
        </>
      ) : (
        <>
          <OwnerPasswordRecovery defaultRestaurantCode={defaultRestaurantCode} onDone={onDone} onActivate={onActivate} />
          <button
            type="button"
            className="owner-recovery-secondary"
            onClick={() => {
              setDiscovery(true);
              setError('');
            }}
          >
            Forgot your Restaurant ID?
          </button>
        </>
      )}
      <button type="button" className="owner-recovery-secondary" onClick={onBack}>
        Back to sign in
      </button>
    </div>
  );
}
