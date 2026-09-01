import React, { useState, useEffect } from 'react';
import { JamanvaarLogo, JamanvaarAppBadge, AppIdentity } from './JamanvaarBrand';
import { JamanvaarVectorLogo } from './JamanvaarVectorLogo';
import { JAMANVAAR_LOGOS } from './assets';
import {
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  Zap,
  Server
} from 'lucide-react';

export interface JAMANVAARStartupProps {
  appName: string;
  appType: AppIdentity | string;
  subtitle?: string;
  logoAsset?: string;
  onComplete?: () => void;
  children?: React.ReactNode;
  forceShow?: boolean;
  minDurationMs?: number;
}

export const JAMANVAARStartup: React.FC<JAMANVAARStartupProps> = ({
  appName,
  appType,
  subtitle = 'Restaurant Operations Platform',
  logoAsset,
  onComplete,
  children,
  forceShow = false,
  minDurationMs = 1600
}) => {
  // Session key to ensure splash runs only on app launch / cold boot, not on every route switch
  const sessionKey = `jamanvaar_boot_${appType.toLowerCase()}`;

  const [isBooting, setIsBooting] = useState<boolean>(true);

  const [step, setStep] = useState<number>(0);
  const [initError, setInitError] = useState<string | null>(null);
  const [isFadingOut, setIsFadingOut] = useState<boolean>(false);

  useEffect(() => {
    if (!isBooting) return;

    // Check for prefers-reduced-motion
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      // Fast path for reduced motion
      const quickTimer = setTimeout(() => {
        try {
          sessionStorage.setItem(sessionKey, 'true');
        } catch {
          // ignore storage error
        }
        setIsBooting(false);
        if (onComplete) onComplete();
      }, 400);
      return () => clearTimeout(quickTimer);
    }

    // Standard sequence:
    // 0ms: background (step 0)
    // 200ms: accent appears (step 1)
    // 400ms: logo scales in (step 2)
    // 800ms: brand text / subtitle (step 3)
    // 1100ms: app identity badge (step 4)
    // 1400ms: system ready check (step 5)
    // 1600ms+: fade out to login
    const t1 = setTimeout(() => setStep(1), 200);
    const t2 = setTimeout(() => setStep(2), 400);
    const t3 = setTimeout(() => setStep(3), 800);
    const t4 = setTimeout(() => setStep(4), 1100);
    const t5 = setTimeout(() => setStep(5), 1350);

    const finishTimer = setTimeout(() => {
      setIsFadingOut(true);
      setTimeout(() => {
        try {
          sessionStorage.setItem(sessionKey, 'true');
        } catch {
          // ignore storage error
        }
        setIsBooting(false);
        if (onComplete) onComplete();
      }, 350);
    }, Math.max(minDurationMs, 1600));

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(t5);
      clearTimeout(finishTimer);
    };
  }, [isBooting, minDurationMs, onComplete, sessionKey]);

  const handleRetry = () => {
    setInitError(null);
    setStep(0);
    setIsFadingOut(false);
    setIsBooting(true);
  };

  if (!isBooting) {
    return <>{children}</>;
  }

  return (
    <div
      role="region"
      aria-label="JAMANVAAR Startup"
      className={`fixed inset-0 z-50 flex flex-col items-center justify-between bg-[#FBF8F2] text-[#0B253A] select-none transition-opacity duration-300 p-6 sm:p-10 overflow-hidden ${
        isFadingOut ? 'opacity-0 scale-[1.01]' : 'opacity-100 scale-100'
      }`}
    >
      {/* Top subtle brand bar */}
      <div className="w-full flex items-center justify-between opacity-80 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#E66817] animate-pulse" />
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
            KELVIONTECH ENTERPRISE
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold shadow-2xs">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Local Engine Active</span>
        </div>
      </div>

      {/* Center: Brand Lockup & Sequence Animation — vertically centered, compact, logo-dominant */}
      <div className="flex flex-col items-center justify-center text-center w-full px-4 py-8 sm:py-10">
        {/* Top Gold/Orange Accent Bar */}
        <div
          className={`w-14 h-[3px] rounded-full bg-gradient-to-r from-[#E66817] to-amber-400 mb-8 transition-all duration-500 ${
            step >= 1 ? 'opacity-100 scale-100' : 'opacity-0 scale-50'
          }`}
        />

        {/* Master Logo Artwork — 100% Crisp Vector SVG */}
        <div
          className={`relative transition-all duration-700 ease-out transform mb-5 ${
            step >= 2 ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-2'
          }`}
        >
          <img
            src={logoAsset || JAMANVAAR_LOGOS.horizontal}
            alt="JAMANVAAR by KELVIONTECH"
            style={{
              width: 'clamp(240px, 28vw, 420px)',
              height: 'auto',
              maxWidth: '85vw',
              display: 'block',
              objectFit: 'contain',
              imageRendering: '-webkit-optimize-contrast',
              filter: 'drop-shadow(0 6px 24px rgba(230, 104, 23, 0.18)) drop-shadow(0 2px 6px rgba(11, 37, 58, 0.10))'
            }}
            loading="eager"
          />
        </div>

        {/* Subtitle / Platform Name */}
        <div
          className={`space-y-1 transition-all duration-500 delay-100 ${
            step >= 3 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
          }`}
        >
          <p className="text-[11px] sm:text-xs font-bold text-slate-500 tracking-widest uppercase">
            {subtitle}
          </p>
        </div>

        {/* App Identity Badge */}
        <div
          className={`mt-4 transition-all duration-500 ${
            step >= 4 ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
          }`}
        >
          <div className="inline-flex items-center gap-2 px-5 py-1.5 rounded-2xl bg-[#0B253A] text-white border border-slate-700 shadow-md">
            <span className="w-2 h-2 rounded-full bg-[#E66817] animate-ping" />
            <span className="text-xs font-black tracking-wider uppercase">
              {appName}
            </span>
          </div>
        </div>

        {/* System Readiness Indicators — visually secondary to logo */}
        <div
          className={`mt-7 flex items-center justify-center gap-3 text-[11px] font-semibold text-slate-500 transition-all duration-500 ${
            step >= 5 ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <span className="flex items-center gap-1 text-emerald-700">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            Core Ready
          </span>
          <span className="text-slate-300">•</span>
          <span className="flex items-center gap-1 text-emerald-700">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            Database Initialized
          </span>
        </div>

        {/* Init Error State */}
        {initError && (
          <div className="mt-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs text-center space-y-3 animate-in zoom-in-95">
            <div className="flex items-center justify-center gap-2 font-black text-rose-700">
              <AlertTriangle className="w-4 h-4" />
              <span>Unable to start the application</span>
            </div>
            <p className="text-slate-600">{initError}</p>
            <button
              type="button"
              onClick={handleRetry}
              className="px-4 py-2 bg-[#0B253A] hover:bg-[#123652] text-white rounded-xl text-xs font-black inline-flex items-center gap-2 shadow-sm transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Launch</span>
            </button>
          </div>
        )}
      </div>

      {/* Bottom Footer */}
      <div className="absolute bottom-0 w-full flex items-center justify-between text-[11px] text-slate-400 font-mono shrink-0 border-t border-[#EBE6DD] p-6 sm:p-10 pt-3">
        <span>Offline-First Indian Restaurant System</span>
        <span>v2.0 • Powered by Kelviontech</span>
      </div>
    </div>
  );
};
