import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import ToastRegion from '../components/ToastRegion';
import { listAttendanceRecords, sendParentNotification } from '../lib/attendanceApi';
import { listCandidates, listBatches, listCandidatesInBatches } from '../lib/icardApi';
import { searchInstructors } from '../lib/instructorsApi';
import { listUsers } from '../lib/userAccountsApi';
import { listDefaultLocations } from '../lib/attendanceDefaultLocationApi';
import useDebouncedValue from '../hooks/useDebouncedValue';

// Audience tabs for the calendar-view people picker (mirrors the Forms dispatch modal).
const AUDIENCES = [
  { key: 'STUDENTS', userType: 1, label: 'Students', icon: 'ti-user' },
  { key: 'INSTRUCTORS', userType: 2, label: 'Instructors', icon: 'ti-blackboard' },
  { key: 'MENTORS', userType: 3, label: 'Mentors', icon: 'ti-headphone-alt' },
  { key: 'STAFF', userType: 4, label: 'Staff', icon: 'ti-id-badge' },
];

const MAX_CALENDAR_PEOPLE = 5;

// Unified people search across the four audiences.
async function searchPeople(audienceKey, query) {
  const q = (query || '').trim();
  if (audienceKey === 'STUDENTS') {
    const resp = await listCandidates({ page: 1, size: 20, searchKey: q || undefined });
    return (resp?.data || []).map((c) => ({
      id: c.id, name: c.name || 'Unknown', detail: c.mobile || c.registeredMobile || c.communicationMobile || '',
    }));
  }
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
  // STAFF
  const resp = await listUsers({ page: 1, size: 20, searchKey: q || undefined });
  return (resp?.data || []).map((u) => ({ id: u.id, name: u.name || 'Unknown', detail: u.email || '' }));
}

function monthGridCells(year, month) {
  const startDow = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDow; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);
  return cells;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || name || '—';
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const PAGE_SIZE_OPTIONS = [20, 50, 100, 200];

const USER_TYPES = {
  1: 'Student',
  2: 'Instructor',
  3: 'Mentor',
  4: 'Staff',
};

const STATUSES = {
  0: 'Voided',
  1: 'Valid',
};

const STATUS_CLASS = {
  0: 'status-danger',
  1: 'status-active',
};

// Sortable columns map to the API's `sortBy` enum.
const SORTABLE = {
  date: 'date',
  firstIn: 'firstIn',
  lastOut: 'lastOut',
  swipesCount: 'swipesCount',
};

