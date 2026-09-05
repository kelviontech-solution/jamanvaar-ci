import React from 'react';

/**
 * Common styling constants for subtle, premium line-art
 */
const STROKE_GOLD = '#C5A059';
const STROKE_GOLD_MUTED = '#D4B37F';
const STROKE_NAVY = '#0B253A';
const STROKE_SAFFRON = '#E66817';

export interface SplashCornerArtworkProps {
  className?: string;
  step?: number;
}

/**
 * Top-Left: Elegant Indian Dining & Hospitality Illustration
 * Graceful palace arch, hanging ceremonial brass lantern, royal dining cloche with steam,
 * and fine dining tableware with traditional botanical laurel accents.
 */
export const TopLeftDiningMotif: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg
    viewBox="0 0 320 320"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`select-none pointer-events-none ${className}`}
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="tlDiningGold" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor={STROKE_GOLD} stopOpacity="0.85" />
        <stop offset="70%" stopColor={STROKE_GOLD_MUTED} stopOpacity="0.45" />
        <stop offset="100%" stopColor={STROKE_GOLD} stopOpacity="0.1" />
      </linearGradient>
      <linearGradient id="tlNavyFade" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor={STROKE_NAVY} stopOpacity="0.75" />
        <stop offset="60%" stopColor={STROKE_NAVY} stopOpacity="0.3" />
        <stop offset="100%" stopColor={STROKE_NAVY} stopOpacity="0" />
      </linearGradient>
      <radialGradient id="tlLanternGlow" cx="54" cy="112" r="45" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor={STROKE_SAFFRON} stopOpacity="0.45" />
        <stop offset="60%" stopColor={STROKE_GOLD} stopOpacity="0.18" />
        <stop offset="100%" stopColor={STROKE_GOLD} stopOpacity="0" />
      </radialGradient>
      <radialGradient id="tlAmbientGlow" cx="0" cy="0" r="180" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor={STROKE_SAFFRON} stopOpacity="0.25" />
        <stop offset="50%" stopColor={STROKE_GOLD} stopOpacity="0.1" />
        <stop offset="100%" stopColor={STROKE_GOLD} stopOpacity="0" />
      </radialGradient>
    </defs>

    {/* Subtle Corner Ambient Depth */}
    <circle cx="0" cy="0" r="160" fill="url(#tlAmbientGlow)" />

    {/* Outer Framing Hairline Rules */}
    <path d="M 0 16 L 240 16" stroke="url(#tlDiningGold)" strokeWidth="1" strokeDasharray="3 3" />
    <path d="M 16 0 L 16 240" stroke="url(#tlDiningGold)" strokeWidth="1" strokeDasharray="3 3" />
    <path d="M 0 32 L 210 32" stroke="url(#tlNavyFade)" strokeWidth="1.2" />
    <path d="M 32 0 L 32 210" stroke="url(#tlNavyFade)" strokeWidth="1.2" />

    {/* Heritage Palace Arch Outline (Scalloped Jharokha Silhouette) */}
    <path
      d="M 32 180 C 70 180, 85 160, 95 140 C 105 120, 120 105, 140 95 C 160 85, 180 70, 180 32"
      stroke="url(#tlDiningGold)"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
    <path
      d="M 32 195 C 78 195, 96 172, 108 150 C 120 128, 138 110, 160 98 C 182 86, 195 68, 195 32"
      stroke="url(#tlNavyFade)"
      strokeWidth="1"
    />

    {/* Hanging Ceremonial Brass Lantern (Deepam Lantern) */}
    <g>
      {/* Lantern Suspension Chain */}
      <line x1="54" y1="32" x2="54" y2="78" stroke={STROKE_GOLD} strokeWidth="1" strokeDasharray="2 2" />
      <circle cx="54" cy="80" r="2.5" fill={STROKE_GOLD} fillOpacity="0.8" />

      {/* Warm Ambient Glow from Lantern */}
      <circle cx="54" cy="112" r="38" fill="url(#tlLanternGlow)" />

      {/* Lantern Top Cap & Finial */}
      <path d="M 46 86 L 54 80 L 62 86 Z" stroke={STROKE_GOLD} strokeWidth="1.2" fill={STROKE_GOLD} fillOpacity="0.25" />
      <circle cx="54" cy="79" r="1.5" fill={STROKE_SAFFRON} />

      {/* Lantern Body with Filigree Cutouts */}
      <path
        d="M 46 86 L 43 112 C 43 118, 48 122, 54 122 C 60 122, 65 118, 65 112 L 62 86 Z"
        stroke={STROKE_GOLD}
        strokeWidth="1.3"
        fill="none"
      />
      {/* Interior Auspicious Flame / Diya */}
      <path
        d="M 52 106 C 52 101, 54 96, 54 94 C 54 96, 56 101, 56 106 C 56 109, 52 109, 52 106 Z"
        fill={STROKE_SAFFRON}
      />
      {/* Lantern Filigree Crossbars */}
      <line x1="44" y1="98" x2="64" y2="98" stroke={STROKE_GOLD} strokeWidth="0.8" strokeOpacity="0.7" />
      <line x1="44" y1="108" x2="64" y2="108" stroke={STROKE_GOLD} strokeWidth="0.8" strokeOpacity="0.7" />
      <line x1="54" y1="86" x2="54" y2="122" stroke={STROKE_GOLD} strokeWidth="0.8" strokeOpacity="0.7" />

      {/* Hanging Bell / Droplet at Bottom of Lantern */}
      <path d="M 54 122 L 54 130" stroke={STROKE_GOLD} strokeWidth="1" />
      <circle cx="54" cy="132" r="2" fill={STROKE_GOLD} fillOpacity="0.9" />
    </g>

    {/* Royal Serving Cloche (Banquet Presentation) */}
    <g transform="translate(100, 52)">
      {/* Aromatic Steam Wisps */}
      <path
        d="M 40 10 C 35 2, 42 -6, 36 -14"
        stroke={STROKE_SAFFRON}
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeOpacity="0.75"
      />
      <path
        d="M 50 12 C 46 0, 54 -10, 48 -20"
        stroke={STROKE_GOLD}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeOpacity="0.85"
      />
      <path
        d="M 60 10 C 56 2, 63 -6, 58 -14"
        stroke={STROKE_SAFFRON}
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeOpacity="0.75"
      />

      {/* Cloche Handle Knob */}
      <circle cx="50" cy="18" r="4.5" stroke={STROKE_GOLD} strokeWidth="1.2" fill={STROKE_GOLD} fillOpacity="0.3" />
      <ellipse cx="50" cy="23" rx="3.5" ry="1.5" fill={STROKE_NAVY} fillOpacity="0.6" />

      {/* Golden Cloche Dome */}
      <path
        d="M 12 65 C 12 34, 30 25, 50 25 C 70 25, 88 34, 88 65 Z"
        stroke={STROKE_GOLD}
        strokeWidth="1.5"
        fill={STROKE_GOLD}
        fillOpacity="0.08"
      />
      {/* Dome Specular Sheen */}
      <path
        d="M 22 62 C 26 40, 38 32, 50 32"
        stroke={STROKE_GOLD_MUTED}
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeOpacity="0.6"
      />
      {/* Cloche Base Tray Rim */}
      <rect x="6" y="65" width="88" height="4.5" rx="2.25" stroke={STROKE_NAVY} strokeWidth="1.1" fill={STROKE_GOLD} fillOpacity="0.15" />

      {/* Flanking Fine Tableware: Ornate Rajput Serving Cutlery */}
      {/* Left Tableware: Royal Serving Spoon */}
      <g transform="translate(-10, 24)">
        <ellipse cx="6" cy="10" rx="5" ry="9" stroke={STROKE_NAVY} strokeWidth="1" fill="none" />
        <path d="M 6 19 L 6 52" stroke={STROKE_NAVY} strokeWidth="1" strokeLinecap="round" />
        <circle cx="6" cy="54" r="2" fill={STROKE_GOLD} fillOpacity="0.8" />
      </g>

      {/* Right Tableware: Royal Banquet Fork */}
      <g transform="translate(94, 24)">
        <path d="M 0 0 L 0 14 C 0 18, 4 21, 4 25 L 4 52" stroke={STROKE_NAVY} strokeWidth="1" strokeLinecap="round" />
        <path d="M 2.5 0 L 2.5 14" stroke={STROKE_NAVY} strokeWidth="0.8" />
        <path d="M 5 0 L 5 14" stroke={STROKE_NAVY} strokeWidth="0.8" />
        <path d="M 7.5 0 L 7.5 14 C 7.5 18, 4 21, 4 25" stroke={STROKE_NAVY} strokeWidth="1" strokeLinecap="round" />
        <circle cx="4" cy="54" r="2" fill={STROKE_GOLD} fillOpacity="0.8" />
      </g>
    </g>

    {/* Botanical Flourish: Mint & Coriander Sprigs Along Arch */}
    <g transform="translate(45, 145)">
      {/* Stem */}
      <path d="M 0 20 C 15 15, 25 5, 35 -5" stroke={STROKE_GOLD} strokeWidth="1" strokeLinecap="round" fill="none" />
      {/* Leaves */}
      <path
        d="M 12 18 C 8 12, 10 4, 18 2 C 20 10, 18 16, 12 18 Z"
        stroke={STROKE_GOLD}
        strokeWidth="0.9"
        fill={STROKE_GOLD}
        fillOpacity="0.15"
      />
      <path
        d="M 22 10 C 20 2, 26 -4, 32 -2 C 32 6, 28 10, 22 10 Z"
        stroke={STROKE_NAVY}
        strokeWidth="0.8"
        strokeOpacity="0.7"
        fill="none"
      />
      <path
        d="M 32 -2 C 32 -10, 40 -14, 46 -10 C 44 -2, 38 0, 32 -2 Z"
        stroke={STROKE_GOLD}
        strokeWidth="0.9"
        fill={STROKE_GOLD}
        fillOpacity="0.12"
      />
    </g>
  </svg>
);

