// DocenFicha Service Worker v1.0
const CACHE_NAME = 'docenficha-v1';

// Recursos a cachear para funcionamiento offline
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png',
  'https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap',
];

// ── INSTALL: precachear recursos estáticos ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Precacheando recursos...');
      // Cachear uno a uno para no fallar si alguno no existe aún
      return Promise.allSettled(
        STATIC_ASSETS.map(url => cache.add(url).catch(e => console.warn('[SW] No cacheado:', url, e)))
      );
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: limpiar cachés antiguas ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log('[SW] Eliminando caché antigua:', k);
          return caches.delete(k);
        })
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: Network-first para Firebase, Cache-first para el resto ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Firebase y fuentes externas: network-first (necesitan conexión para datos frescos)
  const isExternal = url.hostname.includes('firebase') ||
                     url.hostname.includes('googleapis.com') ||
                     url.hostname.includes('gstatic.com') ||
                     url.hostname.includes('firebaseapp.com');

  if (isExternal) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // App shell y recursos locales: Cache-first con fallback a network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cachear respuestas válidas
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline y no hay caché: devolver index.html para SPA
        if (event.request.destination === 'document') {
          return caches.match('/') || caches.match('/index.html');
        }
      });
    })
  );
});

// ── PUSH: notificaciones (preparado para futuras funcionalidades) ──
self.addEventListener('push', event => {
  const data = event.data?.json() || {};
  const options = {
    body: data.body || 'DocenFicha',
    icon: '/icon-192x192.png',
    badge: '/icon-72x72.png',
    vibrate: [100, 50, 100],
    data: { url: data.url || '/' }
  };
  event.waitUntil(
    self.registration.showNotification(data.title || 'DocenFicha', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url));
});
