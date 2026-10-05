import axios from 'axios';
import { clearToken, getToken } from './auth';

// API origin resolution (Option B — call the backend directly, no Vite proxy):
//   1. If VITE_API_BASE is set (see .env.development), use it. This is the
//      explicit, configurable override for local/staging work.
//   2. Otherwise fall back to a hostname check: localhost → local backend,
//      anything else → production. Keeps prod builds correct even if no env
//      var is provided.
// VITE_API_BASE should be the backend ORIGIN only (no trailing /api, no slash);
// we append `/api` here so every call resolves to `<origin>/api/...`.
const ENV_API_BASE = import.meta.env?.VITE_API_BASE;

export const BASE_URL = ENV_API_BASE
  ? `${String(ENV_API_BASE).replace(/\/+$/, '')}/api`
  : (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? 'http://127.0.0.1:3004/api'
      : 'https://crisprtech.app/api');

export const api = axios.create({
  baseURL: BASE_URL,
});

api.interceptors.request.use((config) => {
  const token = getToken();

  if (token) {
    config.headers['X-Access-Token'] = token;
  }

  return config;
});

// Global rule: ANY 401 from ANY API call means the session is dead — clear the
// token and send the user to /login. This is unconditional (no per-request
// opt-out); the only exception is the login endpoint itself, whose form
// renders its own "invalid credentials" error.
export function handleUnauthorized() {
  clearToken();
  if (window.location.pathname !== '/login') {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.replace(`/login?next=${next}`);
  }
}

// Every API error has one shape and a real HTTP status (2xx is always a
// success; see crispr-api docs/API_ERRORS.md):
//   HTTP <status> { success: false, error: { code, message, fields? }, ...extra }
// `code` is lower_snake_case and stable, `message` is safe to show, `fields`
// maps a field name to its messages, and a few errors add top-level keys
// (retryAfterSeconds, conflicts, …) that land in `extra`.
//
// apiError(err) reads that body off a rejected axios call (or a network
// failure) into { status, code, message, fields, extra }.
export function apiError(err, fallback = 'Something went wrong. Please try again.') {
  if (err?.apiError) return err.apiError;
  const status = err?.response?.status ?? 0;
  const body = err?.response?.data;
  const env = body && typeof body.error === 'object' && body.error !== null ? body.error : null;
  if (env) {
    const { success: _s, error: _e, ...extra } = body;
    return {
      status,
      code: String(env.code || 'error').toLowerCase(),
      message: env.message || fallback,
      fields: env.fields || null,
      extra,
    };
  }
  // Not an API error body: a network failure, a cancelled request, or a
  // response from something in front of the API (proxy, CDN).
  const message = typeof body?.message === 'string' ? body.message
    : typeof body?.error === 'string' ? body.error
      : status === 0 ? 'Network error. Check your connection and try again.'
        : (err?.message && !/^Request failed with status code/.test(err.message) ? err.message : fallback);
  return { status, code: status === 0 ? 'network_error' : 'error', message, fields: null, extra: {} };
}

// The text to show for a failed call.
export function apiErrorMessage(err, fallback) {
  return apiError(err, fallback).message;
}

// The first message for each field of a validation_error, as { field: message }.
export function apiFieldErrors(err) {
  const fields = apiError(err).fields || {};
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, Array.isArray(v) ? v[0] : String(v)]));
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response) {
      // Normalise once so every caller sees the same thing: err.apiError is
      // the parsed error, err.message its text (instead of axios's "Request
      // failed with status code 422"), and response.data.message mirrors
      // error.message for screens that still read it there.
      const parsed = apiError(error);
      error.apiError = parsed;
      error.message = parsed.message;
      const data = error.response.data;
      if (data && typeof data === 'object' && typeof data.error === 'object' && data.message === undefined) {
        data.message = parsed.message;
      }
    }
    const status = error?.response?.status;
    const url = error?.config?.url || '';
    const isAuthCall = url.includes('/admin/auth/authenticate');
    if (status === 401 && !isAuthCall) {
      handleUnauthorized();
    }
    return Promise.reject(error);
  }
);
