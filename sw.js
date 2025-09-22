// sw.js

// Bump these when you change caching logic or shell files
const SHELL_CACHE = 'ifd-shell-v1';
const DATA_CACHE  = 'ifd-data-v1';

// Precache the app shell (add/remove to fit your project)
const SHELL_ASSETS = [
  '/',                 // if your site serves index at root
  '/index.html',
  '/offline.html',
  '/icons/icon192.png',
  '/icons/icon512.png',
  '/icons/favicon.png'
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
        cache.put('/index.html', fresh.clone()); // keep shell fresh
        return fresh;
      } catch {
        // If offline, try cached shell, else offline page
        return (await caches.match('/index.html')) || (await caches.match('/offline.html'));
      }
    })());
    return;
  }

  // 2) JSON data (chapter files): stale-while-revalidate
  //    Match by extension or by Accept header containing JSON
  const isJSON =
    url.pathname.endsWith('.json') ||
    req.headers.get('accept')?.includes('application/json');

  if (isJSON) {
    event.respondWith(staleWhileRevalidate(req, DATA_CACHE));
    return;
  }

  // 3) Everything else: cache-first, then network
  event.respondWith((async () => {
    const cached = await caches.match(req);
    return cached || fetch(req);
  })());
});

// ----- Stale-While-Revalidate helper for JSON -----
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);

  // Kick off a network fetch in the background to update cache
  const networkPromise = fetch(request).then((response) => {
    // Only cache good responses
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => null);

  // Return cached response immediately if present, else wait for network
  const cached = await cache.match(request);
  return cached || networkPromise || caches.match('/offline.html');
}

// (Optional) Listen for a manual refresh message from the page
self.addEventListener('message', (event) => {
  if (event.data?.type === 'REFRESH_DATA') {
    // You could programmatically refetch a known list of JSON endpoints here.
  }
});
