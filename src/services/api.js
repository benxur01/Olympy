// API base URL — store.jsx bilan BIR XIL mantiq. Avval PROD'da
// location.origin ishlatilardi: VITE_API_BASE_URL o'rnatilmagan deploy'da
// so'rovlar frontend saytining o'ziga ketib 404 bo'lardi.
const DEFAULT_API_BASE_URL = import.meta.env?.PROD
  ? 'https://olympy-api.onrender.com'
  : 'http://localhost:8000';
// API_BASE_URL — yagona manba (single source of truth). store.jsx ham shu
// qiymatni import qiladi (avval ikkala faylda hardcoded takrorlanardi).
export const API_BASE_URL = (
  import.meta.env?.VITE_API_BASE_URL ||
  DEFAULT_API_BASE_URL
).replace(/\/+$/, '');

// Real-time (Java Spring Boot) xizmatning bazaviy URL'i — jonli duel va
// "Kahoot uslubidagi" jonli viktorina shu yerda ishlaydi. Django'dan alohida
// (lokalda 8081-portda). Deploy'da VITE_REALTIME_BASE_URL orqali beriladi;
// o'rnatilmasa Django bilan bir xil origin'ga tushadi (reverse-proxy orqali
// /ws/* va /api/quiz/* Java'ga yo'naltirilishi mumkin).
const DEFAULT_REALTIME_BASE_URL = (
  (import.meta.env?.DEV === true || import.meta.env?.MODE === 'development')
    ? 'http://localhost:8081'
    : API_BASE_URL
);
export const REALTIME_BASE_URL = (
  import.meta.env?.VITE_REALTIME_BASE_URL ||
  DEFAULT_REALTIME_BASE_URL
).replace(/\/+$/, '');

// REALTIME_BASE_URL (http[s]://...) → ws[s]://... — WebSocket sxemasiga
// aylantiramiz (https→wss, http→ws).
const realtimeWsBase = () => REALTIME_BASE_URL.replace(/^http/i, 'ws');

const makeAssetUrl = (url) => {
  if (!url) return '';
  const value = String(url);
  if (/^https?:\/\//i.test(value) || value.startsWith('data:') || value.startsWith('blob:')) return value;
  return `${API_BASE_URL}${value.startsWith('/') ? '' : '/'}${value}`;
};

const AUTH_TOKEN_KEY = 'olympy_api_token';
const AUTH_REFRESH_KEY = 'olympy_refresh_token';

// Hostning taxminiy "registrable domain"i (eTLD+1) — oxirgi ikki yorliq.
// To'liq Public Suffix List'siz taxmin, lekin bizga kerak bo'lgan ikkala
// holatni to'g'ri ajratadi: `api.prolymp.uz` va `prolymp.uz` bir sayt,
// `olympy-api.onrender.com` va `prolymp.uz` esa turli saytlar.
const _registrableDomain = (hostname) => {
  const labels = String(hostname || '').toLowerCase().split('.');
  return labels.length <= 2 ? labels.join('.') : labels.slice(-2).join('.');
};

// API sahifaga nisbatan CROSS-SITE joylashganmi? Shu holatda auth cookie
// brauzer uchun "uchinchi tomon cookie"si bo'ladi.
const _apiIsCrossSite = () => {
  try {
    if (typeof window === 'undefined' || !window.location?.hostname) return false;
    // Nisbiy baza (bo'sh yoki '/...') — har doim same-origin.
    if (!/^https?:\/\//i.test(API_BASE_URL)) return false;
    const api = new URL(API_BASE_URL);
    if (api.host === window.location.host) return false;
    return _registrableDomain(api.hostname) !== _registrableDomain(window.location.hostname);
  } catch {
    return false;
  }
};

// Default: JWT faqat HttpOnly cookie — storage'ga yozilmaydi (XSS blast
// radius'i kichik qoladi). Telegram WebView / cookie-less muhitlar uchun
// VITE_AUTH_ALLOW_TOKEN_STORAGE=true yoki so'rov headeri X-Olympy-Auth-Storage: 1.
//
// MUHIM (iOS Safari): cookie-only rejim FAQAT frontend va API bir saytda
// bo'lganda ishlaydi. Production'da ular turli saytlarda (prolymp.uz va
// olympy-api.onrender.com — onrender.com Public Suffix List'da), ya'ni auth
// cookie brauzer uchun uchinchi tomon cookie'si. Safari (iOS va macOS) 13.1
// dan beri uchinchi tomon cookie'larini TO'LIQ bloklaydi (ITP), shuning uchun
// `SameSite=None; Secure` bo'lsa ham `/api/auth/google/` javobidagi Set-Cookie
// umuman SAQLANMAYDI. Login javobining o'zi muvaffaqiyatli bo'lgani uchun
// ilova foydalanuvchini kiritadi, keyin esa birinchi autentifikatsiyali
// so'rov 401 oladi → refresh ham 401 → `olympy:logout` → foydalanuvchi hech
// nima qilmasdan o'zidan-o'zi chiqarib yuboriladi. Aynan shu Bearer fallback
// 58a1fbe da qo'shilgan edi, c0b005d (security audit) esa uni production'da
// o'chirib qo'ygan — natijada iOS Safari'dagi avto-logout qaytib keldi.
//
// Shu sababli cross-site deploy'da Bearer fallback avtomatik yoqiladi: cookie
// baribir birinchi navbatda ishlatiladi, token esa u yetib bormaganda zaxira
// kanal bo'lib qoladi. Same-site deploy'da (masalan API `api.prolymp.uz` ga
// ko'chirilsa) bu shart o'zidan-o'zi o'chadi va qat'iy cookie-only rejim
// qaytadi — qo'shimcha sozlash kerak emas.
const ALLOW_TOKEN_STORAGE = (
  import.meta.env?.VITE_AUTH_ALLOW_TOKEN_STORAGE === 'true'
  || import.meta.env?.DEV === true
  || import.meta.env?.MODE === 'development'
  || _apiIsCrossSite()
);

// Foydalanuvchi profil obyekti (xom backend `/api/me/` javobi) modul-darajali
// in-memory `_currentUser`'da va qo'shimcha sessionStorage'da ('currentUser')
// keshlanadi. Modul-darajali o'zgaruvchi sahifa yangilanganda yo'qolardi —
// sessionStorage esa tab umri davomida saqlanib, getMe'ning birinchi
// chaqiruvigacha (yoki tarmoq sekin bo'lganda) keshdan tezda qaytadi.
//
// XAVFSIZLIK ESLATMASI: kesh faqat UI ko'rsatish uchun. Server hech qachon
// klientdagi rollarga ishonmaydi — har bir himoyalangan endpoint ruxsatni
// o'zi (cookie'dagi JWT orqali) qayta tekshiradi. sessionStorage tab yopilganda
// tozalanadi, shuning uchun localStorage'dan ko'ra qisqaroq oyna beradi.
const CURRENT_USER_KEY = 'currentUser';
let _currentUser = null;

// Default store — XAVFSIZLIK: sessionStorage. JWT token brauzer yopilganda
// tozalanadi, bu XSS orqali o'g'irlash oynasini va eskirgan token xavfini
// kamaytiradi. "Meni eslab qolish" tasdiqlangan foydalanuvchilar saveAuth'da
// persistent=true orqali aniq localStorage'ni oladi. localStorage'ni default
// qilish faqat VITE_AUTH_STORAGE=local bilan tanlanadi.
const _defaultAuthStore = (() => {
  try {
    const env = (import.meta?.env?.VITE_AUTH_STORAGE || '').toLowerCase();
    if (env === 'local' && typeof localStorage !== 'undefined') return localStorage;
    if (typeof sessionStorage !== 'undefined') return sessionStorage;
  } catch {}
  return typeof localStorage !== 'undefined' ? localStorage : null;
})();
const _sessionStore = (() => {
  try { if (typeof sessionStorage !== 'undefined') return sessionStorage; } catch {}
  return null;
})();
const _localStore = (() => {
  try { if (typeof localStorage !== 'undefined') return localStorage; } catch {}
  return null;
})();

// ─── Joriy foydalanuvchi keshi (sessionStorage) ──────────────────────────────
// _currentUser in-memory bo'lgani uchun sahifa yangilanganda yo'qolardi.
// sessionStorage'ga ko'chiramiz: o'qishda JSON parse xatosini yutib, buzilgan
// qiymatni tozalaymiz (eski/buzilgan kesh tufayli sahifa qulamasin).
const _readCachedUser = () => {
  if (_currentUser) return _currentUser;
  try {
    const raw = _sessionStore && _sessionStore.getItem(CURRENT_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    _currentUser = parsed || null;
    return _currentUser;
  } catch {
    try { _sessionStore && _sessionStore.removeItem(CURRENT_USER_KEY); } catch {}
    return null;
  }
};
const _writeCachedUser = (user) => {
  _currentUser = user || null;
  try {
    if (user) _sessionStore && _sessionStore.setItem(CURRENT_USER_KEY, JSON.stringify(user));
    else _sessionStore && _sessionStore.removeItem(CURRENT_USER_KEY);
  } catch {}
};
const _clearCachedUser = () => {
  _currentUser = null;
  try { _sessionStore && _sessionStore.removeItem(CURRENT_USER_KEY); } catch {}
};

let _activeAuthStore = _defaultAuthStore;
const _setActiveStore = (store) => { _activeAuthStore = store || _defaultAuthStore; };

// Tizim yuklanganda saqlangan tokenni qidirib, _activeAuthStore'ni moslashtiramiz (iOS va boshqa brauzer reloadlari uchun).
try {
  if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(AUTH_TOKEN_KEY)) {
    _activeAuthStore = sessionStorage;
  } else if (typeof localStorage !== 'undefined' && localStorage.getItem(AUTH_TOKEN_KEY)) {
    _activeAuthStore = localStorage;
  }
} catch {}

const _readAuth = (key) => {
  // XAVFSIZLIK: token endi yagona manbadan — aktiv store'dan o'qiladi. Avval
  // active + local + session uchtasidan qidirilardi (ikki/uch kanal), bu esa
  // stale qiymat va izchilsizlik manbai edi (bir store'da eski, boshqasida
  // yangi token qolib ketishi mumkin). Asosiy JWT cookie'da yashaydi —
  // _readAuth faqat eski refresh oqimi uchun fallback bo'lib qoladi.
  try {
    return _activeAuthStore ? _activeAuthStore.getItem(key) : null;
  } catch {}
  return null;
};
const _writeAuth = (key, value) => { try { _activeAuthStore && _activeAuthStore.setItem(key, value); } catch {} };
const _removeAuth = (key) => {
  try { _localStore && _localStore.removeItem(key); } catch {}
  try { _sessionStore && _sessionStore.removeItem(key); } catch {}
};

// ─── Impersonatsiya ("foydalanuvchi sifatida ko'rish") ───────────────────────
// Support uchun admin boshqa foydalanuvchi sifatida ilovani ochganda backend
// QISQA muddatli (15 daqiqa) access token beradi. Uni cookie'ga YOZMAYMIZ va
// oddiy token kalitiga ham (AUTH_TOKEN_KEY) tegmaymiz: adminning O'Z seansi
// buzilmasdan qolishi kerak — "Admin panelga qaytish" aynan shunga tayanadi
// (impersonatsiya tokenini tashlash kifoya, admin cookie'si joyida turadi).
// Token faqat sessionStorage'da yashaydi (tab yopilishi bilan yo'qoladi) va
// so'rovlarda `Authorization: Bearer` sifatida ketadi — backend header'ni
// cookie'dan USTUN qo'yadi (OlympyJWTAuthentication.authenticate).
const IMPERSONATION_KEY = 'olympy_impersonation';
let _impersonation = null; // { token, jti, userId, name }
const _readImpersonation = () => {
  if (_impersonation) return _impersonation;
  try {
    const raw = _sessionStore && _sessionStore.getItem(IMPERSONATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    _impersonation = (parsed && parsed.token) ? parsed : null;
    return _impersonation;
  } catch {
    try { _sessionStore && _sessionStore.removeItem(IMPERSONATION_KEY); } catch {}
    return null;
  }
};
const _writeImpersonation = (info) => {
  _impersonation = info || null;
  try {
    if (info) _sessionStore && _sessionStore.setItem(IMPERSONATION_KEY, JSON.stringify(info));
    else _sessionStore && _sessionStore.removeItem(IMPERSONATION_KEY);
  } catch {}
};

const unwrapList = (res) => Array.isArray(res) ? res : (res && res.results ? res.results : []);

// DRF PageNumberPagination ro'yxatining BARCHA sahifalarini ketma-ket yuklab,
// bitta massivga yig'adi. Avval `page_size=200` bilan faqat birinchi 200 ta
// yozuv olinardi va qolganlari jimgina ko'rinmasdi (unwrapListPaged faqat
// console.warn berardi). Endi server `next` qaytarganicha keyingi page
// so'raladi. `maxPages` — himoya chegarasi (200×50 = 10 000 yozuv), cheksiz
// loop yoki juda katta javoblardan saqlaydi.
const requestAllPages = async (basePath, { token, pageSize = 200, maxPages = 50 } = {}) => {
  const sep = basePath.includes('?') ? '&' : '?';
  const all = [];
  for (let page = 1; page <= maxPages; page++) {
    const res = await request(`${basePath}${sep}page_size=${pageSize}&page=${page}`, { token });
    // Paginatsiyasiz (oddiy massiv) javob — bitta sahifa, shu yerda tugaydi.
    if (Array.isArray(res)) { all.push(...res); break; }
    const rows = (res && Array.isArray(res.results)) ? res.results : [];
    all.push(...rows);
    if (!res || !res.next || rows.length === 0) break;
  }
  return all;
};

class ApiError extends Error {
  constructor(message, { status, data } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status || 0;
    this.data = data || null;
  }
}

const extractErrorMessage = (data) => {
  if (!data) return '';
  if (typeof data === 'string') {
    // Non-JSON javob (masalan Django'ning production HTML 500 sahifasi — DRF
    // faqat APIException'larni JSON qiladi, xom istisno esa HTML sahifaga
    // aylanadi) — bu matnni HECH QACHON foydalanuvchiga ko'rsatmaymiz. Aks
    // holda butun HTML hujjat AI yordam widjetida yoki xato bannerida xom
    // holda chiqib ketardi. HTML ko'rinsa bo'sh qaytaramiz — chaqiruvchi
    // o'zining umumiy ("Server xatosi" kabi) xabariga tushadi.
    const trimmed = data.trim().toLowerCase();
    if (trimmed.startsWith('<!doctype') || trimmed.startsWith('<html') || trimmed.includes('<html')) {
      return '';
    }
    return data;
  }
  if (typeof data.detail === 'string') return data.detail;
  const firstKey = Object.keys(data)[0];
  const value = firstKey ? data[firstKey] : null;
  if (Array.isArray(value)) return value[0] || '';
  if (typeof value === 'string') return value;
  return '';
};

const toUserMessage = (error) => {
  const text = `${error?.message || ''} ${extractErrorMessage(error?.data)}`.toLowerCase();
  if (text.includes("avval ro'yxatdan") || text.includes("avval ro‘yxatdan")) {
    return "Bu telefon raqam avval ro‘yxatdan o‘tgan";
  }
  if (text.includes('otp expired')) {
    return 'Tasdiqlash kodi muddati tugagan';
  }
  if (text.includes("otp noto") || text.includes('wrong otp') || text.includes('invalid otp')) {
    return "Kod noto‘g‘ri kiritildi";
  }
  if (text.includes('session expired') || text.includes('token not valid')
    || text.includes('token is invalid') || text.includes('token is expired')
    || text.includes('authentication credentials')) {
    return "Sessiya muddati tugadi. Iltimos, qayta kiring.";
  }
  // 429 (rate-limit). DRF xom xabari ("Request was throttled. Expected
  // available in N seconds") HECH QACHON foydalanuvchiga ko'rinmasin — status
  // yoki xabar matni bo'yicha aniqlab, xushmuomala umumiy xabar qaytaramiz.
  if (error?.status === 429 || text.includes('throttled') || text.includes('expected available in')) {
    return "So'rovlar soni vaqtincha chegaralandi. Biroz kutib, qayta urinib ko'ring.";
  }
  if (!error?.status) {
    return "Server bilan bog‘lanishda xatolik yuz berdi";
  }
  return error?.message || "Server bilan bog‘lanishda xatolik yuz berdi";
};

// ─── AI Support avtomatik trigger ────────────────────────────────────────────
// Server ichki xatosi (5xx) yoki tarmoq xatosi (status 0, ataylab abort emas)
// yuz berganda AI yordam widjetini avtomatik ochish uchun umumiy
// `olympy:support_needed` eventini dispatch qilamiz. Widget
// (pages/AISupportWidget.jsx) shu eventni tinglaydi va o'zini ko'rsatadi.
//
// Throttle (15s): dashboard bir vaqtning o'zida bir nechta endpointni parallel
// chaqiradi — server o'chgan bo'lsa ularning hammasi ketma-ket qulaydi. Har
// biriga alohida event yuborsak widget qayta-qayta ochilib foydalanuvchini
// bezovta qiladi. Shu sababli oynani qisqa muddat ichida faqat bir marta
// ochamiz.
let _lastSupportDispatchAt = 0;
const dispatchSupportNeeded = (reason, message) => {
  try {
    if (typeof window === 'undefined') return;
    const now = Date.now();
    if (now - _lastSupportDispatchAt < 15000) return;
    _lastSupportDispatchAt = now;
    window.dispatchEvent(new CustomEvent('olympy:support_needed', {
      detail: { reason: reason || 'api_error', message: message || '' },
    }));
  } catch {}
};

// ─── Token refresh "single-flight" ──────────────────────────────────────────
// Parallel so'rovlar bir vaqtda 401 olsa, har biri alohida refresh chaqirardi.
// Birinchi refresh tokenni rotate qilib eski refresh tokenni blacklist qiladi,
// qolgan refresh'lar esa blacklisted token bilan muvaffaqiyatsiz bo'lib,
// foydalanuvchi logout bo'lardi. Yechim: bitta shared in-flight Promise —
// barcha 401 olgan so'rovlar bitta refresh natijasini kutadi.
let _refreshInFlight = null;

// ─── Olimpiada rejimi bayrog'i ───────────────────────────────────────────────
// Ilgari faqat `/attempts/` yozuv endpointlari (submit/ping/cheating) 401'da
// majburiy global logout'dan himoyalangan edi. Lekin test paytida OlympiadTest
// yana boshqa endpoint'larni ham chaqiradi — savol yuklash (getOlympiadQuestions),
// kod ishga tushirish/tekshirish (runCode, reviewCode). Ular `/attempts/` ostida
// emas, shuning uchun ular 401 qaytarsa (masalan uzoq test davomida access token
// muddati tugab, silent refresh muvaffaqiyatsiz bo'lsa — masalan Telegram
// WebApp/iOS Safari'da cross-site cookie yo'qolgan holatda) butun ilova majburan
// logout qilib, foydalanuvchini test sahifasidan bosh sahifaga otib yuborardi —
// aynan shu "musobaqa paytida o'zidan-o'zi chiqib ketish" bug'i shu yerdan kelib
// chiqadi. OlympiadTest komponenti faol test davomida `setExamMode(true)`
// chaqiradi (yakunlanganda/unmount'da false) — shu bayroq true bo'lganda HECH
// QANDAY so'rov global logout'ni trigger qilmaydi, xatolik faqat chaqiruvchi
// komponentga (mahalliy holatda) qaytariladi.
let _examModeActive = false;
const setExamMode = (active) => { _examModeActive = !!active; };

const _refreshTokens = () => {
  if (_refreshInFlight) return _refreshInFlight;
  const refresh = _readAuth(AUTH_REFRESH_KEY);
  _refreshInFlight = (async () => {
    const refreshed = await request('/api/auth/token/refresh/', {
      method: 'POST',
      body: refresh ? { refresh } : undefined,
      retryOnAuth: false,
    });
    const nextToken = refreshed?.access || refreshed?.token || null;
    const nextRefresh = refreshed?.refresh || refresh || null;
    if (nextToken && ALLOW_TOKEN_STORAGE) {
      _writeAuth(AUTH_TOKEN_KEY, nextToken);
      if (nextRefresh) _writeAuth(AUTH_REFRESH_KEY, nextRefresh);
      return { token: nextToken };
    }
    if (refreshed?.cookie_auth || nextToken) {
      // Cookie-only yoki token storage o'chiq — Bearer fallback tozalanadi.
      _removeAuth(AUTH_TOKEN_KEY);
      _removeAuth(AUTH_REFRESH_KEY);
      return { token: null };
    }
    throw new ApiError('Refresh failed', { status: 401 });
  })().finally(() => {
    _refreshInFlight = null;
  });
  return _refreshInFlight;
};

// ─── Tarmoq xatosida qisqa qayta urinish ────────────────────────────────────
// Mobil internetda bir lahzalik uzilish (DNS xatosi, connection reset, tunnel
// almashuvi) juda tez-tez uchraydi. Ilgari `fetch()` ning BIRINCHI qulashida
// darhol `support_needed` eventi yuborilib AI yordam widjeti ochilardi — aynan
// shu sababli widjet ishlab turgan serverda ham "o'zidan-o'zi ochiladigan oyna"
// bo'lib ko'rinardi, holbuki xuddi shu so'rov bir soniyadan keyin muammosiz
// ketardi. Endi so'rovni qisqa backoff bilan yana 2 marta (jami 3 urinish)
// takrorlaymiz va faqat hammasi qulagandan keyingina buni haqiqiy tarmoq
// xatosi deb hisoblaymiz.
//
// MUHIM chegara: bu faqat `fetch()` ning O'ZI exception tashlagan holat uchun.
// Serverdan javob KELGAN holatlar (4xx/5xx) va 401 dan keyingi
// refresh-retry — pastdagi butunlay alohida oqim, ular bu yerdan
// ta'sirlanmaydi.
const NETWORK_RETRY_DELAYS_MS = [600, 1200];

// Backoff kutuvi abort'ni darhol sezishi kerak: aks holda unmount bo'lgan
// komponent so'rovni bekor qilsa ham loop 1.2s "osilib" turardi.
const _waitBeforeNetworkRetry = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) {
    reject(new ApiError('aborted', { status: 0 }));
    return;
  }
  const timer = setTimeout(resolve, ms);
  if (signal) {
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new ApiError('aborted', { status: 0 }));
    }, { once: true });
  }
});

