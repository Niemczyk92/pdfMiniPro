// PDF Mini Editor Pro — service worker v111
// Bump this version string for every release to trigger updates.
const CACHE = 'pdf-mini-editor-pro-v111';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './icon-maskable.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './pdf-file-icon.svg',
  './pdf-file-icon-16.png',
  './pdf-file-icon-32.png',
  './pdf-file-icon-48.png',
  './pdf-file-icon-64.png',
  './pdf-file-icon-128.png',
  './pdf-file-icon-256.png',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js',
  'https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
];

self.addEventListener('install', e => {
  // Activate this new worker immediately instead of waiting for every tab to
  // close. Without this, a cache-first worker keeps serving the OLD index.html
  // for a long time after a release — so users (and our own testing) never see
  // the fix until they fully quit the browser. Paired with clients.claim() below.
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.all(ASSETS.map(url =>
        cache.add(url).catch(err => console.warn('SW cache miss:', url, err.message))
      ))
    )
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // NETWORK-FIRST for the app shell (the HTML document). A cache-first strategy
  // here meant every code change was invisible until the cache key changed AND
  // the worker re-activated — the root cause of "still broken after the fix".
  // Network-first guarantees the latest index.html when online, with the cached
  // copy as the offline fallback.
  const isDoc = req.mode === 'navigate'
    || req.destination === 'document'
    || new URL(req.url).pathname.endsWith('/index.html');
  if (isDoc) {
    e.respondWith(
      fetch(req).then(resp => {
        if (resp && resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE).then(cache => cache.put(req, clone)).catch(() => {});
        }
        return resp;
      }).catch(() => caches.match(req).then(c => c || caches.match('./index.html')))
    );
    return;
  }

  // CACHE-FIRST for everything else (static icons + pinned CDN libs) — those are
  // versioned/immutable, so serving from cache is fast and offline-safe.
  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(resp => {
        if (resp && resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE).then(cache => cache.put(req, clone)).catch(() => {});
        }
        return resp;
      }).catch(() => Response.error());
    })
  );
});
