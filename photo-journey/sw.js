// Photo Journey service worker — app-shell cache so the curriculum (briefs,
// objectives, camera tips) opens even with zero signal out in the field.
//
// Bump CACHE_VERSION on any deploy that changes a precached file below.
const CACHE_VERSION = 'pj-v1789868096807';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // never touch AI grading calls or other writes

  const url = new URL(req.url);

  // Self-hosted Google Fonts CSS + font files: cache-first, they almost never change.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(CACHE_VERSION).then((cache) =>
        cache.match(req).then(
          (cached) =>
            cached ||
            fetch(req)
              .then((res) => {
                cache.put(req, res.clone());
                return res;
              })
              .catch(() => cached)
        )
      )
    );
    return;
  }

  // Any other cross-origin request (AI providers, etc.) — network only, never cached.
  if (url.origin !== self.location.origin) return;

  // Page navigations: network-first, fall back to the cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          caches.open(CACHE_VERSION).then((cache) => cache.put('./index.html', res.clone()));
          return res;
        })
        .catch(() => caches.match('./index.html').then((res) => res || caches.match('./')))
    );
    return;
  }

  // Same-origin static assets (hashed JS/CSS, background photos, icons):
  // stale-while-revalidate so they load instantly and stay fresh when online.
  event.respondWith(
    caches.open(CACHE_VERSION).then((cache) =>
      cache.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.status === 200) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    )
  );
});
