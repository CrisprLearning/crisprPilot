// Digital Signage admin store — API-backed.
//
// Public surface (hooks + mutation helpers) is identical to the earlier
// in-memory version, so the React page code stays unchanged. The store
// is a publish/subscribe cache on top of `signageApi.js`:
//
//   • Each list hook (useBranches, useScreens, …) triggers a lazy fetch
//     on first use, then re-renders whenever the slice changes.
//   • Every mutation is async, hits the API, then patches the cache and
//     notifies subscribers. Returns the created/updated entity.
//   • A few field names differ between the API and the FE (kept stable
//     to avoid touching the page). The toUi/fromUi helpers translate.

import { useEffect, useState } from 'react';
import { Alerts, BrandingKits, Loops, Media, Schedules, Screens, SignageError, dashboard as fetchDashboard, contentTypes as fetchContentTypes } from './signageApi';
import { listLocations } from './locationsApi';

// ─── Static option pools (used by the page; unchanged) ───────────────
export const ORIENTATIONS = ['landscape', 'portrait'];
export const RESOLUTIONS  = ['1920x1080', '3840x2160', '1366x768', '1280x720'];
export const TIMEZONES    = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'UTC'];

export const TRANSITIONS = [
  { id: 'fade',      label: 'Fade',      icon: 'ti-arrows-shrink-1' },
  { id: 'slide',     label: 'Slide',     icon: 'ti-arrow-right' },
  { id: 'zoom',      label: 'Zoom',      icon: 'ti-zoom-in' },
  { id: 'blur',      label: 'Blur',      icon: 'ti-blur' },
  { id: 'wipe',      label: 'Wipe',      icon: 'ti-arrows-horizontal' },
  { id: 'cinematic', label: 'Cinematic', icon: 'ti-movie' },
];

export const SEVERITIES = [
  { id: 'info',     label: 'Info',     color: '#0369a1', bg: '#e0f2fe' },
  { id: 'warning',  label: 'Warning',  color: '#b45309', bg: '#fef3c7' },
  { id: 'critical', label: 'Critical', color: '#b91c1c', bg: '#fee2e2' },
];

// Visual/UI metadata for the content-type catalog. Keys must match the
// API's `key` strings exactly. Icons + colors stay client-side so the
// React picker doesn't have to wait on /content-types.
export const CONTENT_TYPES = [
  { id: 'BRANDING',          label: 'Animated Branding',    icon: 'ti-stamp',         color: '#7c3aed', scope: 'GLOBAL', desc: 'Logo, slogans, particle backgrounds, stat counters.' },
  { id: 'SIMPLE_TEXT',       label: 'Simple Text',          icon: 'ti-align-left',    color: '#0f766e', scope: 'GLOBAL', desc: 'A title and a block of text to display.' },
  { id: 'LIVE_CLASSES',      label: 'Live Class Board',     icon: 'ti-blackboard',    color: '#0d9488', scope: 'CENTER', desc: 'Ongoing classes, rooms, faculty.' },
  { id: 'FACULTY_SCHEDULE',  label: 'Faculty Schedule',     icon: 'ti-calendar-time', color: '#1d4ed8', scope: 'CENTER', desc: 'Today\'s faculty timetable and substitutions.' },
  { id: 'ATTENDANCE',        label: 'Attendance Summary',   icon: 'ti-checks',        color: '#059669', scope: 'CENTER', desc: 'Realtime branch attendance from biometric.' },
  { id: 'CHECKIN_FEED',      label: 'Check-in Feed',        icon: 'ti-user-check',    color: '#0891b2', scope: 'CENTER', desc: 'Floating overlay on biometric check-in.' },
  { id: 'TESTIMONIALS',      label: 'Testimonials',         icon: 'ti-quote',         color: '#be185d', scope: 'GLOBAL', desc: 'Carousel with optional QR for reviews.' },
  { id: 'TOPPERS',           label: 'Topper Hall of Fame',  icon: 'ti-trophy',        color: '#b45309', scope: 'GLOBAL', desc: 'Rank holders, college, exam, year.' },
  { id: 'COUNTDOWN',         label: 'Countdown Timer',      icon: 'ti-hourglass',     color: '#c026d3', scope: 'GLOBAL', desc: 'Days/hrs/min/sec to a target event.' },
  { id: 'EMERGENCY',         label: 'Alert Broadcast',      icon: 'ti-alert',         color: '#dc2626', scope: 'CENTER', desc: 'Fullscreen override for critical alerts.' },
  { id: 'AI_HIGHLIGHTS',     label: 'AI Highlights',        icon: 'ti-sparkles',      color: '#7c3aed', scope: 'CENTER', desc: 'Weekly achievers, charts, AI captions.' },
  { id: 'VIDEO',             label: 'Silent Video Loop',    icon: 'ti-video',         color: '#0369a1', scope: 'GLOBAL', desc: 'Looped mp4/webm with poster.' },
  { id: 'POSTER',            label: 'Simple Image',         icon: 'ti-photo',         color: '#475569', scope: 'CENTER', desc: 'Fullscreen image with optional CTA.' },
];