/**
 * Bottom-Left: Authentic Indian Thali & Hospitality Spices Illustration
 * Grand traditional circular Indian Thali with ornate beaded rim, traditional serving katoris,
 * artisanal brass spice vessel, whole spices (cardamom, star anise), and fine linen runner.
 */
export const BottomLeftThaliMotif: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg
    viewBox="0 0 320 320"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`select-none pointer-events-none ${className}`}
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="blThaliGold" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stopColor={STROKE_GOLD} stopOpacity="0.85" />
        <stop offset="70%" stopColor={STROKE_GOLD_MUTED} stopOpacity="0.45" />
        <stop offset="100%" stopColor={STROKE_GOLD} stopOpacity="0.1" />
      </linearGradient>
      <linearGradient id="blNavyFade" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stopColor={STROKE_NAVY} stopOpacity="0.75" />
        <stop offset="60%" stopColor={STROKE_NAVY} stopOpacity="0.3" />
        <stop offset="100%" stopColor={STROKE_NAVY} stopOpacity="0" />
      </linearGradient>
      <radialGradient id="blThaliGlow" cx="120" cy="210" r="95" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor={STROKE_GOLD} stopOpacity="0.25" />
        <stop offset="65%" stopColor={STROKE_SAFFRON} stopOpacity="0.1" />
        <stop offset="100%" stopColor={STROKE_GOLD} stopOpacity="0" />
      </radialGradient>
    </defs>

    {/* Subtle Corner Glow */}
    <circle cx="0" cy="320" r="160" fill="url(#blThaliGlow)" />

    {/* Outer Framing Rules */}
    <path d="M 0 304 L 240 304" stroke="url(#blThaliGold)" strokeWidth="1" strokeDasharray="3 3" />
    <path d="M 16 320 L 16 80" stroke="url(#blThaliGold)" strokeWidth="1" strokeDasharray="3 3" />
    <path d="M 0 288 L 210 288" stroke="url(#blNavyFade)" strokeWidth="1.2" />
    <path d="M 32 320 L 32 110" stroke="url(#blNavyFade)" strokeWidth="1.2" />

    {/* Grand Traditional Indian Thali Presentation */}
    <g transform="translate(58, 128)">
      {/* Outer Thali Rim (Beaded Scalloped Edge) */}
      <circle
        cx="92"
        cy="92"
        r="86"
        stroke="url(#blThaliGold)"
        strokeWidth="1.8"
        fill={STROKE_GOLD}
        fillOpacity="0.04"
      />
      <circle cx="92" cy="92" r="80" stroke={STROKE_NAVY} strokeWidth="1" strokeOpacity="0.65" />
      <circle cx="92" cy="92" r="74" stroke={STROKE_GOLD_MUTED} strokeWidth="0.8" strokeDasharray="2 3" strokeOpacity="0.75" />

      {/* Decorative Beaded Pearls along Thali Outer Lip */}
      <g fill={STROKE_GOLD} fillOpacity="0.8">
        <circle cx="92" cy="7" r="1.5" />
        <circle cx="125" cy="13" r="1.5" />
        <circle cx="154" cy="30" r="1.5" />
        <circle cx="173" cy="58" r="1.5" />
        <circle cx="178" cy="92" r="1.5" />
        <circle cx="173" cy="126" r="1.5" />
        <circle cx="154" cy="154" r="1.5" />
        <circle cx="125" cy="171" r="1.5" />
        <circle cx="92" cy="177" r="1.5" />
        <circle cx="59" cy="171" r="1.5" />
        <circle cx="30" cy="154" r="1.5" />
        <circle cx="11" cy="126" r="1.5" />
        <circle cx="6" cy="92" r="1.5" />
        <circle cx="11" cy="58" r="1.5" />
        <circle cx="30" cy="30" r="1.5" />
        <circle cx="59" cy="13" r="1.5" />
      </g>

      {/* Arranged Traditional Indian Serving Katoris (Bowls) */}
      {/* Top Katori 1: Saffron Rice / Sweet Dish */}
      <g transform="translate(92, 40)">
        <circle cx="0" cy="0" r="18" stroke={STROKE_GOLD} strokeWidth="1.2" fill={STROKE_GOLD} fillOpacity="0.15" />
        <circle cx="0" cy="0" r="14" stroke={STROKE_NAVY} strokeWidth="0.8" strokeOpacity="0.6" />
        <circle cx="0" cy="0" r="2.5" fill={STROKE_SAFFRON} fillOpacity="0.8" />
      </g>

      {/* Right Katori 2: Dal Tadka with Garnish */}
      <g transform="translate(138, 70)">
        <circle cx="0" cy="0" r="17" stroke={STROKE_GOLD} strokeWidth="1.2" fill={STROKE_GOLD} fillOpacity="0.12" />
        <circle cx="0" cy="0" r="13" stroke={STROKE_NAVY} strokeWidth="0.8" strokeOpacity="0.6" />
        <path d="M -3 0 L 3 0" stroke={STROKE_SAFFRON} strokeWidth="1" strokeLinecap="round" />
        <path d="M 0 -3 L 0 3" stroke={STROKE_SAFFRON} strokeWidth="1" strokeLinecap="round" />
      </g>

      {/* Bottom-Right Katori 3: Paneer Curry */}
      <g transform="translate(132, 118)">
        <circle cx="0" cy="0" r="17" stroke={STROKE_GOLD} strokeWidth="1.2" fill={STROKE_GOLD} fillOpacity="0.12" />
        <circle cx="0" cy="0" r="13" stroke={STROKE_NAVY} strokeWidth="0.8" strokeOpacity="0.6" />
        <rect x="-3" y="-3" width="6" height="6" rx="1" stroke={STROKE_GOLD} strokeWidth="0.8" />
      </g>

      {/* Bottom-Left Katori 4: Raita / Yogurt */}
      <g transform="translate(52, 118)">
        <circle cx="0" cy="0" r="17" stroke={STROKE_GOLD} strokeWidth="1.2" fill={STROKE_GOLD} fillOpacity="0.12" />
        <circle cx="0" cy="0" r="13" stroke={STROKE_NAVY} strokeWidth="0.8" strokeOpacity="0.6" />
        <circle cx="0" cy="0" r="2" fill={STROKE_GOLD} fillOpacity="0.6" />
      </g>

      {/* Left Katori 5: Chutney / Pickle Bowl */}
      <g transform="translate(46, 70)">
        <circle cx="0" cy="0" r="16" stroke={STROKE_GOLD} strokeWidth="1.2" fill={STROKE_GOLD} fillOpacity="0.12" />
        <circle cx="0" cy="0" r="12" stroke={STROKE_NAVY} strokeWidth="0.8" strokeOpacity="0.6" />
        <circle cx="0" cy="0" r="2.5" fill={STROKE_SAFFRON} fillOpacity="0.8" />
      </g>

      {/* Center of Thali: Rolled Roti / Naan Bread Silhouettes */}
      <g transform="translate(92, 98)">
        <ellipse cx="0" cy="-6" rx="14" ry="7" stroke={STROKE_NAVY} strokeWidth="1" strokeOpacity="0.75" fill="none" />
        <ellipse cx="2" cy="0" rx="15" ry="7" stroke={STROKE_GOLD} strokeWidth="1.1" fill={STROKE_GOLD} fillOpacity="0.18" />
        <ellipse cx="-2" cy="6" rx="14" ry="6.5" stroke={STROKE_NAVY} strokeWidth="1" strokeOpacity="0.7" fill="none" />
      </g>
    </g>

    {/* Artisanal Brass Handi & Spice Vessel (Beside the Thali) */}
    <g transform="translate(24, 182)">
      {/* Handi Body */}
      <ellipse cx="26" cy="18" rx="20" ry="4" stroke={STROKE_GOLD} strokeWidth="1.3" fill={STROKE_GOLD} fillOpacity="0.2" />
      <path
        d="M 10 20 C 4 34, 6 52, 20 58 C 26 60, 34 60, 40 58 C 54 52, 56 34, 50 20"
        stroke={STROKE_GOLD}
        strokeWidth="1.4"
        fill="none"
      />
      <ellipse cx="30" cy="58" rx="14" ry="2.5" stroke={STROKE_NAVY} strokeWidth="1" fill={STROKE_GOLD} fillOpacity="0.3" />
      {/* Handi Repoussé Hammered Marks */}
      <path d="M 16 36 C 22 42, 38 42, 44 36" stroke={STROKE_GOLD_MUTED} strokeWidth="0.8" strokeDasharray="1.5 2" />
    </g>

    {/* Whole Spices: Cardamom Pods & Star Anise Spikes */}
    <g transform="translate(196, 236)">
      {/* Whole Cardamom Pod (Elaichi) */}
      <g transform="rotate(-25)">
        <path
          d="M 0 0 C -5 8, -5 18, 0 24 C 5 18, 5 8, 0 0 Z"
          stroke={STROKE_GOLD}
          strokeWidth="1.2"
          fill={STROKE_GOLD}
          fillOpacity="0.2"
        />
        <line x1="0" y1="2" x2="0" y2="22" stroke={STROKE_GOLD} strokeWidth="0.8" strokeOpacity="0.7" />
      </g>

      {/* Whole Star Anise (Chakra Phool) Silhouette */}
      <g transform="translate(24, 8) scale(0.65)">
        <circle cx="0" cy="0" r="3.5" fill={STROKE_GOLD} />
        {/* 6 radiating pods */}
        <path d="M 0 -3 C -3 -8, -2 -16, 0 -18 C 2 -16, 3 -8, 0 -3 Z" fill={STROKE_NAVY} fillOpacity="0.75" />
        <path d="M 3 -1.5 C 7 -4, 15 -6, 17 -4 C 15 -1, 8 1, 3 -1.5 Z" fill={STROKE_NAVY} fillOpacity="0.75" />
        <path d="M 3 1.5 C 7 4, 15 6, 17 4 C 15 1, 8 -1, 3 1.5 Z" fill={STROKE_NAVY} fillOpacity="0.75" />
        <path d="M 0 3 C 3 8, 2 16, 0 18 C -2 16, -3 8, 0 3 Z" fill={STROKE_NAVY} fillOpacity="0.75" />
        <path d="M -3 1.5 C -7 4, -15 6, -17 4 C -15 1, -8 -1, -3 1.5 Z" fill={STROKE_NAVY} fillOpacity="0.75" />
        <path d="M -3 -1.5 C -7 -4, -15 -6, -17 -4 C -15 -1, -8 1, -3 -1.5 Z" fill={STROKE_NAVY} fillOpacity="0.75" />
      </g>

      {/* Mint Leaf Garnish */}
      <path
        d="M 10 24 C 2 20, 0 10, 5 3 C 12 6, 16 16, 10 24 Z"
        stroke={STROKE_GOLD}
        strokeWidth="1"
        fill={STROKE_GOLD}
        fillOpacity="0.15"
      />
    </g>

    {/* Subtle Linen Runner Base Line */}
    <path
      d="M 32 230 C 65 230, 80 245, 90 260 C 100 275, 115 288, 140 288 L 220 288"
      stroke="url(#blThaliGold)"
      strokeWidth="1.2"
      strokeLinecap="round"
    />
  </svg>
);

