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
  if (typeof data === 'string') return data;
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
  if (!error?.status) {
    return "Server bilan bog‘lanishda xatolik yuz berdi";
  }
  return error?.message || "Server bilan bog‘lanishda xatolik yuz berdi";
};

// ─── Token refresh "single-flight" ──────────────────────────────────────────
// Parallel so'rovlar bir vaqtda 401 olsa, har biri alohida refresh chaqirardi.
// Birinchi refresh tokenni rotate qilib eski refresh tokenni blacklist qiladi,
// qolgan refresh'lar esa blacklisted token bilan muvaffaqiyatsiz bo'lib,
// foydalanuvchi logout bo'lardi. Yechim: bitta shared in-flight Promise —
// barcha 401 olgan so'rovlar bitta refresh natijasini kutadi.
let _refreshInFlight = null;
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
    if (nextToken || refreshed?.cookie_auth) {
      if (refreshed?.cookie_auth) {
        _removeAuth(AUTH_TOKEN_KEY);
        _removeAuth(AUTH_REFRESH_KEY);
      } else {
        if (nextToken) _writeAuth(AUTH_TOKEN_KEY, nextToken);
        if (nextRefresh) _writeAuth(AUTH_REFRESH_KEY, nextRefresh);
      }
      return { token: nextToken };
    }
    throw new ApiError('Refresh failed', { status: 401 });
  })().finally(() => {
    _refreshInFlight = null;
  });
  return _refreshInFlight;
};

const request = async (
  path,
  { method = 'GET', body, token, headers = {}, retryOnAuth = true, keepalive = false, signal } = {},
) => {
  const requestHeaders = {
    Accept: 'application/json',
    ...headers,
  };
  // FormData / multipart bodies must be sent with the browser-supplied
  // multipart boundary; do not set Content-Type and do not stringify.
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !isFormData) requestHeaders['Content-Type'] = 'application/json';
  if (token) requestHeaders.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: requestHeaders,
      credentials: 'include',
      keepalive,
      signal,
      body: body === undefined
        ? undefined
        : (isFormData ? body : JSON.stringify(body)),
    });
  } catch (error) {
    // AbortController.abort() — chaqiruvchi (masalan, unmount bo'lgan komponent)
    // so'rovni atayin bekor qilgan. Buni "server bilan bog'lanish xatosi" deb
    // ko'rsatmaymiz; chaqiruvchi catch'da abort'ni jimgina yutadi.
    if (error?.name === 'AbortError') {
      throw new ApiError('aborted', { status: 0 });
    }
    throw new ApiError("Server bilan bog‘lanishda xatolik yuz berdi", { status: 0 });
  }

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    if (response.status === 401) {
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
        } catch {}
      }
      // retryOnAuth=false bo'lsa (login, register kabi public endpoint'lar):
      // logout qilmaymiz, serverdan kelgan xato xabarini ko'rsatamiz.
      if (!retryOnAuth) {
        throw new ApiError(extractErrorMessage(data) || "Telefon yoki parol noto'g'ri", { status: 401, data });
      }
      // Submit/cheating endpoint'lari uchun MAJBURIY logout qilmaymiz —
      // foydalanuvchi olimpiada vaqtida tasodifan hisobdan chiqarilmasin
      // va javoblari yo'qolmasin. Submit'da token muddati tugagan bo'lsa
      // frontend dialog ko'rsatib qayta login so'raydi.
      const isExamWritePath = (
        path.includes('/attempts/')
        || path.startsWith('/api/attempts')
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
    throw new ApiError(extractErrorMessage(data) || response.statusText, {
      status: response.status,
      data,
    });
  }
  return data;
};

