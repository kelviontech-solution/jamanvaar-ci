import { LocalCorePairing } from './LocalCorePairing';
import React, { useState, useEffect } from 'react';
import { JamanvaarLogo, JamanvaarAppBadge, AppIdentity } from './JamanvaarBrand';
import {
  Zap,
  Printer,
  Utensils,
  Cloud,
  ShieldCheck,
  Lock,
  Wifi,
  WifiOff,
  Clock,
  Sparkles,
  Layers,
  ChefHat,
  Smartphone,
  CheckCircle2,
  Calendar,
  LayoutDashboard,
  BarChart3,
  Package
} from 'lucide-react';

export interface JamanvaarCapabilityItem {
  icon?: string;
  iconName?: string;
  label: string;
  sublabel?: string;
}

export interface JamanvaarHeroImage {
  src: string;
  fallbackSrc: string;
  alt: string;
  label: string;
}

export interface JamanvaarAuthLayoutProps {
  appIdentity: AppIdentity | string;
  appTitle: string;
  appSubtitle: string;
  isOnline?: boolean;
  onToggleNetwork?: () => void;
  /**
   * B2-006/B2-008: this component used to import `@jamanvaar/database` directly just to call
   * `db.isLocalCoreUnauthorized()` — which pulled that package's module-level singleton (and its
   * LAN-relay auto-polling side effect) into any bundle that so much as imported this component,
   * including Super Admin's login page, exactly the "cloud console polling a local relay" leak
   * B2-008 documented elsewhere. Callers that care (every terminal app except Super Admin, which
   * has no local relay at all) now pass this in themselves — they already import
   * `@jamanvaar/database` for real reasons, so nothing new is pulled in on their behalf either.
   */
  isLocalCoreUnauthorized?: boolean;
  isLocalCoreConnected?: boolean;
  localCoreUrl?: string;
  onPairLocalCore?: (pin: string, url: string) => Promise<void>;
  /**
   * B2-006: the "Cloud API: Connected"/"Local Core: Connected" badge used to be hardcoded true for
   * Super Admin and only reflect a stale pairing flag for everyone else — never a real, live check,
   * so it kept reading "Connected" with the API fully unreachable. When provided, this component
   * polls that URL every 10s with a short timeout and shows the real result instead.
   */
  healthCheckUrl?: string;
  heroHeadline?: string;
  heroHighlightWord?: string;
  heroDescription?: string;
  capabilities?: JamanvaarCapabilityItem[];
  /**
   * Every app defaulted to the same hardcoded north-indian trio, so the
   * login/activation screens of five different apps looked identical apart
   * from the headline text. Each app now passes its own set (see the
   * per-app APP_HERO_IMAGES exports below) so the hero visual matches what
   * that app actually does — plated dishes for the counter/kiosk apps,
   * kitchen-station shots for KDS, and so on. Falls back to the original
   * trio when omitted, so any caller not yet migrated keeps working.
   */
  heroImages?: [JamanvaarHeroImage, JamanvaarHeroImage, JamanvaarHeroImage];
  /**
   * Kitchen displays run dark by design — a bright white screen is a real
   * problem for visibility and glare on a line under hot lights, not just an
   * aesthetic choice. 'dark' recolors the whole layout (canvas, card,
   * capability tiles, status pills) instead of just the background, since a
   * white card floating on a dark canvas would defeat the point.
   */
  theme?: 'light' | 'dark';
  children: React.ReactNode;
  footerNote?: string;
  className?: string;
}

const DEFAULT_HERO_IMAGES: [JamanvaarHeroImage, JamanvaarHeroImage, JamanvaarHeroImage] = [
  {
    src: '/assets/menu/north-indian/butter-naan.jpg',
    fallbackSrc: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=400&q=80',
    alt: 'Tandoori Naan',
    label: 'Tandoori Breads'
  },
  {
    src: '/assets/menu/north-indian/paneer-butter-masala.jpg',
    fallbackSrc: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=400&q=80',
    alt: 'Paneer Butter Masala',
    label: 'Royal Curries'
  },
  {
    src: '/assets/menu/north-indian/paneer-tikka.jpg',
    fallbackSrc: 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&w=400&q=80',
    alt: 'Tandoori Angaar',
    label: 'Tandoor Starters'
  }
];

