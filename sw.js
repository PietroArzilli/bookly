const CACHE = 'inkbooks-v5';

const PRECACHE = [
  '/inkbooks/',
  '/inkbooks/manifest.json',
  '/inkbooks/icon.svg',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// Installa e precacha subito
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.allSettled(
        PRECACHE.map(url =>
          fetch(url).then(r => r.ok ? cache.put(url, r) : null).catch(() => null)
        )
      )
    )
  );
});

// Attiva: elimina cache vecchie, prendi controllo di tutti i tab
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // App shell (HTML, manifest, icone): stale-while-revalidate
  // → serve subito da cache, aggiorna in background per la prossima apertura
  if (url.origin === self.location.origin && url.pathname.startsWith('/inkbooks')) {
    e.respondWith(staleWhileRevalidate(e.request));
    return;
  }

  // CDN Supabase: cache-first (libreria grande, cambia raramente)
  if (url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(cacheFirst(e.request));
    return;
  }
});

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  const netFetch = fetch(req)
    .then(res => { if (res.ok) cache.put(req, res.clone()); return res; })
    .catch(() => null);
  return cached || await netFetch;
}

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
  return res;
}
