import { useCallback, useEffect, useState } from 'react';
import { KeyValueStore } from '@jamanvaar/database';
import { QrAdminApi, type QrEntitlementView } from '../../cloud/qrAdminClient';

/**
 * Whether this restaurant has QR ordering, as the SERVER says. The screen only displays it; every action is
 * authorized again by the server, so a stale or edited value here can never give access.
 *
 * Offline policy: the last answer is kept on this device and used to draw the screen for up to 7 days since it was
 * fetched (the same window the terminals use for their own licence). After that, or if there is no saved answer, the
 * screen says it needs the internet to check the plan instead of guessing in either direction. A revoked feature
 * therefore cannot stay shown as enabled for longer than that window.
 */
const CACHE_KEY = 'jamanvaar_qr_entitlement_cache_v1';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface Cached {
  value: QrEntitlementView;
  fetchedAt: number;
}

function readCache(): Cached | null {
  try {
    const raw = KeyValueStore.get(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cached;
    return Date.now() - parsed.fetchedAt <= MAX_AGE_MS ? parsed : null;
  } catch {
    return null;
  }
}

export type QrEntitlementState =
  | { status: 'loading' }
  | { status: 'ready'; entitlement: QrEntitlementView; fromCache: boolean }
  | { status: 'unknown'; message: string };

export function useQrEntitlement(): { state: QrEntitlementState; refresh: () => void } {
  const [state, setState] = useState<QrEntitlementState>(() => {
    const cached = readCache();
    return cached ? { status: 'ready', entitlement: cached.value, fromCache: true } : { status: 'loading' };
  });

  const refresh = useCallback(() => {
    QrAdminApi.entitlement()
      .then((value) => {
        try {
          KeyValueStore.set(CACHE_KEY, JSON.stringify({ value, fetchedAt: Date.now() } satisfies Cached));
        } catch {
          // storage unavailable: the answer still applies for this session
        }
        setState({ status: 'ready', entitlement: value, fromCache: false });
      })
      .catch(() => {
        const cached = readCache();
        setState(cached ? { status: 'ready', entitlement: cached.value, fromCache: true } : { status: 'unknown', message: 'Connect to the internet to check whether your plan includes QR Ordering.' });
      });
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [refresh]);

  return { state, refresh };
}
