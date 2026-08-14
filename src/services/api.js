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

// ─── Oflayn holat ────────────────────────────────────────────────────────────
// "Internet yo'q" va "server sekin javob berdi" — IKKI BOSHQA nosozlik, lekin
// ilgari ikkalasi ham bitta xabar ("Server bilan bog'lanishda xatolik") bilan
// ko'rsatilardi: serveri sog'lom bo'lgan foydalanuvchi bekorga routerini qayta
// yoqar, internetsiz qolgan foydalanuvchi esa serverni ayblardi.
//
// `navigator.onLine === false` — YAGONA ishonchli signal. `true` bo'lishi
// internet BOR degani EMAS (u faqat "tarmoq interfeysi ulangan" ni bildiradi:
// Wi-Fi'ga ulangan, lekin internetga chiqmaydigan holat ham `true` beradi).
// Shuning uchun faqat aniq `=== false` ni oflayn deb hisoblaymiz.
const _isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;
const OFFLINE_MESSAGE = 'Internet aloqangiz uzilgan ko‘rinadi — ulanishni tekshirib, qaytadan urinib ko‘ring';

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
  // `status === 0` — ApiError'ning "so'rov serverga UMUMAN yetib bormadi"
  // holati (tarmoq uzilgan, DNS/TLS xatosi, CORS bloki, abort). Faqat shu
  // holat haqiqiy "bog'lanish xatosi".
  if (error?.status === 0) {
    // Brauzer AYNAN HOZIR oflayn bo'lsa sabab aniq — serverni ayblamaymiz.
    // (`request()` xato paytida ham shu xabarni yozadi; bu yerdagi tekshiruv
    // xatoni KEYINROQ ko'rsatadigan chaqiruvchilar uchun ham to'g'ri matn
    // chiqishini kafolatlaydi, chunki status 0 da quyidagi umumiy matn
    // ApiError'ning o'z xabarini bekor qiladi.)
    if (_isOffline()) return OFFLINE_MESSAGE;
    return "Server bilan bog‘lanishda xatolik yuz berdi";
  }
  // `status` UMUMAN yo'q (undefined) — bu ApiError emas, ya'ni so'rov emas,
  // KLIENT tomonidagi oddiy istisno (masalan javobni qayta ishlashda
  // TypeError). Avval u ham "server bilan bog'lanish xatosi" deb
  // ko'rsatilardi: foydalanuvchi internetini/serverni bekorga tekshirar,
  // xato hisobotlari esa haqiqiy sababdan (klient kodidagi qulash) butunlay
  // chalg'itardi. Xom `error.message` ham ko'rsatilmaydi — u ichki matn
  // ("Cannot read properties of undefined ...") bo'lishi mumkin.
  if (error?.status === undefined || error?.status === null) {
    return "Kutilmagan xatolik yuz berdi. Sahifani yangilab, qayta urinib ko‘ring.";
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
//
// SABAB BO'YICHA "sovish" oynasi (cooldown): 15s throttle faqat BITTA to'lqinni
// (bir vaqtda qulagan parallel so'rovlar) yig'adi, takroriy to'lqinlarga esa
// ta'sir qilmaydi. Dashboard'da esa vaqt bo'yicha yangilanadigan so'rovlar bor
// (ping, onlayn hisoblagich, bildirishnomalar) — sekin mobil internetda ular
// navbatma-navbat qulab, widget foydalanuvchiga har yarim daqiqada qaytadan
// "server bilan bog'lanishda muammo" deb ochilardi. Aynan shu "juda tez-tez
// o'zi ochiladi" shikoyatining manbai.
//
// `network_error` — transport darajasidagi shovqin: foydalanuvchi bu haqda
// bilib ham qo'shimcha hech nima qila olmaydi (u faqat kutadi yoki qayta
// urinadi), shuning uchun tab umri davomida 10 daqiqada BIR MARTADAN ko'p
// ochilmaydi. Boshqa sabablar (ayniqsa `api_error` — 5xx, ya'ni serverdagi
// haqiqiy nosozlik) avvalgidek faqat 15s throttle bilan qoladi: ular kamdan-kam
// uchraydi va har biri ko'rsatishga arziydi.
const SUPPORT_DISPATCH_THROTTLE_MS = 15000;
const SUPPORT_REASON_COOLDOWN_MS = { network_error: 10 * 60 * 1000 };
let _lastSupportDispatchAt = 0;
const _lastSupportDispatchByReason = {};
const dispatchSupportNeeded = (reason, message) => {
  try {
    if (typeof window === 'undefined') return;
    const now = Date.now();
    if (now - _lastSupportDispatchAt < SUPPORT_DISPATCH_THROTTLE_MS) return;
    const key = reason || 'api_error';
    const cooldownMs = SUPPORT_REASON_COOLDOWN_MS[key] || 0;
    if (cooldownMs && now - (_lastSupportDispatchByReason[key] || 0) < cooldownMs) return;
    _lastSupportDispatchAt = now;
    _lastSupportDispatchByReason[key] = now;
    window.dispatchEvent(new CustomEvent('olympy:support_needed', {
      detail: { reason: key, message: message || '' },
    }));
  } catch {}
};

// Foydalanuvchi O'ZI so'ragan holat: doimiy launcher tugmasi yoki xato
// banneridagi "Yordam kerakmi?" havolasi.
//
// Bu yerda ATAYIN hech qanday throttle/cooldown yo'q. Yuqoridagi chegaralar
// faqat AVTOMATIK ochilishga tegishli — ular "widjet o'zi ochilaverdi"
// muammosini hal qiladi. Foydalanuvchining o'zi bosgan tugma esa HAR DOIM
// ishlashi shart: aks holda 10 daqiqalik `network_error` cooldown paytida
// haqiqiy uzilish yuz bersa, u yordam so'ray olmasdi (widjetni qo'lda
// ochishning boshqa yo'li yo'q edi).
//
// Hisoblagichlarga ham TEGMAYDI: qo'lda ochish avtomatik cooldown'ni na
// boshlaydi, na uzaytiradi — ikkala kanal bir-biridan mustaqil.
const openSupportChat = (reason, message) => {
  try {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('olympy:support_needed', {
      detail: { reason: reason || 'manual', message: message || '', manual: true },
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
//
// Bayroq o'zgarganda `olympy:exam_mode` eventi ham yuboriladi: AI yordam
// widjetining doimiy launcher tugmasi imtihon davomida ekranni to'sib
// qo'ymasligi kerak (imtihon ekranida taymer va savol navigatsiyasi aynan
// o'sha burchakda). Widget shu eventni tinglab launcher'ni vaqtincha
// yashiradi; xato banneridagi "Yordam kerakmi?" havolasi esa ishlayveradi.
// Bir xil qiymat qayta o'rnatilganda event yuborilmaydi — `setExamMode`
// React effektidan har bir holat o'zgarishida chaqiriladi.
let _examModeActive = false;
const setExamMode = (active) => {
  const next = !!active;
  if (next === _examModeActive) return;
  _examModeActive = next;
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('olympy:exam_mode', { detail: { active: next } }));
    }
  } catch {}
};

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

// `fetch()` "osilib qolgan" ulanishda HECH QACHON rad etmaydi: TCP/TLS o'rnatilgan,
// lekin javob kelmasa promise abadiy kutib qoladi — yuqoridagi qayta urinish
// oqimi ham ishga tushmaydi (chunki xato tashlanmagan). Natijada UI shu holatda
// qotib qoladi: Login tugmasi doimiy "Kirish..." (disabled) bo'lib turadi,
// foydalanuvchiga na xato, na qayta urinish imkoni ko'rinadi.
// Shuning uchun HAR BIR urinishga vaqt chegarasi qo'yamiz — chegara tugasa
// so'rov abort qilinadi va odatdagi tarmoq-xatosi oqimiga tushadi.
// Avval BARCHA so'rovlarga bir xil 15s qo'yilardi va bu soxta "server javob
// bermadi" xabarlarining ASOSIY manbai edi: nginx og'ir so'rovga 300s ruxsat
// beradi (`proxy_read_timeout`), klient esa 15s da voz kechardi — server halol
// ishlab, javobni tayyorlab turgan paytda foydalanuvchi "server javob bermadi"
// ni ko'rardi va AI yordam widjeti o'zidan-o'zi ochilardi.
//
// Endi uch pog'ona bor:
//   * DEFAULT (30s) — oddiy CRUD/o'qish so'rovlari. 15s O'zbekistondagi sekin
//     mobil internet uchun kam edi (TTFB ning o'zi 1s+), 30s esa sog'lom javob
//     uchun bemalol yetadi va foydalanuvchi tugmani abadiy kutmaydi.
//   * HEAVY (60s) — server tomonda haqiqiy ish bajaradigan yoki qayta urinish
//     XAVFLI bo'lgan endpointlar: og'ir analitika agregatlari (cache sovuq
//     bo'lsa butun jadval bo'yicha hisoblanadi) va idempotent BO'LMAGAN
//     yozuvlar (submit, checkout) — ularda erta abort qilish qayta urinishda
//     dublikat yozuv qoldirishi mumkin.
//   * AI (120s) — Gemini chaqiruvi bilan bog'liq endpointlar. Backend'da
//     bitta urinish 45-60s timeout bilan ketadi va model/kalit bo'yicha
//     fallback qiladi; Celery broker mavjud bo'lganda POST darhol 202 qaytaradi,
//     lekin Redis tushib qolsa `CELERY_TASK_ALWAYS_EAGER` yoqilib task AYNAN
//     so'rov ichida sinxron bajariladi (`custom-test` esa har doim sinxron).
// nginx'ning 300s iga tenglashtirmaymiz: bunda haqiqatan osilib qolgan so'rov
// UI ni besh daqiqa "yuklanmoqda" holatida ushlab turardi.
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;
const HEAVY_REQUEST_TIMEOUT_MS = 60000;
const AI_REQUEST_TIMEOUT_MS = 120000;
const REQUEST_TIMEOUT_MESSAGE = 'Server javob bermadi — internetni tekshirib, qaytadan urinib ko‘ring';

// ─── Soxta vaqt chegarasi: qurilma uyqusi va fon tab ────────────────────────
// `setTimeout` uxlab qolgan noutbukda yoki uzoq vaqt fonda turgan tabda
// TO'XTAB turadi va qurilma uyg'onganda DARHOL ishga tushadi. Natijada bir
// necha soniya oldin yuborilgan mutlaqo sog'lom so'rov "vaqt tugadi" deb
// belgilanardi: foydalanuvchi noutbukini ochishi bilan ekranda "server javob
// bermadi" chiqardi, holbuki server hech qachon so'ralmagan ham bo'lishi
// mumkin. Ikkita mustaqil belgi bo'yicha aniqlaymiz:
//   1) devor-soati (`Date.now()`) bo'yicha o'tgan vaqt kutilgan chegaradan
//      sezilarli katta — timer kechikib ishga tushgan (qurilma uxlagan);
//   2) urinish davomida sahifa fonda UZOQ turgan — brauzer fon tabdagi
//      timerlarni siqadi va bir necha daqiqadan keyin butunlay muzlatadi,
//      ya'ni bunday urinishning vaqt o'lchovi ishonchsiz.
// Bunday holat tarmoq xatosi deb QAYD ETILMAYDI: jimgina qayta urinamiz va
// widjetni ochmaymiz.
const SUSPEND_DRIFT_TOLERANCE_MS = 5000;
// MUHIM: "bir lahzaga yashirindi" YETARLI EMAS. Avval oddiy `wasHidden`
// bayrog'i ishlatilardi va u alt-tab qilingan har qanday so'rovni ishonchsiz
// deb belgilardi — bitta mantiqiy chaqiruv 5 ta fetch'gacha cho'zilib, AI
// endpointida spinner daqiqalab osilib qolishi mumkin edi (tuzatilayotgan
// bugdan ham yomon tajriba). Shu sababli fonda o'tgan vaqt YIG'IB boriladi va
// faqat sezilarli chegaradan oshsa hisobga olinadi: qisqa alt-tab timerga
// amalda ta'sir qilmaydi.
const HIDDEN_SUSPEND_MIN_MS = 10000;
// Soxta timeout'lar odatdagi urinishlar byudjetini yemasligi kerak (bitta uyqu
// butun byudjetni yeb qo'ysa so'rov bekorga qulardi), lekin cheksiz sikl ham
// bo'lmasin — shu sababli alohida va cheklangan hisob.
const MAX_SUSPENDED_RETRIES = 2;
// Bitta MANTIQIY `request()` chaqiruvi (barcha urinishlar + kutishlar) uchun
// umumiy devor-soati byudjeti: nominal eng yomon holat (urinishlar × chegara)
// ustiga kichik zaxira. Qo'shimcha "bepul" urinishlar shu byudjet ichida
// bo'lishi shart — aks holda ular vaqtni cheksiz cho'zardi.
const TOTAL_BUDGET_SLACK_MS = 5000;

// Chaqiruvchining `signal`i va vaqt chegarasini bitta signalga birlashtiradi.
// (`AbortSignal.any()` eski mobil brauzerlarda yo'q — qo'lda ulaymiz.)
// `timedOut()` chaqiruvchi ATAYIN bekor qilgan holatni (abort — jimgina yutiladi)
// vaqt tugashidan (tarmoq xatosi — qayta urinish + xabar) ajratish uchun kerak.
const _abortAfter = (signal, ms) => {
  const controller = new AbortController();
  let expired = false;
  const startedAt = Date.now();
  const canWatchVisibility = typeof document !== 'undefined' && typeof document.addEventListener === 'function';
  // Fonda o'tgan vaqtni YIG'AMIZ (bir marta yashiringan-yashirinmaganini emas).
  // `hiddenSince` — hozir fonda bo'lsa boshlanish vaqti, aks holda 0.
  // Boshida ham tekshiramiz: so'rov allaqachon fonda turgan tabdan ketayotgan
  // bo'lishi mumkin (masalan boshqa tabga o'tib ketilgan sahifadagi polling).
  let hiddenMs = 0;
  let hiddenSince = (canWatchVisibility && document.visibilityState === 'hidden') ? startedAt : 0;
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      if (!hiddenSince) hiddenSince = Date.now();
    } else if (hiddenSince) {
      hiddenMs += Date.now() - hiddenSince;
      hiddenSince = 0;
    }
  };
  if (canWatchVisibility) document.addEventListener('visibilitychange', onVisibilityChange);
  const totalHiddenMs = () => hiddenMs + (hiddenSince ? Date.now() - hiddenSince : 0);
  const onCallerAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onCallerAbort, { once: true });
  }
  const timer = ms ? setTimeout(() => { expired = true; controller.abort(); }, ms) : null;
  return {
    signal: controller.signal,
    timedOut: () => expired,
    // Shu urinishga devor-soati bo'yicha qancha vaqt ketgani. Uyquda o'tgan
    // vaqtni umumiy byudjetdan chiqarib tashlash uchun kerak (pastga qarang).
    elapsedMs: () => Date.now() - startedAt,
    // Vaqt chegarasi tugadi, LEKIN o'lchovga ishonib bo'lmaydi (yuqoridagi
    // "soxta vaqt chegarasi" izohiga qarang) — so'rov emas, timer nosoz.
    timeoutUnreliable: () => expired && (
      totalHiddenMs() >= HIDDEN_SUSPEND_MIN_MS
      || (Date.now() - startedAt) > ms + SUSPEND_DRIFT_TOLERANCE_MS
    ),
    cleanup: () => {
      if (timer) clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onCallerAbort);
      if (canWatchVisibility) document.removeEventListener('visibilitychange', onVisibilityChange);
    },
  };
};

