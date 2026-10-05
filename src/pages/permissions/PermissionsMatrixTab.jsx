import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  SUPER_ADMIN,
  getRole,
  syncRolePermissions,
  deleteRole,
  extractApiError,
} from '../../lib/rbacApi';
import { formatPageLabel, formatActionLabel } from './RolePermissionTree';

function KebabMenu({ children }) {
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
        <i className="ti ti-more-alt" />
      </button>
      {open && (
        <div className="kebab-dropdown active">
          {children({ close: () => setOpen(false) })}
        </div>
      )}
    </div>
  );
}

const STANDARD_ACTIONS = ['view', 'edit', 'delete'];

const thStyle = {
  fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3,
  padding: '10px 12px', borderBottom: '1px solid #e5e7eb',
  position: 'sticky', top: 0, background: '#f9fafb', color: '#374151', zIndex: 1,
};
const tdStyle = { padding: '12px', verticalAlign: 'middle', borderBottom: '1px solid #e5e7eb' };

// Flatten the permissions tree into a flat list of permission objects.
function flattenTree(tree) {
  const out = [];
  for (const m of Array.isArray(tree) ? tree : []) {
    for (const pg of m.pages || []) {
      for (const perm of pg.permissions || []) out.push(perm);
    }
  }
  return out;
}

// Group permission objects by `page`, splitting into standard (view/edit/delete)
// and custom buckets.
function groupByPage(permissions) {
  const byPage = new Map();
  for (const p of permissions) {
    if (!p?.page || !p?.key) continue;
    if (!byPage.has(p.page)) byPage.set(p.page, []);
    byPage.get(p.page).push(p);
  }
  return Array.from(byPage.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([page, items]) => {
      const standard = {};
      const custom = [];
      for (const it of items) {
        if (STANDARD_ACTIONS.includes(it.action)) standard[it.action] = it;
        else custom.push(it);
      }
      custom.sort((a, b) => (a.action || '').localeCompare(b.action || ''));
      return { page, items, standard, custom };
    });
}

function extractRolePermissionKeys(roleObj) {
  const list = roleObj?.permissions || roleObj?.permissionKeys || [];
  if (!Array.isArray(list)) return [];
  return list
    .map((p) => (typeof p === 'string' ? p : (p?.key ?? p?.name)))
    .filter((k) => typeof k === 'string' && k.length > 0);
}

/**
 * Role-scoped permission editor: pick a role on the left, toggle its
 * permissions in a Name / View / Edit / Delete / Custom table on the right.
 *
 * @param {Object} props
 * @param {{id:number,name:string,label:string,badgeColor?:string,isSystem:boolean,permissionCount:number}[]} props.roles
 * @param {import('../../lib/rbacTypes').PermissionTreeModule[]} props.tree
 * @param {(type:string,title:string,message?:string)=>void} props.showToast
 * @param {() => Promise<void>|void} [props.refetchRoles]
 * @param {boolean} props.loading
 */
