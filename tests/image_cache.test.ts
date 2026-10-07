import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ImageCache, type CacheLike, type CacheStorageLike } from '../packages/utils/src/image_cache';

function fakeStorage() {
  const store = new Map<string, Blob>();
  const cache: CacheLike = {
    match: async (u) => (store.has(u) ? { blob: async () => store.get(u)! } : undefined),
    put: async (u, r) => void store.set(u, await r.blob()),
    delete: async (u) => store.delete(u),
    keys: async () => [...store.keys()].map((url) => ({ url }))
  };
  const storage: CacheStorageLike = { open: async () => cache };
  return { store, storage };
}

let online = true;
const fetcher = async (u: string) => {
  if (!online) throw new TypeError('fetch failed');
  return u.includes('missing') ? new Response('no', { status: 404 }) : new Response(new Blob([`img:${u}`], { type: 'image/jpeg' }), { status: 200 });
};

beforeEach(() => { ImageCache.reset(); online = true; });
afterEach(() => vi.unstubAllGlobals());

describe('offline menu pictures', () => {
  it('keeps a relative menu image cached when browser Cache.keys returns its absolute URL', async () => {
    vi.stubGlobal('window', { location: { pathname: '/kiosk/', href: 'https://restaurant.example/kiosk/' } });
    const { store, storage } = fakeStorage();
    let downloads = 0;
    ImageCache.configure({ storage, fetcher: async u => { downloads++; return fetcher(u); } });
    const src = '/assets/menu/pizza/margherita.jpg';
    expect(await ImageCache.sync([src])).toMatchObject({ cached: 1, removed: 0 });
    expect([...store.keys()]).toEqual(['https://restaurant.example/kiosk/assets/menu/pizza/margherita.jpg']);
    online = false;
    expect(await ImageCache.sync([src])).toEqual({ cached: 1, removed: 0, failed: 0 });
    expect(downloads).toBe(1);
  });
  it('does not cache an HTTP 200 HTML fallback as a dish photo', async () => {
    const { store, storage } = fakeStorage();
    ImageCache.configure({ storage, fetcher: async () => new Response('<html>Menu app</html>', { headers: { 'content-type': 'text/html' } }) });
    expect(await ImageCache.warm('https://img/fallback.jpg')).toBe(false);
    expect(store.size).toBe(0);
  });

  it('repairs a previously cached HTML response instead of keeping it permanently', async () => {
    const { store, storage } = fakeStorage();
    store.set('https://img/a.jpg', new Blob(['<html>Not a picture</html>'], { type: 'text/html' }));
    ImageCache.configure({ storage, fetcher });
    expect(await ImageCache.warm('https://img/a.jpg')).toBe(true);
    expect(store.get('https://img/a.jpg')?.type).toBe('image/jpeg');
    store.set('https://img/b.jpg', new Blob(['<html>Old fallback</html>'], { type: 'text/html' }));
    expect(await ImageCache.localUrl('https://img/b.jpg')).toBeNull();
    expect(store.has('https://img/b.jpg')).toBe(false);
  });
  it('downloads the menu pictures while online and serves them from the device when the internet is down', async () => {
    const { store, storage } = fakeStorage();
    ImageCache.configure({ storage, fetcher });
    const r = await ImageCache.sync(['https://img/a.jpg', 'https://img/b.jpg']);
    expect(r).toEqual({ cached: 2, removed: 0, failed: 0 });
    online = false;
    expect(store.size).toBe(2);
    // With no network a fresh warm still answers from the cache, and the bytes are the saved ones.
    expect(await ImageCache.warm('https://img/a.jpg')).toBe(true);
    expect(await (await storage.open('x')).match('https://img/a.jpg').then((m) => m!.blob().then((b) => b.text()))).toBe('img:https://img/a.jpg');
  });

  it('removes pictures that left the menu and does not refetch ones it already has', async () => {
    const { store, storage } = fakeStorage();
    let fetches = 0;
    ImageCache.configure({ storage, fetcher: async (u) => { fetches++; return fetcher(u); } });
    await ImageCache.sync(['https://img/a.jpg', 'https://img/b.jpg']);
    expect(fetches).toBe(2);
    const r = await ImageCache.sync(['https://img/b.jpg', 'https://img/c.jpg']);
    expect(r).toMatchObject({ cached: 2, removed: 1 });
    expect(fetches).toBe(3); // only c was new
    expect([...store.keys()].sort()).toEqual(['https://img/b.jpg', 'https://img/c.jpg']);
  });

  it('a picture that cannot be fetched is skipped, never thrown, and never cached as broken', async () => {
    const { store, storage } = fakeStorage();
    ImageCache.configure({ storage, fetcher });
    const r = await ImageCache.sync(['https://img/missing.jpg', 'https://img/ok.jpg']);
    expect(r).toMatchObject({ cached: 1, failed: 1 });
    expect(store.has('https://img/missing.jpg')).toBe(false);
    online = false;
    await expect(ImageCache.warm('https://img/never.jpg')).resolves.toBe(false);
  });

  it('with no cache available at all it does nothing and does not fail', async () => {
    ImageCache.configure({ storage: null, fetcher });
    expect(await ImageCache.sync(['https://img/a.jpg'])).toEqual({ cached: 0, removed: 0, failed: 0 });
    expect(await ImageCache.localUrl('https://img/a.jpg')).toBeNull();
  });
});