export const SCOPE_STYLES = {
  GLOBAL: { color: '#1d4ed8', bg: '#dbeafe', label: 'GLOBAL', hint: 'Same content on every branch' },
  CENTER: { color: '#b45309', bg: '#fef3c7', label: 'CENTER', hint: 'Pulled per-branch from local API' },
};

export const CONTENT_TYPE_MAP = Object.fromEntries(CONTENT_TYPES.map((t) => [t.id, t]));

export const WEEKDAYS = [
  { id: 'mon', label: 'Mon' }, { id: 'tue', label: 'Tue' }, { id: 'wed', label: 'Wed' },
  { id: 'thu', label: 'Thu' }, { id: 'fri', label: 'Fri' }, { id: 'sat', label: 'Sat' }, { id: 'sun', label: 'Sun' },
];

// ─── Field-name translation (API ↔ UI) ───────────────────────────────
// The page was built against an earlier shape; keep its names stable so
// the page itself doesn't have to change.
// Translate the location_id field returned by the API into the page's
// legacy `branch_id` name (and back). Same trick for alerts' array form.
function withBranchAlias(o) {
  if (!o) return o;
  if ('location_id' in o && !('branch_id' in o)) return { ...o, branch_id: o.location_id };
  return o;
}
function stripBranchAlias(o) {
  if (!o) return o;
  if ('branch_id' in o) {
    const { branch_id, ...rest } = o;
    return { ...rest, location_id: branch_id };
  }
  return o;
}

