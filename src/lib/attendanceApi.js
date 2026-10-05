import { api } from './api';

const RECORDS_BASE = '/admin/attendance-record';

function clean(params) {
  const out = {};
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    out[key] = value;
  });
  return out;
}

// GET /admin/attendance-record/list
// Returns { success, data: [...], pagination: { total, size, currentPage, lastPage } }
export async function listAttendanceRecords({
  id,
  userId,
  userType,
  locationId,
  batchIds, // comma-separated string or array of batch ids to filter by
  year,
  month,
  day,
  filterBy,
  sortBy = 'date',
  sortOrder = 'DESC',
  page = 1,
  size = 20,
} = {}) {
  const batchIdsParam = Array.isArray(batchIds) ? batchIds.filter(Boolean).join(',') : batchIds;
  const { data } = await api.get(`${RECORDS_BASE}/list`, {
    params: clean({ id, userId, userType, locationId, batchIds: batchIdsParam, year, month, day, filterBy, sortBy, sortOrder, page, size }),
  });
  return data;
}

// POST /admin/attendance-record/send-parent-notification
// Wrapper endpoint for notifying parents of absentees. It logs to
// attendance_notification_log (preventing duplicate notifications for the same
// student/date) before internally invoking the campaign API.
//   date: 'DD-MM-YYYY'
//   data: [{ batch: <batchId number>, absentees: [<studentId numbers>] }]
export async function sendParentNotification({ date, data: payloadData } = {}) {
  const { data } = await api.post(`${RECORDS_BASE}/send-parent-notification`, {
    date,
    data: payloadData,
  });
  return data;
}
