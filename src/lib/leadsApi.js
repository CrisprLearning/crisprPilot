import { api } from './api';

const BASE = '/admin/leads';
const ASSOCIATES_BASE = '/admin/associates';

function clean(params) {
  const out = {};
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    out[k] = v;
  });
  return out;
}

function unwrap(data) {
  // Server envelope: { success, data, meta? }
  if (data && typeof data === 'object' && 'data' in data) return data.data;
  return data;
}

export async function listLeads({
  page = 1,
  size = 8,
  q = '',
  status = '',
  interest = '',
  associateId = '',
  followUpDate = '',
  sortBy = 'createdAt',
  sortDir = 'desc',
} = {}) {
  const { data } = await api.get(BASE, {
    params: clean({ page, size, q, status, interest, associateId, followUpDate, sortBy, sortDir }),
  });
  return {
    items: Array.isArray(data?.data) ? data.data : [],
    meta: data?.meta || { page, size, total: 0, totalPages: 1 },
  };
}

export async function getLeadStats() {
  const { data } = await api.get(`${BASE}/stats`);
  return unwrap(data) || { total: 0, received: 0, inProgress: 0, converted: 0, lost: 0 };
}

export async function getLead(id) {
  const { data } = await api.get(`${BASE}/${id}`);
  return unwrap(data);
}

export async function createLead(payload) {
  const { data } = await api.post(BASE, payload);
  return unwrap(data);
}

export async function updateLead(id, payload) {
  const { data } = await api.patch(`${BASE}/${id}`, payload);
  return unwrap(data);
}

export async function deleteLead(id) {
  const { data } = await api.delete(`${BASE}/${id}`);
  return unwrap(data);
}

export async function addFollowUp(id, payload) {
  const { data } = await api.post(`${BASE}/${id}/followups`, payload);
  return unwrap(data);
}

export async function changeLeadStatus(id, status) {
  const { data } = await api.patch(`${BASE}/${id}/status`, { status });
  return unwrap(data);
}

export async function reassignLead(id, associateId) {
  const { data } = await api.patch(`${BASE}/${id}/assignee`, { associateId });
  return unwrap(data);
}

export async function setLeadCatalogItems(id, catalogItems) {
  const { data } = await api.put(`${BASE}/${id}/catalog-items`, { catalogItems });
  return unwrap(data);
}

export async function listAssociates() {
  const { data } = await api.get(ASSOCIATES_BASE);
  const arr = unwrap(data);
  return Array.isArray(arr) ? arr : [];
}

export function extractApiError(error, fallback = 'Request failed.') {
  const env = error?.response?.data;
  if (env?.error?.message) return env.error.message;
  if (env?.message) return env.message;
  return error?.message || fallback;
}
