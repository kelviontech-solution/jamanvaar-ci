import { KeyValueStore } from './key_value_store';

/** The development LAN relay is separate from the cloud API and Branch Core API. */
export class LocalRelayConnection {
  static scope() {
    return { restaurantId: KeyValueStore.get('jamanvaar_tenant_id') || '', branchId: KeyValueStore.get('jamanvaar_bound_branch_id') || '' };
  }
  private static key(url: string): string {
    const s = this.scope();
    return `jamanvaar_local_pair:${JSON.stringify([url.replace(/\/+$/, ''), s.restaurantId, s.branchId])}`;
  }
  static token(url: string): string | null {
    const s = this.scope();
    return s.restaurantId && s.branchId ? KeyValueStore.get(this.key(url)) : null;
  }
  static forget(url: string): void { KeyValueStore.remove(this.key(url)); }
  static async pair(url: string, pin: string): Promise<void> {
    const target = new URL(url);
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || target.search || target.hash || target.pathname !== '/') {
      throw new Error('Enter the Local Core server address, for example http://localhost:5178.');
    }
    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && target.protocol !== 'https:') {
      throw new Error('An HTTPS app requires an HTTPS Local Core address.');
    }
    const scope = this.scope();
    if (!scope.restaurantId || !scope.branchId) throw new Error('Activate this device for a restaurant and branch before pairing Local Core.');
    if (!/^\d{6}$/.test(pin)) throw new Error('Enter the six-digit PIN shown in the Local Core server console.');
    const response = await fetch(`${target.origin}/devices/pair`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairingPin: pin, ...scope }), signal: AbortSignal.timeout(4000)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Pairing failed (${response.status}).`);
    if (data.restaurant_id !== scope.restaurantId || data.outlet_id !== scope.branchId || !data.serviceKey?.startsWith('lc1.')) {
      throw new Error('This Local Core version does not support restaurant-safe pairing. Restart the updated Local Core server.');
    }
    // Activation may have changed while the request was pending.
    if (JSON.stringify(this.scope()) !== JSON.stringify(scope)) throw new Error('The restaurant changed. Pair again for the current restaurant.');
    KeyValueStore.set(this.key(target.origin), data.serviceKey);
    if (this.token(target.origin) !== data.serviceKey) throw new Error('Pairing could not be saved. Allow storage for this app and try again.');
  }
  static async request(url: string, path: string, init: RequestInit = {}): Promise<Response> {
    const storageKey = this.key(url);
    const token = this.token(url);
    if (!token) throw new Error('Local Core is not paired for this restaurant and branch.');
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(`${url.replace(/\/+$/, '')}${path}`, { ...init, headers });
    if (response.status === 401) KeyValueStore.remove(storageKey);
    return response;
  }
}

/** Authenticated SSE: native EventSource cannot send a Bearer header. */
export async function readRelayEvents(response: Response, onEvent: (data: string) => void): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let pending = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      let match: RegExpExecArray | null;
      while ((match = /\r?\n\r?\n/.exec(pending))) {
        const frame = pending.slice(0, match.index);
        pending = pending.slice(match.index + match[0].length);
        const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, '')).join('\n');
        if (data) onEvent(data);
      }
      if (pending.length > 4 * 1024 * 1024) throw new Error('Local Core event exceeds the allowed size.');
    }
  } finally { reader.releaseLock(); }
}
