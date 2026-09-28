/**
 * Runs `handler` whenever the screen comes back to life: the tab becomes visible again, the window regains focus, the page is
 * restored from the back/forward cache, or the network returns. A tablet that slept for an hour, or a browser that throttled
 * a hidden tab, then catches up at once instead of showing stale tickets until the next timer tick (or a manual refresh).
 * Calls closer together than `minGapMs` are merged. Returns a function that removes the listeners.
 */
export function onAppResume(handler: () => void, minGapMs = 800): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => undefined;
  let last = 0;
  const fire = () => {
    const now = Date.now();
    if (now - last < minGapMs) return;
    last = now;
    handler();
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible') fire();
  };
  window.addEventListener('online', fire);
  window.addEventListener('focus', fire);
  window.addEventListener('pageshow', fire);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    window.removeEventListener('online', fire);
    window.removeEventListener('focus', fire);
    window.removeEventListener('pageshow', fire);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
