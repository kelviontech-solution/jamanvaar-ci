/**
 * Where the restaurant-facing web apps live, as printed in onboarding text, the welcome kit and the message
 * sent to a restaurant owner (BUG-018). Set VITE_RESTAURANT_ADMIN_URL and VITE_KIOSK_ADMIN_URL when building
 * for production; the defaults are the local development addresses.
 */
const clean = (value: string) => value.trim().replace(/\/+$/, '');

export const RESTAURANT_ADMIN_URL = clean(import.meta.env.VITE_RESTAURANT_ADMIN_URL || 'http://localhost:5176');
export const KIOSK_ADMIN_URL = clean(import.meta.env.VITE_KIOSK_ADMIN_URL || 'http://localhost:5173');
