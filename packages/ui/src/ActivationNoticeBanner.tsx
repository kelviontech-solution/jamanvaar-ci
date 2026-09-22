import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { DeviceGate } from '@jamanvaar/sync';

/**
 * Shown once, inline, at the top of an app's own activation/connect screen (BUG-145 follow-up): when this
 * terminal's saved credential went bad, DeviceGate unbinds it and reloads straight into this same screen —
 * this is where that explanation belongs, exactly the way a real login page says "your session expired"
 * instead of the whole app refusing to render. Renders nothing once there is nothing to say, and never
 * reappears on a later visit.
 *
 * Reading (`peekDisconnectReason`) and clearing (`consumeDisconnectReason`) are deliberately separate calls:
 * React 18 StrictMode invokes a `useState` lazy initializer twice on mount, and if that initializer were the
 * thing doing the clearing, the second call would find nothing left and the banner would silently never show.
 * The read stays a harmless peek; the clearing happens once, as a real effect, after the first paint.
 */
export const ActivationNoticeBanner: React.FC = () => {
  const [reason] = useState(() => DeviceGate.peekDisconnectReason());

  useEffect(() => {
    if (reason) DeviceGate.consumeDisconnectReason();
  }, [reason]);

  if (!reason) return null;
  return (
    <div
      role="alert"
      className="mb-4 flex items-start gap-2.5 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-left text-sm text-amber-900"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <span>{reason}</span>
    </div>
  );
};
