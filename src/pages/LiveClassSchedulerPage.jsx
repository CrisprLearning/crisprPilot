import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ToastRegion from '../components/ToastRegion';
import FilterDropdown from '../components/FilterDropdown';
import {
  listLiveClasses,
  createLiveClass,
  cancelLiveClass,
  launchLiveClass,
  endLiveClass,
  provisionYoutube,
  rotateYoutubeKey,
  liveClassError,
  isYoutubeError,
} from '../lib/liveClassApi';
import useDebouncedValue from '../hooks/useDebouncedValue';
import Icon from '../components/Icon';

const studentPool = ['All Registered', 'Unrestricted', 'Batch A', 'Batch B', 'Course: IAT 2026', 'Course: NEET 2026'];
const hostPool = ['Rajesh Kumar', 'Priya Sharma', 'Vikram Singh', 'Anjali Gupta'];

const MODE_LABEL = { system: 'System', youtube: 'YouTube' };

const YT_LIFECYCLE_LABEL = {
  created: 'Created',
  ready: 'Ready',
  testing: 'Testing',
  live: 'Live',
  complete: 'Complete',
  revoked: 'Revoked',
};

function maskKey(key) {
  if (!key) return '';
  return key.replace(/[^-]/g, '•');
}

function formatDateTime(value) {
  if (!value) return 'Not set';
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

function StarRating({ rating }) {
  if (!rating) return <span className="ear-td-muted">-</span>;
  return (
    <div style={{ display: 'flex', color: '#fbbf24', fontSize: '15px', gap: '2px', alignItems: 'center' }}>
      <strong>{rating}</strong>
      <Icon className="ti ti-star" style={{ fontWeight: 'bold' }} />
    </div>
  );
}

function KebabMenu({ cls, onAction }) {
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
      <button
        type="button"
        className="kebab-button"
        onClick={(event) => { event.stopPropagation(); setOpen((v) => !v); }}
      >
        <Icon className="ti ti-more-alt" />
      </button>
        <div className={`kebab-dropdown${open ? ' active' : ''}`}>
          <button
            type="button"
            className="kebab-dropdown-item"
            onClick={() => { setOpen(false); onAction(cls, 'attendance'); }}
          >
            <Icon className="ti ti-user" /> View Attendance Report
          </button>

          {cls.mode === 'youtube' && cls.status !== 'completed' && (
            <button
              type="button"
              className="kebab-dropdown-item"
              onClick={() => { setOpen(false); onAction(cls, 'stream-setup'); }}
            >
              <Icon className="ti ti-brand-youtube" /> Stream Setup (OBS)
            </button>
          )}

          {cls.status !== 'completed' && (
            <button
              type="button"
              className="kebab-dropdown-item"
              onClick={() => { setOpen(false); onAction(cls, 'plan-activity'); }}
            >
              <Icon className="ti ti-layout-media-overlay" /> Plan Activity
            </button>
          )}

          {cls.status === 'completed' && (
            <button
              type="button"
              className="kebab-dropdown-item"
              onClick={() => { setOpen(false); onAction(cls, 'feedback'); }}
            >
              <Icon className="ti ti-comments" /> Feedback Summary
            </button>
          )}

          {cls.status === 'live' && (
            <button
              type="button"
              className="kebab-dropdown-item"
              onClick={() => { setOpen(false); onAction(cls, 'end'); }}
            >
              <Icon className="ti ti-player-stop" /> End Class
            </button>
          )}

          {cls.status === 'scheduled' && (
            <>
              <button
                type="button"
                className="kebab-dropdown-item"
                onClick={() => { setOpen(false); onAction(cls, 'launch'); }}
              >
                <Icon className="ti ti-player-play" /> Go Live Now
              </button>
              <button
                type="button"
                className="kebab-dropdown-item"
                onClick={() => { setOpen(false); onAction(cls, 'reschedule'); }}
              >
                <Icon className="ti ti-calendar" /> Reschedule
              </button>
              <button
                type="button"
                className="kebab-dropdown-item danger-action"
                onClick={() => { setOpen(false); onAction(cls, 'cancel'); }}
              >
                <Icon className="ti ti-close" /> Cancel Class
              </button>
            </>
          )}
        </div>
    </div>
  );
}