const request = async (
  path,
  { method = 'GET', body, token, headers = {}, retryOnAuth = true, keepalive = false, signal, silent = false } = {},
) => {
  const requestHeaders = {
    Accept: 'application/json',
    ...headers,
  };
  // Cookie-less muhitda backend tokenlarni body'da qaytarsin.
  if (ALLOW_TOKEN_STORAGE && !requestHeaders['X-Olympy-Auth-Storage']) {
    requestHeaders['X-Olympy-Auth-Storage'] = '1';
  }
  // FormData / multipart bodies must be sent with the browser-supplied
  // multipart boundary; do not set Content-Type and do not stringify.
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !isFormData) requestHeaders['Content-Type'] = 'application/json';
  // Impersonatsiya faol bo'lsa token AYNAN shu: chaqiruvchi o'zi token uzatgan
  // bo'lsa ham (ko'p joyda `OlympyApi.getToken()`) impersonatsiya tokeni ustun
  // turadi. Aks holda dev rejimda (Bearer storage yoqilgan) ekranda
  // foydalanuvchi ko'rinib, so'rovlar admin nomidan ketardi.
  const impersonation = _readImpersonation();
  const activeToken = (impersonation && impersonation.token) || token || _readAuth(AUTH_TOKEN_KEY);
  if (activeToken) requestHeaders.Authorization = `Bearer ${activeToken}`;

  // Body bir marta tayyorlanadi: qayta urinishlarda ham AYNAN shu qiymat
  // yuboriladi (string qayta ishlatilaveradi, FormData esa fetch tomonidan
  // "iste'mol qilinmaydi" — har safar qaytadan serializatsiya bo'ladi).
  const requestBody = body === undefined
    ? undefined
    : (isFormData ? body : JSON.stringify(body));

  // `keepalive` so'rovlari (masalan sahifa yopilayotganda ketadigan cheating
  // report) qayta urinilmaydi: unload paytida setTimeout ishga tushmaydi, va
  // takroriy yuborish serverda dublikat yozuv qoldirishi mumkin.
  const maxNetworkRetries = keepalive ? 0 : NETWORK_RETRY_DELAYS_MS.length;

  let response;
  for (let attempt = 0; ; attempt += 1) {
    try {
      response = await fetch(`${API_BASE_URL}${path}`, {
        method,
        headers: requestHeaders,
        credentials: 'include',
        keepalive,
        signal,
        body: requestBody,
      });
      break;
    } catch (error) {
      // AbortController.abort() — chaqiruvchi (masalan, unmount bo'lgan komponent)
      // so'rovni atayin bekor qilgan. Buni "server bilan bog'lanish xatosi" deb
      // ko'rsatmaymiz va HECH QACHON qayta urinmaymiz; chaqiruvchi catch'da
      // abort'ni jimgina yutadi.
      if (error?.name === 'AbortError' || signal?.aborted) {
        throw new ApiError('aborted', { status: 0 });
      }
      // Bir lahzalik uzilish bo'lishi mumkin — qisqa backoff bilan yana
      // urinamiz (yuqoridagi izohga qarang). Kutish paytida so'rov bekor
      // qilinsa `_waitBeforeNetworkRetry` abort xatosini otadi.
      if (attempt < maxNetworkRetries) {
        await _waitBeforeNetworkRetry(NETWORK_RETRY_DELAYS_MS[attempt], signal);
        continue;
      }
      // Barcha urinishlar tugadi — haqiqiy tarmoq xatosi (internet yo'q /
      // server o'chiq / timeout). AI yordam widjetini avtomatik ochamiz.
      // `silent` so'rovlar (masalan AI widjetning o'z fon tarixi preload'i)
      // buni triggerlamaydi — aks holda widjet o'zining fon so'rovi qulasa
      // o'zini-o'zi ochib, foydalanuvchini (ayniqsa ro'yxatdan o'tgach
      // navbatdagi so'rovlar to'lqinida server hali "uyg'onmagan" paytda)
      // bejiz bezovta qilardi.
      if (!silent) {
        dispatchSupportNeeded('network_error', "Server bilan bog‘lanishda xatolik yuz berdi");
      }
      throw new ApiError("Server bilan bog‘lanishda xatolik yuz berdi", { status: 0 });
    }
  }

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    if (response.status === 401) {
      // Impersonatsiya tokeni tugagan yoki "Admin panelga qaytish" orqali
      // bekor qilingan. Odatdagi refresh oqimiga TUSHMASLIK shart: refresh
      // cookie ADMINNIKI — u yangilansa ilova jimgina admin huquqiga qaytib,
      // ekranda esa hamon foydalanuvchi ko'rinib turardi. Impersonatsiyani
      // tozalab ilovaga xabar beramiz; adminning o'z seansi buzilmaydi.
      if (impersonation) {
        _writeImpersonation(null);
        _clearCachedUser();
        _clearSwApiCache();
        _realtimeToken = null;
        try { window.dispatchEvent(new CustomEvent('olympy:impersonation_ended')); } catch {}
        throw new ApiError("Ko'rish seansi tugadi", { status: 401, data });
      }
      if (retryOnAuth) {
        try {
          // Single-flight: parallel 401'lar bitta refresh natijasini kutadi.
          const { token: nextToken } = await _refreshTokens();
          return request(path, {
            method,
            body,
            token: nextToken || null,
            headers,
            retryOnAuth: false,
            signal,
          });
        } catch (refreshError) {
          // Refresh so'rovi tarmoq xatosi yoki serverning vaqtincha
          // ishlamayotgani (masalan, Render bepul hosting cold-start,
          // 30-60s) tufayli muvaffaqiyatsiz bo'lgan bo'lishi mumkin — bu
          // refresh token'ning haqiqatan yaroqsiz ekanini bildirmaydi.
          // Faqat backend aniq 401/400 bilan "refresh yaroqsiz" desa
          // logout qilamiz; aks holda tokenlarni saqlab qolamiz, keyingi
          // urinishda (server uyg'ongach) sessiya tiklanadi.
          const isDefinitiveAuthFailure = refreshError?.status === 401 || refreshError?.status === 400;
          if (!isDefinitiveAuthFailure) {
            throw new ApiError('Session expired', {
              status: 401,
              data: { code: 'refresh_unavailable' },
            });
          }
        }
      }
      // retryOnAuth=false bo'lsa (login, register kabi public endpoint'lar):
      // logout qilmaymiz, serverdan kelgan xato xabarini ko'rsatamiz.
      if (!retryOnAuth) {
        throw new ApiError(extractErrorMessage(data) || "Telefon yoki parol noto'g'ri", { status: 401, data });
      }
      // Submit/cheating endpoint'lari uchun MAJBURIY logout qilmaymiz —
      // foydalanuvchi olimpiada vaqtida tasodifan hisobdan chiqarilmasin
      // va javoblari yo'qolmasin. Submit'da token muddati tugagan bo'lsa
      // frontend dialog ko'rsatib qayta login so'raydi. `_examModeActive` —
      // OlympiadTest faol bo'lganda BARCHA so'rovlar (savol yuklash, kod
      // ishga tushirish/tekshirish ham) shu himoyani oladi, faqat
      // `/attempts/` yozuvlari emas (yuqoridagi izohga qarang).
      const isExamWritePath = (
        path.includes('/attempts/')
        || path.startsWith('/api/attempts')
        || _examModeActive
      );
      if (isExamWritePath) {
        throw new ApiError('Session expired', {
          status: 401,
          data: { ...(typeof data === 'object' && data ? data : {}), code: 'session_expired' },
        });
      }
      // Autentifikatsiyali so'rovda token muddati tugagan — auth tozalanadi.
      _removeAuth(AUTH_TOKEN_KEY);
      _removeAuth(AUTH_REFRESH_KEY);
      _clearCachedUser();
      _clearSwApiCache();
      try { window.dispatchEvent(new CustomEvent('olympy:logout')); } catch {}
      throw new ApiError('Session expired', { status: 401, data });
    }
    // Server ichki xatosi (5xx) — AI yordam widjetini avtomatik ochamiz. 4xx
    // (validatsiya / ruxsat / topilmadi) oddiy holatlar, ular uchun ochmaymiz.
    if (response.status >= 500 && !silent) {
      dispatchSupportNeeded('api_error', extractErrorMessage(data) || response.statusText || 'Server xatosi');
    }
    throw new ApiError(extractErrorMessage(data) || response.statusText, {
      status: response.status,
      data,
    });
  }
  return data;
};

