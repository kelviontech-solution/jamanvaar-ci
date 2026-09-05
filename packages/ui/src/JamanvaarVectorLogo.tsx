import React from 'react';

export interface JamanvaarVectorLogoProps {
  /** Height of the logo in pixels or CSS string. Width calculates proportionally */
  height?: number | string;
  /** Width override (defaults to auto based on aspect ratio) */
  width?: number | string;
  /** Layout mode */
  variant?: 'horizontal' | 'stacked' | 'mark-only' | 'wordmark-only';
  /** Enable ambient golden glow effect */
  glow?: boolean;
  /** Enable subtle animated steam wave effect */
  animated?: boolean;
  /** Dark mode variant (optimizes contrast for dark backgrounds) */
  dark?: boolean;
  /** Custom class name */
  className?: string;
  /** Custom inline style */
  style?: React.CSSProperties;
  /** Click handler */
  onClick?: () => void;
}

/**
 * JamanvaarVectorLogo — 100% Pure Code / SVG Brand Identity.
 *
 * Renders infinitely crisp at any DPI with metallic gold gradients,
 * rich royal navy typography, handcrafted Gujarati flourish curves,
 * mint garnish accents, and optional micro-animated steam glow.
 */
export const JamanvaarVectorLogo: React.FC<JamanvaarVectorLogoProps> = ({
  height = 50,
  width,
  variant = 'horizontal',
  glow = true,
  animated = true,
  dark = false,
  className = '',
  style,
  onClick
}) => {
  const numericHeight = typeof height === 'number' ? height : parseInt(String(height), 10) || 50;

  // MARK ONLY (Cloche & Hand Symbol)
  if (variant === 'mark-only') {
    return (
      <svg
        viewBox="0 0 400 320"
        height={height}
        width={width || 'auto'}
        style={{
          display: 'inline-block',
          verticalAlign: 'middle',
          filter: glow ? 'drop-shadow(0 2px 10px rgba(230,104,23,0.22))' : undefined,
          ...style
        }}
        className={`select-none transition-transform duration-300 ${onClick ? 'cursor-pointer hover:scale-105' : ''} ${className}`}
        onClick={onClick}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <ClocheGradients dark={dark} />
        </defs>
        <ClocheMark animated={animated} />
      </svg>
    );
  }

  // STACKED / VERTICAL (Great for Splash / Welcome screens)
  if (variant === 'stacked') {
    return (
      <svg
        viewBox="0 0 600 520"
        height={height}
        width={width || 'auto'}
        style={{
          display: 'inline-block',
          verticalAlign: 'middle',
          filter: glow ? 'drop-shadow(0 4px 18px rgba(230,104,23,0.18))' : undefined,
          ...style
        }}
        className={`select-none transition-transform duration-300 ${onClick ? 'cursor-pointer' : ''} ${className}`}
        onClick={onClick}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <ClocheGradients dark={dark} />
        </defs>
        {/* Centered Cloche */}
        <g transform="translate(140, 20) scale(0.8)">
          <ClocheMark animated={animated} />
        </g>
        {/* Wordmark below */}
        <g transform="translate(10, 290) scale(0.96)">
          <JamanvaarWordmark dark={dark} />
        </g>
        {/* Subtitle */}
        <g transform="translate(125, 470) scale(0.95)">
          <KelviontechSubtitle dark={dark} />
        </g>
      </svg>
    );
  }

  // HORIZONTAL (Standard Header / Navbar layout: 640x360 viewBox, native aspect ~1.78:1)
  return (
    <svg
      viewBox="0 0 640 360"
      height={height}
      width={width || 'auto'}
      style={{
        height: typeof height === 'number' ? `${height}px` : height,
        width: width ? (typeof width === 'number' ? `${width}px` : width) : 'auto',
        display: 'inline-block',
        verticalAlign: 'middle',
        filter: glow
          ? `drop-shadow(0 2px 10px ${dark ? 'rgba(245,158,11,0.25)' : 'rgba(230,104,23,0.16)'})`
          : undefined,
        ...style
      }}
      className={`select-none transition-all duration-200 shrink-0 ${
        onClick ? 'cursor-pointer hover:opacity-95 active:scale-[0.98]' : ''
      } ${className}`}
      onClick={onClick}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <ClocheGradients dark={dark} />
        <style>{`
          @keyframes jvSteamPulse {
            0%, 100% { opacity: 0.85; transform: translateY(0px) scaleY(1); }
            50% { opacity: 1; transform: translateY(-3px) scaleY(1.06); }
          }
          @keyframes jvGlowPulse {
            0%, 100% { filter: drop-shadow(0 0 2px rgba(245,158,11,0.4)); }
            50% { filter: drop-shadow(0 0 6px rgba(245,158,11,0.8)); }
          }
          .jv-steam {
            animation: ${animated ? 'jvSteamPulse 2.8s ease-in-out infinite' : 'none'};
            transform-origin: center bottom;
          }
          .jv-gold-glow {
            animation: ${animated ? 'jvGlowPulse 3.5s ease-in-out infinite' : 'none'};
          }
        `}</style>
      </defs>

      {/* ── Top Cloche & Hand Emblem ── */}
      <g transform="translate(195, 12) scale(0.62)">
        <ClocheMark animated={animated} />
      </g>

      {/* ── JAMANVAAR Main Typography ── */}
      <g transform="translate(30, 205) scale(0.96)">
        <JamanvaarWordmark dark={dark} />
      </g>

      {/* ── "by KELVIONTECH" Subtitle with flanking rules ── */}
      <g transform="translate(145, 335) scale(0.9)">
        <KelviontechSubtitle dark={dark} />
      </g>
    </svg>
  );
};

