import React, { useEffect, useState } from 'react';
import type { WelcomeScreenPresentation } from '@jamanvaar/types';
import { resolveMenuImage, kioskScreenBackgroundSources } from '@jamanvaar/utils';
import { useKioskBackground } from './useKioskBackground';
import { JamanvaarLogo } from './JamanvaarBrand';
import { ArrowRight, Lock, Sparkles } from 'lucide-react';

export interface KioskWelcomeScreenProps {
  settings: WelcomeScreenPresentation;
  backgroundUrl: string;
  retainSources?: string[];
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
export function KioskWelcomeScreen({
  settings,
  backgroundUrl,
  retainSources = [],
  restaurantName,
  logoUrl,
  accentColor = '#EF6A0B',
  heading,
  subtitle,
  buttonText,
  instruction,
  terminalId,
  preview = false,
  busy,
  onStart,
  onStaff
}: KioskWelcomeScreenProps) {
  const { container, image, fallback, imageStyle, onImageError } = useKioskBackground(settings, backgroundUrl, preview, [
    ...kioskScreenBackgroundSources(settings),
    ...retainSources
  ]);
  const [logoFailed, setLogoFailed] = useState(false);
  const effectiveLogo = settings.logoUrl || logoUrl;
  useEffect(() => setLogoFailed(false), [effectiveLogo]);
  const welcomeHeading = heading || settings.headingText || 'Welcome to';
  return (
    <section
      ref={container}
      data-testid="kiosk-welcome-screen"
      data-background={settings.backgroundId || 'custom-url'}
      style={{
        position: 'relative',
        isolation: 'isolate',
        width: '100%',
        height: preview ? '100%' : '100dvh',
        minHeight: preview ? 0 : 480,
        overflow: 'hidden',
        background: '#f5eee3',
        containerType: 'size',
        color: '#0b2b40'
      }}
    >
      {settings.backgroundFit === 'contain' && (
        <img src={image || fallback} alt="" aria-hidden="true" style={{ ...imageStyle, objectFit: 'cover', filter: 'blur(18px)' }} />
      )}
      <img data-testid="welcome-background" src={image || fallback} alt="" aria-hidden="true" style={imageStyle} onError={onImageError} />{' '}
      <div style={{ position: 'absolute', inset: 0, background: `rgba(255,248,239,${settings.overlayOpacity ?? 0.2})` }} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5cqw 4cqh' }}>
        <div
          style={{
            width: 'min(88cqw, 560px)',
            maxHeight: '90cqh',
            overflow: 'auto',
            textAlign: 'center',
            borderRadius: 'max(16px, 3cqw)',
            background: 'rgba(255,252,247,.91)',
            border: '1px solid rgba(255,255,255,.92)',
            padding: 'clamp(14px,4cqh,44px) clamp(14px,4cqw,44px)',
            boxShadow: '0 20px 70px rgba(69,45,20,.12)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', height: 'clamp(36px,11cqh,110px)', marginBottom: '3cqh' }}>
            {effectiveLogo && !logoFailed ? (
              <img
                src={resolveMenuImage(effectiveLogo)}
                alt="Restaurant logo"
                style={{ maxWidth: '85%', height: '100%', objectFit: 'contain' }}
                onError={() => setLogoFailed(true)}
              />
            ) : (
              <JamanvaarLogo variant="horizontal" size="2xl" imgStyle={{ height: '100%', width: 'auto', maxWidth: '100%' }} />
            )}
          </div>
          {settings.showHeritageArtwork && (
            <div style={{ color: accentColor, fontSize: 'clamp(10px,2cqw,14px)', fontWeight: 700, marginBottom: '2cqh' }}>
              Freshly prepared · Served with care
            </div>
          )}
          <p style={{ margin: '0 0 1.5cqh', fontSize: 'clamp(13px,3cqw,22px)', color: '#936134', fontWeight: 600, overflowWrap: 'anywhere' }}>
            {welcomeHeading}
          </p>
          <h1
            data-testid="welcome-restaurant-name"
            style={{ margin: 0, fontFamily: 'Georgia,serif', fontSize: 'clamp(18px,5cqw,46px)', lineHeight: 1.13, fontWeight: 700, overflowWrap: 'anywhere' }}
          >
            {settings.restaurantName || restaurantName}
          </h1>
          <p style={{ fontSize: 'clamp(11px,2.5cqw,19px)', lineHeight: 1.5, margin: '2cqh 0 3cqh', color: '#52677a', overflowWrap: 'anywhere' }}>
            {subtitle || settings.subtitleText || 'Authentic flavors. A little moment of happiness.'}
          </p>
          {settings.showPromoBanner && settings.promoBannerText && (
            <div
              style={{
                fontSize: 'clamp(10px,2cqw,14px)',
                padding: '1cqh',
                marginBottom: '2cqh',
                borderRadius: 12,
                color: '#854511',
                background: '#fff1df',
                overflowWrap: 'anywhere'
              }}
            >
              <Sparkles size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> {settings.promoBannerText}
            </div>
          )}
          <button
            type="button"
            onClick={onStart}
            disabled={busy}
            aria-label={buttonText || settings.startOrderButtonText || 'Start Order'}
            style={{
              width: '100%',
              minHeight: preview ? 0 : 56,
              padding: '2.4cqh 3cqw',
              borderRadius: 'max(12px,2cqw)',
              border: 0,
              background: accentColor,
              color: 'white',
              cursor: 'pointer',
              fontWeight: 800,
              fontSize: 'clamp(13px,3.4cqw,30px)',
              display: 'flex',
              gap: '2cqw',
              justifyContent: 'center',
              alignItems: 'center',
              boxShadow: '0 8px 24px rgba(200,91,14,.22)'
            }}
          >
            <span style={{ overflowWrap: 'anywhere' }}>{buttonText || settings.startOrderButtonText || 'Start Order'}</span>
            <ArrowRight style={{ flexShrink: 0, width: '1.1em', height: '1.1em' }} />
          </button>
          <p style={{ fontSize: 'clamp(9px,1.9cqw,13px)', color: '#607386', margin: '2cqh 0 0', overflowWrap: 'anywhere' }}>
            {instruction || settings.supportingText || 'Touch the screen to begin your order'}
          </p>
        </div>
      </div>
      {!preview && (
        <footer
          style={{ position: 'absolute', left: 20, right: 20, bottom: 12, display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#52677a' }}
        >
          <span>Terminal {terminalId?.slice(0, 12)}</span>
          <button
            type="button"
            onClick={onStaff}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              border: 0,
              borderRadius: 8,
              background: 'rgba(255,255,255,.85)',
              padding: '10px 12px',
              color: '#52677a',
              cursor: 'pointer'
            }}
          >
            <Lock size={12} /> Staff Mode
          </button>
        </footer>
      )}
    </section>
  );
}
