// NVS-15 service worker: network-first HTML, cache-first hashed assets
const V = 'nvs-15';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== V) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req, { cache: 'no-store' })
      .then(r => { const c = r.clone(); caches.open(V).then(x => x.put('/', c)); return r; })
      .catch(() => caches.match('/')));
    return;
  }
  const cacheable = (url.origin === location.origin && url.pathname.startsWith('/assets/'))
    || url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com')
    || url.hostname.includes('tfhub') || url.hostname.includes('storage.googleapis.com') || url.hostname.includes('kaggle');
  if (!cacheable) return;
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok || r.type === 'opaque') { const c = r.clone(); caches.open(V).then(x => x.put(req, c)); }
    return r;
  })));
});
