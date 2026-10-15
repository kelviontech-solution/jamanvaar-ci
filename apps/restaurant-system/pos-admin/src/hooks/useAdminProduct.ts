import { useCallback, useEffect, useRef, useState } from 'react';
import { QR_BEFORE_NAVIGATE, requestQrLeave } from '../components/qrconsole/useQrUnsavedChanges';
import { adminPagePath, canAccessAdminPage, parseAdminRoute, readAdminPreference, resolveAdminRoute, type AdminProduct } from '../adminProducts';
import type { AppCode } from '../cloud/cloudClient';
import type { PosAdminTab } from '../App';

export function useAdminProduct(tenantId: string | null, available: readonly AdminProduct[], ready: boolean, apps: readonly AppCode[] = available) {
  const [route, setRoute] = useState(() => parseAdminRoute(window.location.pathname));
  const storageKey = tenantId ? `jamanvaar:admin-context:${tenantId}` : null;
  let raw: string | null = null;
  try { if (storageKey) raw = localStorage.getItem(storageKey); } catch { /* preference is optional */ }
  const saved = readAdminPreference(raw);
  const resolved = resolveAdminRoute(route, available, saved);
  const allowed = ready && !!resolved.product && available.includes(resolved.product) && !resolved.invalid && !!resolved.page && canAccessAdminPage(apps, resolved.product, resolved.page);
  const pageRef=useRef(resolved.page);pageRef.current=resolved.page;
  const lastLocation=useRef(window.location.href);

  useEffect(() => {
    const remember=()=>{lastLocation.current=window.location.href;};
    const onPop = (event: PopStateEvent) => {
      const target=parseAdminRoute(window.location.pathname),destination=window.location.href;
      if(pageRef.current === 'QR_ORDERING' && target.page !== 'QR_ORDERING' && !window.dispatchEvent(new Event(QR_BEFORE_NAVIGATE,{cancelable:true}))) {
        // Keep the editor mounted until its themed confirmation resolves.
        event.stopImmediatePropagation();window.history.pushState({},'',lastLocation.current);
        void requestQrLeave().then(ok=>{if(ok){window.history.replaceState({},'',destination);setRoute(target);remember();}});
        return;
      }
      setRoute(target);remember();
    };
    window.addEventListener('popstate', onPop, true);
    window.addEventListener('jamanvaar-admin-location',remember);
    return () => {window.removeEventListener('popstate', onPop,true);window.removeEventListener('jamanvaar-admin-location',remember);};
  }, []);

  useEffect(() => {
    if (!allowed || !resolved.product || !resolved.page || !storageKey) return;
    const path = adminPagePath(resolved.product, resolved.page);
    if (window.location.pathname !== path) window.history.replaceState({}, '', path);
    lastLocation.current=window.location.href;
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
    if (!canAccessAdminPage(apps, product, target)) return;
    const path = adminPagePath(product, target);
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
    lastLocation.current=window.location.href;
    setRoute(parseAdminRoute(path));
  }, [ready, available.join(','), apps.join(','), storageKey]);

  return { product: allowed ? resolved.product : null, page: allowed ? resolved.page : null, navigate,
    invalid: ready && resolved.invalid, denied: ready && !!resolved.product && (!available.includes(resolved.product) || (!!resolved.page && !canAccessAdminPage(apps, resolved.product, resolved.page))) };
}
