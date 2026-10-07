import { describe, it, expect, beforeEach } from 'vitest';
import { collectMenuImageUrls, ImageCache } from '@jamanvaar/utils';

describe('offline menu pictures: one definition of what to cache, shared by every app', () => {
  it('collects dish, category and combo pictures into one deduplicated, sorted list', () => {
    const list = collectMenuImageUrls(
      [
        { imageUrl: '/assets/menu/common/b.jpg', name: 'Paneer Tikka' },
        { imageUrl: '/assets/menu/common/a.jpg', name: 'Naan' },
        { imageUrl: undefined, name: 'No Photo Dish' }
      ],
      [{ imageUrl: '/assets/menu/common/cat.jpg' }, {}],
      [{ imageUrl: '/assets/menu/common/combo.jpg', name: 'Thali Combo' }]
    );
    expect(list).toEqual(['/assets/menu/common/a.jpg', '/assets/menu/common/b.jpg', '/assets/menu/common/cat.jpg', '/assets/menu/common/combo.jpg']);
  });

  it('a dish with no picture and no categories or combos yields an empty list, not an error', () => {
    expect(collectMenuImageUrls([{ imageUrl: undefined, name: 'Water' }])).toEqual([]);
    expect(collectMenuImageUrls([])).toEqual([]);
  });

  describe('what a device can show once the internet is down', () => {
    const blob = () => new Blob(['x'], { type: 'image/jpeg' });
    let store = new Map<string, Blob>();
    const fakeCache = {
      async match(url: string) {
        const b = store.get(url);
        return b ? { blob: async () => b } : undefined;
      },
      async put(url: string, res: Response) {
        store.set(url, await res.blob());
      },
      async delete(url: string) {
        return store.delete(url);
      },
      async keys() {
        return [...store.keys()].map((url) => ({ url }));
      }
    };

    beforeEach(() => {
      store = new Map();
      ImageCache.reset();
      ImageCache.configure({
        storage: { open: async () => fakeCache },
        fetcher: async (url: string) => new Response(blob(), { status: 200, headers: { 'content-type': 'image/jpeg' } })
      });
    });

    it('a picture synced while online is still available by its own address once offline', async () => {
      const list = collectMenuImageUrls([{ imageUrl: '/assets/menu/common/dal.jpg', name: 'Dal Makhani' }]);
      const result = await ImageCache.sync(list);
      expect(result.cached).toBe(1);
      const local = await ImageCache.localUrl('/assets/menu/common/dal.jpg');
      expect(local).toMatch(/^blob:/);
    });

    it('a dish removed from the menu is dropped from the cache on the next sync', async () => {
      await ImageCache.sync(collectMenuImageUrls([{ imageUrl: '/assets/menu/common/old.jpg', name: 'Retired Dish' }]));
      const after = await ImageCache.sync(collectMenuImageUrls([{ imageUrl: '/assets/menu/common/new.jpg', name: 'New Dish' }]));
      expect(after.removed).toBe(1);
      expect(await ImageCache.localUrl('/assets/menu/common/old.jpg')).toBeNull();
    });

    it('a picture never cached (never seen while online) has no offline fallback — CachedImg then shows the placeholder', async () => {
      expect(await ImageCache.localUrl('/assets/menu/common/never-cached.jpg')).toBeNull();
    });
  });
});
