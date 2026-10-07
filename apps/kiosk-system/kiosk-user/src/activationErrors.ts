/** Activation copy never echoes database errors, tokens or internal stack traces. */
export function kioskActivationError(error: unknown, stage: 'restaurant' | 'key', online = true): string {
  if (!online) return 'You are offline. Connect this kiosk to the internet to activate it.';
  const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0;
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (status >= 500) return 'The activation service is temporarily unavailable. Please try again shortly.';
  if (!status || /network|fetch|timeout|reach/.test(message)) return 'Cannot reach the activation service. Check your connection and try again.';
  if (status === 429) return 'Too many activation attempts. Please wait a moment before trying again.';
  if (stage === 'restaurant') return 'Restaurant not found. Check the Restaurant ID supplied by your restaurant owner.';
  if (/expired/.test(message)) return 'This activation key has expired. Ask your restaurant owner for a new kiosk key.';
  if (status === 409 || /used|already|redeemed/.test(message)) return 'This key has already been used. Ask your restaurant owner for a new kiosk key.';
  return 'This kiosk key is invalid or cannot be used here. Check the key with your restaurant owner.';
}
