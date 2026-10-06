import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { api, ApiError } from '../../api/client';
import { Button } from '../../components/ui';
// See ProtectedLayout.tsx for why this bypasses the '@jamanvaar/ui' barrel.
import { JAMANVAAR_LOGOS } from '../../../../../packages/ui/src/assets';
import '../../components/shared.css';

/**
 * Public activation page for an invited platform teammate, reached from the emailed link.
 * The link carries the one-time token in the URL FRAGMENT (#email=..&token=..) so it is never sent
 * to a server or written to logs; links from older emails used a query string, still accepted.
 * The page asks the API about the link first, so an expired or already-used link is explained
 * up front instead of after a password has been typed (BUG-080/081).
 */

type LinkState = { kind: 'checking' } | { kind: 'valid'; fullName?: string } | { kind: 'expired' } | { kind: 'used' } | { kind: 'invalid' };

function readCredentials(): { email: string; token: string } {
  const fromFragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const fromQuery = new URLSearchParams(window.location.search);
  return {
    email: fromFragment.get('email') ?? fromQuery.get('email') ?? '',
    token: fromFragment.get('token') ?? fromQuery.get('token') ?? ''
  };
}

/** Mirrors the server's rules (cloud/api common/validation/password.ts) so feedback is instant. */
function passwordChecks(pw: string) {
  return [
    { ok: pw.length >= 10, label: 'At least 10 characters' },
    { ok: /[A-Za-z]/.test(pw), label: 'Includes a letter' },
    { ok: /[0-9]/.test(pw) || /[^A-Za-z0-9]/.test(pw), label: 'Includes a number or symbol' }
  ];
}

function strength(pw: string): { pct: number; label: string; color: string } {
  const passed = passwordChecks(pw).filter((c) => c.ok).length;
  let score = passed;
  if (pw.length >= 14) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  if (!pw) return { pct: 0, label: '', color: 'transparent' };
  if (score <= 2) return { pct: 25, label: 'Weak', color: 'var(--jv-error)' };
  if (score === 3) return { pct: 50, label: 'Fair', color: 'var(--jv-warning)' };
  if (score === 4) return { pct: 75, label: 'Good', color: '#65a30d' };
  return { pct: 100, label: 'Strong', color: 'var(--jv-success)' };
}

function Shell({ children, badge }: { children: React.ReactNode; badge: string }) {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <img src={JAMANVAAR_LOGOS.horizontal} alt="JAMANVAAR" className="auth-logo" />
          <span className="auth-badge">{badge}</span>
        </div>
        {children}
      </div>
    </div>
  );
}

