// InkBooks Service Worker
const CACHE = 'inkbooks-v3';

const PRECACHE = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
];

// Installa: pre-cache solo il CDN pesante (non l'HTML)
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// Attiva: elimina cache vecchie e forza reload di tutte le tab aperte
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then(clients => clients.forEach(c => c.navigate(c.url)))
  );
});

// Fetch: network-first per HTML, cache-first per tutto il resto
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Supabase API → sempre rete
  if (url.hostname.endsWith('supabase.co') ||
      url.hostname.endsWith('supabase.com') ||
      url.hostname.endsWith('supabase.io')) {
    return;
  }

  // HTML → network-first: aggiornamenti arrivano subito
  if (e.request.headers.get('accept')?.includes('text/html')) {
    e.respondWith(
      fetch(e.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return response;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Tutto il resto (CDN, immagini, ecc.) → cache-first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (response && response.ok && e.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return response;
      }).catch(() => new Response('Offline', { status: 503 }));
    })
  );
});