// Backoff kutuvi abort'ni darhol sezishi kerak: aks holda unmount bo'lgan
// komponent so'rovni bekor qilsa ham loop 1.2s "osilib" turardi.
//
// OFLAYN holatda esa 600ms/1200ms kutishning ma'nosi yo'q — shu vaqt ichida
// internet qaytmaydi va oxirgi urinish ham qulab, foydalanuvchiga xato
// ko'rsatiladi. Buning o'rniga `online` eventini kutamiz (yuqori chegara bilan)
// va aloqa tiklangan zahoti JIMGINA qayta urinamiz: foydalanuvchi lift/metrodan
// chiqqanida so'rov o'zi ketadi, hech qanday xato oynasi ko'rinmaydi. Chegara
// kerak, chunki internet umuman qaytmasligi mumkin — bunday holda so'rov
// baribir tugashi va chaqiruvchiga xato qaytishi shart.
//
// `waitForOnline` FAQAT birinchi qayta urinishga beriladi (chaqiruvchiga
// qarang): aks holda har bir urinish 15 soniyadan kutib, oflayn foydalanuvchi
// tugmani bosgach yarim daqiqa "yuklanmoqda" spinnerini ko'rardi.
const OFFLINE_RETRY_WAIT_MS = 15000;
const _waitBeforeNetworkRetry = (ms, signal, waitForOnline = false) => new Promise((resolve, reject) => {
  if (signal?.aborted) {
    reject(new ApiError('aborted', { status: 0 }));
    return;
  }
  const watchOnline = waitForOnline && _isOffline() && typeof window !== 'undefined';
  let timer = null;
  let settled = false;
  const settle = (run) => {
    if (settled) return;
    settled = true;
    if (timer) clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
    if (watchOnline) window.removeEventListener('online', onOnline);
    run();
  };
  const onAbort = () => settle(() => reject(new ApiError('aborted', { status: 0 })));
  const onOnline = () => settle(resolve);
  timer = setTimeout(() => settle(resolve), watchOnline ? OFFLINE_RETRY_WAIT_MS : ms);
  if (signal) signal.addEventListener('abort', onAbort);
  if (watchOnline) window.addEventListener('online', onOnline);
});

