import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useUser, getCachedUser } from '../../lib/userStore';
import MultiRoleSelect from './MultiRoleSelect';
import FilterDropdown from '../../components/FilterDropdown';
import { SEARCH_DEBOUNCE_MS } from '../../hooks/useDebouncedValue';
import {
  listUsers,
  createUser,
  updateUser,
  setUserActive,
  resetUserPassword,
  extractApiError,
  validateUser,
} from '../../lib/userAccountsApi';
import Icon from '../../components/Icon';

function getInitials(name) {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getPageNumbers(currentPage, totalPages) {
  const pages = [];
  const max = 5;
  let start = Math.max(1, currentPage - 2);
  let end = Math.min(totalPages, start + max - 1);
  if (end - start < max - 1) start = Math.max(1, end - max + 1);
  for (let p = start; p <= end; p += 1) pages.push(p);
  return pages;
}

function formatLastLogin(value) {
  if (!value) return 'Never';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Never';
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return d.toLocaleDateString();
}

// Normalize a raw user record into our canonical multi-role shape.
function normalizeUser(u) {
  let roles = [];
  if (Array.isArray(u.roles) && u.roles.length) {
    roles = u.roles
      .map((r) => ({ id: r.id, name: r.name || r.key, label: r.label || r.name || r.key }))
      .filter((r) => r.id != null);
  } else if (u.roleId != null) {
    // legacy single-role mirror
    roles = [{ id: u.roleId, name: u.roleName || '', label: u.roleLabel || u.roleName || '' }];
  }
  return {
    id: u.id,
    name: u.name || '',
    email: u.email || '',
    mobile: u.mobile || u.phone || '',
    roles,
    roleIds: roles.map((r) => r.id),
    active: u.active ?? (u.status === 1 || u.status === 'active'),
    lastLogin: u.lastLogin || u.last_login || null,
  };
}

const DEBOUNCE_MS = SEARCH_DEBOUNCE_MS;

/**
 * @param {Object} props
 * @param {{id:number,name:string,label:string,badgeColor?:string}[]} props.roles
 * @param {(type:string,title:string,message?:string)=>void} props.showToast
 */
export default function UsersTab({ roles, showToast }) {
  const navigate = useNavigate();
  const ctx = useUser();
  const selfEmail = ((ctx?.user || getCachedUser())?.email || '').trim().toLowerCase();
  const isSelf = (user) => !!selfEmail && (user.email || '').trim().toLowerCase() === selfEmail;

  const [users, setUsers] = useState([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  // ?q= (set by Spotlight alongside ?id=) pre-fills the search so the target
  // user is guaranteed to be in the first page of results.
  const initialSearch = new URLSearchParams(window.location.search).get('q') || '';
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [filterRoleId, setFilterRoleId] = useState('');
  const [sortColumn, setSortColumn] = useState('name');
  const [sortReverse, setSortReverse] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [current, setCurrent] = useState(null);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const [activeKebabId, setActiveKebabId] = useState(null);
  const kebabRef = useRef(null);

  // Direct link / Spotlight result: /user-accounts?id=<id> opens that user.
  const [searchParams] = useSearchParams();
  const userIdFromUrl = searchParams.get('id');
  const autoOpenedIdRef = useRef(null);

  const roleLookup = useMemo(() => {
    const map = new Map();
    roles.forEach((r) => map.set(String(r.id), r));
    return map;
  }, [roles]);

  // Debounce search → searchQuery
  useEffect(() => {
    const t = window.setTimeout(() => {
      setSearchQuery(searchInput.trim());
      setCurrentPage(1);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const loadUsers = useCallback(async (isCancelled = { current: false }) => {
    setIsLoading(true);
    try {
      const resp = await listUsers({
        page: currentPage,
        size: pageSize,
        sortBy: sortColumn,
        sortOrder: sortReverse ? 'DESC' : 'ASC',
        searchKey: searchQuery || undefined,
        roleId: filterRoleId || undefined,
      });
      const rows = (resp.data || []).map(normalizeUser);
      if (!isCancelled.current) {
        setUsers(rows);
        setTotalUsers(resp.meta?.total ?? rows.length);
        setTotalPages(resp.meta?.totalPages ?? 1);
      }
    } catch (error) {
      if (isCancelled.current) return;
      const info = extractApiError(error);
      if (info.status === 401) { navigate('/login', { replace: true }); return; }
      setUsers([]);
      setTotalUsers(0);
      setTotalPages(1);
      showToast('error', 'Could not load users', info.message);
    } finally {
      if (!isCancelled.current) setIsLoading(false);
    }
  }, [currentPage, pageSize, sortColumn, sortReverse, searchQuery, filterRoleId, navigate, showToast]);

  useEffect(() => {
    const isCancelled = { current: false };
    loadUsers(isCancelled);
    return () => { isCancelled.current = true; };
  }, [loadUsers]);

  useEffect(() => {
    const handleClick = (event) => {
      if (kebabRef.current && !kebabRef.current.contains(event.target)) setActiveKebabId(null);
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageNumbers = useMemo(() => getPageNumbers(safeCurrentPage, totalPages), [safeCurrentPage, totalPages]);

  function sortIcon(column) {
    if (sortColumn !== column) return 'ti-arrows-vertical';
    return sortReverse ? 'ti-arrow-down' : 'ti-arrow-up';
  }
  function handleSort(column) {
    if (sortColumn === column) setSortReverse((v) => !v);
    else { setSortColumn(column); setSortReverse(false); }
  }

  function openCreateModal() {
    setEditMode(false);
    setCurrent({ name: '', email: '', mobile: '', roleIds: [], active: true });
    setFormErrors({});
    setModalOpen(true);
  }
  function openEditModal(user) {
    setEditMode(true);
    setCurrent({
      id: user.id,
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      roleIds: [...user.roleIds],
      _originalRoleIds: [...user.roleIds],
      active: user.active,
    });
    setFormErrors({});
    setModalOpen(true);
    setActiveKebabId(null);
  }

  useEffect(() => {
    if (!userIdFromUrl) { autoOpenedIdRef.current = null; return; }
    if (autoOpenedIdRef.current === userIdFromUrl) return;
    const found = users.find((u) => String(u.id) === String(userIdFromUrl));
    if (!found) return; // wait for the list (or a later page) to contain it
    autoOpenedIdRef.current = userIdFromUrl;
    openEditModal(found);
  }, [userIdFromUrl, users]); // eslint-disable-line react-hooks/exhaustive-deps

  function sameSet(a, b) {
    if (a.length !== b.length) return false;
    const s = new Set(a.map(String));
    return b.every((x) => s.has(String(x)));
  }

  async function saveUser() {
    if (!current) return;
    const errs = validateUser(current) || {};
    if (editMode && isSelf(current) && current._originalRoleIds
        && !sameSet(current.roleIds, current._originalRoleIds)) {
      errs.roleIds = 'You cannot change your own roles.';
    }
    if (Object.keys(errs).length) { setFormErrors(errs); return; }

    setSaving(true);
    const payload = {
      name: current.name.trim(),
      email: current.email.trim(),
      mobile: current.mobile?.trim() || null,
      roleIds: current.roleIds,
      active: !!current.active,
    };
    try {
      if (editMode && current.id) {
        await updateUser(current.id, payload);
        showToast('success', 'User updated', `${payload.name} updated successfully.`);
      } else {
        await createUser(payload);
        showToast('success', 'User created', `${payload.name} created successfully.`);
      }
      setModalOpen(false);
      setCurrent(null);
      loadUsers();
    } catch (err) {
      const info = extractApiError(err);
      if (info.status === 401) { navigate('/login', { replace: true }); return; }
      if (info.fields) setFormErrors(info.fields);
      showToast('error', editMode ? 'Update failed' : 'Create failed', info.message);
    } finally {
      setSaving(false);
    }
  }

  async function resetPassword(user) {
    setActiveKebabId(null);
    if (isSelf(user)) {
      showToast('error', 'Not allowed', 'You cannot reset your own password from here.');
      return;
    }
    if (!user.mobile) {
      showToast('error', 'Cannot reset password', 'This user has no mobile number on file.');
      return;
    }
    try {
      const resp = await resetUserPassword(user.mobile);
      const delivered = resp?.data?.emailDelivered;
      showToast(
        'success',
        'Password reset',
        delivered === false
          ? `Password rotated for ${user.name}, but the email could not be delivered.`
          : `A temporary password was emailed to ${user.name}.`
      );
    } catch (err) {
      const info = extractApiError(err);
      if (info.status === 401) { navigate('/login', { replace: true }); return; }
      showToast('error', 'Reset failed', info.message);
    }
  }

  async function toggleUserActive(user) {
    if (isSelf(user)) {
      setActiveKebabId(null);
      showToast('error', 'Not allowed', 'You cannot disable your own account.');
      return;
    }
    const nextActive = !user.active;
    setUsers((cur) => cur.map((u) => (u.id === user.id ? { ...u, active: nextActive } : u)));
    setActiveKebabId(null);
    try {
      await setUserActive(user.id, nextActive);
      showToast('success', nextActive ? 'User enabled' : 'User disabled', `${user.name} ${nextActive ? 'enabled' : 'disabled'}.`);
    } catch (err) {
      setUsers((cur) => cur.map((u) => (u.id === user.id ? { ...u, active: user.active } : u)));
      const info = extractApiError(err);
      if (info.status === 401) { navigate('/login', { replace: true }); return; }
      if (info.code === 'self_disable_forbidden') {
        showToast('error', 'Not allowed', 'You cannot disable your own account.');
        return;
      }
      showToast('error', 'Toggle failed', info.message);
    }
  }

  const startIndex = totalUsers === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const endIndex = Math.min(safeCurrentPage * pageSize, totalUsers);

  function RoleChips({ list }) {
    if (!list || list.length === 0) return <span style={{ color: '#9ca3af' }}>—</span>;
    return (
      <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
        {list.map((r) => {
          const color = roleLookup.get(String(r.id))?.badgeColor || '#374151';
          return (
            <span
              key={r.id}
              style={{
                fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
                color, background: `${color}1a`, border: `1px solid ${color}40`,
              }}
            >
              {r.label || r.name}
            </span>
          );
        })}
      </span>
    );
  }

  return (
    <section className="user-accounts-page mentor-profiles-page">
      <div className="page-header-section">
        <div className="page-header-title-group">
          <span className="page-header-icon-box"><Icon className="fa fa-users" /></span>
          <div>
            <h2>User accounts</h2>
            <p>Create admin users, assign roles, and enable or disable access.</p>
          </div>
        </div>
        <button type="button" className="page-action-button" onClick={openCreateModal}>
          <Icon className="ti ti-plus" /> New User
        </button>
      </div>

      <div className="filter-bar">
        <div className="search-wrapper">
          <Icon className={`ti ${searchInput ? 'ti-close' : 'ti-search'}`} onClick={() => setSearchInput('')} />
          <input
            type="text"
            className="search-input"
            placeholder="Search by name, email, mobile, or role..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <FilterDropdown
          label="All Roles"
          value={filterRoleId}
          options={[
            { value: '', label: 'All Roles' },
            ...roles.map((r) => ({ value: r.id, label: r.label || r.name })),
          ]}
          onChange={(value) => { setFilterRoleId(value); setCurrentPage(1); }}
        />
      </div>

      {(users.length > 0 || isLoading) && (
        <div className="students-table-container">
          <table className="students-table">
            <thead>
              <tr>
                <th className={`sortable ${sortColumn === 'name' ? 'active' : ''}`} onClick={() => handleSort('name')}>
                  Name <Icon className={`sort-icon ti ${sortIcon('name')}`} />
                </th>
                <th>Mobile</th>
                <th className={`sortable ${sortColumn === 'email' ? 'active' : ''}`} onClick={() => handleSort('email')}>
                  Email <Icon className={`sort-icon ti ${sortIcon('email')}`} />
                </th>
                <th className={`sortable ${sortColumn === 'roleLabel' ? 'active' : ''}`} onClick={() => handleSort('roleLabel')}>
                  Roles <Icon className={`sort-icon ti ${sortIcon('roleLabel')}`} />
                </th>
                <th className={`sortable ${sortColumn === 'lastLogin' ? 'active' : ''}`} onClick={() => handleSort('lastLogin')}>
                  Last Login <Icon className={`sort-icon ti ${sortIcon('lastLogin')}`} />
                </th>
                <th className="centered-cell">Status</th>
                <th className="actions-column" />
              </tr>
            </thead>
            {isLoading ? (
              <tbody>
                {Array.from({ length: pageSize }, (_, index) => (
                  <tr key={`user-skel-${index}`}>
                    <td><div className="mentor-skeleton-profile"><div className="mentor-skeleton avatar" /><div className="mentor-skeleton medium" /></div></td>
                    <td><div className="mentor-skeleton medium" /></td>
                    <td><div className="mentor-skeleton long" /></td>
                    <td><div className="mentor-skeleton short" /></td>
                    <td><div className="mentor-skeleton short" /></td>
                    <td><div className="mentor-skeleton short" /></td>
                    <td />
                  </tr>
                ))}
              </tbody>
            ) : (
              <tbody ref={kebabRef}>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="profile-cell">
                        <div className="avatar-placeholder">{getInitials(user.name)}</div>
                        <div><div className="profile-name">{user.name}</div></div>
                      </div>
                    </td>
                    <td>{user.mobile || <span style={{ color: '#9ca3af' }}>—</span>}</td>
                    <td className="mentor-small-copy">{user.email}</td>
                    <td><RoleChips list={user.roles} /></td>
                    <td className="mentor-small-copy">{formatLastLogin(user.lastLogin)}</td>
                    <td className="centered-cell">
                      <label
                        className="ua-toggle"
                        title={isSelf(user) ? 'You cannot disable your own account' : (user.active ? 'Disable user' : 'Enable user')}
                        onClick={(e) => e.stopPropagation()}
                        style={isSelf(user) ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                      >
                        <input type="checkbox" checked={!!user.active} disabled={isSelf(user)} onChange={() => toggleUserActive(user)} />
                        <span className="ua-toggle-slider" />
                      </label>
                    </td>
                    <td className="mentor-actions-cell">
                      <div className="kebab-menu-container">
                        <button type="button" className="kebab-button" onClick={(event) => { event.stopPropagation(); setActiveKebabId((c) => (c === user.id ? null : user.id)); }}>
                          <Icon className="ti ti-more-alt" />
                        </button>
                        <div className={`kebab-dropdown ${activeKebabId === user.id ? 'active' : ''}`}>
                          <button type="button" className="kebab-dropdown-item edit-action" onClick={() => openEditModal(user)}>
                            <Icon className="ti ti-pencil" /><span>Edit User</span>
                          </button>
                          {user.active && !isSelf(user) && (
                            <button type="button" className="kebab-dropdown-item" onClick={() => resetPassword(user)}>
                              <Icon className="ti ti-key" /><span>Reset Password</span>
                            </button>
                          )}
                          {!isSelf(user) && (
                            <button type="button" className="kebab-dropdown-item" onClick={() => toggleUserActive(user)}>
                              <Icon className={`ti ${user.active ? 'ti-na' : 'ti-check'}`} /><span>{user.active ? 'Disable' : 'Enable'}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>

          <div className="pagination-container">
            <div className="pagination-info">
              <span>Showing {startIndex} to {endIndex} of {totalUsers} users</span>
              <select className="page-size-select" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}>
                {[10, 20, 50, 100].map((size) => (<option key={size} value={size}>Show {size}</option>))}
              </select>
            </div>
            <div className="pagination-controls">
              <button type="button" className="pagination-btn" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={safeCurrentPage === 1}>
                <Icon className="ti ti-angle-left" /> Previous
              </button>
              {pageNumbers.map((page) => (
                <button key={page} type="button" className={`pagination-btn ${page === safeCurrentPage ? 'active' : ''}`} onClick={() => setCurrentPage(page)}>
                  {page}
                </button>
              ))}
              <button type="button" className="pagination-btn" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={safeCurrentPage === totalPages}>
                Next <Icon className="ti ti-angle-right" />
              </button>
            </div>
          </div>
        </div>
      )}

      {!isLoading && totalUsers === 0 ? (
        <div className="mentors-table-container">
          <div className="empty-state">
            <Icon className="ti ti-user" />
            <h3>No Users Found</h3>
            <p>{searchQuery || filterRoleId ? 'No users match your search criteria.' : 'Get started by adding your first user.'}</p>
          </div>
        </div>
      ) : null}

      {/* Create/Edit Modal */}
      <div className={`legacy-modal-backdrop ${modalOpen ? 'active' : ''}`} onClick={() => !saving && setModalOpen(false)}>
        <div className="legacy-modal-dialog legacy-large" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
          <div className="legacy-modal-header">
            <h3><Icon className="ti ti-user" /> {editMode ? 'Edit User' : 'Add New User'}</h3>
            <button type="button" className="legacy-modal-close" onClick={() => setModalOpen(false)} disabled={saving}>
              <Icon className="ti ti-close" />
            </button>
          </div>
          <form className="form-modal" onSubmit={(e) => { e.preventDefault(); if (!saving) saveUser(); }}>
          <div className="legacy-modal-body">
            <div className="asset-form-section">
              <div className="asset-form-section-title"><Icon className="ti ti-user" /> Profile</div>
              <div className="asset-form-grid basic-grid">
                <label className="field-cell full-span">
                  <div className={`float-field ${formErrors.name ? 'has-error' : ''}`}>
                    <input
                      type="text"
                      className="float-control"
                      placeholder=" "
                      value={current?.name || ''}
                      onChange={(e) => setCurrent((c) => ({ ...c, name: e.target.value }))}
                    />
                    <span className="float-label">Name <span className="req">*</span></span>
                  </div>
                  {formErrors.name && <span className="field-error">{formErrors.name}</span>}
                </label>
                <label className="field-cell">
                  <div className={`float-field ${formErrors.email ? 'has-error' : ''}`}>
                    <input
                      type="email"
                      className="float-control"
                      placeholder=" "
                      value={current?.email || ''}
                      onChange={(e) => setCurrent((c) => ({ ...c, email: e.target.value }))}
                    />
                    <span className="float-label">Email <span className="req">*</span></span>
                  </div>
                  {formErrors.email && <span className="field-error">{formErrors.email}</span>}
                </label>
                <label className="field-cell">
                  <div className={`float-field ${formErrors.mobile ? 'has-error' : ''}`}>
                    <input
                      type="tel"
                      className="float-control"
                      placeholder=" "
                      value={current?.mobile || ''}
                      onChange={(e) => setCurrent((c) => ({ ...c, mobile: e.target.value }))}
                    />
                    <span className="float-label">Mobile</span>
                  </div>
                  {formErrors.mobile && <span className="field-error">{formErrors.mobile}</span>}
                </label>
              </div>
            </div>

            <div className="asset-form-section">
              <div className="asset-form-section-title"><Icon className="ti ti-shield-lock" /> Access</div>
              <div className="asset-form-grid">
                <label className="field-cell full-span">
                  <span className="field-static-label">Roles <span className="req">*</span></span>
                  <MultiRoleSelect
                    roles={roles}
                    value={current?.roleIds || []}
                    onChange={(ids) => setCurrent((c) => ({ ...c, roleIds: ids }))}
                    disabled={editMode && current ? isSelf(current) : false}
                  />
                  {editMode && current && isSelf(current) && (
                    <span className="field-hint">You cannot change your own roles.</span>
                  )}
                  {formErrors.roleIds && <span className="field-error">{formErrors.roleIds}</span>}
                </label>
              </div>
            </div>
          </div>
          <div className="legacy-modal-footer">
            <div className="ua-footer-toggle" style={{ marginRight: 'auto', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
              <label className="ua-inline-toggle">
                <span className="ua-toggle" style={editMode && current && isSelf(current) ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}>
                  <input type="checkbox" checked={!!current?.active} disabled={editMode && current ? isSelf(current) : false} onChange={(e) => setCurrent((c) => ({ ...c, active: e.target.checked }))} />
                  <span className="ua-toggle-slider" />
                </span>
                <span className="field-static-label" style={{ margin: 0 }}>Account enabled</span>
              </label>
              {editMode && current && isSelf(current) && (
                <span className="field-hint">You cannot disable your own account.</span>
              )}
            </div>
            <button type="button" className="legacy-btn legacy-btn-default" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</button>
            <button type="submit" className="legacy-btn legacy-btn-success" disabled={saving}>
              <Icon className="ti ti-check" /> {saving ? 'Saving…' : (editMode ? 'Update' : 'Create')} User
            </button>
          </div>
          </form>
        </div>
      </div>

      <style>{`
        .ua-toggle { position: relative; display: inline-block; width: 38px; height: 22px; cursor: pointer; vertical-align: middle; }
        .ua-toggle input { opacity: 0; width: 0; height: 0; }
        .ua-toggle-slider { position: absolute; inset: 0; background: #cbd5e1; border-radius: 999px; transition: background .15s ease; }
        .ua-toggle-slider::before { content: ''; position: absolute; height: 16px; width: 16px; left: 3px; top: 3px; background: white; border-radius: 50%; transition: transform .15s ease; box-shadow: 0 1px 2px rgba(0,0,0,.15); }
        .ua-toggle input:checked + .ua-toggle-slider { background: #16a34a; }
        .ua-toggle input:checked + .ua-toggle-slider::before { transform: translateX(16px); }
        .ua-inline-toggle { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .ua-form-error { color: #b91c1c; font-size: 12px; margin-top: 4px; }
        .ua-form-hint { color: #6b7280; font-size: 12px; margin-top: 4px; }
      `}</style>
    </section>
  );
}
