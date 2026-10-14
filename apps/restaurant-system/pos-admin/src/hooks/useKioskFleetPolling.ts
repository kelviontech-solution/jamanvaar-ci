import { useEffect, useState } from 'react';
import { fetchCloudKiosks, type CloudKiosk, type AppCode } from '../cloud/cloudClient';

/**
 * Kiosk fleet polling for the Kiosk Terminals tab. Deliberately its own effect, not merged into
 * usePosAdminDeviceSync: that effect already calls SyncOutboxEngine/EntitySyncEngine
 * .configureTransport once for this console's own order/menu sync -- calling it again here (as
 * kiosk-admin's original fleet-polling code did, for ITS OWN sync needs) would silently
 * overwrite this console's already-configured transport. Extracted from App.tsx, same effect.
 */
export function useKioskFleetPolling(isAdminLoggedIn: boolean, hasApp: (app: AppCode) => boolean): CloudKiosk[] {
  const [kiosks, setKiosks] = useState<CloudKiosk[]>([]);
  useEffect(() => {
    if (!isAdminLoggedIn || !hasApp('KIOSK_ADMIN')) { setKiosks([]); return; }
    let cancelled = false;
    let inFlight = false;
    const refresh = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const fleet = await fetchCloudKiosks();
        if (!cancelled) setKiosks(fleet);
      } catch {
        // Fleet view just stays on its last-known data; this is a background refresh, not a user action.
      } finally {
        inFlight = false;
      }
    };
    void refresh();
    const kioskInterval = setInterval(refresh, 30000);
    return () => {
      cancelled = true;
      clearInterval(kioskInterval);
    };
  }, [hasApp, isAdminLoggedIn]);
  return kiosks;
}
