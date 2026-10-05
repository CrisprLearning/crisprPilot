import { api, apiError } from './api';

// ─────────────────────────────────────────────────────────────────────────────
// Quiz API client.
//
// Talks to the `quiz` backend module that creates and manages quizzes built from
// practice-question batches. Base path resolves to `<origin>/api/admin/quiz`
// — the shared `api` axios instance already prefixes `/api` and injects
// X-Access-Token.
//
// Errors follow the house contract (crispr-api docs/API_ERRORS.md):
// HTTP <status> `{ success: false, error: { code, message, fields? } }`.
// axios rejects on non-2xx, so callers run the error through `quizError()`.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = '/admin/quiz';

export function quizError(err) {
  const { status, code, message, fields } = apiError(err, 'Request failed');
  return { status, code, message, fields };
}

// POST /api/admin/quiz/create-quiz
// body: {
//   title, brief, terms, duration, totalQuestions, markingScheme,
//   challengeQuestionAllowed, multipleAttemptsAllowed, uniqueID,
//   quizLimitedToBatches: [], scheduledStart, scheduledEnd,
//   questionsData: [{ o, qi, ms }]
// }
export async function createQuiz(body) {
  const { data } = await api.post(`${BASE}/create-quiz`, body);
  return data?.data ?? data;
}
