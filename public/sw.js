// TransportHub service worker — minimal cache strategy.
// Caches the app shell for offline-friendly navigation. SSR pages bypass the
// cache (network-first) so live data stays current.

const CACHE = 'th-shell-v3';
const SHELL = ['/', '/offline.html', '/manifest.webmanifest', '/favicon.svg', '/robots.txt'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── Web Push ─────────────────────────────────────────────────────
// Server posts { title, body, url, tag, icon }. We surface it as a
// system notification; click focuses an existing tab or opens a new one.

self.addEventListener('push', (event) => {
  let payload = { title: 'TransportHub', body: '', url: '/app' };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    payload.body = event.data ? event.data.text() : '';
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon || '/favicon.svg',
      badge: '/favicon.svg',
      tag: payload.tag,
      data: { url: payload.url || '/app' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/app';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const c of clientList) {
        if ('focus' in c) {
          if ('navigate' in c) c.navigate(target);
          return c.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    }),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Don't cache API, auth, or app routes — those need fresh data.
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/app/') ||
    url.pathname.startsWith('/admin/')
  ) return;

  // Static assets: cache-first.
  if (
    url.pathname.startsWith('/_astro/') ||
    /\.(svg|png|jpg|jpeg|webp|woff2?|css|js|json)$/.test(url.pathname)
  ) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => cached || new Response('', { status: 504 })))
    );
    return;
  }

  // HTML public pages: network-first, fall back to cache then offline page.
  event.respondWith(
    fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() =>
      caches.match(req).then((c) => c || caches.match('/offline.html') || caches.match('/'))
    )
  );
});