// Higher index wins. Used to pick activeRole when a user has multiple
// roles approved at the same time. admin > owner > manager > teacher > student.
const ROLE_PRIORITY = ['student', 'teacher', 'manager', 'owner', 'admin', 'parent'];

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
  // tozalanadi. Default true (avvalgi xatti-harakat).
  if (persistent === false && _sessionStore) {
    _setActiveStore(_sessionStore);
  } else if (persistent === true && _localStore) {
    _setActiveStore(_localStore);
  } else {
    _setActiveStore(_defaultAuthStore);
  }
  // XAVFSIZLIK: Token va refresh tokenlarni localStorage/sessionStorage'da saqlamaymiz.
  // Ular faqat HttpOnly Secure cookie qatlami orqali brauzer tomonidan avtomatik yuboriladi.
  _removeAuth(AUTH_TOKEN_KEY);
  _removeAuth(AUTH_REFRESH_KEY);
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
  // token/refresh har doim null — ular cookie'da yashaydi. Eski chaqiruvchilar
  // `loadAuth()?.token` kutgani uchun shaklni saqlab qolamiz (ular allaqachon
  // null token bilan cookie auth orqali ishlaydi).
  return { token: null, refresh: null, user };
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
  _clearCachedUser();
  _clearSwApiCache();
  // await — logout so'rovi tugashini kutamiz, aks holda refresh token
  // server tomonda blacklist'ga tushmasdan qolib ketishi mumkin (fetch
  // boshlanmasdan sahifa o'zgarsa). Chaqiruvchilar natijani kutmaydi.
  try { await request('/api/auth/logout/', { method: 'POST', retryOnAuth: false }); } catch {}
};

