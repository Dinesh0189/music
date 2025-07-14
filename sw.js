const CACHE_VERSION = 'v1';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const IMMUTABLE_CACHE = `immutable-${CACHE_VERSION}`;
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;

// Shell files you want available offline immediately
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './sw.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];
// Third‑party libs that practically never change
const IMMUTABLE_ASSETS = [
  'https://cdn.jsdelivr.net/npm/jsmediatags@3.9.7/dist/jsmediatags.min.js',
  'https://unpkg.com/color-thief-browser/dist/color-thief.umd.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then(c => c.addAll(STATIC_ASSETS)),
      caches.open(IMMUTABLE_CACHE).then(c => c.addAll(IMMUTABLE_ASSETS))
    ]).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  const allowed = [STATIC_CACHE, IMMUTABLE_CACHE, RUNTIME_CACHE];
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => !allowed.includes(k) && caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. Immutable third‑party files – cache‑first
  if (IMMUTABLE_ASSETS.includes(url.href)) {
    event.respondWith(caches.match(req).then(res => res || fetch(req)));
    return;
  }

  // 2. Audio files – network‑first, cache fallback
  if (req.destination === 'audio') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // 3. Documents / scripts / styles / images – cache‑first, update in background
  if ([
    'document',
    'script',
    'style',
    'image'
  ].includes(req.destination)) {
    event.respondWith(
      caches.match(req).then(cached => {
        const fetchPromise = fetch(req).then(networkRes => {
          caches.open(RUNTIME_CACHE).then(c => c.put(req, networkRes.clone()));
          return networkRes;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
  }
});
