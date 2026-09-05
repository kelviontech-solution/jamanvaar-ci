/**
 * BrandHeader — Professional JAMANVAAR brand lockup for all app headers.
 *
 * Uses the authentic high-definition uncropped horizontal logo
 * to ensure crispness and prominent brand visibility across all apps.
 *
 * Layout:
 *   [PROMINENT LOGO (~46px)]  │  [APP BADGE]  [Restaurant Name]
 *                                [outlet • terminal]
 */
import React from 'react';
import { JAMANVAAR_LOGOS } from './assets';
import { JamanvaarAppBadge } from './JamanvaarBrand';
import type { AppIdentity } from './JamanvaarBrand';

export interface BrandHeaderProps {
  /** Which application this header belongs to */
  app: AppIdentity;
  /** Restaurant / organization name (shown in context area) */
  restaurantName?: string;
  /** Outlet / branch name */
  outletName?: string;
  /** Terminal or station identifier */
  terminalId?: string;
  /** Show the outlet + terminal context line below the badge */
  showContext?: boolean;
  /**
   * Logo height in px.
   * Standard header height: 44px to 48px.
   */
  logoHeight?: number;
  /** App badge size */
  badgeSize?: 'sm' | 'md' | 'lg';
  /** Enable subtle ambient warm glow effect */
  glow?: boolean;
  /** Additional class for the outer wrapper */
  className?: string;
  onClick?: () => void;
}

export const BrandHeader: React.FC<BrandHeaderProps> = ({
  app,
  restaurantName,
  outletName,
  terminalId,
  showContext = true,
  logoHeight = 46,
  badgeSize = 'sm',
  glow = true,
  className = '',
  onClick,
}) => {
  const hasContext = showContext && (outletName || terminalId || restaurantName);

  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-0 shrink-0 select-none ${
        onClick ? 'cursor-pointer' : ''
      } ${className}`}
    >
      {/* ── JAMANVAAR Master Brand Logo (Prominent, uncropped, sharp) ── */}
      <div className="flex items-center justify-center shrink-0 pr-1">
        <img
          src={JAMANVAAR_LOGOS.horizontal}
          alt="JAMANVAAR by KELVIONTECH"
          style={{
            height: `${logoHeight}px`,
            width: 'auto',
            maxHeight: '52px',
            objectFit: 'contain',
            display: 'block',
            flexShrink: 0,
            userSelect: 'none',
            pointerEvents: 'none',
            imageRendering: '-webkit-optimize-contrast',
            filter: glow
              ? 'drop-shadow(0 2px 8px rgba(230, 104, 23, 0.16)) drop-shadow(0 1px 2px rgba(11, 37, 58, 0.08))'
              : undefined,
          }}
          loading="eager"
          draggable={false}
        />
      </div>

      {/* ── Subtle vertical divider ── */}
      <div
        className="shrink-0 bg-[#E2D9C8] rounded-full mx-2.5 sm:mx-3"
        style={{ width: 1.5, height: Math.max(28, Math.round(logoHeight * 0.7)) }}
        aria-hidden
      />

      {/* ── App badge + context ── */}
      <div className="flex flex-col gap-0.5 shrink-0 justify-center">
        <div className="flex items-center gap-2 min-w-0">
          <JamanvaarAppBadge app={app} variant="light" size={badgeSize} />
          {restaurantName && (
            <span className="text-xs font-black text-[#0B253A] tracking-tight truncate max-w-[140px] sm:max-w-[200px]">
              {restaurantName}
            </span>
          )}
        </div>
        {hasContext && (outletName || terminalId) && (
          <p className="text-[10px] font-semibold text-slate-500 leading-none whitespace-nowrap flex items-center gap-1.5 mt-0.5">
            {outletName && (
              <span className="truncate max-w-[130px] sm:max-w-[180px]">{outletName}</span>
            )}
            {outletName && terminalId && (
              <span className="text-[#D4CBB9]" aria-hidden>•</span>
            )}
            {terminalId && (
              <span className="text-[#E66817] font-extrabold tracking-wide">{terminalId}</span>
            )}
          </p>
        )}
      </div>
    </div>
  );
};

export default BrandHeader;