/**
 * Per-app hero image sets — import and pass as `heroImages` so each app's
 * auth screens carry a distinct visual identity instead of the same three
 * dishes everywhere. Every path is served from that app's own
 * public/assets/menu/, which already ships the full shared image library.
 */
export const APP_HERO_IMAGES: Record<string, [JamanvaarHeroImage, JamanvaarHeroImage, JamanvaarHeroImage]> = {
  POS: DEFAULT_HERO_IMAGES,
  ADMIN: DEFAULT_HERO_IMAGES,
  // Self-order kiosk: quick, casual, guest-browsed bites — not the same
  // "plated for you by a waiter" feel as the counter/admin apps.
  KIOSK: [
    {
      src: '/assets/menu/fast-food/burger.jpg',
      fallbackSrc: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=400&q=80',
      alt: 'Loaded Burger',
      label: 'Quick Bites'
    },
    {
      src: '/assets/menu/chaat/pani-puri.jpg',
      fallbackSrc: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=400&q=80',
      alt: 'Pani Puri',
      label: 'Street Chaat'
    },
    {
      src: '/assets/menu/snacks/samosa.jpg',
      fallbackSrc: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=400&q=80',
      alt: 'Crispy Samosa',
      label: 'Crispy Snacks'
    }
  ],
  KIOSK_ADMIN: [
    {
      src: '/assets/menu/fast-food/burger.jpg',
      fallbackSrc: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=400&q=80',
      alt: 'Loaded Burger',
      label: 'Quick Bites'
    },
    {
      src: '/assets/menu/chaat/pani-puri.jpg',
      fallbackSrc: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=400&q=80',
      alt: 'Pani Puri',
      label: 'Street Chaat'
    },
    {
      src: '/assets/menu/snacks/samosa.jpg',
      fallbackSrc: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=400&q=80',
      alt: 'Crispy Samosa',
      label: 'Crispy Snacks'
    }
  ],
  // Kitchen Display: this app lives behind the pass, not front-of-house —
  // the hero shows the stations it actually routes tickets to (matching
  // KDS's own "Main Kitchen / Tandoor / Beverage" station selector).
  KDS: [
    {
      src: '/assets/menu/tandoor/PT-04.jpg',
      fallbackSrc: 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?auto=format&fit=crop&w=400&q=80',
      alt: 'Tandoor Grill',
      label: 'Tandoor Station'
    },
    {
      src: '/assets/menu/chinese/hakka-noodles.jpg',
      fallbackSrc: 'https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&w=400&q=80',
      alt: 'Wok-Tossed Noodles',
      label: 'Wok Station'
    },
    {
      src: '/assets/menu/south-indian/masala-dosa.jpg',
      fallbackSrc: 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&w=400&q=80',
      alt: 'Masala Dosa',
      label: 'Dosa Station'
    }
  ],
  // Captain: full table-side service — thali/main-course spread rather than
  // starters, since Captain is about the whole seated meal, not a quick counter sale.
  CAPTAIN: [
    {
      src: '/assets/menu/thali/gujarati-thali.jpg',
      fallbackSrc: 'https://images.unsplash.com/photo-1596797038530-2c107229654b?auto=format&fit=crop&w=400&q=80',
      alt: 'Royal Thali',
      label: 'Full-Course Thali'
    },
    {
      src: '/assets/menu/main-course/DM-05.jpg',
      fallbackSrc: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=400&q=80',
      alt: 'Dal Makhani',
      label: 'Main Course'
    },
    {
      src: '/assets/menu/beverages/mojito.jpg',
      fallbackSrc: 'https://images.unsplash.com/photo-1546171753-97d7676e4602?auto=format&fit=crop&w=400&q=80',
      alt: 'Fresh Mojito',
      label: 'Table Beverages'
    }
  ]
};