// Higher index wins. Used to pick activeRole when a user has multiple
// roles approved at the same time. admin > owner > manager > teacher > student.
const ROLE_PRIORITY = ['student', 'teacher', 'manager', 'owner', 'admin'];

const mapRoleCenter = (center) => ({
  membershipId: center.membership_id ?? center.membershipId ?? null,
  status: center.status || 'pending',
  centerId: center.centerId ?? center.center_id ?? null,
  centerName: center.centerName || center.center_name || center.name || '',
  organizationType: center.organizationType || center.organization_type || "O'quv markaz",
  country: center.country || "O'zbekiston",
  region: center.region || '',
  district: center.district || '',
  city: center.city || center.district || center.region || '',
  imageUrl: makeAssetUrl(center.image_url || center.imageUrl || ''),
  subject: center.subject || '',
  createdAt: center.created_at || center.createdAt || '',
});

const mapBackendUser = (user) => {
  const detail = user?.roles_detail && typeof user.roles_detail === 'object'
    ? user.roles_detail
    : null;
  const roles = {};
  const backendRoles = Array.isArray(user?.roles) ? user.roles : [];
  backendRoles.forEach(role => {
    roles[role] = { status: 'approved', centerId: null, centerName: '', subject: '' };
  });
  if (detail) {
    // Membership detail overrides plain roles when a center approval state exists.
    Object.keys(detail).forEach(role => {
      const entry = detail[role] || {};
      const cid = entry.centerId ?? entry.center_id;
      const centers = Array.isArray(entry.centers)
        ? entry.centers.map(mapRoleCenter)
        : [];
      roles[role] = {
        status: entry.status || 'pending',
        centerId: cid != null ? String(cid) : null,
        centerName: entry.centerName || entry.center_name || '',
        subject: entry.subject || '',
        centers: centers.map(center => ({
          ...center,
          centerId: center.centerId != null ? String(center.centerId) : null,
        })),
      };
    });
  }
  // Platform admin is system-wide; surface it independently of detail.
  if (user?.is_platform_admin) {
    roles.admin = { status: 'approved', centerId: null, centerName: '', subject: '' };
  }
  const pickActive = (status) => {
    const candidates = Object.keys(roles).filter(r => roles[r]?.status === status);
    if (!candidates.length) return null;
    candidates.sort((a, b) => ROLE_PRIORITY.indexOf(b) - ROLE_PRIORITY.indexOf(a));
    return candidates[0];
  };
  // Approved always wins over pending; fall back to pending only if no
  // approved role exists (so a student with both approved + pending lands
  // on the approved dashboard, not pending-home).
  const activeRole = pickActive('approved') || pickActive('pending') || pickActive('rejected') || null;
  return {
    id: `api:${user.id}`,
    backendId: user.id,
    name: user.full_name || user.name || 'Foydalanuvchi',
    firstName: user.first_name || user.firstName || '',
    lastName: user.last_name || user.lastName || '',
    username: user.username || '',
    phone: user.normalized_phone || user.phone,
    // Email — ixtiyoriy tiklash kanali. `emailVerified` tasdiqlanganini
    // bildiradi (email mavjud bo'lib, tasdiqlanmagan bo'lishi mumkin).
    email: user.email || '',
    emailVerified: !!user.email_verified,
    avatarUrl: makeAssetUrl(user.avatar_url || user.avatarUrl || ''),
    password: '',
    roles,
    activeRole,
    joined: (user.created_at || '').slice(0, 10),
    isPlatformAdmin: !!user.is_platform_admin,
    // is_premium_active — admin/obuna premiumi YOKI hali amal qiluvchi 1 oylik
    // sinov muddatini hisobga oladi (backend property). Eski klientlar uchun
    // is_premium flag'iga fallback (sinov paytida u ham True bo'ladi).
    isPremium: !!(user.is_premium_active ?? user.is_premium),
    currentPlanName: user.current_plan_name || null,
    // O'quvchi tarifi — backend hisoblaydi (billing.services.resolve_student_tier).
    // Uni plan NOMIDAN chiqarib bo'lmaydi: tashkilot (markaz) planlari o'quvchi
    // planlari bilan bir xil nomlanadi ("Pro (1 yil)"), lekin o'quvchi tarifini
    // bermaydi. Eski backend bu maydonni yubormasa null — shared.jsx eski
    // nom-asosidagi mantiqqa qaytadi.
    studentTier: user.student_tier || null,
    premiumTrialEnd: user.premium_trial_end || null,
    isActive: user.is_active !== false,
    telegramLinked: !!user.telegram_linked,
    totpEnabled: !!user.totp_enabled,
    streakCount: user.streak_count || 0,
    lastActiveDate: user.last_active_date || null,
    badges: user.badges || [],
    // Retention onboarding (OB1). Eski foydalanuvchilarda maydon yo'q bo'lsa
    // (undefined) wizard'ni ko'rsatmaslik uchun default true — faqat backend
    // aniq `false` qaytarganda wizard ochiladi.
    onboardingCompleted: user.onboarding_completed !== false,
    // B2B owner onboarding (Feature #1). Backend har doim boolean qaytaradi;
    // eski javobda maydon bo'lmasa (undefined) modal ochilmasligi uchun
    // OwnerDashboard aniq `=== false` tekshiradi.
    onboardingCenterCompleted: user.onboarding_center_completed,
    // Manager va o'qituvchi onboarding bannerlari (yengil orientatsiya). Backend
    // har doim boolean qaytaradi; eski javobda maydon bo'lmasa (undefined) banner
    // ochilmasligi uchun dashboardlar aniq `=== false` tekshiradi.
    onboardingManagerCompleted: user.onboarding_manager_completed,
    onboardingTeacherCompleted: user.onboarding_teacher_completed,
    // Tanga balansi (referral/mukofotlar uchun). Serializer qaytarmasa 0.
    coins: typeof user.coins === 'number' ? user.coins : 0,
    onboardingGrade: user.onboarding_grade || null,
    onboardingSubjects: Array.isArray(user.onboarding_subjects) ? user.onboarding_subjects : [],
    onboardingGoal: user.onboarding_goal || null,
    // Adaptiv daraja tizimi: {fan: daraja} va {fan: {streak, direction}}.
    subjectLevels: user.subject_levels || {},
    levelStreak: user.level_streak || {},
    _api: true,
  };
};

const saveAuth = ({ token, refresh, user, cookieAuth, persistent } = {}) => {
  // persistent === false — login formada "Meni eslab qolish" tasdiqlanmagan:
  // token va user faqat sessionStorage'da yashaydi, brauzer yopilganda
  // tozalanadi. persistent === true — localStorage. persistent berilmagan
  // (undefined) chaqiruvlarda aktiv store'ga TEGILMAYDI: u modul yuklanganda
  // haqiqiy token qaysi storage'da ekaniga qarab to'g'ri o'rnatilgan va
  // oldingi aniq persistent chaqiruvlari orqali saqlanib qolgan. Aks holda
  // bootstrap'dagi persistentsiz saveAuth chaqiruvi localStorage'dagi
  // tokenni "yetim" qoldirib, keyingi yozuvlarni sessionStorage'ga burardi.
  if (persistent === false && _sessionStore) {
    _setActiveStore(_sessionStore);
  } else if (persistent === true && _localStore) {
    _setActiveStore(_localStore);
  }
  // Tokenlar body'da kelganda (dev yoki cookie-less) storage'ga yozamiz.
  // Production cookie-only: backend token qaytarmaydi — storage yozilmaydi.
  if (token && ALLOW_TOKEN_STORAGE) {
    _writeAuth(AUTH_TOKEN_KEY, token);
  }
  if (refresh && ALLOW_TOKEN_STORAGE) {
    _writeAuth(AUTH_REFRESH_KEY, refresh);
  }
  // Cookie-only auth javobi (token body'da yo'q) — eski Bearer nusxasini tozalaymiz.
  if (cookieAuth && !token && !ALLOW_TOKEN_STORAGE) {
    _removeAuth(AUTH_TOKEN_KEY);
    _removeAuth(AUTH_REFRESH_KEY);
  }
  // Migratsiya: eski versiyalar user obyektini 'olympy_api_user' kalitida
  // storage'ga yozardi. Endi storage'da saqlamaymiz — qolib ketgan stale
  // qiymatni bir martalik tozalaymiz, aks holda u keraksiz holda turaveradi.
  _removeAuth('olympy_api_user');
  // User obyekti in-memory + sessionStorage'da keshlanadi (CURRENT_USER_KEY).
  // `user` undefined bo'lsa joriy qiymat saqlanib qoladi (faqat token yangilash
  // chaqiruvlarida user'siz saveAuth ishlatiladi) — keshga tegmaymiz.
  if (user !== undefined) _writeCachedUser(user || null);
};

const loadAuth = () => {
  // Avval in-memory, bo'lmasa sessionStorage keshidan o'qiymiz (sahifa
  // yangilangach in-memory yo'qoladi, lekin kesh saqlanib qoladi).
  const user = _readCachedUser();
  if (!user) return null;
  return { token: _readAuth(AUTH_TOKEN_KEY), refresh: _readAuth(AUTH_REFRESH_KEY), user };
};

// Service worker'dagi API keshini tozalash — logout'dan keyin eski
// foydalanuvchining keshlangan javoblari (oflayn rejimda) keyingi
// foydalanuvchiga ko'rinmasligi uchun (public/sw.js'dagi CLEAR_API_CACHE).
const _clearSwApiCache = () => {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_API_CACHE' });
  } catch {}
};

const clearAuth = async () => {
  _removeAuth(AUTH_TOKEN_KEY);
  _removeAuth(AUTH_REFRESH_KEY);
  // Impersonatsiya tokeni ham ketadi — aks holda chiqib qaytadan kirgan
  // admin (yoki shu tabda kirgan boshqa odam) hamon o'sha foydalanuvchi
  // sifatida so'rov yuborardi.
  _writeImpersonation(null);
  _clearCachedUser();
  _clearSwApiCache();
  // Jonli xizmat tokeni keshi ham tozalanadi — aks holda bir tabda boshqa
  // foydalanuvchi kirsa oldingi hisobning tokeni bilan xonaga ulanib qolardi.
  _realtimeToken = null;
  // await — logout so'rovi tugashini kutamiz, aks holda refresh token
  // server tomonda blacklist'ga tushmasdan qolib ketishi mumkin (fetch
  // boshlanmasdan sahifa o'zgarsa). Chaqiruvchilar natijani kutmaydi.
  try { await request('/api/auth/logout/', { method: 'POST', retryOnAuth: false }); } catch {}
};

// Impersonatsiya faol bo'lsa uning tokeni qaytadi: `request()`dan tashqarida
// to'g'ridan-to'g'ri `fetch` qiladigan joylar (fayl yuklab olishlar, jonli
// xizmat) ham AYNAN o'sha foydalanuvchi sifatida ishlashi kerak.
const getToken = () => {
  const impersonation = _readImpersonation();
  return (impersonation && impersonation.token) || _readAuth(AUTH_TOKEN_KEY);
};

// ─── Jonli viktorina (Java real-time xizmat) ─────────────────────────────────
// Bu chaqiruvlar Django emas, Java xizmatga (REALTIME_BASE_URL) ketadi, shuning
// uchun umumiy `request()` (Django JWT/cookie oqimi) o'rniga to'g'ridan-to'g'ri
// `fetch` ishlatiladi. Java xizmat JWT'ni o'zi tekshirmaydi — token'ni
// Django'ning introspection endpoint'iga uzatadi (source of truth).

// XOM JWT olish. Bu yerda `getToken()` YETARLI EMAS: production'da token
// storage'ga umuman yozilmaydi (ALLOW_TOKEN_STORAGE=false, JWT faqat HttpOnly
// cookie'da), shuning uchun getToken() null qaytarardi va Java xizmat
// "Invalid token" (401) berardi — jonli viktorina xonasi yaratilmasdi.
// Cookie'ni esa boshqa origin'dagi Java xizmatga yuborib bo'lmaydi, token
// body/query orqali ketishi shart. Yechim: Django'dan (cookie bilan
// autentifikatsiya qilingan holda) qisqa muddatli access token so'raymiz.
// Muddati tugagunicha keshlaymiz — har WebSocket ulanishida qayta so'ralmasin.
let _realtimeToken = null; // { value, expiresAt }
// Parallel chaqiruvlar shu bitta so'rovni kutadi (pastdagi single-flight).
let _realtimeTokenInflight = null;
// Muddat tugashidan 30s oldin yangilaymiz (soat farqi / tarmoq kechikishi).
const REALTIME_TOKEN_SKEW_MS = 30000;
// `expires_in` kelmasa ishlatiladigan zaxira muddat. Avval bunda
// `expiresAt = now` chiqib, kesh HAR SAFAR eskirgan hisoblanardi — ya'ni har
// bir soket ulanishi Django'ga alohida so'rov yuborardi (30 o'quvchi bir
// vaqtda qo'shilganda aynan shu kerak emas edi).
const REALTIME_TOKEN_FALLBACK_TTL_MS = 120000;

