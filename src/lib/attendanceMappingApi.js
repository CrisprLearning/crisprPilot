import { api } from './api';

const BASE = '/admin/attendance-mapping';

function clean(params) {
  const out = {};
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    out[key] = value;
  });
  return out;
}

// GET /admin/attendance-mapping/list
// Returns { success, data: [...], pagination: { total, size, currentPage, lastPage } }
export async function listMappings({
  id,
  search,
  userId,
  userType,
  filterBy,
  sortBy = 'id',
  sortOrder = 'DESC',
  page = 1,
  size = 20,
} = {}) {
  const { data } = await api.get(`${BASE}/list`, {
    params: clean({ id, search, userId, userType, filterBy, sortBy, sortOrder, page, size }),
  });
  return data;
}

// POST /admin/attendance-mapping/add
// accessProvidedAt is optional (server defaults to now); status defaults to 1=ACTIVE.
export async function createMapping({
  key,
  userId,
  userType,
  accessExpiryAt,
  locationId,
  status,
} = {}) {
  const { data } = await api.post(`${BASE}/add`, clean({
    key, userId, userType, accessExpiryAt, locationId, status,
  }));
  return data;
}

// PUT /admin/attendance-mapping/{id} — at least one of accessExpiryAt / status.
export async function updateMapping(id, { accessExpiryAt, status } = {}) {
  const { data } = await api.put(`${BASE}/${id}`, clean({ accessExpiryAt, status }));
  return data;
}

// Revoke = set status to 2 (REVOKED) via update.
export async function revokeMapping(id) {
  return updateMapping(id, { status: 2 });
}