function toUiLoop(loop) {
  if (!loop) return loop;
  return withBranchAlias({
    ...loop,
    loop_enabled: loop.auto_replay,
    items: Array.isArray(loop.items) ? loop.items.map(toUiItem) : [],
  });
}
function fromUiLoop(input) {
  const { loop_enabled, items, ...rest } = input;
  const out = stripBranchAlias({ ...rest });
  if (loop_enabled !== undefined) out.auto_replay = loop_enabled;
  return out;
}
function toUiItem(item) {
  if (!item) return item;
  return { ...item, content_reference_id: item.media_id ?? null };
}
function fromUiItem(input) {
  const { content_reference_id, ...rest } = input;
  const out = { ...rest };
  if (content_reference_id !== undefined) out.media_id = content_reference_id;
  return out;
}
function toUiScreen(screen) {
  if (!screen) return screen;
  return withBranchAlias({ ...screen, assigned_timeline_id: screen.assigned_loop_id ?? null });
}
function fromUiScreen(input) {
  const { assigned_timeline_id, ...rest } = input;
  const out = stripBranchAlias({ ...rest });
  if (assigned_timeline_id !== undefined) out.assigned_loop_id = assigned_timeline_id;
  return out;
}
function toUiMedia(m) {
  if (!m) return m;
  return withBranchAlias({
    ...m,
    size: m.size_bytes,
    thumb: m.thumbnail_url || mediaTypeIcon(m.type),
  });
}
function toUiAlert(a) {
  if (!a) return a;
  if (Array.isArray(a.location_ids) && !Array.isArray(a.branch_ids)) {
    return { ...a, branch_ids: a.location_ids };
  }
  return a;
}
function fromUiAlert(input) {
  if (!input) return input;
  if (Array.isArray(input.branch_ids)) {
    const { branch_ids, ...rest } = input;
    return { ...rest, location_ids: branch_ids };
  }
  return input;
}
// Schedules reference their loop via `loop_id` on the API; the page uses
// the legacy `timeline_id` name. Alias both directions.
function toUiSchedule(s) {
  if (!s) return s;
  if ('loop_id' in s && !('timeline_id' in s)) return { ...s, timeline_id: s.loop_id };
  return s;
}
function fromUiSchedule(input) {
  if (!input) return input;
  if ('timeline_id' in input) {
    const { timeline_id, ...rest } = input;
    return { ...rest, loop_id: timeline_id };
  }
  return input;
}

function toUiBrandingKit(k) {
  if (!k) return k;
  return {
    ...k,
    display_name: k.display_name || '',
    logo_url:     k.logo_url || '',
    taglines:     Array.isArray(k.taglines) ? k.taglines : [],
    keywords:     Array.isArray(k.keywords) ? k.keywords : [],
    branch_ids:   Array.isArray(k.branch_ids) ? k.branch_ids : [],
    is_active:    k.is_active !== false,
  };
}
function mediaTypeIcon(type) {
  return type === 'video' ? '🎞️' : type === 'audio' ? '🔊' : type === 'lottie' ? '🎬' : '🖼️';
}

// ─── Pub/sub state ───────────────────────────────────────────────────
let _state = {
  branches:     [],   // sourced from the existing Locations API (see §4.0 of the contract)
  screens:      [],
  timelines:    [],   // a.k.a. loops
  schedules:    [],
  alerts:       [],
  media:        [],
  brandingKits: [],
  dashboard:    null,
  contentTypes: null,
};
const _loaded = { branches: false, screens: false, timelines: false, schedules: false, alerts: false, media: false, brandingKits: false, dashboard: false, contentTypes: false };
const _loading = { branches: false, screens: false, timelines: false, schedules: false, alerts: false, media: false, brandingKits: false, dashboard: false, contentTypes: false };
const _subs = new Set();

function notify() { for (const fn of _subs) { try { fn(_state); } catch { /* ignore subscriber errors */ } } }
function subscribe(fn) { _subs.add(fn); return () => _subs.delete(fn); }
function patch(slice, updater) {
  _state = { ..._state, [slice]: typeof updater === 'function' ? updater(_state[slice]) : updater };
  notify();
}
function upsert(arr, item) {
  const i = arr.findIndex((x) => x.id === item.id);
  if (i < 0) return [item, ...arr];
  const next = arr.slice();
  next[i] = { ...next[i], ...item };
  return next;
}
function removeById(arr, id) { return arr.filter((x) => x.id !== id); }

