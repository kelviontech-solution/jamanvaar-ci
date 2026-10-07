import { resolveMenuImage } from './menu_image';

/** Separate from the menu cache: a catalogue refresh must not evict the idle background. */
export class WelcomeImageCache {
  static readonly cacheName = 'jamanvaar-welcome-background-v1';
  private static downloads = new Map<string, Promise<Response | null>>();
  static async source(source: string): Promise<string> {
    const resolved = resolveMenuImage(source) || source;
    if (/^data:image\//.test(resolved)) return resolved;
    try {
      if (!globalThis.caches) return resolved;
      const address = new URL(resolved, window.location.href).href;
      const cache = await caches.open(this.cacheName);
      let response = await cache.match(address);
      if (response && !response.headers.get('content-type')?.startsWith('image/')) { await cache.delete(address); response = undefined; }
      if (!response) {
        let download = this.downloads.get(address);
        if (!download) {
          download = (async () => {
            const downloaded = await fetch(address, { mode: 'cors' });
            if (!downloaded.ok || !downloaded.headers.get('content-type')?.startsWith('image/')) return null;
            await cache.put(address, downloaded.clone()); return downloaded;
          })().finally(() => this.downloads.delete(address));
          this.downloads.set(address, download);
        }
        const downloaded = await download;
        if (!downloaded) return resolved;
        response = downloaded.clone();
      }
      return URL.createObjectURL(await response.blob());
    } catch { return resolved; }
  }
  static async retain(sources: string[]): Promise<void> {
    try {
      if (!globalThis.caches) return;
      const cache = await caches.open(this.cacheName);
      const wanted = new Set(sources.map(source => new URL(resolveMenuImage(source) || source, window.location.href).href));
      for (const key of await cache.keys()) if (!wanted.has(key.url)) await cache.delete(key);
    } catch { /* Cache storage can be unavailable in private browsing. */ }
  }
}
