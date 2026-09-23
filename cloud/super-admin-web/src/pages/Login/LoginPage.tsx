import { API_BASE } from '../../api/client';
import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { ApiError } from '../../api/client';
import { AlertCircle, CheckCircle2, ShieldCheck } from 'lucide-react';
// Direct component imports avoid pulling @jamanvaar/ui barrel which pulls local sync singletons
import { JAMANVAARStartup } from '../../../../../packages/ui/src/JAMANVAARStartup';
import { JamanvaarAuthLayout } from '../../../../../packages/ui/src/JamanvaarAuthLayout';
import './login.css';

const RESEND_COOLDOWN_SECONDS = 45;
const inputClass =
  'w-full bg-[#FAF7F2] border border-[#EBE6DD] focus:border-[#E66817] focus:bg-white rounded-2xl px-4 py-3 text-sm text-[#0B253A] font-semibold focus:outline-hidden transition-colors';

export function LoginPage() {
  const { user, requestLogin, verifyOtp, resendOtp } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<'CREDENTIALS' | 'OTP'>('CREDENTIALS');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  const [otpToken, setOtpToken] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [justResent, setJustResent] = useState(false);
  const otpInputRef = useRef<HTMLInputElement>(null);

  // If already authenticated, route straight to dashboard
  useEffect(() => {
    if (user) {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    if (step === 'OTP') otpInputRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  function unreachableOrFallback(err: unknown, fallback: string) {
    if (err instanceof ApiError) return err.message;
    if (err instanceof Error && err.message.includes('fetch')) {
      return `Cloud API is unreachable at ${API_BASE}. Please check your connection or that the backend is running.`;
    }
    return fallback;
  }

  async function handleCredentialsSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Please enter both your email address and password.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const challenge = await requestLogin(email.trim(), password);
      setOtpToken(challenge.otpToken);
      setMaskedEmail(challenge.maskedEmail);
      setOtp('');
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      setStep('OTP');
    } catch (err) {
      setError(unreachableOrFallback(err, 'Invalid credentials or unauthorized access. Please verify and try again.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleOtpSubmit(e: FormEvent) {
    e.preventDefault();
    if (otp.length !== 6) return;
    setError(null);
    setSubmitting(true);
    try {
      await verifyOtp(otpToken, otp);
      navigate('/', { replace: true });
    } catch (err) {
      setError(unreachableOrFallback(err, 'That code is not valid or has expired. Ask for a new one.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (resendCooldown > 0) return;
    setError(null);
    setJustResent(false);
    try {
      const result = await resendOtp(otpToken);
      setMaskedEmail(result.maskedEmail);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      setJustResent(true);
    } catch (err) {
      setError(unreachableOrFallback(err, 'Could not send a new code. Try again in a moment.'));
    }
  }

  function backToCredentials() {
    setStep('CREDENTIALS');
    setOtp('');
    setOtpToken('');
    setError(null);
    setPassword('');
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
        {step === 'CREDENTIALS' ? (
          <form onSubmit={handleCredentialsSubmit} className="space-y-3.5 pt-2 text-left">
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
                autoFocus
                required
                className={inputClass}
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
                  className={inputClass}
                />
              </div>
            </div>

            {error && (
              <div className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-3.5 py-2.5 rounded-xl text-center flex items-center justify-center gap-2" role="alert">
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
                  <span>Checking credentials…</span>
                </>
              ) : (
                <span>Continue</span>
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleOtpSubmit} className="space-y-3.5 pt-2 text-left">
            <div className="text-center space-y-1">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-bold">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                <span>VERIFY IT'S YOU</span>
              </div>
              <p className="text-xs text-slate-500 max-w-xs mx-auto pt-1">
                We emailed a 6-digit code to <span className="font-bold text-[#0B253A]">{maskedEmail}</span>. Enter it below to sign in to Platform Control.
              </p>
            </div>

            {justResent && (
              <div className="text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3.5 py-2 rounded-xl flex items-start gap-1.5" role="status">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-px" />
                <span>A new code is on its way.</span>
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5 text-left">6-digit code *</label>
              <input
                ref={otpInputRef}
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(e) => {
                  setOtp(e.target.value.replace(/\D/g, ''));
                  setError(null);
                }}
                placeholder="123456"
                required
                className={`${inputClass} text-center font-mono text-lg tracking-[0.4em]`}
              />
            </div>

            {error && (
              <div className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-3.5 py-2.5 rounded-xl text-center flex items-center justify-center gap-2" role="alert">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || otp.length !== 6}
              className="w-full py-3.5 rounded-2xl bg-[#E66817] hover:bg-[#EA580C] disabled:opacity-50 text-white font-black text-xs sm:text-sm uppercase tracking-wider transition-all shadow-md shadow-orange-500/20 active:scale-[0.99] cursor-pointer mt-2 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  <span>Verifying…</span>
                </>
              ) : (
                <span>Verify & Sign In</span>
              )}
            </button>

            <button
              type="button"
              disabled={resendCooldown > 0}
              onClick={handleResend}
              className="w-full py-2 text-center text-xs font-bold text-[#E66817] hover:underline disabled:opacity-40 disabled:no-underline cursor-pointer disabled:cursor-not-allowed"
            >
              {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
            </button>

            <button
              type="button"
              onClick={backToCredentials}
              className="w-full py-2.5 text-center text-xs font-bold text-slate-500 hover:text-[#0B253A] transition-colors cursor-pointer"
            >
              ← Back to Sign In
            </button>
          </form>
        )}
      </JamanvaarAuthLayout>
    </JAMANVAARStartup>
  );
}
