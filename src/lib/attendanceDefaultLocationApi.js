import { api } from './api';

const BASE = '/admin/attendance-default-location';

function clean(params) {
  const out = {};
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    out[key] = value;
  });
  return out;
}

// GET /admin/attendance-default-location/list
// Returns { success, data: [...], pagination: { total, size, currentPage, lastPage } }
// Each record maps a subject (a student batch, or an individual instructor /
// mentor / staff user) to one or more default attendance locations. When
// `anyLocation` is true the subject may mark attendance at any location.
export async function listDefaultLocations({
  search,
  subjectType, // 'batch' | 'user'
  userType,    // 1=Student, 2=Instructor, 3=Mentor, 4=Staff
  page = 1,
  size = 20,
} = {}) {
  const { data } = await api.get(`${BASE}/list`, {
    params: clean({ search, subjectType, userType, page, size }),
  });
  return data;
}

// POST /admin/attendance-default-location/add
//  • Students are mapped by batch    → { subjectType:'batch', subjectId: batchId, userType:1 }
//  • Others are mapped by individual → { subjectType:'user',  subjectId: userId,  userType }
// `anyLocation: true` means all locations are valid (locationIds ignored).
// `notifySchedule` only applies to student/batch mappings — controls when
// parents are auto-notified about absentees (see NOTIFY_OPTIONS in the page).
export async function createDefaultLocation({
  subjectType,
  subjectId,
  userType,
  locationIds,
  anyLocation,
  notifySchedule,
} = {}) {
  const { data } = await api.post(`${BASE}/add`, clean({
    subjectType,
    subjectId,
    userType,
    locationIds: anyLocation ? undefined : locationIds,
    anyLocation: !!anyLocation,
    notifySchedule,
  }));
  return data;
}

// PUT /admin/attendance-default-location/{id} — update locations / anyLocation.
export async function updateDefaultLocation(id, { locationIds, anyLocation } = {}) {
  const { data } = await api.put(`${BASE}/${id}`, clean({
    locationIds: anyLocation ? undefined : locationIds,
    anyLocation: !!anyLocation,
  }));
  return data;
}

// DELETE /admin/attendance-default-location/{id}
export async function deleteDefaultLocation(id) {
  const { data } = await api.delete(`${BASE}/${id}`);
  return data;
}