/**
 * Top-Right: Heritage Dining & Hospitality Motif (Existing & Preserved)
 * Royal serving cloche, fine dining cutlery with royal flourishes, and scalloped platter rim.
 */
export const TopRightHospitalityMotif: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg
    viewBox="0 0 320 320"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`select-none pointer-events-none ${className}`}
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="trHospGold" x1="100%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor={STROKE_GOLD} stopOpacity="0.85" />
        <stop offset="70%" stopColor={STROKE_GOLD_MUTED} stopOpacity="0.4" />
        <stop offset="100%" stopColor={STROKE_GOLD} stopOpacity="0.1" />
      </linearGradient>
      <linearGradient id="trNavyFade" x1="100%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor={STROKE_NAVY} stopOpacity="0.75" />
        <stop offset="60%" stopColor={STROKE_NAVY} stopOpacity="0.3" />
        <stop offset="100%" stopColor={STROKE_NAVY} stopOpacity="0" />
      </linearGradient>
      <radialGradient id="trSunburst" cx="320" cy="0" r="180" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor={STROKE_SAFFRON} stopOpacity="0.3" />
        <stop offset="50%" stopColor={STROKE_GOLD} stopOpacity="0.12" />
        <stop offset="100%" stopColor={STROKE_GOLD} stopOpacity="0" />
      </radialGradient>
    </defs>

    {/* Subtle Corner Glow */}
    <circle cx="320" cy="0" r="160" fill="url(#trSunburst)" />

    {/* Outer Framing Rules */}
    <path d="M 320 16 L 80 16" stroke="url(#trHospGold)" strokeWidth="1" strokeDasharray="3 3" />
    <path d="M 304 0 L 304 240" stroke="url(#trHospGold)" strokeWidth="1" strokeDasharray="3 3" />
    <path d="M 320 32 L 110 32" stroke="url(#trNavyFade)" strokeWidth="1.2" />
    <path d="M 288 0 L 288 210" stroke="url(#trNavyFade)" strokeWidth="1.2" />

    {/* Corner Finial / Medallion */}
    <g transform="translate(288, 18)">
      <circle cx="-14" cy="14" r="8" stroke={STROKE_GOLD} strokeWidth="1.2" />
      <circle cx="-14" cy="14" r="3.5" fill={STROKE_SAFFRON} fillOpacity="0.7" />
      <path d="M -6 14 L 0 14" stroke={STROKE_GOLD} strokeWidth="1.2" />
      <path d="M -14 6 L -14 0" stroke={STROKE_GOLD} strokeWidth="1.2" />
      <path d="M -22 14 L -28 14" stroke={STROKE_GOLD} strokeWidth="1.2" />
      <path d="M -14 22 L -14 28" stroke={STROKE_GOLD} strokeWidth="1.2" />
    </g>

    {/* Stylized Royal Cloche (Fine Dining Cover) in Top-Right quadrant */}
    <g transform="translate(140, 50)">
      {/* Rising Steam Swirls */}
      <path
        d="M 60 12 C 55 4, 62 -6, 56 -14"
        stroke={STROKE_SAFFRON}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeOpacity="0.7"
      />
      <path
        d="M 72 14 C 68 2, 78 -10, 70 -20"
        stroke={STROKE_GOLD}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeOpacity="0.8"
      />
      <path
        d="M 84 12 C 80 4, 88 -6, 82 -14"
        stroke={STROKE_SAFFRON}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeOpacity="0.7"
      />

      {/* Cloche Knob */}
      <circle cx="72" cy="20" r="5" stroke={STROKE_GOLD} strokeWidth="1.2" fill={STROKE_GOLD} fillOpacity="0.25" />
      <ellipse cx="72" cy="26" rx="4" ry="1.5" fill={STROKE_NAVY} fillOpacity="0.6" />

      {/* Royal Cloche Dome */}
      <path
        d="M 24 75 C 24 38, 45 28, 72 28 C 99 28, 120 38, 120 75 Z"
        stroke={STROKE_GOLD}
        strokeWidth="1.6"
        fill="none"
      />
      {/* Inner Sheen Arc */}
      <path
        d="M 36 72 C 40 46, 54 36, 72 36"
        stroke={STROKE_GOLD_MUTED}
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeOpacity="0.6"
      />
      {/* Platter Base Rim */}
      <rect x="16" y="75" width="112" height="5" rx="2.5" stroke={STROKE_NAVY} strokeWidth="1.2" fill={STROKE_GOLD} fillOpacity="0.1" />

      {/* Royal Tableware Flanking: Stylized Fork & Spoon */}
      {/* Left: Ornate Fork */}
      <g transform="translate(4, 30)">
        <path d="M 0 0 L 0 16 C 0 22, 5 25, 5 30 L 5 60" stroke={STROKE_NAVY} strokeWidth="1.1" strokeLinecap="round" />
        <path d="M 3 0 L 3 16" stroke={STROKE_NAVY} strokeWidth="1" />
        <path d="M 6 0 L 6 16" stroke={STROKE_NAVY} strokeWidth="1" />
        <path d="M 9 0 L 9 16 C 9 22, 5 25, 5 30" stroke={STROKE_NAVY} strokeWidth="1.1" strokeLinecap="round" />
        <circle cx="5" cy="62" r="2.5" fill={STROKE_GOLD} fillOpacity="0.8" />
      </g>

      {/* Right: Ornate Spoon */}
      <g transform="translate(132, 30)">
        <ellipse cx="6" cy="12" rx="6" ry="10" stroke={STROKE_NAVY} strokeWidth="1.1" fill="none" />
        <path d="M 6 22 L 6 60" stroke={STROKE_NAVY} strokeWidth="1.1" strokeLinecap="round" />
        <circle cx="6" cy="62" r="2.5" fill={STROKE_GOLD} fillOpacity="0.8" />
      </g>
    </g>

    {/* Scalloped Royal Thali / Charger Rim Framing Curves */}
    <path
      d="M 288 180 C 250 180, 235 160, 225 140 C 215 120, 200 105, 180 95 C 160 85, 140 70, 140 32"
      stroke="url(#trHospGold)"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
    <path
      d="M 288 195 C 242 195, 224 172, 212 150 C 200 128, 182 110, 160 98 C 138 86, 125 68, 125 32"
      stroke="url(#trNavyFade)"
      strokeWidth="1"
    />

    {/* Scallop Petal Arc Border */}
    <g stroke={STROKE_GOLD} strokeWidth="1" strokeOpacity="0.6">
      <path d="M 280 150 A 8 8 0 0 0 264 150" />
      <path d="M 264 150 A 8 8 0 0 0 248 142" />
      <path d="M 248 142 A 8 8 0 0 0 234 130" />
      <path d="M 234 130 A 8 8 0 0 0 220 116" />
      <path d="M 220 116 A 8 8 0 0 0 208 98" />
      <path d="M 208 98 A 8 8 0 0 0 200 80" />
      <path d="M 200 80 A 8 8 0 0 0 196 62" />
    </g>
  </svg>
);