// Per-slice loaders. Idempotent — safe to call from every hook mount.
async function ensureLoaded(slice) {
  if (_loaded[slice] || _loading[slice]) return;
  _loading[slice] = true;
  try {
    if (slice === 'branches') {
      // Branches are now sourced from the existing Locations API. We
      // normalise to {id, name, code, city, timezone, active} so the
      // page's existing lookups keep working.
      const resp = await listLocations({ page: 1, size: 200, filterBy: 'all' });
      const rows = (resp?.data || []).map((l) => ({
        id:       l.id,
        name:     l.name,
        code:     l.code || '',
        city:     l.city || '',
        address:  l.address || '',
        timezone: l.timezone || 'Asia/Kolkata',
        active:   l.open !== false,
        raw:      l,
      }));
      patch('branches', rows);
    }
    if (slice === 'screens')      { const { data } = await Screens.list({ per_page: 200 });   patch('screens', data.map(toUiScreen)); }
    if (slice === 'timelines')    { const { data } = await Loops.list({ per_page: 200 });     patch('timelines', data.map(toUiLoop)); }
    if (slice === 'schedules')    { const { data } = await Schedules.list({ per_page: 200 }); patch('schedules', data.map(toUiSchedule)); }
    if (slice === 'alerts')       { const { data } = await Alerts.list({ per_page: 200 });    patch('alerts', data.map(toUiAlert)); }
    if (slice === 'media')        { const { data } = await Media.list({ per_page: 200 });     patch('media', data.map(toUiMedia)); }
    if (slice === 'brandingKits') { const { data } = await BrandingKits.list({ per_page: 200 }); patch('brandingKits', data.map(toUiBrandingKit)); }
    if (slice === 'dashboard')    { const d = await fetchDashboard();                         patch('dashboard', d); }
    if (slice === 'contentTypes') { const d = await fetchContentTypes();                      patch('contentTypes', d); }
    _loaded[slice] = true;
  } finally {
    _loading[slice] = false;
  }
}