export function PlatformActivatePage() {
  const navigate = useNavigate();
  const { email, token } = useMemo(readCredentials, []);

  const [link, setLink] = useState<LinkState>({ kind: 'checking' });
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!email || !token) {
      setLink({ kind: 'invalid' });
      return;
    }
    api
      .get<{ state: 'VALID' | 'EXPIRED' | 'USED' | 'INVALID'; fullName?: string }>(
        `/api/v1/platform-users/activation-status?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`
      )
      .then((res) => {
        if (res.state === 'VALID') setLink({ kind: 'valid', fullName: res.fullName });
        else setLink({ kind: res.state.toLowerCase() as 'expired' | 'used' | 'invalid' });
      })
      // If the check itself cannot run (offline), still show the form; the real activation will say what is wrong.
      .catch(() => setLink({ kind: 'valid' }));
  }, [email, token]);

  const checks = passwordChecks(password);
  const meter = strength(password);
  const allChecksPass = checks.every((c) => c.ok);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!allChecksPass) {
      setError('Your password does not meet all the requirements below.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/api/v1/platform-users/activate', { email, activationToken: token, password });
      // Get the one-time token out of the address bar and history.
      window.history.replaceState(null, '', window.location.pathname);
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.issues?.length) setError(err.issues.map((i) => i.message).join(' '));
      else setError(err instanceof ApiError ? err.message : 'Activation failed. The link may have expired.');
    } finally {
      setSubmitting(false);
    }
  }

  if (link.kind === 'checking') {
    return (
      <Shell badge="ACTIVATE ACCOUNT">
        <p className="page-loading">Checking your invitation…</p>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell badge="ACCOUNT ACTIVATED">
        <div className="auth-form">
          <div className="auth-success">
            <CheckCircle2 className="w-6 h-6" style={{ margin: '0 auto 6px' }} />
            Your account is activated.
          </div>
          <Button variant="primary" size="lg" onClick={() => navigate('/login', { replace: true })} style={{ width: '100%' }}>
            Sign in
          </Button>
        </div>
      </Shell>
    );
  }

  if (link.kind !== 'valid') {
    const content = {
      expired: {
        icon: <Clock className="w-6 h-6" />,
        title: 'This invitation has expired',
        text: 'Invitations are valid for 7 days. Ask a Platform Owner to send you a new one.'
      },
      used: {
        icon: <CheckCircle2 className="w-6 h-6" />,
        title: 'This account is already activated',
        text: 'You have already chosen a password for this account. Sign in to continue.'
      },
      invalid: {
        icon: <AlertTriangle className="w-6 h-6" />,
        title: 'This invitation link is not valid',
        text: 'The link is incomplete or was replaced by a newer invitation. Use the most recent email, or ask a Platform Owner to resend it.'
      }
    }[link.kind];
    return (
      <Shell badge="ACTIVATE ACCOUNT">
        <div className="auth-form" style={{ textAlign: 'center' }}>
          <div style={{ color: link.kind === 'used' ? 'var(--jv-success)' : 'var(--jv-warning)', display: 'flex', justifyContent: 'center' }}>{content.icon}</div>
          <h1 className="auth-title">{content.title}</h1>
          <p className="auth-subtitle">{content.text}</p>
          <Button variant="primary" size="lg" onClick={() => navigate('/login', { replace: true })} style={{ width: '100%' }}>
            Go to sign in
          </Button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell badge="ACTIVATE ACCOUNT">
      <form onSubmit={handleSubmit} className="auth-form" noValidate>
        <div>
          <h1 className="auth-title">{link.fullName ? `Welcome, ${link.fullName}` : 'Set your password'}</h1>
          <p className="auth-subtitle">Choose a password to finish setting up your platform account.</p>
        </div>

        <div className="form-field">
          <label htmlFor="activate-email">Email</label>
          <input id="activate-email" type="email" value={email} disabled />
        </div>

        <div className="form-field">
          <label htmlFor="activate-password">Choose a password</label>
          <div style={{ position: 'relative' }}>
            <input
              id="activate-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 10 characters"
              style={{ paddingRight: 44 }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--jv-text-muted)' }}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <div className="password-meter" style={{ marginTop: 8 }} aria-hidden="true">
            <span style={{ width: `${meter.pct}%`, background: meter.color }} />
          </div>
          <div className="muted" style={{ fontSize: 11, marginTop: 4, minHeight: 14 }}>{meter.label}</div>
          <ul style={{ listStyle: 'none', margin: '4px 0 0', padding: 0, fontSize: 12 }}>
            {checks.map((c) => (
              <li key={c.label} style={{ color: c.ok ? 'var(--jv-success)' : 'var(--jv-text-muted)' }}>
                {c.ok ? '✓' : '○'} {c.label}
              </li>
            ))}
          </ul>
        </div>

        <div className="form-field">
          <label htmlFor="activate-confirm">Confirm password</label>
          <input
            id="activate-confirm"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repeat your password"
          />
          {confirmPassword && password !== confirmPassword && (
            <div className="form-error" style={{ fontSize: 12 }}>Passwords do not match.</div>
          )}
        </div>

        {error && <div className="auth-error" role="alert">{error}</div>}

        <Button type="submit" variant="primary" disabled={submitting} style={{ width: '100%' }}>
          {submitting ? 'Activating…' : 'Activate account'}
        </Button>
        <div style={{ textAlign: 'center' }}>
          <Link to="/login" style={{ fontSize: 12, color: 'var(--jv-text-muted)' }}>Already activated? Sign in</Link>
        </div>
      </form>
    </Shell>
  );
}
