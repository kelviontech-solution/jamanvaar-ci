/**
 * Where a guest's table QR code should point (BUG-119). This used to be `window.location.origin` — whichever
 * browser happened to be looking at Restaurant Admin at the moment a table (or its QR code) was created — so
 * a QR generated while the owner was setting up tables on `localhost:5176`, or any other LAN-only address,
 * printed a link no guest's own phone, off that network, could ever reach.
 *
 * Restaurant Admin (pos-admin), which is where the guest ordering page (`GuestQrOrderingPage`) is served from,
 * sets this once at boot from its own build-time `VITE_RESTAURANT_ADMIN_URL` — the same "where this app is
 * really, publicly reachable" env var already used for onboarding text and welcome-kit links (BUG-018),
 * defaulting to the local dev address so nothing breaks running locally with it unset. This module has no
 * dependency on Vite's `import.meta.env` itself (packages/database is imported by six different apps' own
 * bundlers); each app's own entry point is what actually reads its environment and calls `setGuestOrderBaseUrl`.
 */
let guestOrderBaseUrl = 'http://localhost:5176';

export function setGuestOrderBaseUrl(url: string): void {
  const cleaned = url.trim().replace(/\/+$/, '');
  if (cleaned) guestOrderBaseUrl = cleaned;
}

export function getGuestOrderBaseUrl(): string {
  return guestOrderBaseUrl;
}
