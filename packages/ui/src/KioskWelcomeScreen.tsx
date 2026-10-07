import React, { useEffect, useRef, useState } from 'react';
import type { WelcomeScreenPresentation } from '@jamanvaar/types';
import { DEFAULT_KIOSK_WELCOME_BACKGROUND, resolveMenuImage, welcomeLandscapeUrl, WelcomeImageCache } from '@jamanvaar/utils';
import { JamanvaarLogo } from './JamanvaarBrand';
import { ArrowRight, Lock, Sparkles } from 'lucide-react';

export interface KioskWelcomeScreenProps {
  settings: WelcomeScreenPresentation;
  backgroundUrl: string;
  restaurantName: string;
  logoUrl?: string;
  accentColor?: string;
  heading?: string;
  subtitle?: string;
  buttonText?: string;
  instruction?: string;
  terminalId?: string;
  preview?: boolean;
  busy?: boolean;
  onStart?: () => void;
  onStaff?: () => void;
}
export function KioskWelcomeScreen({ settings, backgroundUrl, restaurantName, logoUrl, accentColor = '#EF6A0B',
  heading, subtitle, buttonText, instruction, terminalId, preview = false, busy, onStart, onStaff }: KioskWelcomeScreenProps) {
  const container = useRef<HTMLElement>(null);
  const [landscape, setLandscape] = useState(false);
  useEffect(() => {
    const element = container.current; if (!element) return;
    const update = () => { const bounds = element.getBoundingClientRect(); setLandscape(bounds.width > bounds.height); };
    update(); const observer = new ResizeObserver(update); observer.observe(element); return () => observer.disconnect();
  }, []);
  const wideSource = welcomeLandscapeUrl(backgroundUrl, settings.backgroundLandscapeImageUrl);
  const selectedSource = landscape ? wideSource : backgroundUrl;
  const fallbackSource = landscape ? DEFAULT_KIOSK_WELCOME_BACKGROUND.landscapeImageUrl : DEFAULT_KIOSK_WELCOME_BACKGROUND.imageUrl;
  const fallback = resolveMenuImage(fallbackSource)!;
  const [image, setImage] = useState(resolveMenuImage(backgroundUrl));
  const [logoFailed, setLogoFailed] = useState(false);
  const fallbackAttempted = useRef(false);
  const activeSource = useRef(selectedSource); activeSource.current = selectedSource;
  const ownedUrls = useRef<string[]>([]);
  const imageRequest = useRef(0);
  useEffect(() => {
    let active = true; const urls: string[] = [];
    const request = ++imageRequest.current;
    ownedUrls.current = urls; fallbackAttempted.current = false;
    setImage(resolveMenuImage(selectedSource));
    if (!preview) {
      void WelcomeImageCache.source(selectedSource).then(source => {
        if (active && !fallbackAttempted.current) { if (source.startsWith('blob:')) urls.push(source); setImage(source); }
        else if (source.startsWith('blob:')) URL.revokeObjectURL(source);
      });
      // Warm the fallback too, without competing with/pruning the menu image cache.
      const retained = [backgroundUrl, wideSource, DEFAULT_KIOSK_WELCOME_BACKGROUND.imageUrl, DEFAULT_KIOSK_WELCOME_BACKGROUND.landscapeImageUrl];
      for (const asset of new Set(retained)) if (asset !== selectedSource) void WelcomeImageCache.source(asset).then(source => { if (source.startsWith('blob:')) URL.revokeObjectURL(source); });
      void WelcomeImageCache.retain(retained);
    }
    return () => { active = false; if (imageRequest.current === request) ++imageRequest.current; urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [backgroundUrl, selectedSource, wideSource, preview]);
  const effectiveLogo = settings.logoUrl || logoUrl;
  useEffect(() => setLogoFailed(false), [effectiveLogo]);
  const position = `${settings.backgroundPositionX ?? 50}% ${settings.backgroundPositionY ?? 50}%`;
  const imageStyle: React.CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: settings.backgroundFit || 'cover', objectPosition: position, transform: `scale(${settings.backgroundZoom ?? 1})` };
  const welcomeHeading = heading || settings.headingText || 'Welcome to';
  return <section ref={container} data-testid="kiosk-welcome-screen" data-background={settings.backgroundId || 'custom-url'}
    style={{ position: 'relative', isolation: 'isolate', width: '100%', height: preview ? '100%' : '100dvh', minHeight: preview ? 0 : 480,
      overflow: 'hidden', background: '#f5eee3', containerType: 'size', color: '#0b2b40' }}>
    {settings.backgroundFit === 'contain' && <img src={image || fallback} alt="" aria-hidden="true" style={{ ...imageStyle, objectFit: 'cover', filter: 'blur(18px)' }} />}
    <img data-testid="welcome-background" src={image || fallback} alt="" aria-hidden="true" style={imageStyle} onError={() => {
      if (image === fallback || fallbackAttempted.current) return;
      fallbackAttempted.current = true;
      const request = imageRequest.current;
      if (preview) setImage(fallback);
      else void WelcomeImageCache.source(fallbackSource).then(source => {
        if (imageRequest.current === request && activeSource.current === selectedSource) { if (source.startsWith('blob:')) ownedUrls.current.push(source); setImage(source); }
        else if (source.startsWith('blob:')) URL.revokeObjectURL(source);
      });
    }} />
    <div style={{ position: 'absolute', inset: 0, background: `rgba(255,248,239,${settings.overlayOpacity ?? 0.2})` }} />
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5cqw 4cqh' }}>
      <div style={{ width: 'min(88cqw, 560px)', maxHeight: '90cqh', overflow: 'auto', textAlign: 'center', borderRadius: 'max(16px, 3cqw)',
        background: 'rgba(255,252,247,.91)', border: '1px solid rgba(255,255,255,.92)', padding: 'clamp(14px,4cqh,44px) clamp(14px,4cqw,44px)', boxShadow: '0 20px 70px rgba(69,45,20,.12)' }}>
        <div style={{ display: 'flex', justifyContent: 'center', height: 'clamp(36px,11cqh,110px)', marginBottom: '3cqh' }}>
          {effectiveLogo && !logoFailed ? <img src={resolveMenuImage(effectiveLogo)} alt="Restaurant logo" style={{ maxWidth: '85%', height: '100%', objectFit: 'contain' }} onError={() => setLogoFailed(true)} />
            : <JamanvaarLogo variant="horizontal" size="2xl" imgStyle={{ height: '100%', width: 'auto', maxWidth: '100%' }} />}
        </div>
        {settings.showHeritageArtwork && <div style={{ color: accentColor, fontSize: 'clamp(10px,2cqw,14px)', fontWeight: 700, marginBottom: '2cqh' }}>Freshly prepared · Served with care</div>}
        <p style={{ margin: '0 0 1.5cqh', fontSize: 'clamp(13px,3cqw,22px)', color: '#936134', fontWeight: 600, overflowWrap: 'anywhere' }}>{welcomeHeading}</p>
        <h1 data-testid="welcome-restaurant-name" style={{ margin: 0, fontFamily: 'Georgia,serif', fontSize: 'clamp(18px,5cqw,46px)', lineHeight: 1.13, fontWeight: 700, overflowWrap: 'anywhere' }}>{settings.restaurantName || restaurantName}</h1>
        <p style={{ fontSize: 'clamp(11px,2.5cqw,19px)', lineHeight: 1.5, margin: '2cqh 0 3cqh', color: '#52677a', overflowWrap: 'anywhere' }}>{subtitle || settings.subtitleText || 'Authentic flavors. A little moment of happiness.'}</p>
        {settings.showPromoBanner && settings.promoBannerText && <div style={{ fontSize: 'clamp(10px,2cqw,14px)', padding: '1cqh', marginBottom: '2cqh', borderRadius: 12, color: '#854511', background: '#fff1df', overflowWrap: 'anywhere' }}><Sparkles size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> {settings.promoBannerText}</div>}
        <button type="button" onClick={onStart} disabled={busy} aria-label={buttonText || settings.startOrderButtonText || 'Start Order'} style={{ width: '100%', minHeight: preview ? 0 : 56, padding: '2.4cqh 3cqw', borderRadius: 'max(12px,2cqw)', border: 0, background: accentColor, color: 'white', cursor: 'pointer', fontWeight: 800, fontSize: 'clamp(13px,3.4cqw,30px)', display: 'flex', gap: '2cqw', justifyContent: 'center', alignItems: 'center', boxShadow: '0 8px 24px rgba(200,91,14,.22)' }}>
          <span style={{ overflowWrap: 'anywhere' }}>{buttonText || settings.startOrderButtonText || 'Start Order'}</span><ArrowRight style={{ flexShrink: 0, width: '1.1em', height: '1.1em' }} />
        </button>
        <p style={{ fontSize: 'clamp(9px,1.9cqw,13px)', color: '#607386', margin: '2cqh 0 0', overflowWrap: 'anywhere' }}>{instruction || settings.supportingText || 'Touch the screen to begin your order'}</p>
      </div>
    </div>
    {!preview && <footer style={{ position: 'absolute', left: 20, right: 20, bottom: 12, display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#52677a' }}>
      <span>Terminal {terminalId?.slice(0, 12)}</span><button type="button" onClick={onStaff} style={{ display: 'flex', alignItems: 'center', gap: 6, border: 0, borderRadius: 8, background: 'rgba(255,255,255,.85)', padding: '10px 12px', color: '#52677a', cursor: 'pointer' }}><Lock size={12} /> Staff Mode</button>
    </footer>}
  </section>;
}
