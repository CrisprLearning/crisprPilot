import { api, apiError, apiFieldErrors } from './api';

const BASE = '/admin/user-account';

function ensureOk(body) {
  if (body && body.success === false) {
    const err = body.error || {};
    const e = new Error(err.message || body.message || 'Request failed');
    e.code = err.code;
    e.fields = err.fields;
    e.envelope = body;
    throw e;
  }
  return body;
}

export async function listUsers(params = {}) {
  const { signal, ...query } = params;
  const { data } = await api.get(`${BASE}/list`, { params: query, signal });
  return ensureOk(data);
}

/**
 * Create an admin user.
 * @param {{ name: string, email: string, mobile?: string|null, roleIds: number[], active?: boolean }} payload
 */
export async function createUser(payload) {
  const { data } = await api.post(BASE, payload);
  return ensureOk(data);
}

/**
 * Update an admin user. `roleIds` (if sent) REPLACES the user's full role set.
 * @param {number|string} id seq id
 * @param {{ name: string, email: string, mobile?: string|null, roleIds: number[], active?: boolean }} payload
 */
export async function updateUser(id, payload) {
  const { data } = await api.put(`${BASE}/${id}`, payload);
  return ensureOk(data);
}

export async function setUserActive(id, active) {
  const { data } = await api.put(`${BASE}/${id}/active`, { active });
  return ensureOk(data);
}

/**
 * Quick multi-role reassign without touching other fields. Replaces the set.
 * @param {number|string} id
 * @param {number[]} roleIds
 */
export async function assignUserRoles(id, roleIds) {
  const { data } = await api.put(`${BASE}/${id}/role`, { roleIds });
  return ensureOk(data);
}

export async function resetUserPassword(mobile) {
  const { data } = await api.put(`${BASE}/reset-password`, null, { params: { mobile } });
  return ensureOk(data);
}

// { message, code, status, fields } for a failed call. `code` is the API's
// lower_snake_case error code; `fields` maps each invalid field to its first
// message (the API sends a list per field).
export function extractApiError(err) {
  const { message, code, status, fields } = apiError(err, 'Request failed');
  return { message, code, status, fields: fields ? apiFieldErrors(err) : null };
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_REGEX = /^\+?[0-9\s-]{7,15}$/;

export function validateUser({ name, email, mobile, roleIds }) {
  const fields = {};
  if (!name || !name.trim()) fields.name = 'Name is required.';
  if (!email || !EMAIL_REGEX.test(email.trim())) fields.email = 'Valid email is required.';
  if (mobile && !MOBILE_REGEX.test(mobile.trim())) fields.mobile = 'Invalid mobile number.';
  if (!Array.isArray(roleIds) || roleIds.length === 0) {
    fields.roleIds = 'At least one role is required.';
  }
  return Object.keys(fields).length ? fields : null;
}
