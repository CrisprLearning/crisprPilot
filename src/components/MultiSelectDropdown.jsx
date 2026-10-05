import React, { useEffect, useRef, useState } from 'react';
import Icon from './Icon';

/**
 * Searchable multi-select dropdown — trigger button + fixed-position checkbox
 * panel, modeled on the Batch filter of the Schedules page (same trigger
 * label rules, clear-all header, and flip-up positioning) with a search box
 * added at the top of the panel.
 *
 * `value` is an array of option ids; `options` the full id list.
 *
 * `joinSelected` is for ordered picks: the trigger lists the selected labels
 * in pick order and each ticked option shows its position. `panelZIndex` lifts
 * the panel above a modal; `panelMinWidth` lets it grow past a narrow trigger.
 */
export default function MultiSelectDropdown({
  value, onChange, options, getLabel = (o) => o,
  allLabel = 'All', plural = 'items',
  searchPlaceholder = 'Search…', disabled = false, buttonClassName = '',
  joinSelected = false, panelZIndex, panelMinWidth = 0,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);
  const btnRef = useRef(null);
  const dropRef = useRef(null);
  const searchRef = useRef(null);
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
    if (!open) return undefined;
    function update() {
      if (btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    }
    update();
    setQuery('');
    window.setTimeout(() => searchRef.current?.focus(), 0);
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
    : joinSelected ? value.map(getLabel).join(', ')
    : `${value.length} ${plural}`;

  const filtered = query.trim()
    ? options.filter((o) => String(getLabel(o)).toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  function toggle(id) {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  }

  return (
    <div ref={ref} className="msd" style={{ position: 'relative' }}>
      <button
        ref={btnRef}
        type="button"
        className={`msd-trigger ${buttonClassName}`}
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        title={joinSelected && value.length > 1 ? label : undefined}
      >
        <span className="msd-trigger-label">{label}</span>
        <Icon className={`ti ${open ? 'ti-angle-up' : 'ti-angle-down'}`} />
      </button>
      {open && rect && (() => {
        // Flip the panel above the trigger when there isn't enough room below.
        const spaceBelow = window.innerHeight - rect.bottom - 16;
        const spaceAbove = rect.top - 16;
        const openUp = spaceBelow < 220 && spaceAbove > spaceBelow;
        const maxHeight = Math.min(320, Math.max(180, openUp ? spaceAbove : spaceBelow));
        return (
          <div
            ref={dropRef}
            className="msd-panel"
            style={{
              position: 'fixed',
              ...(openUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
              left: rect.left,
              width: Math.max(rect.width, panelMinWidth),
              maxHeight,
              ...(panelZIndex ? { zIndex: panelZIndex } : null),
            }}
          >
            <div className="msd-search">
              <Icon className="ti ti-search" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                placeholder={searchPlaceholder}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query ? <button type="button" className="msd-search-clear" onClick={() => { setQuery(''); searchRef.current?.focus(); }}><Icon className="ti ti-close" /></button> : null}
            </div>
            {value.length > 0 && (
              <button type="button" className="msd-clear" onClick={() => onChange([])}>
                <Icon className="ti ti-close" /> Clear all ({value.length})
              </button>
            )}
            <div className="msd-options">
              {filtered.length === 0 ? (
                <div className="msd-empty">No match for “{query.trim()}”</div>
              ) : filtered.map((id) => {
                const sel = value.includes(id);
                return (
                  <label key={id} className={`msd-option ${sel ? 'selected' : ''}`}>
                    <input type="checkbox" checked={sel} onChange={() => toggle(id)} />
                    <span>{getLabel(id)}</span>
                    {joinSelected && sel && value.length > 1 ? (
                      <span className="msd-order" aria-label={`Position ${value.indexOf(id) + 1}`}>{value.indexOf(id) + 1}</span>
                    ) : null}
                  </label>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