export const JamanvaarAuthLayout: React.FC<JamanvaarAuthLayoutProps> = ({
  appIdentity,
  appTitle,
  appSubtitle,
  isOnline = true,
  onToggleNetwork,
  isLocalCoreUnauthorized = false,
  isLocalCoreConnected,
  healthCheckUrl,
  localCoreUrl,
  onPairLocalCore,
  heroHeadline = 'Smart Billing.',
  heroHighlightWord = 'Better Dining.',
  heroDescription = 'Fast, reliable and easy-to-use restaurant POS software built for modern Indian restaurants.',
  capabilities,
  heroImages = DEFAULT_HERO_IMAGES,
  theme = 'light',
  children,
  footerNote = 'Role-Based Security • Instant Offline Boot • 100% Secure',
  className = ''
}) => {
  const dark = theme === 'dark';
  // Live formatted current date e.g. "Mon, 31 Aug 2025"
  const [formattedDate, setFormattedDate] = useState(() => {
    return new Date().toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setFormattedDate(
        new Date().toLocaleDateString('en-GB', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        })
      );
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // B2-006: a real, periodically re-checked connectivity probe, not a value that is set once (or
  // never) and trusted forever. `null` (not yet checked) shows as "Connected" only when no
  // `healthCheckUrl` was given at all, so existing callers keep their old behavior unless they opt
  // into this — see the prop's own doc comment for why this couldn't just default to `db`.
  const [apiReachable, setApiReachable] = useState<boolean | null>(null);
  useEffect(() => {
    if (!healthCheckUrl) return;
    let cancelled = false;
    const check = async () => {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
      const timeoutId = controller ? setTimeout(() => controller.abort(), 4000) : undefined;
      try {
        // Any HTTP response at all (even a 404/401) proves the server is up and reachable - this
        // does not need to be a dedicated health endpoint. Only a thrown exception (connection
        // refused, DNS failure, timeout) means it genuinely isn't.
        const response = await fetch(healthCheckUrl, { method: 'GET', cache: 'no-store', signal: controller?.signal });
        if (!cancelled) setApiReachable(appIdentity === 'SUPER_ADMIN' ? response.status < 500 : response.ok);
      } catch {
        if (!cancelled) setApiReachable(false);
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    };
    void check();
    const interval = setInterval(check, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [healthCheckUrl, appIdentity]);

  const apiBadgeConnected = healthCheckUrl ? apiReachable !== false : true;
  // Restaurant Admin is an owner/manager console: pairing plumbing is noise there unless the server is actually unreachable.
  const showCoreBadge = !!onPairLocalCore || appIdentity !== 'ADMIN' || !apiBadgeConnected;
  const [pairingOpen, setPairingOpen] = useState(false);

  const defaultCapabilities: JamanvaarCapabilityItem[] = [
    { label: 'Fast Billing', icon: 'zap' },
    { label: 'Instant KOT', icon: 'printer' },
    { label: 'Table Management', icon: 'table' },
    { label: 'Offline First', icon: 'cloud' }
  ];

  const activeCapabilities = capabilities || defaultCapabilities;

  // One icon style for every tile: stroke icons, same size, same brand colour.
  const renderCapabilityIcon = (icon?: string) => {
    const cls = 'w-5 h-5 text-[#E66817]';
    switch (icon) {
      case 'printer':
        return <Printer className={cls} />;
      case 'table':
        return <Utensils className={cls} />;
      case 'cloud':
        return <Cloud className={cls} />;
      case 'chef':
        return <ChefHat className={cls} />;
      case 'mobile':
        return <Smartphone className={cls} />;
      case 'dashboard':
        return <LayoutDashboard className={cls} />;
      case 'chart':
        return <BarChart3 className={cls} />;
      case 'package':
        return <Package className={cls} />;
      case 'zap':
      default:
        return <Zap className={cls} />;
    }
  };

  return (
    // BUG-007: the host app's <body> intentionally sets `overflow: hidden` (a touch POS
    // shouldn't rubber-band scroll during normal use), so this layout used to grow taller
    // than the viewport (min-h-screen content) with nowhere for that overflow to go — the
    // keypad and Unlock button were simply cut off below the fold on short screens. This
    // container now scrolls internally instead.
    <div
      className={`min-h-screen max-h-screen overflow-y-auto flex flex-col justify-between p-4 sm:p-6 lg:p-8 font-sans antialiased select-none ${
        dark ? 'bg-[#081B2C] text-[#F5F1E8]' : 'bg-[#FAF7F2] text-[#0B253A]'
      } ${className}`}
    >
      {/* Top Status Header */}
      <header className="w-full max-w-7xl mx-auto flex items-center justify-between pt-1 pb-4 shrink-0">
        {/* Left Mobile Brand (visible on small viewports) */}
        <div className="flex lg:hidden items-center gap-2">
          <JamanvaarLogo variant={dark ? 'light' : 'horizontal'} size="sm" imgStyle={{ height: '40px', width: 'auto' }} />
        </div>

        <div className="hidden lg:block">
          {/* Subtle placeholder to balance header */}
        </div>

        {/* Real-time Connection Status Pills (Matching Reference Mockup) */}
        <div className="flex items-center gap-2.5 sm:gap-3 text-xs font-bold ml-auto">
          {/* Local Core / Cloud API Status Badge */}
          {showCoreBadge && (
          <div className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full shadow-2xs ${dark ? 'bg-white/5 border border-white/10' : 'bg-white border border-[#EBE6DD]'}`}>
            {/* The local relay needs a pairing no screen performs yet; once it refuses this browser, say so instead of "Connected" (BUG-156). */}
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${!apiBadgeConnected ? 'bg-rose-500' : appIdentity !== 'SUPER_ADMIN' && (isLocalCoreUnauthorized || isLocalCoreConnected === false) ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
            <span className={dark ? 'text-[#8CA0B3]' : 'text-slate-600'}>
              {appIdentity === 'SUPER_ADMIN' ? 'Cloud API: ' : 'Local Core: '}
              {healthCheckUrl && apiReachable === null ? <strong>Checking?</strong> : !apiBadgeConnected ? (
                <strong className={dark ? 'text-rose-400 font-extrabold' : 'text-rose-700 font-extrabold'}>Unreachable</strong>
              ) : appIdentity !== 'SUPER_ADMIN' && isLocalCoreUnauthorized ? (
                <strong className={dark ? 'text-amber-400 font-extrabold' : 'text-amber-700 font-extrabold'}>Not paired (cloud sync in use)</strong>
              ) : isLocalCoreConnected === false ? (
                <strong className="text-amber-700 font-extrabold">Connecting (cloud sync in use)</strong>
              ) : (
                <strong className={dark ? 'text-emerald-400 font-extrabold' : 'text-emerald-700 font-extrabold'}>
                  {appIdentity === 'SUPER_ADMIN' ? 'Connected (Port 4000)' : 'Connected'}
                </strong>
              )}
            </span>
            {onPairLocalCore && <button type="button" onClick={() => setPairingOpen(true)} className="text-xs font-bold underline">{isLocalCoreUnauthorized ? 'Pair' : 'Setup'}</button>}
          </div>
          )}
          {pairingOpen && onPairLocalCore && localCoreUrl && <div role="dialog" aria-modal="true" aria-label="Local Core setup" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl">
              <button type="button" onClick={() => setPairingOpen(false)} className="mb-3 text-sm text-slate-700 underline">Close Local Core setup</button>
              <LocalCorePairing serverUrl={localCoreUrl} paired={!isLocalCoreUnauthorized} onPair={onPairLocalCore} />
            </div>
          </div>}

          {/* Network Status Toggle Button */}
          <button
            type="button"
            onClick={onToggleNetwork}
            title="Click to toggle simulated network mode"
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full shadow-2xs transition-colors cursor-pointer ${
              dark ? 'bg-white/5 border border-white/10 hover:border-[#E66817]/50' : 'bg-white border border-[#EBE6DD] hover:border-[#E66817]/50'
            }`}
          >
            {isOnline ? (
              <>
                <Wifi className={`w-3.5 h-3.5 shrink-0 ${dark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                <span className={dark ? 'text-[#8CA0B3]' : 'text-slate-600'}>
                  Network: <strong className={dark ? 'text-emerald-400 font-extrabold' : 'text-emerald-700 font-extrabold'}>Online</strong>
                </span>
              </>
            ) : (
              <>
                <WifiOff className={`w-3.5 h-3.5 shrink-0 ${dark ? 'text-amber-400' : 'text-amber-600'}`} />
                <span className={dark ? 'text-[#8CA0B3]' : 'text-slate-600'}>
                  Network: <strong className={dark ? 'text-amber-400 font-extrabold' : 'text-amber-700 font-extrabold'}>Offline Ready</strong>
                </span>
              </>
            )}
          </button>

          {/* Live Date Pill */}
          <div className={`hidden md:flex items-center gap-1.5 px-3.5 py-1.5 rounded-full shadow-2xs ${dark ? 'bg-white/5 border border-white/10 text-[#8CA0B3]' : 'bg-white border border-[#EBE6DD] text-slate-600'}`}>
            <Calendar className={`w-3.5 h-3.5 ${dark ? 'text-[#5E7893]' : 'text-slate-400'}`} />
            <span className="font-semibold">{formattedDate}</span>
          </div>
        </div>
      </header>

      {/* Main Split Authentication Layout */}
      <main className="w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-12 my-auto items-center py-2 sm:py-4">
        {/* LEFT COLUMN: BRAND & RESTAURANT PRESENTATION */}
        <div className="order-2 lg:order-1 lg:col-span-6 flex flex-col justify-center items-center lg:items-start space-y-5 sm:space-y-6 text-center lg:text-left pr-0 lg:pr-4">
          {/* Official JAMANVAAR by KELVIONTECH Brand Logo — Prominent & Balanced */}
          <div className="hidden lg:flex w-full justify-center lg:justify-start pb-1">
            <JamanvaarLogo
              variant={dark ? 'light' : 'horizontal'}
              size="2xl"
              imgStyle={{ height: 'clamp(104px, 19vh, 180px)', width: 'auto' }}
              className="drop-shadow-md hover:scale-[1.02] transition-transform duration-300"
            />
          </div>

          {/* Brand Headline */}
          <div className="w-full max-w-md">
            <h1 className={`text-3xl sm:text-4xl lg:text-[42px] font-extrabold tracking-tight leading-[1.12] ${dark ? 'text-[#F5F1E8]' : 'text-[#0B253A]'}`}>
              {heroHeadline}{' '}
              {heroHighlightWord && (
                <span className="block text-[#E66817]">{heroHighlightWord}</span>
              )}
            </h1>
            <p className={`text-xs sm:text-sm font-medium leading-relaxed mt-2.5 ${dark ? 'text-[#8CA0B3]' : 'text-slate-600'}`}>
              {heroDescription}
            </p>
          </div>

          {/* 4 Capability Tiles Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 w-full max-w-md">
            {activeCapabilities.map((cap, i) => (
              <div
                key={i}
                className={`rounded-2xl p-2.5 sm:p-3 text-center flex flex-col items-center justify-center gap-1.5 shadow-2xs hover:shadow-xs transition-all group ${
                  dark ? 'bg-white/5 border border-white/10 hover:border-[#E66817]/50' : 'bg-white border border-[#EBE6DD] hover:border-[#E66817]/40'
                }`}
              >
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform ${dark ? 'bg-white/10' : 'bg-[#FAF7F2]'}`}>
                  {renderCapabilityIcon(cap.icon || cap.iconName)}
                </div>
                <span className={`text-xs font-semibold leading-tight ${dark ? 'text-[#F5F1E8]' : 'text-[#0B253A]'}`}>
                  {cap.label}
                </span>
              </div>
            ))}
          </div>

          {/* App-specific Visual Identity Strip — see APP_HERO_IMAGES; falls
              back to the north-indian trio when a caller hasn't passed one. */}
          <div className={`w-full max-w-md rounded-2xl p-2 shadow-2xs flex items-center justify-between gap-2 overflow-hidden ${dark ? 'bg-white/5 border border-white/10' : 'bg-white border border-[#EBE6DD]'}`}>
            {heroImages.map((img) => (
              <div key={img.src} className="relative flex-1 h-24 sm:h-28 rounded-xl overflow-hidden group">
                <img
                  src={img.src}
                  alt={img.alt}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = img.fallbackSrc;
                  }}
                />
                <span className="absolute bottom-1 left-1 bg-black/60 backdrop-blur-xs text-white text-[10px] font-semibold px-1.5 py-0.5 rounded">
                  {img.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT COLUMN: AUTHENTICATION CARD */}
        <div className="order-1 lg:order-2 lg:col-span-6 w-full max-w-md mx-auto lg:max-w-none">
          <div
            className={`rounded-2xl p-6 sm:p-8 lg:p-9 relative overflow-hidden ${
              dark ? 'bg-[#0F2940] border border-white/10 shadow-xl shadow-black/30' : 'bg-white border border-[#EBE6DD] shadow-xl shadow-slate-200/60'
            }`}
          >
            {/* Top Brand Accent Line */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#E66817] via-[#F27E2B] to-[#E66817]" />

            {/* Card Header */}
            <div className="mb-5 space-y-1 text-left">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#B8500C]">
                  Welcome to
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 text-[#B8500C] border ${
                    dark ? 'bg-[#E66817]/10 border-[#E66817]/25' : 'bg-[#FFF7ED] border-[#FFEDD5]'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#E66817]" />
                  {appIdentity === 'POS'
                    ? 'POS TERMINAL'
                    : appIdentity === 'ADMIN'
                    ? 'RESTAURANT ADMIN'
                    : appIdentity === 'CAPTAIN'
                    ? 'CAPTAIN APP'
                    : appIdentity === 'KDS'
                    ? 'KITCHEN DISPLAY (KDS)'
                    : appIdentity === 'KIOSK_ADMIN'
                    ? 'KIOSK ADMIN'
                    : appIdentity === 'SUPER_ADMIN'
                    ? 'SUPER ADMIN'
                    : 'KIOSK TERMINAL'}
                </span>
              </div>

              <h2 className={`text-2xl sm:text-3xl font-bold tracking-tight ${dark ? 'text-[#F5F1E8]' : 'text-[#0B253A]'}`}>
                {appTitle}
              </h2>
              <p className={`text-xs sm:text-sm font-medium ${dark ? 'text-[#8CA0B3]' : 'text-slate-500'}`}>
                {appSubtitle}
              </p>
            </div>

            {/* Form / PIN Keypad Injected Children */}
            <div className="space-y-4">
              {children}
            </div>
          </div>

          {/* Below-Card Assurance Badges */}
          <div className={`mt-3.5 flex flex-wrap items-center justify-center gap-3 sm:gap-4 text-[11px] font-bold ${dark ? 'text-[#8CA0B3]' : 'text-slate-500'}`}>
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[#E66817]" />
              <span>Role-Based Security</span>
            </div>
            <span>•</span>
            <div className="flex items-center gap-1.5">
              <Zap className={`w-3.5 h-3.5 ${dark ? 'text-emerald-400' : 'text-emerald-600'}`} />
              <span>Instant Offline Boot</span>
            </div>
            <span>•</span>
            <div className="flex items-center gap-1.5">
              <Cloud className={`w-3.5 h-3.5 ${dark ? 'text-blue-400' : 'text-blue-600'}`} />
              <span>100% Secure</span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer Copyright */}
      <footer className={`w-full text-center text-xs font-medium pt-4 shrink-0 ${dark ? 'text-[#5E7893]' : 'text-slate-400'}`}>
        © {new Date().getFullYear()} JAMANVAAR by KELVIONTECH — All rights reserved.
      </footer>
    </div>
  );
};
