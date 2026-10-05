import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import ToastRegion from '../components/ToastRegion';
import FilterDropdown from '../components/FilterDropdown';
import { api } from '../lib/api';
import { getToken } from '../lib/auth';
import useDebouncedValue from '../hooks/useDebouncedValue';
import {
  listMentorSessions,
  createMentorSession,
  cancelMentorSession,
  goLiveMentorSession,
  endMentorSession,
  mentorSessionError,
  isStreamError,
  MENTOR_SESSIONS_DEMO,
} from '../lib/mentorSessionsApi';

const STATUS_LABEL = {
  scheduled: 'Scheduled',
  live: 'Live Now',
  ended: 'Ended',
  cancelled: 'Cancelled',
};

const DURATION_OPTIONS = ['30m', '45m', '1h', '1h 30m', '2h'];

// Where the standalone Audio Room app (meeting-room-app) is served. Local dev
// runs it on :5176; production is the room.crisprlearning.com custom domain.
const ROOM_APP_URL = (() => {
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:5176';
  return 'https://room.crisprlearning.in';
})();

// Hand off to the room app with the session id + the admin's access token, so
// the backend can mint getstream credentials and resolve the caller's role
// (host / co-host / listener). See docs/audio-streams-contract.md §4.8.
function openRoom(session) {
  const params = new URLSearchParams({ id: session.id });
  const token = getToken();
  if (token) params.set('t', token);
  window.open(`${ROOM_APP_URL}/?${params.toString()}`, '_blank', 'noopener');
}

function durationToMinutes(label) {
  if (!label) return null;
  let total = 0;
  const h = /(\d+)\s*h/.exec(label);
  const m = /(\d+)\s*m/.exec(label);
  if (h) total += Number(h[1]) * 60;
  if (m) total += Number(m[1]);
  return total || null;
}

