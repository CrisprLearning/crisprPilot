import { api, apiError, apiErrorMessage } from './api';

const BASE = '/admin/support';

function clean(params) {
  const out = {};
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    out[k] = v;
  });
  return out;
}

function unwrap(data) {
  if (data && typeof data === 'object' && 'data' in data) return data.data;
  return data;
}

export async function listThreads({
  page = 1,
  size = 10,
  search = '',
  assignee = '',
  pendingOnly = false,
  status = '',
  type = '',
  sort = '-lastUpdate',
} = {}) {
  const { data } = await api.get(`${BASE}/threads`, {
    params: clean({ page, size, search, assignee, pendingOnly: pendingOnly ? true : '', status, type, sort }),
  });
  return {
    items: Array.isArray(data?.data) ? data.data : [],
    meta: data?.meta || { page, size, total: 0, totalPages: 1, unreadCount: 0 },
  };
}

export async function listAssociates() {
  const { data } = await api.get(`${BASE}/associates`);
  const arr = unwrap(data);
  return Array.isArray(arr) ? arr : [];
}

export async function listThreadTickets(threadId, { page = 1, size = 20, status = '' } = {}) {
  const { data } = await api.get(`${BASE}/threads/${threadId}/tickets`, {
    params: clean({ page, size, status }),
  });
  return {
    items: Array.isArray(data?.data) ? data.data : [],
    meta: data?.meta || { page, size, total: 0, totalPages: 1 },
  };
}

export async function getTicket(id) {
  const { data } = await api.get(`${BASE}/tickets/${id}`);
  return unwrap(data);
}

export async function createTicket(threadId, payload) {
  const { data } = await api.post(`${BASE}/threads/${threadId}/tickets`, payload);
  return unwrap(data);
}

export async function updateTicket(id, patch) {
  const { data } = await api.patch(`${BASE}/tickets/${id}`, patch);
  return unwrap(data);
}

export async function blockThread(threadId) {
  const { data } = await api.post(`${BASE}/threads/${threadId}/block-thread`);
  return unwrap(data);
}

export async function unblockThread(threadId) {
  const { data } = await api.post(`${BASE}/threads/${threadId}/unblock-thread`);
  return unwrap(data);
}

export async function listThreadMessages(threadId, { page = 1, size = 50 } = {}) {
  const { data } = await api.get(`${BASE}/threads/${threadId}/messages`, {
    params: clean({ page, size }),
  });
  return {
    items: Array.isArray(data?.data) ? data.data : [],
    meta: data?.meta || { page, size, total: 0, totalPages: 1 },
  };
}

export async function listTicketNotes(ticketId, { page = 1, size = 50, sort = 'createdAt' } = {}) {
  const { data } = await api.get(`${BASE}/tickets/${ticketId}/notes`, {
    params: clean({ page, size, sort }),
  });
  return {
    items: Array.isArray(data?.data) ? data.data : [],
    meta: data?.meta || { page, size, total: 0, totalPages: 1 },
  };
}

export async function createTicketNote(ticketId, { text }) {
  const { data } = await api.post(`${BASE}/tickets/${ticketId}/notes`, { text });
  return unwrap(data);
}

export async function sendMessage(threadId, { text, kind = 'reply', asResolution = false }) {
  const { data } = await api.post(`${BASE}/threads/${threadId}/messages`, {
    text,
    kind,
    asResolution,
  });
  // Plain reply → data = ChatMessage
  // asResolution=true → data = { message: ChatMessage, ticket: SupportTicket }
  return unwrap(data);
}

export function extractApiError(error, fallback = 'Request failed.') {
  return apiErrorMessage(error, fallback);
}

// The API's lower_snake_case error code (e.g. 'ticket_already_open'), or null.
export function getApiErrorCode(error) {
  return error?.response?.data?.error?.code ? apiError(error).code : null;
}
