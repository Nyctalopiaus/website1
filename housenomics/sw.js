// Housenomics service worker
// Precaches the app shell for offline use. Deliberately network-only
// (never cached) for live-data endpoints — see EXCLUDE_PATTERNS below.
//
// IMPORTANT: bump CACHE_VERSION on every deploy that changes any file in
// PRECACHE_URLS, same discipline as the styles.css?v=NN / app.js?v=NN
// cache-busting already used on this site. Forgetting to bump this means
// installed users can keep getting a stale shell after a deploy.
const CACHE_VERSION = 'housenomics-shell-v1';

const PRECACHE_URLS = [
  './',
  'index.html',
  'amortization.html',
  'styles.css',
  'app.js',
  'calculator.js',
  'ui.js',
  'config.js',
  'utils.js',
  'storage.js',
  'scraper.js',
  'amortization.js',
  'register-sw.js',
  'manifest.json',
  'assets/cyber_calc_bg.webp',
  'assets/indigo_calc_bg.webp',
  'assets/navy_gold_calc_bg.webp',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/icon-maskable-512.png',
  'assets/icons/apple-touch-icon.png',
  'assets/icons/favicon-32x32.png',
  'assets/icons/favicon.ico',
];

// Requests matching any of these must NEVER be served from cache or written
// to cache — they're live financial data (rates, Redfin/MLS lookups) and a
// stale response here is worse than a failed one. See mortgage_calculator_pwa_plan.md
// for why (the 2026-08-21/22 mls-proxy.php caching incident).
const EXCLUDE_PATTERNS = [
  /rates-proxy\.php/,
  /\/backend\/property-lookup\.php/,
];

function isExcluded(url) {
  return EXCLUDE_PATTERNS.some((re) => re.test(url));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle same-origin GET requests; let everything else pass through
  // untouched (e.g. cross-origin font requests already allowed by CSP).
  if (req.method !== 'GET') return;

  if (isExcluded(req.url)) {
    // Network-only, no cache read or write.
    event.respondWith(fetch(req));
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).catch(() => {
        // Offline and not precached — for a navigation request, fall back
        // to the shell page rather than a hard network error.
        if (req.mode === 'navigate') {
          return caches.match('index.html');
        }
        return Response.error();
      });
    })
  );
});
