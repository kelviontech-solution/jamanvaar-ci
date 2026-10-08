import { useEffect, useRef } from 'react';

export const KIOSK_CONFIRMATION_RETURN_MS = 15000;

/** Return only after a quiet confirmation window; never interrupt receipt entry/delivery. */
export function useKioskConfirmationReturn({ active, ready, blocked, activityVersion, onReturn }: {
  active: boolean;
  ready: boolean;
  blocked: boolean;
  activityVersion: number;
  onReturn: () => void;
}) {
  const callback = useRef(onReturn);
  useEffect(() => { callback.current = onReturn; }, [onReturn]);
  useEffect(() => {
    if (!active || !ready || blocked) return;
    const timer = window.setTimeout(() => callback.current(), KIOSK_CONFIRMATION_RETURN_MS);
    return () => window.clearTimeout(timer);
  }, [active, ready, blocked, activityVersion]);
}
