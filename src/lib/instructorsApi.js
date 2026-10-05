// Thin wrapper for the people / instructor search endpoint. Used by the
// async instructor / host picker on the Schedules calendar event modal.
//
//   GET /api/admin/people/instructor/list?page=1&size=5&sortBy=name
//        &filterBy=<subject>&searchKey=<query>
//
// The underlying axios instance attaches X-Access-Token automatically.

import { api } from './api';

const BASE = '/admin/people/instructor/list';

export async function searchInstructors({
  page = 1,
  size = 10,
  sortBy = 'name',
  searchKey = '',
  filterBy = '',
} = {}) {
  const params = { page, size, sortBy };
  if (searchKey) params.searchKey = searchKey;
  if (filterBy) params.filterBy = filterBy;
  const res = await api.get(BASE, { params });
  return {
    items: Array.isArray(res?.data?.data) ? res.data.data : [],
    meta:  res?.data?.meta || { total: 0, page, size },
  };
}
