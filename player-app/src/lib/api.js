// HTTP transport for the player runtime.
//
// All endpoints follow the contract in DIGITAL_SIGNAGE_API_CONTRACT.md
// (player §7). The mock path is still here so you can demo without a
// backend by setting VITE_USE_MOCK=true.
//
// Auth: every call except `pair` sends `Authorization: Bearer <screen_token>`,
// where the token is `<screen_id>:<token_secret>` returned by /pair.
//
// ETag: `fetchScreen` accepts the last seen `config_version` and returns
// `{ unchanged: true }` when the server responds 304.

import { API_BASE, USE_MOCK } from '../config.js';
import { mockFetchScreen, mockHeartbeat, mockPair } from './mockApi.js';
import * as tokenStore from './tokenStore.js';

const BASE = `${API_BASE}/api/system/signage/player`;

function authHeader(screenCode) {
  const token = tokenStore.read(screenCode);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// The server is canonical on `location_id` / `location_name`; the player-app
// renderers were originally written against `branch_id` / `branch_name`. We
// alias both directions here so all downstream code keeps working without
// touching every content renderer.
function aliasScreen(screen) {
  if (!screen) return screen;
  return {
    ...screen,
    branch_id:   screen.branch_id   ?? screen.location_id   ?? null,
    branch_name: screen.branch_name ?? screen.location_name ?? null,
  };
}
function aliasPayload(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const out = { ...payload };
  if (out.screen) out.screen = aliasScreen(out.screen);
  return out;
}

async function parseError(res) {
  let body = null;
  try { body = await res.json(); } catch { /* ignore */ }
  // { success:false, error:{ code, message, fields? } } — codes are lowercase.
  const env = body?.error && typeof body.error === 'object' ? body.error : {};
  const err = new Error(env.message || `HTTP ${res.status}`);
  err.code = env.code ? String(env.code).toLowerCase() : (res.status === 404 ? 'not_found' : res.status === 410 ? 'pairing_expired' : 'http_error');
  err.status = res.status;
  return err;
}

// ── Pair (no auth) ───────────────────────────────────────────────────
export async function pair(screen_code, pairing_code) {
  if (USE_MOCK) return mockPair(screen_code, pairing_code);
  const res = await fetch(`${BASE}/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ screen_code, pairing_code }),
  });
  if (!res.ok) throw await parseError(res);
  const body = await res.json();
  const data = body.data || body;                       // tolerate either envelope
  tokenStore.write(screen_code, data.screen_token);
  if (data.screen) data.screen = aliasScreen(data.screen);
  return data;
}

export async function unpair(screen_code) {
  if (USE_MOCK) { tokenStore.clear(screen_code); return; }
  await fetch(`${BASE}/unpair`, {
    method: 'POST',
    headers: { ...authHeader(screen_code), Accept: 'application/json' },
  }).catch(() => {});
  tokenStore.clear(screen_code);
}

// ── Main poll (ETag-aware) ───────────────────────────────────────────
export async function fetchScreen(screen_code, { etag } = {}) {
  if (USE_MOCK) {
    const data = await mockFetchScreen(screen_code);
    return { unchanged: false, data };
  }
  const headers = { Accept: 'application/json', ...authHeader(screen_code) };
  if (etag) headers['If-None-Match'] = `"${etag}"`;
  const res = await fetch(`${BASE}/screens/${encodeURIComponent(screen_code)}`, { headers });
  if (res.status === 304) return { unchanged: true };
  if (res.status === 401 || res.status === 403) {
    tokenStore.clear(screen_code);                      // bearer dead → force re-pair
    throw await parseError(res);
  }
  if (!res.ok) throw await parseError(res);
  const body = await res.json();
  return { unchanged: false, data: aliasPayload(body.data || body) };
}

// ── Heartbeat ────────────────────────────────────────────────────────
export async function heartbeat(screen_code, extras = {}) {
  if (USE_MOCK) return mockHeartbeat(screen_code);
  const res = await fetch(`${BASE}/screens/${encodeURIComponent(screen_code)}/heartbeat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeader(screen_code) },
    body: JSON.stringify({ ts: Math.floor(Date.now() / 1000), ...extras }),
  });
  if (!res.ok) return { ok: false };
  const body = await res.json();
  return body.data || body;
}

export const hasToken = (screen_code) => Boolean(tokenStore.read(screen_code));
