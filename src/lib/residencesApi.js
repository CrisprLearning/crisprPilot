import { api } from './api';

const BASE = '/admin/residence';

export async function createResidence(payload) {
  const { data } = await api.post(`${BASE}/add`, payload);
  return data;
}

export async function listResidences({ activeOnly = 1, q = '', perPage = 20, page = 1 } = {}) {
  const { data } = await api.get(`${BASE}/list`, {
    params: {
      activeOnly,
      q: q || undefined,
      perPage,
      page,
    },
  });
  return data;
}

export async function getResidence(id) {
  const { data } = await api.get(`${BASE}/${id}`);
  return data;
}

export async function updateResidence(id, payload) {
  const { data } = await api.put(`${BASE}/${id}`, payload);
  return data;
}

export async function disableResidence(id) {
  const { data } = await api.patch(`${BASE}/${id}/disable`);
  return data;
}

export async function listHouses(id) {
  const { data } = await api.get(`${BASE}/${id}/houses`);
  return data;
}

export async function mapCandidate({ candidateId, residenceId, house }) {
  const { data } = await api.post(`${BASE}/map-candidate`, { candidateId, residenceId, house });
  return data;
}

export async function unmapCandidate(candidateId) {
  const { data } = await api.post(`${BASE}/unmap-candidate`, { candidateId });
  return data;
}

export async function listResidenceStudents(id, { q = '', perPage = 20, page = 1 } = {}) {
  const { data } = await api.get(`${BASE}/${id}/students`, {
    params: { q: q || undefined, perPage, page },
  });
  return data;
}
