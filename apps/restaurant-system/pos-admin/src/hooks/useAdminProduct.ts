import { useCallback, useEffect, useState } from 'react';
import { adminPagePath, parseAdminRoute, readAdminPreference, resolveAdminRoute, type AdminProduct } from '../adminProducts';
import type { PosAdminTab } from '../App';

export function useAdminProduct(tenantId: string | null, available: readonly AdminProduct[], ready: boolean) {
  const [route, setRoute] = useState(() => parseAdminRoute(window.location.pathname));
  const storageKey = tenantId ? `jamanvaar:admin-context:${tenantId}` : null;
  let raw: string | null = null;
  try { if (storageKey) raw = localStorage.getItem(storageKey); } catch { /* preference is optional */ }
  const saved = readAdminPreference(raw);
  const resolved = resolveAdminRoute(route, available, saved);
  const allowed = ready && !!resolved.product && available.includes(resolved.product) && !resolved.invalid && !!resolved.page;

  useEffect(() => {
    const onPop = () => setRoute(parseAdminRoute(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (!allowed || !resolved.product || !resolved.page || !storageKey) return;
    const path = adminPagePath(resolved.product, resolved.page);
    if (window.location.pathname !== path) window.history.replaceState({}, '', path);
    try {
      const current = readAdminPreference(localStorage.getItem(storageKey));
      localStorage.setItem(storageKey, JSON.stringify({ product: resolved.product, pages: { ...current.pages, [resolved.product]: resolved.page } }));
    } catch { /* permissions are always provided by the server, never by this preference */ }
  }, [allowed, resolved.product, resolved.page, storageKey]);

  const navigate = useCallback((product: AdminProduct, page?: PosAdminTab) => {
    if (!ready || !available.includes(product)) return;
    let preference = {} as ReturnType<typeof readAdminPreference>;
    try { if (storageKey) preference = readAdminPreference(localStorage.getItem(storageKey)); } catch {}
    const target = page || preference.pages?.[product] || 'DASHBOARD';
    const path = adminPagePath(product, target);
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
    setRoute(parseAdminRoute(path));
  }, [ready, available.join(','), storageKey]);

  return { product: allowed ? resolved.product : null, page: allowed ? resolved.page : null, navigate,
    invalid: ready && resolved.invalid, denied: ready && !!resolved.product && !available.includes(resolved.product) };
}
