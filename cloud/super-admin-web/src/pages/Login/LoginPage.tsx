import { API_BASE } from '../../api/client';
import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { ApiError } from '../../api/client';
import { AlertCircle } from 'lucide-react';
// Direct component imports avoid pulling @jamanvaar/ui barrel which pulls local sync singletons
import { JAMANVAARStartup } from '../../../../../packages/ui/src/JAMANVAARStartup';
import { JamanvaarAuthLayout } from '../../../../../packages/ui/src/JamanvaarAuthLayout';
import './login.css';

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  // If already authenticated, route straight to dashboard
  useEffect(() => {
    if (user) {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  async function submitLogin(loginEmail: string, loginPassword: string) {
    setError(null);
    setSubmitting(true);
    try {
      await login(loginEmail.trim(), loginPassword);
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error && err.message.includes('fetch')) {
        setError(`Cloud API is unreachable at ${API_BASE}. Please check your connection or that the backend is running.`);
      } else {
        setError('Invalid credentials or unauthorized access. Please verify and try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Please enter both your email address and password.');
      return;
    }
    await submitLogin(email, password);
  }

  return (
    <JAMANVAARStartup
      appName="Super Admin"
      appType="SUPER_ADMIN"
      subtitle="JAMANVAAR Cloud Platform Control"
    >
      <JamanvaarAuthLayout
        appIdentity="SUPER_ADMIN"
        appTitle="JAMANVAAR"
        appSubtitle="Enterprise Platform Control & SaaS Management"
        isOnline={isOnline}
        onToggleNetwork={() => setIsOnline((prev) => !prev)}
        heroHeadline="Platform Control."
        heroHighlightWord="Unified Cloud Engine."
        heroDescription="Centralized enterprise management suite for restaurant fleets, automated branch provisioning, license activation, and real-time operational analytics."
        capabilities={[
          { label: 'Tenant Fleet Control', icon: 'zap' },
          { label: 'License Provisioning', icon: 'cloud' },
          { label: 'Enterprise Analytics', icon: 'printer' },
          { label: 'Role-Based Security', icon: 'table' }
        ]}
        footerNote="Enterprise Grade Security • 99.99% Uptime SLA • Automated Backups"
        className="jamanvaar-superadmin-login"
      >
        <form onSubmit={handleSubmit} className="space-y-3.5 pt-2 text-left">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5 text-left">
              Super Admin Email *
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              placeholder="e.g. superadmin@jamanvaar.app"
              autoComplete="username"
              required
              className="w-full bg-[#FAF7F2] border border-[#EBE6DD] focus:border-[#E66817] focus:bg-white rounded-2xl px-4 py-3 text-sm text-[#0B253A] font-semibold focus:outline-hidden transition-colors"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700">Password *</label>
              <button
                type="button"
                onClick={() => setShowPassword((p) => !p)}
                className="text-[11px] text-[#E66817] hover:underline font-bold cursor-pointer"
              >
                {showPassword ? 'Hide Password' : 'Show Password'}
              </button>
            </div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
                className="w-full bg-[#FAF7F2] border border-[#EBE6DD] focus:border-[#E66817] focus:bg-white rounded-2xl px-4 py-3 text-sm text-[#0B253A] font-semibold focus:outline-hidden transition-colors"
              />
            </div>
          </div>

          {error && (
            <div className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-3.5 py-2.5 rounded-xl text-center flex items-center justify-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-slate-500 pt-0.5">
            <label className="flex items-center gap-2 cursor-pointer select-none font-medium">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="rounded accent-[#E66817]"
              />
              <span>Remember session</span>
            </label>
            <span className="text-slate-400 text-[11px] font-mono">Port 4000 • Live Cloud API</span>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 rounded-2xl bg-[#E66817] hover:bg-[#EA580C] disabled:opacity-50 text-white font-black text-xs sm:text-sm uppercase tracking-wider transition-all shadow-md shadow-orange-500/20 active:scale-[0.99] cursor-pointer mt-2 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                <span>Signing in to Platform Control…</span>
              </>
            ) : (
              <span>Sign In to Platform Control</span>
            )}
          </button>
        </form>
      </JamanvaarAuthLayout>
    </JAMANVAARStartup>
  );
}
