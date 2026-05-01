const DEFAULT_API_BASE_URL = 'http://localhost:8000';
const API_BASE_URL = (
  import.meta.env?.VITE_API_BASE_URL ||
  DEFAULT_API_BASE_URL
).replace(/\/+$/, '');

const AUTH_TOKEN_KEY = 'olympy_api_token';
const AUTH_USER_KEY = 'olympy_api_user';

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

const request = async (path, { method = 'GET', body, token, headers = {} } = {}) => {
  const requestHeaders = {
    Accept: 'application/json',
    ...headers,
  };
  if (body !== undefined) requestHeaders['Content-Type'] = 'application/json';
  if (token) requestHeaders.Authorization = `Token ${token}`;

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
    throw new ApiError(extractErrorMessage(data) || response.statusText, {
      status: response.status,
      data,
    });
  }
  return data;
};

const mapBackendUser = (user) => {
  const roles = {};
  const backendRoles = Array.isArray(user?.roles) ? user.roles : [];
  backendRoles.forEach(role => {
    roles[role] = { status: 'approved' };
  });
  if (user?.is_platform_admin) {
    roles.admin = { status: 'approved' };
  }
  const approvedRoles = Object.keys(roles);
  return {
    id: `api:${user.id}`,
    backendId: user.id,
    name: user.full_name || user.name || 'Foydalanuvchi',
    phone: user.normalized_phone || user.phone,
    password: '',
    roles,
    activeRole: approvedRoles[0] || null,
    joined: (user.created_at || '').slice(0, 10),
    isPlatformAdmin: !!user.is_platform_admin,
    _api: true,
  };
};

const saveAuth = ({ token, user }) => {
  if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
  if (user) localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
};

const loadAuth = () => {
  try {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    const rawUser = localStorage.getItem(AUTH_USER_KEY);
    if (!token || !rawUser) return null;
    return { token, user: JSON.parse(rawUser) };
  } catch {
    return null;
  }
};

const clearAuth = () => {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
};

export const OlympyApi = {
  API_BASE_URL,
  ApiError,
  toUserMessage,
  mapBackendUser,
  saveAuth,
  loadAuth,
  clearAuth,
  login: (payload) => request('/api/auth/login/', { method: 'POST', body: payload }),
  register: (payload) => request('/api/auth/register/', { method: 'POST', body: payload }),
  startTelegramVerification: (payload) => request('/api/auth/phone/start-telegram-verification/', { method: 'POST', body: payload }),
  verifyOtp: (payload) => request('/api/auth/phone/verify-otp/', { method: 'POST', body: payload }),
};

Object.assign(globalThis, { OlympyApi });
