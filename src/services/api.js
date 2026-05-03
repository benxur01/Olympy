const DEFAULT_API_BASE_URL = import.meta.env?.PROD
  ? (globalThis.location?.origin || '')
  : 'http://localhost:8000';
const API_BASE_URL = (
  import.meta.env?.VITE_API_BASE_URL ||
  DEFAULT_API_BASE_URL
).replace(/\/+$/, '');

const AUTH_TOKEN_KEY = 'olympy_api_token';
const AUTH_REFRESH_KEY = 'olympy_refresh_token';
const AUTH_USER_KEY = 'olympy_api_user';

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
  { method = 'GET', body, token, headers = {}, retryOnAuth = true } = {},
) => {
  const requestHeaders = {
    Accept: 'application/json',
    ...headers,
  };
  if (body !== undefined) requestHeaders['Content-Type'] = 'application/json';
  if (token) requestHeaders.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: requestHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    throw new ApiError("Server bilan bog‘lanishda xatolik yuz berdi", { status: 0 });
  }

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    if (response.status === 401) {
      const refresh = retryOnAuth && token
        ? localStorage.getItem(AUTH_REFRESH_KEY)
        : null;
      if (refresh) {
        try {
          const refreshed = await request('/api/auth/token/refresh/', {
            method: 'POST',
            body: { refresh },
            retryOnAuth: false,
          });
          const nextToken = refreshed?.access || refreshed?.token;
          const nextRefresh = refreshed?.refresh || refresh;
          if (nextToken) {
            localStorage.setItem(AUTH_TOKEN_KEY, nextToken);
            if (nextRefresh) localStorage.setItem(AUTH_REFRESH_KEY, nextRefresh);
            return request(path, {
              method,
              body,
              token: nextToken,
              headers,
              retryOnAuth: false,
            });
          }
        } catch {}
      }
      // Token muddati tugagan yoki tan olinmagan — auth state'ni tozalab,
      // qatlam yuqorisidagi App'ga signal beramiz.
      try {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        localStorage.removeItem(AUTH_REFRESH_KEY);
        localStorage.removeItem(AUTH_USER_KEY);
        window.dispatchEvent(new CustomEvent('olympy:logout'));
      } catch {}
      throw new ApiError('Session expired', { status: 401, data });
    }
    throw new ApiError(extractErrorMessage(data) || response.statusText, {
      status: response.status,
      data,
    });
  }
  return data;
};

const mapBackendUser = (user) => {
  const detail = user?.roles_detail && typeof user.roles_detail === 'object'
    ? user.roles_detail
    : null;
  const roles = {};
  if (detail) {
    // Normalize centerId to string — backend returns integer, the rest of
    // the frontend (mock store, comparisons) treats centerIds as strings.
    Object.keys(detail).forEach(role => {
      const entry = detail[role] || {};
      const cid = entry.centerId ?? entry.center_id;
      roles[role] = {
        status: entry.status || 'pending',
        centerId: cid != null ? String(cid) : null,
      };
    });
  } else {
    const backendRoles = Array.isArray(user?.roles) ? user.roles : [];
    backendRoles.forEach(role => {
      roles[role] = { status: 'approved', centerId: null };
    });
  }
  // Platform admin is system-wide; surface it independently of detail.
  if (user?.is_platform_admin) {
    roles.admin = { status: 'approved', centerId: null };
  }
  const approvedRoles = Object.keys(roles).filter(r => roles[r]?.status === 'approved');
  return {
    id: `api:${user.id}`,
    backendId: user.id,
    name: user.full_name || user.name || 'Foydalanuvchi',
    phone: user.normalized_phone || user.phone,
    password: '',
    roles,
    activeRole: approvedRoles[0] || Object.keys(roles)[0] || null,
    joined: (user.created_at || '').slice(0, 10),
    isPlatformAdmin: !!user.is_platform_admin,
    _api: true,
  };
};

const saveAuth = ({ token, refresh, user }) => {
  if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
  if (refresh) localStorage.setItem(AUTH_REFRESH_KEY, refresh);
  if (user) localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
};

const loadAuth = () => {
  try {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    const refresh = localStorage.getItem(AUTH_REFRESH_KEY);
    const rawUser = localStorage.getItem(AUTH_USER_KEY);
    if (!token || !rawUser) return null;
    return { token, refresh, user: JSON.parse(rawUser) };
  } catch {
    return null;
  }
};

