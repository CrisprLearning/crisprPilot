import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ToastRegion from '../components/ToastRegion';
import { searchInstructors } from '../lib/instructorsApi';
import { listVenues } from '../lib/venuesApi';
import {
  EVENT_TYPES,
  CONTENT_BOUND_TYPES, findExamRef, findQuizRef, findChapterRef,
  SUMMARY_CATEGORIES, categorizeEvents, fmtCompactDuration,
  WEEKDAY_SHORT, WEEKDAY_INIT, MONTH_NAMES, SLOT_MIN,
  dateKey, parseKey, addDays, sameDay, startOfWeek,
  minutesToLabel, minutesToInput, inputToMinutes, clampMin,
  uid, prettyDate,
  useSchedules, useLookups, getSchedules,
  loadLookups, loadSchedulesInRange, loadSchedule,
  createSchedule as storeCreateSchedule,
  updateScheduleMeta as storeUpdateMeta,
  deleteSchedule as storeDeleteSchedule,
  publishSchedule as storePublish,
  unpublishSchedule as storeUnpublish,
  addEventToSchedule, updateEventInSchedule, deleteEventFromSchedule,
  recurringEvent as storeRecurringEvent,
  findEventOverlaps,
  duplicateSchedule as storeDuplicate,
  copyEventsBetweenSchedules as storeCopyEvents,
  asApiError,
} from '../lib/schedulesStore';

const DAY_START_HOUR = 7;
const DAY_END_HOUR = 23;
const HOUR_HEIGHT = 56;
const MIN_PX = HOUR_HEIGHT / 60;

// Events that are delivered online (no physical venue) — surfaced with a green
// dot on the event tile for quick visual scan.
const ONLINE_EVENT_TYPES = new Set(['ONLINE_EXAM', 'ONLINE_QUIZ', 'RECORDED_LECTURE']);

