import { resolveMenuImage } from './menu_image';
import { menuDishImage } from './dish_photos';

export interface MenuImageItemLike {
  imageUrl?: string;
  name: string;
}
export interface MenuImageCategoryLike {
  imageUrl?: string;
}

/**
 * Every picture the menu currently needs — dishes, categories, combos — as the one list `ImageCache.sync`
 * is given. Shared by every app (kiosk, POS, Captain, Restaurant Admin) so "what should be cached for
 * offline" has a single definition instead of four copies that can drift apart.
 */
export function collectMenuImageUrls(
  menuItems: readonly MenuImageItemLike[],
  categories: readonly MenuImageCategoryLike[] = [],
  combos: readonly MenuImageItemLike[] = []
): string[] {
  const urls = new Set<string>();
  for (const i of menuItems) {
    const source = menuDishImage(i.imageUrl, i.name);
    if (source) urls.add(source);
  }
  for (const c of categories) if (c.imageUrl) urls.add(c.imageUrl);
  for (const c of combos) {
    const source = menuDishImage(c.imageUrl, c.name);
    if (source) urls.add(source);
  }
  return [...urls].sort();
}
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

  private static address(url: string): string {
    const resolved = resolveMenuImage(url) ?? '';
    // Cache.keys() returns absolute URLs. Use that same identity for pruning and reads.
    if (resolved.startsWith('/') && typeof window !== 'undefined') {
      try { return new URL(resolved, window.location.href).href; } catch { /* no browser origin */ }
    }
    return resolved;
  }

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
    url = this.address(url);
    if (!url || url.startsWith('data:') || url.startsWith('blob:')) return false;
    const cache = await this.cache();
    if (!cache) return false;
    try {
      const cached = await cache.match(url);
      if (cached) {
        const picture = await cached.blob();
        if (picture.size > 0 && picture.type.startsWith('image/')) return true;
        // A SPA's HTTP 200 fallback page is not a picture. Repair old polluted caches.
        await cache.delete(url);
      }
      const res = await this.fetchImage(url);
      if (!res.ok || !res.headers.get('content-type')?.toLowerCase().startsWith('image/')) return false;
      await cache.put(url, res.clone());
      return true;
    } catch {
      return false;
    }
  }

  /** Makes the cache hold exactly these pictures (best effort, a few at a time). Returns what was fetched and removed. */
  static async sync(urls: string[]): Promise<{ cached: number; removed: number; failed: number }> {
    const wanted = new Set(urls.map(u => this.address(u)).filter((u) => u && !u.startsWith('data:') && !u.startsWith('blob:')));
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
    url = this.address(url);
    const existing = this.objectUrls.get(url);
    if (existing) return existing;
    const cache = await this.cache();
    if (!cache) return null;
    try {
      const hit = await cache.match(url);
      if (!hit) return null;
      const picture = await hit.blob();
      if (!picture.size || !picture.type.startsWith('image/')) { await cache.delete(url); return null; }
      const objectUrl = globalThis.URL.createObjectURL(picture);
      this.objectUrls.set(url, objectUrl);
      return objectUrl;
    } catch {
      return null;
    }
  }
}
