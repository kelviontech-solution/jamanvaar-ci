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
  Calendar
} from 'lucide-react';

export interface JamanvaarCapabilityItem {
  icon?: string;
  iconName?: string;
  label: string;
  sublabel?: string;
}

export interface JamanvaarAuthLayoutProps {
  appIdentity: AppIdentity | string;
  appTitle: string;
  appSubtitle: string;
  isOnline?: boolean;
  onToggleNetwork?: () => void;
  heroHeadline?: string;
  heroHighlightWord?: string;
  heroDescription?: string;
  capabilities?: JamanvaarCapabilityItem[];
  children: React.ReactNode;
  footerNote?: string;
  className?: string;
}

export const JamanvaarAuthLayout: React.FC<JamanvaarAuthLayoutProps> = ({
  appIdentity,
  appTitle,
  appSubtitle,
  isOnline = true,
  onToggleNetwork,
  heroHeadline = 'Smart Billing.',
  heroHighlightWord = 'Better Dining.',
  heroDescription = 'Fast, reliable and easy-to-use restaurant POS software built for modern Indian restaurants.',
  capabilities,
  children,
  footerNote = 'Role-Based Security • Instant Offline Boot • 100% Secure',
  className = ''
}) => {
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

  const defaultCapabilities: JamanvaarCapabilityItem[] = [
    { label: 'Fast Billing', icon: 'zap' },
    { label: 'Instant KOT', icon: 'printer' },
    { label: 'Table Management', icon: 'table' },
    { label: 'Offline First', icon: 'cloud' }
  ];

  const activeCapabilities = capabilities || defaultCapabilities;

  const renderCapabilityIcon = (icon?: string) => {
    switch (icon) {
      case 'zap':
        return <Zap className="w-5 h-5 text-[#E66817] fill-[#E66817]" />;
      case 'printer':
        return <Printer className="w-5 h-5 text-[#0B253A]" />;
      case 'table':
        return <Utensils className="w-5 h-5 text-[#0B253A]" />;
      case 'cloud':
        return <Cloud className="w-5 h-5 text-[#059669]" />;
      case 'chef':
        return <ChefHat className="w-5 h-5 text-[#E66817]" />;
      case 'mobile':
        return <Smartphone className="w-5 h-5 text-[#0B253A]" />;
      default:
        return <Zap className="w-5 h-5 text-[#E66817]" />;
    }
  };

  return (
    <div className={`min-h-screen bg-[#FAF7F2] text-[#0B253A] flex flex-col justify-between p-4 sm:p-6 lg:p-8 font-sans antialiased select-none ${className}`}>
      {/* Top Status Header */}
      <header className="w-full max-w-7xl mx-auto flex items-center justify-between pt-1 pb-4 shrink-0">
        {/* Left Mobile Brand (visible on small viewports) */}
        <div className="flex lg:hidden items-center gap-2">
          <JamanvaarLogo variant="horizontal" size="sm" imgStyle={{ height: '40px', width: 'auto' }} />
        </div>

        <div className="hidden lg:block">
          {/* Subtle placeholder to balance header */}
        </div>

        {/* Real-time Connection Status Pills (Matching Reference Mockup) */}
        <div className="flex items-center gap-2.5 sm:gap-3 text-xs font-bold ml-auto">
          {/* Local Core Status Badge */}
          <div className="flex items-center gap-2 bg-white border border-[#EBE6DD] px-3.5 py-1.5 rounded-full shadow-2xs">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></span>
            <span className="text-slate-600">
              Local Core: <strong className="text-emerald-700 font-extrabold">Connected</strong>
            </span>
          </div>

          {/* Network Status Toggle Button */}
          <button
            type="button"
            onClick={onToggleNetwork}
            title="Click to toggle simulated network mode"
            className="flex items-center gap-2 bg-white border border-[#EBE6DD] hover:border-[#E66817]/50 px-3.5 py-1.5 rounded-full shadow-2xs transition-colors cursor-pointer"
          >
            {isOnline ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="text-slate-600">
                  Network: <strong className="text-emerald-700 font-extrabold">Online</strong>
                </span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span className="text-slate-600">
                  Network: <strong className="text-amber-700 font-extrabold">Offline Ready</strong>
                </span>
              </>
            )}
          </button>

          {/* Live Date Pill */}
          <div className="hidden md:flex items-center gap-1.5 bg-white border border-[#EBE6DD] px-3.5 py-1.5 rounded-full text-slate-600 shadow-2xs">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-semibold">{formattedDate}</span>
          </div>
        </div>
      </header>

      {/* Main Split Authentication Layout */}
      <main className="w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 my-auto items-center py-4 sm:py-6">
        {/* LEFT COLUMN: BRAND & RESTAURANT PRESENTATION */}
        <div className="lg:col-span-6 flex flex-col justify-center items-center lg:items-start space-y-5 sm:space-y-6 text-center lg:text-left pr-0 lg:pr-4">
          {/* Official JAMANVAAR by KELVIONTECH Brand Logo — Prominent & Balanced */}
          <div className="w-full flex justify-center lg:justify-start pb-1">
            <JamanvaarLogo
              variant="horizontal"
              size="2xl"
              imgStyle={{ height: '180px', maxHeight: '180px', width: 'auto' }}
              className="drop-shadow-md hover:scale-[1.02] transition-transform duration-300"
            />
          </div>

          {/* Brand Headline */}
          <div className="w-full max-w-md">
            <h1 className="text-3xl sm:text-4xl lg:text-[42px] font-black text-[#0B253A] tracking-tight leading-[1.12]">
              {heroHeadline}{' '}
              {heroHighlightWord && (
                <span className="block text-[#E66817]">{heroHighlightWord}</span>
              )}
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed mt-2.5">
              {heroDescription}
            </p>
          </div>

          {/* 4 Capability Tiles Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 w-full max-w-md">
            {activeCapabilities.map((cap, i) => (
              <div
                key={i}
                className="bg-white border border-[#EBE6DD] rounded-2xl p-2.5 sm:p-3 text-center flex flex-col items-center justify-center gap-1.5 shadow-2xs hover:shadow-xs hover:border-[#E66817]/40 transition-all group"
              >
                <div className="w-8 h-8 rounded-xl bg-[#FAF7F2] flex items-center justify-center group-hover:scale-110 transition-transform">
                  {renderCapabilityIcon(cap.icon || cap.iconName)}
                </div>
                <span className="text-[11px] font-extrabold text-[#0B253A] leading-tight">
                  {cap.label}
                </span>
              </div>
            ))}
          </div>

          {/* Authentic Local Indian Food Platter Visual (Offline Packaged) */}
          <div className="w-full max-w-md rounded-2xl border border-[#EBE6DD] bg-white p-2 shadow-2xs flex items-center justify-between gap-2 overflow-hidden">
            <div className="relative flex-1 h-24 sm:h-28 rounded-xl overflow-hidden group">
              <img
                src="/assets/menu/north-indian/butter-naan.jpg"
                alt="Tandoori Naan"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=400&q=80';
                }}
              />
              <span className="absolute bottom-1 left-1 bg-black/60 backdrop-blur-xs text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                Tandoori Breads
              </span>
            </div>

            <div className="relative flex-1 h-24 sm:h-28 rounded-xl overflow-hidden group">
              <img
                src="/assets/menu/north-indian/paneer-butter-masala.jpg"
                alt="Paneer Butter Masala"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=400&q=80';
                }}
              />
              <span className="absolute bottom-1 left-1 bg-black/60 backdrop-blur-xs text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                Royal Curries
              </span>
            </div>

            <div className="relative flex-1 h-24 sm:h-28 rounded-xl overflow-hidden group">
              <img
                src="/assets/menu/north-indian/paneer-tikka.jpg"
                alt="Tandoori Angaar"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&w=400&q=80';
                }}
              />
              <span className="absolute bottom-1 left-1 bg-black/60 backdrop-blur-xs text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                Tandoor Starters
              </span>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: PREMIUM WHITE AUTHENTICATION CARD */}
        <div className="lg:col-span-6 w-full max-w-md mx-auto lg:max-w-none">
          <div className="bg-white border border-[#EBE6DD] rounded-3xl p-6 sm:p-8 lg:p-9 shadow-xl shadow-slate-200/60 relative overflow-hidden">
            {/* Top Brand Accent Line */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#E66817] via-[#F27E2B] to-[#E66817]" />

            {/* Card Header */}
            <div className="mb-5 space-y-1 text-left">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#E66817]">
                  Welcome to
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 bg-[#FFF7ED] text-[#E66817] border border-[#FFEDD5]">
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
                    : 'KIOSK TERMINAL'}
                </span>
              </div>

              <h2 className="text-2xl sm:text-3xl font-black text-[#0B253A] tracking-tight">
                {appTitle}
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 font-medium">
                {appSubtitle}
              </p>
            </div>

            {/* Form / PIN Keypad Injected Children */}
            <div className="space-y-4">
              {children}
            </div>
          </div>

          {/* Below-Card Assurance Badges */}
          <div className="mt-3.5 flex flex-wrap items-center justify-center gap-3 sm:gap-4 text-slate-500 text-[11px] font-bold">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[#E66817]" />
              <span>Role-Based Security</span>
            </div>
            <span>•</span>
            <div className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-emerald-600" />
              <span>Instant Offline Boot</span>
            </div>
            <span>•</span>
            <div className="flex items-center gap-1.5">
              <Cloud className="w-3.5 h-3.5 text-blue-600" />
              <span>100% Secure</span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer Copyright */}
      <footer className="w-full text-center text-xs text-slate-400 font-medium pt-4 shrink-0">
        © {new Date().getFullYear()} JAMANVAAR by KELVIONTECH — All rights reserved.
      </footer>
    </div>
  );
};