function useSlice(slice, selector) {
  const [val, setVal] = useState(() => selector(_state));
  useEffect(() => {
    ensureLoaded(slice).catch(() => {});               // swallow — UI shows empty state
    return subscribe((s) => setVal(selector(s)));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return val;
}

export const useBranches     = () => useSlice('branches',     (s) => s.branches);
export const useLocations    = useBranches;                                            // canonical alias
export const useScreens      = () => useSlice('screens',      (s) => s.screens);
export const useTimelines    = () => useSlice('timelines',    (s) => s.timelines);
export const useSchedules    = () => useSlice('schedules',    (s) => s.schedules);
export const useAlerts       = () => useSlice('alerts',       (s) => s.alerts);
export const useMedia        = () => useSlice('media',        (s) => s.media);
export const useBrandingKits = () => useSlice('brandingKits', (s) => s.brandingKits);
export const useDashboard    = () => useSlice('dashboard',    (s) => s.dashboard);
export const useContentTypesCatalog = () => useSlice('contentTypes', (s) => s.contentTypes);

// Force-refresh helpers, for after destructive ops where the cache drift
// matters (e.g. media `uses` count after deleting a loop item).
export async function refresh(slice) { _loaded[slice] = false; await ensureLoaded(slice); }

// Hydrate the items[] of a single loop on demand (list endpoint omits them).
// Call from inside <TimelineEditor> when entering an edit session.
export async function ensureLoopDetail(loopId) {
  if (!loopId) return;
  const cached = _state.timelines.find((t) => t.id === loopId);
  if (cached && Array.isArray(cached.items) && cached.items.length > 0 && cached._detailed) return;
  try {
    const full = await Loops.get(loopId);
    const ui = { ...toUiLoop(full), _detailed: true };
    patch('timelines', (cur) => upsert(cur, ui));
  } catch { /* leave cached row in place */ }
}

// ─── Branches ────────────────────────────────────────────────────────
// CRUD is owned by the Locations module — see `src/pages/LocationsPage.jsx`
// and `src/lib/locationsApi.js`. The signage Branches tab has been removed.
// These stubs exist only so callers in old code paths fail loudly.
function branchOpRemoved() {
  throw new SignageError('not_implemented', 'Branch CRUD lives in the Locations module — open /locations.');
}
export const createBranch = branchOpRemoved;
export const updateBranch = branchOpRemoved;
export const deleteBranch = branchOpRemoved;

// ─── Screens ─────────────────────────────────────────────────────────
export async function createScreen(input) {
  const sc = await Screens.create(fromUiScreen(input));
  const ui = toUiScreen(sc);
  patch('screens', (cur) => upsert(cur, ui));
  return ui;                                            // includes `pairing_code` until paired
}
export async function updateScreen(id, body) {
  const sc = await Screens.update(id, fromUiScreen(body));
  const ui = toUiScreen(sc);
  patch('screens', (cur) => upsert(cur, ui));
  return ui;
}
export async function deleteScreen(id) {
  await Screens.remove(id);
  patch('screens', (cur) => removeById(cur, id));
}
export async function assignTimelineToScreens(timeline_id, screen_ids) {
  await Screens.bulkAssignLoop(screen_ids, timeline_id || null);
  patch('screens', (cur) => cur.map((s) => screen_ids.includes(s.id) ? { ...s, assigned_timeline_id: timeline_id || null } : s));
}
export async function regenerateScreenPairingCode(id) {
  const res = await Screens.regeneratePairing(id);
  // Response shape: { screen_id, pairing_code, pairing_expires_at }
  patch('screens', (cur) => cur.map((s) => s.id === id ? { ...s, pairing_code: res.pairing_code, pairing_expires_at: res.pairing_expires_at, paired_at: null } : s));
  return res;
}
export async function restartScreen(id) { return Screens.restart(id); }
// Fetch the canonical screen (GET /screens/{id}) — includes `pairing_code`
// + `pairing_expires_at` while the screen is still unpaired.
export async function getScreenDetail(id) {
  const sc = await Screens.get(id);
  const ui = toUiScreen(sc);
  patch('screens', (cur) => upsert(cur, ui));
  return ui;
}

// ─── Loops (timelines) ───────────────────────────────────────────────
export async function createTimeline(input) {
  const tl = await Loops.create(fromUiLoop(input));
  const ui = toUiLoop(tl);
  patch('timelines', (cur) => upsert(cur, ui));
  return ui;
}
export async function updateTimeline(id, body) {
  const tl = await Loops.update(id, fromUiLoop(body));
  const ui = toUiLoop({ ...tl, items: tl.items ?? _state.timelines.find((t) => t.id === id)?.items ?? [] });
  patch('timelines', (cur) => upsert(cur, ui));
  return ui;
}
export async function deleteTimeline(id) {
  await Loops.remove(id);
  patch('timelines', (cur) => removeById(cur, id));
  // Screens whose assigned_loop_id was this become unassigned server-side; mirror locally.
  patch('screens', (cur) => cur.map((s) => s.assigned_timeline_id === id ? { ...s, assigned_timeline_id: null } : s));
}
export async function duplicateTimeline(id) {
  const copy = await Loops.duplicate(id);
  const ui = { ...toUiLoop(copy), _detailed: true };
  patch('timelines', (cur) => upsert(cur, ui));
  return ui;
}

// ─── Loop items ──────────────────────────────────────────────────────
function replaceLoopItems(loopId, mapper) {
  patch('timelines', (cur) => cur.map((t) => t.id !== loopId ? t : ({ ...t, items: mapper(t.items || []) })));
}
export async function addTimelineItem(timeline_id, input) {
  const it = await Loops.addItem(timeline_id, fromUiItem(input));
  const ui = toUiItem(it);
  replaceLoopItems(timeline_id, (items) => [...items, ui]);
  return ui;
}
export async function updateTimelineItem(timeline_id, item_id, body) {
  const it = await Loops.updateItem(timeline_id, item_id, fromUiItem(body));
  const ui = toUiItem(it);
  replaceLoopItems(timeline_id, (items) => items.map((x) => x.id === item_id ? { ...x, ...ui } : x));
  return ui;
}
export async function deleteTimelineItem(timeline_id, item_id) {
  await Loops.deleteItem(timeline_id, item_id);
  replaceLoopItems(timeline_id, (items) => items.filter((x) => x.id !== item_id));
}
export async function duplicateTimelineItem(timeline_id, item_id) {
  const copy = await Loops.duplicateItem(timeline_id, item_id);
  const ui = toUiItem(copy);
  // Server inserts at original.position + 1; mirror by re-fetching to keep ordering exact.
  const full = await Loops.get(timeline_id);
  patch('timelines', (cur) => upsert(cur, { ...toUiLoop(full), _detailed: true }));
  return ui;
}
export async function reorderTimelineItem(timeline_id, from, to) {
  const cur = _state.timelines.find((t) => t.id === timeline_id);
  if (!cur || !Array.isArray(cur.items)) return;
  const next = cur.items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  // Optimistic
  replaceLoopItems(timeline_id, () => next);
  try {
    await Loops.reorderItems(timeline_id, next.map((x) => x.id));
  } catch (e) {
    // Roll back on reorder_set_mismatch or any other failure
    replaceLoopItems(timeline_id, () => cur.items);
    throw e;
  }
}
export async function bulkUpdateItemDurations(timeline_id, seconds) {
  await Loops.bulkDuration(timeline_id, seconds);
  replaceLoopItems(timeline_id, (items) => items.map((x) => ({ ...x, duration_seconds: seconds })));
}

// ─── Draft commit (loop editor) ──────────────────────────────────────
// The loop editor stages all item changes locally. `commitLoopDraft` diffs
// the desired final list (`draftItems`, in order) against the cached server
// items and replays the minimal set of add/update/delete calls, then reorders
// to match and re-fetches the canonical loop.
const DRAFT_ITEM_FIELDS = ['title', 'content_type', 'duration_seconds', 'transition_type', 'content_reference_id', 'overlay_enabled', 'background_audio_enabled'];
function itemFieldsChanged(a, b) {
  if (DRAFT_ITEM_FIELDS.some((k) => (a?.[k] ?? null) !== (b?.[k] ?? null))) return true;
  // `payload` is a free-form object (e.g. Simple Text body) — compare deeply.
  return JSON.stringify(a?.payload ?? null) !== JSON.stringify(b?.payload ?? null);
}
function isNewDraftItem(d) {
  return d._new === true || d.id == null || String(d.id).startsWith('tmp-');
}
export async function commitLoopDraft(loopId, draftItems) {
  const loop = _state.timelines.find((t) => t.id === loopId);
  const original = Array.isArray(loop?.items) ? loop.items : [];
  const keptIds = new Set(draftItems.filter((d) => !isNewDraftItem(d)).map((d) => d.id));

  // 1. Deletions (in original, gone from draft)
  for (const o of original) {
    if (!keptIds.has(o.id)) await Loops.deleteItem(loopId, o.id);
  }
  // 2. Adds + 3. Updates → build the final ordered id list
  const orderedIds = [];
  for (const d of draftItems) {
    if (isNewDraftItem(d)) {
      const { _new, id, ...rest } = d; // eslint-disable-line no-unused-vars
      const created = await Loops.addItem(loopId, fromUiItem(rest));
      orderedIds.push(created.id);
    } else {
      const orig = original.find((o) => o.id === d.id);
      if (orig && itemFieldsChanged(orig, d)) {
        await Loops.updateItem(loopId, d.id, fromUiItem(d));
      }
      orderedIds.push(d.id);
    }
  }
  // 4. Reorder to the draft order (API requires the exact current id set)
  if (orderedIds.length > 1) {
    try { await Loops.reorderItems(loopId, orderedIds); } catch { /* tolerate no-op / mismatch */ }
  }
  // 5. Re-fetch the canonical loop and patch the cache
  const full = await Loops.get(loopId);
  const ui = { ...toUiLoop(full), _detailed: true };
  patch('timelines', (cur) => upsert(cur, ui));
  return ui;
}

// ─── Schedules ───────────────────────────────────────────────────────
export async function createSchedule(input) {
  const sch = await Schedules.create(fromUiSchedule(input));
  const ui = toUiSchedule(sch);
  patch('schedules', (cur) => upsert(cur, ui));
  return ui;
}
export async function updateSchedule(id, body) {
  const sch = await Schedules.update(id, fromUiSchedule(body));
  const ui = toUiSchedule(sch);
  patch('schedules', (cur) => upsert(cur, ui));
  return ui;
}
export async function deleteSchedule(id) {
  await Schedules.remove(id);
  patch('schedules', (cur) => removeById(cur, id));
}

// ─── Alerts ──────────────────────────────────────────────────────────
export async function createAlert(input) {
  const al = await Alerts.create(fromUiAlert(input));
  const ui = toUiAlert(al);
  patch('alerts', (cur) => upsert(cur, ui));
  return ui;
}
export async function updateAlert(id, body) {
  const al = await Alerts.update(id, fromUiAlert(body));
  const ui = toUiAlert(al);
  patch('alerts', (cur) => upsert(cur, ui));
  return ui;
}
export async function deleteAlert(id) {
  await Alerts.remove(id);
  patch('alerts', (cur) => removeById(cur, id));
}
export async function broadcastAlert(id) {
  const al = await Alerts.broadcast(id);
  const ui = toUiAlert(al);
  patch('alerts', (cur) => upsert(cur, ui));
  return ui;
}
export async function dismissAlert(id) {
  const al = await Alerts.dismiss(id);
  const ui = toUiAlert(al);
  patch('alerts', (cur) => upsert(cur, ui));
  return ui;
}

// ─── Media ───────────────────────────────────────────────────────────
// `createMedia` is called from the page with either a File (real upload)
// or a synthesised payload (the current upload modal mocks an entry).
// Real uploads must arrive as `{ file, branch_id, name, tags }` (the page
// still uses the legacy field name; we translate to location_id here).
export async function createMedia(input) {
  if (input?.file instanceof File) {
    const m = await Media.upload(input.file, {
      location_id: input.branch_id ?? input.location_id ?? null,
      name: input.name,
      tags: input.tags,
    });
    const ui = toUiMedia(m);
    patch('media', (cur) => upsert(cur, ui));
    return ui;
  }
  // Fallback for the existing mock-upload UX — no real binary, so just
  // surface a friendly error. The Media tab upload UI should be wired
  // to <input type="file"> in a follow-up.
  throw new SignageError('validation_error', 'Pick a file to upload.');
}
export async function updateMedia(id, body) {
  const { branch_id, ...rest } = body || {};
  const apiBody = branch_id !== undefined ? { ...rest, location_id: branch_id } : rest;
  const m = await Media.update(id, apiBody);
  const ui = toUiMedia(m);
  patch('media', (cur) => upsert(cur, ui));
  return ui;
}
export async function deleteMedia(id, { force = false } = {}) {
  await Media.remove(id, { force });
  patch('media', (cur) => removeById(cur, id));
}

// ─── Branding kits ───────────────────────────────────────────────────
export async function createBrandingKit(input) {
  const k = await BrandingKits.create(input);
  const ui = toUiBrandingKit(k);
  patch('brandingKits', (cur) => upsert(cur, ui));
  return ui;
}
export async function updateBrandingKit(id, body) {
  const k = await BrandingKits.update(id, body);
  const ui = toUiBrandingKit(k);
  patch('brandingKits', (cur) => upsert(cur, ui));
  return ui;
}
export async function deleteBrandingKit(id) {
  await BrandingKits.remove(id);
  patch('brandingKits', (cur) => removeById(cur, id));
}

// ─── Formatting helpers (re-exported for the page) ──────────────────
export function fmtBytes(n) {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
export function fmtRelTime(iso) {
  if (!iso) return 'never';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
export function fmtDuration(s) {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60), r = s % 60;
  return r ? `${m}m ${r}s` : `${m}m`;
}