/**
 * Bottom-Right: Traditional Food-Service & Auspicious Welcoming Motif (Existing & Preserved)
 * Traditional Indian ceremonial deepam (auspicious brass lamp) & royal handi/degchi with aromatic steam.
 */
export const BottomRightFoodServiceMotif: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg
    viewBox="0 0 320 320"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`select-none pointer-events-none ${className}`}
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="brFoodGold" x1="100%" y1="100%" x2="0%" y2="0%">
        <stop offset="0%" stopColor={STROKE_GOLD} stopOpacity="0.85" />
        <stop offset="70%" stopColor={STROKE_GOLD_MUTED} stopOpacity="0.4" />
        <stop offset="100%" stopColor={STROKE_GOLD} stopOpacity="0.1" />
      </linearGradient>
      <linearGradient id="brNavyFade" x1="100%" y1="100%" x2="0%" y2="0%">
        <stop offset="0%" stopColor={STROKE_NAVY} stopOpacity="0.75" />
        <stop offset="60%" stopColor={STROKE_NAVY} stopOpacity="0.3" />
        <stop offset="100%" stopColor={STROKE_NAVY} stopOpacity="0" />
      </linearGradient>
      <radialGradient id="brSunburst" cx="320" cy="320" r="180" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor={STROKE_SAFFRON} stopOpacity="0.35" />
        <stop offset="50%" stopColor={STROKE_GOLD} stopOpacity="0.15" />
        <stop offset="100%" stopColor={STROKE_GOLD} stopOpacity="0" />
      </radialGradient>
    </defs>

    {/* Corner Glow */}
    <circle cx="320" cy="320" r="160" fill="url(#brSunburst)" />

    {/* Outer Framing Rules */}
    <path d="M 320 304 L 80 304" stroke="url(#brFoodGold)" strokeWidth="1" strokeDasharray="3 3" />
    <path d="M 304 320 L 304 80" stroke="url(#brFoodGold)" strokeWidth="1" strokeDasharray="3 3" />
    <path d="M 320 288 L 110 288" stroke="url(#brNavyFade)" strokeWidth="1.2" />
    <path d="M 288 320 L 288 110" stroke="url(#brNavyFade)" strokeWidth="1.2" />

    {/* Corner Medallion */}
    <g transform="translate(288, 288)">
      <circle cx="-14" cy="-14" r="8" stroke={STROKE_GOLD} strokeWidth="1.2" />
      <circle cx="-14" cy="-14" r="3.5" fill={STROKE_SAFFRON} fillOpacity="0.7" />
      <path d="M -6 -14 L 0 -14" stroke={STROKE_GOLD} strokeWidth="1.2" />
      <path d="M -14 -6 L -14 0" stroke={STROKE_GOLD} strokeWidth="1.2" />
      <path d="M -22 -14 L -28 -14" stroke={STROKE_GOLD} strokeWidth="1.2" />
      <path d="M -14 -22 L -14 -28" stroke={STROKE_GOLD} strokeWidth="1.2" />
    </g>

    {/* Royal Handi / Cooking Degchi with Aromatic Steam Ribbons */}
    <g transform="translate(142, 160)">
      {/* Rising Culinary Steam Ribbons */}
      <path
        d="M 30 15 C 24 5, 34 -6, 28 -18"
        stroke={STROKE_SAFFRON}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeOpacity="0.75"
      />
      <path
        d="M 45 12 C 40 0, 52 -12, 44 -24"
        stroke={STROKE_GOLD}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeOpacity="0.85"
      />
      <path
        d="M 60 15 C 55 5, 65 -6, 58 -18"
        stroke={STROKE_SAFFRON}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeOpacity="0.75"
      />

      {/* Handi Flanged Neck & Rim */}
      <ellipse cx="45" cy="22" rx="34" ry="5.5" stroke={STROKE_GOLD} strokeWidth="1.4" fill={STROKE_GOLD} fillOpacity="0.15" />
      <path d="M 18 22 C 18 26, 72 26, 72 22" stroke={STROKE_NAVY} strokeWidth="1.1" />

      {/* Handi Belly / Curved Body */}
      <path
        d="M 18 25 C 6 42, 10 65, 30 72 C 40 75, 50 75, 60 72 C 80 65, 84 42, 72 25"
        stroke={STROKE_GOLD}
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
      {/* Handi Base Ring */}
      <ellipse cx="45" cy="72" rx="20" ry="3.5" stroke={STROKE_NAVY} strokeWidth="1.2" fill={STROKE_GOLD} fillOpacity="0.2" />

      {/* Ornate Arch Handles */}
      <path d="M 16 30 C 6 30, 4 44, 14 46" stroke={STROKE_GOLD} strokeWidth="1.3" strokeLinecap="round" />
      <path d="M 74 30 C 84 30, 86 44, 76 46" stroke={STROKE_GOLD} strokeWidth="1.3" strokeLinecap="round" />

      {/* Repoussé Hammered Engraving Arc */}
      <path
        d="M 24 45 C 32 54, 58 54, 66 45"
        stroke={STROKE_GOLD_MUTED}
        strokeWidth="1"
        strokeDasharray="2 3"
        strokeOpacity="0.7"
      />
    </g>

    {/* Traditional Indian Ceremonial Welcoming Deepam (Diya) with Sacred Flame */}
    <g transform="translate(85, 230)">
      {/* Auspicious Sacred Flame (Jyoti) */}
      <path
        d="M 32 8 C 32 0, 36 -12, 36 -16 C 36 -12, 40 0, 40 8 C 40 14, 32 14, 32 8 Z"
        fill={STROKE_SAFFRON}
        stroke={STROKE_GOLD}
        strokeWidth="1"
        strokeLinecap="round"
      />
      {/* Flame Halo Glint */}
      <circle cx="36" cy="4" r="9" stroke={STROKE_SAFFRON} strokeWidth="0.8" strokeDasharray="1.5 2" strokeOpacity="0.6" />

      {/* Deepam Bowl */}
      <path
        d="M 16 16 C 24 24, 48 24, 56 16 C 60 20, 52 28, 36 28 C 20 28, 12 20, 16 16 Z"
        stroke={STROKE_GOLD}
        strokeWidth="1.4"
        fill={STROKE_GOLD}
        fillOpacity="0.25"
      />
      {/* Deepam Stem & Base Stand */}
      <path d="M 34 28 L 34 42" stroke={STROKE_GOLD} strokeWidth="1.4" />
      <path d="M 38 28 L 38 42" stroke={STROKE_GOLD} strokeWidth="1.4" />
      <ellipse cx="36" cy="44" rx="14" ry="3.5" stroke={STROKE_NAVY} strokeWidth="1.2" fill={STROKE_GOLD} fillOpacity="0.2" />
    </g>

    {/* Traditional Rangoli Concentric Corner Arcs */}
    <path
      d="M 288 140 C 250 140, 235 160, 225 180 C 215 200, 200 215, 180 225 C 160 235, 140 250, 140 288"
      stroke="url(#brFoodGold)"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
    <path
      d="M 288 125 C 242 125, 224 148, 212 170 C 200 192, 182 210, 160 222 C 138 234, 125 252, 125 288"
      stroke="url(#brNavyFade)"
      strokeWidth="1"
    />

    {/* Auspicious Lotus Petal Scallop Band */}
    <g stroke={STROKE_GOLD} strokeWidth="1" strokeOpacity="0.65">
      <path d="M 280 170 A 8 8 0 0 1 264 170" />
      <path d="M 264 170 A 8 8 0 0 1 248 178" />
      <path d="M 248 178 A 8 8 0 0 1 234 190" />
      <path d="M 234 190 A 8 8 0 0 1 220 204" />
      <path d="M 220 204 A 8 8 0 0 1 208 222" />
      <path d="M 208 222 A 8 8 0 0 1 200 240" />
      <path d="M 200 240 A 8 8 0 0 1 196 258" />
    </g>
  </svg>
);

