import React, { useState, useEffect } from 'react';
import { JamanvaarLogo } from './JamanvaarBrand';
import { resolveMenuImage } from '@jamanvaar/utils';
import { Wifi, WifiOff, Calendar, Headphones, MousePointer2, ChefHat, Heart, Users, ShieldCheck, Zap, Cloud } from 'lucide-react';

export interface JamanvaarKioskFeature {
  icon: 'touch' | 'kitchen' | 'suggest' | 'happy';
  label: string;
}

export interface JamanvaarKioskAuthLayoutProps {
  /** Background restaurant-interior photo, full-bleed behind everything. */
  backgroundPhoto: string;
  /** The bowl-of-biryani-style hero food shot, bottom-left of the hero column. */
  foodPhoto: string;
  heroHeadline: [string, string, string];
  heroDescription: string;
  features: JamanvaarKioskFeature[];
  isOnline?: boolean;
  children: React.ReactNode;
}

const FEATURE_ICON: Record<JamanvaarKioskFeature['icon'], { icon: React.ReactNode; tint: string }> = {
  touch: { icon: <MousePointer2 className="w-6 h-6" />, tint: 'text-[#F97316] bg-[#FFF1E6]' },
  kitchen: { icon: <ChefHat className="w-6 h-6" />, tint: 'text-[#10B981] bg-[#E9FBF3]' },
  suggest: { icon: <Heart className="w-6 h-6" />, tint: 'text-[#EC4899] bg-[#FEF0F6]' },
  happy: { icon: <Users className="w-6 h-6" />, tint: 'text-[#2563EB] bg-[#EEF3FE]' }
};

/**
 * A premium, restaurant-brand-forward activation screen for the self-order
 * kiosk — a landing page moment, not a form on a blank canvas. Built to a
 * detailed brief specifying the exact visual language (warm restaurant
 * photography, handwritten accents, Plus Jakarta Sans + Caveat, a floating
 * activation card) so the first thing anyone sees when setting up a kiosk
 * looks like the product it's activating, not a generic SaaS login.
 */
