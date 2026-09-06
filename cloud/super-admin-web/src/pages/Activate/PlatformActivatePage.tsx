import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import { Button } from '../../components/ui';
// See ProtectedLayout.tsx for why this bypasses the '@jamanvaar/ui' barrel.
import { JAMANVAAR_LOGOS } from '../../../../../packages/ui/src/assets';
import '../Login/login.css';

/**
 * Public activation page for an invited platform teammate — reached from the
 * link in platformTeamInviteEmail. Mirrors the shape of tenant-side owner
 * activation (redeemed inside Restaurant Admin) but as a real clickable web
 * page, since this app already is one.
 */
export function PlatformActivatePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const email = searchParams.get('email') ?? '';
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email || !token) {
      setError('This activation link is missing required parameters. Ask a Platform Owner to resend your invitation.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/api/v1/platform-users/activate', { email, activationToken: token, password });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Activation failed — the link may have expired.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          <img src={JAMANVAAR_LOGOS.horizontal} alt="JAMANVAAR" className="login-brand-logo" />
          <div className="login-brand-meta">
            <span className="login-platform-tag">PLATFORM CONTROL</span>
            <span className="login-badge">ACTIVATE ACCOUNT</span>
          </div>
        </div>

        {done ? (
          <div className="login-form">
            <p style={{ fontSize: 14, color: '#0B253A', fontWeight: 600 }}>
              Your account is activated. You can now sign in.
            </p>
            <Button variant="primary" onClick={() => navigate('/login', { replace: true })} style={{ width: '100%', marginTop: 4 }}>
              Go to Login
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="login-form">
            <div className="field">
              <label htmlFor="activate-email">Email</label>
              <input id="activate-email" type="email" value={email} disabled />
            </div>
            <div className="field">
              <label htmlFor="activate-password">Choose a password</label>
              <input
                id="activate-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
              />
            </div>
            <div className="field">
              <label htmlFor="activate-confirm">Confirm password</label>
              <input
                id="activate-confirm"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat your password"
              />
            </div>

            {error && <div className="login-error">{error}</div>}

            <Button type="submit" variant="primary" disabled={submitting} style={{ width: '100%', marginTop: 4 }}>
              {submitting ? 'Activating…' : 'Activate Account'}
            </Button>
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <Link to="/login" style={{ fontSize: 12, color: '#64748b' }}>Already activated? Sign in</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
