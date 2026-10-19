import type { Plugin } from 'vite';
const start = '<!-- restaurant-metadata:start -->',
  end = '<!-- restaurant-metadata:end -->';
export function replaceRestaurantMetadata(html: string, head: string) {
  const first = html.indexOf(start),
    last = html.indexOf(end);
  return first >= 0 && last > first ? html.slice(0, first) + head + html.slice(last + end.length) : html;
}
/** Same server-produced metadata in local Vite and the production nginx SSI shell. */
export function restaurantMetadata(): Plugin {
  let api = 'http://127.0.0.1:4000';
  return {
    name: 'restaurant-site-metadata',
    enforce: 'post',
    configResolved(config) {
      api = String(config.env.VITE_CLOUD_API_BASE_URL || api).replace(/\/+$/, '');
    },
    transformIndexHtml: {
      order: 'post',
      async handler(html, context) {
        if (!context.server) return html;
        const match = /^\/q\/site\/([A-Za-z0-9_-]{6,80})\/?(?:\?|$)/.exec(context.originalUrl || context.path);
        if (!match) return html;
        try {
          const response = await fetch(`${api}/api/v1/public/qr/sites/${match[1]}/head`, { signal: AbortSignal.timeout(4000) });
          if (response.ok) return replaceRestaurantMetadata(html, await response.text());
        } catch {
          /* The guest UI retains its normal connection/retry handling. */
        }
        return replaceRestaurantMetadata(html, '<title>Restaurant page unavailable</title><meta name="robots" content="noindex">');
      }
    },
    generateBundle(_options, bundle) {
      const entry = bundle['index.html'];
      if (entry?.type === 'asset') {
        const include =
          '<!--# block name="restaurant_head_unavailable" --><title>Restaurant page unavailable</title><meta name="robots" content="noindex"><!--# endblock --><!--# include virtual="/_restaurant-head/$qr_site_slug" stub="restaurant_head_unavailable" -->';
        this.emitFile({ type: 'asset', fileName: 'site.html', source: replaceRestaurantMetadata(String(entry.source), include) });
      }
    }
  };
}