const getToken = () => null;

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
  // Auth
  login: (payload) => request('/api/auth/login/', { method: 'POST', body: payload, retryOnAuth: false }),
  register: (payload) => request('/api/auth/register/', { method: 'POST', body: payload, retryOnAuth: false }),
  registerOrganization: (payload) => request('/api/auth/register-organization/', { method: 'POST', body: payload, retryOnAuth: false }),
  refreshToken: (refresh) => request('/api/auth/token/refresh/', { method: 'POST', body: refresh ? { refresh } : undefined, retryOnAuth: false }),
  startTelegramVerification: (payload) => request('/api/auth/phone/start-telegram-verification/', { method: 'POST', body: payload, retryOnAuth: false }),
  startPasswordReset: (payload) => request('/api/auth/password-reset/start/', { method: 'POST', body: payload, retryOnAuth: false }),
  confirmPasswordReset: (payload) => request('/api/auth/password-reset/confirm/', { method: 'POST', body: payload, retryOnAuth: false }),
  startTelegramLink: (token) => request('/api/auth/telegram/link/start/', { method: 'POST', token }),
  verifyOtp: (payload) => request('/api/auth/phone/verify-otp/', { method: 'POST', body: payload, retryOnAuth: false }),
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
  // Hisobni butunlay o'chirish — barcha ma'lumotlar (natijalar, a'zoliklar)
  // backend tomonidan o'chiriladi. Qaytarib bo'lmaydi. 401 bo'lsa qayta auth
  // urinmaymiz (hisob allaqachon o'chgan bo'lishi mumkin).
  deleteMyAccount: (token) => {
    return request('/api/auth/me/', { method: 'DELETE', token, retryOnAuth: false });
  },
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
  getAdminCenters: (statusFilter, token) => request(`/api/admin/centers/${statusFilter ? '?status=' + statusFilter : ''}`, { token }).then(unwrapList),
  adminApproveCenter: (centerId, token) => request(`/api/admin/centers/${centerId}/approve/`, { method: 'POST', token }),
  adminRejectCenter: (centerId, token) => request(`/api/admin/centers/${centerId}/reject/`, { method: 'POST', token }),
  // Admin users
  // Raw paginated response qaytaramiz — count/next ma'lumotlari admin
  // panelida pagination uchun kerak. unwrapList ularni yo'qotardi.
  // Backend page'ni ?page= / ?search= bilan qabul qiladi.
  getAdminUsers: (token, { page, search } = {}) => {
    const params = new URLSearchParams();
    if (page) params.set('page', page);
    if (search) params.set('search', search);
    const qs = params.toString();
    return request(`/api/admin/users/${qs ? '?' + qs : ''}`, { token })
      .then((res) => {
        if (Array.isArray(res)) return { results: res, count: res.length, next: null, previous: null };
        return {
          results: (res && res.results) || [],
          count: (res && res.count) || 0,
          next: (res && res.next) || null,
          previous: (res && res.previous) || null,
        };
      });
  },
  adminSetUserActive: (userId, isActive, token) => request(`/api/admin/users/${userId}/set-active/`, { method: 'POST', body: { is_active: !!isActive }, token }),
  adminToggleUserPremium: (userId, payload, token) => request(`/api/admin/users/${userId}/toggle-premium/`, { method: 'POST', body: payload, token }),
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
  getQuestions: (centerId, token) => requestAllPages(`/api/questions/?center=${centerId}`, { token }),
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
  gradeEssayAnswer: (attemptId, questionId, payload, token) =>
    request(`/api/attempts/${attemptId}/essay-answers/${questionId}/grade/`, { method: 'POST', body: payload, token }),
  extractPdfQuestions: (pdfFile, payload, token) => {
    const fd = new FormData();
    fd.append('pdf', pdfFile);
    Object.keys(payload || {}).forEach(k => {
      const v = payload[k];
      if (v == null) return;
      fd.append(k, String(v));
    });
    return request('/api/questions/pdf-preview/', { method: 'POST', body: fd, token });
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
  pingTestSession: (olympiadId, answeredCount, tabEscapes, token, deviceId) => request('/api/attempts/ping/', { method: 'POST', body: { olympiad: olympiadId, answered_count: answeredCount, tab_escapes: tabEscapes, device_id: deviceId }, token }),
  getOlympiadLiveProctoring: (olympiadId, token) => request(`/api/manager/olympiads/${olympiadId}/live/`, { token }),
  // Bitta attemptni olib kelish — Leaderboard "Ko'rish" tugmasi va Results
  // sahifasi uchun. Backend olympiad detail'ni ham qo'shib qaytaradi.
  getAttempt: (attemptId, token) => request(`/api/attempts/${attemptId}/`, { token }),
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
  // Parent / Ota-ona
  linkChild: (studentPhone, token) => request('/api/me/parent/link/', { method: 'POST', body: { student_phone: studentPhone }, token }),
  getChildren: (token) => request('/api/me/parent/children/', { token }),
  unlinkChild: (studentId, token) => request(`/api/me/parent/link/${studentId}/`, { method: 'DELETE', token }),
  // O'quvchi tomoni: o'ziga "farzand" sifatida qo'shilmoqchi bo'lgan
  // ota-onalarning kutilayotgan so'rovlari. Backend: views_parent.
  // list_parent_requests / respond_parent_request / confirm_parent.
  listParentRequests: (token) => request('/api/me/parent-requests/', { token }).then(unwrapList),
  // Bitta so'rovni tasdiqlash/rad etish (link_id URL'da). accept=true|false.
  respondParent: (linkId, accept, token) => request(`/api/me/parent-requests/${linkId}/respond/`, { method: 'POST', body: { accept: !!accept }, token }),
  // Qulay muqobil: link_id yoki parent_id orqali tasdiqlash/rad etish.
  confirmParent: (payload, token) => request('/api/me/confirm-parent/', { method: 'POST', body: payload || {}, token }),
  childReportDownloadUrl: (studentId) => `${API_BASE_URL}/api/me/parent/children/${studentId}/report/`,
  downloadChildReport: async (studentId, token) => {
    const res = await fetch(`${API_BASE_URL}/api/me/parent/children/${studentId}/report/`, {
      method: 'GET',
      headers: { Authorization: token ? `Bearer ${token}` : '' },
      credentials: 'include',
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const err = new Error(errData.detail || "Hisobot yuklab bo'lmadi");
      err.status = res.status;
      err.data = errData;
      throw err;
    }
    return res.blob();
  },
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
  getWeeklyContest: (token) => request('/api/weekly-contest/', { token }),
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
  getChildPredictions: (studentId, token) => request(`/api/me/parent/children/${studentId}/predictions/`, { token }),
  // Weekly Digest Toggle & Test Send
  toggleWeeklyDigest: (studentId, enabled, token) => request(`/api/me/parent/children/${studentId}/toggle-digest/`, { method: 'POST', body: { enabled }, token }),
  sendTestWeeklyDigest: (studentId, token) => request(`/api/me/parent/children/${studentId}/test-digest/`, { method: 'POST', token }),
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
  // ─── B2B / O'sish (growth) funksiyalari ───
  // Feature #1: B2B markaz onboarding — owner sehrgarini tugatish/o'tkazib yuborish.
  completeCenterOnboarding: (token) => request('/api/me/center-onboarding/', { method: 'PATCH', token }),
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
  // Feature #6: Markaz brendi (white-label) — faqat owner. body {brand_color, custom_domain?}.
  updateCenterBranding: (centerId, body, token) => request(`/api/centers/${centerId}/branding/`, { method: 'PATCH', body, token }),
  // Feature #7: Referral — o'z kodi/statistikasi va boshqa kodni ishlatish.
  getReferral: (token) => request('/api/me/referral/', { token }),
  useReferral: (code, token) => request('/api/me/referral/use/', { method: 'POST', body: { code }, token }),
};

Object.assign(globalThis, { OlympyApi });
