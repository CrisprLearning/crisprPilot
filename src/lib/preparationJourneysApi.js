// Thin HTTP layer for the Mobile App Settings → Preparation Journeys module.
// Reuses the project-wide axios instance (X-Access-Token + 401 handling),
// unwraps the `{ data }` / `{ data, pagination }` envelope, and normalises
// errors so callers can switch on `err.code` (e.g. 'validation_error',
// 'preparation_journey_not_found').
//
// Object shape (see API contract):
//   {
//     id (integer), journey ('IAT'|'NEST'), year, nickName ('IISER'|'NISER'),
//     examDate (YYYY-MM-DD), datesUnsure (bool), status ('Active'|'Completed')
//   }
//
// `nickName` is derived server-side from `journey`; the client never sends it.
// `datesUnsure` is presentation-only (UI shows month+year instead of a full date).
//
// Routes (mounted under the axios baseURL's `/api`):
//   GET    /admin/preparation-journey/list?status&page&size   (preparationJourney.view)
//   POST   /admin/preparation-journey/add                     (preparationJourney.edit)
//   PUT    /admin/preparation-journey/{id}                    (preparationJourney.edit)
//   DELETE /admin/preparation-journey/{id}                    (preparationJourney.edit)

import { api, apiError } from './api';

const BASE = '/admin/preparation-journey';

// ── Error normalisation ──────────────────────────────────────────────
class PreparationJourneyError extends Error {
  constructor(code, message, fields, status) {
    super(message || code);
    this.code = code || 'server_error';
    this.fields = fields || null;
    this.status = status || 0;
  }
}

// Failures arrive as axios rejections: HTTP 4xx/5xx with
// { success: false, error: { code, message, fields? } } (codes are lowercase,
// fields map to lists of messages).
function normaliseError(err) {
  if (err instanceof PreparationJourneyError) return err;
  const { status, code, message, fields } = apiError(err, 'Request failed');
  return new PreparationJourneyError(code, message, fields, status);
}

function unwrap(res) {
  const body = res?.data;
  return body?.data ?? body;
}

function unwrapList(res) {
  const body = res?.data || {};
  return {
    data: body.data ?? (Array.isArray(body) ? body : []),
    pagination: body.pagination ?? null,
  };
}

// Whitelist the writable fields the backend accepts (server owns id + nickName).
function toPayload(body = {}) {
  return {
    journey: body.journey,
    year: body.year,
    examDate: body.examDate,
    datesUnsure: !!body.datesUnsure,
    status: body.status,
  };
}

export const PreparationJourneys = {
  // status: 'active' | 'completed' | 'all'  (maps to the table filter)
  // Sorted by examDate ascending; pagination via { page, size } (size 1–100).
  list: async (status = 'all', { page, size } = {}) => {
    try {
      const params = {};
      if (status && status !== 'all') params.status = status;
      if (page != null) params.page = page;
      if (size != null) params.size = size;
      return unwrapList(await api.get(`${BASE}/list`, {
        params: Object.keys(params).length ? params : undefined,
      }));
    } catch (e) { throw normaliseError(e); }
  },
  create: async (body) => {
    try { return unwrap(await api.post(`${BASE}/add`, toPayload(body))); }
    catch (e) { throw normaliseError(e); }
  },
  update: async (id, body) => {
    try { return unwrap(await api.put(`${BASE}/${id}`, toPayload(body))); }
    catch (e) { throw normaliseError(e); }
  },
  remove: async (id) => {
    try { return unwrap(await api.delete(`${BASE}/${id}`)); }
    catch (e) { throw normaliseError(e); }
  },
};

export { PreparationJourneyError };
