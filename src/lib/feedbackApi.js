import { api, apiError } from './api';

const BASE = '/admin/feedback';

export const FEEDBACK_TYPE = {
  COURSE: 'COURSE',
  EXAM: 'EXAM',
  MODULE: 'MODULE',
  CHAPTER: 'CHAPTER',
};

// Failures arrive as axios rejections (HTTP 4xx/5xx with
// { success: false, error: { code, message, fields? } }); rethrow them as an
// Error carrying the API's lowercase code, message and fields.
function toError(err) {
  const { status, code, message, fields } = apiError(err, 'Request failed');
  const e = new Error(message);
  e.status = status;
  e.code = code;
  e.fields = fields;
  e.envelope = err?.response?.data;
  return e;
}

function clean(params) {
  const out = {};
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    out[k] = v;
  });
  return out;
}

export async function listFeedback({
  page = 1,
  size = 20,
  sortBy = 'createdAt',
  sortOrder = 'DESC',
  filterBy,
  searchKey,
  type,
  courseId,
  moduleId,
  chapterId,
} = {}) {
  try {
    const { data } = await api.get(`${BASE}/list`, {
      params: clean({ page, size, sortBy, sortOrder, filterBy, searchKey, type, courseId, moduleId, chapterId }),
    });
    return data;
  } catch (err) {
    throw toError(err);
  }
}

export async function feedbackSummary({ type, sortBy = 'rating', sortOrder = 'DESC', page = 1, limit = 20 } = {}) {
  try {
    const { data } = await api.get(`${BASE}/summary`, {
      params: clean({ type, sortBy, sortOrder, page, limit }),
    });
    return data;
  } catch (err) {
    throw toError(err);
  }
}
