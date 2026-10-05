import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import ToastRegion from '../components/ToastRegion';
import { Can } from '../lib/userStore';
import { PERMS } from '../lib/permissions';
import {
  listDefaultLocations, createDefaultLocation, updateDefaultLocation, deleteDefaultLocation,
} from '../lib/attendanceDefaultLocationApi';
import { listBatches, listCandidates } from '../lib/icardApi';
import { listLocations } from '../lib/locationsApi';
import { searchInstructors } from '../lib/instructorsApi';
import { listUsers } from '../lib/userAccountsApi';
import useDebouncedValue from '../hooks/useDebouncedValue';

const PAGE_SIZE_OPTIONS = [20, 50, 100, 200];

// Audiences. Students map by BATCH; everyone else maps by individual person.
const AUDIENCES = [
  { key: 'STUDENTS', userType: 1, subjectType: 'batch', label: 'Batches', icon: 'ti-layers' },
  { key: 'INSTRUCTORS', userType: 2, subjectType: 'user', label: 'Instructors', icon: 'ti-blackboard' },
  { key: 'MENTORS', userType: 3, subjectType: 'user', label: 'Mentors', icon: 'ti-headphone-alt' },
  { key: 'STAFF', userType: 4, subjectType: 'user', label: 'Users', icon: 'ti-id-badge' },
];

const USER_TYPES = { 1: 'Student', 2: 'Instructor', 3: 'Mentor', 4: 'Staff' };

// When to auto-notify parents about a batch's absentees. Students/batches only.
const NOTIFY_OPTIONS = [
  { value: 'none', label: 'Do not auto-notify' },
  { value: 'notify_7pm', label: 'Notify at 7pm' },
  { value: 'notify_1pm', label: 'Notify at 1pm' },
  { value: 'notify_first_class', label: 'Notify once the First Class at Center Started' },
];

function notifyLabel(value) {
  return NOTIFY_OPTIONS.find((o) => o.value === value)?.label || 'Do not auto-notify';
}

function audienceForUserType(userType, subjectType) {
  if (subjectType === 'batch' || Number(userType) === 1) return AUDIENCES[0];
  return AUDIENCES.find((a) => a.userType === Number(userType)) || AUDIENCES[1];
}

function apiErrorMessage(error, fallback) {
  const body = error?.response?.data;
  return body?.error?.message || body?.message || error?.message || fallback;
}

function getPageNumbers(currentPage, totalPages) {
  const out = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i += 1) out.push(i);
    return out;
  }
  if (currentPage <= 4) {
    out.push(1, 2, 3, 4, 5, '...', totalPages);
  } else if (currentPage >= totalPages - 3) {
    out.push(1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
  } else {
    out.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages);
  }
  return out;
}

// Unified person search for the non-student audiences.
async function searchPeople(audienceKey, query) {
  const q = (query || '').trim();
  if (audienceKey === 'INSTRUCTORS') {
    const { items } = await searchInstructors({ page: 1, size: 20, searchKey: q });
    return (items || []).map((i) => ({ id: i.id, name: i.name || 'Unknown', detail: i.subject || i.specialization || '' }));
  }
  if (audienceKey === 'MENTORS') {
    const resp = await api.get('/admin/people/mentor/list', {
      params: { page: 1, size: 20, sortBy: 'name', searchKey: q || undefined },
    });
    return (resp.data?.data || []).map((m) => ({ id: m.id, name: m.name || 'Unknown', detail: m.specialization || '' }));
  }
  // STAFF / Users
  const resp = await listUsers({ page: 1, size: 20, searchKey: q || undefined });
  return (resp?.data || []).map((u) => ({ id: u.id, name: u.name || 'Unknown', detail: u.email || '' }));
}

