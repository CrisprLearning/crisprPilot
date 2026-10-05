// Thin wrapper for the venue list endpoint. Used by the venue picker on the
// Schedules calendar event modal (Classroom Lecture / Offline Exam /
// Discussion event types).
//
//   GET /api/admin/venue/list?locationId=1&type=1
//        &sortBy=capacity&sortOrder=DESC

import { api } from './api';

const BASE = '/admin/venue/list';

export async function listVenues({
  type = 1,
  sortBy = 'capacity',
  sortOrder = 'DESC',
  locationId,                 // optional — only sent when provided
} = {}) {
  const params = { type, sortBy, sortOrder };
  if (locationId != null && locationId !== '') params.locationId = locationId;
  const res = await api.get(BASE, { params });
  return {
    items: Array.isArray(res?.data?.data) ? res.data.data : (Array.isArray(res?.data) ? res.data : []),
    meta:  res?.data?.meta || {},
  };
}
