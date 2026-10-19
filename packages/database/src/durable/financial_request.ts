/** Hash the original JSON business request, never credentials or a newly generated attempt reference. */
export async function financialRequestFingerprint(requestJson: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Secure local operation identity is unavailable. Your work is preserved.');
  JSON.parse(requestJson);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(requestJson));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
