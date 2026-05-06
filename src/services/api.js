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
const AUTH_USER_KEY = 'olympy_api_user';

// Default rejimda env var orqali tanlangan store ishlatiladi (local yoki
// session). "Meni eslab qolish" bayrog'i orqali saveAuth chaqiruvchisi
// yopilganda token tozalanishi uchun aniq sessionStorage'ni majburlay oladi.
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
  // Avvalgi sessiyada qaysi store ishlatilganini bilmasligimiz mumkin (masalan,
  // restore paytida) — shu sababli har ikkalasidan ham qidiramiz.
  try {
    const a = _activeAuthStore ? _activeAuthStore.getItem(key) : null;
    if (a != null) return a;
  } catch {}
  try {
    if (_localStore && _localStore !== _activeAuthStore) {
      const b = _localStore.getItem(key);
      if (b != null) return b;
    }
  } catch {}
  try {
    if (_sessionStore && _sessionStore !== _activeAuthStore) {
      const c = _sessionStore.getItem(key);
      if (c != null) return c;
    }
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
      // Token muddati tugagan yoki tan olinmagan — auth state'ni tozalab,
      // qatlam yuqorisidagi App'ga signal beramiz.
      _removeAuth(AUTH_TOKEN_KEY);
      _removeAuth(AUTH_REFRESH_KEY);
      _removeAuth(AUTH_USER_KEY);
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
    phone: user.normalized_phone || user.phone,
    avatarUrl: makeAssetUrl(user.avatar_url || user.avatarUrl || ''),
    password: '',
    roles,
    activeRole,
    joined: (user.created_at || '').slice(0, 10),
    isPlatformAdmin: !!user.is_platform_admin,
    isActive: user.is_active !== false,
    telegramLinked: !!user.telegram_linked,
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
  if (cookieAuth) {
    _removeAuth(AUTH_TOKEN_KEY);
    _removeAuth(AUTH_REFRESH_KEY);
  } else {
    if (token) _writeAuth(AUTH_TOKEN_KEY, token);
    if (refresh) _writeAuth(AUTH_REFRESH_KEY, refresh);
  }
  if (user) _writeAuth(AUTH_USER_KEY, JSON.stringify(user));
};

const loadAuth = () => {
  const token = _readAuth(AUTH_TOKEN_KEY);
  const refresh = _readAuth(AUTH_REFRESH_KEY);
  const rawUser = _readAuth(AUTH_USER_KEY);
  if (!rawUser) return null;
  try { return { token, refresh, user: JSON.parse(rawUser) }; } catch { return null; }
};

const clearAuth = () => {
  _removeAuth(AUTH_TOKEN_KEY);
  _removeAuth(AUTH_REFRESH_KEY);
  _removeAuth(AUTH_USER_KEY);
  try { request('/api/auth/logout/', { method: 'POST', retryOnAuth: false }); } catch {}
};

const getToken = () => _readAuth(AUTH_TOKEN_KEY);

