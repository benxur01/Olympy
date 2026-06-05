const DEFAULT_API_BASE_URL = import.meta.env?.PROD
  ? (globalThis.location?.origin || '')
  : 'http://localhost:8000';
const API_BASE_URL = (
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

// XAVFSIZLIK: foydalanuvchi profil obyekti (roles, is_premium, isPlatformAdmin
// va h.k.) endi localStorage/sessionStorage'da SAQLANMAYDI. Storage'ga yozilgan
// qiymatni buzg'unchi (yoki foydalanuvchining o'zi) tahrirlab `isPlatformAdmin:
// true` qila olardi — UI faqat ko'rsatish uchun ishlatsa ham, bu client-side
// privilege escalation oynasini ochadi. Buning o'rniga user obyekti faqat
// in-memory (modul-darajali) saqlanadi va sahifa har yangilanganda
// `/api/me/` (cookie'dagi JWT orqali) dan qayta yuklanadi.
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

const request = async (
  path,
  { method = 'GET', body, token, headers = {}, retryOnAuth = true, keepalive = false } = {},
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
      body: body === undefined
        ? undefined
        : (isFormData ? body : JSON.stringify(body)),
    });
  } catch (error) {
    throw new ApiError("Server bilan bog‘lanishda xatolik yuz berdi", { status: 0 });
  }

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    if (response.status === 401) {
      const refresh = retryOnAuth ? _readAuth(AUTH_REFRESH_KEY) : null;
      if (retryOnAuth) {
        try {
          const refreshed = await request('/api/auth/token/refresh/', {
            method: 'POST',
            body: refresh ? { refresh } : undefined,
            retryOnAuth: false,
          });
          const nextToken = refreshed?.access || refreshed?.token;
          const nextRefresh = refreshed?.refresh || refresh;
          if (nextToken || refreshed?.cookie_auth) {
            if (refreshed?.cookie_auth) {
              _removeAuth(AUTH_TOKEN_KEY);
              _removeAuth(AUTH_REFRESH_KEY);
            } else {
              if (nextToken) _writeAuth(AUTH_TOKEN_KEY, nextToken);
              if (nextRefresh) _writeAuth(AUTH_REFRESH_KEY, nextRefresh);
            }
            return request(path, {
              method,
              body,
              token: nextToken || null,
              headers,
              retryOnAuth: false,
            });
          }
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
      _currentUser = null;
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
    isPremium: user.is_premium || false,
    isActive: user.is_active !== false,
    telegramLinked: !!user.telegram_linked,
    streakCount: user.streak_count || 0,
    lastActiveDate: user.last_active_date || null,
    badges: user.badges || [],
    // Retention onboarding (OB1). Eski foydalanuvchilarda maydon yo'q bo'lsa
    // (undefined) wizard'ni ko'rsatmaslik uchun default true — faqat backend
    // aniq `false` qaytarganda wizard ochiladi.
    onboardingCompleted: user.onboarding_completed !== false,
    onboardingGrade: user.onboarding_grade || null,
    onboardingSubjects: Array.isArray(user.onboarding_subjects) ? user.onboarding_subjects : [],
    onboardingGoal: user.onboarding_goal || null,
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
  // User obyekti faqat in-memory saqlanadi (storage'ga yozilmaydi) — XSS /
  // qo'lda tahrir orqali privilege escalation oldini olish uchun. `user`
  // undefined bo'lsa joriy qiymat saqlanib qoladi (faqat token yangilash
  // chaqiruvlarida user'siz saveAuth ishlatiladi).
  if (user !== undefined) _currentUser = user || null;
};

const loadAuth = () => {
  if (!_currentUser) return null;
  // token/refresh har doim null — ular cookie'da yashaydi. Eski chaqiruvchilar
  // `loadAuth()?.token` kutgani uchun shaklni saqlab qolamiz (ular allaqachon
  // null token bilan cookie auth orqali ishlaydi).
  return { token: null, refresh: null, user: _currentUser };
};

const clearAuth = async () => {
  _removeAuth(AUTH_TOKEN_KEY);
  _removeAuth(AUTH_REFRESH_KEY);
  _currentUser = null;
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
  getMe: (token) => request('/api/me/', { token }),
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
  getOlympiads: (token) => request('/api/olympiads/?page_size=200', { token }).then(unwrapList),
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
  // Olimpiada statistikasi va natijalar eksporti (CSV).
  getOlympiadStats: (olympiadId, token) => request(`/api/olympiads/${olympiadId}/stats/`, { token }),
  exportOlympiadResultsUrl: (olympiadId) => `${API_BASE_URL}/api/olympiads/${olympiadId}/export/`,
  exportOlympiadResults: async (olympiadId, token) => {
    const res = await fetch(`${API_BASE_URL}/api/olympiads/${olympiadId}/export/`, {
      method: 'GET',
      headers: { Authorization: token ? `Bearer ${token}` : '' },
      credentials: 'include',
    });
    if (!res.ok) {
      let msg = "Natijalarni eksport qilib bo'lmadi";
      try { const data = await res.json(); if (data?.detail) msg = data.detail; } catch {}
      throw new ApiError(msg, { status: res.status });
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `olympy-results-${olympiadId}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  },
  // Markaz statistikasi (Owner/Manager dashboard).
  getCenterStats: (centerId, token) => request(`/api/centers/${centerId}/stats/`, { token }),
  // Questions
  // page_size=200: backend savollar ro'yxatini paginatsiya qiladi
  // (LargePageNumberPagination). Markazning barcha savollarini bitta
  // round-trip'da olish uchun katta page_size so'raymiz; unwrapList
  // {results:[...]} javobni ham, oddiy massivni ham massivga keltiradi.
  getQuestions: (centerId, token) => request(`/api/questions/?center=${centerId}&page_size=200`, { token }).then(unwrapList),
  createQuestion: (payload, token) => request('/api/questions/', { method: 'POST', body: payload, token }),
  generateAiQuestions: (payload, token) => request('/api/questions/generate-ai/', { method: 'POST', body: payload, token }),
  // IT (kod) savolini AI bilan baholash — test paytida o'quvchi kodini sinaydi.
  // { question_id, submitted_code, language } → { score (0-100|null), review }.
  reviewCode: (payload, token) => request('/api/questions/code-review/', { method: 'POST', body: payload, token }),
  runCode: async (payload, token) => {
    // 1. Yangi asinxron Celery taskini yaratamiz
    const startRes = await request('/api/questions/run-code/start/', { method: 'POST', body: payload, token });
    const taskId = startRes?.task_id;
    if (!taskId) {
      throw new ApiError(startRes?.detail || "Kodni ishga tushirib bo'lmadi");
    }
    
    // 2. Natijani keshdan olguncha polling qilamiz (maksimal 30 soniya)
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const statusRes = await request(`/api/questions/run-code/status/${taskId}/`, { token });
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
  // Parent / Ota-ona
  linkChild: (studentPhone, token) => request('/api/me/parent/link/', { method: 'POST', body: { student_phone: studentPhone }, token }),
  getChildren: (token) => request('/api/me/parent/children/', { token }),
  unlinkChild: (studentId, token) => request(`/api/me/parent/link/${studentId}/`, { method: 'DELETE', token }),
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
  // Premium o'quvchi analitikasi
  getHistoryChart: (token) => request('/api/me/history-chart/', { token }),
  getCompetitorAnalysis: (olympiadId, token) => request(`/api/me/competitor-analysis/${olympiadId ? '?olympiad_id=' + encodeURIComponent(olympiadId) : ''}`, { token }),
  getSubjectWeakness: (token) => request('/api/me/subject-weakness/', { token }),
  getReadiness: (olympiadId, token) => request(`/api/me/readiness/?olympiad_id=${encodeURIComponent(olympiadId)}`, { token }),
  getStudyPlan: (token) => request('/api/me/study-plan/', { method: 'POST', token }),
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
  getRoadmap: (token) => request('/api/me/roadmap/', { token }),
  getProgressComparison: (token) => request('/api/me/progress-comparison/', { token }),
  getClassmatesLeaderboard: (token) => request('/api/me/classmates-leaderboard/', { token }),
  // Premium markaz funksiyalari
  getStudentDynamics: (centerId, token) => request(`/api/centers/${centerId}/student-dynamics/`, { token }),
  getTopStudents: (centerId, token) => request(`/api/centers/${centerId}/top-students/`, { token }),
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
  // Manager Excel eksport (xlsx) — alohida endpoint, manager URL'da.
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
  // O'qituvchi/Manager analitikasi — eng ko'p noto'g'ri savollar.
  getQuestionAnalytics: (centerId, token) => request(`/api/questions/analytics/?center=${centerId}`, { token }),
};

Object.assign(globalThis, { OlympyApi });
