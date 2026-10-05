import { api, apiError, apiFieldErrors } from './api';

const BASE = '/admin/rbac';

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

export async function fetchMe() {
  const { data } = await api.get('/admin/auth/me');
  return ensureOk(data);
}

// ── Permissions catalogue ───────────────────────────────────────────────────
export async function listPermissions() {
  const { data } = await api.get(`${BASE}/permissions`);
  return ensureOk(data);
}

/**
 * Grouped permissions catalogue for the role editor / matrix tree.
 * @returns {Promise<{ data: import('./rbacTypes').PermissionTreeModule[] }>}
 */
export async function getPermissionTree() {
  const { data } = await api.get(`${BASE}/permissions/tree`);
  return ensureOk(data);
}

// ── Roles ────────────────────────────────────────────────────────────────────
export async function listRoles() {
  const { data } = await api.get(`${BASE}/roles`);
  return ensureOk(data);
}

export async function getRole(id) {
  const { data } = await api.get(`${BASE}/roles/${id}`);
  return ensureOk(data);
}

/**
 * Create a role.
 * @param {{ key: string, label: string, badge_color?: string, permissions?: string[] }} payload
 */
export async function createRole({ key, label, badge_color, permissions }) {
  const body = { key, label };
  if (badge_color) body.badge_color = badge_color;
  if (Array.isArray(permissions)) body.permissions = permissions;
  const { data } = await api.post(`${BASE}/roles`, body);
  return ensureOk(data);
}

/**
 * Update a role's label / color / permissions. Any provided `permissions`
 * REPLACES the whole set. `key` is immutable on the backend, so it's not sent.
 * @param {number|string} id
 * @param {{ label?: string, badge_color?: string, permissions?: string[] }} patch
 */
export async function updateRole(id, patch = {}) {
  const body = {};
  if (patch.label !== undefined) body.label = patch.label;
  if (patch.badge_color !== undefined) body.badge_color = patch.badge_color;
  if (Array.isArray(patch.permissions)) body.permissions = patch.permissions;
  const { data } = await api.put(`${BASE}/roles/${id}`, body);
  return ensureOk(data);
}

/** Full replacement of a role's permission keys. */
export async function syncRolePermissions(id, permissions) {
  const { data } = await api.put(`${BASE}/roles/${id}/permissions`, { permissions });
  return ensureOk(data);
}

export async function deleteRole(id) {
  const { data } = await api.delete(`${BASE}/roles/${id}`);
  return ensureOk(data);
}

// ── Helpers ────────────────────────────────────────────────────────────────
export const SUPER_ADMIN = 'SUPER_ADMIN';

export const ROLE_KEY_REGEX = /^[A-Z0-9_]+$/;
export const ROLE_KEY_MAX = 125;
export const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

/** Validate an UPPER_SNAKE role key. Returns an error string or null. */
export function validateRoleKey(key) {
  if (!key) return 'Key is required.';
  if (key.length > ROLE_KEY_MAX) return `Key must be at most ${ROLE_KEY_MAX} characters.`;
  if (!ROLE_KEY_REGEX.test(key)) return 'Use uppercase letters, digits, and underscores only.';
  return null;
}

/** Validate a #rrggbb hex color. Returns an error string or null. */
export function validateHexColor(color) {
  if (!color) return null; // optional
  if (!HEX_COLOR_REGEX.test(color)) return 'Use a hex color like #7c3aed.';
  return null;
}

// Back-compat alias: older callers imported validateRoleName.
export const validateRoleName = validateRoleKey;

const ACTION_ORDER = ['view', 'create', 'edit', 'manage', 'delete', 'export'];

export function groupPermissions(permissionNames) {
  const groups = new Map();
  for (const name of permissionNames) {
    if (typeof name !== 'string' || !name) continue;
    const dot = name.indexOf('.');
    const module = dot === -1 ? name : name.slice(0, dot);
    const action = dot === -1 ? '' : name.slice(dot + 1);
    if (!groups.has(module)) groups.set(module, []);
    groups.get(module).push({ name, action });
  }
  const sorted = Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([module, items]) => ({
      module,
      items: items.sort((a, b) => {
        const ai = ACTION_ORDER.indexOf(a.action);
        const bi = ACTION_ORDER.indexOf(b.action);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return a.action.localeCompare(b.action);
      }),
    }));
  return sorted;
}

// { message, code, status, fields } for a failed call. `code` is the API's
// lower_snake_case error code; `fields` maps each invalid field to its first
// message (the API sends a list per field).
export function extractApiError(err) {
  const { message, code, status, fields } = apiError(err, 'Request failed');
  return { message, code, status, fields: fields ? apiFieldErrors(err) : null };
}
