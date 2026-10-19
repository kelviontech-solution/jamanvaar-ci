import { afterEach, describe, expect, it, vi } from 'vitest';
import { replaceRestaurantMetadata, restaurantMetadata } from '../apps/qr-guest/restaurantMetadata';
const html =
  '<html><head><!-- restaurant-metadata:start --><title>Order</title><!-- restaurant-metadata:end --></head><body><div id="root"></div></body></html>';
afterEach(() => vi.restoreAllMocks());
describe('restaurant metadata initial HTML shell', () => {
  it('replaces just the metadata region and leaves app markup intact', () => {
    expect(replaceRestaurantMetadata(html, '<title>River</title>')).toBe('<html><head><title>River</title></head><body><div id="root"></div></body></html>');
  });
  it('gets published metadata before serving a local restaurant document', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<title>River Kitchen</title>'));
    const plugin = restaurantMetadata(),
      handler = (plugin.transformIndexHtml as { handler: Function }).handler;
    const result = await handler(html, { server: {}, originalUrl: '/q/site/river-kitchen?preview=false' });
    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:4000/api/v1/public/qr/sites/river-kitchen/head', expect.anything());
    expect(result).toContain('<title>River Kitchen</title>');
    expect(result).not.toContain('<title>Order</title>');
  });
  it('does not make metadata calls for table ordering or unavailable pages', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 404 }));
    const handler = (restaurantMetadata().transformIndexHtml as { handler: Function }).handler;
    expect(await handler(html, { server: {}, originalUrl: '/q/a-table-token' })).toBe(html);
    expect(fetch).not.toHaveBeenCalled();
    expect(await handler(html, { server: {}, originalUrl: '/q/site/no-such-restaurant' })).toContain('name="robots" content="noindex"');
  });
  it('emits the production SSI document from the built shell', () => {
    const emitFile = vi.fn(),
      plugin = restaurantMetadata();
    (plugin.generateBundle as Function).call({ emitFile }, {}, { 'index.html': { type: 'asset', source: html } });
    expect(emitFile).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: 'site.html', source: expect.stringContaining('include virtual="/_restaurant-head/$qr_site_slug"') })
    );
    expect(emitFile.mock.calls[0][0].source).not.toContain('<title>Order</title>');
  });
});