export const OlympyApi = {
  API_BASE_URL,
  ApiError,
  toUserMessage,
  mapBackendUser,
  saveAuth,
  loadAuth,
  clearAuth,
  getToken,
  // Auth
  login: (payload) => request('/api/auth/login/', { method: 'POST', body: payload }),
  register: (payload) => request('/api/auth/register/', { method: 'POST', body: payload }),
  registerOrganization: (payload) => request('/api/auth/register-organization/', { method: 'POST', body: payload }),
  refreshToken: (refresh) => request('/api/auth/token/refresh/', { method: 'POST', body: refresh ? { refresh } : undefined, retryOnAuth: false }),
  startTelegramVerification: (payload) => request('/api/auth/phone/start-telegram-verification/', { method: 'POST', body: payload }),
  startTelegramLink: (token) => request('/api/auth/telegram/link/start/', { method: 'POST', token }),
  verifyOtp: (payload) => request('/api/auth/phone/verify-otp/', { method: 'POST', body: payload }),
  // Me
  getMe: (token) => request('/api/me/', { token }),
  uploadMyAvatar: (imageFile, token) => {
    const fd = new FormData();
    fd.append('avatar', imageFile);
    return request('/api/auth/me/avatar/', { method: 'POST', body: fd, token });
  },
  // Centers
  getCenters: () => request('/api/centers/').then(unwrapList),
  getMyCenters: (token) => request('/api/centers/mine/', { token }).then(unwrapList),
  registerCenter: (payload, token) => request('/api/centers/', { method: 'POST', body: payload, token }),
  uploadCenterImage: (centerId, imageFile, token) => {
    const fd = new FormData();
    fd.append('image', imageFile);
    return request(`/api/centers/${centerId}/image/`, { method: 'POST', body: fd, token });
  },
  joinCenter: (centerId, payload, token) => request(`/api/centers/${centerId}/join/`, { method: 'POST', body: payload, token }),
  getPendingMemberships: (centerId, role, token) => request(`/api/centers/${centerId}/memberships/pending/${role ? '?role=' + role : ''}`, { token }).then(unwrapList),
  getStaffMemberships: (centerId, role, token) => request(`/api/centers/${centerId}/memberships/staff/${role ? '?role=' + encodeURIComponent(role) : ''}`, { token }).then(unwrapList),
  getStudentMemberships: (centerId, statusFilter, token) => request(`/api/centers/${centerId}/memberships/students/${statusFilter ? '?status=' + encodeURIComponent(statusFilter) : ''}`, { token }).then(unwrapList),
  createManager: (centerId, payload, token) => request(`/api/centers/${centerId}/managers/create/`, { method: 'POST', body: payload, token }),
  createTeacher: (centerId, payload, token) => request(`/api/centers/${centerId}/teachers/create/`, { method: 'POST', body: payload, token }),
  approveStudent: (centerId, payload, token) => request(`/api/centers/${centerId}/approve-student/`, { method: 'POST', body: payload, token }),
  approveTeacher: (centerId, payload, token) => request(`/api/centers/${centerId}/approve-teacher/`, { method: 'POST', body: payload, token }),
  approveManager: (centerId, payload, token) => request(`/api/centers/${centerId}/approve-manager/`, { method: 'POST', body: payload, token }),
  getAdminCenters: (statusFilter, token) => request(`/api/admin/centers/${statusFilter ? '?status=' + statusFilter : ''}`, { token }).then(unwrapList),
  adminApproveCenter: (centerId, token) => request(`/api/admin/centers/${centerId}/approve/`, { method: 'POST', token }),
  adminRejectCenter: (centerId, token) => request(`/api/admin/centers/${centerId}/reject/`, { method: 'POST', token }),
  // Admin users
  getAdminUsers: (token) => request('/api/admin/users/', { token }).then(unwrapList),
  adminSetUserActive: (userId, isActive, token) => request(`/api/admin/users/${userId}/set-active/`, { method: 'POST', body: { is_active: !!isActive }, token }),
  // Subjects
  getSubjects: (token) => request('/api/subjects/', { token }),
  createSubject: (name, token) => request('/api/subjects/', { method: 'POST', body: { name }, token }),
  // Olympiads
  getOlympiads: (token) => request('/api/olympiads/', { token }).then(unwrapList),
  createOlympiad: (payload, token) => request('/api/olympiads/', { method: 'POST', body: payload, token }),
  getOlympiadQuestions: (olympiadId, token) => request(`/api/olympiads/${olympiadId}/questions/`, { token }),
  updateOlympiad: (olympiadId, payload, token) => request(`/api/olympiads/${olympiadId}/`, { method: 'PATCH', body: payload, token }),
  updateOlympiadQuestions: (olympiadId, questionIds, token) => request(`/api/olympiads/${olympiadId}/`, { method: 'PATCH', body: { question_ids: questionIds }, token }),
  publishOlympiad: (olympiadId, token) => request(`/api/olympiads/${olympiadId}/publish/`, { method: 'POST', token }),
  deactivateOlympiad: (olympiadId, token) => request(`/api/olympiads/${olympiadId}/deactivate/`, { method: 'POST', token }),
  finishOlympiad: (olympiadId, token) => request(`/api/olympiads/${olympiadId}/finish/`, { method: 'POST', token }),
  // Questions
  getQuestions: (centerId, token) => request(`/api/questions/?center=${centerId}`, { token }).then(unwrapList),
  createQuestion: (payload, token) => request('/api/questions/', { method: 'POST', body: payload, token }),
  generateAiQuestions: (payload, token) => request('/api/questions/generate-ai/', { method: 'POST', body: payload, token }),
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
  getMyResults: (token) => request('/api/results/me/', { token }).then(unwrapList),
  getMyStats: (token) => request('/api/results/me/stats/', { token }),
  getLeaderboard: (olympiadId, token) => request(`/api/leaderboard/${olympiadId ? '?olympiad=' + olympiadId : ''}`, { token }).then(unwrapList),
  // Notifications
  getNotifications: (token) => request('/api/notifications/', { token }).then(unwrapList),
  markNotificationRead: (id, token) => request(`/api/notifications/${id}/read/`, { method: 'POST', token }),
  markAllNotificationsRead: (token) => request('/api/notifications/read-all/', { method: 'POST', token }),
};

Object.assign(globalThis, { OlympyApi });
