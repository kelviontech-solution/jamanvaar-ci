import React from 'react';
import { JAMANVAAR_LOGOS } from './assets';

export type LogoVariant = 'full' | 'mark' | 'wordmark' | 'light' | 'dark' | 'horizontal';
export type LogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

export interface LogoProps {
  variant?: LogoVariant;
  size?: LogoSize;
  badge?: string; // Optional separate badge e.g. "KIOSK", "ADMIN", "CONTROL"
  showBadge?: boolean;
  glow?: boolean;
  className?: string;
  onClick?: () => void;
}

export const Logo: React.FC<LogoProps> = ({
  variant = 'horizontal',
  size = 'md',
  badge = 'KIOSK',
  showBadge = true,
  glow = true,
  className = '',
  onClick
}) => {
  const pixelHeights: Record<LogoSize, number> = {
    xs: 24,
    sm: 34,
    md: 46,
    lg: 68,
    xl: 96,
    '2xl': 120
  };

  const badgeSizeClasses: Record<LogoSize, string> = {
    xs: 'text-[8px] px-1.5 py-0.5',
    sm: 'text-[9px] px-1.5 py-0.5',
    md: 'text-[10px] sm:text-xs px-2 py-0.5',
    lg: 'text-xs px-2.5 py-1',
    xl: 'text-xs sm:text-sm px-3 py-1',
    '2xl': 'text-sm px-3.5 py-1.5'
  };

  const heightVal = pixelHeights[size] || 46;
  const logoSrc = JAMANVAAR_LOGOS[variant] || JAMANVAAR_LOGOS.horizontal;

  return (
    <div
      onClick={onClick}
      className={`inline-flex items-center gap-2.5 sm:gap-3 select-none shrink-0 ${
        onClick ? 'cursor-pointer hover:opacity-95' : ''
      } ${className}`}
    >
      <img
        src={logoSrc}
        alt="JAMANVAAR by Kelviontech"
        className="w-auto object-contain transition-transform duration-200 shrink-0"
        style={{
          height: `${heightVal}px`,
          maxHeight: `${heightVal}px`,
          width: 'auto',
          maxWidth: '100%',
          display: 'inline-block',
          filter: glow
            ? 'drop-shadow(0 2px 8px rgba(230, 104, 23, 0.2)) drop-shadow(0 1px 2px rgba(11, 37, 58, 0.1))'
            : undefined
        }}
        loading="eager"
      />

      {/* Separate KIOSK / ADMIN Badge next to the logo */}
      {showBadge && badge && (
        <span
          className={`font-black tracking-widest uppercase rounded-lg border shadow-xs transition-colors ${
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
