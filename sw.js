// InkBooks Service Worker — cache-first per assets statici
const CACHE = 'inkbooks-v2';

const PRECACHE = [
  '/inkbooks/',
  '/inkbooks/index.html',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
];

// Installa: metti in cache gli asset statici
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// Attiva: elimina cache vecchie
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch: cache-first per static, network-only per Supabase API
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Supabase API calls → sempre rete (dati in tempo reale)
  if (url.hostname.endsWith('supabase.co') ||
      url.hostname.endsWith('supabase.com') ||
      url.hostname.endsWith('supabase.io')) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;

      return fetch(e.request).then(response => {
        // Metti in cache solo risposte GET valide
        if (response && response.ok && e.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback: restituisce la cache se disponibile
        return cached || new Response('Offline', { status: 503 });
      });
    })
  );
});
