import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ToastRegion from '../components/ToastRegion';
import {
  EVENT_TYPES, CONTENT_BOUND_TYPES,
  SUMMARY_CATEGORIES as CATEGORIES,
  categorizeEvents as categorize,
  fmtCompactDuration as fmtCompact,
  findExamRef, findQuizRef, findChapterRef,
  dateKey, parseKey, addDays, prettyDate,
  useSchedules, useLookups,
  loadLookups, loadSchedulesInRange,
  updateScheduleMeta as storeUpdateMeta,
  deleteSchedule as storeDelete,
  copyEventsBetweenSchedules as storeCopyEvents,
  asApiError,
} from '../lib/schedulesStore';
import Icon from '../components/Icon';

const FILTER_OPTIONS = [
  { id: 'today',    label: 'Today' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'range',    label: 'Date range' },
];

export default function SchedulesListPage() {
  const navigate = useNavigate();
  const schedules = useSchedules();
  const today = useMemo(() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; }, []);

  const [filter, setFilter] = useState('today');
  const [rangeFrom, setRangeFrom] = useState(() => dateKey(today));
  const [rangeTo, setRangeTo] = useState(() => dateKey(addDays(today, 6)));
  const [batchFilter, setBatchFilter] = useState(''); // batch id
  const [search, setSearch] = useState('');
  const [dateMenuOpen, setDateMenuOpen] = useState(false);
  const dateMenuRef = useRef(null);
  const [loading, setLoading] = useState(true);

  const [editModal, setEditModal] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(null);
  const [toasts, setToasts] = useState([]);
  const lookups = useLookups();
  const batchPool = lookups.batches || [];

  function showToast(type, title, message) {
    const id = Date.now() + Math.random();
    setToasts((cur) => [...cur, { id, type, title, message }]);
    window.setTimeout(() => setToasts((cur) => cur.filter((t) => t.id !== id)), 4000);
  }

  // ─── Range computed from filter ──
  const { fromKey, toKey } = useMemo(() => {
    if (filter === 'today') {
      const k = dateKey(today);
      return { fromKey: k, toKey: k };
    }
    if (filter === 'tomorrow') {
      const k = dateKey(addDays(today, 1));
      return { fromKey: k, toKey: k };
    }
    return { fromKey: rangeFrom, toKey: rangeTo };
  }, [filter, rangeFrom, rangeTo, today]);

  // Close the date dropdown on outside click / Escape.
  useEffect(() => {
    if (!dateMenuOpen) return undefined;
    function onDown(e) { if (!dateMenuRef.current?.contains(e.target)) setDateMenuOpen(false); }
    function onKey(e) { if (e.key === 'Escape') setDateMenuOpen(false); }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [dateMenuOpen]);

  const dateLabel = (() => {
    if (filter === 'today') return 'Today';
    if (filter === 'tomorrow') return 'Tomorrow';
    return `${prettyDate(rangeFrom)} – ${prettyDate(rangeTo)}`;
  })();

  function setDatePreset(id) {
    setFilter(id);
    if (id !== 'range') setDateMenuOpen(false);
  }

  // ─── Filtered / grouped data ──
  const groupsByDate = useMemo(() => {
    const out = new Map();
    const from = parseKey(fromKey).getTime();
    const to = parseKey(toKey).getTime();
    schedules.forEach((s) => {
      const t = parseKey(s.date).getTime();
      if (t < from || t > to) return;
      if (batchFilter && !s.batches.some((b) => String(b.id) === String(batchFilter))) return;
      if (search) {
        const q = search.toLowerCase();
        const names = s.batches.map((b) => b.name).join(',');
        const hit = s.name.toLowerCase().includes(q) || names.toLowerCase().includes(q);
        if (!hit) return;
      }
      if (!out.has(s.date)) out.set(s.date, []);
      out.get(s.date).push(s);
    });
    // Sort each day's schedules: published first, then by name
    for (const [, arr] of out) {
      arr.sort((a, b) => (a.published === b.published ? a.name.localeCompare(b.name) : a.published ? -1 : 1));
    }
    // Return sorted by date asc
    return new Map([...out.entries()].sort((a, b) => a[0].localeCompare(b[0])));
  }, [schedules, fromKey, toKey, batchFilter, search]);

  const totalCount = Array.from(groupsByDate.values()).reduce((a, b) => a + b.length, 0);

  // Load lookups once and reload schedules whenever the visible range changes.
  useEffect(() => {
    loadLookups().catch((e) => showToast('error', 'Failed to load lookups', asApiError(e).message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    setLoading(true);
    loadSchedulesInRange({ from: fromKey, to: toKey })
      .catch((e) => showToast('error', 'Failed to load schedules', asApiError(e).message))
      .finally(() => setLoading(false));
  }, [fromKey, toKey]);

  // ─── Actions ──
  function viewSchedule(s) {
    navigate(`/schedules?focus=${encodeURIComponent(s.id)}`);
  }
  function createNew() {
    navigate(`/schedules?new=1`);
  }
  function viewDayCalendar(dk) {
    navigate(`/schedules?date=${encodeURIComponent(dk)}`);
  }
  async function cancelSchedule(id) {
    try {
      await storeDelete(id);
      setConfirmCancel(null);
      showToast('success', 'Schedule cancelled', '');
    } catch (e) {
      showToast('error', 'Failed to cancel', asApiError(e).message);
    }
  }

  return (
    <section className="schedules-list-page data-table-page" style={{ position: 'relative', minHeight: '100vh', paddingBottom: 40 }}>
      <ToastRegion toasts={toasts} onDismiss={(id) => setToasts((cur) => cur.filter((t) => t.id !== id))} />

      {/* Page header */}
      <div className="page-header-section">
        <div className="page-header-title-group">
          <span className="page-header-icon-box"><Icon className="fa fa-calendar" /></span>
          <div>
            <h2>Schedules</h2>
            <p>All planned day-schedules across batches. Pick a row to view it on the calendar.</p>
          </div>
        </div>
        <button type="button" className="page-action-button" onClick={createNew}>
          <Icon className="ti ti-plus" /> New schedule
        </button>
      </div>

      {/* Filter bar */}
      <div style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <style>{`
          .fb-date-menu { position:relative; }
          .fb-date-btn { display:flex; align-items:center; justify-content:space-between; gap:8px; min-width:170px; padding:9px 12px; border:1px solid var(--line,#d7e5e8); border-radius:8px; background:#fff; font-size:13px; font-weight:600; color:var(--ink,#16353c); cursor:pointer; outline:none; }
          .fb-date-btn.active { border-color:var(--brand); }
          .fb-date-lbl { display:flex; align-items:center; gap:6px; }
          .fb-date-lbl i { color:#6b7280; font-size:14px; }
          .fb-date-pop { position:absolute; top:calc(100% + 4px); left:0; z-index:40; min-width:200px; background:#fff; border:1px solid var(--line,#d7e5e8); border-radius:8px; box-shadow:0 8px 20px rgba(0,0,0,0.12); overflow:hidden; }
          .fb-date-opt { display:flex; align-items:center; justify-content:space-between; width:100%; padding:9px 14px; border:none; background:#fff; color:#374151; font-size:13px; text-align:left; cursor:pointer; }
          .fb-date-opt:hover { background:#f3f8f9; }
          .fb-date-opt.on { background:#e0f2f1; font-weight:600; }
          .fb-date-opt.on i { color:var(--brand); font-size:12px; }
          .fb-date-opt-custom { border-top:1px solid #f1f5f9; }
        `}</style>
        <div className="search-wrapper" style={{ flex: '1 1 50%', minWidth: 240 }}>
          <Icon className="ti ti-search" />
          <input
            type="text" className="search-input"
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or batch…"
          />
        </div>
        <div ref={dateMenuRef} className="fb-date-menu">
          <button
            type="button"
            className={`fb-date-btn${filter !== 'today' ? ' active' : ''}`}
            onClick={() => setDateMenuOpen((o) => !o)}
          >
            <span className="fb-date-lbl"><Icon className="ti ti-calendar" /> {dateLabel}</span>
            <Icon className={`ti ti-chevron-${dateMenuOpen ? 'up' : 'down'}`} style={{ fontSize: 12 }} />
          </button>
          {dateMenuOpen && (
            <div className="fb-date-pop">
              {FILTER_OPTIONS.filter((o) => o.id !== 'range').map((o) => {
                const isOn = filter === o.id;
                return (
                  <button key={o.id} type="button" className={`fb-date-opt${isOn ? ' on' : ''}`} onClick={() => setDatePreset(o.id)}>
                    {o.label}
                    {isOn && <Icon className="ti ti-check" />}
                  </button>
                );
              })}
              <button type="button" className={`fb-date-opt fb-date-opt-custom${filter === 'range' ? ' on' : ''}`} onClick={() => setDatePreset('range')}>
                Date range
                {filter === 'range' && <Icon className="ti ti-check" />}
              </button>
              {filter === 'range' && (
                <div style={{ padding: '10px 14px', borderTop: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280' }}>From
                    <input type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} style={{ ...inputStyle, width: '100%', marginTop: 3 }} />
                  </label>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280' }}>To
                    <input type="date" value={rangeTo} max={dateKey(addDays(parseKey(rangeFrom), 90))} onChange={(e) => setRangeTo(e.target.value)} style={{ ...inputStyle, width: '100%', marginTop: 3 }} />
                  </label>
                  <button
                    type="button"
                    className="crispr-btn crispr-btn-primary"
                    style={{ alignSelf: 'flex-end', padding: '5px 12px', fontSize: 12 }}
                    onClick={() => setDateMenuOpen(false)}
                  >
                    Apply
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <select value={batchFilter} onChange={(e) => setBatchFilter(e.target.value)} style={{ ...selStyle, width: 'auto', minWidth: 200, paddingRight: 28 }}>
          <option value="">All batches</option>
          {batchPool.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      {/* Table sections */}
      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14 }}>
        {loading && <ScheduleListSkeleton />}

        {!loading && totalCount === 0 && (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--muted)' }}>
            <Icon className="ti ti-calendar-x" style={{ fontSize: 28, color: 'var(--muted)', display: 'block', marginBottom: 8 }} />
            <div style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>No schedules in this range</div>
            <div style={{ fontSize: 13 }}>Try a different date filter, or create a new schedule.</div>
          </div>
        )}

        {!loading && [...groupsByDate.entries()].map(([dk, list], idx) => (
          <DayGroup
            key={dk}
            dateKey={dk}
            schedules={list}
            isFirst={idx === 0}
            onView={viewSchedule}
            onViewCalendar={viewDayCalendar}
            onEdit={(s) => setEditModal({ schedule: s })}
            onCancel={(s) => setConfirmCancel({ schedule: s })}
          />
        ))}
      </div>

      {editModal && (
        <EditModal
          schedule={editModal.schedule}
          allSchedules={schedules}
          batchPool={batchPool}
          onClose={() => setEditModal(null)}
          onSave={async (payload) => {
            const { copyFromId, id, ...metaRest } = payload;
            try {
              await storeUpdateMeta(id, metaRest);
              let copyMsg = '';
              if (copyFromId) {
                const n = await storeCopyEvents(id, copyFromId);
                copyMsg = n ? ` Copied ${n} event(s).` : '';
              }
              setEditModal(null);
              showToast('success', 'Schedule updated', `${metaRest.name}.${copyMsg}`);
            } catch (e) {
              const err = asApiError(e);
              const batchName = (id) => batchPool.find((b) => String(b.id) === String(id))?.name || id;
              switch (err.code) {
                case 'batch_date_unique': {
                  const c = err.details?.conflicts?.[0];
                  showToast('error', 'Batch conflict', c
                    ? `${batchName(c.batch_id)} is already in "${c.schedule_name}".`
                    : err.message);
                  break;
                }
                case 'content_duplication_required':
                  showToast('error', 'Confirm needed', 'Source has shared-content events. Re-open the modal to confirm.');
                  break;
                case 'event_overlap':
                  showToast('error', 'Time overlap', err.message);
                  break;
                case 'published_immutable':
                  showToast('error', 'Published', 'This schedule is published — unpublish to edit.');
                  break;
                default:
                  showToast('error', 'Save failed', err.message);
              }
            }
          }}
        />
      )}
      {confirmCancel && (
        <ConfirmModal
          title="Cancel this schedule?"
          message={
            <>
              <strong style={{ color: 'var(--ink)' }}>{confirmCancel.schedule.name}</strong> on <strong style={{ color: 'var(--ink)' }}>{prettyDate(confirmCancel.schedule.date)}</strong> will be removed
              {confirmCancel.schedule.batches.length > 0 && <> for {confirmCancel.schedule.batches.map((b) => b.name).join(', ')}</>}. This cannot be undone.
            </>
          }
          confirmLabel="Cancel schedule"
          confirmStyle={btnDanger}
          onCancel={() => setConfirmCancel(null)}
          onConfirm={() => cancelSchedule(confirmCancel.schedule.id)}
        />
      )}
    </section>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────
function ScheduleListSkeleton({ groups = 2, rows = 3 }) {
  return (
    <>
      {Array.from({ length: groups }).map((_, gi) => (
        <div key={gi} style={{ borderTop: gi === 0 ? 'none' : '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: '#fbfcfd', borderBottom: '1px solid var(--line)', borderTopLeftRadius: gi === 0 ? 13 : 0, borderTopRightRadius: gi === 0 ? 13 : 0 }}>
            <div className="table-skeleton medium" />
            <div className="table-skeleton long" style={{ height: 30, borderRadius: 8 }} />
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <tbody>
              {Array.from({ length: rows }).map((__, ri) => (
                <tr key={ri} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={tdStyle}><div className="table-skeleton long" /></td>
                  <td style={tdStyle}><div className="table-skeleton medium" /></td>
                  <td style={tdStyle}><div className="table-skeleton short" /></td>
                  <td style={tdStyle}><div className="table-skeleton short" /></td>
                  <td style={tdStyle}><div className="table-skeleton icon" style={{ marginLeft: 'auto', width: 34, height: 34, borderRadius: 8 }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}

// ─── Day group ────────────────────────────────────────────────────────
function DayGroup({ dateKey: dk, schedules, isFirst, onView, onViewCalendar, onEdit, onCancel }) {
  const totalEvents = schedules.reduce((a, s) => a + s.events.length, 0);
  return (
    <div style={{ borderTop: isFirst ? 'none' : '1px solid var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: '#fbfcfd', borderBottom: '1px solid var(--line)', borderTopLeftRadius: isFirst ? 13 : 0, borderTopRightRadius: isFirst ? 13 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon className="ti ti-calendar" style={{ color: 'var(--brand)' }} />
          <div style={{ fontWeight: 700, color: 'var(--ink)', fontSize: 15 }}>{prettyDate(dk)}</div>
          <span style={{ background: '#fff', border: '1px solid var(--line)', color: 'var(--muted)', borderRadius: 999, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>
            {schedules.length} schedule{schedules.length === 1 ? '' : 's'} · {totalEvents} event{totalEvents === 1 ? '' : 's'}
          </span>
        </div>
        <button type="button" onClick={() => onViewCalendar(dk)} style={{ ...btnGhost, background: '#005d6e', color: '#fff', borderColor: '#005d6e' }}>
          <Icon className="ti ti-layout-grid2" /> View day on calendar
        </button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#fff', color: 'var(--muted)', textAlign: 'left' }}>
            <th style={thStyle}>Schedule</th>
            <th style={thStyle}>Linked batches</th>
            <th style={{ ...thStyle, width: 110 }}>Status</th>
            <th style={{ ...thStyle, width: 80 }}>Events</th>
            <th style={{ ...thStyle, width: 220, textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {schedules.map((s) => <ScheduleRow key={s.id} schedule={s} onView={onView} onEdit={onEdit} onCancel={onCancel} />)}
        </tbody>
      </table>
    </div>
  );
}

function ScheduleRow({ schedule: s, onView, onEdit, onCancel }) {
  const totals = useMemo(() => categorize(s.events), [s.events]);
  const summaryParts = CATEGORIES
    .map((cat) => ({ ...cat, value: fmtCompact(totals[cat.key]) }))
    .filter((p) => p.value);
  const totalMins = totals.CLASSES + totals.EXAMS + totals.LIVE;
  return (
    <tr style={{ borderTop: '1px solid var(--line)' }}>
      <td style={tdStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon className="ti ti-layers" style={{ color: 'var(--brand)' }} />
          <div>
            <button type="button" onClick={() => onView(s)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 14, fontWeight: 700, color: 'var(--ink)', textAlign: 'left' }}>
              {s.name}
            </button>
            <div style={{ marginTop: 4, fontSize: 12, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
              {summaryParts.length === 0 ? (
                <em style={{ color: 'var(--muted)' }}>No events yet</em>
              ) : (
                <>
                  {summaryParts.map((p) => (
                    <span key={p.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                      <span style={{ width: 8, height: 8, borderRadius: 999, background: p.color, flexShrink: 0 }} />
                      <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{p.value}</span>
                      <span style={{ color: 'var(--muted)' }}>{p.label.toLowerCase()}</span>
                    </span>
                  ))}
                  {totalMins > 0 && (
                    <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>
                      ({fmtCompact(totalMins)} total)
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </td>
      <td style={tdStyle}>
        {s.batches.length === 0 ? <em style={{ color: 'var(--muted)' }}>No batches linked</em> : (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {s.batches.map((b) => (
              <span key={b.id} style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 999, background: '#eaf3f5', color: 'var(--brand)', border: '1px solid #c8e0e3' }}>{b.name}</span>
            ))}
          </div>
        )}
      </td>
      <td style={tdStyle}>
        {s.published ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#d1fae5', color: '#047857', borderRadius: 999, padding: '3px 9px', fontSize: 11, fontWeight: 700 }}>
            <Icon className="ti ti-check" /> PUBLISHED
          </span>
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#eaf3f5', color: 'var(--brand)', borderRadius: 999, padding: '3px 9px', fontSize: 11, fontWeight: 700 }}>
            <Icon className="ti ti-pencil" /> DRAFT
          </span>
        )}
      </td>
      <td style={tdStyle}>
        <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{s.events.length}</span>
      </td>
      <td style={{ ...tdStyle, textAlign: 'right' }}>
        <ScheduleKebab schedule={s} onView={onView} onEdit={onEdit} onCancel={onCancel} />
      </td>
    </tr>
  );
}

// ─── Row actions as kebab dropdown ───────────────────────────────────
function ScheduleKebab({ schedule: s, onView, onEdit, onCancel }) {
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
          onClick={() => { setOpen(false); onView(s); }}
        >
          <Icon className="ti ti-eye" /> View
        </button>
        <button
          type="button"
          className="kebab-dropdown-item"
          disabled={s.published}
          title={s.published ? 'Published schedules cannot be edited' : 'Edit details'}
          onClick={() => { setOpen(false); onEdit(s); }}
        >
          <Icon className="ti ti-pencil" /> Edit
        </button>
        <button
          type="button"
          className="kebab-dropdown-item danger-action"
          onClick={() => { setOpen(false); onCancel(s); }}
        >
          <Icon className="ti ti-trash" /> Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Edit modal (meta + optional copy-from) ───────────────────────────
function EditModal({ schedule, allSchedules, batchPool, onClose, onSave }) {
  const published = !!schedule.published;
  const [name, setName] = useState(schedule.name);
  const [date, setDate] = useState(schedule.date);
  // batches stored as id[] internally to match API expectations.
  const [batchIds, setBatchIds] = useState(() => schedule.batches.map((b) => String(b.id)));
  const [copyFromId, setCopyFromId] = useState('');
  const [pendingCopy, setPendingCopy] = useState(null);

  const copyCandidates = useMemo(() => allSchedules
    .filter((x) => x.id !== schedule.id && x.events.length > 0)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date)),
  [allSchedules, schedule]);

  const source = useMemo(() => allSchedules.find((x) => x.id === copyFromId) || null, [allSchedules, copyFromId]);
  const sourceBound = useMemo(
    () => source ? source.events.filter((e) => CONTENT_BOUND_TYPES.has(e.type)) : [],
    [source]
  );

  function toggle(bId) {
    const k = String(bId);
    setBatchIds((cur) => cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]);
  }
  function conflictFor(bId) {
    return (allSchedules || []).find((s) => s.id !== schedule.id && s.date === date
      && s.batches.some((bb) => String(bb.id) === String(bId))) || null;
  }

  function buildPayload() {
    return { id: schedule.id, name: name.trim(), date, batch_ids: batchIds, copyFromId: published ? '' : copyFromId };
  }
  function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    const payload = buildPayload();
    if (payload.copyFromId && sourceBound.length > 0) {
      setPendingCopy(payload);
      return;
    }
    onSave(payload);
  }

  if (pendingCopy) {
    return (
      <Modal title="Copy shared content?" onClose={() => setPendingCopy(null)} maxWidth={520}>
        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: 14, marginBottom: 14, display: 'flex', gap: 12 }}>
          <Icon className="ti ti-alert" style={{ color: '#c2410c', fontSize: 22, lineHeight: 1, marginTop: 2 }} />
          <div style={{ color: '#7c2d12', fontSize: 13, lineHeight: 1.5 }}>
            You're copying events from <strong>{source.name}</strong> ({source.date}). Some of them reference shared content — the new schedule will point to the <strong>same exam/quiz/recording</strong>, so students would see identical material.
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600, marginBottom: 6 }}>Shared-content events</div>
        <ul style={{ margin: 0, padding: '0 0 0 18px', color: 'var(--ink)', fontSize: 13 }}>
          {sourceBound.map((e) => {
            const meta = EVENT_TYPES[e.type];
            const ref = describeContent(e);
            return (
              <li key={e.id} style={{ padding: '4px 0' }}>
                <span style={{ color: meta.color, fontWeight: 700 }}><Icon className={`ti ${meta.icon}`} style={{ marginRight: 4 }} />{meta.label}</span>
                {' — '}{e.title}
                {ref && <span style={{ color: 'var(--muted)' }}> · {ref}</span>}
              </li>
            );
          })}
        </ul>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" onClick={() => setPendingCopy(null)} style={btnGhost}>Back</button>
          <button type="button" onClick={() => onSave(pendingCopy)} style={btnPrimary}><Icon className="ti ti-files" /> Yes, copy anyway</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Edit schedule" onClose={onClose} maxWidth={560}>
      <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        <Field label="Schedule name">
          <input type="text" autoFocus value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
        </Field>
        <div>
          <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600, marginBottom: 6 }}>Linked batches</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>Each batch may belong to only one schedule on a given date.</div>
          <div style={{ display: 'grid', gap: 6, maxHeight: 220, overflow: 'auto' }}>
            {(batchPool || []).map((b) => {
              const sel = batchIds.includes(String(b.id));
              const conflict = conflictFor(b.id);
              const blocked = !!conflict && !sel;
              return (
                <label key={b.id} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 12px', borderRadius: 8,
                  cursor: blocked ? 'not-allowed' : 'pointer',
                  border: `1px solid ${sel ? 'var(--brand)' : 'var(--line)'}`,
                  background: sel ? '#eaf3f5' : '#fff',
                  opacity: blocked ? 0.6 : 1,
                }}>
                  <input type="checkbox" checked={sel} disabled={blocked} onChange={() => toggle(b.id)} style={{ marginTop: 2 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{b.name}</div>
                    {conflict && !sel && (
                      <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 2 }}>
                        Already in {conflict.published ? 'published' : 'draft'} "{conflict.name}" on this date.
                      </div>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        {!published && (
          <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12, background: '#fbfcfd' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Icon className="ti ti-files" style={{ color: 'var(--brand)' }} />
              <span style={{ fontWeight: 700, color: 'var(--ink)' }}>Copy events from</span>
              <span style={{ color: 'var(--muted)', fontSize: 12 }}>(optional)</span>
            </div>
            <select value={copyFromId} onChange={(e) => setCopyFromId(e.target.value)} style={selStyle}>
              <option value="">— Don't copy —</option>
              {copyCandidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.date} · {c.events.length} event{c.events.length === 1 ? '' : 's'}
                  {c.batches.length ? ` · ${c.batches.map((b) => b.name).join(', ')}` : ''}
                </option>
              ))}
            </select>
            {source && (
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>
                Will append {source.events.length} event{source.events.length === 1 ? '' : 's'} to this schedule.
                {sourceBound.length > 0 && (
                  <span style={{ display: 'block', marginTop: 6, color: '#7c2d12', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '6px 10px' }}>
                    <Icon className="ti ti-alert" /> {sourceBound.length} event(s) reference shared content — you'll be asked to confirm before copying.
                  </span>
                )}
              </div>
            )}
          </div>
        )}
        {published && (
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            <Icon className="ti ti-check" /> Published schedules can't accept copied events — unpublish first.
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} style={btnGhost}>Cancel</button>
          <button type="submit" style={btnPrimary}>Save changes</button>
        </div>
      </form>
    </Modal>
  );
}

// Short description of an event's bound content (used in the copy warning).
function describeContent(e) {
  if (e.type === 'ONLINE_EXAM') {
    const ref = findExamRef(e.examId);
    return ref ? `${ref.seriesName} → ${ref.examName}` : '';
  }
  if (e.type === 'ONLINE_QUIZ') {
    const ref = findQuizRef(e.quizId);
    return ref ? ref.quizName : '';
  }
  if (e.type === 'RECORDED_LECTURE') {
    const ref = findChapterRef(e.courseId, e.moduleId, e.chapterId);
    return ref ? `${ref.courseName} → ${ref.moduleName} → ${ref.chapterName}` : '';
  }
  return '';
}

function ConfirmModal({ title, message, confirmLabel, confirmStyle, onCancel, onConfirm }) {
  return (
    <Modal title={title} onClose={onCancel} maxWidth={420}>
      <p style={{ margin: '0 0 16px', color: 'var(--ink)', fontSize: 14, lineHeight: 1.5 }}>{message}</p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" onClick={onCancel} style={btnGhost}>Keep</button>
        <button type="button" onClick={onConfirm} style={confirmStyle}><Icon className="ti ti-trash" /> {confirmLabel}</button>
      </div>
    </Modal>
  );
}

function Modal({ title, children, onClose, maxWidth = 520, icon = 'ti-calendar' }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="crispr-modal-backdrop active" role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="crispr-modal-dialog" style={{ maxWidth }} role="dialog" aria-modal="true">
        <div className="crispr-modal-header">
          <h3>{icon && <Icon className={`ti ${icon}`} />} {title}</h3>
          <button type="button" className="crispr-modal-close" onClick={onClose}>
            <Icon className="ti ti-close" />
          </button>
        </div>
        <div className="crispr-modal-body">{children}</div>
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
const inputStyle = { padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, color: 'var(--ink)', background: '#fff', outline: 'none' };
const selStyle = { ...inputStyle, appearance: 'auto' };
const btnPrimary = { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--brand)', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 };
const btnGhost = { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', color: 'var(--ink)', border: '1px solid var(--line)', padding: '7px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 12 };
const btnDanger = { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', color: 'var(--danger)', border: '1px solid #f3cdc8', padding: '7px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 12 };
const thStyle = { padding: '10px 18px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid var(--line)' };
const tdStyle = { padding: '14px 18px', verticalAlign: 'middle', color: 'var(--ink)' };