export default function PermissionsMatrixTab({ roles, tree, showToast, refetchRoles, loading }) {
  const navigate = useNavigate();

  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [draft, setDraft] = useState(null);       // Set<string> permission keys
  const [savedDraft, setSavedDraft] = useState(null);
  const [loadingRole, setLoadingRole] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const selectedRole = useMemo(
    () => roles.find((r) => r.id === selectedRoleId) || null,
    [roles, selectedRoleId]
  );
  const isReadOnly = selectedRole?.name === SUPER_ADMIN;

  const groups = useMemo(() => groupByPage(flattenTree(tree)), [tree]);

  const dirty = useMemo(() => {
    if (!draft || !savedDraft) return false;
    if (draft.size !== savedDraft.size) return true;
    for (const p of draft) if (!savedDraft.has(p)) return true;
    return false;
  }, [draft, savedDraft]);

  // Auto-select the first non-SUPER_ADMIN role once roles arrive.
  useEffect(() => {
    if (selectedRoleId != null || roles.length === 0) return;
    const first = roles.find((r) => r.name !== SUPER_ADMIN) || roles[0];
    if (first) loadRole(first.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roles]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return undefined;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  async function loadRole(id) {
    setSelectedRoleId(id);
    setDraft(new Set());
    setSavedDraft(new Set());
    setLoadingRole(true);
    try {
      const resp = await getRole(id);
      const keys = extractRolePermissionKeys(resp?.data);
      setDraft(new Set(keys));
      setSavedDraft(new Set(keys));
    } catch (err) {
      const info = extractApiError(err);
      if (info.status === 401) { navigate('/login', { replace: true }); return; }
      showToast('error', 'Could not load role', info.message);
    } finally {
      setLoadingRole(false);
    }
  }

  function handleSelectRole(id) {
    if (id === selectedRoleId) return;
    if (dirty && !window.confirm('You have unsaved changes. Discard them?')) return;
    loadRole(id);
  }

  function togglePermission(key) {
    if (isReadOnly) return;
    setDraft((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function setManyPermissions(keys, value) {
    if (isReadOnly) return;
    setDraft((cur) => {
      const next = new Set(cur);
      for (const k of keys) { if (value) next.add(k); else next.delete(k); }
      return next;
    });
  }

  function discardChanges() {
    if (savedDraft) setDraft(new Set(savedDraft));
  }

  async function saveChanges() {
    if (!selectedRole || isReadOnly || saving) return;
    setSaving(true);
    try {
      const list = Array.from(draft);
      await syncRolePermissions(selectedRole.id, list);
      const fresh = await getRole(selectedRole.id);
      const keys = extractRolePermissionKeys(fresh?.data);
      setDraft(new Set(keys));
      setSavedDraft(new Set(keys));
      showToast('success', 'Saved', `${selectedRole.label || selectedRole.name} permissions updated.`);
      if (refetchRoles) await refetchRoles();
    } catch (err) {
      const info = extractApiError(err);
      if (info.status === 401) { navigate('/login', { replace: true }); return; }
      if (info.status === 403) { showToast('error', 'No access', "You don't have access to do that."); return; }
      showToast('error', 'Could not save', info.message);
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteRole(deleteTarget.id);
      showToast('success', 'Role deleted', `${deleteTarget.label || deleteTarget.name} removed.`);
      const removedId = deleteTarget.id;
      setDeleteTarget(null);
      // Move selection off the deleted role before the list refreshes.
      if (selectedRoleId === removedId) {
        setSelectedRoleId(null);
        setDraft(null);
        setSavedDraft(null);
      }
      if (refetchRoles) await refetchRoles();
    } catch (err) {
      const info = extractApiError(err);
      if (info.status === 401) { navigate('/login', { replace: true }); return; }
      let msg = info.message;
      // 403 role_is_system; 409 role_in_use carries its own message with the
      // number of users still holding the role.
      if (info.code === 'role_is_system') {
        msg = 'System roles cannot be deleted.';
      }
      showToast('error', 'Could not delete', msg);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20, alignItems: 'start' }}>
      {/* Roles sidebar */}
      <nav
        aria-label="Roles"
        style={{
          background: 'white', border: '1px solid var(--line)', borderRadius: 16,
          padding: 8, position: 'sticky', top: 16,
        }}
      >
        {loading && roles.length === 0 && (
          <div style={{ padding: 16, color: 'var(--muted, #6b7280)', fontSize: 13 }}>
            <i className="fa fa-spinner fa-spin" /> Loading roles…
          </div>
        )}
        {!loading && roles.length === 0 && (
          <div style={{ padding: 16, color: 'var(--muted, #6b7280)', fontSize: 13 }}>No roles found.</div>
        )}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {roles.map((r) => {
            const active = r.id === selectedRoleId;
            const isSuper = r.name === SUPER_ADMIN;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => handleSelectRole(r.id)}
                  aria-current={active ? 'true' : undefined}
                  style={{
                    width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 10,
                    border: '1px solid transparent', background: active ? '#eef2ff' : 'transparent',
                    color: active ? '#3730a3' : 'inherit', cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 2,
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.label || r.name}
                    </span>
                    {isSuper && (
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 999, background: '#ede9fe', color: '#5b21b6', fontWeight: 600, letterSpacing: 0.2 }}>
                        system
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize: 12, color: active ? '#3730a3' : 'var(--muted, #6b7280)', background: active ? '#e0e7ff' : '#f3f4f6', padding: '2px 8px', borderRadius: 999 }}>
                    {active && draft ? draft.size : (r.permissionCount ?? 0)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Matrix */}
      <section style={{ background: 'white', border: '1px solid var(--line)', borderRadius: 16, minHeight: 320, position: 'relative' }}>
        {selectedRole ? (
          <>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>
                {selectedRole.label || selectedRole.name} — {draft?.size || 0} permissions
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {isReadOnly && (
                  <span style={{ fontSize: 12, color: '#5b21b6', fontWeight: 600 }}>System role — read only</span>
                )}
                {!selectedRole.isSystem && (
                  <KebabMenu>
                    {({ close }) => (
                      <button
                        type="button"
                        className="kebab-dropdown-item danger-action"
                        onClick={() => { close(); setDeleteTarget(selectedRole); }}
                      >
                        <i className="ti ti-trash" /><span>Delete Permission</span>
                      </button>
                    )}
                  </KebabMenu>
                )}
              </div>
            </div>

            <div style={{ padding: '12px 24px 96px' }}>
              {loadingRole ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted, #6b7280)' }}>
                  <i className="fa fa-spinner fa-spin" /> Loading permissions…
                </div>
              ) : groups.length === 0 ? (
                <p style={{ color: 'var(--muted, #6b7280)', padding: '16px 0' }}>
                  No permissions have been seeded yet.
                </p>
              ) : (
                <div style={{ maxHeight: 'calc(100vh - 300px)', overflowY: 'auto', border: '1px solid #f3f4f6', borderRadius: 12 }}>
                  <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 13 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: 'var(--muted, #6b7280)' }}>
                        <th style={thStyle}>Name</th>
                        <th style={{ ...thStyle, width: 70, textAlign: 'center' }}>View</th>
                        <th style={{ ...thStyle, width: 70, textAlign: 'center' }}>Edit</th>
                        <th style={{ ...thStyle, width: 70, textAlign: 'center' }}>Delete</th>
                        <th style={{ ...thStyle, minWidth: 240 }}>Custom</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groups.map((g) => (
                        <tr key={g.page}>
                          <td style={tdStyle}>
                            <span style={{ fontWeight: 600, color: '#111827' }}>{formatPageLabel(g.page)}</span>
                          </td>
                          {STANDARD_ACTIONS.map((action) => {
                            const perm = g.standard[action];
                            return (
                              <td key={action} style={{ ...tdStyle, textAlign: 'center' }}>
                                {perm ? (
                                  <input
                                    type="checkbox"
                                    aria-label={perm.label || perm.key}
                                    title={perm.key}
                                    checked={draft?.has(perm.key) || false}
                                    disabled={isReadOnly}
                                    onChange={() => togglePermission(perm.key)}
                                  />
                                ) : (
                                  <span style={{ color: '#cbd5e1' }}>—</span>
                                )}
                              </td>
                            );
                          })}
                          <td style={tdStyle}>
                            {g.custom.length === 0 ? (
                              <span style={{ color: '#cbd5e1' }}>—</span>
                            ) : (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                                {g.custom.map((perm) => {
                                  const id = `perm-${perm.key.replace(/\./g, '-')}`;
                                  const checked = draft?.has(perm.key) || false;
                                  return (
                                    <label
                                      key={perm.key}
                                      htmlFor={id}
                                      title={`${perm.key}${perm.is_high_risk ? ' (high-risk)' : ''}`}
                                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, lineHeight: 1, cursor: isReadOnly ? 'default' : 'pointer' }}
                                    >
                                      <input
                                        id={id}
                                        type="checkbox"
                                        checked={checked}
                                        disabled={isReadOnly}
                                        onChange={() => togglePermission(perm.key)}
                                        style={{ margin: 0, verticalAlign: 'middle' }}
                                      />
                                      <span style={{ lineHeight: 1, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        {formatActionLabel(perm.action) || perm.key}
                                        {perm.is_high_risk && (
                                          <i className="fa fa-exclamation-triangle" title="High-risk action" style={{ color: '#b45309', fontSize: 11 }} />
                                        )}
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {!isReadOnly && (
              <div style={{ position: 'sticky', bottom: 0, background: 'white', borderTop: '1px solid var(--line)', padding: '12px 24px', display: 'flex', justifyContent: 'flex-end', gap: 8, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }}>
                <button type="button" className="legacy-btn legacy-btn-default" onClick={discardChanges} disabled={!dirty || saving}>
                  Discard
                </button>
                <button type="button" className="legacy-btn legacy-btn-success" onClick={saveChanges} disabled={!dirty || saving}>
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            )}
          </>
        ) : (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted, #6b7280)' }}>
            Select a role from the left to manage its permissions.
          </div>
        )}
      </section>

      {/* ── Delete confirm ───────────────────────────────────────────── */}
      <div className={`legacy-modal-backdrop ${deleteTarget ? 'active' : ''}`} onClick={() => !deleting && setDeleteTarget(null)}>
        <div className="legacy-modal-dialog legacy-confirm" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
          <div className="legacy-modal-header legacy-danger-header">
            <h3><i className="ti ti-alert" /> Confirm Delete</h3>
            <button type="button" className="legacy-modal-close" onClick={() => setDeleteTarget(null)} disabled={deleting} aria-label="Close">
              <i className="ti ti-close" />
            </button>
          </div>
          <div className="legacy-modal-body">
            <p className="legacy-confirm-copy">Are you sure you want to delete <strong>{deleteTarget?.label || deleteTarget?.name}</strong>?</p>
            <p className="instructor-delete-note">This action cannot be undone. Roles still assigned to users can't be deleted.</p>
          </div>
          <div className="legacy-modal-footer">
            <button type="button" className="legacy-btn legacy-btn-default" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </button>
            <button type="button" className="legacy-btn legacy-btn-danger" onClick={confirmDelete} disabled={deleting}>
              <i className="ti ti-trash" /> {deleting ? 'Deleting…' : 'Delete role'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
