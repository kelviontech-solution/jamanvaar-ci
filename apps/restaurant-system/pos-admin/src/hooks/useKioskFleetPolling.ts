import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchCloudKiosks, type CloudKiosk, type AppCode } from '../cloud/cloudClient';

/** Loading/failure must never masquerade as an empty fleet; reset on branch changes. */
export function useKioskFleetPolling(isAdminLoggedIn: boolean, hasApp: (app: AppCode) => boolean, branchId?: string | null) {
  const [state, setState] = useState<{ branchId?: string | null; kiosks: CloudKiosk[]; loading: boolean; error: string }>({
    kiosks: [],
    loading: true,
    error: ''
  });
  const run = useRef<() => Promise<void>>(async () => {});
  const refresh = useCallback(() => run.current(), []);
  useEffect(() => {
    let cancelled = false,
      inFlight = false;
    const enabled = isAdminLoggedIn && hasApp('KIOSK_ADMIN') && !!branchId && branchId !== 'all';
    setState({ branchId, kiosks: [], loading: enabled, error: '' });
    const load = async () => {
      if (cancelled || inFlight || !enabled) return;
      inFlight = true;
      setState((s) => ({ ...s, loading: true }));
      try {
        const kiosks = await fetchCloudKiosks();
        if (!cancelled) setState({ branchId, kiosks, loading: false, error: '' });
      } catch (e) {
        if (!cancelled)
          setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : 'Could not load kiosks. Check your connection and retry.' }));
      } finally {
        inFlight = false;
      }
    };
    run.current = load;
    void load();
    const timer = setInterval(load, 30000),
      focus = () => {
        void load();
      };
    window.addEventListener('focus', focus);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('focus', focus);
    };
  }, [hasApp, isAdminLoggedIn, branchId]);
  return { ...(state.branchId === branchId ? state : { kiosks: [], loading: true, error: '' }), refresh };
}
