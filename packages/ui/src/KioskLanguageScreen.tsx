import { useEffect, useState } from 'react';
import type { WelcomeScreenPresentation } from '@jamanvaar/types';
import { resolveMenuImage } from '@jamanvaar/utils';
import { ArrowLeft } from 'lucide-react';
import { JamanvaarLogo } from './JamanvaarBrand';
import { useKioskBackground } from './useKioskBackground';
export function KioskLanguageScreen({
  settings,
  backgroundUrl,
  retainSources,
  logoUrl,
  languages,
  heading = 'Choose your language',
  instruction = 'You can change this anytime from the header',
  preview = false,
  onBack,
  onChoose
}: {
  settings: WelcomeScreenPresentation;
  backgroundUrl: string;
  retainSources?: string[];
  logoUrl?: string;
  languages: { code: string; native: string; label: string }[];
  heading?: string;
  instruction?: string;
  preview?: boolean;
  onBack?: () => void;
  onChoose?: (code: string) => void;
}) {
  const { container, image, fallback, imageStyle, onImageError } = useKioskBackground(settings, backgroundUrl, preview, retainSources),
    [logoFailed, setLogoFailed] = useState(false);
  useEffect(() => setLogoFailed(false), [logoUrl]);
  return (
    <section
      ref={container}
      data-testid="kiosk-language-screen"
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
      <img data-testid="language-background" src={image || fallback} alt="" aria-hidden="true" style={imageStyle} onError={onImageError} />
      <div style={{ position: 'absolute', inset: 0, background: `rgba(255,248,239,${settings.overlayOpacity ?? 0.5})` }} />
      <button
        type="button"
        aria-label="Go back"
        onClick={onBack}
        style={{
          position: 'absolute',
          top: '3cqh',
          left: '4cqw',
          zIndex: 2,
          minWidth: preview ? 28 : 44,
          minHeight: preview ? 28 : 44,
          border: '1px solid #d8ded6',
          borderRadius: 14,
          background: 'rgba(255,255,255,.9)',
          display: 'grid',
          placeItems: 'center',
          color: '#143448'
        }}
      >
        <ArrowLeft size={20} />
      </button>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5cqh 5cqw' }}>
        <div
          style={{
            width: 'min(90cqw,900px)',
            maxHeight: '86cqh',
            overflow: 'auto',
            textAlign: 'center',
            borderRadius: 24,
            padding: '4cqh 3cqw',
            background: 'rgba(255,252,247,.88)',
            border: '1px solid rgba(255,255,255,.85)',
            boxShadow: '0 16px 60px #57351c12'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', height: 'clamp(38px,12cqh,100px)', marginBottom: '3cqh' }}>
            {logoUrl && !logoFailed ? (
              <img
                src={resolveMenuImage(logoUrl)}
                alt="Restaurant logo"
                style={{ height: '100%', maxWidth: '85%', objectFit: 'contain' }}
                onError={() => setLogoFailed(true)}
              />
            ) : (
              <JamanvaarLogo variant="horizontal" size="2xl" imgStyle={{ height: '100%', width: 'auto', maxWidth: '100%' }} />
            )}
          </div>
          <h1 style={{ fontFamily: 'Georgia,serif', fontWeight: 800, fontSize: 'clamp(18px,4.5cqw,38px)', margin: 0 }}>{heading}</h1>
          <p style={{ fontSize: 'clamp(10px,2.2cqw,16px)', color: '#52677a', margin: '1cqh 0 4cqh' }}>भाषा चुनें · ભાષા પસંદ કરો</p>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(3, languages.length) || 1},minmax(0,1fr))`, gap: 'clamp(6px,2cqw,20px)' }}>
            {languages.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => onChoose?.(l.code)}
                style={{
                  minWidth: 0,
                  minHeight: preview ? 40 : 64,
                  padding: '3cqh 1cqw',
                  border: '2px solid #e7e0d5',
                  borderRadius: 18,
                  background: '#fff',
                  color: '#0b2b40',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px #0000000a'
                }}
              >
                <strong style={{ display: 'block', fontSize: 'clamp(13px,3cqw,26px)', overflowWrap: 'anywhere' }}>{l.native}</strong>
                <span style={{ display: 'block', marginTop: 7, fontSize: 'clamp(8px,1.6cqw,12px)', color: '#52677a' }}>{l.label}</span>
              </button>
            ))}
          </div>
          <p style={{ fontSize: 'clamp(9px,1.8cqw,12px)', fontWeight: 600, color: '#52677a', margin: '4cqh 0 0' }}>{instruction}</p>
        </div>
      </div>
    </section>
  );
}