// ─── Component ─────────────────────────────────────────────────────────
export default function SchedulesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const today = useMemo(() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; }, []);

  const schedules = useSchedules();
  const lookups = useLookups();
  const batchPool = lookups.batches || [];
  const instructorPool = lookups.instructors || [];
  const venuePool = lookups.venues || [];
  const testSeriesPool = lookups.test_series || [];
  const quizPool = lookups.quizzes || [];
  const coursePool = lookups.courses || [];

  const focusParam = searchParams.get('focus');
  const newParam = searchParams.get('new');
  const dateParam = searchParams.get('date');

  const [viewDate, setViewDate] = useState(today);
  const [viewMode, setViewMode] = useState('workweek');
  const [batchFilters, setBatchFilters] = useState([]); // [] = all batches
  const [scheduleFilters, setScheduleFilters] = useState([]); // day-view only
  const [teacherFilters, setTeacherFilters] = useState([]);
  const [venueFilters, setVenueFilters] = useState([]);
  // Per-day single-select schedule pick for work-week / week views.
  // { [dateKey]: scheduleId } — falls back to the day's first schedule if absent or stale.
  const [daySelections, setDaySelections] = useState({});
  // Day view shows ALL schedules side-by-side by default (split mode). User
  // can narrow to a single schedule by picking one from the day-popover —
  // that flips this to false. Switching dates resets back to split.
  const [daySplitMode, setDaySplitMode] = useState(true);
  const [typeFilters, setTypeFilters] = useState([]); // [] = all types

  // Modals
  const [dayPopover, setDayPopover] = useState(null);
  const [scheduleModal, setScheduleModal] = useState(null);
  const [eventModal, setEventModal] = useState(null);
  const [publishModal, setPublishModal] = useState(null);
  const [duplicateModal, setDuplicateModal] = useState(null);
  const [toasts, setToasts] = useState([]);

  const focusedSchedule = useMemo(
    () => schedules.find((s) => s.id === focusParam) || null,
    [schedules, focusParam]
  );

  // Sync view to focused schedule
  useEffect(() => {
    if (focusedSchedule) {
      setViewDate(parseKey(focusedSchedule.date));
      setViewMode('day');
    }
  }, [focusedSchedule?.id, focusedSchedule?.date]);

  // ?date=YYYY-MM-DD → jump view to that day (single-day view) and strip param
  useEffect(() => {
    if (dateParam) {
      try {
        setViewDate(parseKey(dateParam));
        setViewMode('day');
      } catch {/* ignore */}
      const next = new URLSearchParams(searchParams);
      next.delete('date');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateParam]);

  // ?new=1 → open create modal
  useEffect(() => {
    if (newParam === '1' && !scheduleModal) {
      setScheduleModal({ mode: 'create', defaultDate: dateKey(viewDate) });
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newParam]);

  function showToast(type, title, message) {
    const id = Date.now() + Math.random();
    setToasts((cur) => [...cur, { id, type, title, message }]);
    window.setTimeout(() => setToasts((cur) => cur.filter((t) => t.id !== id)), 4000);
  }

  // Map a server-error code → friendly toast. Used by all mutation handlers.
  function toastApiError(err, fallbackTitle = 'Action failed') {
    const e = asApiError(err);
    const batchName = (id) => batchPool.find((b) => String(b.id) === String(id))?.name || id;
    switch (e.code) {
      case 'batch_date_unique': {
        const c = e.details?.conflicts?.[0];
        return showToast('error', 'Batch conflict', c
          ? `${batchName(c.batch_id)} is already in "${c.schedule_name}".`
          : e.message);
      }
      case 'event_overlap': {
        const c = e.details?.conflicts?.[0] || e.details?.copying;
        return showToast('error', 'Time overlap', c?.title ? `Clashes with "${c.title}".` : e.message);
      }
      case 'recurrence_published_block': {
        const h = e.details?.hits?.[0];
        return showToast('error', 'Repeat blocked', h
          ? `"${h.schedule_name}" on ${h.date} is published.`
          : e.message);
      }
      case 'content_duplication_required':
        return showToast('error', 'Confirm needed', 'Shared-content events — confirm and retry.');
      case 'published_immutable':
        return showToast('error', 'Published', 'This schedule is published — unpublish to edit.');
      case 'no_events':
        return showToast('error', 'No events', 'Add at least one event before publishing.');
      case 'no_batches':
        return showToast('error', 'No batches', 'Link at least one batch before publishing.');
      case 'not_found':
        return showToast('error', 'Not found', e.message);
      case 'validation_error':
        return showToast('error', 'Validation', e.message);
      default:
        return showToast('error', fallbackTitle, e.message);
    }
  }

  // Load lookups once on mount.
  useEffect(() => {
    loadLookups().catch((e) => toastApiError(e, 'Failed to load lookups'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload schedules whenever the visible window changes. We pad ±7 days
  // around the view to keep neighboring days hot while paging.
  useEffect(() => {
    const center = viewDate;
    const from = dateKey(addDays(center, -7));
    const to   = dateKey(addDays(center,  14));
    loadSchedulesInRange({ from, to }).catch((e) => toastApiError(e, 'Failed to load schedules'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewDate]);

  // When the user navigates to a different day, the split-day mode is
  // intentional only for one day — reset on date change so the next day
  // starts in single-column mode again.
  useEffect(() => { setDaySplitMode(true); }, [viewDate]);

  // Honor ?focus= — ensure that specific schedule is in the store.
  useEffect(() => {
    if (focusParam) {
      loadSchedule(focusParam).catch((e) => toastApiError(e, 'Failed to load schedule'));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusParam]);

  // ─── Derived ──
  const visibleDays = useMemo(() => {
    if (viewMode === 'day') return [viewDate];
    const ws = startOfWeek(viewDate, true);
    const count = viewMode === 'workweek' ? 5 : 7;
    return Array.from({ length: count }, (_, i) => addDays(ws, i));
  }, [viewDate, viewMode]);

  const visibleRange = useMemo(() => {
    const a = visibleDays[0]; const b = visibleDays[visibleDays.length - 1];
    if (sameDay(a, b)) return `${a.getDate()} ${MONTH_NAMES[a.getMonth()].slice(0,3)} ${a.getFullYear()}`;
    const sameMonth = a.getMonth() === b.getMonth();
    return sameMonth
      ? `${a.getDate()}–${b.getDate()} ${MONTH_NAMES[a.getMonth()].slice(0,3)}, ${a.getFullYear()}`
      : `${a.getDate()} ${MONTH_NAMES[a.getMonth()].slice(0,3)} – ${b.getDate()} ${MONTH_NAMES[b.getMonth()].slice(0,3)}, ${a.getFullYear()}`;
  }, [visibleDays]);

  const schedulesByDate = useMemo(() => {
    const map = new Map();
    schedules.forEach((s) => {
      if (!map.has(s.date)) map.set(s.date, []);
      map.get(s.date).push(s);
    });
    return map;
  }, [schedules]);

  // Raw candidate list for a day after the batch filter (no per-day pick).
  function daySchedulesAll(d) {
    const key = dateKey(d);
    const all = schedulesByDate.get(key) || [];
    return batchFilters.length > 0
      ? all.filter((s) => batchFilters.some((bId) => s.batches.some((bb) => String(bb.id) === String(bId))))
      : all;
  }

  function schedulesForDay(d) {
    const key = dateKey(d);
    if (focusedSchedule) return focusedSchedule.date === key ? [focusedSchedule] : [];
    let res = daySchedulesAll(d);
    if (viewMode === 'day' && scheduleFilters.length > 0) {
      res = res.filter((s) => scheduleFilters.includes(s.id));
    }
    // In work-week / week, default to a single schedule per day (the picked one,
    // or the first if nothing's been picked).
    if (viewMode !== 'day' && res.length > 1) {
      const sel = daySelections[key];
      const id = (sel && res.some((s) => s.id === sel)) ? sel : res[0].id;
      res = res.filter((s) => s.id === id);
    }
    return res;
  }

  // ─── Conflict analysis ─────────────────────────────────────────────────
  // In split-day view (multiple schedules visible on the same day), detect
  // every teacher or venue that's double-booked across schedules.
  // • Always lists conflicting entities in the top banner.
  // • Renders red overlay bands ONLY when a single-value filter narrows to
  //   that exact teacher/venue (otherwise bands would clutter the grid).
  // Pure FE highlight — no model changes.
  const conflictInfo = useMemo(() => {
    const empty = { bands: [], entities: [], total: 0 };
    if (focusedSchedule || viewMode !== 'day') return empty;
    const key = dateKey(viewDate);
    const all = schedulesByDate.get(key) || [];
    let ss = batchFilters.length > 0
      ? all.filter((s) => batchFilters.some((bId) => s.batches.some((bb) => String(bb.id) === String(bId))))
      : all;
    if (scheduleFilters.length > 0) ss = ss.filter((s) => scheduleFilters.includes(s.id));
    if (ss.length < 2) return empty;

    function findOverlaps(items, kind, label) {
      const out = [];
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const a = items[i], b = items[j];
          if (a.s.id === b.s.id) continue;
          const start = Math.max(a.e.start, b.e.start);
          const end   = Math.min(a.e.end, b.e.end);
          if (start < end) out.push({ kind, label, start, end });
        }
      }
      out.sort((x, y) => x.start - y.start);
      const merged = [];
      for (const b of out) {
        const last = merged[merged.length - 1];
        if (last && b.start <= last.end) last.end = Math.max(last.end, b.end);
        else merged.push({ ...b });
      }
      return merged;
    }

    const teacherSet = new Set();
    const venueSet = new Set();
    ss.forEach((s) => s.events.forEach((e) => {
      if (e.instructor) teacherSet.add(e.instructor);
      if (e.venue) venueSet.add(e.venue);
    }));

    const teacherClashes = [];
    for (const t of teacherSet) {
      const items = [];
      ss.forEach((s) => s.events.forEach((e) => { if (e.instructor === t) items.push({ s, e }); }));
      const merged = findOverlaps(items, 'teacher', t);
      if (merged.length) teacherClashes.push({ label: t, intervals: merged });
    }
    const venueClashes = [];
    for (const v of venueSet) {
      const items = [];
      ss.forEach((s) => s.events.forEach((e) => { if (e.venue === v) items.push({ s, e }); }));
      const merged = findOverlaps(items, 'venue', v);
      if (merged.length) venueClashes.push({ label: v, intervals: merged });
    }

    const bands = [];
    if (teacherFilters.length === 1) {
      const hit = teacherClashes.find((c) => c.label === teacherFilters[0]);
      if (hit) bands.push(...hit.intervals);
    }
    if (venueFilters.length === 1) {
      const hit = venueClashes.find((c) => c.label === venueFilters[0]);
      if (hit) bands.push(...hit.intervals);
    }

    const entities = [
      ...teacherClashes.map((c) => ({ kind: 'teacher', label: c.label, count: c.intervals.length })),
      ...venueClashes.map((c)   => ({ kind: 'venue',   label: c.label, count: c.intervals.length })),
    ];
    const total = entities.reduce((a, e) => a + e.count, 0);
    return { bands, entities, total };
  }, [focusedSchedule, viewMode, viewDate, schedulesByDate, batchFilters, scheduleFilters, teacherFilters, venueFilters]);

  // Schedules available for the day-view dropdown (after batch filter applied).
  const daySchedulesAvailable = useMemo(() => {
    if (viewMode !== 'day') return [];
    const key = dateKey(viewDate);
    const all = schedulesByDate.get(key) || [];
    if (batchFilters.length === 0) return all;
    return all.filter((s) => batchFilters.some((bId) => s.batches.some((bb) => String(bb.id) === String(bId))));
  }, [viewMode, viewDate, schedulesByDate, batchFilters]);

  // Auto-prune scheduleFilters to only IDs that still exist for the current day/batch context.
  useEffect(() => {
    const validIds = new Set(daySchedulesAvailable.map((s) => s.id));
    setScheduleFilters((cur) => {
      const next = cur.filter((id) => validIds.has(id));
      return next.length === cur.length ? cur : next;
    });
  }, [daySchedulesAvailable]);

  // If the user picks multiple batches and the visible date range contains a
  // day where those batches sit across more than one schedule, we can't show a
  // single coherent view — surface an error instead of rendering events.
  // In Day view we render side-by-side columns instead, so no conflict applies.
  const multiBatchConflict = useMemo(() => {
    if (focusedSchedule) return null;
    if (viewMode === 'day') return null;
    if (batchFilters.length < 2) return null;
    for (const d of visibleDays) {
      const key = dateKey(d);
      const onDay = schedulesByDate.get(key) || [];
      const touched = new Set();
      for (const s of onDay) {
        if (s.batches.some((b) => batchFilters.some((bId) => String(bId) === String(b.id)))) touched.add(s.id);
      }
      if (touched.size > 1) return { dateKey: key, schedules: [...touched].map((id) => onDay.find((s) => s.id === id)) };
    }
    return null;
  }, [batchFilters, visibleDays, schedulesByDate, focusedSchedule, viewMode, scheduleFilters]);
  // Event-level filter (type / teacher / venue). Used by both the standard
  // grid and the split-day view so they stay consistent.
  function passesEventFilters(e) {
    if (typeFilters.length > 0 && !typeFilters.includes(e.type)) return false;
    if (teacherFilters.length > 0 && (!e.instructor || !teacherFilters.includes(e.instructor))) return false;
    if (venueFilters.length > 0 && (!e.venue || !venueFilters.includes(e.venue))) return false;
    return true;
  }

  function eventsForDay(d) {
    const ss = schedulesForDay(d);
    const out = [];
    ss.forEach((s) => s.events.forEach((e) => {
      if (!passesEventFilters(e)) return;
      out.push({ event: e, schedule: s });
    }));
    return out.sort((a, b) => a.event.start - b.event.start);
  }

  // ─── Nav ──
  function navPrev() { setViewDate(addDays(viewDate, viewMode === 'day' ? -1 : -7)); }
  function navNext() { setViewDate(addDays(viewDate, viewMode === 'day' ?  1 :  7)); }
  function navToday() { setViewDate(today); }

  function focusSchedule(s) {
    const next = new URLSearchParams(searchParams);
    next.set('focus', s.id);
    setSearchParams(next, { replace: false });
    setDayPopover(null);
  }
  function exitSchedule() {
    const next = new URLSearchParams(searchParams);
    next.delete('focus');
    setSearchParams(next, { replace: false });
    setViewMode('workweek');
  }

  // Clear focus but stay on the focused schedule's date in Day view, so the
  // user lands back on the split-by-schedule columns for that day.
  function viewAllSchedulesForFocusedDay() {
    if (!focusedSchedule) return;
    const dk = focusedSchedule.date;
    const next = new URLSearchParams(searchParams);
    next.delete('focus');
    setSearchParams(next, { replace: false });
    setViewDate(parseKey(dk));
    setViewMode('day');
    setScheduleFilters([]);
  }

  // ─── CRUD wrappers ──
  async function createSchedule(payload) {
    if (!payload.name.trim()) return showToast('error', 'Name required', 'Please enter a schedule name.');
    const { copyFromId, name, date, batch_ids } = payload;
    try {
      const s = await storeCreateSchedule({ name, date, batch_ids });
      let copyMsg = '';
      if (copyFromId) {
        try {
          const n = await storeCopyEvents(s.id, copyFromId, { confirmContentDuplication: payload.confirmContentDuplication });
          copyMsg = n ? ` Copied ${n} event(s) from source.` : '';
        } catch (e2) {
          toastApiError(e2, 'Copy failed');
        }
      }
      showToast('success', 'Schedule created', `Draft "${s.name}" started on ${date}.${copyMsg}`);
      setScheduleModal(null);
      const onSameDate = getSchedules().filter((x) => x.date === s.date);
      if (onSameDate.length > 1) {
        setViewDate(parseKey(s.date));
        setViewMode('day');
        setScheduleFilters([]);
      } else {
        focusSchedule(s);
      }
    } catch (e) {
      toastApiError(e, 'Create failed');
    }
  }
  async function updateScheduleMeta(payload) {
    const { copyFromId, id, name, date, batch_ids } = payload;
    try {
      await storeUpdateMeta(id, { name, date, batch_ids });
      let copyMsg = '';
      if (copyFromId) {
        try {
          const n = await storeCopyEvents(id, copyFromId, { confirmContentDuplication: payload.confirmContentDuplication });
          copyMsg = n ? ` Copied ${n} event(s) from source.` : '';
        } catch (e2) {
          toastApiError(e2, 'Copy failed');
        }
      }
      setScheduleModal(null);
      showToast('success', 'Schedule updated', `${name}.${copyMsg}`);
    } catch (e) {
      toastApiError(e, 'Update failed');
    }
  }
  async function deleteSchedule(id) {
    try {
      await storeDeleteSchedule(id);
      if (focusParam === id) exitSchedule();
      setScheduleModal(null);
      showToast('success', 'Schedule removed', '');
    } catch (e) {
      toastApiError(e, 'Delete failed');
    }
  }

  function openCreateEventAt(scheduleId, startMin) {
    const target = scheduleId
      ? schedules.find((s) => s.id === scheduleId)
      : focusedSchedule;
    if (!target) return;
    if (target.published) return showToast('info', 'Published', 'Unpublish the schedule to edit.');
    setEventModal({ mode: 'create', scheduleId: target.id, defaultStart: clampMin(startMin || 9 * 60) });
  }
  function openEditEvent(scheduleId, ev) {
    const target = scheduleId
      ? schedules.find((s) => s.id === scheduleId)
      : focusedSchedule;
    if (!target) return;
    if (target.published) return showToast('info', 'Read-only', 'This schedule is published.');
    setEventModal({ mode: 'edit', scheduleId: target.id, event: ev });
  }

  // The schedule the currently-open EventModal is targeting (split or focused).
  const modalSchedule = useMemo(
    () => eventModal ? schedules.find((s) => s.id === eventModal.scheduleId) : null,
    [eventModal, schedules]
  );
  async function saveEvent(payload) {
    const target = modalSchedule;
    if (!target) return;
    const { id, title, type, start, end, recurrence,
            instructor = '', venue = '', examId = '', quizId = '',
            courseId = '', moduleId = '', chapterId = '' } = payload;
    if (!title.trim()) return showToast('error', 'Title required', 'Please enter a title.');
    if (end <= start) return showToast('error', 'Invalid time', 'End must be after start.');

    const evCore = { title, type, start, end, instructor, venue, examId, quizId, courseId, moduleId, chapterId };

    if (id) {
      try {
        await updateEventInSchedule(target.id, { id, ...evCore });
        showToast('success', 'Event updated', title);
        setEventModal(null);
      } catch (e) {
        toastApiError(e, 'Update failed');
      }
      return;
    }

    if (recurrence && recurrence.enabled) {
      try {
        const res = await storeRecurringEvent(target.id, {
          event: evCore,
          recurrence: { days: recurrence.days, until: recurrence.until },
          confirmContentDuplication: recurrence.confirmContentDuplication === true,
        });
        const bits = [];
        if (res.placed_new)      bits.push(`${res.placed_new} new schedule(s) created`);
        if (res.appended)        bits.push(`appended to ${res.appended} existing`);
        if (res.skipped_partial) bits.push(`${res.skipped_partial} skipped (batches split across schedules)`);
        const placed = (res.placed_new || 0) + (res.appended || 0);
        const msg = bits.join('; ') || 'No occurrences placed';
        showToast(placed ? 'success' : 'error', placed ? 'Recurring event added' : 'No occurrences placed', msg);
        setEventModal(null);
      } catch (e) {
        toastApiError(e, 'Recurrence failed');
      }
      return;
    }

    try {
      await addEventToSchedule(target.id, evCore);
      showToast('success', 'Event added', title);
      setEventModal(null);
    } catch (e) {
      toastApiError(e, 'Add failed');
    }
  }
  async function deleteEvent(id) {
    if (!modalSchedule) return;
    try {
      await deleteEventFromSchedule(modalSchedule.id, id);
      setEventModal(null);
      showToast('success', 'Event removed', '');
    } catch (e) {
      toastApiError(e, 'Delete failed');
    }
  }

  // Drag-to-move / drag-to-resize commits land here.
  async function onEventTimeChange(scheduleId, eventId, newStart, newEnd) {
    const s = schedules.find((x) => x.id === scheduleId);
    if (!s || s.published) return;
    const ev = s.events.find((e) => e.id === eventId);
    if (!ev) return;
    if (newStart === ev.start && newEnd === ev.end) return;
    try {
      await updateEventInSchedule(scheduleId, { ...ev, start: newStart, end: newEnd });
      showToast('success', 'Event moved', `${minutesToLabel(newStart)} – ${minutesToLabel(newEnd)}`);
    } catch (e) {
      toastApiError(e, 'Move failed');
    }
  }

  // Publish
  async function openPublish(id) {
    const s = schedules.find((x) => x.id === id);
    if (!s) return;
    if (s.published) {
      try {
        await storeUnpublish(id);
        showToast('success', 'Schedule unpublished', s.name);
      } catch (e) { toastApiError(e, 'Unpublish failed'); }
      return;
    }
    if (s.events.length === 0) return showToast('error', 'No events', 'Add events before publishing.');
    setPublishModal({ scheduleId: id });
  }
  async function confirmPublish(extraIds) {
    const s = schedules.find((x) => x.id === publishModal.scheduleId);
    if (!s) return setPublishModal(null);
    try {
      await storePublish(s.id, extraIds || []);
      showToast('success', 'Schedule published', s.name);
      setPublishModal(null);
    } catch (e) {
      toastApiError(e, 'Publish failed');
    }
  }

  // Duplicate
  function openDuplicate(s) {
    setDuplicateModal({ schedule: s, toDate: dateKey(addDays(parseKey(s.date), 1)), name: s.name });
  }
  async function confirmDuplicate({ toDate, name, batchIds }) {
    try {
      const copy = await storeDuplicate(duplicateModal.schedule.id, { name, date: toDate, batch_ids: batchIds || [] });
      if (!copy) return;
      showToast('success', 'Duplicated', `${copy.events.length} event(s) copied.`);
      setDuplicateModal(null);
      focusSchedule(copy);
    } catch (e) {
      toastApiError(e, 'Duplicate failed');
    }
  }

  function openDayPopover(dk, anchorRect) {
    const list = schedulesByDate.get(dk) || [];
    if (!list.length) return showToast('info', 'No schedules', `No schedules on ${dk}.`);
    // Day view: pick → focus that schedule (existing behavior).
    // Work-week / week: pick → set the per-day selection (no navigation).
    const mode = viewMode === 'day' ? 'focus' : 'select';
    const currentId = mode === 'select'
      ? (daySelections[dk] || (daySchedulesAll(parseKey(dk))[0]?.id || null))
      : null;
    setDayPopover({ dateKey: dk, anchorRect, mode, currentId });
  }

  function pickDaySchedule(dk, scheduleId) {
    setDaySelections((cur) => ({ ...cur, [dk]: scheduleId }));
    setDayPopover(null);
  }

  const editable = !!focusedSchedule && !focusedSchedule.published;

  return (
    <section className="schedules-page" style={{ position: 'relative', minHeight: '100vh', paddingBottom: 40 }}>
      <ToastRegion toasts={toasts} onDismiss={(id) => setToasts((cur) => cur.filter((t) => t.id !== id))} />

      <PageHeader onBack={() => navigate('/schedule-list')} />

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 18, alignItems: 'start' }}>
        <aside style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 14, position: 'sticky', top: 18 }}>
          <MiniCalendar anchor={viewDate} today={today} schedulesByDate={schedulesByDate} onPick={(d) => setViewDate(d)} disabled={!!focusedSchedule} />
          <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap', gap: '4px 8px', fontSize: 10, color: 'var(--muted)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <span style={{ width: 5, height: 5, borderRadius: 999, background: '#10b981' }} />
              published
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <span style={{ width: 5, height: 5, borderRadius: 999, background: '#9ca3af' }} />
              draft
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <span style={{ width: 5, height: 5, borderRadius: 999, background: '#c4b5fd' }} />
              class
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <span style={{ width: 5, height: 5, borderRadius: 999, background: '#f87171' }} />
              exam
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <span style={{ width: 5, height: 5, borderRadius: 999, background: '#fcd34d' }} />
              live
            </span>
          </div>

          <SidebarFilter
            label="Batch"
            active={batchFilters.length + teacherFilters.length + venueFilters.length + typeFilters.length > 0}
            onClear={() => { setBatchFilters([]); setTeacherFilters([]); setVenueFilters([]); setTypeFilters([]); }}
          >
            <StringMultiSelect
              value={batchFilters}
              onChange={setBatchFilters}
              options={batchPool.map((b) => String(b.id))}
              getLabel={(id) => batchPool.find((b) => String(b.id) === String(id))?.name || id}
              disabled={!!focusedSchedule}
              allLabel="All batches"
              singular="batch" plural="batches"
              minWidth={0}
              style={{ width: '100%' }}
            />
          </SidebarFilter>

          <SidebarFilter label="Teacher">
            <StringMultiSelect
              value={teacherFilters}
              onChange={setTeacherFilters}
              options={instructorPool.map((i) => i.name)}
              allLabel="All teachers"
              singular="teacher" plural="teachers"
              minWidth={0}
              style={{ width: '100%' }}
            />
          </SidebarFilter>

          <SidebarFilter label="Venue">
            <StringMultiSelect
              value={venueFilters}
              onChange={setVenueFilters}
              options={venuePool.map((v) => v.name)}
              allLabel="All venues"
              singular="venue" plural="venues"
              minWidth={0}
              style={{ width: '100%' }}
            />
          </SidebarFilter>

          <SidebarFilter label="Event type">
            <StringMultiSelect
              value={typeFilters}
              onChange={setTypeFilters}
              options={Object.keys(EVENT_TYPES)}
              getLabel={(id) => EVENT_TYPES[id]?.label || id}
              allLabel="All types"
              singular="type" plural="types"
              minWidth={0}
              style={{ width: '100%' }}
            />
          </SidebarFilter>
        </aside>

        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, overflow: 'visible' }}>
          <Toolbar
            label={visibleRange}
            allDayPublished={
              viewMode === 'day' &&
              (() => {
                const list = schedulesByDate.get(dateKey(viewDate)) || [];
                return list.length > 0 && list.every((s) => s.published);
              })()
            }
            viewMode={viewMode}
            setViewMode={setViewMode}
            onPrev={navPrev}
            onNext={navNext}
            onToday={navToday}
            scheduleFilters={scheduleFilters}
            setScheduleFilters={setScheduleFilters}
            daySchedulesAvailable={daySchedulesAvailable}
            showViewAll={!!focusedSchedule && (schedulesByDate.get(focusedSchedule.date) || []).length > 1}
            viewAllCount={focusedSchedule ? (schedulesByDate.get(focusedSchedule.date) || []).length : 0}
            onViewAll={viewAllSchedulesForFocusedDay}
            focusedSchedule={focusedSchedule}
            isFocused={!!focusedSchedule}
            focusedPublished={!!(focusedSchedule && focusedSchedule.published)}
            onPublishFocused={focusedSchedule ? () => openPublish(focusedSchedule.id) : null}
            onNewSchedule={() => setScheduleModal({ mode: 'create', defaultDate: dateKey(viewDate) })}
            onNewEvent={() => openCreateEventAt(focusedSchedule?.id, 9 * 60)}
          />
          {focusedSchedule && (() => {
            const siblings = (schedulesByDate.get(focusedSchedule.date) || []);
            const more = Math.max(0, siblings.length - 1);
            return (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                padding: '10px 16px',
                background: '#eaf3f5', borderBottom: '1px solid var(--line)',
                fontSize: 13, color: 'var(--ink)',
              }}>
                <div>
                  You are viewing <strong style={{textDecoration: 'underline'}}>{focusedSchedule.name}</strong> schedule.
                </div>
                {more > 0 && (
                  <i style={{ color: 'var(--muted)', fontSize: 12 }}>
                    +{more} more on this day
                  </i>
                )}
              </div>
            );
          })()}
          {multiBatchConflict ? (
            <MultiBatchConflictPanel
              conflict={multiBatchConflict}
              batchFilters={batchFilters}
              onClearBatches={() => setBatchFilters([])}
              onSwitchToDay={() => { setViewDate(parseKey(multiBatchConflict.dateKey)); setViewMode('day'); }}
            />
          ) : focusedSchedule ? (
            <SplitDayGrid
              day={parseKey(focusedSchedule.date)}
              today={today}
              schedules={[focusedSchedule]}
              siblingTotal={1}
              headerReadOnly
              passesEventFilters={passesEventFilters}
              conflictInfo={{ bands: [], entities: [], total: 0 }}
              onEventClick={(ev, s) => openEditEvent(s.id, ev)}
              onSlotClick={(s, m) => openCreateEventAt(s.id, m)}
              onCreateForDate={(dk) => setScheduleModal({ mode: 'create', defaultDate: dk })}
              onEventTimeChange={onEventTimeChange}
            />
          ) : (viewMode === 'day' && !focusedSchedule) ? (
            (() => {
              const all = schedulesForDay(viewDate);
              let visible = all;
              if (all.length > 1 && !daySplitMode) {
                const sel = daySelections[dateKey(viewDate)];
                const found = sel ? all.find((s) => s.id === sel) : null;
                visible = [found || all[0]];
              }
              return (
            <SplitDayGrid
              day={viewDate}
              today={today}
              schedules={visible}
              siblingTotal={all.length}
              onShowSiblings={(s) => {
                // Anchor the popover relative to the trigger; SplitDayGrid
                // passes a rect through. Open in 'select' mode.
                const rect = s?.rect;
                setDayPopover({ dateKey: dateKey(viewDate), anchorRect: rect, mode: 'select', currentId: visible[0]?.id || null });
              }}
              passesEventFilters={passesEventFilters}
              conflictInfo={conflictInfo}
              onPinEntity={(ent) => {
                if (ent.kind === 'teacher') {
                  setTeacherFilters([ent.label]);
                  setVenueFilters([]);
                } else if (ent.kind === 'venue') {
                  setVenueFilters([ent.label]);
                  setTeacherFilters([]);
                }
              }}
              onScheduleHeaderClick={focusSchedule}
              onScheduleEditMeta={(s) => setScheduleModal({ mode: 'edit', schedule: s })}
              onScheduleDuplicate={openDuplicate}
              onSchedulePublish={(s) => openPublish(s.id)}
              onScheduleDelete={(s) => {
                if (window.confirm(`Delete schedule "${s.name}"? This removes all its events and cannot be undone.`)) {
                  deleteSchedule(s.id);
                }
              }}
              onEventClick={(ev, s) => openEditEvent(s.id, ev)}
              onSlotClick={(s, m) => openCreateEventAt(s.id, m)}
              onCreateForDate={(dk) => setScheduleModal({ mode: 'create', defaultDate: dk })}
              onEventTimeChange={onEventTimeChange}
            />
              );
            })()
          ) : (
            <WeekGrid
              days={visibleDays}
              today={today}
              pickedDateKey={viewMode === 'day' ? null : dateKey(viewDate)}
              schedulesForDay={schedulesForDay}
              daySchedulesAll={daySchedulesAll}
              eventsForDay={eventsForDay}
              focusedSchedule={focusedSchedule}
              editable={editable}
              onEventClick={(ev, sched) => openEditEvent((sched || focusedSchedule)?.id, ev)}
              onSlotClick={(d, m) => {
                if (focusedSchedule) {
                  openCreateEventAt(focusedSchedule.id, m);
                  return;
                }
                const shown = schedulesForDay(d)[0];
                if (!shown) {
                  showToast('error', 'No schedule', 'Create a schedule for this day first.');
                  return;
                }
                if (shown.published) {
                  showToast('error', 'Read-only', 'This schedule is published — unpublish to edit.');
                  return;
                }
                openCreateEventAt(shown.id, m);
              }}
              onDayHeaderClick={openDayPopover}
              onFocusSchedule={focusSchedule}
              onEditSchedule={(s) => setScheduleModal({ mode: 'edit', schedule: s })}
              onDuplicateSchedule={openDuplicate}
              onPublishSchedule={(s) => openPublish(s.id)}
              onDeleteSchedule={(s) => {
                if (window.confirm(`Delete schedule "${s.name}"? This removes all its events and cannot be undone.`)) {
                  deleteSchedule(s.id);
                }
              }}
              onCreateForDate={(dk) => setScheduleModal({ mode: 'create', defaultDate: dk })}
              onEventTimeChange={onEventTimeChange}
            />
          )}
        </div>
      </div>

      {dayPopover && (
        <DaySchedulesPopover
          dateKey={dayPopover.dateKey}
          anchorRect={dayPopover.anchorRect}
          schedules={schedulesByDate.get(dayPopover.dateKey) || []}
          mode={dayPopover.mode}
          currentId={dayPopover.currentId}
          onClose={() => setDayPopover(null)}
          onPick={dayPopover.mode === 'select'
            ? (s) => { pickDaySchedule(dayPopover.dateKey, s.id); setDaySplitMode(false); }
            : focusSchedule}
          onViewDay={(dk) => {
            setViewDate(parseKey(dk));
            setViewMode('day');
            setScheduleFilters([]);
            setDaySplitMode(true);
          }}
        />
      )}
      {scheduleModal && (
        <ScheduleModal
          state={scheduleModal}
          allSchedules={schedules}
          onClose={() => setScheduleModal(null)}
          onCreate={createSchedule}
          onUpdate={updateScheduleMeta}
          onDelete={deleteSchedule}
        />
      )}
      {eventModal && modalSchedule && (
        <EventModal
          state={eventModal}
          scheduleDate={modalSchedule.date}
          onClose={() => setEventModal(null)}
          onSave={saveEvent}
          onDelete={deleteEvent}
        />
      )}
      {publishModal && (
        <PublishModal
          schedule={schedules.find((s) => s.id === publishModal.scheduleId)}
          existingSchedules={schedules}
          onClose={() => setPublishModal(null)}
          onConfirm={confirmPublish}
        />
      )}
      {duplicateModal && (
        <DuplicateModal
          state={duplicateModal}
          allSchedules={schedules}
          onClose={() => setDuplicateModal(null)}
          onConfirm={confirmDuplicate}
        />
      )}
    </section>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────────────
