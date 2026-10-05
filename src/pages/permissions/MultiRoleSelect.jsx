import React, { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../components/Icon';

/**
 * Chips multi-select for role assignment. Emits role ids.
 *
 * @param {Object} props
 * @param {{ id: number, name: string, label: string, badgeColor?: string }[]} props.roles
 * @param {number[]} props.value                 selected role ids
 * @param {(ids: number[]) => void} props.onChange
 * @param {boolean} [props.disabled]
 * @param {(roleId: number) => boolean} [props.isLocked]  per-role lock (e.g. own role)
 * @param {string} [props.placeholder]
 */
export default function MultiRoleSelect({
  roles,
  value,
  onChange,
  disabled = false,
  isLocked,
  placeholder = 'Add role…',
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const selectedIds = Array.isArray(value) ? value : [];
  const selectedSet = useMemo(() => new Set(selectedIds.map(String)), [selectedIds]);

  const selectedRoles = useMemo(
    () => roles.filter((r) => selectedSet.has(String(r.id))),
    [roles, selectedSet]
  );
  const availableRoles = useMemo(
    () => roles.filter((r) => !selectedSet.has(String(r.id))),
    [roles, selectedSet]
  );

  function add(roleId) {
    if (disabled) return;
    if (selectedSet.has(String(roleId))) return;
    onChange([...selectedIds, roleId]);
    setOpen(false);
  }

  function remove(roleId) {
    if (disabled) return;
    if (isLocked && isLocked(roleId)) return;
    onChange(selectedIds.filter((id) => String(id) !== String(roleId)));
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          alignItems: 'center',
          minHeight: 40,
          padding: '6px 8px',
          border: '1px solid var(--line, #d1d5db)',
          borderRadius: 8,
          background: disabled ? '#f9fafb' : '#fff',
        }}
      >
        {selectedRoles.length === 0 && (
          <span style={{ color: '#9ca3af', fontSize: 13, padding: '2px 4px' }}>
            No roles selected
          </span>
        )}
        {selectedRoles.map((r) => {
          const locked = isLocked ? isLocked(r.id) : false;
          const color = r.badgeColor || '#374151';
          return (
            <span
              key={r.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                fontWeight: 600,
                padding: '3px 8px',
                borderRadius: 999,
                color,
                background: `${color}1a`, // ~10% alpha
                border: `1px solid ${color}40`,
              }}
            >
              {r.label || r.name}
              {!disabled && !locked && (
                <button
                  type="button"
                  aria-label={`Remove ${r.label || r.name}`}
                  onClick={() => remove(r.id)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color,
                    cursor: 'pointer',
                    padding: 0,
                    lineHeight: 1,
                    fontSize: 13,
                  }}
                >
                  <Icon className="fa fa-times" />
                </button>
              )}
            </span>
          );
        })}

        {!disabled && availableRoles.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            style={{
              marginLeft: 'auto',
              border: '1px dashed #cbd5e1',
              background: 'transparent',
              color: '#4f46e5',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              padding: '3px 10px',
              cursor: 'pointer',
            }}
          >
            <Icon className="fa fa-plus" /> {placeholder}
          </button>
        )}
      </div>

      {open && availableRoles.length > 0 && (
        <div
          style={{
            position: 'absolute',
            zIndex: 20,
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            maxHeight: 220,
            overflowY: 'auto',
            background: '#fff',
            border: '1px solid var(--line, #d1d5db)',
            borderRadius: 10,
            boxShadow: '0 12px 30px rgba(0,0,0,.12)',
            padding: 4,
          }}
        >
          {availableRoles.map((r) => {
            const color = r.badgeColor || '#374151';
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => add(r.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  textAlign: 'left',
                  border: 'none',
                  background: 'transparent',
                  padding: '8px 10px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 13,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f3f4f6')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: color,
                    flexShrink: 0,
                  }}
                />
                {r.label || r.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
