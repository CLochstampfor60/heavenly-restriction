// Service worker template. The hr-service-worker plugin in vite.config.js writes dist/sw.js from
// this file after each build, filling in VERSION and FILES. Do not register this file directly.
//
// Rules
// - Precache the app shell only: the files the build wrote (HTML, JS, CSS, fonts, icons,
//   manifest). The installed app then opens with no signal.
// - /api/* is never answered from or stored in a cache: requests go straight to the network, and
//   offline data stays in IndexedDB (Dexie).
// - Same-origin GET only; anything else passes through untouched.
// - A new version installs in the background and waits. The page shows "Update available ·
//   Reload"; tapping Reload sends 'skip-waiting'. Old caches are deleted on activate.

const VERSION = '__VERSION__';
const FILES = [] /* __FILES__ */;
const CACHE = `hr-shell-${VERSION}`;
const PRECACHED = new Set(FILES);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith('hr-shell-') && key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // network only, never cached

  // The app is one page with hash routes: every navigation gets the cached index.html.
  const path = request.mode === 'navigate' ? '/index.html' : url.pathname;
  if (!PRECACHED.has(path)) return;
  // caches.match with cacheName only reads: it never re-creates a cache that sign-out deleted.
  event.respondWith(caches.match(path, { cacheName: CACHE }).then((hit) => hit || fetch(request)));
});