const clearAuth = () => {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_REFRESH_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
};

const getToken = () => {
  try { return localStorage.getItem(AUTH_TOKEN_KEY) || null; } catch { return null; }
};

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
  refreshToken: (refresh) => request('/api/auth/token/refresh/', { method: 'POST', body: { refresh }, retryOnAuth: false }),
  startTelegramVerification: (payload) => request('/api/auth/phone/start-telegram-verification/', { method: 'POST', body: payload }),
  verifyOtp: (payload) => request('/api/auth/phone/verify-otp/', { method: 'POST', body: payload }),
  // Me
  getMe: (token) => request('/api/me/', { token }),
  // Centers
  getCenters: () => request('/api/centers/').then(unwrapList),
  registerCenter: (payload, token) => request('/api/centers/', { method: 'POST', body: payload, token }),
  joinCenter: (centerId, payload, token) => request(`/api/centers/${centerId}/join/`, { method: 'POST', body: payload, token }),
  getPendingMemberships: (centerId, role, token) => request(`/api/centers/${centerId}/memberships/pending/${role ? '?role=' + role : ''}`, { token }).then(unwrapList),
  getStaffMemberships: (centerId, role, token) => request(`/api/centers/${centerId}/memberships/staff/${role ? '?role=' + encodeURIComponent(role) : ''}`, { token }).then(unwrapList),
  createManager: (centerId, payload, token) => request(`/api/centers/${centerId}/managers/create/`, { method: 'POST', body: payload, token }),
  createTeacher: (centerId, payload, token) => request(`/api/centers/${centerId}/teachers/create/`, { method: 'POST', body: payload, token }),
  approveStudent: (centerId, payload, token) => request(`/api/centers/${centerId}/approve-student/`, { method: 'POST', body: payload, token }),
  approveTeacher: (centerId, payload, token) => request(`/api/centers/${centerId}/approve-teacher/`, { method: 'POST', body: payload, token }),
  approveManager: (centerId, payload, token) => request(`/api/centers/${centerId}/approve-manager/`, { method: 'POST', body: payload, token }),
  getAdminCenters: (statusFilter, token) => request(`/api/admin/centers/${statusFilter ? '?status=' + statusFilter : ''}`, { token }).then(unwrapList),
  adminApproveCenter: (centerId, token) => request(`/api/admin/centers/${centerId}/approve/`, { method: 'POST', token }),
  adminRejectCenter: (centerId, token) => request(`/api/admin/centers/${centerId}/reject/`, { method: 'POST', token }),
  // Olympiads
  getOlympiads: (token) => request('/api/olympiads/', { token }).then(unwrapList),
  createOlympiad: (payload, token) => request('/api/olympiads/', { method: 'POST', body: payload, token }),
  getOlympiadQuestions: (olympiadId, token) => request(`/api/olympiads/${olympiadId}/questions/`, { token }),
  updateOlympiadQuestions: (olympiadId, questionIds, token) => request(`/api/olympiads/${olympiadId}/`, { method: 'PATCH', body: { question_ids: questionIds }, token }),
  publishOlympiad: (olympiadId, token) => request(`/api/olympiads/${olympiadId}/publish/`, { method: 'POST', token }),
  finishOlympiad: (olympiadId, token) => request(`/api/olympiads/${olympiadId}/finish/`, { method: 'POST', token }),
  // Questions
  getQuestions: (centerId, token) => request(`/api/questions/?center=${centerId}`, { token }).then(unwrapList),
  createQuestion: (payload, token) => request('/api/questions/', { method: 'POST', body: payload, token }),
  // Attempts / results / leaderboard
  submitAttempt: (payload, token) => request('/api/attempts/', { method: 'POST', body: payload, token }),
  getMyResults: (token) => request('/api/results/me/', { token }).then(unwrapList),
  getLeaderboard: (olympiadId, token) => request(`/api/leaderboard/${olympiadId ? '?olympiad=' + olympiadId : ''}`, { token }).then(unwrapList),
  // Notifications
  getNotifications: (token) => request('/api/notifications/', { token }).then(unwrapList),
  markNotificationRead: (id, token) => request(`/api/notifications/${id}/read/`, { method: 'POST', token }),
  markAllNotificationsRead: (token) => request('/api/notifications/read-all/', { method: 'POST', token }),
};

Object.assign(globalThis, { OlympyApi });