// `force: true` — keshni chetlab o'tib yangi token so'raymiz. Handshake rad
// etilganda shu bilan qayta urinamiz: kesh muddati "tugamagan" bo'lsa ham
// token server tomonda yaroqsiz bo'lishi mumkin (Django restart, chiqib qayta
// kirish), va eski tokenni qayta-qayta ishlatish bir xil xatoga olib borardi.
const getRealtimeToken = async ({ force = false } = {}) => {
  const now = Date.now();
  if (!force && _realtimeToken && _realtimeToken.expiresAt - REALTIME_TOKEN_SKEW_MS > now) {
    return _realtimeToken.value;
  }
  if (force) _realtimeToken = null;
  // Single-flight: bir necha soket bir vaqtda ulansa ham Django'ga bitta
  // so'rov ketadi. (Inflight so'rov aynan hozir olinayotgani uchun `force`
  // bo'lsa ham uni kutish to'g'ri — u allaqachon yangi token.)
  if (!_realtimeTokenInflight) {
    _realtimeTokenInflight = (async () => {
      const data = await request('/api/auth/realtime-token/', { method: 'POST' });
      const value = data?.token || '';
      if (!value) {
        throw new ApiError('Sessiya topilmadi. Tizimga qayta kiring.', { status: 401 });
      }
      const ttlMs = (Number(data?.expires_in) || 0) * 1000 || REALTIME_TOKEN_FALLBACK_TTL_MS;
      _realtimeToken = { value, expiresAt: Date.now() + ttlMs };
      return value;
    })().finally(() => { _realtimeTokenInflight = null; });
  }
  return _realtimeTokenInflight;
};

