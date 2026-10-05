import React, { useEffect, useRef, useState } from 'react';
import { listLocations } from '../lib/locationsApi';
import Icon from './Icon';

// Shared single-select location typeahead, backed by the locations API.
// Mirrors the picker used in the Digital Signage "Apply to branches" control.

const LOC_PAGE_SIZE = 20;

const inputStyle = {
  padding: '8px 12px',
  border: '1px solid var(--line)',
  borderRadius: 8,
  fontSize: 13,
  color: 'var(--ink)',
  background: '#fff',
  outline: 'none',
};

const btnGhost = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: '#fff',
  color: 'var(--ink)',
  border: '1px solid var(--line)',
  padding: '7px 12px',
  borderRadius: 8,
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 12,
  textDecoration: 'none',
};

// Debounced, paginated search hook against listLocations.
function useLocationSearch(query, open) {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    if (!open) return undefined;
    const myReq = ++reqId.current;
    setLoading(true);
    setItems([]);
    setPage(1);
    setHasMore(true);
    const t = setTimeout(async () => {
      try {
        const resp = await listLocations({
          page: 1, size: LOC_PAGE_SIZE, filterBy: 'all',
          ...(query.trim() ? { searchKey: query.trim() } : {}),
        });
        if (reqId.current !== myReq) return;
        const rows = resp?.data || [];
        setItems(rows);
        setHasMore(rows.length === LOC_PAGE_SIZE);
      } catch {
        if (reqId.current === myReq) { setItems([]); setHasMore(false); }
      } finally {
        if (reqId.current === myReq) setLoading(false);
      }
    }, 220);
    return () => { clearTimeout(t); };
  }, [query, open]);

  const loadMore = async () => {
    if (loading || !hasMore) return;
    const myReq = reqId.current;
    setLoading(true);
    try {
      const next = page + 1;
      const resp = await listLocations({
        page: next, size: LOC_PAGE_SIZE, filterBy: 'all',
        ...(query.trim() ? { searchKey: query.trim() } : {}),
      });
      if (reqId.current !== myReq) return;
      const rows = resp?.data || [];
      setItems((cur) => [...cur, ...rows]);
      setPage(next);
      setHasMore(rows.length === LOC_PAGE_SIZE);
    } catch {
      if (reqId.current === myReq) setHasMore(false);
    } finally {
      if (reqId.current === myReq) setLoading(false);
    }
  };

  return { items, loading, hasMore, loadMore };
}

function LocationDropdown({ rect, query, setQuery, items, loading, hasMore, loadMore, onPick, selectedIds, dropRef, allowClear, onClear, emptyHint }) {
  const sentinelRef = useRef(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) loadMore();
    }, { root: null, threshold: 0.1 });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  return (
    <div ref={dropRef} style={{
      position: 'fixed',
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(260, rect.width),
      background: '#fff', border: '1px solid var(--line)', borderRadius: 8,
      boxShadow: '0 14px 38px rgba(0,0,0,0.12)', zIndex: 12100,
      maxHeight: Math.max(220, window.innerHeight - rect.bottom - 16),
      overflow: 'hidden', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ padding: 8, borderBottom: '1px solid var(--line)', display: 'flex', gap: 6 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Icon className="ti ti-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: 12 }} />
          <input
            autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search locations…"
            style={{ ...inputStyle, width: '100%', paddingLeft: 28 }}
          />
        </div>
        {allowClear && (
          <button type="button" onMouseDown={(e) => { e.preventDefault(); onClear(); }} style={btnGhost} title="Clear selection">
            <Icon className="ti ti-close" />
          </button>
        )}
      </div>
      <div style={{ overflow: 'auto', flex: 1 }}>
        {items.map((loc) => {
          const sel = selectedIds?.has(loc.id);
          return (
            <button
              key={loc.id} type="button"
              onMouseDown={(e) => { e.preventDefault(); onPick(loc); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', textAlign: 'left', background: sel ? '#eaf3f5' : '#fff',
                border: 'none', cursor: 'pointer', padding: '9px 12px',
                borderTop: '1px solid #f3f5f6',
              }}
            >
              <Icon className={`ti ${sel ? 'ti-check' : 'ti-building'}`} style={{ color: sel ? 'var(--brand)' : 'var(--muted)', fontSize: 13 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{loc.name}</div>
                {loc.address && (
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{loc.address}</div>
                )}
              </div>
            </button>
          );
        })}
        {!loading && items.length === 0 && (
          <div style={{ padding: '14px 12px', fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
            {emptyHint || (query ? `No matches for "${query}"` : 'No locations available')}
          </div>
        )}
        {hasMore && <div ref={sentinelRef} style={{ height: 1 }} />}
        {loading && (
          <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
            <Icon className="ti ti-reload" style={{ marginRight: 6 }} />Loading…
          </div>
        )}
      </div>
    </div>
  );
}

// Single-select location/branch picker.
//   value        = selected id (string|number|null)
//   initialLabel = best-effort display string when only the id is known
//   onChange(sel) = called with { id, name, raw } on pick, or null on clear
export default function LocationPicker({ value, initialLabel, onChange, placeholder = 'Select location…', allowClear = true, disabled = false }) {
  const [label, setLabel] = useState(initialLabel || '');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState(null);
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const dropRef = useRef(null);

  useEffect(() => { setLabel(initialLabel || ''); }, [initialLabel, value]);

  const { items, loading, hasMore, loadMore } = useLocationSearch(query, open);

  useEffect(() => {
    function onDown(e) {
      if (wrapRef.current?.contains(e.target)) return;
      if (dropRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    function update() { if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect()); }
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => { window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update); };
  }, [open]);

  function pick(loc) {
    setLabel(loc.name);
    onChange({ id: loc.id, name: loc.name, raw: loc });
    setOpen(false);
    setQuery('');
  }
  function clear() {
    setLabel('');
    onChange(null);
    setOpen(false);
    setQuery('');
  }

  const selectedIds = value ? new Set([value]) : new Set();

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        ref={triggerRef} type="button" disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        style={{
          ...inputStyle, width: '100%', textAlign: 'left',
          display: 'flex', alignItems: 'center', gap: 8,
          cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
        }}
      >
        <Icon className={`ti ${value ? 'ti-map-pin' : 'ti-building'}`} style={{ color: value ? 'var(--brand)' : 'var(--muted)' }} />
        <span style={{ flex: 1, color: label ? 'var(--ink)' : 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {label || (value ? `#${value}` : placeholder)}
        </span>
        <Icon className={`ti ${open ? 'ti-chevron-up' : 'ti-chevron-down'}`} style={{ color: 'var(--muted)', fontSize: 12 }} />
      </button>
      {open && rect && (
        <LocationDropdown
          rect={rect} query={query} setQuery={setQuery}
          items={items} loading={loading} hasMore={hasMore} loadMore={loadMore}
          onPick={pick} selectedIds={selectedIds} dropRef={dropRef}
          allowClear={allowClear && !!value} onClear={clear}
        />
      )}
    </div>
  );
}
