import React, { useState, useEffect, useRef, useMemo } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { clearToken } from '../lib/auth';
import { changePassword } from '../lib/userProfileApi';
import { apiErrorMessage, handleUnauthorized } from '../lib/api';
import { protectedScreens, NAV_GROUPS } from '../lib/legacyScreens';
import { getInitials, useUser } from '../lib/userStore';
import { canAccess, isSuperAdmin } from '../lib/roles';
import { has as permHas } from '../lib/permissions';
import { consumeFlash } from '../lib/flash';
import ToastRegion from './ToastRegion';
import SpotlightSearch from './SpotlightSearch';
import Icon from './Icon';

// Font Awesome icons are stored without the `fa ` prefix; Tabler ones carry `ti`.
function iconClass(icon) {
  return `${icon.startsWith('ti') ? '' : 'fa '}${icon}`;
}

const SEARCH_SHORTCUT = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K';

export default function Layout({ children, currentScreen }) {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { user, prefs, togglePin, reorderPins, updateUser } = useUser() || {};

  const pinnedPaths = prefs?.pinnedPaths || [];

  // Display name + role for the sidebar profile strip. Prefer the RBAC
  // `roles` array (the new source of truth); fall back to legacy `roleLabel`.
  const displayName = user?.name || 'User';
  const displayRole = (() => {
    const list = Array.isArray(user?.roles) ? user.roles : [];
    if (list.length > 0) {
      return list
        .map((r) =>
          String(r)
            .toLowerCase()
            .split('_')
            .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ''))
            .join(' ')
        )
        .join(', ');
    }
    return user?.roleLabel || '';
  })();

  // ── Sidebar collapsed state ────────────────────────────────────────
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sb_collapsed') === 'true'
  );

  function toggleSidebar() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem('sb_collapsed', String(next));
      return next;
    });
  }

  // ── Global Tooltip State (For collapsed hover) ─────────────────────
  const [hoverTooltip, setHoverTooltip] = useState(null);

  function showTooltip(e, text) {
    const rect = e.currentTarget.getBoundingClientRect();
    setHoverTooltip({ text, top: rect.top + rect.height / 2, left: rect.right + 10 });
  }

  // Collapsed rail tooltips: only wired up while the sidebar is collapsed.
  function railTooltip(text) {
    if (!collapsed) return {};
    return {
      onMouseEnter: (e) => showTooltip(e, text),
      onMouseLeave: () => setHoverTooltip(null),
    };
  }

  // ── Group open/close state ─────────────────────────────────────────
  const activeGroupId = useMemo(() => {
    const s = protectedScreens.find((s) => s.path === location.pathname);
    return s?.group ?? null;
  }, [location.pathname]);

  const [openGroups, setOpenGroups] = useState(() => {
    const s = protectedScreens.find((s) => s.path === location.pathname);
    return s?.group ? { [s.group]: true } : {};
  });

  useEffect(() => {
    if (activeGroupId) {
      setOpenGroups((prev) => ({ ...prev, [activeGroupId]: true }));
    }
  }, [activeGroupId]);

  function toggleGroup(id) {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  // Clicking a group icon on the collapsed rail reopens the sidebar on that group.
  function expandToGroup(id) {
    setHoverTooltip(null);
    setOpenGroups((prev) => ({ ...prev, [id]: true }));
    setCollapsed(false);
    localStorage.setItem('sb_collapsed', 'false');
  }

  function openSpotlight() {
    setHoverTooltip(null);
    window.dispatchEvent(new CustomEvent('spotlight:open'));
  }

  // ── Allowed screens (role-filtered) ───────────────────────────────
  const role = user?.role || 'super_admin';

  const permissions = user?.permissions;
  const allowedScreens = useMemo(
    () => protectedScreens.filter((s) => {
      if (!canAccess(role, s.path)) return false;
      // If we have a known permission set, also require the view permission.
      if (s.viewPermission && Array.isArray(permissions) && permissions.length > 0) {
        return permHas(permissions, s.viewPermission);
      }
      return true;
    }),
    [role, permissions]
  );

  const grouped = useMemo(() =>
    NAV_GROUPS.map((g) => ({
      ...g,
      screens: allowedScreens.filter((s) => s.group === g.id),
    })).filter((g) => g.screens.length > 0),
  [allowedScreens]);

  const pinnedScreens = useMemo(
    // Sort by pinnedPaths order (not allowedScreens order) so reordering is reflected
    () => pinnedPaths
      .map((path) => allowedScreens.find((s) => s.path === path))
      .filter(Boolean),
    [allowedScreens, pinnedPaths]
  );

  // ── Drag state for pinned reorder ────────────────────────────────
  const dragSrcPath = useRef(null);
  const dropIndicatorRef = useRef(null);
  const [dropIndicator, setDropIndicator] = useState(null);
  const [isDraggingPin, setIsDraggingPin] = useState(false);
  const [draggingPath, setDraggingPath] = useState(null); // drives faded class via React state

  function setIndicator(value) {
    dropIndicatorRef.current = value;
    setDropIndicator(value);
  }

  function handleDragStart(e, path) {
    dragSrcPath.current = path;
    e.dataTransfer.effectAllowed = 'move';
    setIsDraggingPin(true);
    setDraggingPath(path); // React state — triggers re-render to apply faded class
  }

  function handleDragOver(e, path) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position = e.clientY < midY ? 'before' : 'after';
    setIndicator({ path, position });
  }

  function handleDrop(e, targetPath) {
    e.preventDefault();
    const src = dragSrcPath.current;
    const indicator = dropIndicatorRef.current;
    dragSrcPath.current = null;
    setDraggingPath(null);   // clear before reorder so re-render shows no fade
    setIsDraggingPin(false);
    setIndicator(null);
    if (!src || !indicator) return;
    const pins = [...(prefs?.pinnedPaths || [])];
    const srcIdx = pins.indexOf(src);
    if (srcIdx === -1) return;
    pins.splice(srcIdx, 1);
    let tgtIdx = pins.indexOf(targetPath);
    if (tgtIdx === -1) return;
    if (indicator.position === 'after') tgtIdx += 1;
    pins.splice(tgtIdx, 0, src);
    reorderPins?.(pins);
  }

  function handleDragEnd() {
    dragSrcPath.current = null;
    setDraggingPath(null);
    setIsDraggingPin(false);
    setIndicator(null);
  }

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileRef = useRef(null);
  // Temporarily expose Roles & Permissions to every signed-in user.
  const showSuperAdmin = isSuperAdmin(user)
    || (Array.isArray(user?.permissions) && user.permissions.includes('*'));

  // ── Flash toasts (e.g. forbidden redirect) ─────────────────────────
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);
  useEffect(() => {
    const flash = consumeFlash();
    if (!flash) return;
    const id = ++toastIdRef.current;
    setToasts((cur) => [...cur, { id, ...flash }]);
    window.setTimeout(() => {
      setToasts((cur) => cur.filter((t) => t.id !== id));
    }, 4500);
  }, [location.pathname]);

  useEffect(() => {
    if (!showProfileMenu) return;
    function onClickOutside(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setShowProfileMenu(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showProfileMenu]);

  // ── My Profile modal ──────────────────────────────────────────────
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState('');

  function openProfileModal() {
    setShowProfileMenu(false);
    setEditingName(false);
    setNameError('');
    setNameDraft(user?.name || '');
    setShowProfileModal(true);
  }

  function closeProfileModal() {
    setShowProfileModal(false);
    setEditingName(false);
    setNameError('');
  }

  async function saveName() {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setNameError('Name cannot be empty');
      return;
    }
    if (trimmed === user?.name) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    setNameError('');
    const res = await updateUser?.({ name: trimmed });
    setSavingName(false);
    if (res?.ok === false) {
      setNameError('Could not update name. Please try again.');
      return;
    }
    setEditingName(false);
  }

  // ── Change Password modal ─────────────────────────────────────────
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [pwdCurrent, setPwdCurrent] = useState('');
  const [pwdNew, setPwdNew] = useState('');
  const [pwdConfirm, setPwdConfirm] = useState('');
  const [pwdShow, setPwdShow] = useState(false);
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);

  function openPasswordModal() {
    setShowProfileMenu(false);
    setPwdCurrent('');
    setPwdNew('');
    setPwdConfirm('');
    setPwdShow(false);
    setPwdError('');
    setPwdSuccess('');
    setShowPasswordModal(true);
  }

  function closePasswordModal() {
    if (pwdSaving) return;
    setShowPasswordModal(false);
  }

  async function submitPasswordChange(e) {
    if (e) e.preventDefault();
    setPwdError('');
    setPwdSuccess('');

    if (!pwdCurrent || !pwdNew || !pwdConfirm) {
      setPwdError('Please fill out all fields.');
      return;
    }
    if (pwdNew.length < 8) {
      setPwdError('New password must be at least 8 characters.');
      return;
    }
    if (pwdNew === pwdCurrent) {
      setPwdError('New password must be different from current password.');
      return;
    }
    if (pwdNew !== pwdConfirm) {
      setPwdError('New password and confirmation do not match.');
      return;
    }

    setPwdSaving(true);
    try {
      await changePassword({
        currentPassword: pwdCurrent,
        newPassword: pwdNew,
      });
      // A password change signs every session out, this one included, so
      // send the user back to sign in with the new password.
      setPwdSuccess('Password changed. Please sign in again with your new password.');
      setPwdCurrent('');
      setPwdNew('');
      setPwdConfirm('');
      setTimeout(() => {
        setShowPasswordModal(false);
        setPwdSuccess('');
        handleUnauthorized();
      }, 1500);
    } catch (err) {
      // 422 invalid_credentials (wrong current password), password_unchanged
      // or validation_error.
      setPwdError(apiErrorMessage(err, 'Could not change password. Please try again.'));
    } finally {
      setPwdSaving(false);
    }
  }

  // ── Logout ────────────────────────────────────────────────────────
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  function requestLogout() {
    setShowProfileMenu(false);
    setShowLogoutConfirm(true);
  }

  function confirmLogout() {
    setShowLogoutConfirm(false);
    clearToken();
    // Hard navigation: avoids a render race between this navigate() and
    // ProtectedRoute's own <Navigate to="/login"> when isAuthenticated()
    // flips mid-transition, and guarantees UserProvider unmounts cleanly.
    window.location.assign('/login');
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar${collapsed ? ' sidebar-collapsed' : ''}`}>

        {/* ── Logo / collapse toggle ────────────────────────────── */}
        <div
          className="sb-brand"
          role="button"
          tabIndex={0}
          onClick={() => (collapsed ? toggleSidebar() : navigate('/landing'))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (collapsed) toggleSidebar();
              else navigate('/landing');
            }
          }}
          title={collapsed ? 'Expand sidebar' : 'Go to Home'}
        >
          <img
            src="/assets/logo/logo.svg"
            alt="Crispr"
            className="sb-logo-img"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
          {!collapsed && (
            <button
              type="button"
              className="sb-collapse-btn"
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
              onClick={(e) => { e.stopPropagation(); toggleSidebar(); }}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <Icon className="ti ti-angle-double-left" />
            </button>
          )}
        </div>

        {/* ── Search (opens Spotlight) ──────────────────────────── */}
        <button
          type="button"
          className="sb-search"
          onClick={openSpotlight}
          aria-label="Search pages and people"
          aria-keyshortcuts="Meta+K Control+K"
          {...railTooltip(`Search  ${SEARCH_SHORTCUT}`)}
        >
          <Icon className="ti ti-search" />
          {!collapsed && (
            <>
              <span className="sb-search-label">Search</span>
              <kbd>{SEARCH_SHORTCUT}</kbd>
            </>
          )}
        </button>

        {/* ── Nav ───────────────────────────────────────────────── */}
        <nav className="sb-nav" aria-label="Primary">

          {/* Pinned section — hidden on the landing page (shown there as tiles) */}
          {location.pathname !== '/landing' && pinnedScreens.length > 0 && (
            <div className="sb-group">
              {!collapsed && <div className="sb-section-label">Pinned</div>}
              <div className={`sb-group-items sb-group-items--open sb-group-items--flat${isDraggingPin ? ' sb-pins-dragging' : ''}`}>
                {pinnedScreens.map((screen) => {
                  const ind = dropIndicator?.path === screen.path ? dropIndicator.position : null;
                  const isDragging = draggingPath === screen.path;
                  return (
                    <div
                      key={screen.path}
                      draggable
                      onDragStart={(e) => handleDragStart(e, screen.path)}
                      onDragOver={(e) => handleDragOver(e, screen.path)}
                      onDrop={(e) => handleDrop(e, screen.path)}
                      onDragEnd={handleDragEnd}
                      className={`sb-pin-drag-wrap${isDragging ? ' sb-pin-dragging' : ''}`}
                    >
                      {ind === 'before' && <div className="sb-drop-line" />}
                      <NavItem
                        screen={screen}
                        collapsed={collapsed}
                        showIcon
                        pinned
                        onTogglePin={togglePin}
                        setHoverTooltip={setHoverTooltip}
                      />
                      {ind === 'after' && <div className="sb-drop-line" />}
                    </div>
                  );
                })}
              </div>
              <div className="sb-group-divider" />
            </div>
          )}

          {/* Role-filtered groups */}
          {grouped.map((group) => {
            const isOpen    = !collapsed && Boolean(openGroups[group.id]);
            const hasActive = group.screens.some((s) => s.path === location.pathname);

            return (
              <div key={group.id} className="sb-group">
                <button
                  type="button"
                  className={`sb-group-hdr${hasActive ? ' has-active' : ''}${isOpen ? ' open' : ''}`}
                  aria-expanded={collapsed ? undefined : isOpen}
                  aria-label={collapsed ? group.label : undefined}
                  onClick={() => (collapsed ? expandToGroup(group.id) : toggleGroup(group.id))}
                  {...railTooltip(group.label)}
                >
                  <Icon className={`${iconClass(group.icon)} sb-icon`} />
                  {!collapsed && (
                    <>
                      <span className="sb-label">{group.label}</span>
                      <Icon className="ti ti-angle-down sb-chevron" />
                    </>
                  )}
                </button>

                {!collapsed && (
                  <div
                    className={`sb-group-items${isOpen ? ' sb-group-items--open' : ''}`}
                    inert={!isOpen}
                  >
                    {group.screens.map((screen) => (
                      <NavItem
                        key={screen.path}
                        screen={screen}
                        collapsed={false}
                        pinned={pinnedPaths.includes(screen.path)}
                        onTogglePin={togglePin}
                        setHoverTooltip={setHoverTooltip}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* ── User profile strip ────────────────────────────────── */}
        <div className="sb-profile-strip" ref={profileRef}>
          <button
            type="button"
            className={`sb-profile-btn${showProfileMenu ? ' open' : ''}`}
            onClick={() => setShowProfileMenu((v) => !v)}
            title={collapsed ? `${displayName}${displayRole ? ` — ${displayRole}` : ''}` : undefined}
          >
            <div className="sb-avatar">{user?.initials || getInitials(displayName)}</div>
            {!collapsed && (
              <>
                <div className="sb-user-info">
                  <span className="sb-user-name">{displayName}</span>
                  {displayRole && (
                    <span
                      className="sb-user-role"
                      style={user?.badgeColor ? { color: user.badgeColor } : undefined}
                      title={displayRole}
                    >
                      {displayRole}
                    </span>
                  )}
                </div>
                <Icon className="ti ti-more-alt sb-profile-dots" />
              </>
            )}
          </button>

          {/* Popover menu */}
          {showProfileMenu && (
            <div className="sb-profile-menu">
              <button type="button" className="sb-profile-menu-item"
                onClick={openProfileModal}>
                <Icon className="ti ti-user" />
                <span>My Profile</span>
              </button>
              <button type="button" className="sb-profile-menu-item"
                onClick={openPasswordModal}>
                <Icon className="ti ti-lock" />
                <span>Change Password</span>
              </button>
              {showSuperAdmin && (
                <button
                  type="button"
                  className="sb-profile-menu-item"
                  onClick={() => { setShowProfileMenu(false); navigate('/permission?tab=roles'); }}
                >
                  <Icon className="ti ti-shield" />
                  <span>Roles &amp; Permissions</span>
                </button>
              )}
              {showSuperAdmin && (
                <button
                  type="button"
                  className="sb-profile-menu-item"
                  onClick={() => { setShowProfileMenu(false); navigate('/user-accounts'); }}
                >
                  <Icon className="ti ti-id-badge" />
                  <span>User Accounts</span>
                </button>
              )}
              {showSuperAdmin && (
                <button
                  type="button"
                  className="sb-profile-menu-item"
                  onClick={() => { setShowProfileMenu(false); navigate('/locations'); }}
                >
                  <Icon className="ti ti-location-pin" />
                  <span>Locations</span>
                </button>
              )}
              <div className="sb-profile-menu-divider" />
              <button type="button" className="sb-profile-menu-item danger"
                onClick={requestLogout}>
                <Icon className="ti ti-power-off" />
                <span>Logout</span>
              </button>
            </div>
          )}
        </div>

      </aside>

      {/* ── Main content ──────────────────────────────────────────── */}
      <main className={`content${location.pathname === '/landing' ? ' content--landing' : ''}`}>
        {children}
      </main>

      {/* ── Global Tooltip Portal (Breaks out of overflow: hidden) ── */}
      <div 
        className={`sb-tooltip sb-tooltip-portal${hoverTooltip ? ' visible' : ''}`}
        style={{
          top: hoverTooltip ? hoverTooltip.top : -9999,
          left: hoverTooltip ? hoverTooltip.left : -9999,
        }}
      >
        {hoverTooltip?.text}
      </div>

      {/* ── My Profile modal ──────────────────────────────────────── */}
      <div
        className={`legacy-modal-backdrop ${showProfileModal ? 'active' : ''}`}
        onClick={closeProfileModal}
      >
        <div
          className="legacy-modal-dialog legacy-confirm sb-profile-modal"
          role="dialog"
          aria-modal="true"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="legacy-modal-header">
            <h3><Icon className="fa fa-user-circle-o" /> My Profile</h3>
            <button
              type="button"
              className="legacy-modal-close"
              onClick={closeProfileModal}
              aria-label="Close"
            >
              <Icon className="fa fa-times" />
            </button>
          </div>
          <div className="legacy-modal-body">
            <div className="sb-profile-modal-body">
              <div className="sb-profile-modal-icon">
                <Icon className="fa fa-user-circle" />
              </div>

              <div className="sb-profile-modal-identity">
                {editingName ? (
                  <div className="sb-profile-name-edit">
                    <input
                      type="text"
                      className="sb-profile-name-input"
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveName();
                        if (e.key === 'Escape') { setEditingName(false); setNameError(''); setNameDraft(user?.name || ''); }
                      }}
                      autoFocus
                      disabled={savingName}
                    />
                    <button
                      type="button"
                      className="legacy-btn legacy-btn-success legacy-btn-small"
                      onClick={saveName}
                      disabled={savingName}
                    >
                      {savingName ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      type="button"
                      className="legacy-btn legacy-btn-default legacy-btn-small"
                      onClick={() => { setEditingName(false); setNameError(''); setNameDraft(user?.name || ''); }}
                      disabled={savingName}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="sb-profile-name-row">
                    <span className="sb-profile-name">{user?.name || 'Admin'}</span>
                    <button
                      type="button"
                      className="sb-profile-edit-btn"
                      onClick={() => { setNameDraft(user?.name || ''); setEditingName(true); setNameError(''); }}
                      title="Edit name"
                    >
                      <Icon className="fa fa-pencil" />
                    </button>
                  </div>
                )}
                {nameError && <div className="sb-profile-name-error">{nameError}</div>}
                <div
                  className="sb-profile-modal-role"
                  style={user?.badgeColor ? { color: user.badgeColor } : undefined}
                >
                  {user?.roleLabel || 'Super Admin'}
                </div>
              </div>

              <dl className="sb-profile-modal-fields">
                <div className="sb-profile-field">
                  <dt>Registered Email</dt>
                  <dd>{user?.email || '—'}</dd>
                </div>
                <div className="sb-profile-field">
                  <dt>Registered Number</dt>
                  <dd>{user?.phone || '—'}</dd>
                </div>
              </dl>
            </div>
          </div>
          <div className="legacy-modal-footer">
            <button
              type="button"
              className="legacy-btn legacy-btn-default"
              onClick={closeProfileModal}
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* ── Change Password modal ─────────────────────────────────── */}
      <div
        className={`legacy-modal-backdrop ${showPasswordModal ? 'active' : ''}`}
        onClick={closePasswordModal}
      >
        <div
          className="legacy-modal-dialog legacy-confirm sb-password-modal"
          role="dialog"
          aria-modal="true"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="legacy-modal-header">
            <h3><Icon className="fa fa-lock" /> Change Password</h3>
            <button
              type="button"
              className="legacy-modal-close"
              onClick={closePasswordModal}
              aria-label="Close"
              disabled={pwdSaving}
            >
              <Icon className="fa fa-times" />
            </button>
          </div>
          <form className="password-modal-form form-modal" onSubmit={submitPasswordChange}>
            <div className="legacy-modal-body">
              <div className="asset-form-section">
                <div className="asset-form-grid">
                  <label className="field-cell full-span">
                    <div className="float-field">
                      <input
                        id="pwd-current"
                        type={pwdShow ? 'text' : 'password'}
                        className="float-control"
                        placeholder=" "
                        value={pwdCurrent}
                        onChange={(e) => setPwdCurrent(e.target.value)}
                        autoComplete="current-password"
                        disabled={pwdSaving}
                      />
                      <span className="float-label">Current Password <span className="req">*</span></span>
                    </div>
                  </label>
                  <label className="field-cell full-span">
                    <div className={`float-field ${pwdError ? 'has-error' : ''}`}>
                      <input
                        id="pwd-new"
                        type={pwdShow ? 'text' : 'password'}
                        className="float-control"
                        placeholder=" "
                        value={pwdNew}
                        onChange={(e) => setPwdNew(e.target.value)}
                        autoComplete="new-password"
                        disabled={pwdSaving}
                      />
                      <span className="float-label">New Password <span className="req">*</span></span>
                    </div>
                    <span className="field-hint">At least 8 characters.</span>
                  </label>
                  <label className="field-cell full-span">
                    <div className={`float-field ${pwdError ? 'has-error' : ''}`}>
                      <input
                        id="pwd-confirm"
                        type={pwdShow ? 'text' : 'password'}
                        className="float-control"
                        placeholder=" "
                        value={pwdConfirm}
                        onChange={(e) => setPwdConfirm(e.target.value)}
                        autoComplete="new-password"
                        disabled={pwdSaving}
                      />
                      <span className="float-label">Confirm New Password <span className="req">*</span></span>
                    </div>
                  </label>
                </div>
                <label className="sb-password-show">
                  <input
                    type="checkbox"
                    checked={pwdShow}
                    onChange={(e) => setPwdShow(e.target.checked)}
                  />
                  <span>Show passwords</span>
                </label>

                {pwdError && <div className="sb-password-error">{pwdError}</div>}
                {pwdSuccess && <div className="sb-password-success">{pwdSuccess}</div>}
              </div>
            </div>
            <div className="legacy-modal-footer">
              <button
                type="button"
                className="legacy-btn legacy-btn-default"
                onClick={closePasswordModal}
                disabled={pwdSaving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="legacy-btn legacy-btn-success"
                disabled={pwdSaving}
              >
                {pwdSaving ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* ── Global flash toasts ───────────────────────────────────── */}
      <ToastRegion
        toasts={toasts}
        onDismiss={(id) => setToasts((cur) => cur.filter((t) => t.id !== id))}
      />

      {/* ── Logout confirmation modal ─────────────────────────────── */}
      <div
        className={`legacy-modal-backdrop ${showLogoutConfirm ? 'active' : ''}`}
        onClick={() => setShowLogoutConfirm(false)}
      >
        <div
          className="legacy-modal-dialog legacy-confirm"
          role="dialog"
          aria-modal="true"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="legacy-modal-header legacy-danger-header">
            <h3><Icon className="fa fa-sign-out" /> Confirm Logout</h3>
            <button
              type="button"
              className="legacy-modal-close"
              onClick={() => setShowLogoutConfirm(false)}
            >
              <Icon className="fa fa-times" />
            </button>
          </div>
          <div className="legacy-modal-body">
            <p className="legacy-confirm-copy">Are you sure you want to log out?</p>
          </div>
          <div className="legacy-modal-footer">
            <button
              type="button"
              className="legacy-btn legacy-btn-default"
              onClick={() => setShowLogoutConfirm(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="legacy-btn legacy-btn-danger"
              onClick={confirmLogout}
            >
              <Icon className="fa fa-sign-out" /> Logout
            </button>
          </div>
        </div>
      </div>

      <SpotlightSearch />
    </div>
  );
}

// ─── Individual nav item with pin button ──────────────────────────────────────
function NavItem({ screen, collapsed, showIcon = false, pinned, onTogglePin, setHoverTooltip }) {
  return (
    <div 
      className="sb-item-wrap"
      onMouseEnter={(e) => {
        if (collapsed) {
          const rect = e.currentTarget.getBoundingClientRect();
          setHoverTooltip({ text: screen.title, top: rect.top + rect.height / 2, left: rect.right + 10 });
        }
      }}
      onMouseLeave={() => {
        if (collapsed) setHoverTooltip(null);
      }}
    >
      <NavLink
        to={screen.path}
        className={({ isActive }) => `sb-item${isActive ? ' active' : ''}`}
        aria-label={collapsed ? screen.title : undefined}
      >
        {(showIcon || collapsed) && <Icon className={`${iconClass(screen.icon)} sb-icon`} />}
        {!collapsed && <span className="sb-label">{screen.title}</span>}
      </NavLink>
      {!collapsed && (
        <button
          type="button"
          className={`sb-pin-btn${pinned ? ' pinned' : ''}`}
          title={pinned ? 'Unpin' : 'Pin to top'}
          aria-label={pinned ? `Unpin ${screen.title}` : `Pin ${screen.title}`}
          onClick={() => onTogglePin(screen.path)}
        >
          <Icon className="ti ti-pin2" />
        </button>
      )}
    </div>
  );
}
