/**
 * Offline menu pictures. While the internet is up the device downloads every menu image once into the
 * browser's Cache API (a local, persistent store); when the internet is down the same pictures are shown
 * from there. `sync(urls)` is called whenever the menu changes: new pictures are fetched, pictures no
 * longer on the menu are removed, so the cache never grows without limit.
 *
 * The cache and the fetch function are injectable, so the behaviour is tested without a browser and a
 * native shell can supply its own store.
 */
export interface CacheLike {
  match(url: string): Promise<{ blob(): Promise<Blob> } | undefined>;
  put(url: string, response: Response): Promise<void>;
  delete(url: string): Promise<boolean>;
  keys(): Promise<Array<{ url: string }>>;
}
export interface CacheStorageLike {
  open(name: string): Promise<CacheLike>;
}

const CACHE_NAME = 'jamanvaar-menu-images-v1';

export class ImageCache {
  private static storage: CacheStorageLike | null | undefined;
  private static fetcher: ((url: string) => Promise<Response>) | null = null;
  private static objectUrls = new Map<string, string>();

  static configure(opts: { storage?: CacheStorageLike | null; fetcher?: ((url: string) => Promise<Response>) | null }): void {
    if ('storage' in opts) this.storage = opts.storage;
    if ('fetcher' in opts) this.fetcher = opts.fetcher ?? null;
  }

  static reset(): void {
    this.storage = undefined;
    this.fetcher = null;
    for (const u of this.objectUrls.values()) globalThis.URL?.revokeObjectURL?.(u);
    this.objectUrls.clear();
  }

  private static async cache(): Promise<CacheLike | null> {
    try {
      const s = this.storage !== undefined ? this.storage : ((globalThis as unknown as { caches?: CacheStorageLike }).caches ?? null);
      return s ? await s.open(CACHE_NAME) : null;
    } catch {
      return null;
    }
  }

  private static fetchImage(url: string): Promise<Response> {
    return (this.fetcher ?? ((u: string) => fetch(u, { mode: 'cors' })))(url);
  }

  /** Downloads and stores one picture. Never throws: a picture that cannot be fetched is simply not cached. */
  static async warm(url: string): Promise<boolean> {
    if (!url || url.startsWith('data:') || url.startsWith('blob:')) return false;
    const cache = await this.cache();
    if (!cache) return false;
    try {
      if (await cache.match(url)) return true;
      const res = await this.fetchImage(url);
      if (!res.ok) return false;
      await cache.put(url, res.clone());
      return true;
    } catch {
      return false;
    }
  }

  /** Makes the cache hold exactly these pictures (best effort, a few at a time). Returns what was fetched and removed. */
  static async sync(urls: string[]): Promise<{ cached: number; removed: number; failed: number }> {
    const wanted = new Set(urls.filter((u) => u && !u.startsWith('data:') && !u.startsWith('blob:')));
    const cache = await this.cache();
    if (!cache) return { cached: 0, removed: 0, failed: 0 };
    let removed = 0;
    for (const req of await cache.keys()) {
      if (!wanted.has(req.url)) {
        await cache.delete(req.url);
        removed++;
      }
    }
    let cached = 0;
    let failed = 0;
    const queue = [...wanted];
    const worker = async () => {
      for (let u = queue.shift(); u !== undefined; u = queue.shift()) {
        if (await this.warm(u)) cached++;
        else failed++;
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    return { cached, removed, failed };
  }

  /** A URL the <img> tag can use with no network: the cached copy if there is one, otherwise null. */
  static async localUrl(url: string): Promise<string | null> {
    const existing = this.objectUrls.get(url);
    if (existing) return existing;
    const cache = await this.cache();
    if (!cache) return null;
    try {
      const hit = await cache.match(url);
      if (!hit) return null;
      const objectUrl = globalThis.URL.createObjectURL(await hit.blob());
      this.objectUrls.set(url, objectUrl);
      return objectUrl;
    } catch {
      return null;
    }
  }
}
