/* Verselight — offline service worker.
   Precaches the shell and fonts; Scripture books are cached as they are
   opened. A phone that has visited once keeps working with no signal.   */
'use strict';

const CACHE = 'verselight-v1';
const PRECACHE = [
  './', 'index.html', 'fonts.css', 'manifest.webmanifest',
  'app.js', 'bg.js', 'cross.js', 'plate.js', 'gate.js', 'esv.js', 'devotional.js',
  'data/devotional.json', 'data/books/1.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE)
    .then((c) => Promise.allSettled(PRECACHE.map(u => c.add(u))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((k) => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  /* Only ever handle our own GET requests. A service worker sees EVERY
     request the page makes, including cross-origin ones — and this handler
     ends in a synthetic failure when the network is unavailable. Handling
     external calls here would swallow the ESV API entirely. */
  if (url.origin !== location.origin || e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) =>
      hit || fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => new Response('Offline', { status: 503 }))
    )
  );
});
