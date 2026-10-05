import React, { useMemo } from 'react';
import Icon from '../../components/Icon';

// Format a backend page/module segment ("courseAuthoring.instructor") into a
// human label ("Course Authoring → Instructor").
function formatSegment(seg) {
  return seg
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}

export function formatPageLabel(page) {
  if (!page) return '';
  return page.split('.').map(formatSegment).join(' → ');
}

export function formatActionLabel(action) {
  if (!action) return '';
  return action.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}

function HighRiskBadge() {
  return (
    <span
      title="High-risk action"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        color: '#b45309',
        background: '#fffbeb',
        border: '1px solid #fde68a',
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 700,
        padding: '1px 6px',
        letterSpacing: 0.3,
      }}
    >
      <Icon className="fa fa-exclamation-triangle" /> RISK
    </span>
  );
}

/**
 * Grouped checkbox tree of the permission catalogue.
 *
 * @param {Object} props
 * @param {import('../../lib/rbacTypes').PermissionTreeModule[]} props.tree
 * @param {Set<string>} [props.selected]      currently-selected permission keys
 * @param {(key: string) => void} [props.onToggle]
 * @param {(keys: string[], value: boolean) => void} [props.onToggleMany]
 * @param {boolean} [props.readOnly]          render checkboxes disabled
 * @param {boolean} [props.showCheckboxes]    set false to browse-only (matrix tab)
 */
export default function RolePermissionTree({
  tree,
  selected,
  onToggle,
  onToggleMany,
  readOnly = false,
  showCheckboxes = true,
}) {
  const sel = selected || new Set();

  const modules = useMemo(() => {
    return (Array.isArray(tree) ? tree : [])
      .map((m) => ({
        module: m.module,
        pages: (m.pages || []).map((pg) => ({
          page: pg.page,
          permissions: pg.permissions || [],
        })),
        allKeys: (m.pages || []).flatMap((pg) => (pg.permissions || []).map((p) => p.key)),
      }))
      .sort((a, b) => a.module.localeCompare(b.module));
  }, [tree]);

  if (modules.length === 0) {
    return (
      <p style={{ color: 'var(--muted, #6b7280)', padding: '16px 0' }}>
        No permissions have been seeded yet.
      </p>
    );
  }

  function moduleState(allKeys) {
    const total = allKeys.length;
    const checked = allKeys.filter((k) => sel.has(k)).length;
    return { total, checked, all: total > 0 && checked === total };
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {modules.map((m) => {
        const st = moduleState(m.allKeys);
        return (
          <section
            key={m.module}
            style={{ border: '1px solid #eef0f3', borderRadius: 12, overflow: 'hidden' }}
          >
            <header
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '10px 14px',
                background: '#f9fafb',
                borderBottom: '1px solid #eef0f3',
              }}
            >
              <h4
                style={{
                  margin: 0,
                  fontSize: 14,
                  textTransform: 'capitalize',
                  color: '#111827',
                }}
              >
                {formatSegment(m.module)}{' '}
                <span style={{ color: 'var(--muted, #6b7280)', fontWeight: 400 }}>
                  ({st.checked}/{st.total})
                </span>
              </h4>
              {showCheckboxes && !readOnly && onToggleMany && (
                <button
                  type="button"
                  onClick={() => onToggleMany(m.allKeys, !st.all)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#4f46e5',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {st.all ? 'Clear all' : 'Select all'}
                </button>
              )}
            </header>

            <div style={{ padding: '8px 14px 14px' }}>
              {m.pages
                .slice()
                .sort((a, b) => a.page.localeCompare(b.page))
                .map((pg) => {
                  const pageKeys = pg.permissions.map((p) => p.key);
                  const pageChecked = pageKeys.filter((k) => sel.has(k)).length;
                  const pageAll = pageKeys.length > 0 && pageChecked === pageKeys.length;
                  return (
                    <div
                      key={pg.page}
                      style={{ padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: 8,
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
                          {formatPageLabel(pg.page)}{' '}
                          <span style={{ color: 'var(--muted, #6b7280)', fontWeight: 400 }}>
                            ({pageChecked}/{pageKeys.length})
                          </span>
                        </div>
                        {showCheckboxes && !readOnly && onToggleMany && pageKeys.length > 1 && (
                          <button
                            type="button"
                            onClick={() => onToggleMany(pageKeys, !pageAll)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#6b7280',
                              cursor: 'pointer',
                              fontSize: 11,
                              fontWeight: 600,
                            }}
                          >
                            {pageAll ? 'Clear' : 'All'}
                          </button>
                        )}
                      </div>

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                          gap: 8,
                        }}
                      >
                        {pg.permissions.map((perm) => {
                          const checked = sel.has(perm.key);
                          const id = `tree-${perm.key.replace(/\./g, '-')}`;
                          return (
                            <label
                              key={perm.key}
                              htmlFor={showCheckboxes ? id : undefined}
                              title={`${perm.key}${perm.description ? ` — ${perm.description}` : ''}`}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '4px 0',
                                cursor: !showCheckboxes || readOnly ? 'default' : 'pointer',
                              }}
                            >
                              {showCheckboxes && (
                                <input
                                  id={id}
                                  type="checkbox"
                                  checked={checked}
                                  disabled={readOnly}
                                  onChange={() => onToggle && onToggle(perm.key)}
                                  style={{ margin: 0 }}
                                />
                              )}
                              <span style={{ fontSize: 13, color: '#1f2937' }}>
                                {formatActionLabel(perm.action) || perm.label}
                              </span>
                              {perm.is_high_risk && <HighRiskBadge />}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
