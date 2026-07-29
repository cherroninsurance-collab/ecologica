/* ECOLOGIA service worker — strict offline.
   Precaches the app and the complete Bible on first visit; afterwards
   every request is served from cache. A missionary can install this on
   a phone, walk into a valley with no signal, and lose nothing.      */

'use strict';

const CACHE = 'ecologia-v2';

/* Precache only the shell. Scripture is now one file per book and is
   cached on demand as books are opened (and by the app's idle prefetch),
   so a first visit costs ~400 KB instead of 5 MB. */
const PRECACHE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'data/books/index.json',
  'data/books/43.json',        // John — the app opens here
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) =>
      hit || fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => new Response('Offline — asset not in the bundle.', { status: 404 }))
    )
  );
});