export const JamanvaarKioskAuthLayout: React.FC<JamanvaarKioskAuthLayoutProps> = ({
  backgroundPhoto,
  foodPhoto,
  heroHeadline,
  heroDescription,
  features,
  isOnline: suppliedOnline,
  children
}) => {
  const [now, setNow] = useState(() => new Date());
  const [networkOnline, setNetworkOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [helpOpen, setHelpOpen] = useState(false);
  const isOnline = suppliedOnline ?? networkOnline;
  useEffect(() => {
    const online = () => setNetworkOnline(true); const offline = () => setNetworkOnline(false);
    window.addEventListener('online', online); window.addEventListener('offline', offline);
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline); };
  }, []);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  const formattedDate = now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const formattedTime = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden font-['Plus_Jakarta_Sans',_sans-serif] text-[#062A43] antialiased select-none">
      {/* Background: warm restaurant photography, softened so text stays readable */}
      <div className="fixed inset-0 -z-10">
        <img src={resolveMenuImage(backgroundPhoto)} alt="" className="w-full h-full object-cover" aria-hidden="true" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#FFF9F1]/70 via-[#FFF9F1]/60 to-[#F5EDE2]/80" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-30 mx-2 sm:mx-4 lg:mx-6 mt-2 sm:mt-3 rounded-b-[24px] sm:rounded-b-[28px] bg-white shadow-[0_8px_30px_rgba(6,42,67,0.08)]">
        <div className="px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <JamanvaarLogo variant="horizontal" size="sm" imgStyle={{ height: '38px', width: 'auto' }} />
            <div className="hidden md:flex items-center gap-3 pl-4 border-l border-[#EBE6DD]">
              <div className="leading-tight">
                <div className="text-sm font-extrabold tracking-wide">KIOSK</div>
                <div className="text-[11px] font-bold tracking-[0.18em] text-[#52677A] uppercase">Self Ordering</div>
              </div>
              <div className="hidden xl:flex items-center gap-3 pl-3 border-l border-[#EBE6DD] text-[11px] font-bold text-[#52677A]">
                <span className="whitespace-nowrap">🍲 Delicious Food</span>
                <span className="whitespace-nowrap">⚡ Faster Service</span>
                <span className="whitespace-nowrap">👥 Happier Customers</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            <div className="hidden sm:flex items-center gap-1.5 bg-white border border-[#EBE6DD] px-3 py-1.5 rounded-full text-[11px] font-bold text-[#52677A]">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              Device: <strong className="text-amber-700">Activation required</strong>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 bg-white border border-[#EBE6DD] px-3 py-1.5 rounded-full text-[11px] font-bold text-[#52677A]">
              {isOnline ? <Wifi className="w-3.5 h-3.5 text-[#10B981]" /> : <WifiOff className="w-3.5 h-3.5 text-amber-600" />}
              Network: <strong className={isOnline ? 'text-[#047857]' : 'text-amber-700'}>{isOnline ? 'Connected' : 'Offline'}</strong>
            </div>
            <div className="hidden lg:flex items-center gap-1.5 bg-white border border-[#EBE6DD] px-3 py-1.5 rounded-full text-[11px] font-bold text-[#52677A]">
              <Calendar className="w-3.5 h-3.5 text-[#94A3B8]" />
              <span>{formattedDate} · {formattedTime}</span>
            </div>
            <button
              type="button"
              onClick={() => setHelpOpen(value => !value)}
              aria-label="Need help?" className="flex items-center justify-center gap-1.5 min-h-11 min-w-11 bg-white border border-[#EBE6DD] hover:border-[#F97316]/50 px-3 py-1.5 rounded-full text-[11px] font-bold text-[#062A43] transition-colors cursor-pointer"
            >
              <Headphones className="w-3.5 h-3.5 text-[#F97316]" />
              <span className="hidden sm:inline">Need Help?</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="relative z-10 max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-12 pb-10">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.12fr)] gap-8 xl:gap-14 items-center">
          {/* LEFT: HERO */}
          <div className="space-y-6 order-2 lg:order-1">
            <p
              className="text-[#B8500C] text-xl -rotate-2 -mb-1"
              style={{ fontFamily: "'Caveat', cursive" }}
            >
              Crave. Tap. Enjoy! :)
            </p>

            <h1 className="text-[38px] sm:text-[48px] xl:text-[58px] font-black leading-[1.05] tracking-tight">
              <span className="text-[#062A43]">{heroHeadline[0]}</span>
              <br />
              <span className="text-[#D4580A]">{heroHeadline[1]}</span>
              <br />
              <span className="text-[#D4580A]">{heroHeadline[2]}</span>
            </h1>

            <p className="text-base sm:text-lg text-[#52677A] leading-relaxed max-w-[460px]">
              {heroDescription}
            </p>

            {/* Feature cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-[520px]">
              {features.map((f) => (
                <div
                  key={f.label}
                  className="bg-white/95 border border-white shadow-[0_4px_18px_rgba(6,42,67,0.06)] rounded-[20px] p-3.5 flex flex-col items-center text-center gap-2 hover:-translate-y-1 hover:shadow-[0_10px_24px_rgba(6,42,67,0.10)] transition-all duration-200"
                >
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${FEATURE_ICON[f.icon].tint}`}>
                    {FEATURE_ICON[f.icon].icon}
                  </div>
                  <span className="text-[13px] font-extrabold text-[#062A43] leading-tight">{f.label}</span>
                </div>
              ))}
            </div>

            {/* Food composition */}
            <div className="relative max-w-[520px] pt-2">
              <div className="rounded-[28px] overflow-hidden shadow-[0_20px_45px_rgba(6,42,67,0.18)] border-4 border-white">
                <img src={resolveMenuImage(foodPhoto)} alt="Freshly served biryani and curries" className="w-full h-40 sm:h-52 xl:h-64 object-cover" />
              </div>
              <p
                className="absolute -bottom-3 left-4 bg-white px-3 py-1 rounded-xl shadow-md text-[#062A43] text-lg -rotate-2"
                style={{ fontFamily: "'Caveat', cursive" }}
              >
                Good Food, Better Moments
              </p>
              <p
                className="absolute -top-4 right-2 bg-white px-2.5 py-0.5 rounded-lg shadow-sm text-[#B8500C] text-lg rotate-3"
                style={{ fontFamily: "'Caveat', cursive" }}
              >
                Let's Serve Happiness ♥
              </p>
            </div>
          </div>

          {/* RIGHT: ACTIVATION CARD */}
          <div className="relative min-w-0 w-full max-w-[640px] mx-auto lg:mx-0 lg:ml-auto order-1 lg:order-2">
            {/* Decorative badge */}
            <div
              className="hidden sm:flex absolute -top-5 -right-4 w-24 h-24 rounded-full bg-gradient-to-br from-[#FFE8D1] to-[#FFF3E4] items-center justify-center text-center leading-none rotate-6 shadow-sm z-10 pointer-events-none"
              aria-hidden="true"
            >
              <span className="text-[#B8500C] text-base font-semibold" style={{ fontFamily: "'Caveat', cursive" }}>
                Crave
                <br />
                Tap
                <br />
                Enjoy!
              </span>
            </div>

            {/* Solid white, not backdrop-blurred: a near-opaque card over a
                detailed photo background still let enough blur bleed
                through to soften the text on top of it, so this stays
                fully opaque for reliable contrast regardless of what's
                behind it. */}
            <div className="relative bg-white rounded-[28px] sm:rounded-[32px] border border-white shadow-[0_25px_70px_rgba(6,42,67,0.18)] p-6 sm:p-8 xl:p-10">
              {/* Kiosk branding */}
              <div className="flex flex-col items-center text-center mb-6">
                <div className="w-14 h-14 rounded-2xl bg-[#FFF1E6] flex items-center justify-center mb-3">
                  <JamanvaarLogo variant="mark" size="xs" imgStyle={{ height: '32px', width: 'auto' }} glow={false} />
                </div>
                <span className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-[#B8500C] mb-1">Welcome to</span>
                <h2 className="text-2xl sm:text-[28px] font-black tracking-tight">
                  <span className="text-[#062A43]">JAMANVAAR</span> <span className="text-[#D4580A]">KIOSK</span>
                </h2>
                <p className="text-[11px] font-bold tracking-[0.14em] text-[#52677A] uppercase mt-1.5">
                  Self Ordering · Smart Dining · Better Experience
                </p>
              </div>

              {children}
            </div>

            {/* Assurance row — a solid pill, not bare text, since this sits
                directly on the photo background rather than the card. */}
            <div className="mt-4 mx-auto w-fit bg-white rounded-full shadow-[0_4px_16px_rgba(6,42,67,0.10)] flex items-center justify-center gap-3 sm:gap-5 text-[11px] font-bold text-[#52677A] flex-wrap px-4 py-2">
              <span className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-[#2563EB]" />Secure &amp; Reliable</span>
              <span className="text-[#D9CDBD]" aria-hidden="true">|</span>
              <span className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-[#F97316]" />Works Offline</span>
              <span className="text-[#D9CDBD]" aria-hidden="true">|</span>
              <span className="flex items-center gap-1.5"><Cloud className="w-3.5 h-3.5 text-[#10B981]" />Auto Sync</span>
            </div>
          </div>
        </div>
      </main>
      {helpOpen && <div role="dialog" aria-modal="true" aria-label="Kiosk activation help" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-5"><div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"><h2 className="text-xl font-bold">Connect your kiosk</h2><p className="mt-3 text-sm text-slate-600">Ask your restaurant owner for the Restaurant ID and a customer kiosk activation key. The owner can find these in Restaurant Admin → Subscription Plans → Device & Staff Logins. Keep the kiosk connected to the internet during activation.</p><button type="button" onClick={() => setHelpOpen(false)} className="mt-5 w-full rounded-xl bg-orange-600 py-3 font-bold text-white">Got it</button></div></div>}

      {/* Footer */}
      <footer className="relative z-10 bg-[#F5EDE2]/95 backdrop-blur-xs rounded-t-[32px] mt-6">
        <div className="max-w-[1400px] mx-auto px-6 sm:px-10 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <p className="text-[#062A43] text-lg" style={{ fontFamily: "'Caveat', cursive" }}>
            More than a POS — it's your partner
          </p>
          <p className="text-[11px] text-[#40566A] font-medium order-3 sm:order-2">
            © {now.getFullYear()} JAMANVAAR by KELVIONTECH — All rights reserved.
          </p>
          <p className="text-[#9C4409] text-lg order-2 sm:order-3" style={{ fontFamily: "'Caveat', cursive" }}>
            Built for Modern Restaurants ♥
          </p>
        </div>
      </footer>
    </div>
  );
};

export default JamanvaarKioskAuthLayout;
