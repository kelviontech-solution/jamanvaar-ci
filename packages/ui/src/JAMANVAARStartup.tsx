import React, { useState, useEffect, useMemo } from 'react';
import { AppIdentity } from './JamanvaarBrand';
import { JAMANVAAR_LOGOS } from './assets';
import {
  AlertTriangle,
  RefreshCw,
  ShieldCheck
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

/**
 * Resolves a refined default subtitle if a custom subtitle is not provided.
 */
export function resolveAppSubtitle(appType: string, customSubtitle?: string): string {
  if (customSubtitle) {
    return customSubtitle;
  }
  return 'Restaurant Operations Platform';
}

/**
 * Resolves the application role badge text in a clean, consistent uppercase format.
 */
export function resolveRoleBadge(appName: string, appType: string): string {
  const type = String(appType).toUpperCase();
  switch (type) {
    case 'ADMIN':
      return 'RESTAURANT ADMIN';
    case 'POS':
      return 'POS TERMINAL';
    case 'CAPTAIN':
      return 'CAPTAIN';
    case 'SUPER_ADMIN':
      return 'SUPER ADMIN';
    case 'KDS':
      return 'KITCHEN DISPLAY (KDS)';
    case 'KIOSK_ADMIN':
      return 'KIOSK MANAGEMENT';
    case 'KIOSK':
      return 'SELF-ORDER KIOSK';
    default:
      return (appName || type).toUpperCase().replace(/\s+APP$/i, '');
  }
}

/**
 * In-memory set of apps that have already completed their startup sequence
 * during the active page session.
 * 
 * Ensures:
 * 1. Every browser refresh (F5 / reload) or initial load shows the splash screen.
 * 2. Internal state transitions (e.g., login -> dashboard, route switching) skip the splash.
 */
const runtimeBootedApps = new Set<string>();

/**
 * JAMANVAARStartup — Minimal Luxury Indian Hospitality Splash & Boot Screen.
 *
 * Visual Direction:
 * - Warm luxury ivory/cream paper canvas (#FAF8F5).
 * - Subtle ambient radial glow behind the central brand hero.
 * - Extremely faint geometric Indian watermark pattern (tactile stationery feel).
 * - Delicate inset hairline framing border with corner diamond pips.
 * - Perfectly centered brand lockup:
 *     1. Thin gold ornament (───── ◆ ─────)
 *     2. Master high-DPI JAMANVAAR by KELVIONTECH logo
 *     3. Tracked RESTAURANT OPERATIONS PLATFORM descriptor
 *     4. Clean, understated role badge ([ RESTAURANT ADMIN ], [ POS TERMINAL ], etc.)
 *     5. Minimal status indicators (● Core Engine Ready • ● Database Initialized • ● Local-First Mode)
 *     6. Micro-shimmer progress line
 * - Decoupled, quiet top brand header and single-line system footer.
 */
export const JAMANVAARStartup: React.FC<JAMANVAARStartupProps> = ({
  appName,
  appType,
  subtitle,
  logoAsset,
  onComplete,
  children,
  forceShow = false,
  minDurationMs = 1600
}) => {
  const sessionKey = `jamanvaar_boot_${String(appType).toLowerCase()}`;

  const [isBooting, setIsBooting] = useState<boolean>(() => {
    if (forceShow) return true;
    return !runtimeBootedApps.has(sessionKey);
  });

  const [step, setStep] = useState<number>(0);
  const [initError, setInitError] = useState<string | null>(null);
  const [isFadingOut, setIsFadingOut] = useState<boolean>(false);

  const displaySubtitle = useMemo(
    () => resolveAppSubtitle(String(appType), subtitle),
    [appType, subtitle]
  );

  const roleBadge = useMemo(
    () => resolveRoleBadge(appName, String(appType)),
    [appName, appType]
  );

  useEffect(() => {
    if (!isBooting) return;

    // Check for prefers-reduced-motion
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      const quickTimer = setTimeout(() => {
        runtimeBootedApps.add(sessionKey);
        try {
          sessionStorage.setItem(sessionKey, 'true');
        } catch {
          // ignore storage error
        }
        setIsBooting(false);
        if (onComplete) onComplete();
      }, 350);
      return () => clearTimeout(quickTimer);
    }

    // Choreographed Premium Sequence:
    // 0ms: Soft warm ivory canvas and framing border
    // 100ms: Delicate gold ornament fades in
    // 250ms: Master logo fades in and gently rises into center
    // 500ms: Platform descriptor subtitle reveals
    // 750ms: Clean role badge reveals
    // 1000ms: Status indicators & micro-shimmer line appear
    // 1600ms+: Smooth fade-out into application
    const t1 = setTimeout(() => setStep(1), 100);
    const t2 = setTimeout(() => setStep(2), 250);
    const t3 = setTimeout(() => setStep(3), 500);
    const t4 = setTimeout(() => setStep(4), 750);
    const t5 = setTimeout(() => setStep(5), 1000);

    const finishTimer = setTimeout(() => {
      setIsFadingOut(true);
      setTimeout(() => {
        runtimeBootedApps.add(sessionKey);
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
    runtimeBootedApps.delete(sessionKey);
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
      className={`fixed inset-0 z-50 overflow-hidden select-none bg-[#FAF8F5] text-[#0B253A] flex items-center justify-center transition-all duration-500 ${
        isFadingOut ? 'opacity-0 scale-[1.005] pointer-events-none' : 'opacity-100 scale-100'
      }`}
    >
      {/* ── LAYER 1: Subtle Luxury Stationery Canvas & Watermark ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        {/* Soft Radial Warm Glow behind Logo */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(circle 640px at 50% 50%, rgba(230, 104, 23, 0.045) 0%, rgba(197, 160, 89, 0.025) 45%, transparent 75%)'
          }}
        />

        {/* Extremely faint Indian-inspired geometric watermark pattern */}
        <svg
          className="absolute inset-0 w-full h-full opacity-[0.035]"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern
              id="jamanvaar-stationery-pattern"
              width="60"
              height="60"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 30 0 L 60 30 L 30 60 L 0 30 Z"
                fill="none"
                stroke="#C5A059"
                strokeWidth="0.75"
              />
              <circle cx="30" cy="30" r="1.5" fill="#C5A059" />
              <circle cx="0" cy="0" r="1" fill="#C5A059" />
              <circle cx="60" cy="0" r="1" fill="#C5A059" />
              <circle cx="0" cy="60" r="1" fill="#C5A059" />
              <circle cx="60" cy="60" r="1" fill="#C5A059" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#jamanvaar-stationery-pattern)" />
        </svg>

        {/* Refined Framing Border with Corner Diamond Accents */}
        <div className="absolute inset-4 sm:inset-6 md:inset-8 border border-[#EAE3D6]/80 rounded-2xl sm:rounded-3xl pointer-events-none">
          <div className="absolute -top-1 -left-1 w-2 h-2 rotate-45 border border-[#C5A059]/60 bg-[#FAF8F5]" />
          <div className="absolute -top-1 -right-1 w-2 h-2 rotate-45 border border-[#C5A059]/60 bg-[#FAF8F5]" />
          <div className="absolute -bottom-1 -left-1 w-2 h-2 rotate-45 border border-[#C5A059]/60 bg-[#FAF8F5]" />
          <div className="absolute -bottom-1 -right-1 w-2 h-2 rotate-45 border border-[#C5A059]/60 bg-[#FAF8F5]" />
        </div>
      </div>

      {/* ── LAYER 2: Ambient Header & Footer Chrome (Decoupled from Center) ── */}
      <header className="absolute top-0 inset-x-0 p-6 sm:p-8 md:px-12 flex items-center justify-between pointer-events-auto z-20">
        <div className="flex items-center gap-2.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#E66817] shadow-[0_0_6px_rgba(230,104,23,0.6)]" />
          <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 tracking-[0.22em] uppercase font-mono">
            KELVIONTECH ENTERPRISE
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-emerald-800 bg-emerald-50/85 border border-emerald-200/70 px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wide shadow-2xs backdrop-blur-xs">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Local Engine Active</span>
          </div>
        </div>
      </header>

      <footer className="absolute bottom-0 inset-x-0 p-6 sm:p-8 md:px-12 flex items-center justify-between text-[10px] sm:text-[11px] text-slate-400 font-mono tracking-wider pointer-events-auto z-20">
        <span className="flex items-center gap-2">
          <span className="w-1 h-1 rounded-full bg-slate-300" />
          OFFLINE-FIRST INDIAN RESTAURANT SYSTEM
        </span>
        <span>v2.0 • POWERED BY KELVIONTECH</span>
      </footer>

      {/* ── LAYER 3: Perfectly Centered Brand Lockup ── */}
      <main className="relative z-20 flex flex-col items-center justify-center text-center max-w-xl w-full mx-auto px-4 py-8 pointer-events-auto">
        {/* Delicate Top Gold Line & Diamond Ornament */}
        <div
          className={`flex items-center justify-center gap-3 mb-6 transition-all duration-700 ease-out ${
            step >= 1 ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
          }`}
        >
          <div className="w-12 sm:w-16 h-[1px] bg-gradient-to-r from-transparent via-[#C5A059]/70 to-[#C5A059]/30" />
          <div className="w-1.5 h-1.5 rotate-45 border border-[#C5A059] bg-[#C5A059]/20" />
          <div className="w-12 sm:w-16 h-[1px] bg-gradient-to-l from-transparent via-[#C5A059]/70 to-[#C5A059]/30" />
        </div>

        {/* Master JAMANVAAR Logo — High-DPI Vector Crispness */}
        <div
          className={`relative transition-all duration-700 ease-out transform mb-2 ${
            step >= 2 ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-2'
          }`}
        >
          <img
            src={logoAsset || JAMANVAAR_LOGOS.horizontal}
            alt="JAMANVAAR by KELVIONTECH"
            style={{
              width: 'clamp(240px, 28vw, 380px)',
              height: 'auto',
              maxWidth: '85vw',
              display: 'block',
              objectFit: 'contain',
              imageRendering: '-webkit-optimize-contrast',
              filter:
                'drop-shadow(0 8px 24px rgba(11, 37, 58, 0.08)) drop-shadow(0 2px 6px rgba(230, 104, 23, 0.06))'
            }}
            loading="eager"
          />
        </div>

        {/* Platform Descriptor Subtitle */}
        <div
          className={`transition-all duration-600 delay-75 mt-3 ${
            step >= 3 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
          }`}
        >
          <p className="text-[10px] sm:text-[11px] font-extrabold text-[#756A5C] tracking-[0.28em] uppercase font-sans">
            {displaySubtitle}
          </p>
        </div>

        {/* Refined Role Badge */}
        <div
          className={`mt-4 transition-all duration-600 ${
            step >= 4 ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
          }`}
        >
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#0B253A]/[0.05] border border-[#0B253A]/15 text-[#0B253A] shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-[#E66817]" />
            <span className="text-[10px] sm:text-[11px] font-extrabold tracking-[0.18em] uppercase font-mono">
              {roleBadge}
            </span>
          </div>
        </div>

        {/* Minimal Status Indicators & Micro-Shimmer Line */}
        <div
          className={`mt-6 flex flex-col items-center justify-center gap-3 transition-all duration-600 ${
            step >= 5 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
          }`}
        >
          <div className="flex items-center justify-center flex-wrap gap-2 text-[10px] sm:text-[11px] font-medium text-slate-600">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50/90 border border-emerald-200/70 text-emerald-800 font-semibold shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Core Engine Ready
            </span>
            <span className="text-slate-300">•</span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50/90 border border-emerald-200/70 text-emerald-800 font-semibold shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Database Initialized
            </span>
            <span className="text-slate-300">•</span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50/80 border border-amber-200/70 text-amber-800 font-semibold shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Local-First Mode
            </span>
          </div>

          {/* Micro-Shimmer Line */}
          <div className="w-28 sm:w-36 h-[1.5px] bg-[#EAE3D6] rounded-full overflow-hidden mt-1">
            <div className="h-full bg-gradient-to-r from-[#E66817] via-[#C5A059] to-emerald-500 w-full animate-pulse" />
          </div>
        </div>

        {/* Init Error State */}
        {initError && (
          <div className="mt-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs text-center space-y-3 shadow-md animate-in zoom-in-95">
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
      </main>
    </div>
  );
};

export default JAMANVAARStartup;