// Epoch (ms — falls back to s) → "08 Jun 2026, 09:35"
function formatDateTime(value) {
  if (!value) return '—';
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return '—';
  const d = new Date(num < 1e11 ? num * 1000 : num);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function formatDateParts(year, month, day) {
  if (!year || !month || !day) return '—';
  const d = new Date(Number(year), Number(month) - 1, Number(day));
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Render a date-input value ("2026-06-16") as "16 Jun, 2026".
function formatDateLabel(value) {
  if (!value) return '';
  const [year, month, day] = value.split('-').map(Number);
  return formatDateParts(year, month, day) === '—' ? '' : formatDateParts(year, month, day);
}

// Open the native date picker on click; block manual text entry on key down.
function openDatePicker(event) {
  if (event.type === 'keydown') {
    if (event.key === 'Tab') return;
    event.preventDefault();
  }
  try {
    event.currentTarget.showPicker?.();
  } catch (_) {
    // showPicker throws if already open or unsupported — safe to ignore.
  }
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

function toCSV(rows, columns) {
  const escape = (val) => {
    if (val == null) return '';
    const s = String(val);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header = columns.map((c) => escape(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => escape(c.value(r))).join(',')).join('\n');
  return `${header}\n${body}`;
}

function downloadCSV(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function apiErrorMessage(error, fallback) {
  const body = error?.response?.data;
  return body?.error?.message || body?.message || error?.message || fallback;
}

// The records API filters by year/month/day (single date). Translate a from/to
// range into the finest granularity common to both ends:
//  • same day            → { year, month, day }
//  • same year+month     → { year, month }
//  • same year           → { year }
//  • spanning / open-end → {} (broad)
function rangeToParams(from, to) {
  const lo = from || to;
  const hi = to || from;
  if (!lo && !hi) return {};
  const [ly, lm, ld] = (lo || '').split('-').map(Number);
  const [hy, hm, hd] = (hi || '').split('-').map(Number);
  const out = {};
  if (ly && ly === hy) {
    out.year = ly;
    if (lm === hm) {
      out.month = lm;
      if (ld === hd) out.day = ld;
    }
  }
  return out;
}

// ── Batch multi-select typeahead ──────────────────────────────────────────
// Used inside the Filter modal to pick one or more batches to filter records by.
function BatchMultiSelect({ batches, selectedIds, onChange, placeholder = 'All batches' }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onDown(e) { if (!boxRef.current?.contains(e.target)) { setOpen(false); setQuery(''); } }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const byId = useMemo(() => {
    const m = {};
    batches.forEach((b) => { m[String(b.id)] = b; });
    return m;
  }, [batches]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return batches;
    return batches.filter((b) => `${b.name || ''} ${b.description || ''}`.toLowerCase().includes(q));
  }, [batches, query]);

  function toggle(id) {
    const sid = String(id);
    onChange(selectedIds.includes(sid) ? selectedIds.filter((x) => x !== sid) : [...selectedIds, sid]);
  }

  // Closed-control summary label: "Multiple Batches" when >1, else the name.
  let summary = placeholder;
  let isPlaceholder = true;
  if (selectedIds.length === 1) {
    summary = byId[selectedIds[0]]?.name || `Batch ${selectedIds[0]}`;
    isPlaceholder = false;
  } else if (selectedIds.length > 1) {
    summary = `Multiple Batches (${selectedIds.length})`;
    isPlaceholder = false;
  }

  return (
    <div className="bms" ref={boxRef}>
      <style>{`
        .bms { position: relative; }
        .bms-control { display:flex; gap:8px; align-items:center; min-height:40px; padding:8px 12px; border:1px solid var(--line,#d7e5e8); border-radius:8px; background:#fff; cursor:pointer; }
        .bms-control .bms-label { flex:1; font-size:13px; color:var(--ink,#16353c); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .bms-control .bms-label.placeholder { color:#94a3b8; }
        .bms-control .bms-caret { color:#64748b; font-size:14px; transition:transform .15s; }
        .bms-control.open .bms-caret { transform:rotate(180deg); }
        .bms-control .bms-clear { border:none; background:none; color:#94a3b8; cursor:pointer; padding:0; display:flex; font-size:15px; line-height:1; }
        .bms-control .bms-clear:hover { color:#dc3545; }
        .bms-menu { position:absolute; top:calc(100% + 4px); left:0; right:0; background:#fff; border:1px solid var(--line,#d7e5e8); border-radius:8px; box-shadow:0 14px 38px rgba(0,0,0,0.12); z-index:60; overflow:hidden; }
        .bms-search { padding:8px; border-bottom:1px solid var(--line,#eef2f4); }
        .bms-search input { width:100%; border:1px solid var(--line,#d7e5e8); border-radius:6px; padding:7px 10px; font-size:13px; outline:none; color:var(--ink,#16353c); }
        .bms-list { max-height:220px; overflow:auto; }
        .bms-opt { padding:9px 12px; font-size:13px; color:var(--ink,#16353c); cursor:pointer; display:flex; align-items:center; gap:9px; }
        .bms-opt:hover { background:#f3f8f9; }
        .bms-opt .bms-check { width:16px; height:16px; border:1.5px solid #cbd5e1; border-radius:4px; display:flex; align-items:center; justify-content:center; color:#fff; font-size:11px; flex-shrink:0; }
        .bms-opt.sel .bms-check { background:#006073; border-color:#006073; }
        .bms-empty { padding:12px; font-size:13px; color:#6c757d; text-align:center; }
      `}</style>
      <div className={`bms-control${open ? ' open' : ''}`} onClick={() => setOpen((o) => !o)}>
        <span className={`bms-label${isPlaceholder ? ' placeholder' : ''}`}>{summary}</span>
        {selectedIds.length > 0 && (
          <button type="button" className="bms-clear" aria-label="Clear" onClick={(e) => { e.stopPropagation(); onChange([]); }}>
            <i className="ti ti-x" />
          </button>
        )}
        <i className="ti ti-angle-down bms-caret" />
      </div>
      {open && (
        <div className="bms-menu">
          <div className="bms-search">
            <input
              type="text"
              value={query}
              autoFocus
              placeholder="Search batches…"
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="bms-list">
            {matches.length === 0 ? (
              <div className="bms-empty">{batches.length === 0 ? 'Loading batches…' : 'No matching batches'}</div>
            ) : matches.map((b) => {
              const sel = selectedIds.includes(String(b.id));
              return (
                <div key={b.id} className={`bms-opt${sel ? ' sel' : ''}`} onClick={() => toggle(b.id)}>
                  <span className="bms-check">{sel && <i className="ti ti-check" />}</span>
                  {b.name || `Batch ${b.id}`}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function OfflineAttendancePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Read the initial URL params once (lazy-init of the filter state below).
  const initialParams = useRef(null);
  if (initialParams.current === null) {
    const p = searchParams;
    initialParams.current = {
      search: p.get('search') || '',
      from: p.get('from') || '',
      to: p.get('to') || '',
      userType: p.get('userType') || '',
      status: p.get('status') || '',
      location: p.get('location') || '',
      batches: p.get('batches') || p.get('batch') || '',
      sortBy: p.get('sortBy') || 'date',
      sortOrder: p.get('sortOrder') || 'DESC',
      page: Math.max(1, parseInt(p.get('page'), 10) || 1),
      size: parseInt(p.get('size'), 10) || 20,
    };
  }
  const init = initialParams.current;

  // Filters (mapped to the attendance-record API)
  const [searchUserId, setSearchUserId] = useState(init.search);
  const debouncedSearchUserId = useDebouncedValue(searchUserId);
  const [dateFrom, setDateFrom] = useState(() => init.from || todayStr()); // yyyy-mm-dd, defaults to today
  const [dateTo, setDateTo] = useState(() => init.to || todayStr());        // yyyy-mm-dd, defaults to today
  const [userTypeFilter, setUserTypeFilter] = useState(init.userType);
  const [filterBy, setFilterBy] = useState(init.status);     // valid | voided | (all)
  const [locationId, setLocationId] = useState(init.location);
  const [locationLabel, setLocationLabel] = useState('');
  const [batchFilterIds, setBatchFilterIds] = useState(() => (init.batches ? init.batches.split(',').filter(Boolean) : []));

  // Pagination / sort
  const [page, setPage] = useState(init.page);
  const [pageSize, setPageSize] = useState(init.size);
  const [sortBy, setSortBy] = useState(init.sortBy);
  const [sortOrder, setSortOrder] = useState(init.sortOrder);

  // Data
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  // Lookups
  const [locations, setLocations] = useState([]);
  const [batches, setBatches] = useState([]);

  // Calendar view
  const [showCalendar, setShowCalendar] = useState(false);

  // Monthly report builder
  const [showMonthlyReport, setShowMonthlyReport] = useState(false);

  // Notify parents
  const [showNotifyParents, setShowNotifyParents] = useState(false);

  // Export dropdown
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportRef = useRef(null);

  // Tools dropdown (header)
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const toolsRef = useRef(null);

  // Date filter dropdown (All / Today / Yesterday / custom)
  const [dateMenuOpen, setDateMenuOpen] = useState(false);
  const [pickingDate, setPickingDate] = useState(false);
  const dateMenuRef = useRef(null);

  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);

  const showToast = useCallback((type, title, message) => {
    const id = toastIdRef.current + 1;
    toastIdRef.current = id;
    setToasts((cur) => [...cur, { id, type, title, message }]);
    window.setTimeout(() => setToasts((cur) => cur.filter((t) => t.id !== id)), 4500);
  }, []);

  // ── Load locations (for id → name resolution) ────────────────────────────
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

  // ── Load batches (for the batch filter typeahead) ─────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await listBatches({ page: 1, size: 200 });
        if (!cancelled) setBatches(Array.isArray(resp?.data) ? resp.data : []);
      } catch (_e) { if (!cancelled) setBatches([]); }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Load attendance records ───────────────────────────────────────────────
  const loadRecords = useCallback(async (signal = { cancelled: false }) => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const { year, month, day } = rangeToParams(dateFrom, dateTo);
      const resp = await listAttendanceRecords({
        userId: /^\d+$/.test(debouncedSearchUserId.trim()) ? debouncedSearchUserId.trim() : undefined,
        userType: userTypeFilter || undefined,
        locationId: locationId || undefined,
        batchIds: batchFilterIds.length ? batchFilterIds.join(',') : undefined,
        year,
        month,
        day,
        filterBy: filterBy || undefined,
        sortBy,
        sortOrder,
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
      const msg = apiErrorMessage(error, 'Failed to load attendance records.');
      setLoadError(msg);
      showToast('error', 'Network Error', msg);
    } finally {
      if (!signal.cancelled) setIsLoading(false);
    }
  }, [debouncedSearchUserId, dateFrom, dateTo, userTypeFilter, locationId, batchFilterIds, filterBy, sortBy, sortOrder, page, pageSize, showToast]);

  useEffect(() => {
    const signal = { cancelled: false };
    const timer = setTimeout(() => loadRecords(signal), 250);
    return () => { signal.cancelled = true; clearTimeout(timer); };
  }, [loadRecords]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [searchUserId, dateFrom, dateTo, userTypeFilter, locationId, batchFilterIds, filterBy, sortBy, sortOrder, pageSize]);

  // Batches only apply to students; drop any batch filter when a non-student
  // user type is selected so a hidden filter can't keep narrowing results.
  useEffect(() => {
    if (userTypeFilter !== '' && String(userTypeFilter) !== '1' && batchFilterIds.length) {
      setBatchFilterIds([]);
    }
  }, [userTypeFilter, batchFilterIds.length]);

  // ── Sync active filters → URL query params ────────────────────────────────
  useEffect(() => {
    const next = {};
    if (searchUserId) next.search = searchUserId;
    if (dateFrom) next.from = dateFrom;
    if (dateTo) next.to = dateTo;
    if (userTypeFilter) next.userType = userTypeFilter;
    if (filterBy) next.status = filterBy;
    if (locationId) next.location = String(locationId);
    if (batchFilterIds.length) next.batches = batchFilterIds.join(',');
    if (sortBy && sortBy !== 'date') next.sortBy = sortBy;
    if (sortOrder && sortOrder !== 'DESC') next.sortOrder = sortOrder;
    if (page > 1) next.page = String(page);
    if (pageSize !== 20) next.size = String(pageSize);
    setSearchParams(next, { replace: true });
  }, [searchUserId, dateFrom, dateTo, userTypeFilter, filterBy, locationId, batchFilterIds, sortBy, sortOrder, page, pageSize, setSearchParams]);

  // Close export menu on outside click / Escape
  useEffect(() => {
    if (!showExportMenu) return undefined;
    function onDown(e) { if (!exportRef.current?.contains(e.target)) setShowExportMenu(false); }
    function onKey(e) { if (e.key === 'Escape') setShowExportMenu(false); }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [showExportMenu]);

  // Close tools menu on outside click / Escape
  useEffect(() => {
    if (!showToolsMenu) return undefined;
    function onDown(e) { if (!toolsRef.current?.contains(e.target)) setShowToolsMenu(false); }
    function onKey(e) { if (e.key === 'Escape') setShowToolsMenu(false); }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [showToolsMenu]);

  // Close date menu on outside click / Escape
  useEffect(() => {
    if (!dateMenuOpen) return undefined;
    function onDown(e) { if (!dateMenuRef.current?.contains(e.target)) { setDateMenuOpen(false); setPickingDate(false); } }
    function onKey(e) { if (e.key === 'Escape') { setDateMenuOpen(false); setPickingDate(false); } }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [dateMenuOpen]);

  const safePage = Math.min(page, totalPages);
  const showingStart = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const showingEnd = Math.min(safePage * pageSize, total);

  // The single selected date (dateFrom === dateTo). '' on both means "All".
  const selectedDate = dateFrom && dateFrom === dateTo ? dateFrom : '';
  const isCustomRange = !!(dateFrom || dateTo)
    && !(selectedDate === todayStr() || selectedDate === yesterdayStr());
  const fmtShort = (s) => {
    if (!s) return '…';
    const d = new Date(`${s}T00:00:00`);
    if (Number.isNaN(d.getTime())) return s;
    return `${d.getDate()} ${d.toLocaleString('en-US', { month: 'short' })}`;
  };
  const dateLabel = (() => {
    if (!dateFrom && !dateTo) return 'All';
    if (selectedDate === todayStr()) return 'Today';
    if (selectedDate === yesterdayStr()) return 'Yesterday';
    if (selectedDate) {
      const d = new Date(`${selectedDate}T00:00:00`);
      if (!Number.isNaN(d.getTime())) return `${d.getDate()} ${d.toLocaleString('en-US', { month: 'short' })}, ${d.getFullYear()}`;
    }
    // Range
    return `${fmtShort(dateFrom)} – ${fmtShort(dateTo)}`;
  })();
  function setDatePreset(value) {
    // value: '' (All) | 'today' | 'yesterday'
    if (value === '') { setDateFrom(''); setDateTo(''); }
    else if (value === 'today') { setDateFrom(todayStr()); setDateTo(todayStr()); }
    else if (value === 'yesterday') { setDateFrom(yesterdayStr()); setDateTo(yesterdayStr()); }
    setDateMenuOpen(false);
    setPickingDate(false);
  }

  // The date range defaults to today; only count it as an applied filter when changed.
  const dateIsDefault = dateFrom === todayStr() && dateTo === todayStr();
  const activeFilterCount = (dateIsDefault ? 0 : 1) + (batchFilterIds.length ? 1 : 0);
  const hasActiveFilters = activeFilterCount > 0;

  function clearFilters() {
    setSearchUserId('');
    setDateFrom(todayStr());
    setDateTo(todayStr());
    setUserTypeFilter('');
    setFilterBy('');
    setLocationId('');
    setLocationLabel('');
    setBatchFilterIds([]);
  }

  function toggleSort(col) {
    const apiCol = SORTABLE[col];
    if (!apiCol) return;
    if (sortBy === apiCol) {
      setSortOrder((d) => (d === 'ASC' ? 'DESC' : 'ASC'));
    } else {
      setSortBy(apiCol);
      setSortOrder('DESC');
    }
  }

  function getSortIcon(col) {
    if (sortBy !== SORTABLE[col]) return 'ti-arrows-vertical';
    return sortOrder === 'ASC' ? 'ti-arrow-up' : 'ti-arrow-down';
  }

  function locationName(id) {
    if (id == null || id === '') return '—';
    const l = locations.find((x) => String(x.id ?? x.code) === String(id));
    return l?.name || l?.title || l?.code || `#${id}`;
  }

  // Resolve a record's batch name: prefer the value the API returns on the
  // record, falling back to the batches lookup via its id.
  function batchName(r) {
    const direct = r?.batchName || r?.batch?.name;
    if (direct) return direct;
    const bid = r?.batchId ?? r?.batch?.id;
    if (bid == null || bid === '') return '—';
    const b = batches.find((x) => String(x.id) === String(bid));
    return b?.name || `Batch ${bid}`;
  }

  // Resolve the location label when the id arrived from the URL (no label yet).
  useEffect(() => {
    if (!locationId || locationLabel || !locations.length) return;
    const l = locations.find((x) => String(x.id ?? x.code) === String(locationId));
    if (l) setLocationLabel(l.name || l.title || l.code || `#${locationId}`);
  }, [locationId, locationLabel, locations]);

  const exportColumns = useMemo(() => [
    { label: 'Record ID', value: (r) => r.id ?? '' },
    { label: 'User ID', value: (r) => r.userId ?? '' },
    { label: 'User Type', value: (r) => USER_TYPES[Number(r.userType)] || r.userType || '' },
    { label: 'Batch', value: (r) => batchName(r) },
    { label: 'Date', value: (r) => formatDateParts(r.dateYear, r.dateMonth, r.dateDay) },
    { label: 'First In', value: (r) => formatDateTime(r.firstIn) },
    { label: 'Last Out', value: (r) => formatDateTime(r.lastOut) },
    { label: 'Captured At', value: (r) => r.capturedLocationName || '' },
    { label: 'Status', value: (r) => STATUSES[Number(r.status)] || '' },
  ], [locations]);

  const rangeLabel = dateFrom && dateTo
    ? (dateFrom === dateTo ? dateFrom : `${dateFrom}_to_${dateTo}`)
    : (dateFrom || dateTo || 'all');

  function handleExportCSV() {
    setShowExportMenu(false);
    if (records.length === 0) {
      showToast('info', 'Nothing to export', 'There are no records in the current view.');
      return;
    }
    downloadCSV(`attendance_records_${rangeLabel}.csv`, toCSV(records, exportColumns));
    showToast('success', 'Export Ready', 'Attendance CSV downloaded.');
  }

  function printRowsAsPDF(rows, title) {
    const escapeHtml = (val) => String(val ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
    const head = exportColumns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('');
    const body = rows.map((r) => (
      `<tr>${exportColumns.map((c) => `<td>${escapeHtml(c.value(r))}</td>`).join('')}</tr>`
    )).join('');
    const win = window.open('', '_blank');
    if (!win) {
      showToast('error', 'Popup blocked', 'Allow popups to export as PDF.');
      return false;
    }
    win.document.write(`<!doctype html><html><head><title>${escapeHtml(title)}</title>
      <style>
        body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#222;margin:24px;}
        h1{font-size:18px;margin:0 0 4px;}
        .meta{font-size:12px;color:#666;margin-bottom:16px;}
        table{border-collapse:collapse;width:100%;font-size:11px;}
        th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;}
        th{background:#f3f5f6;}
        tr:nth-child(even) td{background:#fafbfc;}
      </style></head><body>
      <h1>${escapeHtml(title)}</h1>
      <div class="meta">Generated ${new Date().toLocaleString()} · ${rows.length} record(s)</div>
      <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
      <script>window.onload=function(){window.print();}<\/script>
      </body></html>`);
    win.document.close();
    return true;
  }

  function handleExportPDF() {
    setShowExportMenu(false);
    if (records.length === 0) {
      showToast('info', 'Nothing to export', 'There are no records in the current view.');
      return;
    }
    const titleRange = dateFrom || dateTo ? ` — ${dateFrom || '…'} to ${dateTo || '…'}` : '';
    if (printRowsAsPDF(records, `Attendance Records${titleRange}`)) {
      showToast('success', 'Export Ready', 'Use your browser dialog to save as PDF.');
    }
  }

  return (
    <div className="quiz-attempt-report-page data-table-page">
      <ToastRegion toasts={toasts} onDismiss={(id) => setToasts((cur) => cur.filter((t) => t.id !== id))} />
      <style>{`
        .att-export-item{display:flex;align-items:center;gap:10px;width:100%;text-align:left;
          background:#fff;border:none;cursor:pointer;padding:11px 14px;font-size:13px;color:var(--ink);
          border-top:1px solid #f3f5f6;}
        .att-export-item:first-child{border-top:none;}
        .att-export-item:hover{background:#eaf3f5;}
        .att-export-item i{color:var(--muted);font-size:15px;width:18px;text-align:center;}
      `}</style>

      {/* ── Standard Page Header ── */}
      <div className="page-header-section">
        <div className="page-header-title-group">
          <span className="page-header-icon-box"><i className="fa fa-check-square-o" /></span>
          <div>
            <h2>Offline Attendance</h2>
            <p>Biometric attendance records captured from devices across locations.</p>
          </div>
        </div>
        <div ref={toolsRef} style={{ position: 'relative' }}>
          <button type="button" className="page-action-button" onClick={() => setShowToolsMenu((o) => !o)}>
            <i className="fa fa-cog" style={{ marginRight: 6 }} /> Tools
          </button>
          {showToolsMenu && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 6px)', right: 0, minWidth: 240,
              background: '#fff', border: '1px solid var(--line)', borderRadius: 8,
              boxShadow: '0 14px 38px rgba(0,0,0,0.12)', zIndex: 50, overflow: 'hidden',
            }}>
              <button type="button" className="att-export-item" onClick={() => { setShowToolsMenu(false); setShowNotifyParents(true); }}>
                <i className="fa fa-paper-plane" /> Notify Parents
              </button>
              <button type="button" className="att-export-item" onClick={() => { setShowToolsMenu(false); setShowMonthlyReport(true); }}>
                <i className="ti ti-download" /> Download Monthly Report
              </button>
              <button type="button" className="att-export-item" onClick={() => { setShowToolsMenu(false); setShowCalendar(true); }}>
                <i className="ti ti-calendar" /> Calendar View
              </button>
              <button type="button" className="att-export-item" onClick={() => { setShowToolsMenu(false); navigate('/attendance-mapping'); }}>
                <i className="ti ti-settings" /> Update Attendance Mapping
              </button>
              <button type="button" className="att-export-item" onClick={() => { setShowToolsMenu(false); navigate('/attendance-capture-location'); }}>
                <i className="ti ti-location-pin" /> Attendance Capture Locations
              </button>
            </div>
          )}
        </div>
      </div>

      {showCalendar && (
        <CalendarViewModal onClose={() => setShowCalendar(false)} showToast={showToast} />
      )}

      {showMonthlyReport && (
        <MonthlyReportModal onClose={() => setShowMonthlyReport(false)} showToast={showToast} />
      )}

      {showNotifyParents && (
        <NotifyParentsModal onClose={() => setShowNotifyParents(false)} showToast={showToast} />
      )}

      {/* ── Filter bar ── */}
      <div className="filter-bar" style={{ flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <style>{`
          .am-combo { display:flex; align-items:stretch; flex:0 1 auto; width:340px; max-width:100%; min-height:40px; border:1px solid var(--line,#d7e5e8); border-radius:8px; background:#fff; overflow:hidden; transition:width .28s ease; }
          .am-combo.collapsed { width:auto; }
          .am-combo.collapsed .am-combo-select { border-right:none; border-radius:8px; padding-right:28px; }
          .am-combo-select { border:none; background:#f3f8f9; border-right:1px solid var(--line,#d7e5e8); padding:0 14px 0 12px; font-size:13px; font-weight:600; color:var(--ink,#16353c); cursor:pointer; outline:none; max-width:170px; }
          .am-combo-field { display:flex; flex:1; align-items:stretch; overflow:hidden; animation:amComboReveal .3s ease; }
          @keyframes amComboReveal { from { opacity:0; max-width:0; transform:translateX(-8px); } to { opacity:1; max-width:300px; transform:none; } }
          .am-combo-icon { display:flex; align-items:center; padding:0 12px; border:none; background:transparent; color:#94a3b8; }
          .am-combo-icon.clearable { cursor:pointer; color:#64748b; }
          .am-combo-input { flex:1; border:none; outline:none; padding:10px 12px; font-size:13px; color:var(--ink,#16353c); background:transparent; min-width:0; }
          .fb-date-menu { position:relative; }
          .fb-date-btn { display:flex; align-items:center; justify-content:space-between; gap:8px; min-width:150px; padding:9px 12px; border:1px solid var(--line,#d7e5e8); border-radius:8px; background:#fff; font-size:13px; font-weight:600; color:var(--ink,#16353c); cursor:pointer; outline:none; }
          .fb-date-btn.active { border-color:#006073; }
          .fb-date-lbl { display:flex; align-items:center; gap:6px; }
          .fb-date-lbl i { color:#6b7280; font-size:14px; }
          .fb-date-pop { position:absolute; top:calc(100% + 4px); left:0; z-index:40; min-width:180px; background:#fff; border:1px solid var(--line,#d7e5e8); border-radius:8px; box-shadow:0 8px 20px rgba(0,0,0,0.12); overflow:hidden; }
          .fb-date-opt { display:flex; align-items:center; justify-content:space-between; width:100%; padding:9px 14px; border:none; background:#fff; color:#374151; font-size:13px; text-align:left; cursor:pointer; }
          .fb-date-opt:hover { background:#f3f8f9; }
          .fb-date-opt.on { background:#e0f2f1; font-weight:600; }
          .fb-date-opt.on i { color:#006073; font-size:12px; }
          .fb-date-opt-custom { border-top:1px solid #f1f5f9; }
          .fb-batch { width:260px; max-width:100%; }
        `}</style>
        <div className={`am-combo${userTypeFilter ? '' : ' collapsed'}`}>
          <select className="am-combo-select" value={userTypeFilter} onChange={(e) => { const v = e.target.value; setUserTypeFilter(v); if (!v) setSearchUserId(''); }}>
            <option value="">All User Types</option>
            {Object.entries(USER_TYPES).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
          {userTypeFilter && (
            <div className="am-combo-field">
              <input
                type="text"
                className="am-combo-input"
                placeholder="Search by user ID..."
                value={searchUserId}
                onChange={(e) => setSearchUserId(e.target.value)}
              />
              <button
                type="button"
                className={`am-combo-icon${searchUserId ? ' clearable' : ''}`}
                onClick={() => { if (searchUserId) setSearchUserId(''); }}
                tabIndex={searchUserId ? 0 : -1}
                aria-label={searchUserId ? 'Clear search' : 'Search'}
              >
                <i className={`ti ${searchUserId ? 'ti-close' : 'ti-search'}`} />
              </button>
            </div>
          )}
        </div>
        <div ref={dateMenuRef} className="fb-date-menu">
          <button
            type="button"
            className={`fb-date-btn${(dateFrom || dateTo) ? ' active' : ''}`}
            onClick={() => setDateMenuOpen((o) => !o)}
          >
            <span className="fb-date-lbl"><i className="ti ti-calendar" /> {dateLabel}</span>
            <i className={`ti ti-chevron-${dateMenuOpen ? 'up' : 'down'}`} style={{ fontSize: 12 }} />
          </button>
          {dateMenuOpen && (
            <div className="fb-date-pop">
              {[
                { key: '', label: 'All' },
                { key: 'today', label: 'Today' },
                { key: 'yesterday', label: 'Yesterday' },
              ].map((o) => {
                const isOn = (o.key === '' && !dateFrom && !dateTo)
                  || (o.key === 'today' && selectedDate === todayStr())
                  || (o.key === 'yesterday' && selectedDate === yesterdayStr());
                return (
                  <button key={o.key || 'all'} type="button" className={`fb-date-opt${isOn ? ' on' : ''}`} onClick={() => setDatePreset(o.key)}>
                    {o.label}
                    {isOn && <i className="ti ti-check" />}
                  </button>
                );
              })}
              <button type="button" className={`fb-date-opt fb-date-opt-custom${isCustomRange ? ' on' : ''}`} onClick={() => setPickingDate(true)}>
                Select date range
                {isCustomRange && <i className="ti ti-check" />}
              </button>
              {(pickingDate || isCustomRange) && (
                <div style={{ padding: '10px 14px', borderTop: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280' }}>From
                    <input
                      type="date"
                      value={dateFrom}
                      max={dateTo || undefined}
                      onChange={(e) => setDateFrom(e.target.value)}
                      style={{ width: '100%', marginTop: 3, padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, color: '#4b5563', cursor: 'pointer' }}
                    />
                  </label>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280' }}>To
                    <input
                      type="date"
                      value={dateTo}
                      min={dateFrom || undefined}
                      onChange={(e) => setDateTo(e.target.value)}
                      style={{ width: '100%', marginTop: 3, padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, color: '#4b5563', cursor: 'pointer' }}
                    />
                  </label>
                  <button
                    type="button"
                    className="crispr-btn crispr-btn-primary"
                    style={{ alignSelf: 'flex-end', padding: '5px 12px', fontSize: 12 }}
                    onClick={() => { setDateMenuOpen(false); setPickingDate(false); }}
                  >
                    Apply
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        {/* Batches only apply to students — show only for "All User Types" or "Students". */}
        {(userTypeFilter === '' || String(userTypeFilter) === '1') && (
          <div className="fb-batch">
            <BatchMultiSelect
              batches={batches}
              selectedIds={batchFilterIds}
              onChange={setBatchFilterIds}
              placeholder="Filter by batches…"
            />
          </div>
        )}
        {hasActiveFilters && (
          <button type="button" className="filter-clear-btn" onClick={clearFilters}>
            <i className="ti ti-reload" /> Clear
          </button>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
          <div ref={exportRef} style={{ position: 'relative' }}>
            <button
              type="button"
              className="qar-btn-export"
              disabled={exporting || isLoading || records.length === 0}
              onClick={() => setShowExportMenu((o) => !o)}
            >
              <i className={`ti ${exporting ? 'ti-reload' : 'ti-download'}`} /> Export List
            </button>
            {showExportMenu && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0, minWidth: 220,
                background: '#fff', border: '1px solid var(--line)', borderRadius: 8,
                boxShadow: '0 14px 38px rgba(0,0,0,0.12)', zIndex: 50, overflow: 'hidden',
              }}>
                <button type="button" className="att-export-item" onClick={handleExportPDF}>
                  <i className="ti ti-file-text" /> Export as PDF
                </button>
                <button type="button" className="att-export-item" onClick={handleExportCSV}>
                  <i className="ti ti-file-spreadsheet" /> Export as CSV
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      {isLoading ? (
        <div className="students-table-container">
          <table className="students-table thead-loading">
            <thead>
              <tr>
                <th>User</th>
                <th>User Type</th>
                <th>Batch</th>
                <th>Date</th>
                <th>First In</th>
                <th>Last Out</th>
                <th>Captured At</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 8 }, (_, i) => (
                <tr key={`sk-${i}`}>
                  {Array.from({ length: 8 }, (_, j) => (
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
                <th>User</th>
                <th>User Type</th>
                <th>Batch</th>
                <th className={`sortable${sortBy === 'date' ? ' active' : ''}`} onClick={() => toggleSort('date')}>
                  Date <i className={`ti ${getSortIcon('date')} sort-icon`} />
                </th>
                <th className={`sortable${sortBy === 'firstIn' ? ' active' : ''}`} onClick={() => toggleSort('firstIn')}>
                  First In <i className={`ti ${getSortIcon('firstIn')} sort-icon`} />
                </th>
                <th className={`sortable${sortBy === 'lastOut' ? ' active' : ''}`} onClick={() => toggleSort('lastOut')}>
                  Last Out <i className={`ti ${getSortIcon('lastOut')} sort-icon`} />
                </th>
                <th>Captured At</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, idx) => {
                const statusKey = Number(r.status);
                return (
                  <tr key={r.id ?? `${r.userId ?? 'row'}-${idx}`}>
                    <td>
                      <div className="qar-user-cell">
                        <strong>{r.userName || '—'}</strong>
                        {r.userId != null && <span className="qar-user-id">ID: {r.userId}</span>}
                      </div>
                    </td>
                    <td>{USER_TYPES[Number(r.userType)] || '—'}</td>
                    <td>{batchName(r)}</td>
                    <td>{formatDateParts(r.dateYear, r.dateMonth, r.dateDay)}</td>
                    <td className="qar-datetime">{formatDateTime(r.firstIn)}</td>
                    <td className="qar-datetime">{formatDateTime(r.lastOut)}</td>
                    <td>{r.capturedLocationName || '—'}</td>
                    <td>
                      <span className={`status-pill ${STATUS_CLASS[statusKey] || ''}`}>
                        {STATUSES[statusKey] || '—'}
                      </span>
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
          <h4>Unable to load attendance</h4>
          <p>{loadError}</p>
          <button type="button" className="qar-btn-export" style={{ marginTop: 12 }} onClick={() => loadRecords()}>
            <i className="ti ti-reload" /> Retry
          </button>
        </div>
      ) : (
        <div className="qar-empty-state">
          <i className="ti ti-search" />
          <h4>No Attendance Records</h4>
          {hasActiveFilters
            ? <p>Try adjusting your filters.</p>
            : <p>No attendance has been captured yet.</p>}
        </div>
      )}
    </div>
  );
}

// ── Calendar View: pick people (≤5) + a month, then show a presence calendar ──
function CalendarViewModal({ onClose, showToast, locationName }) {
  const [view, setView] = useState('select'); // 'select' | 'calendar'
  const [monthDate, setMonthDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const [audience, setAudience] = useState('STUDENTS');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState([]); // [{ uid, id, userType, name }]

  const [loadingCal, setLoadingCal] = useState(false);
  const [calData, setCalData] = useState({}); // uid -> Set(presentDays)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Debounced people search for the active audience tab.
  useEffect(() => {
    if (view !== 'select') return undefined;
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const rows = await searchPeople(audience, search);
        if (!cancelled) setResults(rows);
      } catch (_e) {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [audience, search, view]);

  const userTypeFor = (key) => AUDIENCES.find((a) => a.key === key)?.userType;

  function togglePerson(p) {
    const userType = userTypeFor(audience);
    const uid = `${userType}:${p.id}`;
    setSelected((cur) => {
      if (cur.some((x) => x.uid === uid)) return cur.filter((x) => x.uid !== uid);
      if (cur.length >= MAX_CALENDAR_PEOPLE) {
        showToast('info', 'Limit reached', `You can select up to ${MAX_CALENDAR_PEOPLE} people.`);
        return cur;
      }
      return [...cur, { uid, id: p.id, userType, name: p.name }];
    });
  }

  const selectedUids = useMemo(() => new Set(selected.map((s) => s.uid)), [selected]);

  async function showCalendar() {
    if (selected.length === 0) {
      showToast('info', 'Nobody selected', 'Pick at least one person.');
      return;
    }
    setLoadingCal(true);
    try {
      const [y, m] = monthDate.split('-');
      const year = Number(y); const month = Number(m);
      const entries = await Promise.all(selected.map(async (p) => {
        const resp = await listAttendanceRecords({
          userId: p.id, userType: p.userType, year, month, size: 100, filterBy: 'valid',
        });
        const rows = resp?.data || [];
        const present = new Set(
          rows.filter((r) => Number(r.status) === 1).map((r) => Number(r.dateDay)),
        );
        return [p.uid, present];
      }));
      setCalData(Object.fromEntries(entries));
      setView('calendar');
    } catch (error) {
      const msg = apiErrorMessage(error, 'Could not load attendance.');
      showToast('error', 'Failed to load', msg);
    } finally {
      setLoadingCal(false);
    }
  }

  const [y, m] = monthDate.split('-');
  const year = Number(y); const month = Number(m);
  const cells = monthGridCells(year, month);
  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0);

  function downloadCalendarPDF() {
    const esc = (val) => String(val ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
    const dow = WEEKDAYS.map((w) => `<th>${w}</th>`).join('');
    const rowsHtml = [];
    for (let i = 0; i < cells.length; i += 7) {
      const week = cells.slice(i, i + 7).map((d) => {
        if (d == null) return '<td class="empty"></td>';
        const cellDate = new Date(year, month - 1, d);
        const isFuture = cellDate > todayMidnight;
        const people = isFuture ? '' : selected.map((s) => {
          const present = calData[s.uid]?.has(d);
          return `<div class="row"><span class="dot ${present ? 'present' : 'absent'}"></span>${esc(firstName(s.name))}</div>`;
        }).join('');
        return `<td><div class="num">${d}</div>${people}</td>`;
      }).join('');
      rowsHtml.push(`<tr>${week}</tr>`);
    }
    const win = window.open('', '_blank');
    if (!win) { showToast('error', 'Popup blocked', 'Allow popups to download the calendar PDF.'); return; }
    win.document.write(`<!doctype html><html><head><title>Attendance Calendar — ${esc(monthLabel)}</title>
      <style>
        body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#16353c;margin:20px;}
        h1{font-size:18px;margin:0 0 2px;}
        .sub{font-size:12px;color:#6c757d;margin-bottom:6px;}
        .people{font-size:12px;color:#16353c;margin-bottom:14px;}
        .legend{font-size:12px;color:#59757b;margin-bottom:10px;display:flex;gap:18px;}
        .legend .dot{display:inline-block;margin-right:6px;}
        table{border-collapse:collapse;width:100%;table-layout:fixed;}
        th{font-size:11px;text-transform:uppercase;color:#59757b;padding:6px 0;border-bottom:1px solid #d7e5e8;}
        td{border:1px solid #d7e5e8;vertical-align:top;height:88px;padding:5px;font-size:11px;}
        td.empty{border:none;}
        .num{font-weight:700;font-size:12px;margin-bottom:3px;}
        .row{display:flex;align-items:center;gap:5px;margin-bottom:2px;}
        .dot{width:9px;height:9px;border-radius:50%;flex-shrink:0;}
        .dot.present{background:#16a34a;}
        .dot.absent{background:#dc2626;}
        @media print{@page{size:landscape;margin:12mm;}}
      </style></head><body>
      <h1>Attendance Calendar — ${esc(monthLabel)}</h1>
      <div class="legend">
        <span><span class="dot present"></span>Present</span>
        <span><span class="dot absent"></span>Absent</span>
      </div>
      <table><thead><tr>${dow}</tr></thead><tbody>${rowsHtml.join('')}</tbody></table>
      <script>window.onload=function(){window.print();}<\/script>
      </body></html>`);
    win.document.close();
    showToast('success', 'Calendar Ready', 'Use your browser dialog to save as PDF.');
  }

  return (
    <div className="legacy-modal-backdrop active" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <style>{`
        .att-cal-tabs { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:14px; }
        .att-cal-tab { display:inline-flex; align-items:center; gap:6px; padding:7px 12px; border:1px solid var(--line,#d7e5e8); border-radius:8px; background:#fff; cursor:pointer; font-size:12px; font-weight:600; color:var(--ink,#16353c); }
        .att-cal-tab.active { background:var(--brand,#006073); border-color:var(--brand,#006073); color:#fff; }
        .att-cal-list { max-height:280px; overflow-y:auto; border:1px solid #e2e8f0; border-radius:10px; }
        .att-cal-person { display:flex; align-items:center; gap:12px; padding:10px 14px; border-bottom:1px solid #f1f5f8; cursor:pointer; }
        .att-cal-person:last-child { border-bottom:none; }
        .att-cal-person:hover { background:#f8fafc; }
        .att-cal-check { width:18px; height:18px; border:1.5px solid #cbd5e1; border-radius:5px; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; color:#fff; font-size:11px; }
        .att-cal-check.on { background:#006073; border-color:#006073; }
        .att-cal-name { font-weight:600; font-size:14px; color:#16353c; }
        .att-cal-detail { font-size:12px; color:#6c757d; }
        .att-cal-chips { display:flex; flex-wrap:wrap; gap:6px; margin-top:12px; }
        .att-cal-chip { display:inline-flex; align-items:center; gap:6px; background:#eef4f5; border-radius:14px; padding:4px 10px; font-size:12px; color:#16353c; }
        .att-cal-chip i { cursor:pointer; color:#6c757d; }
        .att-cal-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:6px; }
        .att-cal-dow { text-align:center; font-weight:700; font-size:11px; color:#59757b; text-transform:uppercase; padding:4px 0; }
        .att-cal-day { border:1px solid var(--line,#d7e5e8); border-radius:8px; min-height:84px; padding:6px; background:#fff; display:flex; flex-direction:column; gap:3px; }
        .att-cal-day.empty { border:none; background:transparent; }
        .att-cal-daynum { font-weight:700; font-size:12px; color:#16353c; }
        .att-cal-row { display:flex; align-items:center; gap:5px; font-size:11px; color:#16353c; }
        .att-cal-dot { width:9px; height:9px; border-radius:50%; flex-shrink:0; }
        .att-cal-dot.present { background:#16a34a; }
        .att-cal-dot.absent { background:#dc2626; }
        .att-cal-legend { display:flex; gap:16px; align-items:center; font-size:12px; color:#59757b; margin-bottom:12px; }
      `}</style>
      <div className="legacy-modal-dialog" style={{ maxWidth: view === 'calendar' ? 920 : 560 }} role="dialog" aria-modal="true">
        <div className="legacy-modal-header">
          <h3>
            <i className="ti ti-calendar" /> Calendar View
            {view === 'calendar' ? ` — ${monthLabel}` : ''}
          </h3>
          <button type="button" className="legacy-modal-close" onClick={onClose}><i className="ti ti-close" /></button>
        </div>

        {view === 'select' ? (
          <div className="cv-modal-form form-modal">
            <div className="legacy-modal-body">
              <div className="asset-form-section">
                <div className="asset-form-section-title"><i className="ti ti-calendar" /> Month &amp; Year</div>
                <div className="asset-form-grid">
                  <label className="field-cell full-span">
                    <div className="float-field float-always">
                      <input
                        type="month"
                        className="float-control"
                        value={monthDate}
                        onChange={(e) => setMonthDate(e.target.value)}
                        onClick={openDatePicker}
                      />
                      <span className="float-label">Month &amp; Year</span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="asset-form-section">
                <div className="asset-form-section-title"><i className="ti ti-user" /> Select People</div>
                <div className="att-cal-tabs">
                  {AUDIENCES.map((a) => (
                    <button
                      key={a.key}
                      type="button"
                      className={`att-cal-tab${audience === a.key ? ' active' : ''}`}
                      onClick={() => { setAudience(a.key); setSearch(''); setSelected([]); }}
                    >
                      <i className={`ti ${a.icon}`} /> {a.label}
                    </button>
                  ))}
                </div>

                <div className="search-wrapper" style={{ marginBottom: 12 }}>
                  <i className="ti ti-search search-icon" />
                  <input
                    type="text"
                    className="search-input"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={`Search ${AUDIENCES.find((a) => a.key === audience)?.label.toLowerCase()}…`}
                  />
                </div>

                <div className="att-cal-list">
                  {searching ? (
                    <div style={{ padding: '14px', color: '#6c757d', fontSize: 13, textAlign: 'center' }}>Searching…</div>
                  ) : results.length === 0 ? (
                    <div style={{ padding: '14px', color: '#6c757d', fontSize: 13, textAlign: 'center' }}>No people found.</div>
                  ) : results.map((p) => {
                    const uid = `${userTypeFor(audience)}:${p.id}`;
                    const checked = selectedUids.has(uid);
                    return (
                      <div key={uid} className="att-cal-person" onClick={() => togglePerson(p)}>
                        <span className={`att-cal-check${checked ? ' on' : ''}`}>{checked && <i className="ti ti-check" />}</span>
                        <div>
                          <div className="att-cal-name">{p.name}</div>
                          {p.detail ? <div className="att-cal-detail">{p.detail} · ID: {p.id}</div> : <div className="att-cal-detail">ID: {p.id}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {selected.length > 0 && (
                  <div className="att-cal-chips">
                    {selected.map((s) => (
                      <span key={s.uid} className="att-cal-chip">
                        {s.name}
                        <i className="ti ti-close" onClick={() => setSelected((cur) => cur.filter((x) => x.uid !== s.uid))} />
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="legacy-modal-footer">
              <span style={{ marginRight: 'auto', fontSize: 13, color: '#64748b', fontWeight: 600 }}>
                {selected.length}/{MAX_CALENDAR_PEOPLE} selected
              </span>
              <button type="button" className="legacy-btn legacy-btn-default" onClick={onClose}>Cancel</button>
              <button
                type="button"
                className="legacy-btn legacy-btn-success"
                disabled={selected.length === 0 || loadingCal}
                onClick={showCalendar}
              >
                <i className="ti ti-calendar" /> {loadingCal ? 'Loading…' : 'Show Calendar'}
              </button>
            </div>
          </div>
        ) : (
          <div className="cv-modal-form form-modal">
            <div className="legacy-modal-body">
              <div className="att-cal-legend">
                <span><span className="att-cal-dot present" style={{ display: 'inline-block', marginRight: 6 }} />Present</span>
                <span><span className="att-cal-dot absent" style={{ display: 'inline-block', marginRight: 6 }} />Absent</span>
              </div>
              <div className="att-cal-grid">
                {WEEKDAYS.map((w) => <div key={w} className="att-cal-dow">{w}</div>)}
                {cells.map((d, idx) => {
                  if (d == null) return <div key={`e-${idx}`} className="att-cal-day empty" />;
                  const cellDate = new Date(year, month - 1, d);
                  const isFuture = cellDate > todayMidnight;
                  return (
                    <div key={d} className="att-cal-day">
                      <div className="att-cal-daynum">{d}</div>
                      {!isFuture && selected.map((s) => {
                        const present = calData[s.uid]?.has(d);
                        return (
                          <div key={s.uid} className="att-cal-row">
                            <span className={`att-cal-dot ${present ? 'present' : 'absent'}`} />
                            {firstName(s.name)}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="legacy-modal-footer">
              <button type="button" className="legacy-btn legacy-btn-default" onClick={() => setView('select')}>
                <i className="ti ti-angle-left" /> Back
              </button>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="legacy-btn legacy-btn-default" onClick={downloadCalendarPDF}>
                  <i className="ti ti-download" /> Download PDF
                </button>
                <button type="button" className="legacy-btn legacy-btn-success" onClick={onClose}>Done</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Monthly Report: pick a month + a batch of people, download a compact ──────
// day-matrix PDF (rows = people, columns = days, green=present / red=absent).
const MAX_REPORT_PEOPLE = 100;

const REPORT_CRITERIA = [
  { value: 'instructors', label: 'All Instructors', icon: 'ti-blackboard', userType: 2 },
  { value: 'staff', label: 'All Staff', icon: 'ti-id-badge', userType: 4 },
  { value: 'mentors', label: 'All Mentors', icon: 'ti-headphone-alt', userType: 3 },
  { value: 'students', label: 'All Students', icon: 'ti-user', userType: 1 },
  { value: 'students_batchwise', label: 'Students - Batchwise', icon: 'ti-layers', userType: 1 },
];

// Resolve each batch's configured default attendance location(s) from the
// /attendance-capture-location mappings. Returns { [batchId]: { anyLocation, names[] } }.
async function fetchBatchDefaultLocations(batchIds) {
  const wanted = new Set((batchIds || []).map(String));
  const out = {};
  if (wanted.size === 0) return out;
  try {
    // location id -> name (for records that only carry locationIds)
    const nameById = {};
    try {
      const lresp = await api.get('/admin/location/list', { params: { size: 100 } });
      const rows = lresp.data?.data || lresp.data?.locations || lresp.data || [];
      (Array.isArray(rows) ? rows : []).forEach((l) => {
        nameById[String(l.id ?? l.code)] = l.name || l.title || l.code;
      });
    } catch (_e) { /* names fall back to ids */ }

    let page = 1;
    for (let i = 0; i < 25; i += 1) {
      const resp = await listDefaultLocations({ subjectType: 'batch', userType: 1, page, size: 200 });
      const records = resp?.data || [];
      records.forEach((r) => {
        const sid = String(r.subjectId ?? '');
        if (!wanted.has(sid)) return;
        let names = [];
        if (Array.isArray(r.locations) && r.locations.length) {
          names = r.locations.map((l) => l.name || l.title || nameById[String(l.id)] || `#${l.id}`);
        } else if (Array.isArray(r.locationIds)) {
          names = r.locationIds.map((id) => nameById[String(id)] || `#${id}`);
        }
        out[sid] = { anyLocation: !!r.anyLocation, names };
      });
      const last = resp?.pagination?.lastPage || 1;
      if (page >= last || records.length === 0) break;
      page += 1;
    }
  } catch (_e) { /* silent — header just omits location info */ }
  return out;
}

function MonthlyReportModal({ onClose, showToast }) {
  const [monthValue, setMonthValue] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const [criteria, setCriteria] = useState('students');
  const [building, setBuilding] = useState(false);

  // Batchwise mode
  const [batches, setBatches] = useState([]);
  const [batchIds, setBatchIds] = useState([]);
  const [batchSearch, setBatchSearch] = useState('');
  const [loadingBatches, setLoadingBatches] = useState(false);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const needBatches = criteria === 'students_batchwise';

  useEffect(() => {
    if (!needBatches) return undefined;
    let cancelled = false;
    setLoadingBatches(true);
    (async () => {
      try {
        const resp = await listBatches({ page: 1, size: 200 });
        if (!cancelled) setBatches(resp?.data || []);
      } catch (_e) {
        if (!cancelled) setBatches([]);
      } finally {
        if (!cancelled) setLoadingBatches(false);
      }
    })();
    return () => { cancelled = true; };
  }, [needBatches]);

  const filteredBatches = useMemo(() => {
    const q = batchSearch.trim().toLowerCase();
    if (!q) return batches;
    return batches.filter((b) => `${b.name || ''} ${b.description || ''}`.toLowerCase().includes(q));
  }, [batches, batchSearch]);

  function toggleBatch(id) {
    setBatchIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  const allBatchesSelected = filteredBatches.length > 0
    && filteredBatches.every((b) => batchIds.includes(b.id));

  function toggleSelectAllBatches() {
    const ids = filteredBatches.map((b) => b.id);
    setBatchIds((cur) => (
      allBatchesSelected
        ? cur.filter((id) => !ids.includes(id))
        : Array.from(new Set([...cur, ...ids]))
    ));
  }

  // Resolve the selected criteria into [{ uid, id, userType, name }].
  async function gatherPeople() {
    const out = [];
    const push = (id, userType, name) => out.push({ uid: `${userType}:${id}`, id, userType, name: name || 'Unknown' });

    if (criteria === 'students_batchwise') {
      if (batchIds.length === 0) return out;
      const resp = await listCandidatesInBatches(batchIds);
      const rows = Array.isArray(resp) ? resp : (resp?.data || []);
      const batchNameById = {};
      batches.forEach((b) => { batchNameById[String(b.id)] = b.name; });
      rows.forEach((c) => {
        const bid = String(c.batchId ?? c.batch?.id ?? '');
        const bname = c.batchName || c.batch?.name || batchNameById[bid] || (bid ? `Batch ${bid}` : 'Batch');
        out.push({ uid: `1:${c.id}`, id: c.id, userType: 1, name: c.name || 'Unknown', batchId: bid, batchName: bname });
      });
    } else if (criteria === 'students') {
      const resp = await listCandidates({ page: 1, size: 500 });
      (resp?.data || []).forEach((c) => push(c.id, 1, c.name));
    } else if (criteria === 'instructors') {
      const { items } = await searchInstructors({ page: 1, size: 200, searchKey: '' });
      (items || []).forEach((i) => push(i.id, 2, i.name));
    } else if (criteria === 'mentors') {
      const resp = await api.get('/admin/people/mentor/list', { params: { page: 1, size: 200, sortBy: 'name' } });
      (resp.data?.data || []).forEach((m) => push(m.id, 3, m.name));
    } else if (criteria === 'staff') {
      const resp = await listUsers({ page: 1, size: 200 });
      (resp?.data || []).forEach((u) => push(u.id, 4, u.name));
    }
    const seen = new Set();
    return out.filter((p) => (seen.has(p.uid) ? false : seen.add(p.uid)));
  }

  async function downloadReport() {
    const [y, m] = monthValue.split('-');
    const year = Number(y); const month = Number(m);
    const daysInMonth = new Date(year, month, 0).getDate();
    const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    const today = new Date(); today.setHours(0, 0, 0, 0);

    setBuilding(true);
    try {
      const people = await gatherPeople();
      if (people.length === 0) {
        showToast('info', 'Nobody found', needBatches ? 'Pick at least one batch.' : 'No people found for this criteria.');
        return;
      }
      const entries = await Promise.all(people.map(async (p) => {
        const resp = await listAttendanceRecords({
          userId: p.id, userType: p.userType, year, month, size: 100, filterBy: 'valid',
        });
        const rows = resp?.data || [];
        const present = new Set(
          rows.filter((r) => Number(r.status) === 1).map((r) => Number(r.dateDay)),
        );
        return [p.uid, present];
      }));
      const present = Object.fromEntries(entries);

      // For batchwise reports, resolve each batch's default attendance location(s).
      let defaultLocByBatch = {};
      if (criteria === 'students_batchwise') {
        defaultLocByBatch = await fetchBatchDefaultLocations(batchIds);
      }

      const esc = (val) => String(val ?? '').replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
      ));
      const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
      const headCells = days.map((d) => `<th>${d}</th>`).join('');
      // Number of days in the month that have actually occurred (exclude future).
      const applicableDays = days.filter((d) => new Date(year, month - 1, d) <= today).length;
      const renderRow = (s) => {
        let presentCount = 0;
        const cells = days.map((d) => {
          const cellDate = new Date(year, month - 1, d);
          if (cellDate > today) return '<td class="future"></td>';
          const ok = present[s.uid]?.has(d);
          if (ok) presentCount += 1;
          return `<td><span class="dot ${ok ? 'present' : 'absent'}"></span></td>`;
        }).join('');
        return `<tr><th class="name">${esc(s.name)}</th>${cells}<td class="total">${presentCount}/${applicableDays}</td></tr>`;
      };

      let bodyRows;
      if (criteria === 'students_batchwise') {
        const colSpan = days.length + 2;
        // Preserve the order batches were selected in, then any stragglers.
        const grouped = new Map();
        batchIds.forEach((bid) => grouped.set(String(bid), []));
        people.forEach((p) => {
          const key = String(p.batchId ?? '');
          if (!grouped.has(key)) grouped.set(key, []);
          grouped.get(key).push(p);
        });
        const parts = [];
        grouped.forEach((students, bid) => {
          if (students.length === 0) return;
          const bname = students[0]?.batchName || 'Batch';
          const loc = defaultLocByBatch[String(bid)];
          let locLabel = '';
          if (loc) {
            locLabel = loc.anyLocation
              ? 'Attendance recorded at any location'
              : (loc.names.length ? `Attendance tracked at ${loc.names.join(', ')}` : '');
          }
          const locHtml = locLabel ? ` <span class="batch-loc">(${esc(locLabel)})</span>` : '';
          parts.push(`<tr class="batch-head"><th class="batch-name" colspan="${colSpan}">${esc(bname)}${locHtml}</th></tr>`);
          students.forEach((s) => parts.push(renderRow(s)));
        });
        bodyRows = parts.join('');
      } else {
        bodyRows = people.map(renderRow).join('');
      }

      const win = window.open('', '_blank');
      if (!win) { showToast('error', 'Popup blocked', 'Allow popups to download the report PDF.'); return; }
      win.document.write(`<!doctype html><html><head><title>Monthly Attendance — ${esc(monthLabel)}</title>
        <style>
          body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#16353c;margin:18px;}
          h1{font-size:17px;margin:0 0 2px;text-transform:uppercase;letter-spacing:.02em;}
          .sub{font-size:11px;color:#6c757d;margin-bottom:4px;}
          .legend{font-size:11px;color:#59757b;margin-bottom:10px;display:flex;gap:16px;}
          .legend .dot{margin-right:5px;}
          table{border-collapse:collapse;width:100%;table-layout:fixed;}
          th,td{border:1px solid #d7e5e8;text-align:center;font-size:9px;padding:2px;}
          thead th{background:#f3f5f6;color:#16353c;font-weight:700;}
          th.name{width:120px;text-align:left;padding:3px 6px;font-size:11px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
          td.future{background:#f8fafc;}
          th.total,td.total{width:42px;font-weight:700;font-size:10px;background:#eef5f6;color:#006073;}
          tr.batch-head th.batch-name{background:#006073;color:#fff;text-align:left;font-size:11px;font-weight:700;padding:5px 8px;text-transform:uppercase;letter-spacing:.02em;}
          tr.batch-head .batch-loc{font-weight:500;font-size:10px;text-transform:none;letter-spacing:0;opacity:.85;}
          .dot{display:inline-block;width:9px;height:9px;border-radius:50%;}
          .dot.present{background:#16a34a;}
          .dot.absent{background:#dc2626;}
          @media print{@page{size:landscape;margin:8mm;}}
        </style></head><body>
        <h1>${esc(monthLabel)}</h1>
        <div class="legend">
          <span><span class="dot present"></span>Present</span>
          <span><span class="dot absent"></span>Absent</span>
        </div>
        <table>
          <thead><tr><th class="name">Name</th>${headCells}<th class="total">All</th></tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
        <script>window.onload=function(){window.print();}<\/script>
        </body></html>`);
      win.document.close();
      showToast('success', 'Report Ready', 'Use your browser dialog to save as PDF.');
    } catch (error) {
      showToast('error', 'Report Failed', apiErrorMessage(error, 'Could not build the monthly report.'));
    } finally {
      setBuilding(false);
    }
  }

  return (
    <div className="legacy-modal-backdrop active" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <style>{`
        .att-cal-tabs { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:14px; }
        .att-cal-tab { display:inline-flex; align-items:center; gap:6px; padding:7px 12px; border:1px solid var(--line,#d7e5e8); border-radius:8px; background:#fff; cursor:pointer; font-size:12px; font-weight:600; color:var(--ink,#16353c); }
        .att-cal-tab.active { background:var(--brand,#006073); border-color:var(--brand,#006073); color:#fff; }
        .att-cal-list { max-height:260px; overflow-y:auto; border:1px solid #e2e8f0; border-radius:10px; }
        .att-cal-person { display:flex; align-items:center; gap:12px; padding:10px 14px; border-bottom:1px solid #f1f5f8; cursor:pointer; }
        .att-cal-person:last-child { border-bottom:none; }
        .att-cal-person:hover { background:#f8fafc; }
        .att-cal-check { width:18px; height:18px; border:1.5px solid #cbd5e1; border-radius:5px; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; color:#fff; font-size:11px; }
        .att-cal-check.on { background:#006073; border-color:#006073; }
        .att-cal-name { font-weight:600; font-size:14px; color:#16353c; }
        .att-cal-detail { font-size:12px; color:#6c757d; }
        .att-cal-chips { display:flex; flex-wrap:wrap; gap:6px; margin-top:12px; }
        .att-cal-chip { display:inline-flex; align-items:center; gap:6px; background:#eef4f5; border-radius:14px; padding:4px 10px; font-size:12px; color:#16353c; }
        .att-cal-chip i { cursor:pointer; color:#6c757d; }
        .att-criteria-radios { display:flex; gap:10px; }
        .att-criteria-radio { display:inline-flex; align-items:center; gap:8px; padding:9px 14px; border:1px solid var(--line,#d7e5e8); border-radius:8px; cursor:pointer; font-size:13px; font-weight:600; color:var(--ink,#16353c); flex:1; }
        .att-criteria-radio.active { border-color:var(--brand,#006073); background:#f1f8f9; }
        .att-selectall-link { display:inline-flex; align-items:center; gap:5px; border:none; background:none; padding:0; cursor:pointer; font-size:12px; font-weight:600; color:#006073; }
        .att-selectall-link:hover { text-decoration:underline; }
        .att-selectall-link i { font-size:14px; }
      `}</style>
      <div className="legacy-modal-dialog" style={{ maxWidth: 560 }} role="dialog" aria-modal="true">
        <div className="legacy-modal-header">
          <h3><i className="ti ti-calendar-stats" /> Monthly Report</h3>
          <button type="button" className="legacy-modal-close" onClick={onClose}><i className="ti ti-close" /></button>
        </div>
        <div className="mr-modal-form form-modal">
          <div className="legacy-modal-body">

            <div className="asset-form-section">
              <div className="asset-form-section-title"><i className="ti ti-calendar" /> Report Period</div>
              <div className="asset-form-grid">
                <label className="field-cell full-span">
                  <div className="float-field float-always">
                    <input
                      type="month"
                      className="float-control"
                      value={monthValue}
                      onChange={(e) => setMonthValue(e.target.value)}
                      onClick={openDatePicker}
                    />
                    <span className="float-label">Month &amp; Year</span>
                  </div>
                </label>
              </div>
            </div>

            <div className="asset-form-section">
              <div className="asset-form-section-title" style={{ justifyContent: 'space-between' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><i className="ti ti-filter" /> Report Criteria</span>
                {needBatches && filteredBatches.length > 0 && (
                  <button type="button" className="att-selectall-link" onClick={toggleSelectAllBatches}>
                    {allBatchesSelected ? 'Clear all' : 'Select all'}
                  </button>
                )}
              </div>
              <div className="asset-form-grid">
                <label className="field-cell full-span">
                  <div className="float-field float-always">
                    <select className="float-control" value={criteria} onChange={(e) => setCriteria(e.target.value)}>
                      {REPORT_CRITERIA.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                    <span className="float-label">Criteria</span>
                  </div>
                </label>
              </div>

              {needBatches && (
                <>
                  <div className="search-wrapper" style={{ margin: '12px 0' }}>
                    <i className="ti ti-search search-icon" />
                    <input
                      type="text"
                      className="search-input"
                      value={batchSearch}
                      onChange={(e) => setBatchSearch(e.target.value)}
                      placeholder="Search batches…"
                    />
                  </div>
                  <div className="att-cal-list">
                    {loadingBatches ? (
                      <div style={{ padding: '14px', color: '#6c757d', fontSize: 13, textAlign: 'center' }}>Loading batches…</div>
                    ) : filteredBatches.length === 0 ? (
                      <div style={{ padding: '14px', color: '#6c757d', fontSize: 13, textAlign: 'center' }}>No batches found.</div>
                    ) : filteredBatches.map((b) => {
                      const checked = batchIds.includes(b.id);
                      return (
                        <div key={b.id} className="att-cal-person" onClick={() => toggleBatch(b.id)}>
                          <span className={`att-cal-check${checked ? ' on' : ''}`}>{checked && <i className="ti ti-check" />}</span>
                          <div>
                            <div className="att-cal-name">{b.name || 'Unnamed batch'}</div>
                            {b.description ? <div className="att-cal-detail">{b.description}</div> : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

          </div>
          <div className="legacy-modal-footer">
            <span style={{ marginRight: 'auto', fontSize: 13, color: '#64748b', fontWeight: 600 }}>
              {needBatches
                ? `${batchIds.length} batch${batchIds.length === 1 ? '' : 'es'} selected`
                : REPORT_CRITERIA.find((c) => c.value === criteria)?.label}
            </span>
            <button type="button" className="legacy-btn legacy-btn-default" onClick={onClose}>Cancel</button>
            <button
              type="button"
              className="legacy-btn legacy-btn-success"
              disabled={building || (needBatches && batchIds.length === 0)}
              onClick={downloadReport}
            >
              <i className="ti ti-download" /> {building ? 'Building…' : 'Download PDF'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notify Parents — pick batches + a date, preview absentees, notify via WhatsApp
// ---------------------------------------------------------------------------
function NotifyParentsModal({ onClose, showToast }) {
  const [batches, setBatches] = useState([]);
  const [batchSearch, setBatchSearch] = useState('');
  const [selectedBatchIds, setSelectedBatchIds] = useState([]);
  const [dateValue, setDateValue] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [preview, setPreview] = useState(null); // { groups: [{ batchId, batchName, students:[{id,name}] }], total }
  const [building, setBuilding] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoadingBatches(true);
    (async () => {
      try {
        const resp = await listBatches({ page: 1, size: 200 });
        if (!cancelled) setBatches(resp?.data || []);
      } catch (_e) {
        if (!cancelled) setBatches([]);
      } finally {
        if (!cancelled) setLoadingBatches(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filteredBatches = useMemo(() => {
    const q = batchSearch.trim().toLowerCase();
    if (!q) return batches;
    return batches.filter((b) => `${b.name || ''} ${b.description || ''}`.toLowerCase().includes(q));
  }, [batches, batchSearch]);

  const batchById = useMemo(() => {
    const map = {};
    batches.forEach((b) => { map[String(b.id)] = b; });
    return map;
  }, [batches]);

  function toggleBatch(id) {
    const key = String(id);
    setPreview(null);
    setSelectedBatchIds((cur) => (
      cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key]
    ));
  }

  const allFilteredSelected = filteredBatches.length > 0
    && filteredBatches.every((b) => selectedBatchIds.includes(String(b.id)));

  function toggleSelectAll() {
    setPreview(null);
    const ids = filteredBatches.map((b) => String(b.id));
    setSelectedBatchIds((cur) => {
      if (allFilteredSelected) return cur.filter((x) => !ids.includes(x));
      const set = new Set(cur);
      ids.forEach((id) => set.add(id));
      return Array.from(set);
    });
  }

  // Returns a Set of String(userId) present (status valid) for the given day.
  async function fetchPresentSet(year, month, day) {
    const present = new Set();
    let page = 1;
    const size = 200;
    // safety cap to avoid runaway pagination
    for (let i = 0; i < 25; i += 1) {
      const resp = await listAttendanceRecords({
        userType: 1, year, month, day, filterBy: 'valid', size, page,
      });
      const rows = resp?.data || [];
      rows.forEach((r) => { if (Number(r.status) === 1) present.add(String(r.userId)); });
      const last = resp?.pagination?.lastPage || 1;
      if (page >= last || rows.length === 0) break;
      page += 1;
    }
    return present;
  }

  async function runPreview() {
    if (selectedBatchIds.length === 0) {
      showToast('info', 'No batch selected', 'Pick at least one batch.');
      return;
    }
    if (!dateValue) {
      showToast('info', 'No date', 'Pick a date.');
      return;
    }
    const [y, m, d] = dateValue.split('-').map(Number);
    setBuilding(true);
    try {
      const [candResp, present] = await Promise.all([
        listCandidatesInBatches(selectedBatchIds),
        fetchPresentSet(y, m, d),
      ]);
      const candidates = candResp?.data || [];
      // Group absentees by batch
      const groupMap = new Map();
      selectedBatchIds.forEach((bid) => {
        groupMap.set(bid, {
          batchId: bid,
          batchName: batchById[bid]?.name || `Batch ${bid}`,
          students: [],
        });
      });
      candidates.forEach((c) => {
        const id = c.id ?? c.candidateId ?? c.candidateKey;
        if (id == null) return;
        const isPresent = present.has(String(id));
        if (isPresent) return; // only absentees
        const bid = String(c.batchId ?? c.batch?.id ?? '');
        const group = groupMap.get(bid) || groupMap.get(selectedBatchIds[0]);
        if (!group) return;
        group.students.push({ id, name: c.name || `#${id}` });
      });
      const groups = Array.from(groupMap.values())
        .map((g) => ({ ...g, students: g.students.sort((a, b) => Number(a.id) - Number(b.id)) }))
        .filter((g) => g.students.length > 0);
      const total = groups.reduce((acc, g) => acc + g.students.length, 0);
      setPreview({ groups, total });
      if (total === 0) showToast('success', 'No absentees', 'Everyone in the selected batches was present.');
    } catch (error) {
      showToast('error', 'Preview Failed', apiErrorMessage(error, 'Could not load attendance for that day.'));
    } finally {
      setBuilding(false);
    }
  }

  async function notifyParents() {
    if (!preview || preview.total === 0) return;
    // Build the wrapper payload: date as DD-MM-YYYY, absentees grouped by batch.
    const [y, m, d] = dateValue.split('-');
    const date = `${d}-${m}-${y}`;
    const data = preview.groups
      .map((g) => ({
        batch: Number(g.batchId),
        absentees: g.students.map((s) => Number(s.id)),
      }))
      .filter((g) => g.absentees.length > 0);
    const total = data.reduce((acc, g) => acc + g.absentees.length, 0);
    setSending(true);
    try {
      // The wrapper logs to attendance_notification_log (de-duping repeat
      // notifications for the same student/date) and then internally calls the
      // campaign API — so we don't hit createCampaign directly here.
      await sendParentNotification({ date, data });
      showToast('success', 'Parents Notified', `WhatsApp alert queued for ${total} ${total === 1 ? 'parent' : 'parents'}.`);
      onClose();
    } catch (error) {
      showToast('error', 'Notify Failed', apiErrorMessage(error, 'Could not send notifications.'));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="legacy-modal-backdrop active" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <style>{`
        .np-selectall { background:none; border:none; color:#006073; font-size:12px; font-weight:700; cursor:pointer; padding:0; }
        .np-selectall:disabled { color:#94a3b8; cursor:default; }
        .np-bsearch { margin-bottom: 10px; }
        .np-blist { max-height: 200px; overflow-y: auto; border:1px solid #e2e8f0; border-radius:10px; }
        .np-bcheck { display:flex; align-items:center; gap:12px; padding:9px 14px; border-bottom:1px solid #f1f5f8; cursor:pointer; }
        .np-bcheck:last-child { border-bottom:none; }
        .np-bcheck:hover { background:#f8fafc; }
        .np-check { width:18px; height:18px; border:1.5px solid #cbd5e1; border-radius:5px; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; color:#fff; font-size:11px; }
        .np-check.on { background:#006073; border-color:#006073; }
        .np-bname { font-weight:600; font-size:14px; color:#16353c; }
        .np-bdesc { font-size:12px; color:#6c757d; }
        .np-preview { margin-top:16px; border:1px solid #e2e8f0; border-radius:10px; padding:14px; background:#fbfdfd; }
        .np-preview-head { font-size:13px; font-weight:700; color:#16353c; margin-bottom:10px; display:flex; align-items:center; gap:8px; }
        .np-preview-head .np-count { background:#dc2626; color:#fff; border-radius:12px; padding:1px 9px; font-size:12px; }
        .np-grp { margin-bottom:10px; }
        .np-grp:last-child { margin-bottom:0; }
        .np-grp-name { font-size:12px; font-weight:700; color:#006073; margin-bottom:3px; }
        .np-grp-students { font-size:13px; color:#16353c; line-height:1.5; }
        .np-grp-student { padding:3px 0; border-bottom:1px solid #eef3f4; }
        .np-grp-student:last-child { border-bottom:none; }
        .np-grp-id { display:inline-block; min-width:48px; font-weight:600; color:#64748b; }
        .np-empty { font-size:13px; color:#16a34a; font-weight:600; }
      `}</style>
      <div className="legacy-modal-dialog" style={{ maxWidth: 560 }} role="dialog" aria-modal="true">
        <div className="legacy-modal-header">
          <h3><i className="ti ti-send" /> Notify Parents</h3>
          <button type="button" className="legacy-modal-close" onClick={onClose}><i className="ti ti-close" /></button>
        </div>
        <div className="np-modal-form form-modal">
          <div className="legacy-modal-body">

            <div className="asset-form-section">
              <div className="asset-form-section-title"><i className="ti ti-calendar" /> Attendance Date</div>
              <div className="asset-form-grid">
                <label className="field-cell full-span">
                  <div className="float-field float-always date-custom">
                    <input
                      type="date"
                      className="float-control"
                      value={dateValue}
                      onChange={(e) => { setDateValue(e.target.value); setPreview(null); }}
                      onClick={openDatePicker}
                      onKeyDown={openDatePicker}
                    />
                    <span className="float-label">Date</span>
                    <span className={`date-display ${!dateValue ? 'is-empty' : ''}`}>
                      {dateValue ? formatDateLabel(dateValue) : 'Set a Date'}
                    </span>
                  </div>
                </label>
              </div>
            </div>

            <div className="asset-form-section">
              <div className="asset-form-section-title" style={{ justifyContent: 'space-between' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><i className="ti ti-user" /> Batches</span>
                <button
                  type="button"
                  className="np-selectall"
                  disabled={loadingBatches || filteredBatches.length === 0}
                  onClick={toggleSelectAll}
                >
                  {allFilteredSelected ? 'Clear All' : 'Select All'}
                </button>
              </div>
              <div className="search-wrapper np-bsearch">
                <i className="ti ti-search search-icon" />
                <input
                  type="text"
                  className="search-input"
                  value={batchSearch}
                  onChange={(e) => setBatchSearch(e.target.value)}
                  placeholder="Search batches…"
                />
              </div>
              <div className="np-blist">
                {loadingBatches ? (
                  <div style={{ padding: '14px', color: '#6c757d', fontSize: 13, textAlign: 'center' }}>Loading batches…</div>
                ) : filteredBatches.length === 0 ? (
                  <div style={{ padding: '14px', color: '#6c757d', fontSize: 13, textAlign: 'center' }}>No batches found.</div>
                ) : filteredBatches.map((b) => {
                  const checked = selectedBatchIds.includes(String(b.id));
                  return (
                    <div key={b.id} className="np-bcheck" onClick={() => toggleBatch(b.id)}>
                      <span className={`np-check${checked ? ' on' : ''}`}>{checked && <i className="ti ti-check" />}</span>
                      <div>
                        <div className="np-bname">{b.name}</div>
                        {b.description ? <div className="np-bdesc">{b.description}</div> : null}
                      </div>
                    </div>
                  );
                })}
              </div>

              {preview && (
                <div className="np-preview">
                  <div className="np-preview-head">
                    Absentees <span className="np-count">{preview.total}</span>
                  </div>
                  {preview.total === 0 ? (
                    <div className="np-empty"><i className="ti ti-circle-check" /> No absentees for the selected batches.</div>
                  ) : (
                    preview.groups.map((g) => (
                      <div key={g.batchId} className="np-grp">
                        <div className="np-grp-name">{g.batchName}</div>
                        <div className="np-grp-students">
                          {g.students.map((s) => (
                            <div key={s.id} className="np-grp-student">
                              <span className="np-grp-id">{s.id}</span> {s.name}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

          </div>
          <div className="legacy-modal-footer">
            <span style={{ marginRight: 'auto', fontSize: 13, color: '#64748b', fontWeight: 600 }}>
              {selectedBatchIds.length} {selectedBatchIds.length === 1 ? 'batch' : 'batches'} selected
            </span>
            <button type="button" className="legacy-btn legacy-btn-default" onClick={onClose}>Cancel</button>
            {!preview || preview.total === 0 ? (
              <button
                type="button"
                className="legacy-btn legacy-btn-primary"
                disabled={selectedBatchIds.length === 0 || building}
                onClick={runPreview}
              >
                <i className="ti ti-eye" /> {building ? 'Loading…' : 'Preview'}
              </button>
            ) : (
              <button
                type="button"
                className="legacy-btn legacy-btn-success"
                disabled={sending}
                onClick={notifyParents}
              >
                <i className="ti ti-brand-whatsapp" /> {sending ? 'Sending…' : `Notify Parents (${preview.total})`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