/**
 * Connecting Edge Filigree Rules
 * Subtle border rules that connect the corners with a fine, low-contrast hairline frame.
 */
export const ConnectingEdgeFiligree: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`absolute inset-0 pointer-events-none ${className}`} aria-hidden="true">
    {/* Top Connecting Rule with Center Diamond Accent */}
    <div className="absolute top-4 sm:top-6 inset-x-32 sm:inset-x-64 h-px flex items-center justify-center opacity-30">
      <div className="w-full h-px bg-gradient-to-r from-transparent via-[#C5A059] to-transparent" />
      <div className="absolute w-1.5 h-1.5 rotate-45 border border-[#C5A059] bg-[#FAF8F5]" />
    </div>

    {/* Bottom Connecting Rule with Center Diamond Accent */}
    <div className="absolute bottom-4 sm:bottom-6 inset-x-32 sm:inset-x-64 h-px flex items-center justify-center opacity-30">
      <div className="w-full h-px bg-gradient-to-r from-transparent via-[#C5A059] to-transparent" />
      <div className="absolute w-1.5 h-1.5 rotate-45 border border-[#C5A059] bg-[#FAF8F5]" />
    </div>

    {/* Left Connecting Rule */}
    <div className="absolute left-4 sm:left-6 inset-y-32 sm:inset-y-64 w-px flex items-center justify-center opacity-25">
      <div className="h-full w-px bg-gradient-to-b from-transparent via-[#C5A059] to-transparent" />
    </div>

    {/* Right Connecting Rule */}
    <div className="absolute right-4 sm:right-6 inset-y-32 sm:inset-y-64 w-px flex items-center justify-center opacity-25">
      <div className="h-full w-px bg-gradient-to-b from-transparent via-[#C5A059] to-transparent" />
    </div>
  </div>
);

