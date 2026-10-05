import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../lib/userStore';
import { canSearchStaff, getSearchablePages, searchPages, searchPeople } from '../lib/spotlightSearch';
import useDebouncedValue from '../hooks/useDebouncedValue';
import Avatar from './Avatar';
import Icon from './Icon';

const POS_KEY = 'spotlight_fab_pos_v2'; // v2: offsets measured from right/bottom
const FAB_SIZE = 52;
const EDGE = 16;
const DRAG_THRESHOLD = 5; // px of movement before a press becomes a drag

// Position is stored as {x: px from right, y: px from bottom} so the default
// bottom-right anchor survives window resizes without drifting.
function clampPos({ x, y }) {
  const w = window.innerWidth || 0;
  const h = window.innerHeight || 0;
  const maxX = Math.max(EDGE, w - FAB_SIZE - EDGE);
  const maxY = Math.max(EDGE, h - FAB_SIZE - EDGE);
  return {
    x: Math.min(Math.max(EDGE, x), maxX),
    y: Math.min(Math.max(EDGE, y), maxY),
  };
}

const DEFAULT_POS = { x: EDGE, y: EDGE };

function loadPos() {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return DEFAULT_POS;
    const p = JSON.parse(raw);
    if (typeof p?.x !== 'number' || typeof p?.y !== 'number') return DEFAULT_POS;
    return { x: p.x, y: p.y };
  } catch {
    return DEFAULT_POS;
  }
}

const KIND_ORDER = ['page', 'student', 'staff', 'mentor', 'teacher'];
const KIND_HEADINGS = {
  page: 'Pages',
  student: 'Students',
  staff: 'Staff',
  mentor: 'Mentors',
  teacher: 'Teachers',
};

