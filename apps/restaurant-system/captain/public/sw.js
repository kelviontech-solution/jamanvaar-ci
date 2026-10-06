/* App-shell service worker: lets the app open with no signal (the menu and orders themselves live in the app's own database).
   It never touches the API: only this app's own files are cached, and a new version of the app replaces the old shell. */
const BUILD_ID = /*__APP_SHELL_BUILD__*/ 'dev';
const BUILD_ASSETS = /*__APP_SHELL_ASSETS__*/ [];
const SHELL = 'jamanvaar-shell-captain-v3-' + BUILD_ID;
const SHELL_FILES = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './favicon.svg', ...BUILD_ASSETS];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => (k === 'jamanvaar-shell-v1' || k.startsWith('jamanvaar-shell-captain-')) && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || req.headers.has('Authorization') || req.headers.get('Accept')?.includes('text/event-stream')) return;
  if (!url.pathname.startsWith(self.registration.scope ? new URL(self.registration.scope).pathname : '/captain/')) return;

  // Opening the app: the fresh page when there is signal, the saved one when there is not.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          if (res.ok) event.waitUntil(caches.open(SHELL).then((cache) => cache.put('./index.html', copy)));
          return res;
        })
        .catch(() => caches.match('./index.html').then((hit) => hit || caches.match('./')))
    );
    return;
  }

  // The app's own scripts, styles and pictures: quick from the cache, refreshed in the background.
  event.respondWith(
    caches.open(SHELL).then((cache) =>
      cache.match(req).then((hit) => {
        const refresh = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => hit);
        event.waitUntil(refresh.then(() => undefined));
        return hit || refresh;
      })
    )
  );
});