// Backward-compatible exports
export const TopLeftArchitecturalMotif = TopLeftDiningMotif;
export const BottomLeftBotanicalMotif = BottomLeftThaliMotif;

/**
 * Master SplashCornerArtwork Composition Component
 * Wraps all 4 corners and framing elements with smooth entrance animation and responsive sizing.
 */
export const SplashCornerArtwork: React.FC<SplashCornerArtworkProps> = ({ className = '', step = 0 }) => {
  const isVisible = step >= 1;

  return (
    <div
      className={`absolute inset-0 pointer-events-none overflow-hidden transition-opacity duration-1000 ease-out ${
        isVisible ? 'opacity-100' : 'opacity-0'
      } ${className}`}
      aria-hidden="true"
    >
      {/* Central Warm Ambient Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[720px] h-[720px] rounded-full bg-gradient-to-tr from-[#F5EEE2]/80 via-[#FAF4EA]/45 to-transparent blur-3xl pointer-events-none -z-10" />

      {/* TOP-LEFT: Royal Indian Dining & Banquet Presentation */}
      <div className="absolute top-0 left-0 w-[180px] sm:w-[240px] md:w-[280px] lg:w-[320px] aspect-square opacity-70 sm:opacity-85 transition-transform duration-1000 ease-out">
        <TopLeftDiningMotif className="w-full h-full" />
      </div>

      {/* TOP-RIGHT: Heritage Dining & Hospitality Motif */}
      <div className="absolute top-0 right-0 w-[180px] sm:w-[240px] md:w-[280px] lg:w-[320px] aspect-square opacity-70 sm:opacity-85 transition-transform duration-1000 ease-out">
        <TopRightHospitalityMotif className="w-full h-full" />
      </div>

      {/* BOTTOM-LEFT: Authentic Indian Thali & Spices */}
      <div className="absolute bottom-0 left-0 w-[180px] sm:w-[240px] md:w-[280px] lg:w-[320px] aspect-square opacity-70 sm:opacity-85 transition-transform duration-1000 ease-out">
        <BottomLeftThaliMotif className="w-full h-full" />
      </div>

      {/* BOTTOM-RIGHT: Food-Service & Welcoming Deepam Motif */}
      <div className="absolute bottom-0 right-0 w-[180px] sm:w-[240px] md:w-[280px] lg:w-[320px] aspect-square opacity-70 sm:opacity-85 transition-transform duration-1000 ease-out">
        <BottomRightFoodServiceMotif className="w-full h-full" />
      </div>

      {/* Connecting Hairline Rules */}
      <ConnectingEdgeFiligree />
    </div>
  );
};

export default SplashCornerArtwork;
