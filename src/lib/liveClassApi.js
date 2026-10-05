import { api, apiError, apiFieldErrors } from './api';

// Live Class Scheduler API client.
// Base path resolves to `<origin>/api/admin/live-classes` (the shared
// `api` axios instance already prefixes `/api` and injects X-Access-Token).
// Contract: LIVE_CLASS_SCHEDULER_API_CONTRACT.md / "Live Class Scheduler — FE Integration".

const BASE = '/admin/live-classes';

// Envelopes: single `{ data }`, list `{ data, meta }`, error `{ success:false, error }`.
// axios rejects on non-2xx, so callers catch and run errors through liveClassError().
// `code` is the API's lower_snake_case code; `fields` maps each field to its
// first message (or null when the error is not a validation_error).
export function liveClassError(err) {
  const e = apiError(err, 'Request failed');
  const fields = apiFieldErrors(err);
  return {
    status: e.status,
    code: e.code,
    message: e.message,
    fields: Object.keys(fields).length ? fields : null,
  };
}

// `true` when an error came from the YouTube provisioning/lifecycle layer —
// the FE should refresh and surface the "Provision stream" affordance.
export function isYoutubeError(code) {
  return typeof code === 'string' && code.startsWith('youtube_');
}

function clean(params) {
  const out = {};
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    out[k] = v;
  });
  return out;
}

// ── Classes ─────────────────────────────────────────────────────────────────

export async function listLiveClasses({
  search,
  status,
  mode,
  page = 1,
  per_page = 25,
  sort = '-scheduled_at',
} = {}) {
  const { data } = await api.get(BASE, {
    params: clean({ search, status, mode, page, per_page, sort }),
  });
  return data; // { data: [...], meta }
}

export async function getLiveClass(id) {
  const { data } = await api.get(`${BASE}/${id}`);
  return data.data;
}

export async function createLiveClass(body) {
  const { data } = await api.post(BASE, body);
  return data.data;
}

export async function updateLiveClass(id, body) {
  const { data } = await api.patch(`${BASE}/${id}`, body);
  return data.data;
}

export async function cancelLiveClass(id) {
  await api.delete(`${BASE}/${id}`); // 204
}

export async function launchLiveClass(id) {
  const { data } = await api.post(`${BASE}/${id}/launch`);
  return data.data;
}

export async function endLiveClass(id) {
  const { data } = await api.post(`${BASE}/${id}/end`);
  return data.data;
}

// ── YouTube (mode=youtube only) ──────────────────────────────────────────────

export async function provisionYoutube(id, { force = false } = {}) {
  const { data } = await api.post(`${BASE}/${id}/youtube/provision`, null, {
    params: { force },
  });
  return data.data;
}

export async function rotateYoutubeKey(id) {
  const { data } = await api.post(`${BASE}/${id}/youtube/rotate-key`);
  return data.data;
}

export async function getYoutubeCredentials(id) {
  const { data } = await api.get(`${BASE}/${id}/youtube/credentials`);
  return data.data; // { rtmp_url, rtmp_backup_url, stream_key, embed_url, watch_url }
}

export async function syncYoutube(id) {
  const { data } = await api.post(`${BASE}/${id}/youtube/sync`);
  return data.data;
}

// ── Activities (Activity Planner) ────────────────────────────────────────────

export async function listActivities(classId) {
  const { data } = await api.get(`${BASE}/${classId}/activities`);
  return data.data; // [...] ordered by position
}

export async function createActivity(classId, body) {
  const { data } = await api.post(`${BASE}/${classId}/activities`, body);
  return data.data;
}

export async function getActivity(classId, activityId) {
  const { data } = await api.get(`${BASE}/${classId}/activities/${activityId}`);
  return data.data;
}

export async function updateActivity(classId, activityId, body) {
  const { data } = await api.patch(`${BASE}/${classId}/activities/${activityId}`, body);
  return data.data;
}

export async function deleteActivity(classId, activityId) {
  await api.delete(`${BASE}/${classId}/activities/${activityId}`); // 204
}
