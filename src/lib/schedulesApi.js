// Thin wrappers for the Schedules backend documented in
// SCHEDULES_API_CONTRACT.md (and the integration guide). The underlying
// axios instance (`api` from ./api.js) attaches the X-Access-Token header
// and handles 401 redirects, so these wrappers just unwrap the envelope
// and re-throw a normalized error on non-2xx.

import { api, apiError } from './api';

const BASE = '/admin/schedules';

function unwrap(res) {
  return res?.data?.data;
}

// ─── Reads ─────────────────────────────────────────────────────────────
export async function fetchLookups() {
  const res = await api.get(`${BASE}/lookups`);
  return unwrap(res);
}

export async function fetchSchedules({
  from,
  to,
  batch_id,           // string | string[]
  published,          // boolean | undefined
  include = 'events',
  page = 1,
  per_page = 100,
} = {}) {
  const params = { from, to, include, page, per_page };
  if (typeof published === 'boolean') params.published = published;
  if (Array.isArray(batch_id) && batch_id.length) params['batch_id[]'] = batch_id;
  else if (typeof batch_id === 'string' && batch_id) params.batch_id = batch_id;
  const res = await api.get(BASE, { params });
  return {
    items: Array.isArray(res?.data?.data) ? res.data.data : [],
    meta:  res?.data?.meta || { total: 0, page, per_page },
  };
}

export async function fetchSchedule(id) {
  const res = await api.get(`${BASE}/${encodeURIComponent(id)}`);
  return unwrap(res);
}

// ─── Schedule mutations ────────────────────────────────────────────────
export async function createSchedule({ name, date, batch_ids }) {
  const res = await api.post(BASE, { name, date, batch_ids: batch_ids || [] });
  return unwrap(res);
}

export async function patchSchedule(id, patch) {
  const res = await api.patch(`${BASE}/${encodeURIComponent(id)}`, patch);
  return unwrap(res);
}

export async function deleteSchedule(id) {
  await api.delete(`${BASE}/${encodeURIComponent(id)}`);
}

export async function publishSchedule(id, additional_batch_ids = []) {
  const res = await api.post(`${BASE}/${encodeURIComponent(id)}/publish`, { additional_batch_ids });
  return unwrap(res);
}

export async function unpublishSchedule(id) {
  const res = await api.post(`${BASE}/${encodeURIComponent(id)}/unpublish`);
  return unwrap(res);
}

export async function duplicateSchedule(id, { name, date, batch_ids }) {
  const res = await api.post(`${BASE}/${encodeURIComponent(id)}/duplicate`, { name, date, batch_ids: batch_ids || [] });
  return unwrap(res);
}

export async function copyEvents(id, source_schedule_id, confirm_content_duplication = false) {
  const res = await api.post(`${BASE}/${encodeURIComponent(id)}/copy-events`, { source_schedule_id, confirm_content_duplication });
  return unwrap(res); // { schedule, copied_count }
}

// ─── Event mutations ───────────────────────────────────────────────────
export async function addEvent(scheduleId, ev) {
  const res = await api.post(`${BASE}/${encodeURIComponent(scheduleId)}/events`, ev);
  return unwrap(res);
}

export async function patchEvent(scheduleId, eventId, patch) {
  const res = await api.patch(
    `${BASE}/${encodeURIComponent(scheduleId)}/events/${encodeURIComponent(eventId)}`,
    patch,
  );
  return unwrap(res);
}

export async function deleteEvent(scheduleId, eventId) {
  await api.delete(`${BASE}/${encodeURIComponent(scheduleId)}/events/${encodeURIComponent(eventId)}`);
}

export async function recurringEvent(scheduleId, { event, recurrence, confirm_content_duplication = false }) {
  const res = await api.post(
    `${BASE}/${encodeURIComponent(scheduleId)}/events/recurring`,
    { event, recurrence, confirm_content_duplication },
  );
  return unwrap(res); // { placed_new, appended, skipped_partial, schedules }
}

// ─── Error normalizer ──────────────────────────────────────────────────
// Normalize an axios failure (or anything thrown) into
// { code, message, details, fields, status }. `code` is the API's
// lower_snake_case code (or 'unknown' for non-API errors) so callers can
// always `switch (err.code)`. `details` holds the extra top-level keys the
// API sends next to `error` (conflicts, hits, events, copying, …).
export function asApiError(e) {
  if (!e?.response) {
    return { status: 0, code: 'unknown', message: e?.message || 'Unexpected error', details: {}, fields: null };
  }
  const err = apiError(e, 'Unexpected error');
  return {
    status:  err.status,
    code:    err.code,
    message: err.message,
    details: err.extra || {},
    fields:  err.fields,
  };
}
