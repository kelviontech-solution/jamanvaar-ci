import { useEffect } from 'react';

/**
 * Codes printed before the customer ordering website existed point at this app (`/?qrTable=..&token=..`). The
 * guest page no longer lives here (a customer must not download the restaurant's admin application): the same token is
 * handed to the ordering website, which the platform resolves exactly as before.
 */
const ORDER_SITE = (import.meta.env.VITE_QR_ORDER_URL as string | undefined)?.trim().replace(/\/+$/, '') || (import.meta.env.DEV ? 'http://localhost:5190' : '');

export function LegacyGuestRedirect() {
  const token = new URLSearchParams(window.location.search).get('token');
  const target = ORDER_SITE && token ? `${ORDER_SITE}/q/${encodeURIComponent(token)}` : null;
  useEffect(() => {
    if (target) window.location.replace(target);
  }, [target]);
  return (
    <main style={{ padding: 32, fontFamily: 'sans-serif', textAlign: 'center' }}>
      <h1>{target ? 'Opening the menu…' : 'This QR code has moved'}</h1>
      {!target && <p>Please ask a team member for a new QR code.</p>}
    </main>
  );
}
