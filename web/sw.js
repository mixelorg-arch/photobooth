/* Offline cache for the booth.
 *
 * Venues lose wifi. Once the app has been opened on the device it must keep
 * working with no network at all — the whole thing is four files and some
 * icons, so it is cached outright rather than cleverly.
 *
 * Bump CACHE on every deploy: the old cache is deleted on activate, which is
 * what stops a home-screen icon serving last week's build forever.
 */
const CACHE = 'photobooth-v4';

const SHELL = [
  './',
  './index.html',
  './booth.css',
  './booth.js',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', event => {
  // Take over immediately rather than waiting for every tab to close — a
  // kiosk has one tab and it is never closed.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(SHELL)).catch(() => {})
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  // Cache first: the booth must start the same whether the venue's wifi is
  // up or not. A network-first shell would stall on a captive portal.
  event.respondWith(
    caches.match(request).then(hit => {
      if (hit) {
        // Refresh in the background so the next launch is current.
        fetch(request).then(response => {
          if (response && response.ok) {
            caches.open(CACHE).then(cache => cache.put(request, response.clone()));
          }
        }).catch(() => {});
        return hit;
      }
      return fetch(request).then(response => {
        if (response && response.ok && request.url.startsWith(self.registration.scope)) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