function formatDateTime(value) {
  if (!value) return 'Instant';
  const d = new Date(value);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 || 12;
  const mm = String(minutes).padStart(2, '0');
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} ${h12}:${mm} ${ampm}`;
}

function getPageNumbers(currentPage, totalPages) {
  const pages = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else if (currentPage <= 4) {
    for (let i = 1; i <= 5; i++) pages.push(i);
    pages.push('...');
    pages.push(totalPages);
  } else if (currentPage >= totalPages - 3) {
    pages.push(1);
    pages.push('...');
    for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    pages.push('...');
    for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
    pages.push('...');
    pages.push(totalPages);
  }
  return pages;
}

function Avatar({ name, size = 24 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: '#006073', color: 'white', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: size <= 24 ? '10px' : '12px', flexShrink: 0 }}>
      {(name || '??').slice(0, 2).toUpperCase()}
    </div>
  );
}

// Reusable multi-select styled as a floating-label field (matches the standard
// modal form system). Searchable dropdown + selected chips.
function MultiSelect({ label, required, placeholder, options, selectedIds, onChange, emptyHint }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectedSet = new Set(selectedIds);
  const selectedOptions = options.filter((o) => selectedSet.has(o.id));
  const filtered = options.filter(
    (o) => !selectedSet.has(o.id) && o.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  function toggle(id) {
    if (selectedSet.has(id)) onChange(selectedIds.filter((x) => x !== id));
    else onChange([...selectedIds, id]);
  }

  return (
    <label className="field-cell full-span" ref={ref} style={{ position: 'relative' }}>
      <div className="float-field float-always ms-field">
        <div className="ms-control" onClick={() => setOpen(true)}>
          {selectedOptions.map((o) => (
            <span key={o.id} className="ms-chip">
              {o.name}
              <i className="ti ti-close" onClick={(e) => { e.stopPropagation(); toggle(o.id); }} />
            </span>
          ))}
          <input
            placeholder={selectedOptions.length ? '' : placeholder}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
          />
        </div>
        <span className="float-label">{label}{required && <span className="req"> *</span>}</span>
      </div>
      {open && (
        <div className="ms-dropdown">
          {filtered.length === 0 ? (
            <div className="ms-empty">{emptyHint || 'No matches'}</div>
          ) : (
            filtered.map((o) => (
              <button
                key={o.id}
                type="button"
                className="ms-option"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { toggle(o.id); setQuery(''); }}
              >
                <span className="ms-avatar">{(o.name || '??').slice(0, 2).toUpperCase()}</span>
                <span>{o.name}</span>
                {o.detail && <span className="ms-option-detail">{o.detail}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </label>
  );
}

function KebabMenu({ session, onAction }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handler(event) {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="kebab-menu-container" ref={ref}>
      <button type="button" className="kebab-button" onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}>
        <i className="ti ti-more-alt" />
      </button>
      <div className={`kebab-dropdown${open ? ' active' : ''}`}>
        {(session.status === 'scheduled' || session.status === 'live') && (
          <button type="button" className="kebab-dropdown-item" onClick={() => { setOpen(false); onAction(session, 'join'); }}>
            <i className="ti ti-headphone" /> {session.status === 'live' ? 'Join Room' : 'Enter Room as Host'}
          </button>
        )}

        <button type="button" className="kebab-dropdown-item" onClick={() => { setOpen(false); onAction(session, 'participants'); }}>
          <i className="ti ti-users" /> View Participants
        </button>

        {session.status === 'scheduled' && (
          <button type="button" className="kebab-dropdown-item" onClick={() => { setOpen(false); onAction(session, 'go-live'); }}>
            <i className="ti ti-microphone" /> Open Room Now
          </button>
        )}

        {(session.status === 'live' || (session.stream && session.stream.join_url)) && (
          <button type="button" className="kebab-dropdown-item" onClick={() => { setOpen(false); onAction(session, 'copy-link'); }}>
            <i className="ti ti-link" /> Copy Join Link
          </button>
        )}

        {session.status === 'live' && (
          <button type="button" className="kebab-dropdown-item" onClick={() => { setOpen(false); onAction(session, 'end'); }}>
            <i className="ti ti-player-stop" /> End Room
          </button>
        )}

        {session.status === 'ended' && session.stream?.recording_url && (
          <button type="button" className="kebab-dropdown-item" onClick={() => { setOpen(false); onAction(session, 'recording'); }}>
            <i className="ti ti-volume" /> Listen to Recording
          </button>
        )}

        {session.status === 'scheduled' && (
          <button type="button" className="kebab-dropdown-item danger-action" onClick={() => { setOpen(false); onAction(session, 'cancel'); }}>
            <i className="ti ti-close" /> Cancel Session
          </button>
        )}
      </div>
    </div>
  );
}

export default function MentorSessionsPage() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [isDemo, setIsDemo] = useState(false);

  // Reference data for the form pickers.
  const [mentorOptions, setMentorOptions] = useState([]);
  const [batchOptions, setBatchOptions] = useState([]);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebouncedValue(searchQuery);
  const [statusFilter, setStatusFilter] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Create modal + form
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formBrief, setFormBrief] = useState('');
  const [formHostId, setFormHostId] = useState('');
  const [formCohostIds, setFormCohostIds] = useState([]);
  const [formIsInstant, setFormIsInstant] = useState(false);
  const [formScheduledAt, setFormScheduledAt] = useState('');
  const [formDuration, setFormDuration] = useState('1h');
  const [formRequestToJoin, setFormRequestToJoin] = useState(true);
  const [formAudienceIds, setFormAudienceIds] = useState([]);

  // Participants drawer
  const [participantsSession, setParticipantsSession] = useState(null);

  const [toasts, setToasts] = useState([]);

  function showToast(type, title, message) {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, type, title, message }]);
    window.setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 5000);
  }

  // ── Data loading ──────────────────────────────────────────────────────────
  const loadSessions = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await listMentorSessions({
        search: debouncedSearchQuery || undefined,
        status: statusFilter || undefined,
      });
      setSessions(Array.isArray(res?.data) ? res.data : []);
      setIsDemo(false);
    } catch (err) {
      // Backend module not deployed yet → degrade to demo data (filtered locally).
      const e = mentorSessionError(err);
      const q = (debouncedSearchQuery || '').trim().toLowerCase();
      let rows = MENTOR_SESSIONS_DEMO;
      if (statusFilter) rows = rows.filter((s) => s.status === statusFilter);
      if (q) rows = rows.filter((s) => [s.title, s.brief, s.host?.name].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)));
      setSessions(rows);
      setIsDemo(true);
      // Only treat as a hard error if it wasn't a plain "not found / network" gap.
      if (e.status && e.status !== 404 && e.status !== 0 && !isStreamError(e.code)) {
        setLoadError(null); // still show demo; surface a soft banner instead
      }
    } finally {
      setLoading(false);
    }
  }, [debouncedSearchQuery, statusFilter]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Load mentors (Host + Co-hosts) and batches (Audience) for the create form.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await api.get('/admin/people/mentor/list', {
          params: { page: 1, size: 200, sortBy: 'name', sortOrder: 'ASC' },
        });
        const rows = (resp.data?.data || []).map((m) => ({ id: String(m.id), name: m.name || 'Unknown', detail: m.specialization || m.specialisation || '' }));
        if (!cancelled && rows.length) setMentorOptions(rows);
      } catch {
        // Demo fallback drawn from the sample sessions' hosts/co-hosts.
        if (!cancelled) {
          const seen = new Map();
          MENTOR_SESSIONS_DEMO.forEach((s) => {
            [s.host, ...(s.cohosts || [])].filter(Boolean).forEach((p) => seen.set(String(p.id), { id: String(p.id), name: p.name, detail: 'Mentor' }));
          });
          setMentorOptions([...seen.values()]);
        }
      }
      try {
        const resp = await api.get('/admin/enrollment/list-batches', {
          params: { page: 1, size: 200, sortBy: 'name', sortOrder: 'ASC' },
        });
        const rows = (resp.data?.data || []).map((b) => ({ id: String(b.id), name: b.name || b.batchName || 'Unnamed batch', detail: b.numberOfStudents ? `${b.numberOfStudents} students` : '' }));
        if (!cancelled && rows.length) setBatchOptions(rows);
      } catch {
        if (!cancelled) {
          const seen = new Map();
          MENTOR_SESSIONS_DEMO.forEach((s) => (s.audience_batches || []).forEach((b) => seen.set(String(b.id), { id: String(b.id), name: b.name, detail: '' })));
          setBatchOptions([...seen.values()]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function replaceSession(updated) {
    if (!updated) return;
    setSessions((current) => current.map((s) => (s.id === updated.id ? updated : s)));
  }

  function copyToClipboard(text, lbl) {
    if (!text) return showToast('error', 'Nothing to copy', 'This room has no join link yet.');
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => showToast('success', 'Copied', `${lbl} copied to clipboard.`))
        .catch(() => showToast('error', 'Copy failed', 'Could not access the clipboard.'));
    } else {
      showToast('error', 'Copy failed', 'Clipboard is not available in this browser.');
    }
  }

  const filteredSessions = useMemo(() => {
    const next = [...sessions];
    next.sort((a, b) => {
      // Live first, then by scheduled time desc.
      if (a.status === 'live' && b.status !== 'live') return -1;
      if (b.status === 'live' && a.status !== 'live') return 1;
      return new Date(b.scheduled_at || 0).getTime() - new Date(a.scheduled_at || 0).getTime();
    });
    return next;
  }, [sessions]);

  const totalPages = Math.max(1, Math.ceil(filteredSessions.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = filteredSessions.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endIndex = Math.min(safePage * pageSize, filteredSessions.length);
  const paginated = useMemo(
    () => filteredSessions.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredSessions, safePage, pageSize],
  );

  useEffect(() => { setCurrentPage(1); }, [searchQuery, statusFilter]);

  async function handleAction(session, actionName) {
    if (actionName === 'cancel') {
      const ok = window.confirm(`Cancel "${session.title}"? Invited mentees will no longer see this room.`);
      if (!ok) return;
      try {
        if (isDemo) {
          setSessions((cur) => cur.filter((s) => s.id !== session.id));
        } else {
          await cancelMentorSession(session.id);
          setSessions((cur) => cur.filter((s) => s.id !== session.id));
        }
        showToast('success', 'Session cancelled', `"${session.title}" has been removed.`);
      } catch (err) {
        showToast('error', 'Cancel failed', mentorSessionError(err).message);
      }
    } else if (actionName === 'go-live') {
      try {
        if (isDemo) {
          replaceSession({ ...session, status: 'live', started_at: new Date().toISOString(), stream: { ...(session.stream || {}), call_type: 'audio_room', call_id: `audio_room:${session.id}`, provisioned_at: new Date().toISOString(), join_url: `https://crisprtech.app/room/${session.id}` } });
        } else {
          replaceSession(await goLiveMentorSession(session.id));
        }
        showToast('success', 'Room open', `"${session.title}" is now live on getstream.`);
      } catch (err) {
        const e = mentorSessionError(err);
        showToast('error', isStreamError(e.code) ? 'Stream provisioning failed' : 'Could not open room', e.message);
      }
    } else if (actionName === 'end') {
      try {
        if (isDemo) {
          replaceSession({ ...session, status: 'ended', ended_at: new Date().toISOString() });
        } else {
          replaceSession(await endMentorSession(session.id));
        }
        showToast('success', 'Room ended', `"${session.title}" has been closed.`);
      } catch (err) {
        showToast('error', 'End failed', mentorSessionError(err).message);
      }
    } else if (actionName === 'join') {
      openRoom(session);
    } else if (actionName === 'copy-link') {
      copyToClipboard(session.stream?.join_url, 'Join link');
    } else if (actionName === 'recording') {
      window.open(session.stream.recording_url, '_blank', 'noopener');
    } else if (actionName === 'participants') {
      setParticipantsSession(session);
    }
  }

  function resetForm() {
    setFormTitle('');
    setFormBrief('');
    setFormHostId('');
    setFormCohostIds([]);
    setFormIsInstant(false);
    setFormScheduledAt('');
    setFormDuration('1h');
    setFormRequestToJoin(true);
    setFormAudienceIds([]);
  }

  async function handleCreateSubmit(e) {
    e.preventDefault();
    if (!formTitle.trim()) return showToast('error', 'Missing title', 'Please enter a title.');
    if (!formHostId) return showToast('error', 'Missing host', 'Please select a host.');
    if (!formIsInstant && !formScheduledAt) return showToast('error', 'Missing schedule', 'Pick a start time or choose "Start instantly".');
    if (formAudienceIds.length === 0) return showToast('error', 'Missing audience', 'Select at least one batch as the audience.');

    const body = {
      title: formTitle.trim(),
      brief: formBrief.trim() || null,
      host_id: formHostId,
      cohost_ids: formCohostIds,
      mode: 'audio_room',
      is_instant: formIsInstant,
      scheduled_at: formIsInstant ? null : new Date(formScheduledAt).toISOString(),
      duration_label: formDuration,
      duration_minutes: durationToMinutes(formDuration),
      request_to_join: formRequestToJoin,
      audience_batch_ids: formAudienceIds,
    };

    setSubmitting(true);
    try {
      if (isDemo) {
        // Optimistic local insert so the page is usable before the backend exists.
        const host = mentorOptions.find((m) => m.id === formHostId);
        const created = {
          id: `as_local_${Date.now()}`,
          title: body.title,
          brief: body.brief,
          host: { id: formHostId, name: host?.name || 'Host' },
          cohosts: formCohostIds.map((id) => ({ id, name: mentorOptions.find((m) => m.id === id)?.name || 'Co-host' })),
          audience_batches: formAudienceIds.map((id) => ({ id, name: batchOptions.find((b) => b.id === id)?.name || 'Batch' })),
          mode: 'audio_room',
          is_instant: formIsInstant,
          scheduled_at: body.scheduled_at || new Date().toISOString(),
          duration_label: formDuration,
          duration_minutes: body.duration_minutes,
          request_to_join: formRequestToJoin,
          status: formIsInstant ? 'live' : 'scheduled',
          stream: formIsInstant
            ? { call_type: 'audio_room', call_id: `audio_room:local_${Date.now()}`, provisioned_at: new Date().toISOString(), join_url: `https://crisprtech.app/room/local_${Date.now()}` }
            : { call_type: 'audio_room', call_id: null, provisioned_at: null, join_url: null },
          stats: { invited_count: 0, joined_count: 0, peak_listeners: 0, speaker_count: 0 },
          created_at: new Date().toISOString(),
        };
        setSessions((cur) => [created, ...cur]);
      } else {
        const created = await createMentorSession(body);
        setSessions((cur) => [created, ...cur.filter((s) => s.id !== created.id)]);
      }
      setShowCreateModal(false);
      showToast('success', 'Session scheduled', `"${body.title}" ${formIsInstant ? 'is live now' : 'has been scheduled'}.`);
      resetForm();
    } catch (err) {
      const e = mentorSessionError(err);
      if (isStreamError(e.code)) {
        setShowCreateModal(false);
        showToast('error', 'Room not provisioned', `${e.message} You can retry from the session menu.`);
        loadSessions();
      } else if (e.fields) {
        showToast('error', 'Validation failed', Object.values(e.fields)[0] || e.message);
      } else {
        showToast('error', 'Could not schedule', e.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const hasActiveFilters = searchQuery || statusFilter;
  function clearFilters() { setSearchQuery(''); setStatusFilter(''); }

  return (
    <section className="courses-list-page exam-attempt-report-page data-table-page" style={{ position: 'relative', minHeight: '100vh', paddingBottom: '40px' }}>
      <ToastRegion toasts={toasts} onDismiss={(id) => setToasts((current) => current.filter((t) => t.id !== id))} />

      {/* ── Header ── */}
      <div className="page-header-section">
        <div className="page-header-title-group">
          <span className="page-header-icon-box"><i className="fa fa-microphone" /></span>
          <div>
            <h2>Mentor Sessions</h2>
            <p>Schedule and track Audio Rooms where mentors connect with their student mentees.</p>
          </div>
        </div>
        <button type="button" className="page-action-button" onClick={() => { resetForm(); setShowCreateModal(true); }}>
          <i className="ti ti-microphone" /> Schedule Audio Room
        </button>
      </div>

      {isDemo && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '8px 12px', marginBottom: '4px' }}>
          <i className="ti ti-info-circle" />
          Showing sample data — the <code>audio_streams</code> backend module isn’t connected yet. Scheduling works locally for preview.
        </div>
      )}

      {/* ── Filters ── */}
      <div className="filter-bar">
        <div className="search-wrapper">
          <i className={`ti ${searchQuery ? 'ti-close' : 'ti-search'} search-icon`} onClick={() => setSearchQuery('')} aria-hidden="true" />
          <input
            type="text"
            className="search-input"
            placeholder="Search by title or host..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <FilterDropdown
          label="All Statuses"
          ariaLabel="Filter by status"
          value={statusFilter}
          options={[
            { value: '', label: 'All Statuses' },
            { value: 'scheduled', label: 'Scheduled' },
            { value: 'live', label: 'Live Now' },
            { value: 'ended', label: 'Ended' },
            { value: 'cancelled', label: 'Cancelled' },
          ]}
          onChange={(value) => setStatusFilter(value)}
        />
        {hasActiveFilters && (
          <button type="button" className="filter-clear-btn" onClick={clearFilters}>
            <i className="ti ti-reload" /> Clear
          </button>
        )}
      </div>

      {/* ── Table ── */}
      {loadError ? (
        <div className="ear-empty-state" style={{ background: 'white', border: '1px solid var(--line)', marginTop: '24px' }}>
          <i className="ti ti-alert-triangle" style={{ color: '#dc2626' }} />
          <h4>Couldn't load mentor sessions</h4>
          <p>{loadError}</p>
          <button type="button" onClick={loadSessions} style={{ marginTop: '8px', background: '#006073', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
            <i className="ti ti-reload" /> Retry
          </button>
        </div>
      ) : (loading || filteredSessions.length > 0) ? (
        <div className="students-table-container" style={{ background: 'white', border: '1px solid var(--line)' }}>
          <table className={`students-table ${loading ? 'thead-loading' : ''}`}>
            <thead>
              <tr>
                <th>Title</th>
                <th>Host</th>
                <th>Audience</th>
                <th>Status</th>
                <th>Scheduled Start</th>
                <th>Duration</th>
                <th>Engagement</th>
                <th style={{ width: 50 }}></th>
              </tr>
            </thead>
            {loading ? (
              <tbody>
                {Array.from({ length: 8 }, (_, i) => (
                  <tr key={`sk-${i}`}>
                    {Array.from({ length: 8 }, (_, j) => (
                      <td key={j}><div className="table-skeleton medium" /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ) : (
              <tbody>
                {paginated.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.title}</strong>
                      {s.request_to_join && (
                        <span title="Listeners must request to join the stage" style={{ marginLeft: 6, fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', color: '#7c3aed', background: '#f3e8ff', padding: '2px 6px', borderRadius: '4px' }}>
                          <i className="ti ti-hand-stop" /> Request to Join
                        </span>
                      )}
                      {s.brief && <div className="ear-td-muted" style={{ fontSize: '12px', marginTop: 2, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.brief}</div>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Avatar name={s.host?.name} />
                        <div>
                          {s.host?.name || '—'}
                          {s.cohosts?.length > 0 && <div className="ear-td-muted" style={{ fontSize: '11px' }}>+{s.cohosts.length} co-host{s.cohosts.length > 1 ? 's' : ''}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="ear-td-muted">
                      <span style={{ display: 'inline-block', background: '#f4f7f8', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}>
                        {(s.audience_batches || []).length === 0
                          ? '—'
                          : (s.audience_batches.length === 1
                            ? s.audience_batches[0].name
                            : `${s.audience_batches[0].name} +${s.audience_batches.length - 1}`)}
                      </span>
                    </td>
                    <td>
                      {s.status === 'live' && <span className="status-pill status-danger"><span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#dc2626', marginRight: '4px', animation: 'msblink 1.5s infinite' }} />Live Now</span>}
                      {s.status === 'scheduled' && <span className="status-pill status-upcoming">Scheduled</span>}
                      {s.status === 'ended' && <span className="status-pill status-completed">Ended</span>}
                      {s.status === 'cancelled' && <span className="status-pill status-inactive">Cancelled</span>}
                    </td>
                    <td className="ear-td-datetime">{s.is_instant && s.status !== 'scheduled' ? 'Instant' : formatDateTime(s.scheduled_at)}</td>
                    <td>{s.duration_label || '—'}</td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px' }} title="Joined / peak listeners">
                        <i className="ti ti-headphones" style={{ color: '#006073' }} />
                        <strong>{s.stats?.joined_count ?? 0}</strong>
                        <span className="ear-td-muted">/ {s.stats?.peak_listeners ?? 0} peak</span>
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                        {s.status === 'live' && (
                          <button
                            type="button"
                            onClick={() => openRoom(s)}
                            title="Join this live audio room"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: '#006073', color: 'white', border: 'none', borderRadius: '6px', padding: '5px 11px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                          >
                            <i className="ti ti-microphone" /> Join
                          </button>
                        )}
                        <KebabMenu session={s} onAction={handleAction} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>

          <div className="pagination-container">
            <div className="pagination-info">
              <span>Showing {startIndex} to {endIndex} of {filteredSessions.length} entries</span>
              <select className="page-size-select" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}>
                {[20, 50, 100, 200].map((size) => <option key={size} value={size}>Show {size}</option>)}
              </select>
            </div>
            <div className="pagination-controls">
              <button type="button" className="pagination-btn" disabled={safePage === 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>
                <i className="ti ti-angle-left" /> Previous
              </button>
              {getPageNumbers(safePage, totalPages).map((page, index) => (
                page === '...'
                  ? <span key={`ellipsis-${index}`} className="pagination-ellipsis">...</span>
                  : <button key={page} type="button" className={`pagination-btn${safePage === page ? ' active' : ''}`} onClick={() => setCurrentPage(page)}>{page}</button>
              ))}
              <button type="button" className="pagination-btn" disabled={safePage === totalPages} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}>
                Next <i className="ti ti-angle-right" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="ear-empty-state" style={{ background: 'white', border: '1px solid var(--line)', marginTop: '24px' }}>
          <i className="ti ti-microphone" />
          <h4>No Mentor Sessions Found</h4>
          <p>No audio rooms match your current filters. Schedule one to get started!</p>
        </div>
      )}

      {/* ── Create Modal ── */}
      <div className={`legacy-modal-backdrop ${showCreateModal ? 'active' : ''}`} onClick={() => setShowCreateModal(false)}>
        <div className="legacy-modal-dialog legacy-large" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
          <div className="legacy-modal-header">
            <h3><i className="ti ti-microphone" /> Schedule Audio Room</h3>
            <button type="button" className="legacy-modal-close" onClick={() => setShowCreateModal(false)}>
              <i className="ti ti-close" />
            </button>
          </div>
          <form className="audio-room-modal-form form-modal" onSubmit={handleCreateSubmit}>
            <div className="legacy-modal-body">

              <div className="asset-form-section">
                <div className="asset-form-section-title"><i className="ti ti-info-circle" /> Session Details</div>
                <div className="asset-form-grid">
                  <label className="field-cell full-span">
                    <div className="float-field">
                      <input type="text" className="float-control" placeholder=" " value={formTitle} onChange={(e) => setFormTitle(e.target.value)} autoFocus />
                      <span className="float-label">Title <span className="req">*</span></span>
                    </div>
                  </label>
                  <label className="field-cell full-span">
                    <div className="float-field float-textarea">
                      <textarea className="float-control" placeholder=" " value={formBrief} onChange={(e) => setFormBrief(e.target.value)} />
                      <span className="float-label">Brief</span>
                    </div>
                    <span className="field-hint">A short summary of what this session covers.</span>
                  </label>
                </div>
              </div>

              <div className="asset-form-section">
                <div className="asset-form-section-title"><i className="ti ti-microphone" /> Hosts &amp; Audience</div>
                <div className="asset-form-grid">
                  <label className="field-cell">
                    <div className="float-field float-always">
                      <select className="float-control" value={formHostId} onChange={(e) => setFormHostId(e.target.value)}>
                        <option value="">Select a mentor…</option>
                        {mentorOptions.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                      <span className="float-label">Host <span className="req">*</span></span>
                    </div>
                  </label>
                  <label className="field-cell">
                    <div className="float-field float-always">
                      <select className="float-control" value={formDuration} onChange={(e) => setFormDuration(e.target.value)}>
                        {DURATION_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                      <span className="float-label">Duration</span>
                    </div>
                  </label>

                  <MultiSelect
                    label="Co-hosts"
                    placeholder="Add co-host mentors…"
                    options={mentorOptions.filter((m) => m.id !== formHostId)}
                    selectedIds={formCohostIds}
                    onChange={setFormCohostIds}
                    emptyHint="No more mentors"
                  />

                  <MultiSelect
                    label="Audience (batches)"
                    required
                    placeholder="Select batches that can listen…"
                    options={batchOptions}
                    selectedIds={formAudienceIds}
                    onChange={setFormAudienceIds}
                    emptyHint="No batches found"
                  />
                </div>
              </div>

              <div className="asset-form-section">
                <div className="asset-form-section-title"><i className="ti ti-calendar" /> Schedule &amp; Access</div>
                <div className="asset-form-grid">
                  <label className="field-cell">
                    <div className="float-field float-always" style={{ opacity: formIsInstant ? 0.5 : 1 }}>
                      <input type="datetime-local" className="float-control" value={formScheduledAt} onChange={(e) => setFormScheduledAt(e.target.value)} disabled={formIsInstant} />
                      <span className="float-label">Scheduled Start {!formIsInstant && <span className="req">*</span>}</span>
                    </div>
                  </label>
                  <div className="field-cell field-cell-inline">
                    <span className="static-field-label">Start instantly</span>
                    <button
                      type="button"
                      className={`mas-switch ${formIsInstant ? 'on' : ''}`}
                      role="switch"
                      aria-checked={formIsInstant}
                      onClick={() => setFormIsInstant((v) => !v)}
                    >
                      <span className="mas-switch-track" />
                      <span className="mas-switch-label">{formIsInstant ? 'Yes' : 'No'}</span>
                    </button>
                  </div>

                  <div className="field-cell full-span ar-toggle-cell">
                    <div className="ar-toggle-copy">
                      <strong>Request to Join</strong>
                      <span>Listeners join muted and must raise a hand; the host admits them to speak. Turn off to let mentees speak freely.</span>
                    </div>
                    <button
                      type="button"
                      className={`mas-switch ${formRequestToJoin ? 'on' : ''}`}
                      role="switch"
                      aria-checked={formRequestToJoin}
                      onClick={() => setFormRequestToJoin((v) => !v)}
                    >
                      <span className="mas-switch-track" />
                      <span className="mas-switch-label">{formRequestToJoin ? 'On' : 'Off'}</span>
                    </button>
                  </div>
                </div>
              </div>

            </div>
            <div className="legacy-modal-footer">
              <button type="button" className="legacy-btn legacy-btn-default" onClick={() => setShowCreateModal(false)}>Cancel</button>
              <button type="submit" className="legacy-btn legacy-btn-success" disabled={submitting}>
                {submitting ? 'Saving…' : (formIsInstant ? 'Open Room Now' : 'Schedule Room')}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* ── Participants modal ── */}
      <div className={`legacy-modal-backdrop ${participantsSession ? 'active' : ''}`} onClick={() => setParticipantsSession(null)}>
        {participantsSession && (
          <div className="legacy-modal-dialog form-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="legacy-modal-header">
              <h3><i className="ti ti-users" /> {participantsSession.title}</h3>
              <button type="button" className="legacy-modal-close" onClick={() => setParticipantsSession(null)}><i className="ti ti-close" /></button>
            </div>
            <div className="legacy-modal-body">

              <div className="ar-stat-grid">
                {[
                  { label: 'Invited', value: participantsSession.stats?.invited_count ?? 0, icon: 'ti-mail' },
                  { label: 'Joined', value: participantsSession.stats?.joined_count ?? 0, icon: 'ti-headphone' },
                  { label: 'Peak', value: participantsSession.stats?.peak_listeners ?? 0, icon: 'ti-stats-up' },
                ].map((m) => (
                  <div key={m.label} className="ar-stat">
                    <i className={`ti ${m.icon}`} />
                    <div className="ar-stat-value">{m.value}</div>
                    <div className="ar-stat-label">{m.label}</div>
                  </div>
                ))}
              </div>

              <div className="asset-form-section">
                <div className="asset-form-section-title"><i className="ti ti-microphone" /> On the stage</div>
                <div className="ar-people-row">
                  <span className="ms-avatar">{(participantsSession.host?.name || '??').slice(0, 2).toUpperCase()}</span>
                  <span className="ar-people-name">{participantsSession.host?.name}</span>
                  <span className="ar-role-pill ar-role-host">Host</span>
                </div>
                {(participantsSession.cohosts || []).map((c) => (
                  <div key={c.id} className="ar-people-row">
                    <span className="ms-avatar">{(c.name || '??').slice(0, 2).toUpperCase()}</span>
                    <span className="ar-people-name">{c.name}</span>
                    <span className="ar-role-pill ar-role-cohost">Co-host</span>
                  </div>
                ))}
              </div>

              <div className="asset-form-section">
                <div className="asset-form-section-title"><i className="ti ti-users" /> Audience</div>
                <div className="ar-batch-wrap">
                  {(participantsSession.audience_batches || []).length === 0
                    ? <span className="ms-empty" style={{ padding: 0 }}>No batches assigned</span>
                    : participantsSession.audience_batches.map((b) => (
                      <span key={b.id} className="ar-batch-chip">{b.name}</span>
                    ))}
                </div>

                {participantsSession.request_to_join && (
                  <div className="ar-note">
                    <i className="ti ti-hand-stop" />
                    <span>Request-to-join is on — listeners raise a hand and the host admits them to speak.</span>
                  </div>
                )}
              </div>

            </div>
            <div className="legacy-modal-footer">
              {participantsSession.stream?.join_url && (
                <button type="button" className="legacy-btn legacy-btn-default" onClick={() => copyToClipboard(participantsSession.stream.join_url, 'Join link')}>
                  <i className="ti ti-link" /> Copy Join Link
                </button>
              )}
              <button type="button" className="legacy-btn legacy-btn-primary" onClick={() => setParticipantsSession(null)}>Done</button>
            </div>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes msblink { 0% { opacity: 1; } 50% { opacity: 0.4; } 100% { opacity: 1; } }
      ` }} />
    </section>
  );
}
