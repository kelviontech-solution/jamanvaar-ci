/**
 * Copies text and says whether it really worked.
 *
 * The async clipboard API only exists on secure pages (https or localhost). The apps
 * are also opened over plain http from a LAN address, where `navigator.clipboard` is
 * undefined, so this falls back to a temporary textarea and `execCommand('copy')`.
 * It never throws: callers show "Copied" only when it returns true.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    if (clipboard && typeof clipboard.writeText === 'function') {
      await clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission denied or not focused: try the fallback below.
  }
  return legacyCopy(text);
}

function legacyCopy(text: string): boolean {
  if (typeof document === 'undefined' || !document.body) return false;
  const focused = document.activeElement as HTMLElement | null;
  let area: HTMLTextAreaElement | undefined;
  let host: HTMLElement | undefined;
  try {
    area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    Object.assign(area.style, { position: 'fixed', top: '0', left: '-9999px', opacity: '0' });
    // Inside the element that has focus (a dialog or focus-trapped panel can refuse focus to something appended to <body>).
    host = (document.activeElement && document.activeElement.parentElement) || document.body;
    host.appendChild(area);
    area.focus();
    area.select();
    area.setSelectionRange?.(0, text.length);
    return document.execCommand('copy') === true;
  } catch {
    return false;
  } finally {
    if (area && host) {
      try {
        host.removeChild(area);
      } catch {
        /* A dialog may have closed during the fallback. */
      }
    }
    try {
      focused?.focus({ preventScroll: true });
    } catch {
      /* Preserve the copy result if focus was removed. */
    }
  }
}
