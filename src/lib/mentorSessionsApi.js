import { api, apiError, apiFieldErrors } from './api';

// ─────────────────────────────────────────────────────────────────────────────
// Mentor Sessions (Audio Rooms) API client.
//
// Talks to the `audio_streams` backend module that schedules and tracks Audio
// Rooms used by mentors to interact with their student mentees. Rooms are
// provisioned on getstream.io as `audio_room` calls (host + co-hosts speak,
// listeners may "request to join" the stage when the host enables it).
//
// Base path resolves to `<origin>/api/admin/audio-streams` — the shared
// `api` axios instance already prefixes `/api` and injects X-Access-Token.
//
// Envelopes follow the house contract: single `{ data }`, list `{ data, meta }`,
// error `{ success: false, error: { code, message, fields? } }`. axios rejects on non-2xx, so
// callers run the error through `mentorSessionError()`.
//
// Full backend contract: docs/audio-streams-contract.md
// ─────────────────────────────────────────────────────────────────────────────

const BASE = '/admin/audio-streams';

// `code` is the API's lower_snake_case code; `fields` maps each invalid field
// to its first message (the API sends a list per field).
export function mentorSessionError(err) {
  const { status, code, message, fields } = apiError(err, 'Request failed');
  return {
    status,
    code,
    message,
    fields: fields ? apiFieldErrors(err) : null,
  };
}

// `true` when the error came from the getstream provisioning layer
// (stream_provision_failed, stream_golive_failed, stream_token_failed) — the
// FE should surface a retry affordance rather than a generic failure.
export function isStreamError(code) {
  return typeof code === 'string' && code.startsWith('stream_');
}

function clean(params) {
  const out = {};
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    out[k] = v;
  });
  return out;
}

// ── Sessions ─────────────────────────────────────────────────────────────────

export async function listMentorSessions({
  search,
  status,
  host_id,
  page = 1,
  per_page = 25,
  sort = '-scheduled_at',
} = {}) {
  const { data } = await api.get(BASE, {
    params: clean({ search, status, host_id, page, per_page, sort }),
  });
  return data; // { data: [...], meta }
}

export async function getMentorSession(id) {
  const { data } = await api.get(`${BASE}/${id}`);
  return data.data;
}

export async function createMentorSession(body) {
  const { data } = await api.post(BASE, body);
  return data.data;
}

export async function updateMentorSession(id, body) {
  const { data } = await api.patch(`${BASE}/${id}`, body);
  return data.data;
}

export async function cancelMentorSession(id) {
  await api.delete(`${BASE}/${id}`); // 204
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

// Open the room early (instant rooms call this on create). Backend goes live on
// getstream and flips status → 'live'.
export async function goLiveMentorSession(id) {
  const { data } = await api.post(`${BASE}/${id}/go-live`);
  return data.data;
}

export async function endMentorSession(id) {
  const { data } = await api.post(`${BASE}/${id}/end`);
  return data.data;
}

// ── Stream / tracking ────────────────────────────────────────────────────────

// Mint a short-lived getstream user token so an admin can preview / host the
// room from the browser. Returns { api_key, token, call_type, call_id, user_id }.
export async function getStreamToken(id) {
  const { data } = await api.post(`${BASE}/${id}/token`);
  return data.data;
}

// Live + historical participation for the tracking drawer.
export async function getSessionParticipants(id) {
  const { data } = await api.get(`${BASE}/${id}/participants`);
  return data.data; // { invited, joined, speakers, requests, peak_listeners, ... }
}

// ─────────────────────────────────────────────────────────────────────────────
// Demo fallback. The `audio_streams` backend module is not deployed yet, so the
// page degrades gracefully to this sample set (same pattern as MentorProfiles /
// other admin pages). Remove once the live endpoints are available.
// ─────────────────────────────────────────────────────────────────────────────

export const MENTOR_SESSIONS_DEMO = [
  {
    id: 'as_demo_1',
    title: 'IAT 2026 — Doubt Clearing Audio Room',
    brief: 'Open-mic doubt clearing for Physics & Chemistry ahead of the mock test.',
    host: { id: 'm1', name: 'Rajesh Kumar' },
    cohosts: [{ id: 'm2', name: 'Priya Sharma' }],
    audience_batches: [{ id: 'b1', name: 'IAT 2026 Morning' }, { id: 'b2', name: 'IAT 2026 Evening' }],
    mode: 'audio_room',
    is_instant: false,
    scheduled_at: '2026-06-20T15:30:00.000Z',
    duration_label: '1h',
    duration_minutes: 60,
    request_to_join: true,
    status: 'scheduled',
    stream: { call_type: 'audio_room', call_id: null, provisioned_at: null, join_url: null },
    stats: { invited_count: 84, joined_count: 0, peak_listeners: 0, speaker_count: 0 },
    created_at: '2026-06-15T09:00:00.000Z',
  },
  {
    id: 'as_demo_2',
    title: 'Mentor Connect — Weekly Check-in',
    brief: 'Weekly mentee check-in. Listeners can request to join the stage to share updates.',
    host: { id: 'm3', name: 'Vikram Singh' },
    cohosts: [],
    audience_batches: [{ id: 'b3', name: 'NEET 2026 Repeaters' }],
    mode: 'audio_room',
    is_instant: false,
    scheduled_at: '2026-06-17T11:00:00.000Z',
    duration_label: '45m',
    duration_minutes: 45,
    request_to_join: true,
    status: 'live',
    stream: {
      call_type: 'audio_room',
      call_id: 'audio_room:as_demo_2',
      provisioned_at: '2026-06-17T10:55:00.000Z',
      join_url: 'https://crisprtech.app/room/as_demo_2',
    },
    stats: { invited_count: 32, joined_count: 21, peak_listeners: 24, speaker_count: 3 },
    started_at: '2026-06-17T11:01:00.000Z',
    created_at: '2026-06-10T09:00:00.000Z',
  },
  {
    id: 'as_demo_3',
    title: 'Strategy Session — Final Revision Plan',
    brief: 'Mentor-led broadcast on how to structure the last 30 days of revision.',
    host: { id: 'm2', name: 'Priya Sharma' },
    cohosts: [{ id: 'm1', name: 'Rajesh Kumar' }, { id: 'm4', name: 'Anjali Gupta' }],
    audience_batches: [{ id: 'b1', name: 'IAT 2026 Morning' }],
    mode: 'audio_room',
    is_instant: false,
    scheduled_at: '2026-06-12T16:00:00.000Z',
    duration_label: '1h 30m',
    duration_minutes: 90,
    request_to_join: false,
    status: 'ended',
    stream: {
      call_type: 'audio_room',
      call_id: 'audio_room:as_demo_3',
      provisioned_at: '2026-06-12T15:55:00.000Z',
      join_url: 'https://crisprtech.app/room/as_demo_3',
      recording_url: 'https://crisprtech.app/recordings/as_demo_3.mp3',
    },
    stats: { invited_count: 40, joined_count: 36, peak_listeners: 38, speaker_count: 4 },
    started_at: '2026-06-12T16:00:00.000Z',
    ended_at: '2026-06-12T17:24:00.000Z',
    created_at: '2026-06-05T09:00:00.000Z',
  },
];