export default function DefaultAttendanceLocationPage() {
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebouncedValue(searchQuery);
  const [audienceFilter, setAudienceFilter] = useState(''); // '' | audience key

  const [showAddModal, setShowAddModal] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Row kebab menu
  const [activeKebabId, setActiveKebabId] = useState(null);
  const kebabRef = useRef(null);

  function toggleKebab(id, event) {
    event.stopPropagation();
    setActiveKebabId((cur) => (cur === id ? null : id));
  }

  useEffect(() => {
    const handleClick = (event) => {
      if (kebabRef.current && !kebabRef.current.contains(event.target)) {
        setActiveKebabId(null);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const [locations, setLocations] = useState([]);

  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);

  const showToast = useCallback((type, title, message) => {
    const id = toastIdRef.current + 1;
    toastIdRef.current = id;
    setToasts((cur) => [...cur, { id, type, title, message }]);
    window.setTimeout(() => setToasts((cur) => cur.filter((t) => t.id !== id)), 4500);
  }, []);

  // ── Load locations ────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await api.get('/admin/location/list', { params: { size: 100 } });
        if (!cancelled) {
          const rows = resp.data?.data || resp.data?.locations || resp.data || [];
          setLocations(Array.isArray(rows) ? rows : []);
        }
      } catch (_e) { /* silent — locations endpoint optional */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const selectedAudience = useMemo(
    () => AUDIENCES.find((a) => a.key === audienceFilter) || null,
    [audienceFilter],
  );

  // ── Load mappings ─────────────────────────────────────────────────────────
  const loadMappings = useCallback(async (signal = { cancelled: false }) => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const resp = await listDefaultLocations({
        search: debouncedSearchQuery.trim() || undefined,
        subjectType: selectedAudience?.subjectType || undefined,
        userType: selectedAudience?.userType || undefined,
        page,
        size: pageSize,
      });
      if (signal.cancelled) return;

      const rows = resp?.data || [];
      const meta = resp?.pagination || {};
      setRecords(Array.isArray(rows) ? rows : []);
      const tot = Number(meta.total ?? (Array.isArray(rows) ? rows.length : 0));
      setTotal(tot);
      setTotalPages(Number(meta.lastPage ?? Math.max(1, Math.ceil(tot / pageSize))));
    } catch (error) {
      if (signal.cancelled) return;
      setRecords([]);
      setTotal(0);
      setTotalPages(1);
      const msg = apiErrorMessage(error, 'Failed to load default attendance locations.');
      setLoadError(msg);
      showToast('error', 'Network Error', msg);
    } finally {
      if (!signal.cancelled) setIsLoading(false);
    }
  }, [debouncedSearchQuery, selectedAudience, page, pageSize, showToast]);

  useEffect(() => {
    const signal = { cancelled: false };
    const timer = setTimeout(() => loadMappings(signal), 250);
    return () => { signal.cancelled = true; clearTimeout(timer); };
  }, [loadMappings]);

  useEffect(() => { setPage(1); }, [searchQuery, audienceFilter, pageSize]);

  const safePage = Math.min(page, totalPages);
  const showingStart = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const showingEnd = Math.min(safePage * pageSize, total);
  const hasActiveFilters = !!searchQuery || !!audienceFilter;

  function clearFilters() {
    setSearchQuery('');
    setAudienceFilter('');
  }

  function locationName(id) {
    const l = locations.find((x) => String(x.id ?? x.code) === String(id));
    return l?.name || l?.title || l?.code || `#${id}`;
  }

  // Resolve a record's location list into display names, honouring "Any".
  function recordLocationNames(r) {
    if (r.anyLocation) return 'Any';
    const explicit = Array.isArray(r.locations) ? r.locations.map((l) => l.name || l.title || locationName(l.id)) : null;
    if (explicit && explicit.length) return explicit.join(', ');
    const ids = Array.isArray(r.locationIds) ? r.locationIds : [];
    if (ids.length) return ids.map((id) => locationName(id)).join(', ');
    return '—';
  }

  function subjectLabel(r) {
    return r.subjectLabel || r.batchName || r.name || (r.subjectId != null ? `#${r.subjectId}` : '—');
  }

  function openEdit(row) {
    setActiveKebabId(null);
    setEditRecord(row);
    setShowAddModal(true);
  }

  function closeModal() {
    setShowAddModal(false);
    setEditRecord(null);
  }

  async function handleAddSubmit(payload) {
    setSubmitting(true);
    try {
      if (editRecord) {
        await updateDefaultLocation(editRecord.id, {
          anyLocation: payload.anyLocation,
          locationIds: payload.locationIds,
        });
        showToast('success', 'Mapping Updated', 'Default attendance location updated.');
      } else {
        await createDefaultLocation(payload);
        showToast('success', 'Mapping Saved', 'Default attendance location saved.');
      }
      closeModal();
      loadMappings();
    } catch (error) {
      showToast('error', 'Failed to Save', apiErrorMessage(error, 'Failed to save mapping.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(row) {
    setActiveKebabId(null);
    if (!window.confirm(`Remove the default location mapping for ${subjectLabel(row)}?`)) return;
    try {
      await deleteDefaultLocation(row.id);
      showToast('success', 'Mapping Removed', 'Default attendance location removed.');
      loadMappings();
    } catch (error) {
      showToast('error', 'Failed to Remove', apiErrorMessage(error, 'Failed to remove mapping.'));
    }
  }

  return (
    <div className="quiz-attempt-report-page data-table-page">
      <ToastRegion toasts={toasts} onDismiss={(id) => setToasts((cur) => cur.filter((t) => t.id !== id))} />

      {/* ── Standard Page Header ── */}
      <div className="page-header-section">
        <div className="page-header-title-group">
          <span className="page-header-icon-box"><i className="fa fa-map-marker" /></span>
          <div>
            <h2>Attendance Capture Locations</h2>
            <p>Set the default location used to mark each batch or person present, since they may swipe at multiple locations.</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="page-back-button" onClick={() => navigate('/offline-attendance')}>
            <i className="ti ti-angle-left" /> Back to Attendance
          </button>
          <Can permission={PERMS.ATTENDANCE_MAPPING_EDIT}>
            <button type="button" className="page-action-button" onClick={() => setShowAddModal(true)}>
              <i className="ti ti-plus" /> Add Mapping
            </button>
          </Can>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="filter-bar">
        <style>{`
          .am-combo { display:flex; align-items:stretch; flex:0 1 auto; width:380px; max-width:100%; min-height:40px; border:1px solid var(--line,#d7e5e8); border-radius:8px; background:#fff; overflow:hidden; transition:width .28s ease; }
          .am-combo.collapsed { width:auto; }
          .am-combo.collapsed .am-combo-select { border-right:none; border-radius:8px; padding-right:28px; }
          .am-combo-select { border:none; background:#f3f8f9; border-right:1px solid var(--line,#d7e5e8); padding:0 14px 0 12px; font-size:13px; font-weight:600; color:var(--ink,#16353c); cursor:pointer; outline:none; max-width:170px; }
          .am-combo-field { display:flex; flex:1; align-items:stretch; overflow:hidden; animation:amComboReveal .3s ease; }
          @keyframes amComboReveal { from { opacity:0; max-width:0; transform:translateX(-8px); } to { opacity:1; max-width:300px; transform:none; } }
          .am-combo-icon { display:flex; align-items:center; padding:0 12px; border:none; background:transparent; color:#94a3b8; }
          .am-combo-icon.clearable { cursor:pointer; color:#64748b; }
          .am-combo-input { flex:1; border:none; outline:none; padding:10px 12px; font-size:13px; color:var(--ink,#16353c); background:transparent; min-width:0; }
        `}</style>
        <div className={`am-combo${audienceFilter ? '' : ' collapsed'}`}>
          <select className="am-combo-select" value={audienceFilter} onChange={(e) => { const v = e.target.value; setAudienceFilter(v); if (!v) setSearchQuery(''); }}>
            <option value="">All Audiences</option>
            {AUDIENCES.map((a) => (
              <option key={a.key} value={a.key}>{a.label}</option>
            ))}
          </select>
          {audienceFilter && (
            <div className="am-combo-field">
              <input
                type="text"
                className="am-combo-input"
                placeholder="Search by batch or person name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button
                type="button"
                className={`am-combo-icon${searchQuery ? ' clearable' : ''}`}
                onClick={() => { if (searchQuery) setSearchQuery(''); }}
                tabIndex={searchQuery ? 0 : -1}
                aria-label={searchQuery ? 'Clear search' : 'Search'}
              >
                <i className={`ti ${searchQuery ? 'ti-close' : 'ti-search'}`} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Add / Edit Mapping Modal ── */}
      {showAddModal && (
        <AddDefaultLocationModal
          submitting={submitting}
          editRecord={editRecord}
          onClose={closeModal}
          onSubmit={handleAddSubmit}
        />
      )}

      {/* ── Table ── */}
      {isLoading ? (
        <div className="students-table-container">
          <table className="students-table thead-loading">
            <thead>
              <tr>
                <th>Audience</th>
                <th>Batch / Person</th>
                <th>Capture Attendance at</th>
                <th>Auto-Notify</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }, (_, i) => (
                <tr key={`sk-${i}`}>
                  {Array.from({ length: 5 }, (_, j) => (
                    <td key={j}><div className="table-skeleton medium" /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : records.length > 0 ? (
        <div className="students-table-container">
          <table className="students-table">
            <thead>
              <tr>
                <th>Audience</th>
                <th>Batch / Person</th>
                <th>Capture Attendance at</th>
                <th>Auto-Notify</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody ref={kebabRef}>
              {records.map((r, idx) => {
                const aud = audienceForUserType(r.userType, r.subjectType);
                const isBatch = aud.subjectType === 'batch';
                return (
                  <tr key={r.id ?? `${r.subjectId ?? 'row'}-${idx}`} className={activeKebabId === r.id ? 'row-active-menu' : ''}>
                    <td>{aud.label}</td>
                    <td><strong>{subjectLabel(r)}</strong></td>
                    <td>
                      {r.anyLocation
                        ? <span>Any location</span>
                        : recordLocationNames(r)}
                    </td>
                    <td>{isBatch ? notifyLabel(r.notifySchedule) : '—'}</td>
                    <td className={`center-align ${activeKebabId === r.id ? 'cell-active-menu' : ''}`}>
                      <Can permission={PERMS.ATTENDANCE_MAPPING_EDIT}>
                        <div className="kebab-menu-container">
                          <button type="button" className="kebab-button" onClick={(event) => toggleKebab(r.id, event)}>
                            <i className="ti ti-more-alt" />
                          </button>
                          <div className={`kebab-dropdown ${activeKebabId === r.id ? 'active' : ''}`}>
                            <button type="button" className="kebab-dropdown-item edit-action" onClick={() => openEdit(r)}>
                              <i className="ti ti-pencil" />
                              <span className="item-label">Edit</span>
                            </button>
                            <button type="button" className="kebab-dropdown-item delete-action" onClick={() => handleDelete(r)}>
                              <i className="ti ti-trash" />
                              <span className="item-label">Remove</span>
                            </button>
                          </div>
                        </div>
                      </Can>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="pagination-container">
            <div className="pagination-info">
              <span>Showing {showingStart} to {showingEnd} of {total} entries</span>
              <select className="page-size-select" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                {PAGE_SIZE_OPTIONS.map((s) => <option key={s} value={s}>Show {s}</option>)}
              </select>
            </div>
            <div className="pagination-controls">
              <button type="button" className="pagination-btn" disabled={safePage === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                <i className="ti ti-angle-left" /> Previous
              </button>
              {getPageNumbers(safePage, totalPages).map((p, idx) => (
                p === '...' ? (
                  <span key={`el-${idx}`} className="pagination-ellipsis">...</span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    className={`pagination-btn${safePage === p ? ' active' : ''}`}
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </button>
                )
              ))}
              <button type="button" className="pagination-btn" disabled={safePage === totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                Next <i className="ti ti-angle-right" />
              </button>
            </div>
          </div>
        </div>
      ) : loadError ? (
        <div className="qar-empty-state">
          <i className="ti ti-alert" />
          <h4>Unable to load mappings</h4>
          <p>{loadError}</p>
          <button type="button" className="qar-btn-export" style={{ marginTop: 12 }} onClick={() => loadMappings()}>
            <i className="ti ti-reload" /> Retry
          </button>
        </div>
      ) : (
        <div className="qar-empty-state">
          <i className="ti ti-map-pin" />
          <h4>No Default Locations Set</h4>
          {hasActiveFilters
            ? <p>Try adjusting your filters.</p>
            : <p>Map a batch or person to their default attendance location to get started.</p>}
        </div>
      )}
    </div>
  );
}

// ── Add / Edit modal: pick audience → batch (students) or person → multi-select locations ──
function AddDefaultLocationModal({ submitting, editRecord, onClose, onSubmit }) {
  const isEditing = !!editRecord;

  const [audienceKey, setAudienceKey] = useState(
    () => (editRecord ? audienceForUserType(editRecord.userType, editRecord.subjectType).key : 'STUDENTS'),
  );
  const audience = AUDIENCES.find((a) => a.key === audienceKey) || AUDIENCES[0];

  // Subject (batch for students, person otherwise)
  const [subject, setSubject] = useState(
    () => (editRecord
      ? { id: editRecord.subjectId, name: editRecord.subjectLabel || editRecord.batchName || editRecord.name || `#${editRecord.subjectId}` }
      : null),
  );
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [subjectOpen, setSubjectOpen] = useState(false);
  const subjectBoxRef = useRef(null);

  // Locations (server-side typeahead multi-select). Selection holds full
  // { id, name } objects so chips render even for ids not in the search page.
  const [anyLocation, setAnyLocation] = useState(() => !!editRecord?.anyLocation);
  const [selectedLocs, setSelectedLocs] = useState(() => {
    if (!editRecord || editRecord.anyLocation) return [];
    if (Array.isArray(editRecord.locations) && editRecord.locations.length) {
      return editRecord.locations.map((l) => ({ id: l.id, name: l.name || l.title || `#${l.id}` }));
    }
    return Array.isArray(editRecord.locationIds) ? editRecord.locationIds.map((id) => ({ id, name: `#${id}` })) : [];
  });
  const [locSearch, setLocSearch] = useState('');
  const [locResults, setLocResults] = useState([]);
  const [locLoading, setLocLoading] = useState(false);
  const [locOpen, setLocOpen] = useState(false);
  const locBoxRef = useRef(null);

  // Auto-notify schedule (students / batches only)
  const [notifySchedule, setNotifySchedule] = useState(() => editRecord?.notifySchedule || 'none');

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Reset subject + reload subject list when the audience changes (create mode only).
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    setSubject(null);
    setQuery('');
    setSubjectOpen(false);
  }, [audienceKey]);

  // Debounced subject search (batches for students, people otherwise).
  useEffect(() => {
    if (isEditing) return undefined;
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        let rows;
        if (audience.subjectType === 'batch') {
          const resp = await listBatches({ page: 1, size: 50, searchKey: query.trim() || undefined });
          rows = (resp?.data || []).map((b) => ({ id: b.id, name: b.name || `Batch ${b.id}`, detail: b.description || '' }));
        } else if (audienceKey === 'STUDENTS') {
          const resp = await listCandidates({ page: 1, size: 20, searchKey: query.trim() || undefined });
          rows = (resp?.data || []).map((c) => ({ id: c.id, name: c.name || 'Unknown', detail: '' }));
        } else {
          rows = await searchPeople(audienceKey, query);
        }
        if (!cancelled) setResults(rows);
      } catch (_e) {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [audienceKey, audience.subjectType, query]);

  const locName = useCallback((l) => l.name || l.title || l.code || `#${l.id ?? l.code}`, []);

  // Server-side location search (debounced) while the dropdown is open.
  useEffect(() => {
    if (anyLocation || !locOpen) return undefined;
    let cancelled = false;
    setLocLoading(true);
    const t = setTimeout(async () => {
      try {
        const resp = await listLocations({
          page: 1, size: 20, filterBy: 'all',
          ...(locSearch.trim() ? { searchKey: locSearch.trim() } : {}),
        });
        if (!cancelled) setLocResults(resp?.data || []);
      } catch (_e) {
        if (!cancelled) setLocResults([]);
      } finally {
        if (!cancelled) setLocLoading(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [locSearch, locOpen, anyLocation]);

  // Suggestions exclude already-selected.
  const selectedIdSet = useMemo(() => new Set(selectedLocs.map((l) => String(l.id))), [selectedLocs]);
  const locSuggestions = useMemo(
    () => locResults.filter((l) => !selectedIdSet.has(String(l.id ?? l.code))),
    [locResults, selectedIdSet],
  );

  function addLocation(loc) {
    const id = loc.id ?? loc.code;
    setSelectedLocs((cur) => (cur.some((l) => String(l.id) === String(id)) ? cur : [...cur, { id, name: locName(loc) }]));
    setLocSearch('');
    setLocOpen(false);
  }

  function removeLocation(id) {
    setSelectedLocs((cur) => cur.filter((l) => String(l.id) !== String(id)));
  }

  // Close the typeahead dropdown when clicking outside.
  useEffect(() => {
    function onDown(e) {
      if (locBoxRef.current && !locBoxRef.current.contains(e.target)) setLocOpen(false);
      if (subjectBoxRef.current && !subjectBoxRef.current.contains(e.target)) setSubjectOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const canSubmit = !!subject && (anyLocation || selectedLocs.length > 0) && !submitting;

  function submit() {
    onSubmit({
      subjectType: audience.subjectType,
      subjectId: subject.id,
      userType: audience.userType,
      anyLocation,
      locationIds: anyLocation ? undefined : selectedLocs.map((l) => Number(l.id)),
      notifySchedule: audience.subjectType === 'batch' ? notifySchedule : undefined,
    });
  }

  const subjectNoun = audience.subjectType === 'batch' ? 'batch' : audience.label.toLowerCase().replace(/s$/, '');

  const captionStyle = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, letterSpacing: '0.2px', color: '#64748b', marginBottom: 6 };

  return (
    <div
      className="legacy-modal-backdrop active"
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <style>{`
        .dal-tabs { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:16px; }
        .dal-tab { display:inline-flex; align-items:center; gap:6px; padding:7px 12px; border:1px solid var(--line,#d7e5e8); border-radius:8px; background:#fff; cursor:pointer; font-size:12px; font-weight:600; color:var(--ink,#16353c); }
        .dal-tab.active { background:var(--brand,#006073); border-color:var(--brand,#006073); color:#fff; }
        .dal-list { max-height:200px; overflow-y:auto; border:1px solid #e2e8f0; border-radius:10px; }
        .dal-row { display:flex; align-items:center; gap:12px; padding:10px 14px; border-bottom:1px solid #f1f5f8; cursor:pointer; }
        .dal-row:last-child { border-bottom:none; }
        .dal-row:hover { background:#f8fafc; }
        .dal-check { width:18px; height:18px; border:1.5px solid #cbd5e1; border-radius:5px; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; color:#fff; font-size:11px; }
        .dal-check.on { background:#006073; border-color:#006073; }
        .dal-radio { border-radius:50%; }
        .dal-name { font-weight:600; font-size:14px; color:#16353c; }
        .dal-detail { font-size:12px; color:#6c757d; }
        .dal-any { display:flex; align-items:center; gap:10px; padding:10px 0; cursor:pointer; font-size:13px; font-weight:600; color:#16353c; }
        .dal-typeahead { position:relative; }
        .dal-chips { display:flex; flex-wrap:wrap; gap:6px; }
        .dal-chip { display:inline-flex; align-items:center; gap:6px; background:#eef4f5; border-radius:14px; padding:4px 10px; font-size:12px; font-weight:600; color:#16353c; }
        .dal-chip i { cursor:pointer; color:#6c757d; }
        .dal-suggestions { position:absolute; left:0; right:0; top:100%; margin-top:4px; z-index:20; background:#fff; border:1px solid #e2e8f0; border-radius:10px; box-shadow:0 8px 24px rgba(16,53,60,.12); max-height:220px; overflow-y:auto; }
      `}</style>
      <div className="legacy-modal-dialog" style={{ maxWidth: 640 }} role="dialog" aria-modal="true">
        <div className="legacy-modal-header">
          <h3><i className="ti ti-map-pin" /> Attendance Capture Location</h3>
          <button type="button" className="legacy-modal-close" onClick={onClose}>
            <i className="ti ti-close" />
          </button>
        </div>
        <form className="batch-modal-form form-modal" onSubmit={(e) => { e.preventDefault(); if (canSubmit) submit(); }}>
          <div className="legacy-modal-body">
            <div className="asset-form-section">
              <div className="asset-form-section-title"><i className="ti ti-users" /> Audience &amp; Subject</div>
              {isEditing ? (
                /* Audience + subject are fixed when editing — only locations change. */
                <div>
                  <span style={captionStyle}><i className={`ti ${audience.icon}`} /> {audience.label}</span>
                  <div className="dal-row" style={{ border: '1px solid #cbd5e1', borderRadius: 8, cursor: 'default' }}>
                    <i className="ti ti-user" style={{ color: '#64748b' }} />
                    <div className="dal-name">{subject?.name}</div>
                  </div>
                </div>
              ) : (
                <>
                  {/* Audience */}
                  <div className="dal-tabs">
                    {AUDIENCES.map((a) => (
                      <button
                        key={a.key}
                        type="button"
                        className={`dal-tab${audienceKey === a.key ? ' active' : ''}`}
                        onClick={() => setAudienceKey(a.key)}
                      >
                        <i className={`ti ${a.icon}`} /> {a.label}
                      </button>
                    ))}
                  </div>

                  {/* Subject picker */}
                  <span style={captionStyle}><i className="ti ti-search" /> {audience.subjectType === 'batch' ? 'Batch' : audience.label.replace(/s$/, '')} <span className="req">*</span></span>
                  <div className="dal-typeahead" ref={subjectBoxRef}>
                    <div className="search-wrapper">
                      <i className="ti ti-search search-icon" />
                      <input
                        type="text"
                        className="search-input"
                        value={subject ? subject.name : query}
                        onChange={(e) => { setQuery(e.target.value); if (subject) setSubject(null); setSubjectOpen(true); }}
                        onFocus={() => setSubjectOpen(true)}
                        placeholder={`Search ${subjectNoun}…`}
                      />
                      {(subject || query) && (
                        <i
                          className="ti ti-close search-icon"
                          style={{ left: 'auto', right: 12, cursor: 'pointer' }}
                          onClick={() => { setSubject(null); setQuery(''); setSubjectOpen(true); }}
                          aria-label="Clear selection"
                        />
                      )}
                    </div>
                    {subjectOpen && (
                      <div className="dal-suggestions">
                        {searching ? (
                          <div style={{ padding: '12px 14px', color: '#6c757d', fontSize: 13 }}>Searching…</div>
                        ) : results.length === 0 ? (
                          <div style={{ padding: '12px 14px', color: '#6c757d', fontSize: 13 }}>Nothing found.</div>
                        ) : results.map((p) => {
                          const checked = subject?.id === p.id;
                          return (
                            <div key={p.id} className="dal-row" onClick={() => { setSubject({ id: p.id, name: p.name }); setQuery(''); setSubjectOpen(false); }}>
                              <span className={`dal-check dal-radio${checked ? ' on' : ''}`}>{checked && <i className="ti ti-check" />}</span>
                              <div>
                                <div className="dal-name">{p.name}</div>
                                {p.detail ? <div className="dal-detail">{p.detail} · ID: {p.id}</div> : <div className="dal-detail">ID: {p.id}</div>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Locations */}
            <div className="asset-form-section">
              <div className="asset-form-section-title"><i className="ti ti-location-pin" /> Locations to Capture Attendance</div>
              <div
                className="dal-any"
                onClick={() => setAnyLocation((v) => !v)}
                role="checkbox"
                aria-checked={anyLocation}
                style={{ paddingTop: 0 }}
              >
                <span className={`dal-check${anyLocation ? ' on' : ''}`}>{anyLocation && <i className="ti ti-check" />}</span>
                At any location
              </div>
              {!anyLocation && (
                <div className="dal-typeahead" ref={locBoxRef}>
                  {selectedLocs.length > 0 && (
                    <div className="dal-chips">
                      {selectedLocs.map((l) => (
                        <span key={String(l.id)} className="dal-chip">
                          {l.name}
                          <i className="ti ti-close" onClick={() => removeLocation(l.id)} />
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="search-wrapper" style={{ margin: '8px 0 0' }}>
                    <i className="ti ti-search search-icon" />
                    <input
                      type="text"
                      className="search-input"
                      value={locSearch}
                      onChange={(e) => { setLocSearch(e.target.value); setLocOpen(true); }}
                      onFocus={() => setLocOpen(true)}
                      placeholder="Type to search locations…"
                    />
                  </div>
                  {locOpen && (
                    <div className="dal-suggestions">
                      {locLoading ? (
                        <div style={{ padding: '12px 14px', color: '#6c757d', fontSize: 13 }}>Searching…</div>
                      ) : locSuggestions.length === 0 ? (
                        <div style={{ padding: '12px 14px', color: '#6c757d', fontSize: 13 }}>No locations found.</div>
                      ) : locSuggestions.map((l) => {
                        const id = String(l.id ?? l.code);
                        return (
                          <div key={id} className="dal-row" onClick={() => addLocation(l)}>
                            <i className="ti ti-location-pin" style={{ color: '#6c757d' }} />
                            <div className="dal-name">{locName(l)}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Auto-notify schedule — students/batches only (set at creation) */}
            {!isEditing && audience.subjectType === 'batch' && (
              <div className="asset-form-section">
                <div className="asset-form-section-title"><i className="ti ti-bell" /> Notifications</div>
                <label className="field-cell">
                  <div className="float-field float-always">
                    <select className="float-control" value={notifySchedule} onChange={(e) => setNotifySchedule(e.target.value)}>
                      {NOTIFY_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <span className="float-label">When to send automated notifications</span>
                  </div>
                </label>
              </div>
            )}
          </div>
          <div className="legacy-modal-footer">
            <button type="button" className="legacy-btn legacy-btn-default" onClick={onClose}>Cancel</button>
            <button
              type="submit"
              className="legacy-btn legacy-btn-success"
              disabled={!canSubmit}
              style={!canSubmit ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
            >
              <i className="ti ti-check" /> {submitting ? 'Saving…' : (isEditing ? 'Update Mapping' : 'Save Mapping')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
