import { describe, it, expect, beforeEach } from 'vitest';
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
  return u.includes('missing') ? new Response('no', { status: 404 }) : new Response(new Blob([`img:${u}`]), { status: 200 });
};

beforeEach(() => { ImageCache.reset(); online = true; });

describe('offline menu pictures', () => {
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