// ============================================================================
// SUB-COMPONENTS & PATH DEFINITIONS
// ============================================================================

/** Gradient Definitions for Cloche, Gold Highlights, Leaves, and Royal Navy Body */
const ClocheGradients: React.FC<{ dark?: boolean }> = ({ dark }) => (
  <>
    {/* Cloche Dome Master 3D Gold Gradient */}
    <radialGradient id="jvGoldDome" cx="42%" cy="30%" r="70%" fx="35%" fy="20%">
      <stop offset="0%" stopColor="#FFF2B2" />
      <stop offset="18%" stopColor="#F7C948" />
      <stop offset="55%" stopColor="#E68A00" />
      <stop offset="85%" stopColor="#C46200" />
      <stop offset="100%" stopColor="#8A3E00" />
    </radialGradient>

    {/* Cloche Handle Knob Gold */}
    <linearGradient id="jvGoldKnob" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stopColor="#FFF7D6" />
      <stop offset="40%" stopColor="#F5B324" />
      <stop offset="100%" stopColor="#AC5800" />
    </linearGradient>

    {/* Steam Flame Warm Gradient */}
    <linearGradient id="jvSteamGrad" x1="0%" y1="100%" x2="0%" y2="0%">
      <stop offset="0%" stopColor="#D9531E" stopOpacity="0.75" />
      <stop offset="50%" stopColor="#F59E0B" stopOpacity="0.95" />
      <stop offset="100%" stopColor="#FDE68A" stopOpacity="1" />
    </linearGradient>

    {/* Mint Leaf Gradient */}
    <linearGradient id="jvLeafGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stopColor="#5EA932" />
      <stop offset="50%" stopColor="#3E831C" />
      <stop offset="100%" stopColor="#25550F" />
    </linearGradient>

    {/* Mint Leaf Light Highlight */}
    <linearGradient id="jvLeafLight" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stopColor="#86EFAC" />
      <stop offset="100%" stopColor="#22C55E" />
    </linearGradient>

    {/* Royal Navy Typography / Hand Gradient */}
    <linearGradient id="jvNavyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stopColor={dark ? '#E2E8F0' : '#143854'} />
      <stop offset="35%" stopColor={dark ? '#CBD5E1' : '#0B253A'} />
      <stop offset="100%" stopColor={dark ? '#94A3B8' : '#061726'} />
    </linearGradient>

    {/* Accent Gold Bars / Crescent */}
    <linearGradient id="jvGoldBar" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stopColor="#F59E0B" />
      <stop offset="50%" stopColor="#D97706" />
      <stop offset="100%" stopColor="#B45309" />
    </linearGradient>

    {/* Specular Glint */}
    <linearGradient id="jvRimGlint" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.6" />
      <stop offset="30%" stopColor="#FFFFFF" stopOpacity="0.95" />
      <stop offset="60%" stopColor="#FFFFFF" stopOpacity="0.3" />
      <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
    </linearGradient>
  </>
);

