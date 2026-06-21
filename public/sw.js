// Self-destruct service worker.
//
// Service-worker caching was serving stale assets — a cached `react.js`/island
// chunk made every React island fail to hydrate (editor dead, dashboard widgets
// frozen) while server-rendered HTML stayed fresh, so "my changes don't show up".
//
// This worker takes over any previously-registered worker, purges ALL caches,
// unregisters itself, and reloads open tabs so they fetch everything straight
// from the network. After this runs once there is no service worker left.
// (A proper network-first PWA worker can be reintroduced later if needed.)

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch {}
    try { await self.registration.unregister(); } catch {}
    try {
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const c of clients) c.navigate(c.url);
    } catch {}
  })());
});
