const THEME_KEY = 'jamanvaar_superadmin_theme';

export type ThemePreference = 'light' | 'dark' | 'system';

export function getStoredTheme(): ThemePreference {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw === 'light' || raw === 'dark') return raw;
  } catch {
    // localStorage unavailable — falls through to 'system'.
  }
  return 'system';
}

/** Applies the theme to the document root — 'system' clears the attribute so the CSS media query takes over. */
let themeApplied = false;

/** True when the page is (or will be) shown in the dark theme, resolving the 'system' preference. */
export function isEffectivelyDark(pref: ThemePreference = getStoredTheme()): boolean {
  if (pref === 'dark') return true;
  if (pref === 'light') return false;
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function applyTheme(pref: ThemePreference): void {
  const root = document.documentElement;
  // After the first paint, colours ease between themes instead of flashing (see .theme-switching in styles.css).
  if (themeApplied) {
    root.classList.add('theme-switching');
    window.setTimeout(() => root.classList.remove('theme-switching'), 320);
  }
  themeApplied = true;
  if (pref === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', pref);
  }
  try {
    localStorage.setItem(THEME_KEY, pref);
  } catch {
    // Theme choice just won't persist across reloads.
  }
}