const createQuizRoom = async ({ title, questions }, token) => {
  const jwt = token || await getRealtimeToken();
  const res = await fetch(`${REALTIME_BASE_URL}/api/quiz/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: jwt, title, questions }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data?.detail || "Xona yaratib bo'lmadi", { status: res.status, data });
  }
  return data; // { roomCode, hostId, title, totalQuestions }
};

// Xona holati probe'i. HECH QACHON throw qilmaydi — chaqiruvchi uchta holatni
// ajrata olishi kerak, chunki ularning har biri o'quvchiga boshqa narsani
// aytadi:
//   unavailable=true → Java xizmatning o'ziga yetib bo'lmadi (o'chgan, qayta
//     deploy bo'lyapti, tarmoq yo'q). DIQQAT: Render/Cloudflare qirrasi
//     qaytargan 502/503 sahifasida CORS sarlavhalari bo'lmaydi, shuning uchun
//     brauzer cross-origin `fetch`ni umuman rad etadi — bu ham shu yerga
//     tushadi.
//   exists=false   → xizmat ishlayapti va "bunday xona yo'q" dedi (404).
//   exists=true    → xona bor.
// Avval xizmat yiqilgan holat ham `exists: false` bo'lib chiqardi va o'quvchiga
// "Bunday xona topilmadi. Kodni tekshiring." deb ko'rsatilardi — o'quvchi esa
// to'g'ri kodni behuda qayta-qayta terib chiqardi.
const getQuizRoom = async (roomCode) => {
  let res;
  try {
    res = await fetch(`${REALTIME_BASE_URL}/api/quiz/rooms/${encodeURIComponent(roomCode)}`);
  } catch {
    return { ok: false, status: 0, unavailable: true };
  }
  const data = await res.json().catch(() => ({}));
  // 404 — Java xizmatning aniq javobi ("xona yo'q"). Qolgan xato statuslar
  // (502/503/500...) xizmatning o'zi ishlamayotganini bildiradi.
  if (!res.ok && res.status !== 404) {
    return { ok: false, status: res.status, unavailable: true };
  }
  return { ok: res.ok, status: res.status, ...data }; // { ok, exists, title, started, finished }
};

// WebSocket URL quruvchi. role='host'|'student'. Token query param orqali
// yuboriladi (Java handshake interceptor uni Django'ga tekshirtiradi) — duel
// oqimidagi bilan bir xil yondashuv. `createQuizRoom` bilan bir xil sababga
// ko'ra async: xom JWT Django'dan olinadi (odatda keshdan, tarmoqsiz).
// `avatar` — o'quvchi kirish ekranida tanlagan emoji (Kahoot'dagi personaj
// o'rnida). `name` bilan bir xil yo'l: handshake query param'i, Java tomon uni
// xona holatiga yozib, host'ga ketadigan ro'yxatlarga qo'shadi.
const quizWsUrl = async ({ roomCode, role = 'student', name = '', avatar = '' }, token) => {
  const jwt = token || await getRealtimeToken();
  const params = new URLSearchParams({ token: jwt, roomCode, role });
  if (name) params.set('name', name);
  if (avatar) params.set('avatar', avatar);
  return `${realtimeWsBase()}/ws/quiz?${params.toString()}`;
};

// ─── Jonli viktorina soketi: heartbeat + avtomatik qayta ulanish ─────────────
// Sahifalar avval `new WebSocket(url)`ni to'g'ridan-to'g'ri ishlatardi. Bu
// uchta real shikoyatning manbasi edi:
//
//  1) LOBBIDA "O'ZIDAN-O'ZI CHIQIB KETISH". Kutish xonasida trafik umuman
//     yo'q — ustoz sinfni yig'guncha bir necha daqiqa o'tadi — va oradagi
//     proksi (Render/CDN) bo'sh turgan WebSocket'ni ~60s dan keyin yopadi.
//     Klientda qayta ulanish yo'q edi, shuning uchun o'quvchi spinner bilan
//     muzlab qolardi va viktorina boshlanganda savol umuman kelmasdi.
//     Yechim: ~25s da bir marta yengil `ping` matni (brauzerdan WebSocket
//     ping FRAME'ini yuborib bo'lmaydi, shuning uchun oddiy xabar) + uzilish
//     bo'lsa avtomatik qayta ulanish. Java xizmat buni allaqachon qo'llaydi:
//     `onStudentConnect` o'quvchini userId bo'yicha topib, ballini saqlab
//     qoladi va kerak bo'lsa joriy savolni qaytadan yuboradi; notanish
//     `type`li xabarlar (bizning `ping`) jimgina e'tiborsiz qoldiriladi.
//
//  2) HAMMA BIR VAQTDA QO'SHILGANDA XATO. Har bir handshake Java tomonda
//     Django introspection javobini kutadi; 30 o'quvchi bir zumda bosganda
//     bir qismi rad etiladi. Bitta urinish o'rniga eksponensial backoff +
//     jitter bilan qayta urinamiz — to'lqin vaqt bo'yicha yoyiladi va
//     o'quvchi qo'lda qayta-qayta bosishi shart emas.
//
//  3) ABADIY "ULANMOQDA...". Handshake osilib qolsa (Java Django javobini
//     kutib turibdi) brauzer na `open`, na `close`, na `error` beradi —
//     tugma cheksiz "Ulanmoqda..." holatida qolardi. Har bir urinishga qat'iy
//     timeout qo'yamiz.
//
// `onStatus(state, reason)` holatlari: 'connecting' | 'open' | 'reconnecting'
// | 'failed'. 'failed' — urinishlar tugadi (reason: 'auth' bo'lsa sessiya
// yaroqsiz, qayta urinishning ma'nosi yo'q).
const QUIZ_WS_CONNECT_TIMEOUT_MS = 12000;
const QUIZ_WS_HEARTBEAT_MS = 25000;
const QUIZ_WS_MAX_ATTEMPTS = 8;

const connectQuizSocket = ({ roomCode, role = 'student', name = '', avatar = '', onMessage, onStatus }) => {
  let socket = null;
  let attempts = 0;
  let disposed = false;
  let sawOpen = false;    // joriy urinishda `open` bo'ldimi
  let openedOnce = false; // umuman bir marta ulandikmi ('connecting' vs 'reconnecting')
  let retryTimer = null;
  let connectTimer = null;
  let heartbeatTimer = null;

  const emit = (state, reason) => { try { onStatus?.(state, reason); } catch {} };

  const stopTimers = () => {
    if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  };

  // Eski soketdan butunlay uzilamiz: handlerlarsiz yopilgan soket endi holatga
  // tegmaydi (avval almashtirilgan soketlar ochiq qolib, keyin `onclose` bilan
  // UI'ni buzardi).
  const detach = (s) => {
    if (!s) return;
    s.onopen = null; s.onmessage = null; s.onerror = null; s.onclose = null;
    try { s.close(); } catch {}
  };

  // `handshakeRejected` — soket umuman ochilmadi. Sabab eskirgan token
  // bo'lishi mumkin, shuning uchun keyingi urinishda uni majburan yangilaymiz.
  const retry = (reason, handshakeRejected) => {
    stopTimers();
    const dead = socket;
    socket = null;
    detach(dead);
    if (disposed) return;
    if (attempts >= QUIZ_WS_MAX_ATTEMPTS) { emit('failed', reason); return; }
    // Backoff + jitter: bitta uzilishdan 30 o'quvchi barobar ta'sirlansa ham
    // hammasi bir zumda qaytib kelib xizmatni yana bo'g'masin.
    const base = Math.min(500 * 2 ** Math.max(0, attempts - 1), 8000);
    const delay = base + Math.random() * Math.min(base, 1000);
    emit(openedOnce ? 'reconnecting' : 'connecting', reason);
    retryTimer = setTimeout(() => { retryTimer = null; start(handshakeRejected); }, delay);
  };

  const start = async (forceFreshToken = false) => {
    if (disposed) return;
    attempts += 1;
    sawOpen = false;
    emit(openedOnce ? 'reconnecting' : 'connecting');

    let url;
    try {
      const jwt = await getRealtimeToken({ force: forceFreshToken });
      url = await quizWsUrl({ roomCode, role, name, avatar }, jwt);
    } catch (e) {
      // Sessiyaning o'zi yaroqsiz — qayta urinish holatni o'zgartirmaydi.
      if (e?.status === 401) { emit('failed', 'auth'); return; }
      retry('token', true);
      return;
    }
    if (disposed) return;

    let s;
    try { s = new WebSocket(url); } catch { retry('open', false); return; }
    socket = s;

    connectTimer = setTimeout(() => {
      connectTimer = null;
      if (socket === s && !sawOpen) retry('timeout', false);
    }, QUIZ_WS_CONNECT_TIMEOUT_MS);

    s.onopen = () => {
      if (socket !== s) return;
      sawOpen = true;
      openedOnce = true;
      attempts = 0;
      if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
      heartbeatTimer = setInterval(() => {
        if (s.readyState === WebSocket.OPEN) { try { s.send('{"type":"ping"}'); } catch {} }
      }, QUIZ_WS_HEARTBEAT_MS);
      emit('open');
    };
    s.onmessage = (evt) => {
      if (socket !== s) return;
      let msg;
      try { msg = JSON.parse(evt.data); } catch { return; }
      try { onMessage?.(msg); } catch {}
    };
    // `error` ortidan doim `close` keladi — qayta ulanish o'sha yerda hal
    // bo'ladi, bu yerda ikki marta ishlamaslik uchun hech narsa qilmaymiz.
    s.onerror = () => {};
    s.onclose = () => {
      if (socket !== s) return;
      retry(sawOpen ? 'dropped' : 'refused', !sawOpen);
    };
  };

  start();

  return {
    // `false` — soket hozir ochiq emas (qayta ulanmoqda). Chaqiruvchi buni
    // foydalanuvchiga aytishi kerak: avval yuborilmagan javob jimgina
    // yo'qolar, o'quvchi esa javobim ketdi deb o'ylardi.
    send: (payload) => {
      if (!socket || socket.readyState !== WebSocket.OPEN) return false;
      try { socket.send(JSON.stringify(payload)); return true; } catch { return false; }
    },
    close: () => {
      disposed = true;
      stopTimers();
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      const dead = socket;
      socket = null;
      detach(dead);
    },
  };
};

export const OlympyApi = {
  API_BASE_URL,
  REALTIME_BASE_URL,
  createQuizRoom,
  getQuizRoom,
  quizWsUrl,
  connectQuizSocket,
  getRealtimeToken,
  ApiError,
  toUserMessage,
  mapBackendUser,
  makeAssetUrl,
  saveAuth,
  loadAuth,
  clearAuth,
  getToken,
  setExamMode,
  // Auth
  login: (payload) => request('/api/auth/login/', { method: 'POST', body: payload, retryOnAuth: false }),
  loginWithGoogle: (payload) => request('/api/auth/google/', { method: 'POST', body: payload, retryOnAuth: false }),
  register: (payload) => request('/api/auth/register/', { method: 'POST', body: payload, retryOnAuth: false }),
  registerOrganization: (payload) => request('/api/auth/register-organization/', { method: 'POST', body: payload, retryOnAuth: false }),
  refreshToken: (refresh) => request('/api/auth/token/refresh/', { method: 'POST', body: refresh ? { refresh } : undefined, retryOnAuth: false }),
  startTelegramVerification: (payload) => request('/api/auth/phone/start-telegram-verification/', { method: 'POST', body: payload, retryOnAuth: false }),
  startPasswordReset: (payload) => request('/api/auth/password-reset/start/', { method: 'POST', body: payload, retryOnAuth: false }),
  confirmPasswordReset: (payload) => request('/api/auth/password-reset/confirm/', { method: 'POST', body: payload, retryOnAuth: false }),
  startTelegramLink: (token) => request('/api/auth/telegram/link/start/', { method: 'POST', token }),
  verifyOtp: (payload) => request('/api/auth/phone/verify-otp/', { method: 'POST', body: payload, retryOnAuth: false }),
  // Email'ni hisobga bog'lash (tiklash kanali, autentifikatsiya emas): start
  // manzilga 6 xonali kod yuboradi, confirm shu kodni tekshirib emailni
  // tasdiqlangan holda yozadi va yangilangan user obyektini qaytaradi.
  startEmailLink: (payload, token) => request('/api/auth/email/link/start/', { method: 'POST', body: payload, token }),
  confirmEmailLink: (payload, token) => request('/api/auth/email/link/confirm/', { method: 'POST', body: payload, token }),
  // TOTP 2FA — autentifikatsiyalangan foydalanuvchi profilda yoqadi/o'chiradi.
  // setup: {uri, secret} qaytaradi; verify: {code} qabul qiladi.
  twoFactorSetup: (token) => request('/api/auth/2fa/setup/', { method: 'POST', token }),
  twoFactorVerify: (code, token) => request('/api/auth/2fa/verify/', { method: 'POST', body: { code }, token }),
  // O'chirish — backend xavfsizlik uchun joriy TOTP kodi yoki parolni talab
  // qiladi (token o'g'irlansa tajovuzkor 2FA'ni o'chira olmasin). credentials
  // = {totp_code} yoki {password}.
  twoFactorDisable: (credentials, token) => request('/api/auth/2fa/disable/', { method: 'POST', body: credentials || {}, token }),
  getMe: async (token) => {
    // Avval sessionStorage keshini ko'ramiz — sahifa yangilangach in-memory
    // _currentUser yo'qoladi, kesh esa darhol qiymat beradi. Keyin serverdan
    // yangilab, javobni keshga yozamiz (kesh faqat UI uchun; ruxsat har doim
    // serverda tekshiriladi). Tarmoq xatosida (401 emas, status 0) keshdagi
    // qiymatni fallback qilamiz, aks holda xatoni qayta otamiz.
    const cached = _readCachedUser();
    try {
      const data = await request('/api/me/', { token });
      _writeCachedUser(data);
      return data;
    } catch (error) {
      if (!error?.status && cached) return cached;
      throw error;
    }
  },
  getActivityLeaderboard: (token) => request('/api/me/activity-leaderboard/', { token }),
  updateProfile: (payload, token) => request('/api/me/', { method: 'PATCH', body: payload, token }),
  changePassword: (payload, token) => request('/api/auth/me/change-password/', { method: 'POST', body: payload, token }),
  uploadMyAvatar: (imageFile, token) => {
    const fd = new FormData();
    fd.append('avatar', imageFile);
    return request('/api/auth/me/avatar/', { method: 'POST', body: fd, token });
  },
  deleteMyAvatar: (token) => {
    return request('/api/auth/me/avatar/', { method: 'DELETE', token });
  },
  // Hisobni soft-delete — parol (va ixtiyoriy 2FA) majburiy.
  // credentials: { password, totp_code? }
  deleteMyAccount: (credentials, token) => {
    return request('/api/auth/me/', {
      method: 'DELETE',
      body: credentials || {},
      token,
      retryOnAuth: false,
    });
  },
  // Soft-deleted hisobni grace ichida tiklash: { phone, password, totp_code? }
  restoreMyAccount: (payload) => request('/api/auth/restore/', {
    method: 'POST',
    body: payload || {},
    retryOnAuth: false,
  }),
  // Centers
  getCenters: () => request('/api/centers/').then(unwrapList),
  getCenterRatings: (params, token) => {
    const qs = params && Object.keys(params).length
      ? '?' + new URLSearchParams(
          Object.entries(params).filter(([, v]) => v != null && v !== '').reduce((a, [k, v]) => (a[k] = String(v), a), {})
        ).toString()
      : '';
    return request(`/api/centers/ratings/${qs}`, { token });
  },
  getMyCenters: (token) => request('/api/centers/mine/', { token }).then(unwrapList),
  registerCenter: (payload, token) => request('/api/centers/', { method: 'POST', body: payload, token }),
  updateCenter: (centerId, payload, token) => request(`/api/centers/${centerId}/`, { method: 'PATCH', body: payload, token }),
  uploadCenterImage: (centerId, imageFile, token) => {
    const fd = new FormData();
    fd.append('image', imageFile);
    return request(`/api/centers/${centerId}/image/`, { method: 'POST', body: fd, token });
  },
  joinCenter: (centerId, payload, token) => request(`/api/centers/${centerId}/join/`, { method: 'POST', body: payload, token }),
  getPendingMemberships: (centerId, role, token) => request(`/api/centers/${centerId}/memberships/pending/${role ? '?role=' + role : ''}`, { token }).then(unwrapList),
  getStaffMemberships: (centerId, role, token) => request(`/api/centers/${centerId}/memberships/staff/${role ? '?role=' + encodeURIComponent(role) : ''}`, { token }).then(unwrapList),
  getStudentMemberships: (centerId, statusFilter, token) => request(`/api/centers/${centerId}/memberships/students/${statusFilter ? '?status=' + encodeURIComponent(statusFilter) : ''}`, { token }).then(unwrapList),
  getStudentDetail: (membershipId, token) => request(`/api/centers/students/${membershipId}/`, { token }),
  createManager: (centerId, payload, token) => request(`/api/centers/${centerId}/managers/create/`, { method: 'POST', body: payload, token }),
  createTeacher: (centerId, payload, token) => request(`/api/centers/${centerId}/teachers/create/`, { method: 'POST', body: payload, token }),
  approveStudent: (centerId, payload, token) => request(`/api/centers/${centerId}/approve-student/`, { method: 'POST', body: payload, token }),
  approveTeacher: (centerId, payload, token) => request(`/api/centers/${centerId}/approve-teacher/`, { method: 'POST', body: payload, token }),
  approveManager: (centerId, payload, token) => request(`/api/centers/${centerId}/approve-manager/`, { method: 'POST', body: payload, token }),
  removeMembership: (centerId, membershipId, token) => request(`/api/centers/${centerId}/memberships/${membershipId}/`, { method: 'DELETE', token }),
  changeMemberRole: (centerId, membershipId, role, token) => request(`/api/centers/${centerId}/members/${membershipId}/change-role/`, { method: 'POST', body: { role }, token }),
  // Backend admin_list_centers 100 tadan sahifalab qaytaradi (LargePageNumberPagination),
  // lekin avval bu yerda unwrapList bilan faqat 1-sahifa olinardi — 100 tadan
  // ortiq tashkilot bo'lsa, qolganlari admin panelida umuman ko'rinmasdi.
  // requestAllPages barcha sahifalarni ketma-ket yig'ib beradi (boshqa admin
  // ro'yxatlarida allaqachon ishlatilgan naqsh).
  getAdminCenters: (statusFilter, token) => requestAllPages(
    `/api/admin/centers/${statusFilter ? '?status=' + statusFilter : ''}`,
    { token, pageSize: 100 },
  ),
  adminApproveCenter: (centerId, token) => request(`/api/admin/centers/${centerId}/approve/`, { method: 'POST', token }),
  adminRejectCenter: (centerId, token) => request(`/api/admin/centers/${centerId}/reject/`, { method: 'POST', token }),
  // Admin users
  // AdminDashboard'da `allUsers` bu ro'yxatga tayanib global statistika
  // (faol/talaba soni, "Foydalanuvchilar" stat karta) va owner/so'rov
  // egasini ID bo'yicha qidiradi — shu sabab bu yerda "faqat 1-sahifa"
  // emas, TO'LIQ ro'yxat kerak (aks holda statistika va qidiruv sahifa
  // ortidagi foydalanuvchilar uchun noto'g'ri/bo'sh chiqib qolardi).
  // Backend ?page= bilan sahifalab qaytaradi (avval shu sabab faqat
  // birinchi sahifa ko'rinardi) — requestAllPages barchasini yig'ib beradi.
  getAdminUsers: async (token) => {
    const results = await requestAllPages('/api/admin/users/', { token, pageSize: 100 });
    return { results, count: results.length, next: null, previous: null };
  },
  // Bitta foydalanuvchining to'liq profili ("Batafsil" oynasi) — ro'yxatdagi
  // qatordan ko'ra yangiroq/to'liqroq ma'lumot (rollar detali, obuna, holat).
  getAdminUserDetail: (userId, token) => request(`/api/admin/users/${userId}/`, { token }),
  // "Batafsil" oynasining to'lovlar/kirish tarixi bloklari — profildan
  // alohida endpointlar (ikkalasi ham uzun bo'lishi mumkin, profil esa
  // ularsiz ham ochilishi kerak). Ikkalasi javobda `user_id` qaytaradi:
  // ketma-ket ochilgan oynalarda eski javob ko'rinib qolmasligi uchun panel
  // shuni tekshiradi.
  getAdminUserBillingHistory: (userId, token) => request(`/api/admin/users/${userId}/billing-history/`, { token }),
  getAdminUserLoginHistory: (userId, token) => request(`/api/admin/users/${userId}/login-history/`, { token }),
  // Bloklash/ochish. Bloklashda `reason` MAJBURIY (backend bo'sh sababni 400
  // bilan rad etadi), `durationDays` esa ixtiyoriy: berilmasa blok doimiy,
  // berilsa (1|7|14|30) o'sha muddatdan keyin avtomatik ochiladi. Ochishda
  // ikkalasi ham yuborilmaydi — backend eski sabab/muddatni o'zi tozalaydi.
  adminSetUserActive: (userId, isActive, { reason, durationDays } = {}, token) => request(
    `/api/admin/users/${userId}/set-active/`,
    {
      method: 'POST',
      body: isActive
        ? { is_active: true }
        : { is_active: false, reason: reason || '', duration_days: durationDays ?? null },
      token,
    },
  ),
  // Ommaviy bloklash/ochish. Sabab/muddat qoidalari bitta foydalanuvchilikdagi
  // bilan bir xil. Javob QISMAN muvaffaqiyat qaytaradi:
  // { succeeded: [id, ...], failed: [{ id, reason }] } — tanlovga admin hisobi
  // yoki o'chirilgan id tushib qolsa ham qolganlari bajariladi, shuning uchun
  // chaqiruvchi `failed` ni tekshirib foydalanuvchiga ko'rsatishi kerak.
  adminBulkSetUserActive: (userIds, isActive, { reason, durationDays } = {}, token) => request(
    '/api/admin/users/bulk-set-active/',
    {
      method: 'POST',
      body: isActive
        ? { user_ids: userIds, is_active: true }
        : { user_ids: userIds, is_active: false, reason: reason || '', duration_days: durationDays ?? null },
      token,
    },
  ),
  // Ommaviy rol almashtirish. `is_platform_admin` ATAYLAB yuborilmaydi —
  // backend ham uni ommaviy amalda qabul qilmaydi (admin huquqini bir yo'la
  // ko'p hisobga tarqatish juda xavfli). Javob shakli yuqoridagi bilan bir xil.
  adminBulkSetUserRoles: (userIds, roles, token) => request(
    '/api/admin/users/bulk-set-roles/',
    { method: 'PATCH', body: { user_ids: userIds, roles: roles || [] }, token },
  ),
  // Foydalanuvchilar ro'yxatini CSV qilib yuklab beradi. `search` ro'yxat
  // endpoint'i bilan BIR XIL filtr — admin ekranda ko'rgan to'plam eksportga
  // tushadi. Yuklash usuli downloadOlympiadResults bilan bir xil (fetch → blob
  // → link.click(), token Authorization header'da). Backend 5000 qatordan
  // ko'pini kesib, `X-Export-Truncated` sarlavhasini qo'yadi — qaytariladigan
  // { truncated } shu haqda paneldagi ogohlantirish uchun.
  downloadAdminUsersCsv: async (search, token) => {
    const qs = search ? `?search=${encodeURIComponent(search)}` : '';
    const res = await fetch(`${API_BASE_URL}/api/admin/users/export/${qs}`, {
      method: 'GET',
      headers: { Authorization: token ? `Bearer ${token}` : '' },
      credentials: 'include',
    });
    if (!res.ok) {
      let msg = "Foydalanuvchilarni eksport qilib bo'lmadi";
      try { const data = await res.json(); if (data?.detail) msg = data.detail; } catch {}
      throw new ApiError(msg, { status: res.status });
    }
    const truncated = res.headers.get('X-Export-Truncated') === '1';
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `olympy-foydalanuvchilar-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { truncated };
  },
  adminToggleUserPremium: (userId, payload, token) => request(`/api/admin/users/${userId}/toggle-premium/`, { method: 'POST', body: payload, token }),
  // Rollarni almashtirish — system-wide rollar (markazsiz) + platform admin
  // flag'i. roles oddiy rollar ro'yxati (student/teacher/manager/owner),
  // is_platform_admin esa admin checkboxidan keladi.
  adminSetUserRoles: (userId, { roles, isPlatformAdmin }, token) => request(`/api/admin/users/${userId}/set-roles/`, { method: 'PATCH', body: { roles: roles || [], is_platform_admin: !!isPlatformAdmin }, token }),
  // Hisobni tiklash (support): ro'yxatdagi telefon raqamini yo'qotgan
  // foydalanuvchi uchun o'z-o'ziga xizmat yo'li yo'q — admin shaxsini tashqi
  // kanal orqali tasdiqlagandan keyin qo'lda tiklaydi.
  // Javobda `new_password` ochiq matnda BIR MARTA keladi — uni saqlamang,
  // loglamang, faqat adminga ko'rsatib, foydalanuvchiga yetkazish uchun.
  adminResetUserPassword: (userId, token) => request(`/api/admin/users/${userId}/reset-password/`, { method: 'POST', token }),
  adminChangeUserPhone: (userId, phone, token) => request(`/api/admin/users/${userId}/change-phone/`, { method: 'POST', body: { phone }, token }),
  // Autentifikator ilovasini yo'qotgan foydalanuvchining 2FA'sini o'chiradi
  // (o'z-o'ziga xizmat yo'li joriy kod yoki parolni talab qiladi — kira
  // olmagan foydalanuvchi uchun yopiq). Foydalanuvchi kirgach qayta yoqadi.
  adminResetUserTotp: (userId, token) => request(`/api/admin/users/${userId}/reset-2fa/`, { method: 'POST', token }),
  // Bloklamasdan barcha qurilmalardagi sessiyalarni yakunlash (token_version
  // bump) — o'g'irlangan qurilma yoki bo'lishilgan hisob uchun yengil chora.
  adminForceLogoutUser: (userId, token) => request(`/api/admin/users/${userId}/force-logout/`, { method: 'POST', token }),
  // ─── Takrorlangan hisoblarni birlashtirish ───
  // SIM kartasini yo'qotgan o'quvchi yangi raqam bilan qayta ro'yxatdan
  // o'tadi — tanga/streak/urinishlar ikkiga bo'linadi. `preview` HECH
  // NARSANI o'zgartirmaydi: nima ko'chishini, nima to'qnashuv sababli
  // o'tkazib yuborilishini (`skip`), nima manbada qolishini (`untouched`)
  // va to'siqlarni (`blockers` / `can_merge`) qaytaradi.
  adminMergeUsersPreview: (sourceId, targetId, token) => request(
    '/api/admin/users/merge/preview/',
    { method: 'POST', body: { source_id: sourceId, target_id: targetId }, token },
  ),
  // Haqiqiy amal — bitta tranzaksiyada. Manba hisob O'CHIRILMAYDI: doimiy
  // bloklanadi ("#N hisobiga birlashtirildi") va qatorlari joyida qoladi.
  adminMergeUsersCommit: (sourceId, targetId, token) => request(
    '/api/admin/users/merge/commit/',
    { method: 'POST', body: { source_id: sourceId, target_id: targetId }, token },
  ),
  // ─── "Foydalanuvchi sifatida ko'rish" (faqat support uchun) ───
  // Boshlash: backend qisqa muddatli (15 daqiqa) tokenni beradi, biz uni
  // sessiya uchun saqlaymiz. Adminning o'z tokeni/cookie'siga TEGILMAYDI —
  // qaytish aynan shunga tayanadi. Har boshlanish backendda audit jurnaliga
  // yoziladi (admin_impersonate_start).
  startImpersonation: async (userId) => {
    const data = await request(`/api/admin/users/${userId}/impersonate/`, { method: 'POST' });
    if (!data || !data.token) throw new ApiError("Ko'rish tokeni olinmadi", { status: 0 });
    _writeImpersonation({
      token: data.token,
      jti: data.jti || '',
      userId: (data.user && data.user.id) || userId,
      name: (data.user && data.user.full_name) || '',
    });
    // Profil keshi hamon ADMINNIKI — tozalamasak banner ostida eski ism/rol
    // ko'rinardi. Jonli xizmat tokeni ham hisobga bog'liq. Service worker
    // keshidagi /api/ javoblari ham adminniki (logout'dagi bilan bir xil
    // sabab: bir hisobning javoblari ikkinchisiga ko'rinmasin).
    _clearCachedUser();
    _clearSwApiCache();
    _realtimeToken = null;
    return data;
  },
  // Yakunlash: avval LOKAL holat tozalanadi — shundan keyingi so'rovlar
  // adminning o'z seansi bilan ketadi va `IsPlatformAdmin` o'tadi. Keyin
  // backendga "end" yoziladi: audit yozuvi + tokenni erta bekor qilish.
  endImpersonation: async () => {
    const info = _readImpersonation();
    _writeImpersonation(null);
    _clearCachedUser();
    _clearSwApiCache();
    _realtimeToken = null;
    if (!info || !info.userId) return null;
    return request(`/api/admin/users/${info.userId}/impersonate/end/`, {
      method: 'POST',
      body: { jti: info.jti || '' },
    });
  },
  // Faol impersonatsiya haqida UI uchun ma'lumot (token qaytarilmaydi).
  getImpersonation: () => {
    const info = _readImpersonation();
    return info ? { userId: info.userId, name: info.name } : null;
  },
  // Audit jurnali ("Amallar tarixi"). Boshqa admin ro'yxatlaridan farqli
  // o'laroq bu yerda requestAllPages ATAYLAB ishlatilmaydi: jurnal cheksiz
  // o'sadi, hammasini bir yo'la tortish brauzerni bog'lab qo'yardi. DRF
  // sahifa obyekti ({results, count, next, previous}) xom holda qaytariladi —
  // panel server tomon paginatsiyani (Oldingisi / Keyingisi) shu bilan yuritadi.
  getAdminAuditLog: ({ page = 1, pageSize = 50, search = '' } = {}, token) => {
    const qs = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (search) qs.set('search', search);
    return request(`/api/admin/audit-log/?${qs.toString()}`, { token });
  },
  // Subjects
  getSubjects: (token) => request('/api/subjects/', { token }),
  createSubject: (name, token) => request('/api/subjects/', { method: 'POST', body: { name }, token }),
  // Olympiads
  // Barcha sahifalar avtomatik yuklanadi — 200+ olimpiada bo'lsa ham
  // to'liq ro'yxat keladi (requestAllPages).
  getOlympiads: (token) => requestAllPages('/api/olympiads/', { token }),
  createOlympiad: (payload, token) => request('/api/olympiads/', { method: 'POST', body: payload, token }),
  // questionIndex berilsa backend faqat o'sha indeksdagi savolni qaytaradi
  // (savollarni bitta-bitta yuklash — cheating-himoya). Berilmasa barcha
  // savollar (eski xulq).
  getOlympiadQuestions: (olympiadId, token, questionIndex) => {
    const qs = (questionIndex !== undefined && questionIndex !== null)
      ? `?q=${encodeURIComponent(questionIndex)}`
      : '';
    return request(`/api/olympiads/${olympiadId}/questions/${qs}`, { token });
  },
  updateOlympiad: (olympiadId, payload, token) => request(`/api/olympiads/${olympiadId}/`, { method: 'PATCH', body: payload, token }),
  deleteOlympiad: (olympiadId, token) => request(`/api/olympiads/${olympiadId}/`, { method: 'DELETE', token }),
  publishOlympiad: (olympiadId, token) => request(`/api/olympiads/${olympiadId}/publish/`, { method: 'POST', token }),
  deactivateOlympiad: (olympiadId, token) => request(`/api/olympiads/${olympiadId}/deactivate/`, { method: 'POST', token }),
  finishOlympiad: (olympiadId, token) => request(`/api/olympiads/${olympiadId}/finish/`, { method: 'POST', token }),
  // Olimpiada statistikasi va natijalar eksporti.
  //
  // Natijalar eksporti uchun ASOSIY funksiya — downloadOlympiadResults
  // (pastroqda). U bitta endpoint (GET /api/olympiads/{id}/export/?format=)
  // orqali csv / xlsx / pdf ni yuklab beradi. Backend: olympiads.views.
  // export_olympiad_results. Ruxsat: user_can_manage_center_event (owner /
  // manager / teacher / platform admin). XLSX/PDF qo'shimcha Plus/Pro obuna
  // talab qiladi (CSV barcha uchun ochiq). OwnerDashboard shu funksiyani
  // ishlatadi (CSV / Excel / PDF tugmalari).
  //
  // exportOlympiadResultsXlsx (eng pastda) — ManagerDashboard'dagi alohida
  // manager endpoint'iga (GET /api/manager/olympiads/{id}/export/) tayanadigan
  // ESKI XLSX funksiyasi. Hali ishlatiladi, shuning uchun saqlangan.
  getOlympiadStats: (olympiadId, token) => request(`/api/olympiads/${olympiadId}/stats/`, { token }),
  exportOlympiadResultsUrl: (olympiadId, format) =>
    `${API_BASE_URL}/api/olympiads/${olympiadId}/export/${format ? `?format=${encodeURIComponent(format)}` : ''}`,
  // Olimpiada natijalarini bitta endpoint orqali tanlangan formatda yuklab
  // beradi: 'csv' | 'xlsx' | 'pdf'. Backend `?format=` ni o'qiydi. fetch →
  // blob → link.click() (token Authorization header bilan, JSON xato bo'lsa
  // serverdagi `detail` ko'rsatiladi — masalan Plus/Pro talab xabari).
  downloadOlympiadResults: async (olympiadId, format, token) => {
    const fmt = (format || 'csv').toLowerCase();
    const res = await fetch(
      `${API_BASE_URL}/api/olympiads/${olympiadId}/export/?format=${encodeURIComponent(fmt)}`,
      {
        method: 'GET',
        headers: { Authorization: token ? `Bearer ${token}` : '' },
        credentials: 'include',
      },
    );
    if (!res.ok) {
      let msg = "Natijalarni eksport qilib bo'lmadi";
      try { const data = await res.json(); if (data?.detail) msg = data.detail; } catch {}
      throw new ApiError(msg, { status: res.status });
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `olympy-results-${olympiadId}.${fmt}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  },
  // Orqaga moslik (CSV) — downloadOlympiadResults'ning csv'li o'rami. Mavjud
  // chaqiruvchilar (OwnerDashboard "CSV" tugmasi) o'zgartirmasdan ishlayveradi.
  exportOlympiadResults: (olympiadId, token) =>
    OlympyApi.downloadOlympiadResults(olympiadId, 'csv', token),
  // Markaz statistikasi (Owner/Manager dashboard).
  getCenterStats: (centerId, token) => request(`/api/centers/${centerId}/stats/`, { token }),
  // Questions
  // Backend savollar ro'yxatini paginatsiya qiladi (LargePageNumberPagination,
  // max 200/page). requestAllPages barcha sahifalarni ketma-ket yuklaydi —
  // markazda 200+ savol bo'lsa ham to'liq ro'yxat keladi.
  // `purpose` ixtiyoriy: 'live_quiz' berilsa faqat shu o'qituvchining shaxsiy
  // jonli viktorina savollari keladi. Berilmasa parametr umuman qo'shilmaydi va
  // backend avvalgidek markazning umumiy (olimpiada) bankini qaytaradi.
  getQuestions: (centerId, token, purpose) => requestAllPages(
    `/api/questions/?center=${centerId}${purpose ? `&purpose=${encodeURIComponent(purpose)}` : ''}`,
    { token },
  ),
  createQuestion: (payload, token) => request('/api/questions/', { method: 'POST', body: payload, token }),
  generateAiQuestions: (payload, token) => request('/api/questions/generate-ai/', { method: 'POST', body: payload, token }),
  // IT (kod) savolini AI bilan baholash — test paytida o'quvchi kodini sinaydi.
  // { question_id, submitted_code, language } → { score (0-100|null), review }.
  reviewCode: (payload, token) => request('/api/questions/code-review/', { method: 'POST', body: payload, token }),
  runCode: async (payload, token, signal) => {
    // `signal` (AbortSignal) ixtiyoriy — chaqiruvchi component unmount bo'lganda
    // polling loop'ini va kutilayotgan fetch'ni bekor qiladi, aks holda loop
    // 30 soniyagacha davom etib, unmount bo'lgan komponentga setState chaqirib
    // (memory leak + React ogohlantirishi) ishlardi.
    const aborted = () => signal && signal.aborted;
    if (aborted()) throw new ApiError('aborted', { status: 0 });
    // 1. Yangi asinxron Celery taskini yaratamiz
    const startRes = await request('/api/questions/run-code/start/', { method: 'POST', body: payload, token, signal });
    const taskId = startRes?.task_id;
    if (!taskId) {
      throw new ApiError(startRes?.detail || "Kodni ishga tushirib bo'lmadi");
    }

    // 2. Natijani keshdan olguncha polling qilamiz (maksimal 30 soniya). Har
    // iteratsiyada abort tekshiramiz va setTimeout'ni signal'ga ulaymiz, shunda
    // unmount darhol sezilib loop to'xtaydi.
    for (let i = 0; i < 30; i++) {
      await new Promise((resolve, reject) => {
        if (aborted()) return reject(new ApiError('aborted', { status: 0 }));
        const t = setTimeout(resolve, 1000);
        if (signal) {
          signal.addEventListener('abort', () => {
            clearTimeout(t);
            reject(new ApiError('aborted', { status: 0 }));
          }, { once: true });
        }
      });
      if (aborted()) throw new ApiError('aborted', { status: 0 });
      const statusRes = await request(`/api/questions/run-code/status/${taskId}/`, { token, signal });
      if (statusRes?.status === 'COMPLETED') {
        return statusRes.result;
      }
      if (statusRes?.status === 'FAILED') {
        throw new ApiError(statusRes?.error || "Kodni ishga tushirishda xatolik yuz berdi");
      }
    }
    throw new ApiError("Kod ishga tushirish vaqti tugadi (Timeout)");
  },
  // Ustoz/menejer uchun olimpiadaning barcha kod javoblari + AI tavsiyalari.
  getCodeSubmissions: (olympiadId, token) => request(`/api/olympiads/${olympiadId}/code-submissions/`, { token }),
  // Essay baholash (teacher/manager): olimpiadaning barcha essay javoblari
  // ro'yxati va bitta javobga ball + izoh saqlash.
  getOlympiadEssayAnswers: (olympiadId, token, onlyUngraded) =>
    request(`/api/manager/olympiads/${olympiadId}/essay-answers/${onlyUngraded ? '?only_ungraded=1' : ''}`, { token }),
  getAttemptEssayAnswers: (attemptId, token) =>
    request(`/api/attempts/${attemptId}/essay-answers/`, { token }),
  // Manager natijalar modalida o'quvchi qatoriga bosilganda: o'sha o'quvchining
  // tadbirdagi har bir savol bo'yicha javobi (to'g'ri/xato bilan).
  getEventUserAnswers: (olympiadId, userId, token) =>
    request(`/api/manager/event-results/${olympiadId}/user/${userId}/`, { token }),
  gradeEssayAnswer: (attemptId, questionId, payload, token) =>
    request(`/api/attempts/${attemptId}/essay-answers/${questionId}/grade/`, { method: 'POST', body: payload, token }),
  extractPdfQuestions: async (pdfFile, payload, token, signal) => {
    // Avval bu chaqiruv sinxron edi va backend Gemini API'ni kutib (15-30 daqiqa)
    // javob qaytarardi. Endi backend Celery task'ni boshlaydi va task_id qaytaradi;
    // bu yerda natija tayyor bo'lguncha polling qilamiz (runCode naqshiga o'xshash).
    const aborted = () => signal && signal.aborted;
    if (aborted()) throw new ApiError('aborted', { status: 0 });
    const fd = new FormData();
    fd.append('pdf', pdfFile);
    Object.keys(payload || {}).forEach(k => {
      const v = payload[k];
      if (v == null) return;
      fd.append(k, String(v));
    });
    const startRes = await request('/api/questions/pdf-preview/', { method: 'POST', body: fd, token, signal });
    const taskId = startRes?.task_id;
    // Orqaga moslik: agar backend (eski versiya) to'g'ridan-to'g'ri natija qaytarsa,
    // task_id bo'lmaydi — o'shani o'zini qaytaramiz.
    if (!taskId) return startRes;

    // PDF tahlil katta bo'lishi mumkin — 5 daqiqagacha (150 × 2s) polling qilamiz.
    for (let i = 0; i < 150; i++) {
      await new Promise((resolve, reject) => {
        if (aborted()) return reject(new ApiError('aborted', { status: 0 }));
        const t = setTimeout(resolve, 2000);
        if (signal) {
          signal.addEventListener('abort', () => {
            clearTimeout(t);
            reject(new ApiError('aborted', { status: 0 }));
          }, { once: true });
        }
      });
      if (aborted()) throw new ApiError('aborted', { status: 0 });
      const statusRes = await request(`/api/questions/pdf-preview/${taskId}/status/`, { token, signal });
      if (statusRes?.status === 'COMPLETED') {
        return statusRes;
      }
      if (statusRes?.status === 'FAILED') {
        throw new ApiError(statusRes?.detail || statusRes?.error || "PDFdan savollarni ajratib bo'lmadi", { status: 503, data: statusRes });
      }
    }
    throw new ApiError("PDF tahlil qilish vaqti tugadi (Timeout)");
  },
  // Word (.docx) matnidan AI yordamida savol ajratish. extractPdfQuestions bilan
  // bir xil oqim (Celery task → status polling); backend kesh kaliti PDF bilan
  // bir xil bo'lgani uchun status mavjud pdf-preview/<task_id>/status/ orqali
  // o'qiladi. Farqi: .docx fayl `word` form key bilan yuboriladi.
  extractWordAiQuestions: async (wordFile, payload, token, signal) => {
    const aborted = () => signal && signal.aborted;
    if (aborted()) throw new ApiError('aborted', { status: 0 });
    const fd = new FormData();
    fd.append('word', wordFile);
    Object.keys(payload || {}).forEach(k => {
      const v = payload[k];
      if (v == null) return;
      fd.append(k, String(v));
    });
    const startRes = await request('/api/questions/word-ai-preview/', { method: 'POST', body: fd, token, signal });
    const taskId = startRes?.task_id;
    if (!taskId) return startRes;

    for (let i = 0; i < 150; i++) {
      await new Promise((resolve, reject) => {
        if (aborted()) return reject(new ApiError('aborted', { status: 0 }));
        const t = setTimeout(resolve, 2000);
        if (signal) {
          signal.addEventListener('abort', () => {
            clearTimeout(t);
            reject(new ApiError('aborted', { status: 0 }));
          }, { once: true });
        }
      });
      if (aborted()) throw new ApiError('aborted', { status: 0 });
      const statusRes = await request(`/api/questions/pdf-preview/${taskId}/status/`, { token, signal });
      if (statusRes?.status === 'COMPLETED') {
        return statusRes;
      }
      if (statusRes?.status === 'FAILED') {
        throw new ApiError(statusRes?.detail || statusRes?.error || "Word matnidan savollarni ajratib bo'lmadi", { status: 503, data: statusRes });
      }
    }
    throw new ApiError("Word tahlil qilish vaqti tugadi (Timeout)");
  },
  updateQuestion: (questionId, payload, token) => request(`/api/questions/${questionId}/`, { method: 'PATCH', body: payload, token }),
  deleteQuestion: (questionId, token) => request(`/api/questions/${questionId}/`, { method: 'DELETE', token }),
  deleteAllQuestions: (centerId, token, ids) => {
    const url = `/api/questions/delete-all/?center=${centerId}${ids && ids.length ? `&ids=${ids.join(',')}` : ''}`;
    return request(url, { method: 'DELETE', token });
  },
  // Question with image — accepts a File via FormData
  createQuestionMultipart: (payload, imageFile, token) => {
    const fd = new FormData();
    Object.keys(payload || {}).forEach(k => {
      const v = payload[k];
      if (v == null) return;
      fd.append(k, Array.isArray(v) || typeof v === 'object' ? JSON.stringify(v) : String(v));
    });
    if (imageFile) fd.append('image', imageFile);
    return request('/api/questions/', { method: 'POST', body: fd, token });
  },
  // Attempts / results / leaderboard
  submitAttempt: (payload, token) => request('/api/attempts/', { method: 'POST', body: payload, token }),
  reportCheating: (payload, token) => request('/api/attempts/cheating/', { method: 'POST', body: payload, token, keepalive: true, retryOnAuth: false }),
  // Webkamera proktoring rozilik — student imtihonni boshlashdan oldin
  // tasdiqlaydi. Faqat boolean + vaqt tamg'asi yoziladi (video EMAS).
  cameraConsent: (payload, token) => request('/api/attempts/camera-consent/', { method: 'POST', body: payload, token }),
  // Ovoz (mikrofon) proktoring rozilik — kamera roziligidan mustaqil. Faqat
  // boolean + vaqt tamg'asi yoziladi (audio EMAS).
  microphoneConsent: (payload, token) => request('/api/attempts/microphone-consent/', { method: 'POST', body: payload, token }),
  pingTestSession: (olympiadId, answeredCount, tabEscapes, token, deviceId) => request('/api/attempts/ping/', { method: 'POST', body: { olympiad: olympiadId, answered_count: answeredCount, tab_escapes: tabEscapes, device_id: deviceId }, token }),
  // Cheating tekshiruvi bo'yicha menejer/owner qarori: decision 'disqualify'
  // yoki 'continue'. 409 — holat allaqachon hal qilingan (boshqa menejer).
  reviewCheatingCase: (sessionId, decision, token) => request('/api/attempts/cheating/review/', { method: 'POST', body: { session_id: sessionId, decision }, token }),
  getOlympiadLiveProctoring: (olympiadId, token) => request(`/api/manager/olympiads/${olympiadId}/live/`, { token }),
  // Bitta attemptni olib kelish — Leaderboard "Ko'rish" tugmasi va Results
  // sahifasi uchun. Backend olympiad detail'ni ham qo'shib qaytaradi.
  getAttempt: (attemptId, token) => request(`/api/attempts/${attemptId}/`, { token }),
  // Feature 4: insho uchun on-demand chuqur AI tahlili (Plus tarifi).
  getEssayAIFeedback: (attemptId, questionId, token) => request(`/api/attempts/${attemptId}/essay/${questionId}/ai-feedback/`, { token }),
  getMyResults: (token) => request('/api/results/me/', { token }).then(unwrapList),
  getMyStats: (token) => request('/api/results/me/stats/', { token }),
  // Backend shakli: { results: [...], pagination: {...}, header: {...}|null }.
  // Frontend `entries` (qatorlar) va `olympiad` (sarlavha info) kutadi, shu
  // sababli `results` → `entries`, `header` → `olympiad` ga moslashtiramiz va
  // `pagination` ni ham o'tkazamiz. Eski `{ entries }` shakli va to'g'ridan-
  // to'g'ri array fallback ham qo'llab-quvvatlanadi (orqaga moslik).
  getLeaderboard: (olympiadId, token) => request(`/api/leaderboard/${olympiadId ? '?olympiad=' + olympiadId : ''}`, { token })
    .then(res => {
      if (Array.isArray(res)) return { olympiad: null, entries: res, pagination: null };
      if (res && Array.isArray(res.results)) {
        return {
          olympiad: res.header || res.olympiad || null,
          entries: res.results,
          pagination: res.pagination || null,
        };
      }
      if (res && Array.isArray(res.entries)) {
        return {
          olympiad: res.header || res.olympiad || null,
          entries: res.entries,
          pagination: res.pagination || null,
        };
      }
      return { olympiad: null, entries: [], pagination: null };
    }),
  // Bitta olimpiadaning to'liq reytingi — page/page_size bilan (ManagerDashboard
  // "Natijalar → Ko'rish" modali). 200+ ishtirokchi bo'lsa oddiy pagination
  // ishlatiladi. Backend shakli: { results, pagination:{total,has_next,...} }.
  // Qatorlar va pagination'ni xom holda qaytaramiz (chaqiruvchi o'zi ishlatadi).
  getLeaderboardForOlympiad: (olympiadId, page, pageSize, token) =>
    request(
      `/api/leaderboard/?olympiad=${encodeURIComponent(olympiadId)}&page=${page || 1}&page_size=${pageSize || 200}`,
      { token },
    ).then(res => {
      if (Array.isArray(res)) return { entries: res, pagination: null };
      return {
        entries: (res && Array.isArray(res.results)) ? res.results : [],
        pagination: (res && res.pagination) || null,
      };
    }),
  getManagerStats: (centerId, token) => request(`/api/manager/stats/${centerId ? '?center=' + centerId : ''}`, { token }),
  getQuestionDifficultyStats: (centerId, token) => request(`/api/manager/question-difficulty-stats/?center=${centerId}`, { token }),
  getMyMonthlyStats: (months, token) => request(`/api/results/me/monthly/${months ? '?months=' + months : ''}`, { token }),
  // Excel/CSV savol import
  importQuestionsExcel: (centerId, file, token, subject) => {
    const fd = new FormData();
    fd.append('file', file);
    const qs = new URLSearchParams({ center: String(centerId) });
    if (subject) qs.set('subject', String(subject));
    return request(`/api/questions/import/?${qs.toString()}`, { method: 'POST', body: fd, token });
  },
  // Word (.docx) savol import — jadval (table) formatidagi fayl. Backend
  // import_questions_excel bilan bir xil javob shakli: { created, errors, error_count }.
  importQuestionsWord: (centerId, file, token, subject) => {
    const fd = new FormData();
    fd.append('file', file);
    const qs = new URLSearchParams({ center: String(centerId) });
    if (subject) qs.set('subject', String(subject));
    return request(`/api/questions/import-word/?${qs.toString()}`, { method: 'POST', body: fd, token });
  },
  // Word namuna (.docx) shablonini yuklab beradi. Endpoint JWT himoyalangan,
  // shu sababli fetch → blob → link.click() (Authorization header bilan) —
  // downloadOlympiadResults bilan bir xil naqsh.
  downloadWordTemplate: async (token) => {
    const res = await fetch(`${API_BASE_URL}/api/questions/word-template/`, {
      method: 'GET',
      headers: { Authorization: token ? `Bearer ${token}` : '' },
      credentials: 'include',
    });
    if (!res.ok) {
      let msg = "Word namunani yuklab bo'lmadi";
      try { const data = await res.json(); if (data?.detail) msg = data.detail; } catch {}
      throw new ApiError(msg, { status: res.status });
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'olympy-savollar-namuna.docx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  },
  // Practice / Mashq rejimi
  getPracticeSubjects: (centerId, token) => request(`/api/practice/subjects/?center=${centerId}`, { token }),
  startPractice: (body, token) => request('/api/practice/start/', { method: 'POST', body, token }),
  submitPractice: (body, token) => request('/api/practice/submit/', { method: 'POST', body, token }),
  getWrongAnswerSubjects: (token) => request('/api/practice/wrong-answers/', { token }),
  startWrongAnswerPractice: (body, token) => request('/api/practice/wrong-answers/start/', { method: 'POST', body, token }),
  explainQuestion: (questionId, token) => request(`/api/questions/${questionId}/explain/`, { method: 'POST', token }),
  // Billing / To'lov
  // Aktiv obuna rejalari — Landing'da ochiq ko'rsatiladi, autentifikatsiya talab qilinmaydi.
  getSubscriptionPlans: () => request(`/api/billing/plans/?_t=${Date.now()}`, { retryOnAuth: false }),
  createCheckoutSession: (payload, token) => request('/api/billing/checkout/', { method: 'POST', body: payload, token }),
  // To'lovdan keyin premium holatini polling qilish uchun — webhook obunani
  // aktivlashtirgach is_premium true bo'ladi. Kesh aralashmasligi uchun _t.
  getSubscriptionStatus: (token) => request(`/api/billing/subscription/status/?_t=${Date.now()}`, { token, retryOnAuth: false }),
  // "Mening abonementim" bloki uchun joriy faol obuna (yoki null) — plan nomi,
  // tugash sanasi, qolgan kunlar, narx. Kesh aralashmasligi uchun _t.
  getCurrentSubscription: (token) => request(`/api/billing/subscription/current/?_t=${Date.now()}`, { token, retryOnAuth: false }),
  // Billing tarixi — so'nggi 20 ta to'lov tranzaksiyasi.
  getBillingHistory: (token) => request(`/api/billing/history/?_t=${Date.now()}`, { token, retryOnAuth: false }),
  // Bitta tranzaksiyaning cheki (faqat o'z tranzaksiyasi).
  getReceipt: (txId, token) => request(`/api/billing/receipt/${encodeURIComponent(txId)}/`, { token, retryOnAuth: false }),
  // Markaz obuna limitlari va joriy foydalanish (Talabalar: 45/50, progress
  // bar, "Limit tugayapti" ogohlantirishi). centerId berilmasa — owner'ning
  // asosiy markazi. Markaz yo'q bo'lsa backend null qaytaradi.
  getBillingLimits: (token, centerId) => request(
    `/api/billing/limits/?_t=${Date.now()}${centerId ? `&center_id=${encodeURIComponent(centerId)}` : ''}`,
    { token, retryOnAuth: false },
  ),
  // Mistakes Vault
  getMistakes: (token) => request('/api/attempts/mistakes/', { token }),
  explainAllMistakes: (token) => request('/api/attempts/mistakes/explain/', { method: 'POST', token }),
  // Reward Shop
  getRewards: (token) => request('/api/me/rewards/', { token }),
  redeemReward: (productId, token) => request('/api/me/rewards/redeem/', { method: 'POST', body: { product_id: productId }, token }),
  getMyRedemptions: (token) => request('/api/me/rewards/my-redemptions/', { token }).then(unwrapList),
  // Markaz do'koni — o'quvchi (o'z markazining faol mahsulotlari)
  getShopProducts: (token) => request('/api/shop/products/', { token }),
  // Markaz do'koni — menejer/direktor CRUD. `body` FormData (rasm bilan) yoki
  // oddiy JSON bo'lishi mumkin. `centerId` ixtiyoriy — bir nechta markazga
  // ega owner/menejer aniq markazni tanlashi uchun.
  getCenterShopProducts: (token, centerId) => request(`/api/center/shop/products/${centerId ? '?center_id=' + encodeURIComponent(centerId) : ''}`, { token }).then(unwrapList),
  createCenterShopProduct: (body, token, centerId) => request(`/api/center/shop/products/${centerId ? '?center_id=' + encodeURIComponent(centerId) : ''}`, { method: 'POST', body, token }),
  updateCenterShopProduct: (productId, body, token, centerId) => request(`/api/center/shop/products/${productId}/${centerId ? '?center_id=' + encodeURIComponent(centerId) : ''}`, { method: 'PATCH', body, token }),
  deleteCenterShopProduct: (productId, token, centerId) => request(`/api/center/shop/products/${productId}/${centerId ? '?center_id=' + encodeURIComponent(centerId) : ''}`, { method: 'DELETE', token }),
  // Teacher/Owner: bitta o'quvchi batafsil profili (StudentDetailDrawer).
  // user_id bo'yicha — markaz teacher/owner'i o'z o'quvchisini ko'radi.
  // Eslatma: yuqoridagi getStudentDetail(membershipId) — boshqa endpoint
  // (centers/students/<membership_id>/, ManagerDashboard ishlatadi). Bu yangi
  // metod alohida nom oladi (getMyStudentDetail), aks holda obyektda nom
  // to'qnashib eski metod yo'qolardi.
  getMyStudentDetail: (userId, token) => request(`/api/me/students/${userId}/`, { token }),
  // Premium o'quvchi analitikasi
  getHistoryChart: (token) => request('/api/me/history-chart/', { token }),
  // Vaqt bo'yicha reyting tarixi (oxirgi 30/90 kun). Premium bo'lmaganlarga
  // backend faqat oxirgi 7 kunni qaytaradi (limited: true).
  getScoreTimeline: (days, token) => request(`/api/me/score-timeline/?days=${encodeURIComponent(days || 30)}`, { token }),
  // Eng zaif 3 mavzu/fan. Premium bo'lmasa {locked: true, topics: []}.
  getWeakestTopics: (token) => request('/api/me/weakest-topics/', { token }),
  getCompetitorAnalysis: (olympiadId, token) => request(`/api/me/competitor-analysis/${olympiadId ? '?olympiad_id=' + encodeURIComponent(olympiadId) : ''}`, { token }),
  getSubjectWeakness: (token) => request('/api/me/subject-weakness/', { token }),
  getReadiness: (olympiadId, token) => request(`/api/me/readiness/?olympiad_id=${encodeURIComponent(olympiadId)}`, { token }),
  getStudyPlan: (token) => request('/api/me/study-plan/', { method: 'POST', token }),
  // Kunlik AI mashq to'plami — Standart+ tier. Kuniga bir marta 5 ta AI savol
  // generatsiya qilinadi va saqlanadi; kun davomida aynan shu to'plam qaytadi.
  // Baholash client-side (savollarda correct_answer indeksi bor). Tier yetmasa
  // backend 403 { detail, upgrade_required, required_tier } qaytaradi.
  getDailyPracticeSet: (token) => request('/api/me/daily-practice/', { token }),
  // Kunlik AI mashq javoblarini saqlaydi (topshirish). answers: {savolIndeks:
  // variantIndeks}. Bir marta topshirilgach saqlanadi — kun davomida qayta
  // ochilganda mashq "bajarilgan" holatda ko'rinadi.
  submitDailyPracticeSet: (answers, token) => request('/api/me/daily-practice/submit/', { method: 'POST', body: { answers }, token }),
  // Shaxsiy AI test generatori — Plus+ tier. Fan/mavzu/qiyinlik yuboriladi,
  // backend 10 ta ko'p tanlovli savol qaytaradi (saqlanmaydi). Baholash
  // client-side (savollarda correct_answer indeksi bor). Tier yetmasa backend
  // 403 { detail, upgrade_required, required_tier } qaytaradi.
  generateCustomTest: (payload, token) => request('/api/me/custom-test/', { method: 'POST', body: payload, token }),
  // Oylik mashq (practice) kvotasi holati. {used, limit, unlimited}.
  // Standart=10/oy, Plus=25/oy, Pro=cheksiz (unlimited:true, limit:null).
  getPracticeQuota: (token) => request('/api/me/practice-quota/', { token }),
  // Haftalik hisobot (PDF) — Plus+ tier talab qilinadi. Tier yetarli bo'lmasa
  // backend 403 { detail, upgrade_required, required_tier } qaytaradi; bu holda
  // ApiError.status=403 va ApiError.data orqali upgrade prompt ko'rsatiladi.
  // downloadCertificate / exportOlympiadResultsXlsx bilan bir xil naqsh.
  downloadWeeklyReport: async (token) => {
    const res = await fetch(`${API_BASE_URL}/api/me/weekly-report/`, {
      method: 'GET',
      headers: { Authorization: token ? `Bearer ${token}` : '' },
      credentials: 'include',
    });
    if (!res.ok) {
      let data = null;
      try { data = await res.json(); } catch {}
      throw new ApiError((data && data.detail) || "Haftalik hisobotni yuklab bo'lmadi", { status: res.status, data });
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'olympy-haftalik-hisobot.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  },
  // Yutuqlar portfoliosi (PDF) — Pro tier talab qilinadi. Butun tarixdagi
  // yutuqlardan tuzilgan verifikatsiya qilinadigan portfolio/sertifikat. Tier
  // yetmasa backend 403 { detail, upgrade_required, required_tier } qaytaradi;
  // downloadWeeklyReport bilan bir xil naqsh.
  downloadPortfolio: async (token) => {
    const res = await fetch(`${API_BASE_URL}/api/me/portfolio/`, {
      method: 'GET',
      headers: { Authorization: token ? `Bearer ${token}` : '' },
      credentials: 'include',
    });
    if (!res.ok) {
      let data = null;
      try { data = await res.json(); } catch {}
      throw new ApiError((data && data.detail) || "Portfolioni yuklab bo'lmadi", { status: res.status, data });
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'olympy-portfolio.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  },
  // Student Progress Dashboard (premium emas). period: 30|90|180.
  getProgress: (period, token) => request(`/api/me/progress/?period=${encodeURIComponent(period || 30)}`, { token }),
  // Oddiy (template) AI tavsiyalar — LLM chaqiruvsiz, cheklanmagan.
  getAiAdvice: (token) => request('/api/me/ai-advice/', { token }),
  // ─── Retention (Onboarding / Daily hooks / Long-term) ───
  completeOnboarding: (payload, token) => request('/api/me/complete-onboarding/', { method: 'POST', body: payload, token }),
  getOnboardingMiniTest: (token) => request('/api/onboarding/mini-test/', { token }),
  submitOnboardingMiniTest: (answers, token) => request('/api/onboarding/mini-test/submit/', { method: 'POST', body: { answers }, token }),
  getPeerComparison: (token) => request('/api/me/peer-comparison/', { token }),
  getSuggestedOlympiad: (token) => request('/api/me/suggested-olympiad/', { token }),
  getDailyQuestions: (token) => request('/api/daily-questions/', { token }),
  answerDailyQuestion: (dailyId, selectedOption, token) => request(`/api/daily-questions/${dailyId}/answer/`, { method: 'POST', body: { selected_option: selectedOption }, token }),
  getDailyQuestionsStats: (token) => request('/api/daily-questions/stats/', { token }),
  getRivalActivity: (token) => request('/api/me/rival-activity/', { token }),
  getStreakWarning: (token) => request('/api/me/streak-warning/', { token }),
  getWeeklyContestHistory: (token) => request('/api/weekly-contest/history/', { token }),
  getOlympiadCalendar: (params, token) => {
    const qs = params && Object.keys(params).length
      ? '?' + new URLSearchParams(
          Object.entries(params).filter(([, v]) => v != null && v !== '').reduce((a, [k, v]) => (a[k] = String(v), a), {})
        ).toString()
      : '';
    return request(`/api/olympiad-calendar/${qs}`, { token });
  },
  getProgressComparison: (token) => request('/api/me/progress-comparison/', { token }),
  getClassmatesLeaderboard: (token) => request('/api/me/classmates-leaderboard/', { token }),
  // Premium markaz funksiyalari
  getStudentDynamics: (centerId, token) => request(`/api/centers/${centerId}/student-dynamics/`, { token }),
  getCenterActivityTrend: (centerId, token, months = 6) => request(`/api/centers/${centerId}/activity-trend/?months=${months}`, { token }),
  getCenterRegionRank: (centerId, token) => request(`/api/centers/${centerId}/region-rank/`, { token }),
  getTopStudents: (centerId, token) => request(`/api/centers/${centerId}/top-students/`, { token }),
  getGroupStats: (centerId, token, groupTag = '') => request(
    `/api/analytics/group-stats/?center_id=${encodeURIComponent(centerId)}${groupTag ? `&group_tag=${encodeURIComponent(groupTag)}` : ''}`,
    { token },
  ),
  getCenterQuestionBank: (centerId, token) => request(`/api/centers/${centerId}/question-bank/`, { token }),
  addCenterQuestion: (centerId, payload, token) => request(`/api/centers/${centerId}/question-bank/`, { method: 'POST', body: payload, token }),
  deleteCenterQuestion: (centerId, qId, token) => request(`/api/centers/${centerId}/question-bank/${qId}/`, { method: 'DELETE', token }),
  setMemberGroupTag: (centerId, membershipId, groupTag, token) => request(`/api/centers/${centerId}/members/${membershipId}/group-tag/`, { method: 'POST', body: { group_tag: groupTag }, token }),
  // Predictions
  getMyPredictions: (token) => request('/api/me/predictions/', { token }),
  // Sertifikat URL'i — `download` atributi bilan <a> orqali fayl tushadi.
  certificateDownloadUrl: (attemptId) => `${API_BASE_URL}/api/certificates/${attemptId}/download/`,
  downloadCertificate: async (attemptId, token) => {
    const res = await fetch(`${API_BASE_URL}/api/certificates/${attemptId}/download/`, {
      method: 'GET',
      headers: { Authorization: token ? `Bearer ${token}` : '' },
      credentials: 'include',
    });
    if (!res.ok) {
      let msg = "Sertifikatni yuklab bo'lmadi";
      try { const data = await res.json(); if (data?.detail) msg = data.detail; } catch {}
      throw new ApiError(msg, { status: res.status });
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `olympy-certificate-${attemptId}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  },
  // Notifications
  getNotifications: (token) => request('/api/notifications/', { token }).then(unwrapList),
  markNotificationRead: (id, token) => request(`/api/notifications/${id}/read/`, { method: 'POST', token }),
  markAllNotificationsRead: (token) => request('/api/notifications/read-all/', { method: 'POST', token }),
  subscribePush: (subscription, token) => request('/api/notifications/subscribe/', { method: 'POST', body: subscription, token }),

  // Excel (XLSX) eksport — formatlangan fayl, alohida manager endpoint'da.
  // Yuqoridagi exportOlympiadResults (CSV) bilan juftlik haqida to'liq izoh
  // getOlympiadStats yonida. Ruxsat: owner / manager / teacher / admin —
  // shuning uchun Owner ham (OwnerDashboard'dagi XLSX tugmasi) ishlatadi.
  exportOlympiadResultsXlsx: async (olympiadId, token) => {
    const res = await fetch(`${API_BASE_URL}/api/manager/olympiads/${olympiadId}/export/`, {
      method: 'GET',
      headers: { Authorization: token ? `Bearer ${token}` : '' },
      credentials: 'include',
    });
    if (!res.ok) {
      let msg = "Excel faylni yuklab bo'lmadi";
      try { const data = await res.json(); if (data?.detail) msg = data.detail; } catch {}
      throw new ApiError(msg, { status: res.status });
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `olympy-results-${olympiadId}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  },
  // Markazlar reytingi (Owner uchun yangi endpoint).
  getCenterRanking: (token) => request('/api/centers/ranking/', { token }).then(unwrapList),
  // ─── Mashq rejimi (o'tib ketgan olimpiada) ───
  // O'tib ketgan (tugagan) olimpiadadan mashq nusxasini (MockOlympiad) olish/
  // yaratish. Reyting va markaz reytingiga ta'sir qilmaydi. Javob:
  // {mock_id, attempt_id, status, title}.
  createPracticeMock: (olympiadId, token) => request(`/api/centers/practice-mock/${olympiadId}/`, { method: 'POST', token }),
  // Mashq (mock) testini boshlash — savollar ro'yxati va sarlavhasini qaytaradi.
  startMockOlympiad: (mockId, body, token) => request(`/api/mock-olympiads/${mockId}/start/`, { method: 'POST', body: body || {}, token }),
  // Mashq javoblarini topshirish — backend baholaydi (reytingga ta'sir qilmaydi).
  submitMockOlympiad: (mockId, body, token) => request(`/api/mock-olympiads/${mockId}/submit/`, { method: 'POST', body: body || {}, token }),
  // O'qituvchi/Manager analitikasi — eng ko'p noto'g'ri savollar.
  getQuestionAnalytics: (centerId, token) => request(`/api/questions/analytics/?center=${centerId}`, { token }),
  // Platforma admini — retention/conversion/premium metrikalari (Tahlil tabi).
  // Faqat is_platform_admin uchun (403 boshqa rollarga). `refresh=1` cache'ni
  // chetlab o'tib qayta hisoblaydi.
  getAdminMetrics: (token, { refresh = false } = {}) =>
    request(`/api/analytics/metrics/${refresh ? '?refresh=1' : ''}`, { token }),
  // Admin panel "Tahlil" tabidagi kengaytirilgan diagrammalar (faqat admin).
  // Har biri alohida endpoint — bo'sh jadvalda backend bo'sh massiv qaytaradi.
  getAttemptsTrend: (token) => request('/api/analytics/attempts-trend/', { token }),
  // Eslatma: yuqorida `getOlympiadStats(olympiadId, token)` allaqachon mavjud
  // (bitta olimpiada statistikasi — OwnerDashboard/ManagerDashboard ishlatadi).
  // Bu admin analitikasi alohida nom oladi (getOlympiadAnalytics), aks holda
  // obyektda nom to'qnashib eski metod yo'qolardi.
  getOlympiadAnalytics: (token) => request('/api/analytics/olympiad-stats/', { token }),
  getQuestionStats: (token) => request('/api/analytics/question-stats/', { token }),
  getRevenueTrend: (token) => request('/api/analytics/revenue-trend/', { token }),
  getCenterAnalytics: (token) => request('/api/analytics/center-stats/', { token }),
  // ─── B2B / O'sish (growth) funksiyalari ───
  // Feature #1: B2B markaz onboarding — owner sehrgarini tugatish/o'tkazib yuborish.
  completeCenterOnboarding: (token) => request('/api/me/center-onboarding/', { method: 'PATCH', token }),
  // Manager va o'qituvchi onboarding bannerlarini tugatish (yengil orientatsiya).
  completeManagerOnboarding: (token) => request('/api/me/manager-onboarding/', { method: 'PATCH', token }),
  completeTeacherOnboarding: (token) => request('/api/me/teacher-onboarding/', { method: 'PATCH', token }),
  // Feature #3: O'qituvchi paneli — markaz o'quvchilari va olimpiadalari.
  // { count, results: [...] } qaytaradi (raw — chaqiruvchi results'ni oladi).
  teacherStudents: (token) => request('/api/me/teacher/students/', { token }),
  teacherOlympiads: (token) => request('/api/me/teacher/olympiads/', { token }),
  // Feature #4: Kunlik maqsad. GET — bugungi holat; POST {target_questions:N} — belgilash.
  getDailyGoal: (token) => request('/api/me/daily-goal/', { token }),
  setDailyGoal: (n, token) => request('/api/me/daily-goal/', { method: 'POST', body: { target_questions: n }, token }),
  // Feature #5: Sertifikat haqiqiyligini tekshirish — PUBLIC (auth shart emas).
  // Token YUBORILMAYDI va 401 da logout chaqirilmasligi uchun retryOnAuth:false.
  // Topilmasa backend {valid:false} 404 qaytaradi — ApiError.data orqali o'qiladi.
  verifyCertificate: (uuid) => request(`/api/certificates/verify/${uuid}/`, { retryOnAuth: false }),
  // Feature #5: Yutuqlar portfoliosi haqiqiyligini tekshirish — PUBLIC (auth
  // shart emas). verifyCertificate bilan bir xil naqsh, faqat endpoint boshqa.
  verifyPortfolio: (uuid) => request(`/api/portfolio/verify/${uuid}/`, { retryOnAuth: false }),
  // Feature #6: Markaz brendi (white-label) — faqat owner. body {brand_color, custom_domain?}.
  updateCenterBranding: (centerId, body, token) => request(`/api/centers/${centerId}/branding/`, { method: 'PATCH', body, token }),
  // Feature #7: Referral — o'z kodi/statistikasi va boshqa kodni ishlatish.
  getReferral: (token) => request('/api/me/referral/', { token }),
  useReferral: (code, token) => request('/api/me/referral/use/', { method: 'POST', body: { code }, token }),
  // AI Support Chatbot
  sendSupportChat: (messages, token, sessionId) => request('/api/support/chat/', { method: 'POST', body: { messages, session_id: sessionId }, token }),
  // `silent`: bu AI widjetning fon (passiv) tarix preload'i — u qulasa
  // widjetni avtomatik ochib "server bilan bog'lanishda muammo" ko'rsatmaymiz
  // (widjet o'zining loadHistory catch'ida xatoni jimgina yutadi).
  getSupportChatHistory: (token, sessionId) => request(`/api/support/chat/?session_id=${sessionId || ''}`, { token, silent: true }),
  getAdminSupportChats: (token) => request('/api/admin/support/chats/', { token }),
  getAdminSupportChatDetail: (chatKey, token) => request(`/api/admin/support/chats/${chatKey}/`, { token }),
  sendAdminSupportReply: (chatKey, text, token) => request(`/api/admin/support/chats/${chatKey}/reply/`, { method: 'POST', body: { text }, token }),
};

Object.assign(globalThis, { OlympyApi });
