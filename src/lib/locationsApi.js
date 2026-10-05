import { api, apiError, apiFieldErrors } from './api';

const LOC_BASE = '/admin/location';
const VEN_BASE = '/admin/venue';

export const LOCATION_TYPES = [
  { value: 1, label: 'Studio' },
  { value: 2, label: 'Institute' },
];

export const VENUE_TYPES = [
  { value: 1, label: 'Classroom' },
  { value: 2, label: 'Studio' },
  { value: 3, label: 'Cabin' },
  { value: 4, label: 'Hall' },
];

// Defensive only: the API now sends every error with a real 4xx/5xx status
// (axios rejects), so a 2xx `{ success:false }` body is not expected.
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

// { message, fields, status } for a failed call. `fields` maps each field of a
// validation_error to its first message (the API sends lists), else null.
export function extractApiError(err) {
  if (!err?.response) {
    return { message: err?.message || 'Request failed', fields: null, status: err?.response?.status };
  }
  const info = apiError(err, 'Request failed');
  const fields = apiFieldErrors(err);
  return { message: info.message, fields: Object.keys(fields).length ? fields : null, status: info.status };
}

// ── Locations ─────────────────────────────────────────────────────────────

export async function listLocations(params = {}) {
  const { data } = await api.get(`${LOC_BASE}/list`, { params });
  return ensureOk(data);
}

export async function addLocation(payload) {
  const { data } = await api.post(`${LOC_BASE}/add`, payload);
  return ensureOk(data);
}

export async function updateLocation(id, payload) {
  const { data } = await api.put(`${LOC_BASE}/${id}`, payload);
  return ensureOk(data);
}

export async function enablePublicAccess(id) {
  const { data } = await api.patch(`${LOC_BASE}/${id}/public-access/enable`);
  return ensureOk(data);
}

export async function disablePublicAccess(id) {
  const { data } = await api.patch(`${LOC_BASE}/${id}/public-access/disable`);
  return ensureOk(data);
}

export async function closeLocation(id) {
  const { data } = await api.patch(`${LOC_BASE}/${id}/close`);
  return ensureOk(data);
}

export async function openLocation(id) {
  const { data } = await api.patch(`${LOC_BASE}/${id}/open`);
  return ensureOk(data);
}

export async function listLocationVenues(id, params = {}) {
  const { data } = await api.get(`${LOC_BASE}/${id}/venues`, { params });
  return ensureOk(data);
}

// ── Venues ────────────────────────────────────────────────────────────────

export async function listVenues(params = {}) {
  const { data } = await api.get(`${VEN_BASE}/list`, { params });
  return ensureOk(data);
}

export async function addVenue(payload) {
  const { data } = await api.post(`${VEN_BASE}/add`, payload);
  return ensureOk(data);
}

export async function updateVenue(id, payload) {
  const { data } = await api.put(`${VEN_BASE}/${id}`, payload);
  return ensureOk(data);
}

export async function enableVenue(id) {
  const { data } = await api.patch(`${VEN_BASE}/${id}/enable`);
  return ensureOk(data);
}

export async function disableVenue(id) {
  const { data } = await api.patch(`${VEN_BASE}/${id}/disable`);
  return ensureOk(data);
}

// ── Validators ────────────────────────────────────────────────────────────

export function validateLocation({ name, type, address, latitude, longitude, contact }) {
  const fields = {};
  if (!name || !name.trim()) fields.name = 'Name is required.';
  else if (name.length > 80) fields.name = 'Max 80 characters.';
  if (type !== 1 && type !== 2) fields.type = 'Select a type.';
  if (!address || !address.trim()) fields.address = 'Address is required.';
  else if (address.length > 240) fields.address = 'Max 240 characters.';
  const lat = Number(latitude);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) fields.latitude = 'Latitude must be between -90 and 90.';
  const lng = Number(longitude);
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) fields.longitude = 'Longitude must be between -180 and 180.';
  if (!contact || !contact.trim()) fields.contact = 'Contact is required.';
  else if (contact.length > 15) fields.contact = 'Max 15 characters.';
  return Object.keys(fields).length ? fields : null;
}

export function validateVenue({ name, type, capacity }) {
  const fields = {};
  if (!name || !name.trim()) fields.name = 'Name is required.';
  else if (name.length > 80) fields.name = 'Max 80 characters.';
  if (![1, 2, 3, 4].includes(Number(type))) fields.type = 'Select a venue type.';
  if (capacity !== '' && capacity != null) {
    const cap = Number(capacity);
    if (!Number.isFinite(cap) || cap < 0 || cap > 255) fields.capacity = 'Capacity must be 0–255.';
  }
  return Object.keys(fields).length ? fields : null;
}
