// Olympy Service Worker — oflayn rejim va kesh.
// Strategiya:
//   - HTML hujjat (navigatsiya): network-first — yangi deploy darhol ko'rinadi,
//     internet bo'lmasa keshdan beriladi (oflayn rejim).
//   - /api/ so'rovlari: network-first — xato bo'lsa keshdan (oxirgi javob).
//   - Statik fayllar (hash-li JS/CSS, rasm, font): cache-first — tez yuklanadi.
const CACHE_NAME = 'olympy-v1';
const STATIC_ASSETS = ['/', '/index.html'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Birorta asset topilmasa ham install yiqilmasin.
      Promise.allSettled(STATIC_ASSETS.map((url) => cache.add(url)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;

  // Faqat GET so'rovlarni keshlaymiz (POST/PUT/DELETE'ni qo'l tegizmaymiz).
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Boshqa domendagi so'rovlarga (CDN, fonts, analytics) aralashmaymiz.
  if (url.origin !== self.location.origin) return;

  // API so'rovlari — network-first, xato bo'lsa keshdan.
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(req)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return response;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // HTML hujjat / SPA navigatsiyasi — network-first, oflayn bo'lsa keshdagi sahifa.
  if (req.mode === 'navigate' || req.destination === 'document') {
    e.respondWith(
      fetch(req)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', clone));
          }
          return response;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('/index.html')))
    );
    return;
  }

  // Statik fayllar — cache-first, keyin tarmoqdan olib keshga qo'shamiz.
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return response;
      });
    })
  );
});