/** Cloche Dome + Serving Hand + Steam Mark */
const ClocheMark: React.FC<{ animated?: boolean }> = ({ animated }) => (
  <g>
    {/* ── Rising Steam Wisps ── */}
    <g className="jv-steam">
      {/* Left Steam Wisp */}
      <path
        d="M 180 52 C 172 40, 182 28, 175 14 C 171 7, 166 4, 165 0 C 168 5, 175 12, 179 20 C 185 32, 178 42, 180 52 Z"
        fill="url(#jvSteamGrad)"
      />
      {/* Center Main Steam Swirl */}
      <path
        d="M 200 56 C 193 38, 208 24, 198 8 C 193 1, 187 0, 186 -3 C 190 2, 202 10, 205 22 C 213 36, 202 46, 200 56 Z"
        fill="url(#jvSteamGrad)"
      />
      {/* Right Steam Wisp */}
      <path
        d="M 220 54 C 214 42, 224 30, 218 16 C 215 10, 210 6, 209 2 C 212 7, 219 14, 222 22 C 228 34, 221 44, 220 54 Z"
        fill="url(#jvSteamGrad)"
      />
    </g>

    {/* ── Top Cloche Knob / Finial ── */}
    <g className="jv-gold-glow">
      <circle cx="200" cy="74" r="14" fill="url(#jvGoldKnob)" stroke="#78350F" strokeWidth="1.5" />
      <circle cx="200" cy="74" r="7" fill="#FFFDF5" opacity="0.65" />
      <ellipse cx="200" cy="88" rx="10" ry="4" fill="url(#jvGoldKnob)" />
    </g>

    {/* ── Golden Cloche Dome ── */}
    <g>
      {/* Outer Dome Outline / Drop Shadow */}
      <path
        d="M 76 210 C 76 112, 132 86, 200 86 C 268 86, 324 112, 324 210 Z"
        fill="url(#jvGoldDome)"
        stroke="#78350F"
        strokeWidth="2"
      />

      {/* Internal Inner Lip / Rim Highlight */}
      <path
        d="M 94 205 C 104 135, 145 106, 200 106 C 255 106, 296 135, 306 205"
        fill="none"
        stroke="#FFF"
        strokeWidth="3.5"
        strokeLinecap="round"
        opacity="0.35"
      />

      {/* Left Specular Glint on Dome */}
      <path
        d="M 112 195 C 120 148, 150 120, 185 112"
        fill="none"
        stroke="url(#jvRimGlint)"
        strokeWidth="5.5"
        strokeLinecap="round"
        opacity="0.75"
      />
    </g>

    {/* ── Platter Tray Base Bar ── */}
    <g>
      <rect
        x="60"
        y="210"
        width="280"
        height="14"
        rx="7"
        fill="#0B253A"
        stroke="#1E3A8A"
        strokeWidth="1"
      />
      <rect
        x="72"
        y="212"
        width="256"
        height="3.5"
        rx="1.75"
        fill="#93C5FD"
        opacity="0.5"
      />
    </g>

    {/* ── Royal Navy Supporting Hand Silhouette ── */}
    <g>
      <path
        d="M 92 248 C 108 244, 126 250, 138 266 C 146 276, 152 292, 142 308 C 160 300, 180 286, 196 268 C 220 242, 260 234, 304 230 C 274 246, 240 262, 214 280 C 188 298, 168 316, 148 322 C 128 328, 114 316, 116 304 C 118 292, 122 284, 116 274 C 110 266, 100 258, 92 248 Z"
        fill="url(#jvNavyGrad)"
      />
      {/* Hand Palm Line Definition */}
      <path
        d="M 196 268 C 230 250, 266 242, 298 234"
        fill="none"
        stroke="#1E3A8A"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.6"
      />
    </g>
  </g>
);

