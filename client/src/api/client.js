import axios from 'axios';

const TOKEN_KEY = 'resume-screener.token';

// The JWT lives in memory for requests and in localStorage to survive reloads.
let token = localStorage.getItem(TOKEN_KEY);
let onUnauthorized = () => {};

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 30_000,
});

export function getToken() {
  return token;
}

export function setToken(value) {
  token = value;
  if (value) localStorage.setItem(TOKEN_KEY, value);
  else localStorage.removeItem(TOKEN_KEY);
}

/** Called when an authenticated request gets a 401 (expired or revoked token). */
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

api.interceptors.request.use((config) => {
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Only when we sent a token: a 401 from the login form just means a wrong password.
    if (error.response?.status === 401 && token) onUnauthorized();
    return Promise.reject(error);
  },
);

/** A human-readable message from an API error. */
export function getErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  if (error?.response?.data?.error?.message) return error.response.data.error.message;
  if (error?.code === 'ECONNABORTED') return 'The request timed out. Please try again.';
  if (error?.request && !error.response) return 'Cannot reach the server. Check your connection.';
  return fallback;
}

/** Field-level validation errors, e.g. { email: ['Enter a valid email address'] }. */
export function getFieldErrors(error) {
  return error?.response?.data?.error?.details ?? {};
}
