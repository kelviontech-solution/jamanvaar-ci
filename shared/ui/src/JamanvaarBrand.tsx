import React from 'react';
import { JAMANVAAR_LOGOS } from './assets';
import { LogoVariant, LogoSize } from './Logo';

export type JamanvaarLogoSize = LogoSize | 'xs' | '2xl';
export type AppIdentity = 'POS' | 'ADMIN' | 'CAPTAIN' | 'KDS' | 'KIOSK' | 'KIOSK_ADMIN';

export interface JamanvaarLogoProps {
  variant?: LogoVariant;
  size?: JamanvaarLogoSize;
  badge?: string;
  showBadge?: boolean;
  glow?: boolean;
  className?: string;
  imgClassName?: string;
  style?: React.CSSProperties;
  imgStyle?: React.CSSProperties;
  onClick?: () => void;
}

export const JamanvaarLogo: React.FC<JamanvaarLogoProps> = ({
  variant = 'horizontal',
  size = 'md',
  badge,
  showBadge = false,
  glow = true,
  className = '',
  imgClassName = '',
  style,
  imgStyle,
  onClick
}) => {
  const pixelHeights: Record<JamanvaarLogoSize, number> = {
    xs: 24,
    sm: 34,
    md: 48,
    lg: 64,
    xl: 88,
    '2xl': 120
  };

  const badgeSizeClasses: Record<JamanvaarLogoSize, string> = {
    xs: 'text-[8px] px-1.5 py-0.5',
    sm: 'text-[9px] px-2 py-0.5',
    md: 'text-[10px] sm:text-xs px-2.5 py-0.5',
    lg: 'text-xs px-3 py-1',
    xl: 'text-xs sm:text-sm px-3.5 py-1',
    '2xl': 'text-sm px-4 py-1.5'
  };

  const heightVal = pixelHeights[size] || 48;
  const logoSrc = JAMANVAAR_LOGOS[variant] || JAMANVAAR_LOGOS.horizontal;

  return (
    <div
      onClick={onClick}
      className={`inline-flex items-center gap-2.5 sm:gap-3 select-none shrink-0 ${
        onClick ? 'cursor-pointer hover:opacity-95' : ''
      } ${className}`}
      style={style}
    >
      <img
        src={logoSrc}
        alt="JAMANVAAR by Kelviontech"
        className={`w-auto object-contain transition-transform duration-200 shrink-0 ${imgClassName}`}
        style={{
          height: `${heightVal}px`,
          maxHeight: `${heightVal}px`,
          width: 'auto',
          maxWidth: '100%',
          display: 'inline-block',
          filter: glow
            ? 'drop-shadow(0 2px 8px rgba(230, 104, 23, 0.2)) drop-shadow(0 1px 2px rgba(11, 37, 58, 0.1))'
            : undefined,
          ...imgStyle
        }}
        loading="eager"
      />

      {showBadge && badge && (
        <span
          className={`font-black tracking-widest uppercase rounded-lg border shadow-xs transition-colors shrink-0 ${
            badgeSizeClasses[size]
          } ${
            variant === 'light'
              ? 'bg-[#E66817]/20 text-[#FED7AA] border-[#E66817]/40'
              : 'bg-[#E66817]/10 text-[#E66817] border-[#E66817]/25'
          }`}
        >
          {badge}
        </span>
      )}
    </div>
  );
};

export interface JamanvaarAppBadgeProps {
  app: AppIdentity | string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'light' | 'dark' | 'outline';
  className?: string;
}

export const JamanvaarAppBadge: React.FC<JamanvaarAppBadgeProps> = ({
  app,
  size = 'md',
  variant = 'dark',
  className = ''
}) => {
  const labelMap: Record<string, string> = {
    POS: 'POS TERMINAL',
    ADMIN: 'RESTAURANT ADMIN',
    CAPTAIN: 'CAPTAIN APP',
    KDS: 'KITCHEN DISPLAY (KDS)',
    KIOSK: 'CUSTOMER KIOSK',
    KIOSK_ADMIN: 'KIOSK ADMIN'
  };

  const label = labelMap[app] || app;

  const sizeClass = {
    sm: 'text-[9px] px-2 py-0.5 font-bold',
    md: 'text-[10px] sm:text-xs px-2.5 py-1 font-black',
    lg: 'text-xs sm:text-sm px-3.5 py-1.5 font-black'
  }[size];

  const variantClass = {
    dark: 'bg-[#0B253A] text-white border border-[#1E3A4C] shadow-xs',
    light: 'bg-[#FAF7F2] text-[#0B253A] border border-[#EBE6DD] shadow-xs',
    outline: 'bg-transparent text-[#E66817] border border-[#E66817]/40'
  }[variant];

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg tracking-wider uppercase ${sizeClass} ${variantClass} ${className}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-[#E66817]"></span>
      {label}
    </span>
  );
};

export interface JamanvaarIconProps {
  size?: number | string;
  className?: string;
}

export const JamanvaarIcon: React.FC<JamanvaarIconProps> = ({ size = 36, className = '' }) => {
  return (
    <div
      className={`rounded-2xl bg-gradient-to-br from-[#E66817] to-[#D9531E] flex items-center justify-center text-white shadow-md shadow-orange-500/20 shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-3/5 h-3/5"
      >
        <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0" />
        <path d="M4 11h16a1 1 0 0 1 1 1v1a7 7 0 0 1-7 7H10a7 7 0 0 1-7-7v-1a1 1 0 0 1 1-1Z" />
        <path d="M6 19v2" />
        <path d="M18 19v2" />
        <path d="M12 2v2" />
      </svg>
    </div>
  );
};

export interface JamanvaarBrandProps {
  appName?: string;
  subtitle?: string;
  variant?: 'light' | 'dark';
  size?: LogoSize;
  showTagline?: boolean;
  className?: string;
}

export const JamanvaarBrand: React.FC<JamanvaarBrandProps> = ({
  appName,
  subtitle,
  variant = 'dark',
  size = 'md',
  showTagline = true,
  className = ''
}) => {
  return (
    <div className={`flex flex-col select-none ${className}`}>
      <div className="flex items-center gap-3">
        <JamanvaarLogo variant={variant === 'dark' ? 'light' : 'full'} size={size} />
        {appName && (
          <span className="font-extrabold text-xs sm:text-sm uppercase tracking-widest px-2.5 py-0.5 rounded-md bg-[#E66817]/15 text-[#E66817] border border-[#E66817]/30">
            {appName}
          </span>
        )}
      </div>

      {subtitle && (
        <p className={`text-xs mt-1.5 font-medium ${variant === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
          {subtitle}
        </p>
      )}

      {showTagline && (
        <p className={`text-[10px] tracking-wide mt-0.5 italic ${variant === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>
          Service with Passion, Business with Perfection.
        </p>
      )}
    </div>
  );
};
