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
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  Object.assign(area.style, { position: 'fixed', top: '0', left: '-9999px', opacity: '0' });
  document.body.appendChild(area);
  try {
    area.focus();
    area.select();
    area.setSelectionRange?.(0, text.length);
    return document.execCommand('copy') === true;
  } catch {
    return false;
  } finally {
    document.body.removeChild(area);
  }
}
