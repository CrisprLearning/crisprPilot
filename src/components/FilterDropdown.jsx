import React, { useEffect, useRef, useState } from 'react';
import Icon from './Icon';

/**
 * Standard inline search-bar filter dropdown.
 *
 * The single source of truth for the filter dropdowns that sit inline next to a
 * page's search bar (the design originally established on the Orders page).
 *
 * Props:
 *  - label:    fallback text shown on the button when nothing is selected.
 *  - value:    currently selected option value.
 *  - options:  array of either `{ value, label }` or grouped
 *              `{ group, options: [{ value, label }] }` entries.
 *  - onChange: called with the selected value.
 *  - maxHeight: optional CSS max-height for long menus (enables scroll).
 *  - align:    'left' (default) or 'right' menu alignment.
 *  - className / ariaLabel: optional passthroughs.
 */
export default function FilterDropdown({
  label,
  value,
  options = [],
  onChange,
  maxHeight,
  align = 'left',
  className = '',
  ariaLabel,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handler(event) {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const flat = options.flatMap((option) => (option.group ? option.options : [option]));
  const current = flat.find((option) => option.value === value);
  const display = current ? current.label : label;
  const hasSelection = value !== undefined && value !== null && value !== '';

  function select(nextValue) {
    onChange(nextValue);
    setOpen(false);
  }

  function renderItem(option) {
    return (
      <button
        key={option.value}
        type="button"
        className={`filter-dropdown-item${option.value === value ? ' active' : ''}`}
        onClick={() => select(option.value)}
      >
        {option.label}
      </button>
    );
  }

  return (
    <div className={`filter-dropdown ${className}`.trim()} ref={ref}>
      <button
        type="button"
        className={`filter-dropdown-btn${open ? ' open' : ''}${hasSelection ? ' active' : ''}`}
        onClick={() => setOpen((current) => !current)}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="filter-dropdown-label">{display}</span>
        <Icon className={`ti ti-angle-${open ? 'up' : 'down'}`} />
      </button>
      <div
        className={`filter-dropdown-menu${open ? ' active' : ''}${align === 'right' ? ' align-right' : ''}`}
        style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}
        role="listbox"
      >
        {options.map((option, index) =>
          option.group ? (
            <React.Fragment key={`group-${index}`}>
              <div className="filter-dropdown-group">{option.group}</div>
              {option.options.map(renderItem)}
            </React.Fragment>
          ) : (
            renderItem(option)
          ),
        )}
      </div>
    </div>
  );
}
