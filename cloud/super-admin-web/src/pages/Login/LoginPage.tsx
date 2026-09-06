import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { ApiError } from '../../api/client';
import { Button } from '../../components/ui';
// See ProtectedLayout.tsx for why this bypasses the '@jamanvaar/ui' barrel.
import { JAMANVAAR_LOGOS } from '../../../../../packages/ui/src/assets';
import './login.css';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error && err.message.includes('fetch')) {
        setError('Cloud API is unreachable at http://localhost:4000. Please ensure the backend is running.');
      } else {
        setError('Something went wrong. Please check your credentials and try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          <img
            src={JAMANVAAR_LOGOS.horizontal}
            alt="JAMANVAAR"
            className="login-brand-logo"
          />
          <div className="login-brand-meta">
            <span className="login-platform-tag">PLATFORM CONTROL</span>
            <span className="login-badge">SUPER ADMIN</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@jamanvaar.app"
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <Button type="submit" variant="primary" disabled={submitting} style={{ width: '100%', marginTop: 4 }}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </div>
    </div>
  );
}

