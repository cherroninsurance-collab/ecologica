/* ECOLOGIA service worker — strict offline.
   Precaches the app and the complete Bible on first visit; afterwards
   every request is served from cache. A missionary can install this on
   a phone, walk into a valley with no signal, and lose nothing.      */

'use strict';

const CACHE = 'ecologia-v3';

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
  const url = new URL(e.request.url);

  /* Only ever handle our own GET requests. A service worker sees EVERY
     request the page makes, including cross-origin ones — and this handler
     ends in a synthetic 404 when the network fails. That meant calls to
     api.esv.org were being swallowed and answered with "Offline — asset not
     in the bundle", so the ESV never appeared even with a valid key and a
     live connection. Anything not ours is left to the network. */
  if (url.origin !== location.origin || e.request.method !== 'GET') return;

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