const request = async (
  path,
  { method = 'GET', body, token, headers = {}, retryOnAuth = true, keepalive = false, signal, silent = false, speculative = false, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, idempotent = true } = {},
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
  //
  // `idempotent: false` — AYNAN shu sabab bo'yicha alohida bayroq. Avtomatik
  // qayta urinish tarmoq xatosini yashiradi, lekin so'rov serverga YETIB
  // BORGAN va faqat javob yo'qolgan holatda ikkinchi yozuv paydo bo'ladi.
  // Chaqiruvchi buni ochiq belgilaganda BARCHA qayta urinishlar (odatdagisi
  // ham, uyqu/fon bo'yicha "bepul"i ham) o'chiriladi: sekin tarmoqda bir marta
  // xato ko'rsatish dublikat to'lovdan yoki yo'qolgan test natijasidan
  // yaxshiroq. Ma'lumot butunligi tajribadan ustun.
  const canRetry = !keepalive && idempotent;
  const maxNetworkRetries = canRetry ? NETWORK_RETRY_DELAYS_MS.length : 0;

  // Fayl yuklash (FormData) sekin mobil internetda 20 soniyadan oshishi
  // TABIIY — yuklanish javob sarlavhalaridan OLDIN tugashi kerak. Shu sababli
  // multipart so'rovlarga va `keepalive` (sahifa yopilayotgandagi) so'rovlarga
  // vaqt chegarasi qo'yilmaydi.
  const effectiveTimeoutMs = (keepalive || isFormData) ? 0 : timeoutMs;

  // Umumiy devor-soati byudjeti: barcha urinishlar + kutishlar shu ichida
  // tugashi kerak. Nominal eng yomon holatga (urinishlar × chegara) teng, ya'ni
  // ODATDAGI oqim hech qachon bunga urilmaydi — u faqat "bepul" urinishlar
  // vaqtni cho'zib yuborishiga to'sqinlik qiladi. Vaqt chegarasi yo'q
  // so'rovlarda (FormData/keepalive) byudjet ham qo'yilmaydi.
  const totalBudgetMs = effectiveTimeoutMs
    ? effectiveTimeoutMs * (1 + maxNetworkRetries) + TOTAL_BUDGET_SLACK_MS
    : 0;
  let deadlineAt = Date.now() + totalBudgetMs;
  const _budgetLeft = () => !totalBudgetMs || Date.now() < deadlineAt;

  let response;
  // `attempt` — HAQIQIY tarmoq xatolari bo'yicha urinishlar hisobi.
  // `suspendedRetries` — qurilma uyqusi/fon tab tufayli SOXTA deb topilgan
  // vaqt chegaralari uchun alohida (bepul) hisob; ular odatdagi byudjetni
  // yemaydi, lekin o'zlari ham cheklangan (MAX_SUSPENDED_RETRIES).
  // `sawReliableFailure` — urinishlardan HECH BO'LMAGANDA bittasi ishonchli
  // o'lchov bilan qulaganmi. Widjetni ochish qarori shunga tayanadi: aks holda
  // aynan OXIRGI urinish paytida tab fonga o'tib qolsa, ROSTDAN o'lgan server
  // haqida foydalanuvchi hech qanday taklif ko'rmasdi.
  let attempt = 0;
  let suspendedRetries = 0;
  let sawReliableFailure = false;
  for (;;) {
    const attemptAbort = _abortAfter(signal, effectiveTimeoutMs);
    try {
      response = await fetch(`${API_BASE_URL}${path}`, {
        method,
        headers: requestHeaders,
        credentials: 'include',
        keepalive,
        signal: attemptAbort.signal,
        body: requestBody,
      });
      break;
    } catch (error) {
      // Vaqt chegarasi tugadi — bu ATAYIN abort emas, haqiqiy tarmoq nosozligi
      // (server javob bermayapti). Quyidagi qayta urinish oqimiga tushadi.
      const expired = attemptAbort.timedOut();
      // ...lekin vaqt o'lchovining o'zi ishonchsiz bo'lishi ham mumkin.
      const unreliable = attemptAbort.timeoutUnreliable();
      // AbortController.abort() — chaqiruvchi (masalan, unmount bo'lgan komponent)
      // so'rovni atayin bekor qilgan. Buni "server bilan bog'lanish xatosi" deb
      // ko'rsatmaymiz va HECH QACHON qayta urinmaymiz; chaqiruvchi catch'da
      // abort'ni jimgina yutadi.
      if (!expired && (error?.name === 'AbortError' || signal?.aborted)) {
        throw new ApiError('aborted', { status: 0 });
      }
      if (!unreliable) sawReliableFailure = true;
      // SOXTA vaqt chegarasi (qurilma uyqudan uyg'ondi / tab uzoq fonda edi) —
      // server haqida HECH QANDAY ma'lumot bermaydi. Qisqa kutishdan keyin
      // jimgina qayta urinamiz; bu urinish odatdagi urinishlar hisobiga
      // kirmaydi va widjetni ochmaydi.
      if (unreliable && canRetry && suspendedRetries < MAX_SUSPENDED_RETRIES) {
        // Uyquda/muzlashda o'tgan vaqt umumiy byudjetdan HISOBLANMAYDI: aks
        // holda 10 daqiqa uxlagan noutbukda byudjet uyg'onish paytidayoq
        // tugagan bo'lardi va bepul urinish umuman ishlamasdi. Faqat nominal
        // chegaradan ortiqcha ("yo'qolgan") vaqt qaytariladi — urinishning
        // o'zi baribir byudjetdan o'z ulushini oladi.
        deadlineAt += Math.max(0, attemptAbort.elapsedMs() - effectiveTimeoutMs);
        if (_budgetLeft()) {
          suspendedRetries += 1;
          await _waitBeforeNetworkRetry(NETWORK_RETRY_DELAYS_MS[0], signal);
          continue;
        }
      }
      // Bir lahzalik uzilish bo'lishi mumkin — qisqa backoff bilan yana
      // urinamiz (yuqoridagi izohga qarang). Kutish paytida so'rov bekor
      // qilinsa `_waitBeforeNetworkRetry` abort xatosini otadi.
      // Birinchi qayta urinishda (va faqat unda) oflayn bo'lsak aloqa
      // tiklanishini kutamiz — `_waitBeforeNetworkRetry` izohiga qarang.
      if (attempt < maxNetworkRetries && _budgetLeft()) {
        await _waitBeforeNetworkRetry(NETWORK_RETRY_DELAYS_MS[attempt], signal, attempt === 0);
        attempt += 1;
        continue;
      }
      // Barcha urinishlar tugadi — haqiqiy tarmoq xatosi (internet yo'q /
      // server o'chiq / timeout). AI yordam widjetini avtomatik ochamiz.
      // `silent` so'rovlar (masalan AI widjetning o'z fon tarixi preload'i)
      // buni triggerlamaydi — aks holda widjet o'zining fon so'rovi qulasa
      // o'zini-o'zi ochib, foydalanuvchini (ayniqsa ro'yxatdan o'tgach
      // navbatdagi so'rovlar to'lqinida server hali "uyg'onmagan" paytda)
      // bejiz bezovta qilardi.
      // Vaqt chegarasi tugagan holatda sabab ANIQ ma'lum — "server javob
      // bermadi". Uni umumiy "bog‘lanishda xatolik" bilan almashtirmaymiz:
      // status 0 (so'rov serverga yetib bormadi) noto'g'ri bo'lardi, 504 esa
      // "kutish vaqti tugadi" ning halol status kodi (pollAiTask bilan bir xil).
      // Brauzer oflayn bo'lsa esa sabab serverda EMAS — xabar internet haqida
      // bo'ladi (status 0: so'rov haqiqatan serverga yetib bormadi).
      const offline = _isOffline();
      const message = offline
        ? OFFLINE_MESSAGE
        : (expired ? REQUEST_TIMEOUT_MESSAGE : "Server bilan bog‘lanishda xatolik yuz berdi");
      // Widjet FAQAT foydalanuvchiga haqiqatan foyda beradigan holatda ochiladi:
      //   * `silent` — fon so'rovlari (masalan widjetning o'z tarix preload'i)
      //     hech qachon ochmaydi;
      //   * OFLAYN — ochmaymiz: internetsiz foydalanuvchiga "internetingizni
      //     tekshiring" deb AI chat ochish faqat bezovta qiladi (chatning o'zi
      //     ham serverga so'rov yuboradi va quladi), ustiga aloqa tiklanganda
      //     so'rov yuqorida jimgina qaytariladi;
      //   * SOXTA timeout (uyqu/fon tab) — ochmaymiz, chunki server haqida
      //     hech narsa ma'lum emas. Baholash OXIRGI urinish bo'yicha emas,
      //     BARCHA urinishlar bo'yicha (`sawReliableFailure`): agar hech
      //     bo'lmaganda bittasi ishonchli o'lchov bilan qulagan bo'lsa,
      //     nosozlik haqiqiy — tab keyinchalik fonga o'tgani buni yuvmaydi.
      if (!silent && !offline && sawReliableFailure) {
        dispatchSupportNeeded('network_error', message);
      }
      throw new ApiError(message, { status: (expired && !offline) ? 504 : 0 });
    } finally {
      // Timer va chaqiruvchi signalidagi listener har urinishdan keyin
      // tozalanadi (aks holda uzoq yashaydigan `signal`da to'planib qolardi).
      // MUHIM: muvaffaqiyatli javobdan keyin ham tozalanadi — ya'ni vaqt
      // chegarasi FAQAT javob sarlavhalarigacha amal qiladi, katta javob
      // tanasini o'qish (`response.json()`) yarim yo'lda uzilmaydi.
      attemptAbort.cleanup();
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
        try { window.dispatchEvent(new CustomEvent('olympy:impersonation_ended')); } catch {}
        throw new ApiError("Ko'rish seansi tugadi", { status: 401, data });
      }
      if (retryOnAuth) {
        try {
          // Single-flight: parallel 401'lar bitta refresh natijasini kutadi.
          const { token: nextToken } = await _refreshTokens();
          // `silent` va `timeoutMs` ham UZATILADI. Ilgari ular tushib qolardi
          // va bu ikkita soxta xatoni keltirib chiqarardi:
          //   * `silent: true` so'rov (widjetning o'z fon tarix preload'i)
          //     refreshdan keyingi urinishda "ovozli" bo'lib qolib, tarmoq
          //     uzilsa widjetni O'ZI ochib yuborardi — aynan foydalanuvchi
          //     shikoyat qilgan xulq;
          //   * og'ir endpoint (AI/analitika) o'zining uzun chegarasini
          //     yo'qotib, 30s da uzilardi.
          return request(path, {
            method,
            body,
            token: nextToken || null,
            headers,
            retryOnAuth: false,
            signal,
            silent,
            timeoutMs,
            idempotent,
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
      // SPEKULYATIV bootstrap tekshiruvi (app.jsx `restoreFromCookieSession`) —
      // "storage bo'sh, lekin HttpOnly cookie hali tirikmi?" degan FON so'rovi.
      // Uning 401'i "sessiya buzildi" emas, shunchaki "sessiya yo'q" degani,
      // shuning uchun global logout'ni TRIGGERLAMAYDI va storage'ga TEGMAYDI.
      // 4c135cc bu tekshiruvni fonga chiqargandan keyin login formasi uning
      // tugashini kutmaydi: sekin mobil tarmoqda kech kelgan 401 foydalanuvchi
      // ENDIGINA kirgan YANGI sessiyani o'chirib yuborardi (`olympy:logout` →
      // handleLogout → clearAuth(), u tokenlarni tozalash bilan birga
      // /api/auth/logout/ ni chaqirib yangi refresh tokenni server tomonda
      // blacklist ham qiladi) — natijada foydalanuvchi kirgan zahoti
      // "Sessiya muddati tugadi" bilan qaytarib chiqarilardi.
      if (speculative) {
        throw new ApiError('No session', { status: 401, data });
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
    // `response.statusText` HTTP/2 da HAR DOIM bo'sh bo'ladi — protokol
    // reason-phrase'ni umuman tashimaydi, production API esa HTTP/2 orqali
    // ishlaydi. HTML javob (Django'ning 500 sahifasi yoki Render/Cloudflare'ning
    // 502/503/504 sahifasi) esa `extractErrorMessage` tomonidan ataylab '' ga
    // aylantiriladi (xom HTML foydalanuvchiga ko'rsatilmasin). Ikkalasi
    // birgalikda ApiError.message'ni BO'SH qoldirardi va `toUserMessage`
    // pastdagi umumiy tarmoq xabariga ("Server bilan bog'lanishda xatolik yuz
    // berdi") tushib qolardi — ya'ni SERVER xatosi foydalanuvchiga TARMOQ
    // xatosi qiyofasida ko'rinardi. Bu ham foydalanuvchini chalg'itadi
    // (internetini tekshirib vaqt yo'qotadi), ham nosozlikni topishni
    // qiyinlashtiradi (xabar 500 bilan 502 ni ham, uzilgan ulanishni ham
    // farqlamaydi). Shu sababli oxirgi zaxira sifatida status kodi bor halol
    // xabar qaytaramiz.
    const statusFallback = response.status >= 500
      ? `Serverda xatolik yuz berdi (${response.status}). Birozdan so'ng qayta urinib ko'ring.`
      : `So'rov bajarilmadi (${response.status}).`;
    throw new ApiError(extractErrorMessage(data) || response.statusText || statusFallback, {
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
  // await — logout so'rovi tugashini kutamiz, aks holda refresh token
  // server tomonda blacklist'ga tushmasdan qolib ketishi mumkin (fetch
  // boshlanmasdan sahifa o'zgarsa). Chaqiruvchilar natijani kutmaydi.
  try { await request('/api/auth/logout/', { method: 'POST', retryOnAuth: false }); } catch {}
};

// Impersonatsiya faol bo'lsa uning tokeni qaytadi: `request()`dan tashqarida
// to'g'ridan-to'g'ri `fetch` qiladigan joylar (fayl yuklab olishlar) ham
// AYNAN o'sha foydalanuvchi sifatida ishlashi kerak.
const getToken = () => {
  const impersonation = _readImpersonation();
  return (impersonation && impersonation.token) || _readAuth(AUTH_TOKEN_KEY);
};

// ─── Yuklanadigan fayl hajmini KLIENT tomonda tekshirish ────────────────────
// Backend limitlari bilan bir xil (settings.AI_QUESTION_PDF_MAX_BYTES va
// AI_QUESTION_IMPORT_MAX_BYTES). Nega klientda ham tekshiramiz: limitdan katta
// fayl baribir rad etiladi, ammo server javobni fayl to'liq yuklanishidan
// oldin qaytarsa brauzer ulanish uzilganini ko'radi va `fetch()` TypeError
// bilan qulaydi — foydalanuvchi "Fayl juda katta" o'rniga "Server bilan
// bog'lanishda xatolik" degan chalg'ituvchi xabar olardi. Umuman yubormaslik
// eng ishonchli yechim (backend uchun DrainRequestBodyMiddleware bor).
const AI_PDF_MAX_BYTES = 20 * 1024 * 1024;
const AI_IMPORT_MAX_BYTES = 10 * 1024 * 1024;
const _assertUploadSize = (file, maxBytes) => {
  const size = file && typeof file.size === 'number' ? file.size : 0;
  if (size > maxBytes) {
    throw new ApiError(
      `Fayl juda katta (${(size / (1024 * 1024)).toFixed(1)} MB). Limit: ${Math.round(maxBytes / (1024 * 1024))} MB`,
      { status: 413 },
    );
  }
};

// Backend sekin Gemini chaqiruvlarini Celery task'iga ko'chirdi: POST darhol
// `{task_id}` (202) qaytaradi, natija esa `<endpoint>/<task_id>/status/` orqali
// olinadi ({status: PENDING|COMPLETED|FAILED}). Bu yordamchi o'sha polling
// loop'ini bir joyga yig'adi (runCode/extractPdfQuestions naqshi bilan bir xil:
// abort-aware kutish, FAILED → ApiError, urinishlar tugasa timeout xatosi).
//
// `startRes` — POST javobi. `task_id` bo'lmasa javob darhol tayyor (masalan
// bazada saqlangan tushuntirish) yoki backend eski versiya — o'shani qaytaramiz.
const pollAiTask = async (startRes, statusPath, {
  token,
  signal,
  attempts = 150,
  intervalMs = 2000,
  failMessage,
  timeoutMessage,
}) => {
  const taskId = startRes?.task_id;
  if (!taskId) return startRes;
  const aborted = () => signal && signal.aborted;
  for (let i = 0; i < attempts; i++) {
    await new Promise((resolve, reject) => {
      if (aborted()) return reject(new ApiError('aborted', { status: 0 }));
      const t = setTimeout(resolve, intervalMs);
      if (signal) {
        signal.addEventListener('abort', () => {
          clearTimeout(t);
          reject(new ApiError('aborted', { status: 0 }));
        }, { once: true });
      }
    });
    if (aborted()) throw new ApiError('aborted', { status: 0 });
    const statusRes = await request(statusPath(taskId), { token, signal });
    if (statusRes?.status === 'COMPLETED') return statusRes;
    if (statusRes?.status === 'FAILED') {
      throw new ApiError(
        statusRes?.detail || statusRes?.error || failMessage,
        { status: 503, data: statusRes },
      );
    }
  }
  // MUHIM: status BERILISHI shart. `ApiError` konstruktori berilmagan statusni
  // 0 ga aylantiradi, `toUserMessage` esa 0 ni "so'rov serverga umuman yetib
  // bormadi" deb talqin qilib aniq xabar o'rniga umumiy "Server bilan
  // bog'lanishda xatolik yuz berdi" ni ko'rsatardi — ya'ni haqiqiy sabab
  // (vazifa vaqtida tugamadi) foydalanuvchiga ham, xato hisobotiga ham
  // yetib bormasdi. 504 — "kutish vaqti tugadi" ning halol status kodi.
  throw new ApiError(timeoutMessage, { status: 504 });
};

export const OlympyApi = {
  API_BASE_URL,
  ApiError,
  toUserMessage,
  mapBackendUser,
  makeAssetUrl,
  saveAuth,
  loadAuth,
  clearAuth,
  getToken,
  setExamMode,
  // Widjetni QO'LDA ochish (launcher tugmasi va xato bannerlaridagi "Yordam
  // kerakmi?" havolasi) — avtomatik cooldown'dan mustaqil, yuqoridagi izohga
  // qarang.
  openSupportChat,
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
  // `speculative: true` — bootstrap'dagi "cookie hali tirikmi?" fon tekshiruvi
  // uchun: 401 kelsa global logout qilinmaydi (yuqoridagi `request` izohiga
  // qarang), chaqiruvchi xatoni o'zi jimgina yutadi.
  getMe: async (token, { speculative = false } = {}) => {
    // Avval sessionStorage keshini ko'ramiz — sahifa yangilangach in-memory
    // _currentUser yo'qoladi, kesh esa darhol qiymat beradi. Keyin serverdan
    // yangilab, javobni keshga yozamiz (kesh faqat UI uchun; ruxsat har doim
    // serverda tekshiriladi). Tarmoq xatosida (401 emas, status 0) keshdagi
    // qiymatni fallback qilamiz, aks holda xatoni qayta otamiz.
    const cached = _readCachedUser();
    try {
      const data = await request('/api/me/', { token, speculative });
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
  // Roster ro'yxatlari (arizalar / xodimlar / o'quvchilar) backend'da
  // sahifalanadi (LargePageNumberPagination, max 200/page). Manager paneli
  // butun ro'yxatga tayanadi (qidiruv, statistika, guruh filtri), shu sababli
  // unwrapList bilan faqat 1-sahifani olish yaramaydi — requestAllPages
  // barcha sahifalarni ketma-ket yig'adi (getAdminCenters/getQuestions naqshi).
  getPendingMemberships: (centerId, role, token) => requestAllPages(`/api/centers/${centerId}/memberships/pending/${role ? '?role=' + role : ''}`, { token }),
  getStaffMemberships: (centerId, role, token) => requestAllPages(`/api/centers/${centerId}/memberships/staff/${role ? '?role=' + encodeURIComponent(role) : ''}`, { token }),
  getStudentMemberships: (centerId, statusFilter, token) => requestAllPages(`/api/centers/${centerId}/memberships/students/${statusFilter ? '?status=' + encodeURIComponent(statusFilter) : ''}`, { token }),
  getStudentDetail: (membershipId, token) => request(`/api/centers/students/${membershipId}/`, { token }),
  // Xodim yaratish — `idempotent: false`. Backend `User.objects.create_user()`
  // chaqiradi va `phone` unique bo'lgani uchun DUBLIKAT AKKAUNT yaratilmaydi,
  // lekin IntegrityError ushlanmagan: javob yo'lda yo'qolib, so'rov avtomatik
  // takrorlansa admin toza xato o'rniga Django 500 sahifasini ko'radi.
  createManager: (centerId, payload, token) => request(`/api/centers/${centerId}/managers/create/`, { method: 'POST', body: payload, token, idempotent: false }),
  createTeacher: (centerId, payload, token) => request(`/api/centers/${centerId}/teachers/create/`, { method: 'POST', body: payload, token, idempotent: false }),
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
  // Hisob YARATGAN kontent (savollar, olimpiadalar) va TOPSHIRGAN urinishlar
  // — "Batafsil" oynasidagi "Kontent va faollik" bloki. Har ro'yxat oxirgi
  // 20 ta yozuv bilan cheklangan, `totals` esa haqiqiy umumiy sonni beradi.
  getAdminUserContentHistory: (userId, token) => request(
    `/api/admin/users/${userId}/content-history/`, { token },
  ),
  // Yuqoridagi ro'yxatdan BITTA elementni o'chirish — hisobga tegilmaydi
  // (bloklanmaydi, seanslari yakunlanmaydi). `contentType`: 'question' yoki
  // 'olympiad'. Foydalanishdagi savol o'chirilmaydi, arxivlanadi — javobdagi
  // `archived` bayrog'i shuni bildiradi.
  adminDeleteUserContent: (userId, contentType, contentId, token) => request(
    `/api/admin/users/${userId}/content/${contentType}/${contentId}/`,
    { method: 'DELETE', token },
  ),
  // Bloklashdan oldingi rasmiy ogohlantirish. `reason` ICHKI izoh (faqat
  // audit jurnaliga tushadi), `message` esa foydalanuvchi o'qiydigan matn —
  // ikkalasi ham majburiy (backend bo'shini 400 bilan rad etadi). Hisob
  // holati (blok, sessiyalar) o'zgarmaydi.
  adminWarnUser: (userId, { reason, message } = {}, token) => request(
    `/api/admin/users/${userId}/warn/`,
    { method: 'POST', body: { reason: reason || '', message: message || '' }, token },
  ),
  // Shu foydalanuvchiga yuborilgan oxirgi ogohlantirishlar ("Batafsil"
  // oynasidagi tarix bloki). Yuqoridagilar kabi javobda `user_id` qaytadi.
  getAdminUserWarnings: (userId, token) => request(`/api/admin/users/${userId}/warnings/`, { token }),
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
  // Hisobni admin nomidan o'chirish (soft-delete). Bloklashning o'rnini
  // BOSMAYDI: o'chirilgan hisob grace muddati (backend javobidagi
  // `grace_days`) tugagach butunlay yo'q qilinadi va shu muddat ichida
  // foydalanuvchining O'ZI telefon+parol bilan tiklab olishi mumkin.
  // `reason` ixtiyoriy va faqat audit jurnaliga tushadi.
  adminDeleteUser: (userId, reason, token) => request(
    `/api/admin/users/${userId}/delete/`,
    { method: 'POST', body: { reason: reason || '' }, token },
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
  // Seanslar ro'yxati ("Batafsil" oynasidagi "Faol seanslar" bloki). Kirish
  // tarixidan farqi — har bir qatorda seans hali tirikmi (`is_active`) degan
  // HOZIRGI holat keladi. Yuqoridagilar kabi javobda `user_id` qaytadi.
  getAdminUserSessions: (userId, token) => request(`/api/admin/users/${userId}/sessions/`, { token }),
  // BITTA seansni yakunlash — `adminForceLogoutUser` dan farqli o'laroq
  // qolgan qurilmalar ishlashda davom etadi. Eski (jti'siz) yoki allaqachon
  // tugagan seansni backend 400 bilan rad etadi.
  adminForceLogoutSession: (userId, loginEventId, token) => request(
    `/api/admin/users/${userId}/sessions/${loginEventId}/force-logout/`,
    { method: 'POST', token },
  ),
  // ─── Xavfsizlik tabi ───
  // Bitta IP'dan kirgan turli hisoblar. `minAccounts`/`days` backendda
  // clamp qilinadi va AYNAN qo'llanilgan qiymat javobda qaytadi — panel
  // filtrni shu qiymat bilan ko'rsatadi (yuborilgani bilan emas).
  getAdminSharedIpAccounts: ({ minAccounts = 5, days = 30 } = {}, token) => {
    const qs = new URLSearchParams({ min_accounts: String(minAccounts), days: String(days) });
    return request(`/api/admin/security/shared-ip/?${qs.toString()}`, { token });
  },
  // Bitta IP ortidagi hisoblar ro'yxati (ro'yxatdagi "Ko'rish" tugmasi).
  // IPv6 manzilida ikki nuqta bor — encodeURIComponent majburiy.
  getAdminSharedIpDetail: (ipAddress, token) => request(
    `/api/admin/security/shared-ip/${encodeURIComponent(ipAddress)}/`,
    { token },
  ),
  // ─── Moderatsiya navbati (avtomatik bayroqlar) ───
  // Soatlik detektor qo'ygan bayroqlar. `status` berilmasa backend faqat
  // ochiqlarini (`pending`) beradi — navbat aynan shu uchun; butun tarix
  // uchun `status: 'all'`. Ro'yxat cheksiz o'sadi, shuning uchun audit
  // jurnalidagidek server tomon paginatsiya (`page`/`page_size`).
  getAdminModerationQueue: ({ flagType = '', status = '', page = 1, pageSize = 50 } = {}, token) => {
    const qs = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (flagType) qs.set('flag_type', flagType);
    if (status) qs.set('status', status);
    return request(`/api/admin/moderation/queue/?${qs.toString()}`, { token });
  },
  // Bayroqni yopish: `resolved` (chora ko'rildi) yoki `dismissed` (yolg'on
  // signal). Allaqachon yopilgan bayroqni backend 400 bilan rad etadi.
  // `archive` — faqat savol bayrog'ida: savolni bankdan olib tashlaydi
  // (is_active=false). Backend javobida `archived` haqiqatan bajarilganini
  // bildiradi (savol shu orada o'chirilgan bo'lsa false).
  // `blockIp`/`blockDays` — faqat shubhali IP bayrog'ida: bayroqdagi manzilni
  // AYNAN shu chaqiruvda bloklaydi (`blockDays` berilmasa blok doimiy).
  // Javobdagi `blocked_ip` blok haqiqatan qo'yilganini bildiradi: manzil
  // allaqachon bloklangan yoki adminning o'zi bo'lsa null qaytadi.
  adminResolveModerationFlag: (
    flagId,
    { status, note = '', archive = false, blockIp = false, blockDays = null },
    token,
  ) => request(
    `/api/admin/moderation/queue/${flagId}/resolve/`,
    {
      method: 'POST',
      body: { status, note, archive, block_ip: blockIp, block_days: blockDays },
      token,
    },
  ),
  // ─── Bloklangan IP'lar ───
  // Barcha bloklar, yangisidan boshlab. Muddati o'tganlari ham keladi
  // (`is_active: false`) — ular hech nimani to'smaydi, lekin "bu manzil avval
  // nega bloklangan edi" degan savolga javob beradi. Ro'yxat o'sib boradi,
  // shuning uchun moderatsiya navbatidagidek server tomon paginatsiya.
  getAdminBlockedIps: ({ page = 1, pageSize = 50 } = {}, token) => {
    const qs = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    return request(`/api/admin/moderation/blocked-ips/?${qs.toString()}`, { token });
  },
  // Yangi blok. `ipAddress` — bitta manzil ham, CIDR tarmoq ham bo'lishi
  // mumkin (`1.2.3.4` yoki `1.2.3.0/24`). `reason` MAJBURIY, `durationDays`
  // ixtiyoriy: berilmasa blok doimiy (foydalanuvchi blokidagi bilan bir xil
  // qoida). Noto'g'ri manzil, takror blok va o'zini bloklashni backend 400 +
  // {detail} bilan rad etadi.
  adminBlockIp: ({ ipAddress, reason, durationDays = null } = {}, token) => request(
    '/api/admin/moderation/blocked-ips/',
    {
      method: 'POST',
      body: { ip_address: ipAddress, reason, duration_days: durationDays },
      token,
    },
  ),
  // Blokni olib tashlash — qator butunlay o'chiriladi (yo'qoladigan tarix
  // yo'q: blokning qo'yilishi ham, olinishi ham audit jurnalida qoladi).
  adminUnblockIp: (blockedIpId, token) => request(
    `/api/admin/moderation/blocked-ips/${blockedIpId}/`,
    { method: 'DELETE', token },
  ),
  // ─── Firibgarlik holatlari (barcha markazlar bo'yicha) ───
  // Diskvalifikatsiya qilingan va tekshiruv kutayotgan sessiyalar. FAQAT
  // o'qish uchun: qaror (diskvalifikatsiya / davom ettirish) menejer
  // panelidagi jonli kuzatuv ekranida qoladi. `status` bo'sh bo'lsa ikkala
  // holat ham keladi; sana filtrlari YYYY-MM-DD. Ro'yxat cheksiz o'sadi —
  // moderatsiya navbatidagidek server tomon paginatsiya.
  getAdminCheatingOverview: (
    { centerId = '', status = '', dateFrom = '', dateTo = '', search = '', page = 1, pageSize = 50 } = {},
    token,
  ) => {
    const qs = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (centerId) qs.set('center_id', String(centerId));
    if (status) qs.set('status', status);
    if (dateFrom) qs.set('date_from', dateFrom);
    if (dateTo) qs.set('date_to', dateTo);
    if (search) qs.set('search', search);
    return request(`/api/admin/attempts/cheating-overview/?${qs.toString()}`, { token });
  },
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
    // ko'rinardi. Service worker keshidagi /api/ javoblari ham adminniki
    // (logout'dagi bilan bir xil sabab: bir hisobning javoblari ikkinchisiga
    // ko'rinmasin).
    _clearCachedUser();
    _clearSwApiCache();
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
  getQuestions: (centerId, token) => requestAllPages(
    `/api/questions/?center=${centerId}`,
    { token },
  ),
  createQuestion: (payload, token) => request('/api/questions/', { method: 'POST', body: payload, token }),
  // AI savol generatsiyasi — backend Celery task'ni boshlaydi, natija polling
  // bilan olinadi (pollAiTask izohiga qarang). Javob shakli avvalgidek
  // { questions: [...] } bo'lib qoladi, shu sababli chaqiruvchi o'zgarmaydi.
  // `timeoutMs` — boshlash (POST) so'roviga: broker sog'lom bo'lganda u darhol
  // 202 qaytaradi, ammo Redis tushib qolsa Django task'ni AYNAN shu so'rov
  // ichida sinxron bajaradi (CELERY_TASK_ALWAYS_EAGER) va Gemini'ni kutadi.
  // Polling so'rovlari (status) yengil — ular default chegarada qoladi.
  generateAiQuestions: async (payload, token, signal) => pollAiTask(
    await request('/api/questions/generate-ai/', { method: 'POST', body: payload, token, signal, timeoutMs: AI_REQUEST_TIMEOUT_MS }),
    (taskId) => `/api/questions/generate-ai/${taskId}/status/`,
    { token, signal, failMessage: "AI savol yarata olmadi", timeoutMessage: "AI savol yaratish vaqti tugadi (Timeout)" },
  ),
  // IT (kod) savolini AI bilan baholash — test paytida o'quvchi kodini sinaydi.
  // { question_id, submitted_code, language } → { score (0-100|null), review }.
  // Backend Gemini chaqiruvini Celery task'iga ko'chirgani uchun bu ham
  // submit + polling oqimida ishlaydi (javob maydonlari o'zgarmagan).
  reviewCode: async (payload, token, signal) => pollAiTask(
    await request('/api/questions/code-review/', { method: 'POST', body: payload, token, signal, timeoutMs: AI_REQUEST_TIMEOUT_MS }),
    (taskId) => `/api/questions/code-review/${taskId}/status/`,
    {
      token,
      signal,
      failMessage: "AI baholashni hozir bajarib bo'lmadi. Keyinroq qayta urinib ko'ring.",
      timeoutMessage: "AI tekshiruv vaqti tugadi (Timeout)",
    },
  ),
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
      throw new ApiError(startRes?.detail || "Kodni ishga tushirib bo'lmadi", { status: 503, data: startRes });
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
        throw new ApiError(statusRes?.error || "Kodni ishga tushirishda xatolik yuz berdi", { status: 503, data: statusRes });
      }
    }
    throw new ApiError("Kod ishga tushirish vaqti tugadi (Timeout)", { status: 504 });
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
    _assertUploadSize(pdfFile, AI_PDF_MAX_BYTES);
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
    throw new ApiError("PDF tahlil qilish vaqti tugadi (Timeout)", { status: 504 });
  },
  // Word (.docx) matnidan AI yordamida savol ajratish. extractPdfQuestions bilan
  // bir xil oqim (Celery task → status polling); backend kesh kaliti PDF bilan
  // bir xil bo'lgani uchun status mavjud pdf-preview/<task_id>/status/ orqali
  // o'qiladi. Farqi: .docx fayl `word` form key bilan yuboriladi.
  extractWordAiQuestions: async (wordFile, payload, token, signal) => {
    const aborted = () => signal && signal.aborted;
    if (aborted()) throw new ApiError('aborted', { status: 0 });
    _assertUploadSize(wordFile, AI_IMPORT_MAX_BYTES);
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
    throw new ApiError("Word tahlil qilish vaqti tugadi (Timeout)", { status: 504 });
  },
  updateQuestion: (questionId, payload, token) => request(`/api/questions/${questionId}/`, { method: 'PATCH', body: payload, token }),
  deleteQuestion: (questionId, token) => request(`/api/questions/${questionId}/`, { method: 'DELETE', token }),
  // Sifatsiz savolni platforma admini tekshiruviga qo'yish (markaz xodimlari
  // uchun). Savol YASHIRILMAYDI — bayroq faqat navbatga tushadi. Shu savolda
  // ochiq bayroq allaqachon bo'lsa xato emas: javob `created: false` bo'ladi.
  flagQuestion: (questionId, reason, token) => request(`/api/questions/${questionId}/flag/`, { method: 'POST', body: { reason }, token }),
  // Tadbir uchun xuddi shu yo'l (`flag_type='olympiad'`): sarlavha/tavsif
  // nomaqbul bo'lsa markaz xodimi uni admin navbatiga qo'yadi. Tadbir
  // to'xtatilmaydi — ketayotgan imtihon buzilmasin.
  flagOlympiad: (olympiadId, reason, token) => request(`/api/olympiads/${olympiadId}/flag/`, { method: 'POST', body: { reason }, token }),
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
  // Javoblarni topshirish — foydalanuvchi uchun ENG QIMMAT so'rov: server
  // baholaydi, reyting va sertifikatni yozadi, va 100+ o'quvchi bir vaqtda
  // topshirganda navbat yig'iladi. Erta uzilish o'quvchiga "ishlaringiz
  // ketmadi" degan taassurot beradi (aslida server yozayotgan bo'ladi), shu
  // sababli saxiy chegara.
  submitAttempt: (payload, token) => request('/api/attempts/', { method: 'POST', body: payload, token, timeoutMs: HEAVY_REQUEST_TIMEOUT_MS }),
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
  // Mashq javoblarini topshirish ham baholanadi va yozuv qoldiradi —
  // submitAttempt bilan bir xil sababdan uzunroq chegara.
  // `idempotent: false` — MAJBURIY: backend mashq sessiyasini cache'da saqlaydi
  // va birinchi muvaffaqiyatli submit'da uni O'CHIRADI. Javob yo'lda yo'qolgan
  // holatda avtomatik qayta yuborish 410 ("Sessiya muddati tugagan yoki
  // topilmadi. Qaytadan boshlang.") oladi va testni ROSTDAN yakunlagan o'quvchi
  // natija o'rniga xato ko'rardi. submitAttempt esa xavfsiz — u yerda unique
  // constraint bor va dublikat POST mavjud attemptni qaytaradi.
  submitPractice: (body, token) => request('/api/practice/submit/', { method: 'POST', body, token, timeoutMs: HEAVY_REQUEST_TIMEOUT_MS, idempotent: false }),
  getWrongAnswerSubjects: (token) => request('/api/practice/wrong-answers/', { token }),
  startWrongAnswerPractice: (body, token) => request('/api/practice/wrong-answers/start/', { method: 'POST', body, token }),
  // AI yechim tushuntirishi. Tushuntirish bazada bo'lsa backend darhol
  // { explanation } qaytaradi (task_id yo'q → pollAiTask javobni o'zini beradi);
  // aks holda Celery task boshlanadi va natija polling bilan olinadi.
  explainQuestion: async (questionId, token, signal) => pollAiTask(
    await request(`/api/questions/${questionId}/explain/`, { method: 'POST', token, signal, timeoutMs: AI_REQUEST_TIMEOUT_MS }),
    (taskId) => `/api/questions/explain/${taskId}/status/`,
    {
      token,
      signal,
      failMessage: "AI yordamida tushuntirish generatsiya qilinmadi. Iltimos keyinroq urinib ko'ring.",
      timeoutMessage: "Tushuntirish olish vaqti tugadi (Timeout)",
    },
  ),
  // Billing / To'lov
  // Aktiv obuna rejalari — Landing'da ochiq ko'rsatiladi, autentifikatsiya talab qilinmaydi.
  getSubscriptionPlans: () => request(`/api/billing/plans/?_t=${Date.now()}`, { retryOnAuth: false }),
  // Checkout — IDEMPOTENT EMAS: backend har chaqiruvda shartsiz yangi
  // PaymentTransaction yozadi. Shu sababli ikki chora birga:
  //   * `idempotent: false` — avtomatik qayta urinish YO'Q. Aks holda javob
  //     yo'lda yo'qolgan (lekin server qabul qilgan) so'rov ikkinchi marta
  //     yuborilib, ikkita "kutilmoqda" tranzaksiya qolardi;
  //   * saxiy vaqt chegarasi — soxta timeout foydalanuvchini tugmani QAYTA
  //     bosishga undaydi, bu ham aynan o'sha dublikatni yaratadi.
  // To'lov paytida boshqa ilovaga (SMS kodi uchun) o'tish mutlaqo normal
  // xatti-harakat, ya'ni "tab fonda" holati bu yerda tez-tez uchraydi.
  //
  // ATAYIN shunday qoldirilgan: `idempotent: false` bu yerda uyqu/fon-tab
  // desensitizatsiyasini ham o'chiradi (soxta timeout ham qayta urinilmaydi).
  // Ularni ajratishning foydasi yo'q — ikkala yo'lda ham dublikat PENDING
  // yozuv paydo bo'ladi, farqi faqat foydalanuvchi bundan xabardor bo'lish-
  // bo'lmasligida, va hozirgi holat avvalgisidan (15s + to'liq qayta urinish)
  // baribir yaxshiroq. To'g'ri yechim — backendda idempotentlik kaliti
  // (bir xil kalitli takroriy so'rov mavjud tranzaksiyani qaytarsin); u
  // alohida ish sifatida bajariladi.
  createCheckoutSession: (payload, token) => request('/api/billing/checkout/', { method: 'POST', body: payload, token, timeoutMs: HEAVY_REQUEST_TIMEOUT_MS, idempotent: false }),
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
  // Umumiy xatolar tahlili. Xato bo'lmasa backend darhol { explanation }
  // qaytaradi (task_id yo'q); aks holda Celery task + polling.
  explainAllMistakes: async (token, signal) => pollAiTask(
    await request('/api/attempts/mistakes/explain/', { method: 'POST', token, signal, timeoutMs: AI_REQUEST_TIMEOUT_MS }),
    (taskId) => `/api/attempts/mistakes/explain/${taskId}/status/`,
    {
      token,
      signal,
      failMessage: "AI yordamida xatolar tahlili generatsiya qilinmadi. Iltimos keyinroq urinib ko'ring.",
      timeoutMessage: "Tahlil olish vaqti tugadi (Timeout)",
    },
  ),
  // Reward Shop
  getRewards: (token) => request('/api/me/rewards/', { token }),
  // Sovg'ani sotib olish — `idempotent: false` MAJBURIY. Backend har chaqiruvda
  // yangi `RewardRedemption` yozadi; modelda `(user, product)` bo'yicha unique
  // constraint YO'Q, ya'ni takroriy so'rov tangalarni IKKINCHI marta yechadi va
  // omborni (stock) yana kamaytiradi. Kod ichidagi IntegrityError tutqichi bu
  // yerda umuman ishga tushmaydi — tutadigan constraint mavjud emas.
  redeemReward: (productId, token) => request('/api/me/rewards/redeem/', { method: 'POST', body: { product_id: productId }, token, idempotent: false }),
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
  // AI o'quv rejasi. Yetarli natija bo'lmasa backend darhol { plan: [], detail }
  // qaytaradi (task_id yo'q); aks holda Celery task + polling.
  getStudyPlan: async (token, signal) => pollAiTask(
    await request('/api/me/study-plan/', { method: 'POST', token, signal, timeoutMs: AI_REQUEST_TIMEOUT_MS }),
    (taskId) => `/api/me/study-plan/${taskId}/status/`,
    {
      token,
      signal,
      failMessage: "Rejani olib bo'lmadi",
      timeoutMessage: "Reja olish vaqti tugadi (Timeout)",
    },
  ),
  // Shaxsiy AI test generatori — Plus+ tier. Fan/mavzu/qiyinlik yuboriladi,
  // backend 10 ta ko'p tanlovli savol qaytaradi (saqlanmaydi). Baholash
  // client-side (savollarda correct_answer indeksi bor). Tier yetmasa backend
  // 403 { detail, upgrade_required, required_tier } qaytaradi.
  // Bu endpoint Celery'ga CHIQMAYDI — Gemini so'rov ichida sinxron chaqiriladi
  // (10 ta savol), shu sababli AI chegarasi majburiy: default 30s da so'rov
  // deyarli har safar "server javob bermadi" bo'lib uzilardi.
  generateCustomTest: (payload, token) => request('/api/me/custom-test/', { method: 'POST', body: payload, token, timeoutMs: AI_REQUEST_TIMEOUT_MS }),
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
  // `idempotent: false` — takroriy yuborish 400 "Siz bu mashqni allaqachon
  // yakunlagansiz" beradi va OlympiadTest uni xato banneri qilib ko'rsatib,
  // natijani umuman ochmaydi. Eng xavfli payt — vaqt tugagandagi AVTOMATIK
  // yuborish: u aynan tarmoq sekin bo'lgan lahzada ishga tushadi.
  submitMockOlympiad: (mockId, body, token) => request(`/api/mock-olympiads/${mockId}/submit/`, { method: 'POST', body: body || {}, token, timeoutMs: HEAVY_REQUEST_TIMEOUT_MS, idempotent: false }),
  // O'qituvchi/Manager analitikasi — eng ko'p noto'g'ri savollar.
  getQuestionAnalytics: (centerId, token) => request(`/api/questions/analytics/?center=${centerId}`, { token }),
  // Platforma admini — retention/conversion/premium metrikalari (Tahlil tabi).
  // Faqat is_platform_admin uchun (403 boshqa rollarga). `refresh=1` cache'ni
  // chetlab o'tib qayta hisoblaydi.
  // Chegara: HEAVY. Bu bloklar backend'da 10 daqiqaga cache'lanadi AYNAN
  // og'irligi uchun — cache sovuq bo'lganda (yoki `refresh=1` da) hisob butun
  // jadval bo'yicha ketadi va default chegaraga sig'masligi mumkin.
  getAdminMetrics: (token, { refresh = false } = {}) =>
    request(`/api/analytics/metrics/${refresh ? '?refresh=1' : ''}`, { token, timeoutMs: HEAVY_REQUEST_TIMEOUT_MS }),
  // Platforma admini — hozir onlayn foydalanuvchilar soni (Boshqaruv paneli).
  // `getAdminMetrics`dan alohida, chunki u 10 daqiqa cache'lanadi; bu esa
  // cache'siz va yengil, har 15 soniyada so'raladi. Javob:
  // {online_count, window_minutes}. Redis sozlanmagan bo'lsa online_count=null.
  getOnlineCount: (token) => request('/api/analytics/online/', { token }),
  // Platforma admini — "Hozir onlayn" kartasi bosilganda ochiladigan ro'yxat:
  // BARCHA foydalanuvchilar, har birida `is_online` bayrog'i (onlaynlar ro'yxat
  // boshida). `getAdminUsers` kabi backend sahifalab qaytaradi va bu yerda
  // to'liq ro'yxat kerak — requestAllPages barcha sahifalarni yig'adi.
  // `is_online: null` = Redis javob bermadi, ya'ni "ma'lumot yo'q" (oflayn EMAS).
  getOnlineUsers: (token) => requestAllPages(
    '/api/analytics/online/users/',
    { token, pageSize: 100 },
  ),
  // Admin panel "Tahlil" tabidagi kengaytirilgan diagrammalar (faqat admin).
  // Har biri alohida endpoint — bo'sh jadvalda backend bo'sh massiv qaytaradi.
  // Quyidagilar ham getAdminMetrics bilan bir xil cache/og'irlikda va admin
  // paneli ularni BIR VAQTDA yuklaydi (parallel so'rovlar bir-birini
  // sekinlashtiradi) — shu sababli hammasi HEAVY chegarada.
  getAttemptsTrend: (token) => request('/api/analytics/attempts-trend/', { token, timeoutMs: HEAVY_REQUEST_TIMEOUT_MS }),
  // Eslatma: yuqorida `getOlympiadStats(olympiadId, token)` allaqachon mavjud
  // (bitta olimpiada statistikasi — OwnerDashboard/ManagerDashboard ishlatadi).
  // Bu admin analitikasi alohida nom oladi (getOlympiadAnalytics), aks holda
  // obyektda nom to'qnashib eski metod yo'qolardi.
  getOlympiadAnalytics: (token) => request('/api/analytics/olympiad-stats/', { token, timeoutMs: HEAVY_REQUEST_TIMEOUT_MS }),
  getQuestionStats: (token) => request('/api/analytics/question-stats/', { token, timeoutMs: HEAVY_REQUEST_TIMEOUT_MS }),
  getRevenueTrend: (token) => request('/api/analytics/revenue-trend/', { token, timeoutMs: HEAVY_REQUEST_TIMEOUT_MS }),
  getCenterAnalytics: (token) => request('/api/analytics/center-stats/', { token, timeoutMs: HEAVY_REQUEST_TIMEOUT_MS }),
  // Suiiste'mol signallari: bayroq/ogohlantirish dinamikasi, eng ko'p
  // ogohlantirilgan hisoblar va kontent portlashi. FAQAT o'qish uchun —
  // hech kim bloklanmaydi, bayroq ham qo'yilmaydi (chora "Xavfsizlik"
  // tabidagi moderatsiya navbatida ko'riladi).
  getAbuseStats: (token) => request('/api/analytics/abuse-stats/', { token, timeoutMs: HEAVY_REQUEST_TIMEOUT_MS }),
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
  // Backend Gemini'ni SINXRON chaqiradi (model/kalit fallback bilan): eng yomon
  // holat ~12s server ichida + tarmoq. Default chegarada bu javob chegaraga
  // juda yaqin kelib, widjetning O'Z xabari "server javob bermadi" bo'lib
  // qulardi — ya'ni yordam oynasi yordam bera olmasdan xato ko'rsatardi.
  sendSupportChat: (messages, token, sessionId) => request('/api/support/chat/', { method: 'POST', body: { messages, session_id: sessionId }, token, timeoutMs: HEAVY_REQUEST_TIMEOUT_MS }),
  // `silent`: bu AI widjetning fon (passiv) tarix preload'i — u qulasa
  // widjetni avtomatik ochib "server bilan bog'lanishda muammo" ko'rsatmaymiz
  // (widjet o'zining loadHistory catch'ida xatoni jimgina yutadi).
  getSupportChatHistory: (token, sessionId) => request(`/api/support/chat/?session_id=${sessionId || ''}`, { token, silent: true }),
  getAdminSupportChats: (token) => request('/api/admin/support/chats/', { token }),
  getAdminSupportChatDetail: (chatKey, token) => request(`/api/admin/support/chats/${chatKey}/`, { token }),
  sendAdminSupportReply: (chatKey, text, token) => request(`/api/admin/support/chats/${chatKey}/reply/`, { method: 'POST', body: { text }, token }),
};

Object.assign(globalThis, { OlympyApi });
