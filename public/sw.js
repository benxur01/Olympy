// Olympy Service Worker — oflayn rejim va kesh.
// Strategiya:
//   - HTML hujjat (navigatsiya): network-first — yangi deploy darhol ko'rinadi,
//     internet bo'lmasa keshdan beriladi (oflayn rejim).
//   - /api/ so'rovlari: network-first — xato bo'lsa keshdan (oxirgi javob).
//     API keshi ALOHIDA cache'da, 5 daqiqalik TTL bilan va logout'da butunlay
//     tozalanadi — eski foydalanuvchining javoblari keyingisiga ko'rinmasin.
//   - Brand rasmlar: network-first — logotip kabi hash-lanmagan assetlar deploydan
//     keyin eski keshdan chiqib qolmasin.
//   - Statik fayllar (hash-li JS/CSS, rasm, font): cache-first — tez yuklanadi.
const CACHE_NAME = 'olympy-v2';
const API_CACHE_NAME = 'olympy-api-v1';
const STATIC_ASSETS = ['/', '/index.html'];
// API javoblari keshda maksimal shuncha yashaydi (millisekund) — eski
// (masalan, logout'dan oldingi) ma'lumot uzoq ko'rsatilmasin.
const API_CACHE_TTL_MS = 5 * 60 * 1000;
const API_CACHED_AT_HEADER = 'x-olympy-cached-at';

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
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== API_CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Logout'da frontend SW'ga xabar yuboradi — API keshi butunlay tozalanadi.
// Aks holda keyingi login qilgan foydalanuvchi oldingi foydalanuvchining
// keshdagi javoblarini (oflayn rejimda) ko'rishi mumkin edi.
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'CLEAR_API_CACHE') {
    e.waitUntil(caches.delete(API_CACHE_NAME));
  }
});

// API javobini TTL belgisi (cached-at header) bilan keshga yozadi.
const putApiResponseWithTimestamp = async (req, response) => {
  try {
    const headers = new Headers(response.headers);
    headers.set(API_CACHED_AT_HEADER, String(Date.now()));
    const body = await response.blob();
    const stamped = new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
    const cache = await caches.open(API_CACHE_NAME);
    await cache.put(req, stamped);
  } catch {}
};

// Keshdagi API javobini TTL bo'yicha tekshirib qaytaradi; eskirgan bo'lsa
// o'chiradi va undefined qaytaradi.
const matchFreshApiResponse = async (req) => {
  const cache = await caches.open(API_CACHE_NAME);
  const cached = await cache.match(req);
  if (!cached) return undefined;
  const cachedAt = Number(cached.headers.get(API_CACHED_AT_HEADER) || 0);
  if (!cachedAt || Date.now() - cachedAt > API_CACHE_TTL_MS) {
    await cache.delete(req);
    return undefined;
  }
  return cached;
};

self.addEventListener('fetch', (e) => {
  const req = e.request;

  // Faqat GET so'rovlarni keshlaymiz (POST/PUT/DELETE'ni qo'l tegizmaymiz).
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Boshqa domendagi so'rovlarga (CDN, fonts, analytics) aralashmaymiz.
  if (url.origin !== self.location.origin) return;

  // API so'rovlari — network-first, xato bo'lsa keshdan (5 daqiqalik TTL).
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(req)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            putApiResponseWithTimestamp(req, clone);
          }
          return response;
        })
        .catch(() => matchFreshApiResponse(req))
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

  // Brand assetlar hash-lanmagan URL bilan keladi. Cache-first bo'lsa eski logo
  // service worker keshida qolib ketadi, shuning uchun tarmoqni birinchi tekshiramiz.
  if (url.pathname.startsWith('/brand/')) {
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