/** JAMANVAAR Brand Typographic Wordmark */
const JamanvaarWordmark: React.FC<{ dark?: boolean }> = ({ dark }) => (
  <g>
    {/* ── Letter 'J' with Heritage Swash ── */}
    <g>
      {/* Main J Trunk */}
      <path
        d="M 88 18 C 88 8, 80 0, 68 0 C 44 0, 28 14, 20 28 C 12 42, 18 56, 30 56 C 42 56, 48 46, 48 38 C 48 24, 38 20, 36 14 C 42 8, 56 6, 68 8 C 76 10, 78 20, 78 36 L 78 84 C 78 108, 62 128, 40 128 C 22 128, 10 118, 10 104 C 10 90, 22 84, 30 84 C 38 84, 44 90, 44 98 C 44 110, 32 114, 28 116 C 32 120, 40 122, 48 120 C 64 116, 72 98, 72 80 L 72 18 Z"
        fill="url(#jvNavyGrad)"
      />

      {/* ── Mint Leaves Garnish on J ── */}
      <g transform="translate(4, 22) scale(0.85)">
        {/* Left Mint Leaf */}
        <path
          d="M 28 40 C 18 36, 12 24, 18 10 C 26 14, 34 26, 32 40 Z"
          fill="url(#jvLeafGrad)"
          stroke="#1E3A0F"
          strokeWidth="0.8"
        />
        <path
          d="M 20 24 C 23 20, 28 22, 30 26"
          fill="none"
          stroke="url(#jvLeafLight)"
          strokeWidth="1.2"
          opacity="0.8"
        />
        {/* Right Mint Leaf */}
        <path
          d="M 32 38 C 36 26, 48 18, 60 22 C 58 36, 46 44, 32 38 Z"
          fill="url(#jvLeafGrad)"
          stroke="#1E3A0F"
          strokeWidth="0.8"
        />
        <path
          d="M 40 28 C 45 28, 50 32, 54 30"
          fill="none"
          stroke="url(#jvLeafLight)"
          strokeWidth="1.2"
          opacity="0.8"
        />
      </g>
    </g>

    {/* ── Letters: A M A N V A A R in Custom Heritage Serif ── */}
    <g transform="translate(100, 0)">
      <text
        x="0"
        y="96"
        fontFamily="'Playfair Display', 'Cinzel', 'Georgia', 'Times New Roman', serif"
        fontSize="106"
        fontWeight="900"
        letterSpacing="3"
        fill="url(#jvNavyGrad)"
        style={{
          textAnchor: 'start',
          fontFeatureSettings: '"liga" 1, "kern" 1'
        }}
      >
        AMANVAA
      </text>

      {/* Custom Flourished Final 'R' */}
      <g transform="translate(422, 0)">
        <text
          x="0"
          y="96"
          fontFamily="'Playfair Display', 'Cinzel', 'Georgia', 'Times New Roman', serif"
          fontSize="106"
          fontWeight="900"
          fill="url(#jvNavyGrad)"
        >
          R
        </text>

        {/* Extended Flourish Tail on R */}
        <path
          d="M 52 92 C 60 98, 70 108, 80 114 C 94 122, 110 120, 118 108 C 122 102, 120 96, 114 96 C 108 96, 104 100, 102 104 C 98 110, 88 110, 78 104 C 68 98, 58 88, 52 80 Z"
          fill="url(#jvNavyGrad)"
        />

        {/* ── Right Golden Crescent Arch ── */}
        <path
          d="M 48 30 C 82 22, 118 42, 126 78 C 132 104, 118 128, 92 142 C 114 130, 122 104, 116 80 C 110 50, 78 30, 48 30 Z"
          fill="url(#jvGoldBar)"
        />

        {/* ── Fork & Spoon Hospitality Icon inside crescent ── */}
        <g transform="translate(92, 64) scale(0.68)">
          {/* Fork */}
          <path
            d="M 2 0 L 2 12 C 2 16, 6 18, 6 22 L 6 36 L 4 36 L 4 22 C 4 18, 0 16, 0 12 L 0 0 L 1.5 0 L 1.5 8 L 2.5 8 L 2.5 0 L 3.5 0 L 3.5 8 L 4.5 8 L 4.5 0 Z"
            fill="url(#jvNavyGrad)"
          />
          {/* Spoon */}
          <path
            d="M 14 0 C 18 0, 20 6, 20 12 C 20 17, 17 19, 16 22 L 16 36 L 14 36 L 14 22 C 13 19, 10 17, 10 12 C 10 6, 12 0, 14 0 Z"
            fill="url(#jvNavyGrad)"
          />
        </g>
      </g>
    </g>
  </g>
);

/** "by KELVIONTECH" Subtitle with flanking decorative lines */
const KelviontechSubtitle: React.FC<{ dark?: boolean }> = ({ dark }) => (
  <g>
    {/* Left Flanking Gold Bar */}
    <line
      x1="0"
      y1="0"
      x2="48"
      y2="0"
      stroke="url(#jvGoldBar)"
      strokeWidth="2.5"
      strokeLinecap="round"
    />

    {/* "by" in elegant italic */}
    <text
      x="62"
      y="5"
      fontFamily="'Playfair Display', 'Georgia', serif"
      fontStyle="italic"
      fontSize="22"
      fontWeight="600"
      fill={dark ? '#E2E8F0' : '#0B253A'}
    >
      by
    </text>

    {/* "KELVIONTECH" in clean, bold, spaced geometric uppercase */}
    <text
      x="96"
      y="5"
      fontFamily="'Montserrat', 'Inter', 'Outfit', 'Segoe UI', sans-serif"
      fontSize="20"
      fontWeight="900"
      letterSpacing="5"
      fill={dark ? '#38BDF8' : '#0B4D68'}
    >
      KELVIONTECH
    </text>

    {/* Right Flanking Gold Bar */}
    <line
      x1="322"
      y1="0"
      x2="370"
      y2="0"
      stroke="url(#jvGoldBar)"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
  </g>
);

export default JamanvaarVectorLogo;
