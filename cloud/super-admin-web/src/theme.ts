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
export function applyTheme(pref: ThemePreference): void {
  const root = document.documentElement;
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
