import { api } from './api';

const BASE = '/admin/survey';

// ── Status enum (schema) ─────────────────────────────────────────────────────
export const SURVEY_STATUS = {
  PAUSED: 0,
  ACTIVE: 1,
  RECALLED: 2,
};

export const SURVEY_STATUS_LABEL = {
  0: 'Paused',
  1: 'Active',
  2: 'Recalled',
};

// ── Audience enum (schema) ───────────────────────────────────────────────────
export const SURVEY_AUDIENCE = {
  OPEN: 0,             // any registered user
  BATCH: 1,            // specific batch ids in survey_audience
  ALL_ENROLLED: 2,     // all enrolled students
};

export const SURVEY_AUDIENCE_LABEL = {
  0: 'All Registered Students',
  1: 'Selected Batches',
  2: 'All Enrolled Students',
};

// ── Question type enum (surveyContent.t) ────────────────────────────────────
export const QUESTION_TYPE = {
  TEXT: 'TEXT',
  RATING: 'RATING',
  MULTI: 'MULTI',
};

export const QUESTION_TYPE_LABEL = {
  TEXT: 'Text Input',
  RATING: 'Star Rating',
  MULTI: 'Multi Select',
};

export const QUESTION_TYPE_FROM_LABEL = {
  'Text Input': 'TEXT',
  'Star Rating': 'RATING',
  'Multi Select': 'MULTI',
};

// Defensive only: the API now sends every error with a real 4xx/5xx status
// (axios rejects), so a 2xx `{ success:false }` body is not expected.
function ensureOk(body) {
  if (body && body.success === false) {
    const err = body.error || {};
    const e = new Error(err.message || 'Request failed');
    e.code = err.code;
    e.fields = err.fields;
    e.envelope = body;
    throw e;
  }
  return body;
}

function clean(params) {
  const out = {};
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    out[k] = v;
  });
  return out;
}

// ── Calls ────────────────────────────────────────────────────────────────────
export async function listSurveys({ status, audienceType, q, page = 1, size = 20, sortBy = 'createdAt', sortOrder = 'DESC' } = {}) {
  const { data } = await api.get(`${BASE}/list`, {
    params: clean({ status, audienceType, q, page, size, sortBy, sortOrder }),
  });
  return ensureOk(data);
}

export async function getSurvey(id) {
  const { data } = await api.get(`${BASE}/${id}`);
  return ensureOk(data);
}

export async function createSurvey(payload) {
  // payload must already be in schema shape
  const { data } = await api.post(`${BASE}/add`, payload);
  return ensureOk(data);
}

export async function updateSurveyStatus(id, status) {
  const { data } = await api.post(`${BASE}/update-status`, { id, status });
  return ensureOk(data);
}

export const pauseSurvey = (id) => updateSurveyStatus(id, SURVEY_STATUS.PAUSED);
export const resumeSurvey = (id) => updateSurveyStatus(id, SURVEY_STATUS.ACTIVE);
export const recallSurvey = (id) => updateSurveyStatus(id, SURVEY_STATUS.RECALLED);

export async function listResponses(surveyId, { q, candidateId, dateFrom, dateTo, batchId, page = 1, size = 20 } = {}) {
  const { data } = await api.get(`${BASE}/${surveyId}/responses`, {
    params: clean({ q, candidateId, dateFrom, dateTo, batchId, page, size }),
  });
  return ensureOk(data);
}

// Consolidated, server-side aggregation over ALL responses matching the filters
// (not just the current page). Accepts the same filter params as listResponses,
// minus paging. Returns { surveyId, totalResponses, anonymousCount,
// identifiedCount, lastResponseAt, questions: [{ o, t, answered, ... }] }.
// See docs/survey-dashboard-contract.md §4.3.
export async function getSurveySummary(surveyId, { q, candidateId, dateFrom, dateTo, batchId } = {}) {
  const { data } = await api.get(`${BASE}/${surveyId}/summary`, {
    params: clean({ q, candidateId, dateFrom, dateTo, batchId }),
  });
  return ensureOk(data);
}

// ── Shape converters ─────────────────────────────────────────────────────────

// UI question (text/type/required/options) → schema question {o, q, t, l?, r?}
export function questionsToSchema(uiQuestions) {
  return (uiQuestions || []).map((q, idx) => {
    const t = QUESTION_TYPE_FROM_LABEL[q.type] || q.type;
    const out = { o: idx + 1, q: q.text || '', t };
    if (t === 'MULTI') out.l = (q.options || []).filter((o) => o && o.trim());
    if (q.required) out.r = 1;
    return out;
  });
}

// Schema question → UI question
export function questionsFromSchema(schemaQuestions) {
  const list = Array.isArray(schemaQuestions) ? schemaQuestions : safeParse(schemaQuestions, []);
  return list
    .slice()
    .sort((a, b) => (Number(a.o) || 0) - (Number(b.o) || 0))
    .map((q) => ({
      text: q.q || '',
      type: QUESTION_TYPE_LABEL[q.t] || q.t || 'Text Input',
      required: Boolean(q.r),
      options: Array.isArray(q.l) ? q.l : [],
    }));
}

function safeParse(value, fallback) {
  if (!value) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch (_e) { return fallback; }
}

// Schema row → UI-friendly survey object
export function surveyFromSchema(row) {
  if (!row) return null;
  const questions = questionsFromSchema(row.surveyContent);
  const audienceLabel = SURVEY_AUDIENCE_LABEL[row.audienceType] ?? 'Unknown';
  return {
    id: row.id,
    title: row.title,
    brief: row.brief || '',
    closesAt: row.closesAt || null,
    anonymousSubmissionsAllowed: Boolean(row.anonymousSubmissionsAllowed),
    multipleSubmissionsAllowed: Boolean(row.multipleSubmissionsAllowed),
    audienceType: Number(row.audienceType ?? 0),
    audienceBatchIds: Array.isArray(row.audienceBatchIds) ? row.audienceBatchIds : [],
    audienceLabel: row.audienceType === 1 && Array.isArray(row.audienceBatchIds)
      ? `${row.audienceBatchIds.length} Batches`
      : audienceLabel,
    status: Number(row.status ?? 1),
    statusLabel: SURVEY_STATUS_LABEL[Number(row.status ?? 1)] || 'Unknown',
    createdAt: row.createdAt || null,
    createdBy: row.createdBy || '',
    responseCount: Number(row.responseCount ?? row.responsesCount ?? 0),
    questions,
  };
}