export default function SpotlightSearch() {
  const navigate = useNavigate();
  const { user } = useUser() || {};

  // ── Floating, draggable button ───────────────────────────────────────
  const [pos, setPos] = useState(loadPos);
  const dragRef = useRef(null); // { startX, startY, originX, originY, moved }
  const [dragging, setDragging] = useState(false);

  // Re-render on resize so the clamp below keeps the button on-screen.
  const [, setViewportTick] = useState(0);
  useEffect(() => {
    const onResize = () => setViewportTick((t) => t + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const shownPos = clampPos(pos);

  const onPointerDown = (e) => {
    if (e.button != null && e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, originX: shownPos.x, originY: shownPos.y, moved: false };
  };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!d.moved) { d.moved = true; setDragging(true); }
    setPos(clampPos({ x: d.originX - dx, y: d.originY - dy }));
  };
  const onPointerUp = (e) => {
    const d = dragRef.current;
    dragRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (!d) return;
    if (d.moved) {
      setDragging(false);
      setPos((p) => {
        localStorage.setItem(POS_KEY, JSON.stringify(p));
        return p;
      });
    } else {
      setOpen(true);
    }
  };

  // ── Palette state ────────────────────────────────────────────────────
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 250);
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const pages = useMemo(() => getSearchablePages(user), [user]);
  const allowedPaths = useMemo(() => new Set(pages.map((p) => p.path)), [pages]);
  const includeStaff = useMemo(() => canSearchStaff(user), [user]);
  const pageResults = useMemo(() => searchPages(pages, query), [pages, query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setPeople([]);
    setActiveIndex(0);
  }, []);

  // Global shortcut: Cmd/Ctrl+K toggles the palette.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    // The sidebar's Search button opens the palette via this event.
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('spotlight:open', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('spotlight:open', onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      setQuery('');
      setPeople([]);
    }
  }, [open]);

  // People search (debounced, abortable).
  useEffect(() => {
    if (!open) return undefined;
    const q = debouncedQuery.trim();
    if (q.length < 2) { setPeople([]); setLoading(false); return undefined; }
    const controller = new AbortController();
    setLoading(true);
    searchPeople(q, { signal: controller.signal, allowedPaths, includeStaff })
      .then((rows) => { if (!controller.signal.aborted) setPeople(rows); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [debouncedQuery, open, allowedPaths, includeStaff]);

  // Flatten results into groups (for rendering) and a list (for keyboard nav).
  const groups = useMemo(() => {
    const byKind = new Map();
    [...pageResults, ...people].forEach((r) => {
      if (!byKind.has(r.kind)) byKind.set(r.kind, []);
      byKind.get(r.kind).push(r);
    });
    return KIND_ORDER.filter((k) => byKind.has(k)).map((k) => ({ kind: k, heading: KIND_HEADINGS[k], items: byKind.get(k) }));
  }, [pageResults, people]);
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  useEffect(() => { setActiveIndex(0); }, [query, people]);

  useEffect(() => {
    const el = listRef.current?.querySelector('[data-active="true"]');
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex]);

  const select = (item) => {
    if (!item) return;
    close();
    navigate(item.to);
  };

  const onInputKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, flat.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); select(flat[activeIndex]); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  };

  const trimmed = query.trim();
  const showEmpty = trimmed.length > 0 && !loading && flat.length === 0;
  let flatIdx = -1;

  return (
    <>
      <button
        type="button"
        className={`spotlight-fab${dragging ? ' dragging' : ''}`}
        style={{ right: shownPos.x, bottom: shownPos.y }}
        title="Spotlight Search (⌘K / Ctrl+K)"
        aria-label="Open Spotlight Search"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { dragRef.current = null; setDragging(false); }}
      >
        <Icon className="fa fa-search" />
      </button>

      {open && (
        <div className="spotlight-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
          <div className="spotlight-panel" role="dialog" aria-modal="true" aria-label="Spotlight Search">
            <div className="spotlight-input-row">
              <Icon className="fa fa-search spotlight-input-icon" />
              <input
                ref={inputRef}
                className="spotlight-input"
                type="text"
                placeholder="Search pages, students, staff, mentors, teachers…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKeyDown}
                autoComplete="off"
                spellCheck={false}
                autoFocus
              />
              {loading ? (
                <span className="spotlight-spinner" aria-label="Searching" />
              ) : (
                <kbd className="spotlight-kbd">esc</kbd>
              )}
            </div>

            {(flat.length > 0 || showEmpty || !trimmed) && (
              <div className="spotlight-results" ref={listRef}>
                {!trimmed && (
                  <div className="spotlight-hint">
                    Type a page name, or a person's name / mobile number.
                  </div>
                )}
                {showEmpty && (
                  <div className="spotlight-hint">No results for “{trimmed}”</div>
                )}
                {groups.map((g) => (
                  <div className="spotlight-group" key={g.kind}>
                    <div className="spotlight-group-heading">{g.heading}</div>
                    {g.items.map((item) => {
                      flatIdx += 1;
                      const idx = flatIdx;
                      const active = idx === activeIndex;
                      return (
                        <button
                          type="button"
                          key={item.id}
                          className={`spotlight-item${active ? ' active' : ''}`}
                          data-active={active ? 'true' : 'false'}
                          onMouseEnter={() => setActiveIndex(idx)}
                          onClick={() => select(item)}
                        >
                          {item.kind === 'page' ? (
                            <span className="spotlight-item-icon">
                              <Icon className={`${item.icon.startsWith('ti') ? '' : 'fa '}${item.icon}`} />
                            </span>
                          ) : (
                            <span className="spotlight-item-avatar">
                              <Avatar name={item.title} src={item.avatar} className="spotlight-avatar-img" placeholderClassName="spotlight-avatar-ph" />
                            </span>
                          )}
                          <span className="spotlight-item-body">
                            <span className="spotlight-item-title">{item.title}</span>
                            {item.subtitle && <span className="spotlight-item-sub">{item.subtitle}</span>}
                          </span>
                          <span className="spotlight-item-kind">{item.kind === 'page' ? 'Page' : item.kindLabel}</span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}

            <div className="spotlight-footer">
              <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
              <span><kbd>↵</kbd> open</span>
              <span><kbd>⌘K</kbd> toggle</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
