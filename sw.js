// sw.js
// Bump SHELL_CACHE when you change shell files (html, icons).
// Bump DATA_CACHE when you want to force all clients to drop cached JSON.
const SHELL_CACHE = 'ifd-shell-v1';
const DATA_CACHE  = 'ifd-data-v2';

// Precache the app shell
const SHELL_ASSETS = [
  'index.html',
  'offline.html',
  'icons/icon192.png',
  'icons/icon512.png',
  'icons/favicon.png'
];

// ----- Install: cache the shell -----
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

// ----- Activate: clean up old caches -----
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((k) => {
          if (![SHELL_CACHE, DATA_CACHE].includes(k)) return caches.delete(k);
        })
      )
    )
  );
  self.clients.claim();
});

// ----- Fetch: handle navigations, JSON, and everything else -----
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1) Document navigations: network first, fall back to cached shell / offline
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(SHELL_CACHE);
        cache.put('index.html', fresh.clone());
        return fresh;
      } catch {
        return (await caches.match('index.html')) || (await caches.match('offline.html'));
      }
    })());
    return;
  }

  // 2) JSON data files: network-first.
  //    Always fetch fresh data from the server; only fall back to cache when offline.
  const isJSON =
    url.pathname.endsWith('.json') ||
    req.headers.get('accept')?.includes('application/json');

  if (isJSON) {
    event.respondWith(networkFirst(req, DATA_CACHE));
    return;
  }

  // 3) Everything else (icons, etc.): cache-first, then network
  event.respondWith((async () => {
    const cached = await caches.match(req);
    return cached || fetch(req);
  })());
});

// ----- Network-first for JSON -----
// Always try the network. On success, update the cache and return fresh data.
// On failure (offline), return whatever is cached.
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline fallback
    return (await cache.match(request)) || (await caches.match('offline.html'));
  }
}

// ----- Manual refresh message from the page (optional) -----
self.addEventListener('message', (event) => {
  if (event.data?.type === 'REFRESH_DATA') {
    // Could programmatically refetch known JSON endpoints here if needed.
  }
});
