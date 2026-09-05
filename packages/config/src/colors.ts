/**
 * JAMANVAAR Centralized Color Tokens
 * Derived directly from the official JAMANVAAR Brand Identity & Reference UI
 */

export const JAMANVAAR_COLORS = {
  // Brand Primary & Navies
  primary: '#0B253A',        // Deep Brand Navy
  primaryHover: '#133E5E',
  primaryActive: '#071A29',
  primaryMuted: '#1E3A52',

  // Saffron / Warm Orange Accent (Prices, Call-To-Actions, Add buttons)
  accent: '#E66817',         // Warm Restaurant Saffron / Orange
  accentHover: '#F27A2B',
  accentActive: '#D1560D',
  accentSoft: '#FFF4ED',
  accentBorder: '#FED7AA',

  // Teal / Secondary Module Accent
  teal: '#00A99D',
  tealHover: '#008F85',
  tealSoft: '#E6F7F5',

  // Backgrounds & Surfaces
  background: '#FBF9F5',     // Warm Ivory / Cream Background
  backgroundMuted: '#F4EFE6',
  surface: '#FFFFFF',        // Pure White Surface Card
  surfaceElevated: '#FFFFFF',
  surfaceSubtle: '#F8F6F0',

  // Borders & Dividers
  border: '#EBE6DD',         // Warm Muted Border
  borderLight: '#F3EFE6',
  borderDark: '#D4CBBF',

  // Text Hierarchy
  text: '#0B253A',           // Dark Navy text for maximum readability
  textSecondary: '#4A5568',  // Neutral slate secondary text
  textMuted: '#8C9BAE',      // Muted informational text
  textInverse: '#FFFFFF',

  // Dietary & Status Semantics
  veg: '#16A34A',            // Pure Veg Green
  vegBg: '#ECFDF5',
  vegBorder: '#A7F3D0',

  nonVeg: '#DC2626',         // Non-Veg Red
  nonVegBg: '#FEF2F2',
  nonVegBorder: '#FECACA',

  jain: '#B45309',           // Jain Amber Brown
  jainBg: '#FFFBEB',
  jainBorder: '#FDE68A',

  // System Statuses
  success: '#16A34A',
  warning: '#D97706',
  error: '#DC2626',
  info: '#0284C7',

  // Online / Device Health
  online: '#22C55E',
  offline: '#EF4444',
  maintenance: '#F59E0B'
} as const;

export type JamanvaarColorToken = keyof typeof JAMANVAAR_COLORS;
