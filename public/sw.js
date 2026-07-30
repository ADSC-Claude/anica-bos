/**
 * ANICA Wellness Spa — service worker.
 *
 * v1 scope, deliberately conservative:
 *  • App shell and static assets are cached so the app opens instantly.
 *  • Today's schedule is cached read-only, so the receptionist can still see
 *    who is booked when the connection drops.
 *  • Nothing is queued for later. Every write goes straight to the network and
 *    fails loudly offline — a sale must never be silently lost or duplicated.
 */

const VERSION = 'anica-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const DATA_CACHE = `${VERSION}-data`;

const SHELL_ASSETS = [
  '/portal',
  '/portal/appointments',
  '/offline',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-192.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

function isTodaySchedule(url) {
  return (
    url.pathname === '/portal/appointments' ||
    url.pathname === '/portal' ||
    url.pathname.startsWith('/api/portal/schedule')
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never touch anything but same-origin GETs.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Auth, checkout and webhooks must always hit the network.
  if (
    url.pathname.startsWith('/api/webhooks') ||
    url.pathname.startsWith('/login') ||
    url.pathname.startsWith('/api/public/booking') ||
    url.pathname.startsWith('/api/portal/export')
  ) {
    return;
  }

  // Today's schedule: network first, fall back to the last good copy.
  if (isTodaySchedule(url)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(DATA_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached ?? caches.match('/offline');
        }),
    );
    return;
  }

  // Static assets: cache first.
  if (
    url.pathname.startsWith('/_next/static') ||
    url.pathname.startsWith('/icons') ||
    url.pathname === '/manifest.webmanifest'
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
    return;
  }

  // Everything else: network, with the offline page as a last resort.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(request);
        return cached ?? caches.match('/offline');
      }),
    );
  }
});