function PageHeader({ onBack }) {
  return (
    <div style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.1)', marginBottom: 18, overflow: 'hidden' }}>
      <div style={{ background: 'linear-gradient(135deg, #006073 0%, #008ba3 100%)', padding: '15px 20px', color: 'white', display: 'flex', alignItems: 'center', gap: 15, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onBack}
          style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, flexShrink: 0 }}
        >
          <i className="ti ti-angle-left" /> Back to list
        </button>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="ti ti-calendar" style={{ opacity: 0.9, fontSize: 18 }} /> Schedule Calendar
          </h2>
          <p style={{ margin: 0, opacity: 0.85, fontSize: 13 }}>
            Build day plans, publish them, and link them to batches.
          </p>
        </div>
      </div>
    </div>
  );
}

function FocusedBanner({ schedule, onExit, onEditMeta, onPublish, onDuplicate, onDelete }) {
  const tone = schedule.published
    ? { bg: '#d1fae5', border: '#86efac', ink: '#065f46' }
    : { bg: '#eaf3f5', border: '#a4cdd2', ink: '#003e48' };
  return (
    <div style={{ background: tone.bg, border: `1px solid ${tone.border}`, borderRadius: 12, padding: '12px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <i className={schedule.published ? 'ti ti-check' : 'ti ti-pencil'} style={{ color: tone.ink, fontSize: 18 }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: tone.ink, fontSize: 15 }}>
            {schedule.name} <span style={{ fontWeight: 400, opacity: 0.7 }}>· {prettyDate(schedule.date)}</span>
          </div>
          <div style={{ color: tone.ink, opacity: 0.85, fontSize: 12, marginTop: 2 }}>
            {schedule.published ? 'Published — view only.' : 'Draft — click any time slot to add an event.'}
            {schedule.batches.length > 0 && <> &nbsp;·&nbsp; Batches: {schedule.batches.map((b) => b.name).join(', ')}</>}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
        <button type="button" style={btnGhost} onClick={onEditMeta}><i className="ti ti-settings" /> Edit details</button>
        <button type="button" style={btnGhost} onClick={onDuplicate}><i className="ti ti-files" /> Duplicate</button>
        {schedule.published
          ? <button type="button" style={btnGhost} onClick={onPublish}><i className="ti ti-pencil" /> Unpublish</button>
          : <button type="button" style={btnPrimary} onClick={onPublish}><i className="ti ti-check" /> Publish</button>}
        {!schedule.published && <button type="button" style={btnDanger} onClick={onDelete}><i className="ti ti-trash" /></button>}
        <button type="button" style={btnGhost} onClick={onExit}><i className="ti ti-close" /> Exit</button>
      </div>
    </div>
  );
}

function SidebarFilter({ label, active, onClear, clearLabel = 'Remove All Filters', children }) {
  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600 }}>{label}</span>
        {active && (
          <button
            type="button"
            onClick={onClear}
            style={{
              background: 'transparent', border: 'none', padding: 0,
              color: 'var(--danger)', fontSize: 11, fontWeight: 600,
              textDecorationLine: 'underline',
              textDecorationStyle: 'dashed',
              textUnderlineOffset: 2,
              cursor: 'pointer',
            }}
          >
            {clearLabel}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function Toolbar({ label, allDayPublished, viewMode, setViewMode, onPrev, onNext, onToday, scheduleFilters, setScheduleFilters, daySchedulesAvailable, showViewAll, viewAllCount, onViewAll, focusedSchedule, isFocused, focusedPublished, onPublishFocused, onNewSchedule, onNewEvent }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--line)', background: '#fbfcfd', flexWrap: 'wrap', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button type="button" onClick={onToday} style={btnGhost} disabled={isFocused}>Today</button>
        <div style={{ display: 'flex' }}>
          <button type="button" onClick={onPrev} disabled={isFocused} style={{ ...btnIcon, borderTopRightRadius: 0, borderBottomRightRadius: 0, opacity: isFocused ? 0.5 : 1, cursor: isFocused ? 'not-allowed' : 'pointer' }}><i className="ti ti-angle-left" /></button>
          <button type="button" onClick={onNext} disabled={isFocused} style={{ ...btnIcon, borderLeft: 'none', borderTopLeftRadius: 0, borderBottomLeftRadius: 0, opacity: isFocused ? 0.5 : 1, cursor: isFocused ? 'not-allowed' : 'pointer' }}><i className="ti ti-angle-right" /></button>
        </div>
        <div style={{ marginLeft: 8, fontWeight: 600, color: 'var(--ink)', fontSize: 15, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span>{label}</span>
          {allDayPublished && (
            <span title="All schedules of the day are Published" style={{ lineHeight: 0 }}>
              <VerifiedBadge size={16} />
            </span>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {viewMode === 'day' && !focusedSchedule && (
          <SchedulesMultiSelect
            value={scheduleFilters}
            onChange={setScheduleFilters}
            options={daySchedulesAvailable}
          />
        )}
        {!isFocused && showViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            title="Back to all schedules for this day"
            style={{
              background: 'transparent', border: 'none', padding: 0,
              color: 'var(--muted)', fontSize: 13, fontWeight: 600,
              textDecorationLine: 'underline',
              textDecorationStyle: 'dashed',
              textUnderlineOffset: 2,
              cursor: 'pointer',
            }}
          >
            View All {viewAllCount} Schedules
          </button>
        )}
        {!isFocused && (
          <select value={viewMode} onChange={(e) => setViewMode(e.target.value)} style={{ ...selStyle, width: 'auto', paddingRight: 28 }}>
            <option value="day">Day</option>
            <option value="workweek">Work week</option>
            <option value="week">Week</option>
          </select>
        )}
        {!isFocused && (
          <button type="button" onClick={onNewSchedule} style={btnPrimary}>
            <i className="ti ti-plus" /> New schedule
          </button>
        )}
        {isFocused && onPublishFocused && (
          focusedPublished ? (
            <button type="button" onClick={onPublishFocused} style={btnGhost}>
              <i className="ti ti-pencil-alt" /> Convert to Draft
            </button>
          ) : (
            <button type="button" onClick={onPublishFocused} style={btnPrimary}>
              <i className="ti ti-check" /> Publish Now
            </button>
          )
        )}
      </div>
    </div>
  );
}

function StringMultiSelect({ value, onChange, options, disabled, allLabel = 'All', singular = 'item', plural = 'items', minWidth = 220, style, getLabel = (o) => o }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const btnRef = useRef(null);
  const dropRef = useRef(null);
  const [rect, setRect] = useState(null);
  useEffect(() => {
    function onDown(e) {
      const t = e.target;
      if (ref.current && ref.current.contains(t)) return;
      if (dropRef.current && dropRef.current.contains(t)) return;
      setOpen(false);
    }
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, []);
  // Track the trigger's viewport rect so we can position the panel as fixed —
  // breaking out of any clipping or stacking-context the trigger sits inside.
  useEffect(() => {
    if (!open) return;
    function update() {
      if (btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    }
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  const label =
    value.length === 0 ? allLabel
    : value.length === 1 ? getLabel(value[0])
    : `${value.length} ${plural}`;

  function toggle(b) {
    onChange(value.includes(b) ? value.filter((x) => x !== b) : [...value, b]);
  }

  return (
    <div ref={ref} style={{ position: 'relative', minWidth, ...style }}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        style={{
          ...inputStyle,
          width: '100%',
          textAlign: 'left',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <i className={`ti ${open ? 'ti-angle-up' : 'ti-angle-down'}`} style={{ color: 'var(--muted)' }} />
      </button>
      {open && rect && (() => {
        // Flip the panel above the trigger when there isn't enough room below,
        // so dropdowns near the bottom of the sidebar stay fully on-screen.
        const spaceBelow = window.innerHeight - rect.bottom - 16;
        const spaceAbove = rect.top - 16;
        const openUp = spaceBelow < 200 && spaceAbove > spaceBelow;
        const maxHeight = Math.max(160, openUp ? spaceAbove : spaceBelow);
        return (
        <div ref={dropRef} style={{
          position: 'fixed',
          ...(openUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
          left: rect.left,
          width: rect.width,
          background: '#fff', border: '1px solid var(--line)', borderRadius: 8,
          boxShadow: '0 14px 38px rgba(0,0,0,0.12)', zIndex: 1100,
          maxHeight,
          overflow: 'auto',
        }}>
          {value.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              style={{
                width: '100%', textAlign: 'left', padding: '8px 12px',
                background: '#fbfcfd', border: 'none', cursor: 'pointer',
                fontSize: 12, color: 'var(--brand)', fontWeight: 700,
                borderBottom: '1px solid var(--line)',
              }}
            >
              <i className="ti ti-close" /> Clear all ({value.length})
            </button>
          )}
          {options.map((b) => {
            const sel = value.includes(b);
            return (
              <label
                key={b}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 12px', cursor: 'pointer',
                  background: sel ? '#eaf3f5' : '#fff',
                  borderTop: '1px solid #f3f5f6',
                }}
              >
                <input type="checkbox" checked={sel} onChange={() => toggle(b)} />
                <span style={{ fontSize: 13, color: 'var(--ink)' }}>{getLabel(b)}</span>
              </label>
            );
          })}
        </div>
        );
      })()}
    </div>
  );
}

function MiniCalendar({ anchor, today, schedulesByDate, onPick, disabled = false }) {
  const [month, setMonth] = useState(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  useEffect(() => { setMonth(new Date(anchor.getFullYear(), anchor.getMonth(), 1)); }, [anchor]);
  const firstWeek = startOfWeek(month, true);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(firstWeek, i));
  return (
    <div style={{ opacity: disabled ? 0.55 : 1, pointerEvents: disabled ? 'none' : 'auto' }} aria-disabled={disabled}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{MONTH_NAMES[month.getMonth()]} {month.getFullYear()}</div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button type="button" style={btnMicro} disabled={disabled} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><i className="ti ti-angle-up" /></button>
          <button type="button" style={btnMicro} disabled={disabled} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><i className="ti ti-angle-down" /></button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>
        {WEEKDAY_INIT.map((d, i) => <div key={i} style={{ textAlign: 'center' }}>{d}</div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map((d, i) => {
          const inMonth = d.getMonth() === month.getMonth();
          const isToday = sameDay(d, today);
          const isAnchor = sameDay(d, anchor);
          const list = schedulesByDate.get(dateKey(d)) || [];
          const hasPublished = list.some((s) => s.published);
          const hasDraft = list.some((s) => !s.published);
          return (
            <button
              key={i} type="button" disabled={disabled} onClick={() => onPick(d)}
              style={{
                position: 'relative', height: 30, borderRadius: 8, border: 'none',
                cursor: disabled ? 'not-allowed' : 'pointer',
                background: isAnchor ? 'var(--brand)' : isToday ? '#e6f0f2' : 'transparent',
                color: isAnchor ? '#fff' : inMonth ? 'var(--ink)' : '#c2cfd2',
                fontWeight: isAnchor || isToday ? 700 : 500, fontSize: 12,
              }}
            >
              {d.getDate()}
              <div style={{ position: 'absolute', bottom: 3, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 2 }}>
                {hasPublished && <span title="Published schedule(s) on this day" style={{ width: 4, height: 4, borderRadius: 4, background: isAnchor ? '#fff' : '#10b981' }} />}
                {hasDraft && <span title="Draft schedule(s) on this day" style={{ width: 4, height: 4, borderRadius: 4, background: isAnchor ? '#fff' : '#9ca3af' }} />}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SchedulesMultiSelect({ value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    function onDown(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, []);

  const selectedNames = value
    .map((id) => options.find((s) => s.id === id)?.name)
    .filter(Boolean);

  const label =
    options.length === 0     ? 'No schedules on this day'
    : value.length === 0     ? 'All schedules'
    : selectedNames.length === 1 ? selectedNames[0]
    : `${selectedNames.length} schedules`;

  function toggle(id) {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  }

  const empty = options.length === 0;

  return (
    <div ref={ref} style={{ position: 'relative', minWidth: 220 }}>
      <button
        type="button"
        onClick={() => !empty && setOpen((o) => !o)}
        disabled={empty}
        style={{
          ...inputStyle,
          width: '100%',
          textAlign: 'left',
          cursor: empty ? 'not-allowed' : 'pointer',
          opacity: empty ? 0.5 : 1,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <i className={`ti ${open ? 'ti-angle-up' : 'ti-angle-down'}`} style={{ color: 'var(--muted)' }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: '#fff', border: '1px solid var(--line)', borderRadius: 8,
          boxShadow: '0 14px 38px rgba(0,0,0,0.12)', zIndex: 800, maxHeight: 360, overflow: 'auto',
        }}>
          {value.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              style={{
                width: '100%', textAlign: 'left', padding: '8px 12px',
                background: '#fbfcfd', border: 'none', cursor: 'pointer',
                fontSize: 12, color: 'var(--brand)', fontWeight: 700,
                borderBottom: '1px solid var(--line)',
              }}
            >
              <i className="ti ti-close" /> Clear all ({value.length})
            </button>
          )}
          {options.map((s) => {
            const sel = value.includes(s.id);
            return (
              <label
                key={s.id}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                  padding: '8px 12px', cursor: 'pointer',
                  background: sel ? '#eaf3f5' : '#fff',
                  borderTop: '1px solid #f3f5f6',
                }}
              >
                <input type="checkbox" checked={sel} onChange={() => toggle(s.id)} style={{ marginTop: 2 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>{s.name}</span>
                    {s.published
                      ? <span style={{ background: '#d1fae5', color: '#047857', borderRadius: 999, padding: '1px 6px', fontSize: 9, fontWeight: 700 }}>PUBLISHED</span>
                      : <span style={{ background: '#eaf3f5', color: 'var(--brand)', borderRadius: 999, padding: '1px 6px', fontSize: 9, fontWeight: 700 }}>DRAFT</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, whiteSpace: 'normal' }}>
                    {s.batches.length === 0 ? <em>No batches linked</em> : s.batches.map((b) => b.name).join(", ")}
                    {' · '}{s.events.length} event{s.events.length === 1 ? '' : 's'}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SplitDayGrid({ day, today, schedules, siblingTotal, headerReadOnly, passesEventFilters, conflictInfo = { bands: [], entities: [], total: 0 }, onScheduleHeaderClick, onScheduleEditMeta, onScheduleDuplicate, onSchedulePublish, onScheduleDelete, onShowSiblings, onEventClick, onSlotClick, onCreateForDate, onEventTimeChange, onPinEntity }) {
  const { bands: conflictBands, entities: conflictEntities, total: conflictTotal } = conflictInfo;
  const hours = [];
  for (let h = DAY_START_HOUR; h <= DAY_END_HOUR; h++) hours.push(h);
  const gridHeight = (DAY_END_HOUR - DAY_START_HOUR + 1) * HOUR_HEIGHT;
  const isEmpty = schedules.length === 0;
  const colCount = isEmpty ? 1 : schedules.length;
  const colTemplate = `64px repeat(${colCount}, minmax(0, 1fr))`;
  const isToday = sameDay(day, today);
  const weekday = WEEKDAY_SHORT[(day.getDay() + 6) % 7];

  function handleSlotMouseDown(e, s) {
    if (e.target !== e.currentTarget) return;
    if (s.published) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const startMin = clampMin(DAY_START_HOUR * 60 + y / MIN_PX);
    onSlotClick(s, startMin);
  }

  return (
    <div>
      {/* Header row */}
      <div style={{ display: 'grid', gridTemplateColumns: colTemplate, borderBottom: '1px solid var(--line)', background: '#fbfcfd' }}>
        <div style={{ padding: '12px 10px', textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{weekday}</div>
          <div style={{ marginTop: 2, display: 'flex', justifyContent: 'center' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, borderRadius: 999,
              background: isToday ? 'var(--brand)' : 'transparent',
              color: isToday ? '#fff' : 'var(--ink)', fontWeight: 700, fontSize: 14,
            }}>{day.getDate()}</span>
          </div>
        </div>
        {isEmpty && (
          <div style={{
            padding: '10px 12px', borderLeft: '1px solid var(--line)',
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 13, fontStyle: 'italic', color: 'var(--muted)',
          }}>
            <span>No schedules</span>
            <NewScheduleCircle onClick={() => onCreateForDate && onCreateForDate(dateKey(day))} />
          </div>
        )}
        {!isEmpty && schedules.map((s) => {
          const totals = categorizeEvents(s.events);
          const parts = SUMMARY_CATEGORIES
            .map((cat) => ({ ...cat, value: fmtCompactDuration(totals[cat.key]) }))
            .filter((p) => p.value);
          const totalMins = totals.CLASSES + totals.EXAMS + totals.LIVE;
          return (
          <div
            key={s.id}
            style={{
              padding: '10px 12px', borderLeft: '1px solid var(--line)',
              textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 4,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
              {headerReadOnly ? (
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
              ) : (
                <ScheduleNameMenu
                  schedule={s}
                  onEdit={() => onScheduleEditMeta && onScheduleEditMeta(s)}
                  onDuplicate={() => onScheduleDuplicate && onScheduleDuplicate(s)}
                  onPublish={() => onSchedulePublish && onSchedulePublish(s)}
                  onDelete={() => onScheduleDelete && onScheduleDelete(s)}
                />
              )}
              {s.published
                ? <span style={{ background: '#d1fae5', color: '#047857', borderRadius: 999, padding: '1px 6px', fontSize: 9, fontWeight: 700 }}>PUBLISHED</span>
                : <span style={{ background: '#eef0f2', color: 'var(--muted)', borderRadius: 999, padding: '1px 6px', fontSize: 9, fontWeight: 700 }}>DRAFT</span>}
              {typeof siblingTotal === 'number' && siblingTotal > schedules.length && onShowSiblings && (
                <button
                  type="button"
                  onClick={(e) => onShowSiblings({ schedule: s, rect: e.currentTarget.getBoundingClientRect() })}
                  title="Pick another schedule for this day"
                  style={{
                    marginLeft: 'auto',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    gap: 3,
                    minWidth: 22, height: 18, padding: '0 6px',
                    background: 'var(--brand)', color: '#fff', border: 'none',
                    borderRadius: 999, fontSize: 10, fontWeight: 700,
                    flexShrink: 0, cursor: 'pointer',
                  }}
                >
                  {siblingTotal}<i className="ti ti-angle-down" style={{ fontSize: 9 }} />
                </button>
              )}
            </div>
            {headerReadOnly ? (
              <div
                style={{
                  color: 'var(--muted)', fontSize: 11, textAlign: 'left',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {s.batches.length === 0 ? <em>No batches</em> : s.batches.map((b) => b.name).join(", ")}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onScheduleEditMeta && onScheduleEditMeta(s)}
                title="Edit schedule details (name, date, batches)"
                style={{
                  background: 'transparent', border: 'none', padding: 0,
                  color: 'var(--muted)', font: 'inherit', cursor: 'pointer',
                  textAlign: 'left', fontSize: 11,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  textDecorationLine: 'underline', textDecorationStyle: 'dashed',
                  textUnderlineOffset: 2, textDecorationColor: 'var(--line)',
                }}
              >
                {s.batches.length === 0 ? <em>No batches</em> : s.batches.map((b) => b.name).join(", ")}
              </button>
            )}
            {parts.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--muted)' }}>
                {parts.map((p) => (
                  <span key={p.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 7, height: 7, borderRadius: 999, background: p.color, flexShrink: 0 }} />
                    <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{p.value}</span>
                  </span>
                ))}
                <span style={{ fontStyle: 'italic' }}>({fmtCompactDuration(totalMins)})</span>
              </div>
            )}
          </div>
          );
        })}
      </div>
      {conflictTotal > 0 && (
        <div style={{ padding: '8px 16px', background: '#fef2f2', borderBottom: '1px solid #fecaca', fontSize: 12, color: '#7f1d1d', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <i className="ti ti-alert" />
          <span><strong>{conflictTotal} conflict{conflictTotal === 1 ? '' : 's'} detected</strong> — with </span>
          {conflictEntities.map((ent) => (
            <button
              key={`${ent.kind}-${ent.label}`}
              type="button"
              onClick={() => onPinEntity?.(ent)}
              title={`Filter to this ${ent.kind} to highlight overlap time bands`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: '#fff', border: '1px solid #fecaca', color: '#7f1d1d',
                borderRadius: 999, padding: '2px 10px', fontSize: 11, fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <i className={`ti ${ent.kind === 'teacher' ? 'ti-mortar-board' : 'ti-pin'}`} />
              {ent.label}
              {ent.count > 1 && <span style={{ color: '#dc2626' }}>×{ent.count}</span>}
            </button>
          ))}
        </div>
      )}
      {/* Grid body — one column per schedule */}
      <div style={{ display: 'grid', gridTemplateColumns: colTemplate, height: gridHeight, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'relative' }}>
          {hours.map((h, i) => (
            <div key={h} style={{ position: 'absolute', top: i * HOUR_HEIGHT, right: 6, fontSize: 11, color: 'var(--muted)', transform: 'translateY(-6px)' }}>
              {minutesToLabel(h * 60)}
            </div>
          ))}
        </div>
        {/* Conflict overlay bands spanning all schedule columns */}
        {conflictBands.map((b, i) => (
          <div
            key={i}
            title={`${b.kind === 'teacher' ? 'Teacher' : 'Venue'} conflict — ${b.label} · ${minutesToLabel(b.start)}–${minutesToLabel(b.end)}`}
            style={{
              position: 'absolute',
              left: 64, right: 0,
              top: (b.start - DAY_START_HOUR * 60) * MIN_PX,
              height: Math.max(4, (b.end - b.start) * MIN_PX),
              background: 'repeating-linear-gradient(135deg, rgba(220, 38, 38, 0.16) 0 8px, rgba(220, 38, 38, 0.08) 8px 16px)',
              border: '1px dashed #dc2626',
              pointerEvents: 'none',
              zIndex: 5,
            }}
          >
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              margin: 4,
              background: '#dc2626', color: '#fff',
              padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700,
              boxShadow: '0 2px 6px rgba(220, 38, 38, 0.4)',
            }}>
              <i className="ti ti-alert" />
              {b.kind === 'teacher' ? 'Teacher' : 'Venue'}: {b.label} · {minutesToLabel(b.start)}–{minutesToLabel(b.end)}
            </div>
          </div>
        ))}
        {isEmpty && (
          <div style={{ position: 'relative', borderLeft: '1px solid var(--line)', background: '#fff' }}>
            {hours.map((h, j) => (
              <div key={h} style={{ position: 'absolute', top: j * HOUR_HEIGHT, left: 0, right: 0, borderTop: j === 0 ? 'none' : '1px solid #eef2f4' }} />
            ))}
            {hours.map((h, j) => (
              <div key={`h-${h}`} style={{ position: 'absolute', top: j * HOUR_HEIGHT + HOUR_HEIGHT / 2, left: 0, right: 0, borderTop: '1px dashed #f1f4f5' }} />
            ))}
          </div>
        )}
        {!isEmpty && schedules.map((s) => {
          const evs = s.events.filter(passesEventFilters).slice().sort((a, b) => a.start - b.start);
          return (
            <div
              key={s.id}
              onMouseDown={(e) => handleSlotMouseDown(e, s)}
              style={{
                position: 'relative', borderLeft: '1px solid var(--line)',
                background: s.published ? 'repeating-linear-gradient(45deg, #fafbfc 0 8px, #f4f6f8 8px 16px)' : '#fff',
                cursor: s.published ? 'not-allowed' : 'cell',
              }}
            >
              {hours.map((h, j) => (
                <div key={h} style={{ position: 'absolute', top: j * HOUR_HEIGHT, left: 0, right: 0, borderTop: j === 0 ? 'none' : '1px solid #eef2f4' }} />
              ))}
              {hours.map((h, j) => (
                <div key={`h-${h}`} style={{ position: 'absolute', top: j * HOUR_HEIGHT + HOUR_HEIGHT / 2, left: 0, right: 0, borderTop: '1px dashed #f1f4f5' }} />
              ))}
              {evs.map((ev) => (
                <EventBlock
                  key={ev.id}
                  ev={ev}
                  schedule={s}
                  onClick={() => onEventClick(ev, s)}
                  onUpdateTime={(ns, ne) => onEventTimeChange(s.id, ev.id, ns, ne)}
                  readOnly={s.published}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MultiBatchConflictPanel({ conflict, batchFilters, onClearBatches, onSwitchToDay }) {
  return (
    <div style={{ padding: '48px 24px', display: 'flex', justifyContent: 'center' }}>
      <div style={{ maxWidth: 560, width: '100%', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 14, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 999, background: '#fed7aa', color: '#7c2d12',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 18,
          }}>
            <i className="ti ti-alert" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, color: '#7c2d12', fontSize: 16, marginBottom: 6 }}>
              Multiple schedules in this date range
            </div>
            <p style={{ margin: 0, color: '#7c2d12', fontSize: 13.5, lineHeight: 1.55 }}>
              Only a common schedule can be viewed for a date-range. For the selected batches, there are more than 1 schedule added in the date range. Change date range or batches selected to continue.
            </p>
            <div style={{ marginTop: 14, padding: 12, background: '#fff', border: '1px solid #fed7aa', borderRadius: 10 }}>
              <div style={{ fontSize: 11, color: '#7c2d12', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 700, marginBottom: 6 }}>
                Conflict on {prettyDate(conflict.dateKey)}
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                {conflict.schedules.map((s) => {
                  const matched = s.batches.filter((b) => batchFilters.some((bId) => String(bId) === String(b.id)));
                  return (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink)' }}>
                      <i className="ti ti-layers" style={{ color: 'var(--brand)' }} />
                      <span style={{ fontWeight: 700 }}>{s.name}</span>
                      <span style={{ color: 'var(--muted)' }}>· covers {matched.map((b) => b.name).join(', ')}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              <button type="button" onClick={onSwitchToDay} style={btnGhost}>
                <i className="ti ti-calendar" /> View {conflict.dateKey} as day
              </button>
              <button type="button" onClick={onClearBatches} style={btnGhost}>
                <i className="ti ti-close" /> Clear batch filter
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function WeekGrid({ days, today, pickedDateKey, schedulesForDay, daySchedulesAll, eventsForDay, focusedSchedule, editable, onEventClick, onSlotClick, onDayHeaderClick, onFocusSchedule, onEditSchedule, onDuplicateSchedule, onPublishSchedule, onDeleteSchedule, onCreateForDate, onEventTimeChange }) {
  const hours = [];
  for (let h = DAY_START_HOUR; h <= DAY_END_HOUR; h++) hours.push(h);
  const gridHeight = (DAY_END_HOUR - DAY_START_HOUR + 1) * HOUR_HEIGHT;
  const dayColTemplate = `64px repeat(${days.length}, minmax(0, 1fr))`;

  function handleSlotMouseDown(e, day) {
    if (e.target !== e.currentTarget) return;
    // Focused mode: only the focused day's column is interactive, and only
    // if its schedule is still a draft.
    if (focusedSchedule) {
      if (focusedSchedule.published) return;
      if (dateKey(day) !== focusedSchedule.date) return;
    }
    // In non-focused mode the parent handler resolves which schedule the
    // click belongs to and either opens the create-event modal or toasts.
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const startMin = clampMin(DAY_START_HOUR * 60 + y / MIN_PX);
    onSlotClick(day, startMin);
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: dayColTemplate, borderBottom: '1px solid var(--line)', background: '#fbfcfd' }}>
        <div />
        {days.map((d, i) => {
          const isToday = sameDay(d, today);
          const dk = dateKey(d);
          const allOnDay = daySchedulesAll ? daySchedulesAll(d) : schedulesForDay(d);
          const totalAll = allOnDay.length;
          const shown = schedulesForDay(d)[0]; // the one whose events render in this column
          const isFocusedDay = focusedSchedule && focusedSchedule.date === dk;
          const isPicked = !isToday && pickedDateKey === dk;
          const allPublished = totalAll > 0 && allOnDay.every((s) => s.published);
          return (
            <div key={i} style={{ position: 'relative', padding: '10px 10px 8px', borderLeft: '1px solid var(--line)', background: isFocusedDay ? '#eaf3f5' : 'transparent' }}>
              {allPublished && (
                <span
                  title="All schedules of the day are Published"
                  style={{ position: 'absolute', top: 6, right: 6, lineHeight: 0 }}
                >
                  <VerifiedBadge size={16} />
                </span>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%', textAlign: 'left' }}>
                <button
                  type="button"
                  onClick={(e) => onDayHeaderClick(dk, e.currentTarget.getBoundingClientRect())}
                  title="View schedules for this day"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%',
                    background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit', textAlign: 'left',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{WEEKDAY_SHORT[(d.getDay() + 6) % 7]}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 28, height: 28, borderRadius: 999,
                        boxSizing: 'border-box',
                        background: isToday ? 'var(--brand)' : 'transparent',
                        color: isToday ? '#fff' : 'var(--ink)', fontWeight: 700, fontSize: 14,
                        border: isPicked ? '2px dashed var(--brand)' : 'none',
                      }}>{d.getDate()}</span>
                    </div>
                  </div>
                </button>
                {!shown && (!focusedSchedule || isFocusedDay) && (
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 6, maxWidth: '100%' }}>
                    <span>No schedules</span>
                    <NewScheduleCircle onClick={() => onCreateForDate && onCreateForDate(dk)} />
                  </div>
                )}
                {shown && !focusedSchedule && (
                  <div style={{ fontSize: 11, color: 'var(--brand)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, maxWidth: '100%' }}>
                    <i
                      className={`ti ${shown.published ? 'ti-check' : 'ti-time'}`}
                      title={shown.published ? 'Published' : 'Draft'}
                      style={{ color: shown.published ? '#047857' : 'var(--muted)' }}
                    />
                    <ScheduleNameMenu
                      schedule={shown}
                      onEdit={() => onEditSchedule && onEditSchedule(shown)}
                      onDuplicate={() => onDuplicateSchedule && onDuplicateSchedule(shown)}
                      onPublish={() => onPublishSchedule && onPublishSchedule(shown)}
                      onDelete={() => onDeleteSchedule && onDeleteSchedule(shown)}
                    />
                    {totalAll > 1 && (
                      <button
                        type="button"
                        onClick={(e) => onDayHeaderClick(dk, e.currentTarget.getBoundingClientRect())}
                        title="Pick which schedule to show in this column"
                        style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          gap: 3,
                          minWidth: 22, height: 18, padding: '0 6px',
                          background: 'var(--brand)', color: '#fff', border: 'none',
                          borderRadius: 999, fontSize: 10, fontWeight: 700,
                          flexShrink: 0, marginLeft: 'auto', cursor: 'pointer',
                        }}
                      >
                        {totalAll}<i className="ti ti-angle-down" style={{ fontSize: 9 }} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: dayColTemplate, height: gridHeight, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'relative' }}>
          {hours.map((h, i) => (
            <div key={h} style={{ position: 'absolute', top: i * HOUR_HEIGHT, right: 6, fontSize: 11, color: 'var(--muted)', transform: 'translateY(-6px)' }}>
              {minutesToLabel(h * 60)}
            </div>
          ))}
        </div>
        {days.map((d, i) => {
          const dk = dateKey(d);
          const dayEvs = eventsForDay(d);
          const dimmed = focusedSchedule && focusedSchedule.date !== dk;
          const shownForDay = schedulesForDay(d)[0];
          const canCreateHere = focusedSchedule
            ? !focusedSchedule.published && focusedSchedule.date === dk
            : !!shownForDay && !shownForDay.published;
          const slotCursor = canCreateHere ? 'cell' : 'default';
          return (
            <div
              key={i}
              onMouseDown={(e) => handleSlotMouseDown(e, d)}
              style={{
                position: 'relative', borderLeft: '1px solid var(--line)',
                background: dimmed ? 'repeating-linear-gradient(45deg, #fafbfc 0 8px, #f4f6f8 8px 16px)' : '#fff',
                cursor: slotCursor,
              }}
            >
              {hours.map((h, j) => (
                <div key={h} style={{ position: 'absolute', top: j * HOUR_HEIGHT, left: 0, right: 0, borderTop: j === 0 ? 'none' : '1px solid #eef2f4' }} />
              ))}
              {hours.map((h, j) => (
                <div key={`h-${h}`} style={{ position: 'absolute', top: j * HOUR_HEIGHT + HOUR_HEIGHT / 2, left: 0, right: 0, borderTop: '1px dashed #f1f4f5' }} />
              ))}
              {dayEvs.map(({ event, schedule }) => (
                <EventBlock
                  key={event.id}
                  ev={event}
                  schedule={schedule}
                  onClick={() => onEventClick(event, schedule)}
                  onUpdateTime={(ns, ne) => onEventTimeChange(schedule.id, event.id, ns, ne)}
                  readOnly={schedule.published}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventBlock({ ev, schedule, onClick, onUpdateTime, readOnly }) {
  const [drag, setDrag] = useState(null); // { mode: 'move'|'resize', startY, origStart, origEnd, deltaMin }
  const movedRef = useRef(false);
  const meta = EVENT_TYPES[ev.type] || EVENT_TYPES.CLASSROOM_LECTURE;
  const dayMinStart = DAY_START_HOUR * 60;
  const dayMinEnd   = (DAY_END_HOUR + 1) * 60;

  // Compute the effective start/end for rendering: live during drag, persisted otherwise.
  let start = ev.start, end = ev.end;
  if (drag) {
    if (drag.mode === 'move') {
      const dur = drag.origEnd - drag.origStart;
      let s = drag.origStart + drag.deltaMin;
      s = Math.max(dayMinStart, Math.min(s, dayMinEnd - dur));
      start = s; end = s + dur;
    } else { // resize
      let e = drag.origEnd + drag.deltaMin;
      e = Math.max(drag.origStart + SLOT_MIN, Math.min(e, dayMinEnd));
      start = drag.origStart; end = e;
    }
  }

  const top = (start - dayMinStart) * MIN_PX;
  const height = Math.max(20, (end - start) * MIN_PX - 2);
  const compact = height < 38;
  const detailParts = eventDetailParts(ev);
  const detailText = eventDetailText(ev);

  function startDrag(mode, e) {
    if (readOnly) return;
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();

    movedRef.current = false;
    const startY = e.clientY;
    setDrag({ mode, startY, origStart: ev.start, origEnd: ev.end, deltaMin: 0 });

    function onMove(ev2) {
      const dy = ev2.clientY - startY;
      const deltaMin = Math.round(dy / MIN_PX / SLOT_MIN) * SLOT_MIN;
      if (deltaMin !== 0) movedRef.current = true;
      setDrag((d) => d ? { ...d, deltaMin } : d);
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setDrag((d) => {
        if (d && movedRef.current) {
          let ns, ne;
          if (d.mode === 'move') {
            const dur = d.origEnd - d.origStart;
            let s = d.origStart + d.deltaMin;
            s = Math.max(dayMinStart, Math.min(s, dayMinEnd - dur));
            ns = s; ne = s + dur;
          } else {
            let e2 = d.origEnd + d.deltaMin;
            e2 = Math.max(d.origStart + SLOT_MIN, Math.min(e2, dayMinEnd));
            ns = d.origStart; ne = e2;
          }
          onUpdateTime(ns, ne);
        }
        return null;
      });
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function handleClick(e) {
    if (movedRef.current) {
      e.stopPropagation();
      movedRef.current = false;
      return;
    }
    e.stopPropagation();
    onClick();
  }

  return (
    <div
      onMouseDown={(e) => startDrag('move', e)}
      onClick={handleClick}
      title={`${schedule.name} · ${ev.title}${detailText ? ` · ${detailText}` : ''}${readOnly ? '' : ' (drag to move, drag bottom edge to resize)'}`}
      style={{
        position: 'absolute', top, left: 4, right: 4, height,
        background: meta.soft, border: `1px solid ${meta.color}33`,
        borderLeft: `3px solid ${meta.color}`, borderRadius: 6,
        padding: compact ? '2px 6px' : '4px 8px',
        textAlign: 'left', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', gap: 2,
        userSelect: 'none',
        cursor: readOnly ? 'pointer' : (drag?.mode === 'move' ? 'grabbing' : 'grab'),
        boxShadow: drag ? '0 8px 22px rgba(0,0,0,0.18)' : 'none',
        zIndex: drag ? 20 : 1,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 12, color: meta.color, lineHeight: 1.2, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
        <i className={`ti ${meta.icon}`} style={{ marginRight: 4 }} />{ev.title}
      </div>
      {!compact && (
        <div style={{ fontSize: 11, color: 'var(--ink)', lineHeight: 1.2, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
          {minutesToLabel(start)} – {minutesToLabel(end)}
          {end > start && <span style={{ color: 'var(--muted)' }}> ({fmtCompactDuration(end - start)})</span>}
        </div>
      )}
      {!compact && detailParts.length > 0 && (
        <div style={{ fontSize: 10.5, color: meta.color, opacity: 0.85, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
          {detailParts.map((p, i) => (
            <span key={i}>
              {i > 0 && <span style={{ margin: '0 4px', opacity: 0.5 }}>·</span>}
              {p.icon && <i className={`ti ${p.icon}`} style={{ marginRight: 3 }} />}
              {p.text}
            </span>
          ))}
        </div>
      )}
      {ONLINE_EVENT_TYPES.has(ev.type) && (
        <i
          className="ti ti-desktop"
          title="Online Event"
          style={{
            position: 'absolute', top: 4, right: 5,
            fontSize: 12, color: '#444', lineHeight: 1,
            pointerEvents: 'auto',
          }}
        />
      )}
      {!readOnly && (
        <div
          onMouseDown={(e) => startDrag('resize', e)}
          title="Drag to change end time"
          style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: 8,
            cursor: 'ns-resize',
            display: 'flex', justifyContent: 'center', alignItems: 'flex-end',
          }}
        >
          <div style={{
            width: 28, height: 3, borderRadius: 2,
            background: `${meta.color}55`, marginBottom: 2,
          }} />
        </div>
      )}
    </div>
  );
}

// Compact, type-specific detail parts shown on the event card.
// Returns an array of `{ icon?, text }` so each part can render its glyph.
function eventDetailParts(ev) {
  switch (ev.type) {
    case 'CLASSROOM_LECTURE': {
      const out = [];
      if (ev.venue)      out.push({ icon: 'ti-location-pin', text: ev.venue });
      if (ev.instructor) out.push({ text: ev.instructor });
      return out;
    }
    case 'OFFLINE_EXAM':
    case 'DISCUSSION':
      return ev.venue ? [{ icon: 'ti-location-pin', text: ev.venue }] : [];
    case 'LIVE_STREAM':
      return ev.instructor ? [{ icon: 'ti-user', text: ev.instructor }] : [];
    case 'ONLINE_EXAM': {
      const ref = findExamRef(ev.examId);
      return ref ? [{ text: `${ref.seriesName} · ${ref.examName}` }] : [];
    }
    case 'ONLINE_QUIZ': {
      const ref = findQuizRef(ev.quizId);
      return ref ? [{ text: ref.quizName }] : [];
    }
    case 'RECORDED_LECTURE': {
      const ref = findChapterRef(ev.courseId, ev.moduleId, ev.chapterId);
      return ref ? [{ text: `${ref.moduleName} → ${ref.chapterName}` }] : [];
    }
    default: return [];
  }
}
function eventDetailText(ev) {
  return eventDetailParts(ev).map((p) => p.text).join(' · ');
}

function DaySchedulesPopover({ dateKey: dk, anchorRect, schedules, onClose, onPick, onViewDay, mode = 'focus', currentId = null }) {
  const ref = useRef(null);
  useEffect(() => {
    function onDown(e) { if (ref.current && !ref.current.contains(e.target)) onClose(); }
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [onClose]);
  const top = (anchorRect?.bottom || 100) + 6;
  const left = Math.min((anchorRect?.left || 100), window.innerWidth - 360);
  return (
    <div ref={ref} style={{ position: 'fixed', top, left, width: 340, background: '#fff', border: '1px solid var(--line)', borderRadius: 12, boxShadow: '0 14px 38px rgba(0,0,0,0.12)', zIndex: 900, overflow: 'hidden' }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line)', background: '#fbfcfd', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontWeight: 700, color: 'var(--ink)', fontSize: 14 }}>Schedules on {prettyDate(dk)}</div>
        <button type="button" onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><i className="ti ti-close" /></button>
      </div>
      <div style={{ maxHeight: 360, overflow: 'auto', padding: 8 }}>
        {schedules.map((s) => {
          const isCurrent = mode === 'select' && s.id === currentId;
          return (
          <button key={s.id} type="button" onClick={() => onPick(s)}
            style={{
              width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 8,
              border: `1px solid ${isCurrent ? 'var(--brand)' : 'var(--line)'}`,
              background: isCurrent ? '#eaf3f5' : '#fff',
              cursor: 'pointer', marginBottom: 6, display: 'block',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ fontWeight: 700, color: 'var(--ink)', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.name}
              </div>
              {s.published
                ? <span style={{ background: '#d1fae5', color: '#047857', borderRadius: 999, padding: '2px 8px', fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}><i className="ti ti-check" /> PUBLISHED</span>
                : <span style={{ background: '#eef0f2', color: 'var(--muted)', borderRadius: 999, padding: '2px 8px', fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}><i className="ti ti-time" /> DRAFT</span>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
              {s.batches.length === 0 ? <em>No batches linked</em> : `(${s.batches.map((b) => b.name).join(", ")})`}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{s.events.length} event{s.events.length === 1 ? '' : 's'}</div>
          </button>
          );
        })}
      </div>
      {schedules.length > 1 && onViewDay && (
        <div style={{ padding: '0 8px 8px' }}>
          <button
            type="button"
            onClick={() => { onViewDay(dk); onClose(); }}
            style={{
              width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              background: 'transparent', color: 'var(--brand)',
              border: '1px solid var(--brand)',
              padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
              fontWeight: 600, fontSize: 13,
            }}
          >
            Open all {schedules.length} side-by-side <i className="ti ti-angle-double-right" />
          </button>
        </div>
      )}
    </div>
  );
}

function ScheduleModal({ state, allSchedules, onClose, onCreate, onUpdate, onDelete }) {
  const editing = state.mode === 'edit';
  const s = state.schedule;
  const published = !!s?.published;
  const [name, setName] = useState(s?.name || '');
  const [date, setDate] = useState(s?.date || state.defaultDate);
  // batchIds: string[] of selected batch IDs.
  const [batchIds, setBatchIds] = useState(() => (s?.batches || []).map((b) => String(b.id)));
  const [copyFromId, setCopyFromId] = useState('');
  const [pendingCopy, setPendingCopy] = useState(null);

  function toggle(bId) {
    const k = String(bId);
    setBatchIds((cur) => cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]);
  }

  // Open the native date picker on click/keydown so the whole field is the target.
  function openDatePicker(e) {
    if (published) return;
    const el = e.currentTarget;
    if (typeof el.showPicker === 'function') {
      try { el.showPicker(); } catch { /* showPicker not allowed in this context */ }
    }
  }

  // Candidates to copy from: every other non-empty schedule (newest first).
  const copyCandidates = useMemo(() => {
    return allSchedules
      .filter((x) => x.id !== s?.id && x.events.length > 0)
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [allSchedules, s]);

  const source = useMemo(() => allSchedules.find((x) => x.id === copyFromId) || null, [allSchedules, copyFromId]);
  const sourceBound = useMemo(
    () => source ? source.events.filter((e) => CONTENT_BOUND_TYPES.has(e.type)) : [],
    [source]
  );

  function buildPayload(confirmContentDuplication = false) {
    return editing
      ? { id: s.id, name, date, batch_ids: batchIds, copyFromId: published ? '' : copyFromId, confirmContentDuplication }
      : { name, date, batch_ids: batchIds, copyFromId, confirmContentDuplication };
  }

  function submit(e) {
    e.preventDefault();
    const payload = buildPayload(false);
    if (payload.copyFromId && sourceBound.length > 0) {
      setPendingCopy(payload);
      return;
    }
    if (editing) onUpdate(payload);
    else onCreate(payload);
  }

  // ─── Stage 2: content-duplication confirmation ──
  if (pendingCopy) {
    return (
      <Modal
        onClose={() => setPendingCopy(null)}
        title="Copy shared content?"
        icon="ti-alert"
        maxWidth={520}
        footerClassName="form-modal"
        footer={
          <>
            <button type="button" className="legacy-btn legacy-btn-default" onClick={() => setPendingCopy(null)}>Back</button>
            <button type="button" className="legacy-btn legacy-btn-success" onClick={() => {
              const confirmed = { ...pendingCopy, confirmContentDuplication: true };
              editing ? onUpdate(confirmed) : onCreate(confirmed);
            }}>
              <i className="ti ti-files" /> Yes, copy anyway
            </button>
          </>
        }
      >
        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: 14, marginBottom: 14, display: 'flex', gap: 12 }}>
          <i className="ti ti-alert" style={{ color: '#c2410c', fontSize: 22, lineHeight: 1, marginTop: 2 }} />
          <div style={{ color: '#7c2d12', fontSize: 13, lineHeight: 1.5 }}>
            You're copying events from <strong>{source.name}</strong> ({source.date}). Some of them reference shared content — the new schedule will point to the <strong>same exam/quiz/recording</strong>, so students would see identical material.
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600, marginBottom: 6 }}>
          Shared-content events
        </div>
        <ul style={{ margin: 0, padding: '0 0 0 18px', color: 'var(--ink)', fontSize: 13 }}>
          {sourceBound.map((e) => {
            const meta = EVENT_TYPES[e.type];
            const ref = describeBoundContent({ type: e.type, examId: e.examId, quizId: e.quizId, courseId: e.courseId, moduleId: e.moduleId, chapterId: e.chapterId });
            return (
              <li key={e.id} style={{ padding: '4px 0' }}>
                <span style={{ color: meta.color, fontWeight: 700 }}><i className={`ti ${meta.icon}`} style={{ marginRight: 4 }} />{meta.label}</span>
                {' — '}{e.title}
                {ref && <span style={{ color: 'var(--muted)' }}> · {ref}</span>}
              </li>
            );
          })}
        </ul>
        <p style={{ margin: '14px 0 0', color: 'var(--muted)', fontSize: 13 }}>
          If each schedule should have different content, copy without these events (cancel and rebuild manually) or replace them after copying.
        </p>
      </Modal>
    );
  }

  const footer = (
    <>
      <div style={{ marginRight: 'auto' }}>
        {editing && !published && (
          <button type="button" className="legacy-btn legacy-btn-danger" onClick={() => onDelete(s.id)}>
            <i className="ti ti-trash" /> Delete
          </button>
        )}
      </div>
      <button type="button" className="legacy-btn legacy-btn-default" onClick={onClose}>
        {published ? 'Close' : 'Cancel'}
      </button>
      {!published && (
        <button type="submit" form="schedule-meta-form" className="legacy-btn legacy-btn-success">
          <i className={`ti ${editing ? 'ti-check' : 'ti-plus'}`} /> {editing ? 'Save changes' : 'Create schedule'}
        </button>
      )}
    </>
  );

  return (
    <Modal
      onClose={onClose}
      title={editing ? 'Edit schedule' : 'New schedule'}
      icon={editing ? 'ti-calendar' : 'ti-calendar-plus'}
      maxWidth={560}
      footer={footer}
      footerClassName="form-modal"
    >
      {published && (
        <div style={{
          margin: '-24px -24px 20px',
          background: '#d1fae5',
          borderBottom: '1px solid #86efac',
          color: '#065f46',
          padding: '10px 24px',
          fontSize: 13, fontWeight: 600,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <i className="ti ti-check" /> This schedule is already Published, un-publish first to modify
        </div>
      )}
      <form id="schedule-meta-form" className="form-modal" onSubmit={submit}>
        <div className="asset-form-section">
          <div className="asset-form-section-title"><i className="ti ti-info-circle" /> Basic Details</div>
          <div className="asset-form-grid basic-grid">
            <label className="field-cell">
              <div className="float-field">
                <input
                  type="text" className="float-control" placeholder=" "
                  autoFocus={!published} value={name} disabled={published}
                  onChange={(e) => setName(e.target.value)}
                />
                <span className="float-label">Schedule name <span className="req">*</span></span>
              </div>
            </label>
            <label className="field-cell">
              <div className="float-field float-always date-custom">
                <input
                  type="date" className="float-control"
                  value={date} disabled={published}
                  onChange={(e) => setDate(e.target.value)}
                  onClick={openDatePicker} onKeyDown={openDatePicker}
                />
                <span className="float-label">Date <span className="req">*</span></span>
                <span className={`date-display ${!date ? 'is-empty' : ''}`}>
                  {date ? prettyDate(date) : 'Set a Date'}
                </span>
              </div>
            </label>
          </div>
        </div>

        <div className="asset-form-section">
          <div className="asset-form-section-title"><i className="ti ti-users" /> Linked Batches</div>
          <BatchPicker
            batchIds={batchIds}
            onToggle={toggle}
            disabled={published}
            label={null}
            allSchedules={allSchedules} excludeId={s?.id || null} date={date}
            helperText={published ? 'Read-only — schedule is published.' : 'Each batch may belong to only one schedule on a given date.'}
          />
        </div>

        {!published && (
          <div className="asset-form-section">
            <div className="asset-form-section-title">
              <i className="ti ti-files" /> Copy Events From
              <span style={{ textTransform: 'none', letterSpacing: 0, color: '#94a3b8', fontWeight: 500 }}>(optional)</span>
            </div>
            <div className="asset-form-grid">
              <label className="field-cell full-span">
                <div className="float-field float-always">
                  <select className="float-control" value={copyFromId} onChange={(e) => setCopyFromId(e.target.value)}>
                    <option value="">— Don't copy —</option>
                    {copyCandidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} · {c.date} · {c.events.length} event{c.events.length === 1 ? '' : 's'}
                        {c.batches.length ? ` · ${c.batches.map((b) => b.name).join(', ')}` : ''}
                      </option>
                    ))}
                  </select>
                  <span className="float-label">Source schedule</span>
                </div>
                {source && (
                  <span className="field-hint">
                    Will append {source.events.length} event{source.events.length === 1 ? '' : 's'} to this schedule.
                  </span>
                )}
              </label>
            </div>
            {source && sourceBound.length > 0 && (
              <div style={{ marginTop: 10, color: '#7c2d12', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                <i className="ti ti-alert" /> {sourceBound.length} event(s) reference shared content (exam/quiz/recording) — you'll be asked to confirm before copying.
              </div>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
}

// Reusable batch checklist that highlights conflicts on the chosen date.
// Instagram-style "verified" badge — a scalloped 8-burst circle with a
// white check mark inside. Used as an at-a-glance indicator that every
// schedule on a day has been published.
function VerifiedBadge({ size = 16, fill = '#10b981' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      style={{ display: 'block', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.15))' }}
    >
      <path
        fill={fill}
        d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34z"
      />
      <path
        fill="#fff"
        d="M10.54 16.5l-3.54-3.54 1.41-1.41 2.13 2.12 5.07-5.06 1.41 1.42z"
      />
    </svg>
  );
}

// Click-target on the schedule name in week / work-week column headers.
// Opens a small dropdown with "Edit Details" / "Duplicate Schedule".
function ScheduleNameMenu({ schedule, onEdit, onDuplicate, onPublish, onDelete }) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      const t = e.target;
      if (btnRef.current && btnRef.current.contains(t)) return;
      if (menuRef.current && menuRef.current.contains(t)) return;
      setOpen(false);
    }
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    function reanchor() { if (btnRef.current) setRect(btnRef.current.getBoundingClientRect()); }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', reanchor, true);
    window.addEventListener('resize', reanchor);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', reanchor, true);
      window.removeEventListener('resize', reanchor);
    };
  }, [open]);

  function toggle(e) {
    e.stopPropagation();
    if (btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    setOpen((v) => !v);
  }
  function pick(fn) {
    setOpen(false);
    fn && fn();
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        title={schedule.name}
        style={{
          background: 'transparent', border: 'none', padding: 0,
          color: 'inherit', font: 'inherit', cursor: 'pointer',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          flex: '0 1 auto', textAlign: 'left',
          textDecorationLine: 'underline', textDecorationStyle: 'dashed',
          textUnderlineOffset: 2, textDecorationColor: 'var(--line)',
        }}
      >
        {schedule.name}
      </button>
      {open && rect && (
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: rect.bottom + 4,
            left: rect.left,
            minWidth: 180,
            background: '#fff', border: '1px solid var(--line)', borderRadius: 8,
            boxShadow: '0 14px 38px rgba(0,0,0,0.12)', zIndex: 1100,
            overflow: 'hidden',
          }}
        >
          <MenuItem
            icon="ti-pencil"
            iconColor="var(--brand)"
            label="Edit Details"
            disabled={schedule.published}
            disabledHint="Unpublish first to edit details"
            onPick={() => pick(onEdit)}
          />
          <MenuItem
            icon="ti-files"
            iconColor="var(--brand)"
            label="Duplicate Schedule"
            onPick={() => pick(onDuplicate)}
            border
          />
          <MenuItem
            icon={schedule.published ? 'ti-pencil-alt' : 'ti-check'}
            iconColor={schedule.published ? 'var(--muted)' : '#047857'}
            label={schedule.published ? 'Unpublish' : 'Publish'}
            onPick={() => pick(onPublish)}
            border
          />
          <MenuItem
            icon="ti-trash"
            iconColor="var(--danger)"
            label="Delete"
            disabled={schedule.published}
            disabledHint="Unpublish first to delete"
            danger
            onPick={() => pick(onDelete)}
            border
          />
        </div>
      )}
    </>
  );
}
function MenuItem({ icon, iconColor, label, onPick, disabled, danger, border, disabledHint }) {
  return (
    <button
      type="button"
      onClick={() => { if (!disabled) onPick && onPick(); }}
      disabled={disabled}
      title={disabled ? disabledHint : undefined}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        background: '#fff', border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        padding: '8px 12px', fontSize: 13, fontWeight: 600,
        color: disabled ? '#c2cfd2' : (danger ? 'var(--danger)' : 'var(--ink)'),
        borderTop: border ? '1px solid var(--line)' : 'none',
        opacity: disabled ? 0.65 : 1,
      }}
    >
      <i className={`ti ${icon}`} style={{ marginRight: 8, color: disabled ? '#c2cfd2' : iconColor }} />
      {label}
    </button>
  );
}

// Small grey "+" ring used in empty date-column headers. Lives inside the
// header <button>, so it's a <span role="button"> to keep markup valid.
function NewScheduleCircle({ onClick }) {
  const [hover, setHover] = useState(false);
  const base = hover
    ? { border: '#6b7280', color: '#374151' }
    : { border: '#d1d5db', color: '#9ca3af' };
  return (
    <span
      role="button"
      tabIndex={0}
      title="Create a schedule for this day"
      onClick={(e) => { e.stopPropagation(); onClick && onClick(); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault(); e.stopPropagation();
          onClick && onClick();
        }
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 14, height: 14, borderRadius: 999,
        background: 'transparent', color: base.color,
        border: `1px solid ${base.border}`,
        cursor: 'pointer', fontSize: 8, lineHeight: 1, fontStyle: 'normal',
        transition: 'border-color 120ms, color 120ms',
      }}
    >
      <i className="ti ti-plus" />
    </span>
  );
}

// Venue picker — typeahead-style. Loads the venue list once from
// /admin/venue/list (no search param on that endpoint) and filters
// client-side as the user types. Stores the venue *name* on the event.
function VenueSelect({ value, onChange, type = 1 }) {
  const [query, setQuery] = useState(value || '');
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [rect, setRect] = useState(null);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const dropRef = useRef(null);

  useEffect(() => { setQuery(value || ''); }, [value]);

  // Load once on mount.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listVenues({ type, sortBy: 'capacity', sortOrder: 'DESC' })
      .then(({ items }) => { if (!cancelled) setItems(items); })
      .catch(() => { if (!cancelled) setItems([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [type]);

  useEffect(() => {
    function onDown(e) {
      const t = e.target;
      if (wrapRef.current && wrapRef.current.contains(t)) return;
      if (dropRef.current && dropRef.current.contains(t)) return;
      setOpen(false);
    }
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, []);

  useEffect(() => {
    if (!open) return;
    function update() { if (inputRef.current) setRect(inputRef.current.getBoundingClientRect()); }
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 50);
    return items.filter((v) => (v.name || '').toLowerCase().includes(q)).slice(0, 50);
  }, [items, query]);

  function pick(item) {
    onChange(item.name);
    setQuery(item.name);
    setOpen(false);
  }
  function clear() {
    onChange('');
    setQuery('');
    setOpen(true);
    inputRef.current?.focus();
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder="Search venue…"
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          style={{ ...inputStyle, paddingRight: 30 }}
        />
        {query
          ? (
            <button
              type="button" onClick={clear} tabIndex={-1}
              title="Clear"
              style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}
            ><i className="ti ti-close" /></button>
          )
          : (
            <i className="ti ti-search" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: 12 }} />
          )
        }
      </div>
      {open && rect && (
        <div ref={dropRef} style={{
          position: 'fixed',
          top: rect.bottom + 4,
          left: rect.left,
          width: rect.width,
          background: '#fff', border: '1px solid var(--line)', borderRadius: 8,
          boxShadow: '0 14px 38px rgba(0,0,0,0.12)', zIndex: 1200,
          maxHeight: Math.max(180, window.innerHeight - rect.bottom - 16),
          overflow: 'auto',
        }}>
          {loading && (
            <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--muted)' }}>
              <i className="ti ti-reload" style={{ marginRight: 6 }} />Loading venues…
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--muted)' }}>
              No matches{query ? ` for "${query}"` : ''}
            </div>
          )}
          {!loading && filtered.map((item) => (
            <button
              key={item.id || item.name}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pick(item); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', background: '#fff', border: 'none', cursor: 'pointer', padding: '8px 12px', borderTop: '1px solid #f3f5f6' }}
            >
              <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 13 }}>{item.name}</div>
              {item.capacity != null && (
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <i className="ti ti-user" />{item.capacity} capacity
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Async typeahead for picking an instructor (also used for Live Stream host).
// Stores the instructor's *name* on the event (matches the FE contract where
// `event.instructor` is a string). Uses position: fixed for the dropdown
// because the host modal has `overflow: hidden`, which would otherwise clip it.
function InstructorPicker({ value, onChange, placeholder = 'Search instructor…', filterBy = '' }) {
  const [query, setQuery] = useState(value || '');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [rect, setRect] = useState(null);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const dropRef = useRef(null);

  // Reflect external value changes (e.g. switching events).
  useEffect(() => { setQuery(value || ''); }, [value]);

  // Debounced search whenever the panel is open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const { items } = await searchInstructors({
          page: 1, size: 10, sortBy: 'name',
          searchKey: query.trim(), filterBy,
        });
        if (!cancelled) setResults(items);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, open, filterBy]);

  // Outside-click + escape.
  useEffect(() => {
    function onDown(e) {
      const t = e.target;
      if (wrapRef.current && wrapRef.current.contains(t)) return;
      if (dropRef.current && dropRef.current.contains(t)) return;
      setOpen(false);
    }
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, []);

  // Re-anchor on scroll / resize so position: fixed stays glued.
  useEffect(() => {
    if (!open) return;
    function update() { if (inputRef.current) setRect(inputRef.current.getBoundingClientRect()); }
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  function pick(item) {
    onChange(item.name);
    setQuery(item.name);
    setOpen(false);
  }
  function clear() {
    onChange('');
    setQuery('');
    setResults([]);
    setOpen(true);
    inputRef.current?.focus();
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder={placeholder}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          style={{ ...inputStyle, paddingRight: 30 }}
        />
        {query
          ? (
            <button
              type="button" onClick={clear} tabIndex={-1}
              title="Clear"
              style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}
            ><i className="ti ti-close" /></button>
          )
          : (
            <i className="ti ti-search" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: 12 }} />
          )
        }
      </div>
      {open && rect && (
        <div ref={dropRef} style={{
          position: 'fixed',
          top: rect.bottom + 4,
          left: rect.left,
          width: rect.width,
          background: '#fff', border: '1px solid var(--line)', borderRadius: 8,
          boxShadow: '0 14px 38px rgba(0,0,0,0.12)', zIndex: 1200,
          maxHeight: Math.max(180, window.innerHeight - rect.bottom - 16),
          overflow: 'auto',
        }}>
          {loading && (
            <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--muted)' }}>
              <i className="ti ti-reload" style={{ marginRight: 6 }} />Searching…
            </div>
          )}
          {!loading && results.length === 0 && (
            <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--muted)' }}>
              No matches{query ? ` for "${query}"` : ''}
            </div>
          )}
          {!loading && results.map((item) => {
            const mobile = item.mobile || item.phone || item.mobileNumber || item.phone_number || item.contactNumber || '';
            return (
              <button
                key={item.id || item.name}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pick(item); }}
                style={{ display: 'block', width: '100%', textAlign: 'left', background: '#fff', border: 'none', cursor: 'pointer', padding: '8px 12px', borderTop: '1px solid #f3f5f6' }}
              >
                <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 13 }}>{item.name}</div>
                {mobile && (
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <i className="ti ti-mobile" />{mobile}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// `batchIds`: string[] of currently-selected batch IDs.
// `onToggle(id)`: callback when a batch is toggled.
function BatchPicker({ batchIds, onToggle, allSchedules, excludeId, date, helperText, label = 'Linked batches', disabled = false }) {
  const lookups = useLookups();
  const pool = lookups.batches || [];
  function conflictFor(bId) {
    return (allSchedules || []).find((s) => s.id !== excludeId && s.date === date
      && (s.batches || []).some((bb) => String(bb.id) === String(bId))) || null;
  }
  return (
    <div>
      {label && (
        <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600, marginBottom: 6 }}>
          {label}
        </div>
      )}
      {helperText && (
        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>{helperText}</div>
      )}
      <div style={{ display: 'grid', gap: 6, maxHeight: 240, overflow: 'auto' }}>
        {pool.map((b) => {
          const sel = (batchIds || []).some((x) => String(x) === String(b.id));
          const conflict = conflictFor(b.id);
          const blocked = !!conflict && !sel;
          const inputDisabled = blocked || disabled;
          return (
            <label key={b.id} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '8px 12px', borderRadius: 8,
              cursor: inputDisabled ? 'not-allowed' : 'pointer',
              border: `1px solid ${sel ? 'var(--brand)' : 'var(--line)'}`,
              background: sel ? '#eaf3f5' : '#fff',
              opacity: inputDisabled ? 0.6 : 1,
            }}>
              <input type="checkbox" checked={sel} disabled={inputDisabled} onChange={() => onToggle(b.id)} style={{ marginTop: 2 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{b.name}</div>
                {conflict && (
                  <div style={{ fontSize: 11, color: blocked ? 'var(--danger)' : 'var(--muted)', marginTop: 2 }}>
                    {sel
                      ? <>Currently linked to this schedule.</>
                      : <>Already in {conflict.published ? 'published' : 'draft'} "{conflict.name}" on this date.</>
                    }
                  </div>
                )}
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function EventModal({ state, scheduleDate, onClose, onSave, onDelete }) {
  const editing = state.mode === 'edit';
  const ev = state.event;
  const [title, setTitle] = useState(ev?.title || '');
  const [type, setType] = useState(ev?.type || 'CLASSROOM_LECTURE');

  // Type-specific fields
  const [instructor, setInstructor] = useState(ev?.instructor || '');
  const [venue, setVenue] = useState(ev?.venue || '');
  const [examId, setExamId] = useState(ev?.examId || '');
  const [quizId, setQuizId] = useState(ev?.quizId || '');
  const [courseId, setCourseId] = useState(ev?.courseId || '');
  const [moduleId, setModuleId] = useState(ev?.moduleId || '');
  const [chapterId, setChapterId] = useState(ev?.chapterId || '');

  const [dateInput, setDateInput] = useState(scheduleDate || '');
  const [startInput, setStartInput] = useState(minutesToInput(ev?.start ?? state.defaultStart));
  const [endInput, setEndInput] = useState(minutesToInput(ev?.end ?? ((state.defaultStart ?? 9 * 60) + 55)));

  const [recurEnabled, setRecurEnabled] = useState(false);
  const [recurDays, setRecurDays] = useState([true, true, true, true, true, false, false]);
  const [recurUntil, setRecurUntil] = useState(() => dateKey(addDays(parseKey(scheduleDate), 14)));

  const [formError, setFormError] = useState('');
  const [pendingRecur, setPendingRecur] = useState(null);

  function validate() {
    if (!title.trim()) return 'Please enter a title.';
    if (inputToMinutes(endInput) <= inputToMinutes(startInput)) return 'End time must be after start.';
    switch (type) {
      case 'CLASSROOM_LECTURE':
        if (!instructor) return 'Pick an instructor for the classroom lecture.';
        if (!venue) return 'Pick a venue for the classroom lecture.';
        break;
      case 'ONLINE_EXAM':
        if (!examId) return 'Pick an exam from a test series.';
        break;
      case 'OFFLINE_EXAM':
        if (!venue) return 'Pick a venue for the offline exam.';
        break;
      case 'ONLINE_QUIZ':
        if (!quizId) return 'Pick a quiz.';
        break;
      case 'DISCUSSION':
        if (!venue) return 'Pick a venue for the discussion.';
        break;
      case 'LIVE_STREAM':
        if (!instructor) return 'Pick a host for the live stream.';
        break;
      case 'RECORDED_LECTURE':
        if (!courseId || !moduleId || !chapterId) return 'Pick a course, module and chapter.';
        break;
      default: break;
    }
    return '';
  }

  function buildPayload() {
    return {
      id: ev?.id, title, type,
      instructor, venue, examId, quizId, courseId, moduleId, chapterId,
      start: clampMin(inputToMinutes(startInput)),
      end:   clampMin(inputToMinutes(endInput)),
      recurrence: editing ? null : { enabled: recurEnabled, days: recurDays, until: recurUntil },
    };
  }

  function submit(e) {
    e.preventDefault();
    const err = validate();
    if (err) { setFormError(err); return; }
    setFormError('');
    const payload = buildPayload();
    if (!editing && recurEnabled && CONTENT_BOUND_TYPES.has(type)) {
      setPendingRecur(payload);
      return;
    }
    onSave(payload);
  }

  // ─── Stage 2: content-duplication confirmation ──
  if (pendingRecur) {
    const meta = EVENT_TYPES[type];
    const ref = describeBoundContent(pendingRecur);
    return (
      <Modal onClose={() => setPendingRecur(null)} title="Repeat shared content?" maxWidth={500}>
        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: 14, marginBottom: 14, display: 'flex', gap: 12 }}>
          <i className="ti ti-alert" style={{ color: '#c2410c', fontSize: 22, lineHeight: 1, marginTop: 2 }} />
          <div style={{ color: '#7c2d12', fontSize: 13, lineHeight: 1.5 }}>
            You're about to repeat a <strong>{meta.label}</strong> across multiple days. The same content reference will be linked on every occurrence — students would see <strong>identical material</strong> on each day.
          </div>
        </div>
        <div style={{ display: 'grid', gap: 8, marginBottom: 14, fontSize: 13, color: 'var(--ink)' }}>
          <div><strong>Linked content:</strong> {ref || <em style={{ color: 'var(--muted)' }}>(none)</em>}</div>
          <div><strong>Repeats on:</strong> {pendingRecur.recurrence.days.map((v, i) => v ? WEEKDAY_INIT[i] : null).filter(Boolean).join(', ') || 'no day selected'}</div>
          <div><strong>Until:</strong> {pendingRecur.recurrence.until}</div>
        </div>
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>
          If each day actually needs a different {meta.label.toLowerCase()}, create them separately instead.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" onClick={() => setPendingRecur(null)} style={btnGhost}>Back to event</button>
          <button type="button" onClick={() => onSave(pendingRecur)} style={btnPrimary}><i className="ti ti-repeat" /> Yes, repeat anyway</button>
        </div>
      </Modal>
    );
  }

  const startMins = clampMin(inputToMinutes(startInput));
  const endMins = clampMin(inputToMinutes(endInput));
  let dateObj = null;
  try { dateObj = dateInput ? parseKey(dateInput) : (scheduleDate ? parseKey(scheduleDate) : null); } catch { dateObj = null; }
  const dayLabel = dateObj ? `${dateObj.getDate()} ${MONTH_NAMES[dateObj.getMonth()].slice(0, 3)}` : '';
  const timeLabel = endMins > startMins
    ? `${minutesToLabel(startMins).toLowerCase()} – ${minutesToLabel(endMins).toLowerCase()}`
    : minutesToLabel(startMins).toLowerCase();
  const modalTitle = `${editing ? 'Edit Event' : 'New Event'} — ${timeLabel}${dayLabel ? `, ${dayLabel}` : ''}`;

  return (
    <Modal onClose={onClose} title={modalTitle} maxWidth={580}>
      <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        <Field label="Title">
          <input type="text" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Maths Lecture" style={inputStyle} />
        </Field>
        <Field label="Event type">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {Object.values(EVENT_TYPES).map((t) => {
              const sel = type === t.id;
              return (
                <button key={t.id} type="button" onClick={() => setType(t.id)}
                  style={{ border: `1px solid ${sel ? t.color : 'var(--line)'}`, background: sel ? t.soft : '#fff', color: sel ? t.color : 'var(--ink)', borderRadius: 8, padding: '8px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className={`ti ${t.icon}`} />{t.label}
                </button>
              );
            })}
          </div>
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 10 }}>
          <Field label="Date"><input type="date" value={dateInput} onChange={(e) => setDateInput(e.target.value)} style={inputStyle} /></Field>
          <Field label="Start"><input type="time" step={SLOT_MIN * 60} value={startInput} onChange={(e) => setStartInput(e.target.value)} style={inputStyle} /></Field>
          <Field label="End"><input type="time" step={SLOT_MIN * 60} value={endInput} onChange={(e) => setEndInput(e.target.value)} style={inputStyle} /></Field>
        </div>

        <TypeSpecificFields
          type={type}
          state={{ instructor, venue, examId, quizId, courseId, moduleId, chapterId }}
          setState={{ setInstructor, setVenue, setExamId, setQuizId, setCourseId, setModuleId, setChapterId }}
        />

        {!editing && (
          <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12, background: '#fbfcfd' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600, color: 'var(--ink)' }}>
              <input type="checkbox" checked={recurEnabled} onChange={(e) => setRecurEnabled(e.target.checked)} /> Repeat this event
            </label>
            {recurEnabled && CONTENT_BOUND_TYPES.has(type) && (
              <div style={{ marginTop: 8, padding: '8px 10px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, color: '#7c2d12', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="ti ti-alert" /> Repeating a {EVENT_TYPES[type].label} reuses the same content on each day — you'll be asked to confirm.
              </div>
            )}
            {recurEnabled && (
              <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>On these days</div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {WEEKDAY_INIT.map((d, i) => (
                      <button key={i} type="button" onClick={() => setRecurDays(recurDays.map((v, j) => j === i ? !v : v))}
                        style={{ width: 32, height: 32, borderRadius: 999, border: '1px solid var(--line)', background: recurDays[i] ? 'var(--brand)' : '#fff', color: recurDays[i] ? '#fff' : 'var(--ink)', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>{d}</button>
                    ))}
                  </div>
                </div>
                <Field label="Until (max 30 days from start)">
                  <input type="date" value={recurUntil} min={scheduleDate} max={dateKey(addDays(parseKey(scheduleDate), 30))} onChange={(e) => setRecurUntil(e.target.value)} style={inputStyle} />
                </Field>
              </div>
            )}
          </div>
        )}

        {formError && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>
            <i className="ti ti-alert" style={{ marginRight: 6 }} />{formError}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
          <div>{editing && <button type="button" onClick={() => onDelete(ev.id)} style={btnDanger}><i className="ti ti-trash" /> Delete</button>}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onClose} style={btnGhost}>Cancel</button>
            <button type="submit" style={btnPrimary}>{editing ? 'Save changes' : 'Create event'}</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

// Renders the right set of inputs for each event type.
function TypeSpecificFields({ type, state, setState }) {
  const { instructor, venue, examId, quizId, courseId, moduleId, chapterId } = state;
  const { setInstructor, setVenue, setExamId, setQuizId, setCourseId, setModuleId, setChapterId } = setState;
  const lookups = useLookups();
  const instructorPool = lookups.instructors || [];
  const venuePool = lookups.venues || [];
  const testSeriesPool = lookups.test_series || [];
  const quizPool = lookups.quizzes || [];
  const coursePool = lookups.courses || [];

  if (type === 'CLASSROOM_LECTURE') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Instructor">
          <InstructorPicker value={instructor || ''} onChange={setInstructor} placeholder="Search instructor…" />
        </Field>
        <Field label="Venue">
          <VenueSelect value={venue || ''} onChange={setVenue} />
        </Field>
      </div>
    );
  }
  if (type === 'OFFLINE_EXAM' || type === 'DISCUSSION') {
    return (
      <Field label="Venue">
        <VenueSelect value={venue || ''} onChange={setVenue} />
      </Field>
    );
  }
  if (type === 'LIVE_STREAM') {
    return (
      <Field label="Host">
        <InstructorPicker value={instructor || ''} onChange={setInstructor} placeholder="Search host…" />
      </Field>
    );
  }
  if (type === 'ONLINE_EXAM') {
    return (
      <Field label="Exam (from Test Series)">
        <select value={examId || ''} onChange={(e) => setExamId(e.target.value)} style={selStyle}>
          <option value="">— Pick an exam —</option>
          {testSeriesPool.map((ts) => (
            <optgroup key={ts.id} label={ts.name}>
              {(ts.exams || []).map((ex) => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
            </optgroup>
          ))}
        </select>
      </Field>
    );
  }
  if (type === 'ONLINE_QUIZ') {
    return (
      <Field label="Quiz">
        <select value={quizId || ''} onChange={(e) => setQuizId(e.target.value)} style={selStyle}>
          <option value="">— Pick a quiz —</option>
          {quizPool.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
        </select>
      </Field>
    );
  }
  if (type === 'RECORDED_LECTURE') {
    const course = coursePool.find((c) => String(c.id) === String(courseId));
    const modules = course?.modules || [];
    const chapters = modules.find((m) => String(m.id) === String(moduleId))?.chapters || [];
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <Field label="Course">
          <select value={courseId || ''} onChange={(e) => { setCourseId(e.target.value); setModuleId(''); setChapterId(''); }} style={selStyle}>
            <option value="">— Pick course —</option>
            {coursePool.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Module">
          <select value={moduleId || ''} onChange={(e) => { setModuleId(e.target.value); setChapterId(''); }} disabled={!course} style={selStyle}>
            <option value="">{course ? '— Pick module —' : 'Pick course first'}</option>
            {modules.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Field>
        <Field label="Chapter">
          <select value={chapterId || ''} onChange={(e) => setChapterId(e.target.value)} disabled={!moduleId} style={selStyle}>
            <option value="">{moduleId ? '— Pick chapter —' : 'Pick module first'}</option>
            {chapters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      </div>
    );
  }
  return null;
}

// Returns a short description of the content this event refers to, for the
// recurrence-confirmation prompt.
function describeBoundContent(payload) {
  if (payload.type === 'ONLINE_EXAM') {
    const ref = findExamRef(payload.examId);
    return ref ? `${ref.seriesName} → ${ref.examName}` : '';
  }
  if (payload.type === 'ONLINE_QUIZ') {
    const ref = findQuizRef(payload.quizId);
    return ref ? ref.quizName : '';
  }
  if (payload.type === 'RECORDED_LECTURE') {
    const ref = findChapterRef(payload.courseId, payload.moduleId, payload.chapterId);
    return ref ? `${ref.courseName} → ${ref.moduleName} → ${ref.chapterName}` : '';
  }
  return '';
}

function PublishModal({ schedule, existingSchedules, onClose, onConfirm }) {
  // The schedule already owns some batches; publish can additionally link more.
  const existingBatchIds = useMemo(
    () => (schedule?.batches || []).map((b) => String(b.id)),
    [schedule]
  );
  const [extraIds, setExtraIds] = useState([]);
  const allBatchIds = useMemo(
    () => Array.from(new Set([...existingBatchIds, ...extraIds])),
    [existingBatchIds, extraIds]
  );
  function toggle(bId) {
    const k = String(bId);
    if (existingBatchIds.includes(k)) return; // already-linked batches are locked here
    setExtraIds((cur) => cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]);
  }
  return (
    <Modal onClose={onClose} title="Publish schedule" maxWidth={520}>
      <p style={{ margin: '0 0 12px', color: 'var(--muted)', fontSize: 14 }}>
        Publish <strong style={{ color: 'var(--ink)' }}>{schedule?.name}</strong> on <strong style={{ color: 'var(--ink)' }}>{schedule?.date}</strong>. Optionally link more batches before publishing.
      </p>
      <BatchPicker
        batchIds={allBatchIds} onToggle={toggle}
        allSchedules={existingSchedules} excludeId={schedule?.id || null} date={schedule?.date}
        helperText="A batch may be in only one schedule on this date."
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button type="button" onClick={onClose} style={btnGhost}>Cancel</button>
        <button type="button" onClick={() => onConfirm(extraIds)} style={btnPrimary}><i className="ti ti-check" /> Publish schedule</button>
      </div>
    </Modal>
  );
}

function DuplicateModal({ state, allSchedules, onClose, onConfirm }) {
  const src = state.schedule;
  const [toDate, setToDate] = useState(state.toDate);
  const [name, setName] = useState(state.name);
  const [batchIds, setBatchIds] = useState(() => src.batches.map((b) => String(b.id)));
  function toggle(bId) {
    const k = String(bId);
    setBatchIds((cur) => cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]);
  }
  function openDatePicker(e) {
    const el = e.currentTarget;
    if (typeof el.showPicker === 'function') {
      try { el.showPicker(); } catch { /* showPicker not allowed in this context */ }
    }
  }

  const footer = (
    <>
      <button type="button" className="legacy-btn legacy-btn-default" onClick={onClose}>Cancel</button>
      <button type="submit" form="duplicate-schedule-form" className="legacy-btn legacy-btn-success">
        <i className="ti ti-files" /> Duplicate
      </button>
    </>
  );

  return (
    <Modal
      onClose={onClose}
      title="Duplicate schedule"
      icon="ti-copy"
      maxWidth={560}
      footer={footer}
      footerClassName="form-modal"
    >
      <p style={{ margin: '0 0 18px', color: 'var(--muted)', fontSize: 14 }}>
        Copies all events from <strong style={{ color: 'var(--ink)' }}>{src.name}</strong> ({src.date}) into a new draft schedule.
      </p>
      <form id="duplicate-schedule-form" className="form-modal" onSubmit={(e) => { e.preventDefault(); onConfirm({ toDate, name, batchIds }); }}>
        <div className="asset-form-section">
          <div className="asset-form-section-title"><i className="ti ti-info-circle" /> Basic Details</div>
          <div className="asset-form-grid basic-grid">
            <label className="field-cell">
              <div className="float-field">
                <input
                  type="text" className="float-control" placeholder=" "
                  autoFocus value={name} onChange={(e) => setName(e.target.value)}
                />
                <span className="float-label">New name <span className="req">*</span></span>
              </div>
            </label>
            <label className="field-cell">
              <div className="float-field float-always date-custom">
                <input
                  type="date" className="float-control"
                  value={toDate} onChange={(e) => setToDate(e.target.value)}
                  onClick={openDatePicker} onKeyDown={openDatePicker}
                />
                <span className="float-label">Target date <span className="req">*</span></span>
                <span className={`date-display ${!toDate ? 'is-empty' : ''}`}>
                  {toDate ? prettyDate(toDate) : 'Set a Date'}
                </span>
              </div>
            </label>
          </div>
        </div>

        <div className="asset-form-section">
          <div className="asset-form-section-title"><i className="ti ti-users" /> Linked Batches</div>
          <BatchPicker
            batchIds={batchIds} onToggle={toggle}
            label={null}
            allSchedules={allSchedules} excludeId={null} date={toDate}
            helperText="Each batch may belong to only one schedule on the target date."
          />
        </div>
      </form>
    </Modal>
  );
}

function Modal({ children, onClose, title, maxWidth = 520, icon = 'ti-calendar', footer = null, footerClassName = '', headerClassName = '' }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="crispr-modal-backdrop active" role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="crispr-modal-dialog" style={{ maxWidth }} role="dialog" aria-modal="true">
        <div className={`crispr-modal-header${headerClassName ? ` ${headerClassName}` : ''}`}>
          <h3>{icon && <i className={`ti ${icon}`} />} {title}</h3>
          <button type="button" className="crispr-modal-close" onClick={onClose}>
            <i className="ti ti-close" />
          </button>
        </div>
        <div className="crispr-modal-body">{children}</div>
        {footer && <div className={`crispr-modal-footer${footerClassName ? ` ${footerClassName}` : ''}`}>{footer}</div>}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'grid', gap: 6 }}>
      <span style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}

// ─── Style tokens ──────────────────────────────────────────────────────
const inputStyle = { width: '100%', padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 14, color: 'var(--ink)', background: '#fff', outline: 'none' };
const selStyle = { ...inputStyle, appearance: 'auto' };
const btnPrimary = { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--brand)', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 };
const btnGhost = { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', color: 'var(--ink)', border: '1px solid var(--line)', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 };
const btnDanger = { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', color: 'var(--danger)', border: '1px solid #f3cdc8', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 };
const btnIcon = { background: '#fff', border: '1px solid var(--line)', padding: '6px 10px', borderRadius: 8, cursor: 'pointer', color: 'var(--ink)' };
const btnMicro = { background: 'transparent', border: '1px solid var(--line)', borderRadius: 6, padding: '2px 6px', cursor: 'pointer', color: 'var(--muted)', fontSize: 10 };