export default function LiveClassSchedulerPage() {
  const navigate = useNavigate();
  const [classesList, setClassesList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebouncedValue(searchQuery);
  const [statusFilter, setStatusFilter] = useState('');
  const [modeFilter, setModeFilter] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Create Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [formTitle, setFormTitle] = useState('');
  const [formHost, setFormHost] = useState(hostPool[0]);
  const [formParticipants, setFormParticipants] = useState(studentPool[0]);
  const [formMode, setFormMode] = useState('system');
  const [formIsInstant, setFormIsInstant] = useState(false);
  const [formScheduledAt, setFormScheduledAt] = useState('');
  const [formDuration, setFormDuration] = useState('1h');

  // Toggles
  const [tglStrictModeration, setTglStrictModeration] = useState(false);
  const [tglAutoFeedback, setTglAutoFeedback] = useState(false);
  const [tglWebinarMode, setTglWebinarMode] = useState(false);
  const [tglAskToJoin, setTglAskToJoin] = useState(false);

  const [toasts, setToasts] = useState([]);

  // OBS / YouTube stream setup panel
  const [obsClassId, setObsClassId] = useState(null);
  const [showStreamKey, setShowStreamKey] = useState(false);

  function showToast(type, title, message) {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, type, title, message }]);
    window.setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 5000);
  }

  // ── Data loading (server-side search/status/mode filters) ─────────────────
  const loadClasses = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await listLiveClasses({
        search: debouncedSearchQuery || undefined,
        status: statusFilter || undefined,
        mode: modeFilter || undefined,
      });
      setClassesList(Array.isArray(res?.data) ? res.data : []);
    } catch (err) {
      const e = liveClassError(err);
      setLoadError(e.message);
      setClassesList([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearchQuery, statusFilter, modeFilter]);

  // searchQuery is debounced (2s) into debouncedSearchQuery, so typing in the
  // search box no longer fires a request per keystroke.
  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  function replaceClass(updated) {
    if (!updated) return;
    setClassesList((current) => current.map((c) => (c.id === updated.id ? updated : c)));
  }

  // Derive the live class object the OBS panel is showing from the list so it
  // always reflects the latest provisioning state.
  const obsClass = useMemo(
    () => classesList.find((c) => c.id === obsClassId) || null,
    [classesList, obsClassId],
  );

  function copyToClipboard(text, label) {
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => showToast('success', 'Copied', `${label} copied to clipboard.`))
        .catch(() => showToast('error', 'Copy failed', 'Could not access the clipboard.'));
    } else {
      showToast('error', 'Copy failed', 'Clipboard is not available in this browser.');
    }
  }

  // POST /{id}/youtube/provision (§6.4). force=true regenerates the broadcast.
  async function handleProvision(cls, force = false) {
    try {
      const updated = await provisionYoutube(cls.id, { force });
      replaceClass(updated);
      showToast('success', 'Stream provisioned', 'YouTube broadcast created and bound. OBS credentials are ready.');
    } catch (err) {
      const e = liveClassError(err);
      showToast('error', 'Provisioning failed', e.message);
    }
  }

  // POST /{id}/youtube/rotate-key (§6.4) — new stream key, same broadcast.
  async function handleRotateKey(cls) {
    if (!cls.youtube || !cls.youtube.provisioned_at) return;
    const ok = window.confirm('Rotate the stream key? This invalidates the key currently configured in OBS — the teacher will need to paste the new one.');
    if (!ok) return;
    try {
      const updated = await rotateYoutubeKey(cls.id);
      replaceClass(updated);
      setShowStreamKey(true);
      showToast('success', 'Key rotated', 'A new stream key was generated. Update OBS with the new key.');
    } catch (err) {
      const e = liveClassError(err);
      showToast('error', 'Rotate failed', e.message);
    }
  }

  function openStreamSetup(cls) {
    setShowStreamKey(false);
    setObsClassId(cls.id);
  }

  // Client-side guard only — list is already filtered server-side, but we keep a
  // local pass so the count + table stay in sync between reloads.
  const filteredClasses = useMemo(() => {
    let next = [...classesList];
    next.sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime());
    return next;
  }, [classesList]);

  // ── Pagination derivations ────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filteredClasses.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = filteredClasses.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endIndex = Math.min(safePage * pageSize, filteredClasses.length);
  const paginatedClasses = useMemo(
    () => filteredClasses.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredClasses, safePage, pageSize],
  );

  // Reset to the first page whenever the filters change the result set.
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, modeFilter]);

  async function handleAction(cls, actionName) {
    if (actionName === 'cancel') {
      try {
        await cancelLiveClass(cls.id);
        setClassesList((current) => current.filter((c) => c.id !== cls.id));
        showToast('success', 'Class Cancelled', `"${cls.title}" has been removed.`);
      } catch (err) {
        const e = liveClassError(err);
        showToast('error', 'Cancel failed', e.message);
      }
    } else if (actionName === 'launch') {
      try {
        const updated = await launchLiveClass(cls.id);
        replaceClass(updated);
        showToast('success', 'Class Live', `"${cls.title}" is now live.`);
      } catch (err) {
        const e = liveClassError(err);
        showToast('error', 'Launch failed', e.message);
      }
    } else if (actionName === 'end') {
      try {
        const updated = await endLiveClass(cls.id);
        replaceClass(updated);
        showToast('success', 'Class Ended', `"${cls.title}" has been completed.`);
      } catch (err) {
        const e = liveClassError(err);
        showToast('error', 'End failed', e.message);
      }
    } else if (actionName === 'feedback') {
      navigate('/feedback-summary');
    } else if (actionName === 'plan-activity') {
      navigate(`/live-class-activity-planner?classId=${cls.id}`);
    } else if (actionName === 'stream-setup') {
      openStreamSetup(cls);
    } else {
      showToast('info', 'Action Triggered', `Triggered ${actionName} for "${cls.title}".`);
    }
  }

  async function handleCreateSubmit(e) {
    e.preventDefault();
    if (!formTitle) return showToast('error', 'Error', 'Please enter a title.');
    if (!formIsInstant && !formScheduledAt) return showToast('error', 'Error', 'Please provide a schedule time.');

    const isYoutube = formMode === 'youtube';
    const body = {
      title: formTitle,
      host_name: formHost,
      participants_label: formParticipants,
      mode: formMode,
      is_instant: formIsInstant,
      duration_label: formDuration,
      strict_moderation: tglStrictModeration,
      auto_feedback: tglAutoFeedback,
      // webinar_mode is forced true server-side for youtube; ask_to_join ignored.
      webinar_mode: isYoutube ? true : tglWebinarMode,
      ask_to_join: isYoutube ? false : tglAskToJoin,
    };
    if (!formIsInstant) {
      body.scheduled_at = new Date(formScheduledAt).toISOString();
    }

    setSubmitting(true);
    try {
      const created = await createLiveClass(body);
      setClassesList((current) => [created, ...current.filter((c) => c.id !== created.id)]);
      setShowCreateModal(false);
      showToast('success', 'Class Created', `"${formTitle}" is successfully added.`);

      // For YouTube classes, surface the OBS setup panel right away.
      if (created.mode === 'youtube') {
        setShowStreamKey(false);
        setObsClassId(created.id);
      }

      // Reset form
      setFormTitle('');
      setFormIsInstant(false);
      setFormScheduledAt('');
    } catch (err) {
      const e = liveClassError(err);
      if (isYoutubeError(e.code)) {
        // The class row exists but YouTube provisioning failed — refresh and let
        // the admin retry via the "Provision stream" affordance.
        setShowCreateModal(false);
        showToast('error', 'Stream not provisioned', `${e.message} You can retry from the class's Stream Setup.`);
        loadClasses();
      } else if (e.fields) {
        const first = Object.values(e.fields)[0];
        showToast('error', 'Validation failed', first || e.message);
      } else {
        showToast('error', 'Could not create class', e.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const hasActiveFilters = searchQuery || statusFilter || modeFilter;

  function clearFilters() {
    setSearchQuery('');
    setStatusFilter('');
    setModeFilter('');
  }

  return (
    <section className="courses-list-page exam-attempt-report-page data-table-page" style={{ position: 'relative', minHeight: '100vh', paddingBottom: '40px' }}>
      <ToastRegion toasts={toasts} onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />

      {/* ── Standard Page Header ── */}
      <div className="page-header-section">
        <div className="page-header-title-group">
          <span className="page-header-icon-box"><Icon className="fa fa-video-camera" /></span>
          <div>
            <h2>Live Class Scheduler</h2>
            <p>Schedule, manage, and monitor live streaming classes and interactive webinars.</p>
          </div>
        </div>
        <button type="button" className="page-action-button" onClick={() => setShowCreateModal(true)}>
          <Icon className="ti ti-video-clapper" /> Schedule Live
        </button>
      </div>

      {/* ── Search bar + quick filters (standard) ── */}
      <div className="filter-bar">
        <div className="search-wrapper">
          <Icon className={`ti ${searchQuery ? 'ti-close' : 'ti-search'} search-icon`} onClick={() => setSearchQuery('')} aria-hidden="true" />
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
            { value: 'completed', label: 'Completed' },
          ]}
          onChange={(value) => setStatusFilter(value)}
        />
        <FilterDropdown
          label="All Modes"
          ariaLabel="Filter by mode"
          value={modeFilter}
          options={[
            { value: '', label: 'All Modes' },
            { value: 'system', label: 'System' },
            { value: 'youtube', label: 'YouTube' },
          ]}
          onChange={(value) => setModeFilter(value)}
        />
        {hasActiveFilters && (
          <button type="button" className="filter-clear-btn" onClick={clearFilters}>
            <Icon className="ti ti-reload" /> Clear
          </button>
        )}
      </div>

      {/* ── Table (Exam-attempt-report style) ── */}
      {loadError ? (
        <div className="ear-empty-state" style={{ background: 'white', border: '1px solid var(--line)', marginTop: '24px' }}>
          <Icon className="ti ti-alert-triangle" style={{ color: '#dc2626' }} />
          <h4>Couldn't load live classes</h4>
          <p>{loadError}</p>
          <button type="button" onClick={loadClasses} style={{ marginTop: '8px', background: '#006073', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
            <Icon className="ti ti-reload" /> Retry
          </button>
        </div>
      ) : (loading || filteredClasses.length > 0) ? (
        <div className="students-table-container" style={{ background: 'white', border: '1px solid var(--line)' }}>
          <table className={`students-table ${loading ? 'thead-loading' : ''}`}>
            <thead>
              <tr>
                <th>Title</th>
                <th>Host</th>
                <th>Participants</th>
                <th>Status</th>
                <th>Scheduled Time / Live</th>
                <th>Duration</th>
                <th>Mode</th>
                <th>Rating</th>
                <th style={{ width: 50 }}></th>
              </tr>
            </thead>
            {loading ? (
            <tbody>
              {Array.from({ length: 8 }, (_, i) => (
                <tr key={`sk-${i}`}>
                  {Array.from({ length: 9 }, (_, j) => (
                    <td key={j}><div className="table-skeleton medium" /></td>
                  ))}
                </tr>
              ))}
            </tbody>
            ) : (
            <tbody>
              {paginatedClasses.map((cls) => (
                <tr key={cls.id}>
                  <td>
                    <strong>{cls.title}</strong>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#006073', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px' }}>
                        {(cls.host_name || '??').slice(0, 2).toUpperCase()}
                      </div>
                      {cls.host_name}
                    </div>
                  </td>
                  <td className="ear-td-muted">
                    <span style={{ display: 'inline-block', background: '#f4f7f8', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}>
                      {cls.participants_label}
                    </span>
                  </td>
                  <td>
                    {cls.status === 'live' && <span className="status-pill status-danger"><span className="pulsing-dot" style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#dc2626', marginRight: '4px', animation: 'blink 1.5s infinite' }}></span>Live Now</span>}
                    {cls.status === 'scheduled' && <span className="status-pill status-upcoming">Scheduled</span>}
                    {cls.status === 'completed' && <span className="status-pill status-completed">Completed</span>}
                    {cls.status === 'cancelled' && <span className="status-pill status-inactive">Cancelled</span>}
                  </td>
                  <td className="ear-td-datetime">{formatDateTime(cls.scheduled_at)}</td>
                  <td>{cls.duration_label}</td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        {cls.mode === 'youtube' && <Icon className="ti ti-brand-youtube" style={{ color: '#dc2626' }} />}
                        {MODE_LABEL[cls.mode] || cls.mode}
                      </span>
                      {cls.mode === 'youtube' && (
                        cls.youtube && cls.youtube.provisioned_at ? (
                          <span style={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', color: '#0369a1', background: '#e0f2fe', padding: '2px 6px', borderRadius: '4px' }}>
                            {YT_LIFECYCLE_LABEL[cls.youtube.lifecycle_status] || 'Provisioned'}
                          </span>
                        ) : (
                          <span style={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', color: '#b45309', background: '#fef3c7', padding: '2px 6px', borderRadius: '4px' }}>
                            Not Provisioned
                          </span>
                        )
                      )}
                    </div>
                  </td>
                  <td><StarRating rating={cls.rating} /></td>
                  <td>
                    <KebabMenu cls={cls} onAction={handleAction} />
                  </td>
                </tr>
              ))}
            </tbody>
            )}
          </table>

          {/* Pagination */}
          <div className="pagination-container">
            <div className="pagination-info">
              <span>Showing {startIndex} to {endIndex} of {filteredClasses.length} entries</span>
              <select
                className="page-size-select"
                value={pageSize}
                onChange={(event) => { setPageSize(Number(event.target.value)); setCurrentPage(1); }}
              >
                {[20, 50, 100, 200].map((size) => <option key={size} value={size}>Show {size}</option>)}
              </select>
            </div>
            <div className="pagination-controls">
              <button type="button" className="pagination-btn" disabled={safePage === 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>
                <Icon className="ti ti-angle-left" /> Previous
              </button>
              {getPageNumbers(safePage, totalPages).map((page, index) => (
                page === '...'
                  ? <span key={`ellipsis-${index}`} className="pagination-ellipsis">...</span>
                  : (
                    <button
                      key={page}
                      type="button"
                      className={`pagination-btn${safePage === page ? ' active' : ''}`}
                      onClick={() => setCurrentPage(page)}
                    >
                      {page}
                    </button>
                  )
              ))}
              <button type="button" className="pagination-btn" disabled={safePage === totalPages} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}>
                Next <Icon className="ti ti-angle-right" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="ear-empty-state" style={{ background: 'white', border: '1px solid var(--line)', marginTop: '24px' }}>
          <Icon className="ti ti-search" />
          <h4>No Live Classes Found</h4>
          <p>No classes match your current filters. Schedule one to get started!</p>
        </div>
      )}

      {/* ── Create Modal ── */}
      {showCreateModal && (
        <div className="crispr-modal-backdrop active" role="presentation" onClick={() => setShowCreateModal(false)}>
          <div className="crispr-modal-dialog" style={{ maxWidth: '560px' }} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="crispr-modal-header">
              <h3><Icon className="ti ti-video-clapper" /> Schedule Live Class</h3>
              <button type="button" className="crispr-modal-close" onClick={() => setShowCreateModal(false)}>
                <Icon className="ti ti-close" />
              </button>
            </div>
            <form onSubmit={handleCreateSubmit} style={{ display: 'contents' }}>
              <div className="crispr-modal-body">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontWeight: 'bold', fontSize: '13px' }}>Class Title <span style={{ color: '#dc2626' }}>*</span></label>
                    <input
                      type="text"
                      className="ear-filter-input"
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      placeholder="e.g. Physics Revision Class"
                      autoFocus
                      required
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                      <label style={{ fontWeight: 'bold', fontSize: '13px' }}>Host / Instructor</label>
                      <select className="ear-filter-input" value={formHost} onChange={(e) => setFormHost(e.target.value)}>
                        {hostPool.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                      <label style={{ fontWeight: 'bold', fontSize: '13px' }}>Participants</label>
                      <select className="ear-filter-input" value={formParticipants} onChange={(e) => setFormParticipants(e.target.value)}>
                        {studentPool.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                      <label style={{ fontWeight: 'bold', fontSize: '13px' }}>Streaming Mode</label>
                      <select className="ear-filter-input" value={formMode} onChange={(e) => setFormMode(e.target.value)}>
                        <option value="system">System Integrated</option>
                        <option value="youtube">YouTube Live</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                      <label style={{ fontWeight: 'bold', fontSize: '13px' }}>Duration</label>
                      <input type="text" className="ear-filter-input" value={formDuration} onChange={(e) => setFormDuration(e.target.value)} placeholder="e.g. 1h 30m" />
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontWeight: 'bold', fontSize: '13px', display: 'flex', justifyContent: 'space-between' }}>
                      Schedule Time
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'normal', cursor: 'pointer' }}>
                        <input type="checkbox" checked={formIsInstant} onChange={(e) => setFormIsInstant(e.target.checked)} /> Go Live Instantly
                      </label>
                    </label>
                    <input
                      type="datetime-local"
                      className="ear-filter-input"
                      value={formScheduledAt}
                      onChange={(e) => setFormScheduledAt(e.target.value)}
                      disabled={formIsInstant}
                      style={{ opacity: formIsInstant ? 0.5 : 1 }}
                    />
                  </div>

                  <hr style={{ borderTop: '1px solid var(--line)', borderBottom: 'none', margin: '8px 0' }} />

                  <div style={{ fontWeight: 'bold', fontSize: '14px' }}>Advanced Settings</div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={tglStrictModeration} onChange={(e) => setTglStrictModeration(e.target.checked)} style={{ marginTop: '4px' }} />
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '13px' }}>Strict Moderation</div>
                        <div style={{ fontSize: '11px', color: '#59757b' }}>Chat is limited and actively moderated.</div>
                      </div>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={tglAutoFeedback} onChange={(e) => setTglAutoFeedback(e.target.checked)} style={{ marginTop: '4px' }} />
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '13px' }}>Auto Send Feedback</div>
                        <div style={{ fontSize: '11px', color: '#59757b' }}>Trigger survey at session end.</div>
                      </div>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: formMode === 'youtube' ? 'not-allowed' : 'pointer', opacity: formMode === 'youtube' ? 0.6 : 1 }}>
                      <input type="checkbox" checked={formMode === 'youtube' ? true : tglWebinarMode} disabled={formMode === 'youtube'} onChange={(e) => setTglWebinarMode(e.target.checked)} style={{ marginTop: '4px' }} />
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '13px' }}>Webinar Mode</div>
                        <div style={{ fontSize: '11px', color: '#59757b' }}>{formMode === 'youtube' ? 'Always on for YouTube Live (one-way).' : 'One-way video streaming.'}</div>
                      </div>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: formMode === 'youtube' ? 'not-allowed' : 'pointer', opacity: formMode === 'youtube' ? 0.6 : 1 }}>
                      <input type="checkbox" checked={formMode === 'youtube' ? false : tglAskToJoin} disabled={formMode === 'youtube'} onChange={(e) => setTglAskToJoin(e.target.checked)} style={{ marginTop: '4px' }} />
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '13px' }}>Ask To Join</div>
                        <div style={{ fontSize: '11px', color: '#59757b' }}>{formMode === 'youtube' ? 'Not applicable to YouTube Live.' : 'Host manual admission.'}</div>
                      </div>
                    </label>
                  </div>

                </div>
              </div>
              <div className="crispr-modal-footer">
                <button type="button" className="btn btn-default" onClick={() => setShowCreateModal(false)}>
                  <Icon className="ti ti-close" /> Cancel
                </button>
                <button type="submit" className="btn btn-success" disabled={submitting}>
                  <Icon className="ti ti-check" /> {submitting ? 'Saving…' : (formIsInstant ? 'Launch Live Now' : 'Schedule Class')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── OBS / YouTube Stream Setup Panel ── */}
      {obsClass && (
        <div className="ear-modal-scrim" style={{ zIndex: 9999, background: 'rgba(0,0,0,0.6)' }} role="presentation" onClick={() => setObsClassId(null)}>
          <div className="ear-modal" style={{ maxWidth: '620px' }} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="ear-modal-header" style={{ background: '#1f2937', color: 'white' }}>
              <h3><Icon className="ti ti-brand-youtube" style={{ color: '#f87171' }} /> Stream Setup &mdash; {obsClass.title}</h3>
              <button type="button" className="ear-modal-close" style={{ color: 'white' }} onClick={() => setObsClassId(null)}>
                <Icon className="ti ti-close" />
              </button>
            </div>
            <div className="ear-modal-body" style={{ padding: '24px' }}>
              {(!obsClass.youtube || !obsClass.youtube.provisioned_at) ? (
                /* Not provisioned → Provision / Retry (§6.4) */
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', textAlign: 'center', padding: '20px' }}>
                  <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#fef3c7', color: '#b45309', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '26px' }}>
                    <Icon className="ti ti-alert-triangle" />
                  </div>
                  <div style={{ fontWeight: 'bold', fontSize: '16px' }}>Stream not provisioned</div>
                  <div style={{ fontSize: '13px', color: '#59757b', maxWidth: '380px' }}>
                    This YouTube class has no broadcast yet. Provision the stream to generate the OBS server URL and stream key the teacher needs.
                  </div>
                  <button type="button" onClick={() => handleProvision(obsClass)} style={{ background: '#006073', color: 'white', border: 'none', padding: '12px 22px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Icon className="ti ti-bolt" /> Provision Stream
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Status row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 14px' }}>
                    <span style={{ fontSize: '13px', color: '#166534', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Icon className="ti ti-circle-check" /> Provisioned &middot; Privacy: <strong>Unlisted</strong>
                    </span>
                    <span style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#0369a1', background: '#e0f2fe', padding: '3px 8px', borderRadius: '4px' }}>
                      {YT_LIFECYCLE_LABEL[obsClass.youtube.lifecycle_status] || 'Ready'}
                    </span>
                  </div>

                  <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#1f2937' }}>OBS Studio configuration</div>

                  {/* RTMP server URL */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontWeight: 'bold', fontSize: '12px', color: '#59757b' }}>Server (RTMP URL)</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input readOnly value={obsClass.youtube.rtmp_url || ''} style={{ flex: 1, border: '1px solid var(--line)', borderRadius: '8px', padding: '10px 12px', fontFamily: 'monospace', fontSize: '13px', background: '#f8fafc' }} />
                      <button type="button" onClick={() => copyToClipboard(obsClass.youtube.rtmp_url, 'RTMP URL')} style={{ border: '1px solid var(--line)', background: 'white', padding: '0 14px', borderRadius: '8px', cursor: 'pointer' }} title="Copy"><Icon className="ti ti-copy" /></button>
                    </div>
                  </div>

                  {/* Stream key (masked) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontWeight: 'bold', fontSize: '12px', color: '#59757b' }}>Stream Key <span style={{ color: '#dc2626' }}>(secret)</span></label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input readOnly value={showStreamKey ? (obsClass.youtube.stream_key || '') : maskKey(obsClass.youtube.stream_key)} style={{ flex: 1, border: '1px solid var(--line)', borderRadius: '8px', padding: '10px 12px', fontFamily: 'monospace', fontSize: '13px', background: '#f8fafc', letterSpacing: showStreamKey ? 'normal' : '1px' }} />
                      <button type="button" onClick={() => setShowStreamKey((v) => !v)} style={{ border: '1px solid var(--line)', background: 'white', padding: '0 14px', borderRadius: '8px', cursor: 'pointer' }} title={showStreamKey ? 'Hide' : 'Reveal'}>
                        <Icon className={showStreamKey ? 'ti ti-eye-off' : 'ti ti-eye'} />
                      </button>
                      <button type="button" onClick={() => copyToClipboard(obsClass.youtube.stream_key, 'Stream key')} style={{ border: '1px solid var(--line)', background: 'white', padding: '0 14px', borderRadius: '8px', cursor: 'pointer' }} title="Copy"><Icon className="ti ti-copy" /></button>
                    </div>
                  </div>

                  <hr style={{ borderTop: '1px solid var(--line)', borderBottom: 'none', margin: '4px 0' }} />

                  {/* Watch / embed */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontWeight: 'bold', fontSize: '12px', color: '#59757b' }}>Embed URL (students)</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input readOnly value={obsClass.youtube.embed_url || ''} style={{ flex: 1, border: '1px solid var(--line)', borderRadius: '8px', padding: '10px 12px', fontFamily: 'monospace', fontSize: '13px', background: '#f8fafc' }} />
                      <button type="button" onClick={() => copyToClipboard(obsClass.youtube.embed_url, 'Embed URL')} style={{ border: '1px solid var(--line)', background: 'white', padding: '0 14px', borderRadius: '8px', cursor: 'pointer' }} title="Copy"><Icon className="ti ti-copy" /></button>
                    </div>
                  </div>

                  <div style={{ fontSize: '11px', color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '10px 12px', display: 'flex', gap: '8px' }}>
                    <Icon className="ti ti-shield-lock" style={{ marginTop: '1px' }} />
                    <span>The RTMP URL and stream key are secrets &mdash; share them only with the host. The Unlisted broadcast is link-accessible, so never expose the embed URL outside the class audience.</span>
                  </div>
                </div>
              )}
            </div>
            <div className="ear-modal-footer">
              {obsClass.youtube && obsClass.youtube.provisioned_at && (
                <>
                  <button type="button" className="ear-btn-default" onClick={() => handleRotateKey(obsClass)}>
                    <Icon className="ti ti-refresh" /> Rotate Key
                  </button>
                  <button type="button" className="ear-btn-default" onClick={() => { setShowStreamKey(false); handleProvision(obsClass, true); }}>
                    <Icon className="ti ti-reload" /> Re-provision
                  </button>
                </>
              )}
              <button type="button" style={{ background: '#006073', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }} onClick={() => setObsClassId(null)}>Done</button>
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes blink {
          0% { opacity: 1; }
          50% { opacity: 0.4; }
          100% { opacity: 1; }
        }
      `}} />
    </section>
  );
}
