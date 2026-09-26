/**
 * Signed device commands. A command that arrives over the restaurant LAN could have been forged by any
 * machine on that network, so the Branch Core signs each command with a key only it and the target device
 * hold: HMAC-SHA256 keyed by SHA-256(device token) (the core stores that hash; the device can compute it).
 * A device refuses an unsigned or wrongly signed command that came from a core. Pure and dependency free so
 * the core (Node) and the apps (browser/WebView/Tauri) share the exact same canonical form.
 */

export interface SignableCommand {
  id: string;
  commandType: string;
  payload?: unknown;
  deviceId: string;
}

function stable(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(',')}}`;
}

export function canonicalCommand(c: SignableCommand): string {
  return [c.id, c.commandType, stable(c.payload ?? {}), c.deviceId].join('\n');
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function tokenKey(deviceToken: string): Promise<string> {
  return hex(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(deviceToken)));
}

export async function signCommand(keyHex: string, c: SignableCommand): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey('raw', new TextEncoder().encode(keyHex), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await globalThis.crypto.subtle.sign('HMAC', key, new TextEncoder().encode(canonicalCommand(c))));
}

export async function verifyCommand(keyHex: string, c: SignableCommand, signature: string | undefined): Promise<boolean> {
  if (!signature) return false;
  const expected = await signCommand(keyHex, c);
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}
