import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ToastRegion from '../components/ToastRegion';
import { apiErrorMessage, handleUnauthorized } from '../lib/api';
import { changePassword } from '../lib/userProfileApi';
import { allScreens } from '../lib/legacyScreens';
import { canAccess } from '../lib/roles';
import { useUser } from '../lib/userStore';

function getGreeting(date) {
  const h = date.getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  if (h < 21) return 'Good Evening';
  return 'Good Night';
}

function formatHeaderLine(date) {
  const weekday = date.toLocaleDateString('en-IN', { weekday: 'long' });
  const time = date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
  const day = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${weekday} ${time} | ${day}`;
}

export default function LandingPage() {
  const navigate = useNavigate();
  const { user, prefs, togglePin, updateUser } = useUser() || {};

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const role = user?.role || 'super_admin';
  const pinnedPaths = prefs?.pinnedPaths || [];

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

  const pinnedScreens = useMemo(() => {
    return pinnedPaths
      .map((path) => allScreens.find((s) => s.path === path))
      .filter(Boolean)
      .filter((s) => s.protected && canAccess(role, s.path));
  }, [pinnedPaths, role]);

  // ── "Your day at a glance" summary tiles (only shown if user can view the page) ──
  const summaryTiles = useMemo(() => {
    // `trend` is the last 7 days (oldest → today); `delta` is % change vs
    // yesterday; `deltaGood` says whether that direction is desirable, so the
    // tile can colour it green/red independent of the arrow direction.
    const items = [
      { path: '/support',              label: 'Support Tickets', count: '13',  unit: 'open tickets',       icon: 'fa fa-life-ring',       color: '#f97316', alert: 13, trend: [9, 11, 10, 14, 12, 12, 13],        delta: 8,   deltaGood: false },
      { path: '/leads-management',     label: 'Leads',           count: '34',  unit: 'to address today',   icon: 'fa fa-user-plus',       color: '#16a34a', alert: 34, trend: [22, 25, 24, 30, 28, 30, 34],      delta: 12,  deltaGood: true },
      { path: '/orders',               label: 'Orders',          count: '34',  unit: 'orders received',    icon: 'fa fa-shopping-cart',   color: '#22c55e',            trend: [28, 30, 27, 33, 31, 32, 34],      delta: 5,   deltaGood: true },
      { path: '/offline-attendance',   label: 'Attendance',      count: '34',  total: '355', unit: 'absentees today', icon: 'fa fa-check-square-o', color: '#ef4444', trend: [40, 36, 38, 30, 33, 33, 34], delta: 3, deltaGood: false },
      { path: '/live-class-scheduler', label: 'Live Classes',    count: '3',   unit: 'classes today',      icon: 'fa fa-video-camera',    color: '#0ea5e9',            trend: [2, 3, 2, 4, 3, 3, 3],             delta: 0,   deltaGood: true },
      { path: '/schedule-list',        label: 'Schedules',       count: '2',   unit: 'active schedules',   icon: 'fa fa-calendar',        color: '#8b5cf6',            trend: [3, 3, 2, 2, 2, 2, 2],             delta: 0,   deltaGood: true },
      { path: '/quiz-listing',         label: 'Quizzes',         count: '240', unit: 'students completed', icon: 'fa fa-question-circle', color: '#6366f1',            trend: [180, 210, 195, 225, 230, 228, 240], delta: 5, deltaGood: true },
      { path: '/feedback-summary',     label: 'Feedbacks',       count: '449', unit: 'received today',     icon: 'fa fa-comments-o',      color: '#14b8a6',            trend: [380, 410, 400, 430, 445, 440, 449], delta: 2, deltaGood: true },
      { path: '/survey-dashboard',     label: 'Surveys',         count: '12',  unit: 'new submissions',    icon: 'fa fa-list-alt',        color: '#64748b',            trend: [15, 14, 16, 13, 12, 13, 12],      delta: -8,  deltaGood: false },
    ];
    return items.filter((it) => {
      const screen = allScreens.find((s) => s.path === it.path);
      return screen && screen.protected && canAccess(role, it.path);
    });
  }, [role]);

  // ── Toasts ──────────────────────────────────────────────────────────
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);
  const showToast = useCallback((type, title, message) => {
    const id = toastIdRef.current + 1;
    toastIdRef.current = id;
    setToasts((cur) => [...cur, { id, type, title, message }]);
    window.setTimeout(() => setToasts((cur) => cur.filter((t) => t.id !== id)), 4500);
  }, []);

  // ── Profile kebab menu ─────────────────────────────────────────────
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef(null);
  useEffect(() => {
    if (!profileMenuOpen) return undefined;
    function onDocClick(e) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target)) {
        setProfileMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [profileMenuOpen]);

  // ── Topbar profile popdown ─────────────────────────────────────────
  const [profilePopdownOpen, setProfilePopdownOpen] = useState(false);
  const profilePopdownRef = useRef(null);
  useEffect(() => {
    if (!profilePopdownOpen) return undefined;
    function onDocClick(e) {
      if (profilePopdownRef.current && !profilePopdownRef.current.contains(e.target)) {
        setProfilePopdownOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [profilePopdownOpen]);

  // ── Edit Profile modal ─────────────────────────────────────────────
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  function openEdit() {
    setEditName(user?.name || '');
    setEditEmail(user?.email || '');
    setEditPhone(user?.phone || '');
    setEditOpen(true);
  }

  async function saveProfile() {
    if (!editName.trim()) {
      showToast('error', 'Validation', 'Name is required.');
      return;
    }
    setEditSaving(true);
    try {
      const res = await updateUser({
        name: editName.trim(),
        email: editEmail.trim(),
        phone: editPhone.trim(),
      });
      if (res?.ok === false) throw res.error || new Error('Update failed');
      showToast('success', 'Profile Updated', 'Your details have been saved.');
      setEditOpen(false);
    } catch (error) {
      showToast('error', 'Save failed', apiErrorMessage(error, 'Could not save profile.'));
    } finally {
      setEditSaving(false);
    }
  }

  // ── Change Password modal ──────────────────────────────────────────
  const [pwOpen, setPwOpen] = useState(false);
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  function openChangePassword() {
    setPwCurrent(''); setPwNew(''); setPwConfirm('');
    setPwOpen(true);
  }

  async function submitChangePassword() {
    if (!pwCurrent || !pwNew || !pwConfirm) {
      showToast('error', 'Validation', 'All password fields are required.');
      return;
    }
    if (pwNew.length < 8) {
      showToast('error', 'Validation', 'New password must be at least 8 characters.');
      return;
    }
    if (pwNew !== pwConfirm) {
      showToast('error', 'Validation', 'New password and confirmation do not match.');
      return;
    }
    setPwSaving(true);
    try {
      await changePassword({
        currentPassword: pwCurrent,
        newPassword: pwNew,
      });
      // A password change signs every session out, this one included.
      showToast('success', 'Password Changed', 'Please sign in again with your new password.');
      setPwOpen(false);
      setTimeout(handleUnauthorized, 1500);
    } catch (error) {
      showToast('error', 'Change failed', apiErrorMessage(error, 'Could not change password.'));
    } finally {
      setPwSaving(false);
    }
  }

  return (
    <section className="landing-page">
      <ToastRegion toasts={toasts} onDismiss={(id) => setToasts((cur) => cur.filter((t) => t.id !== id))} />

      {/* ── Greeting bar ── */}
      <div className="landing-topbar">
        <div className="landing-topbar-left">
          {/* Profile avatar button */}
          <div className="landing-topbar-avatar-wrap" ref={profilePopdownRef}>
            <button
              type="button"
              className="landing-topbar-avatar"
              title="View profile"
              onClick={() => setProfilePopdownOpen((o) => !o)}
            >
              {user?.initials || 'U'}
            </button>

            {profilePopdownOpen && (
              <div className="landing-topbar-popdown">
                <div className="landing-popdown-avatar">{user?.initials || 'U'}</div>
                <div className="landing-profile-identity" style={{ textAlign: 'center' }}>
                  <div className="landing-profile-name">{displayName}</div>
                  {displayRole && <div className="landing-profile-role">{displayRole}</div>}
                </div>
                <div className="landing-profile-rows">
                  <ProfileRow icon="ti-email" label="Email" value={user?.email} />
                  <ProfileRow icon="ti-mobile" label="Phone" value={user?.phone} />
                </div>
                <div className="landing-popdown-actions">
                  <button type="button" className="landing-popdown-btn" onClick={() => { setProfilePopdownOpen(false); openEdit(); }}>
                    <i className="ti ti-pencil" /> Edit Profile
                  </button>
                  <button type="button" className="landing-popdown-btn" onClick={() => { setProfilePopdownOpen(false); openChangePassword(); }}>
                    <i className="ti ti-lock" /> Change Password
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="landing-greeting-block">
            <h2 className="landing-greeting">{getGreeting(now)}, <span className="landing-greeting-name">{displayName}!</span></h2>
            <div className="landing-greeting-sub">
              <span>Here's what's happening across your workspace today.</span>
              {displayRole && (
                <span className="landing-role-chip"><i className="fa fa-shield" /> {displayRole}</span>
              )}
            </div>
          </div>
        </div>
        <div className="landing-datetime">
          <span className="landing-time">
            {((now.getHours() % 12) || 12)}<span className="landing-time-colon">:</span>{String(now.getMinutes()).padStart(2, '0')} {now.getHours() < 12 ? 'am' : 'pm'}
          </span>
          <span className="landing-date">
            {now.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        </div>
      </div>

      <div className="landing-grid">

        <div className="landing-main">
          {pinnedScreens.length > 0 && (
            <>
              <div className="landing-section-head">
                <h3>
                  <i className="ti ti-thumb-tack" /> Your Pinned Pages
                </h3>
                <span className="landing-section-hint">{pinnedScreens.length} shortcut{pinnedScreens.length === 1 ? '' : 's'}</span>
              </div>
              <div className="landing-tiles">
                {pinnedScreens.map((s) => (
                  <TileCard
                    key={s.path}
                    screen={s}
                    onOpen={() => navigate(s.path)}
                    onUnpin={() => togglePin?.(s.path)}
                  />
                ))}
              </div>
            </>
          )}

          {summaryTiles.length > 0 && (
            <div className="landing-summary">
              <div className="landing-section-head">
                <h3>
                  Quick Insights for You
                </h3>
                <span className="landing-section-hint">Tap a card to open the page</span>
              </div>
              <div className="landing-summary-tiles">
                {summaryTiles.map((it) => (
                  <button
                    key={it.path}
                    type="button"
                    className="landing-summary-tile"
                    style={{ '--tile-accent': it.color }}
                    onClick={() => navigate(it.path)}
                  >
                    {it.alert >= 1 && <span className="landing-summary-alert-dot" title="Needs attention" />}
                    <div className="landing-summary-head">
                      <div className="landing-summary-icon" style={{ background: `${it.color}1f` }}>
                        <i className={it.icon} style={{ color: it.color }} />
                      </div>
                      <div className="landing-summary-body">
                        <div className="landing-summary-label">{it.label}</div>
                        <div className="landing-summary-count">
                          {it.count}
                          {it.total ? <span className="landing-summary-total"> / {it.total}</span> : null}
                        </div>
                        <div className="landing-summary-unit">{it.unit}</div>
                      </div>
                    </div>
                    <Sparkline values={it.trend} color={it.color} />
                    <DeltaLine delta={it.delta} good={it.deltaGood} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Edit Profile Modal ── */}
      {editOpen && (
        <div className="crispr-modal-backdrop active" onClick={() => !editSaving && setEditOpen(false)}>
          <div className="crispr-modal-dialog" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="crispr-modal-header" style={{ background: 'linear-gradient(135deg, #006073 0%, #005a6b 100%)' }}>
              <h3><i className="ti ti-pencil" /> Edit Profile</h3>
              <button className="crispr-modal-close" onClick={() => !editSaving && setEditOpen(false)}>
                <i className="ti ti-close" />
              </button>
            </div>
            <div className="crispr-modal-body">
              <div className="batch-form-grid">
                <label className="full-span">
                  <span>Name *</span>
                  <input type="text" className="search-input" value={editName} onChange={(e) => setEditName(e.target.value)} />
                </label>
                <label className="full-span">
                  <span>Email</span>
                  <input type="email" className="search-input" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
                </label>
                <label className="full-span">
                  <span>Phone</span>
                  <input type="text" className="search-input" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
                </label>
              </div>
            </div>
            <div className="crispr-modal-footer">
              <button type="button" className="btn btn-default" disabled={editSaving} onClick={() => setEditOpen(false)}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={editSaving} onClick={saveProfile}>
                {editSaving ? (<><i className="ti ti-reload" /> Saving...</>) : (<><i className="ti ti-check" /> Save Changes</>)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Change Password Modal ── */}
      {pwOpen && (
        <div className="crispr-modal-backdrop active" onClick={() => !pwSaving && setPwOpen(false)}>
          <div className="crispr-modal-dialog" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="crispr-modal-header" style={{ background: 'linear-gradient(135deg, #006073 0%, #005a6b 100%)' }}>
              <h3><i className="ti ti-lock" /> Change Password</h3>
              <button className="crispr-modal-close" onClick={() => !pwSaving && setPwOpen(false)}>
                <i className="ti ti-close" />
              </button>
            </div>
            <div className="crispr-modal-body">
              <div className="batch-form-grid">
                <label className="full-span">
                  <span>Current Password *</span>
                  <input type="password" className="search-input" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} autoComplete="current-password" />
                </label>
                <label className="full-span">
                  <span>New Password *</span>
                  <input type="password" className="search-input" value={pwNew} onChange={(e) => setPwNew(e.target.value)} autoComplete="new-password" />
                </label>
                <label className="full-span">
                  <span>Confirm New Password *</span>
                  <input type="password" className="search-input" value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)} autoComplete="new-password" />
                </label>
              </div>
            </div>
            <div className="crispr-modal-footer">
              <button type="button" className="btn btn-default" disabled={pwSaving} onClick={() => setPwOpen(false)}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={pwSaving} onClick={submitChangePassword}>
                {pwSaving ? (<><i className="ti ti-reload" /> Updating...</>) : (<><i className="ti ti-check" /> Update Password</>)}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// Tiny 7-point trend line. Single series, so no legend — the tile label names it.
function Sparkline({ values, color }) {
  const pts = Array.isArray(values) ? values.filter((v) => Number.isFinite(v)) : [];
  if (pts.length < 2) return null;
  const W = 100;
  const H = 28;
  const PAD = 2;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const coords = pts.map((v, i) => [
    PAD + (i / (pts.length - 1)) * (W - PAD * 2),
    PAD + (1 - (v - min) / span) * (H - PAD * 2),
  ]);
  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${coords[coords.length - 1][0].toFixed(1)},${H} L${coords[0][0].toFixed(1)},${H} Z`;
  const gradId = `spark-${String(color).replace('#', '')}`;
  return (
    <svg className="landing-sparkline" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function DeltaLine({ delta, good }) {
  if (!Number.isFinite(delta)) return null;
  const dir = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  const tone = dir === 'flat' ? 'neutral' : good ? 'good' : 'bad';
  const icon = dir === 'up' ? 'fa-arrow-up' : dir === 'down' ? 'fa-arrow-down' : 'fa-minus';
  return (
    <div className="landing-summary-foot">
      <div className={`landing-summary-delta is-${tone}`}>
        <span className="landing-summary-delta-pill">
          <i className={`fa ${icon}`} aria-hidden="true" />
          {dir === 'flat' ? 'No change' : `${Math.abs(delta)}%`}
        </span>
        <span>vs yesterday</span>
      </div>
      <span className="landing-summary-range">Last 7 days</span>
    </div>
  );
}

function ProfileRow({ icon, label, value }) {
  return (
    <div className="landing-profile-row" title={label}>
      <i className={`ti ${icon}`} />
      <span style={{ color: value ? '#1f2933' : '#9aa5b1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value || '—'}
      </span>
    </div>
  );
}

function TileCard({ screen, onOpen, onUnpin, onPin }) {
  const rawIcon = screen.icon || 'fa-square-o';
  // Icons may be stored with a font prefix ("fa fa-x" / "ti ti-x") or without ("fa-x").
  const iconClass = rawIcon.includes(' ')
    ? rawIcon
    : `${rawIcon.startsWith('ti-') ? 'ti' : 'fa'} ${rawIcon}`;
  return (
    <div
      className="landing-tile"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}
    >
      <div className="landing-tile-top">
        <div className="landing-tile-icon">
          <i className={iconClass} />
        </div>
        <div className="landing-tile-title">{screen.title}</div>
      </div>
      {screen.summary ? (
        <p className="landing-tile-summary">
          {screen.summary.length > 90 ? `${screen.summary.slice(0, 90)}…` : screen.summary}
        </p>
      ) : null}

      {(onUnpin || onPin) && (
        <button
          type="button"
          title={onUnpin ? 'Unpin' : 'Pin'}
          className={`landing-tile-pin ${onUnpin ? 'is-pinned' : 'is-unpinned'}`}
          onClick={(e) => { e.stopPropagation(); (onUnpin || onPin)(); }}
        >
          <i className="fa fa-thumb-tack" />
        </button>
      )}
    </div>
  );
}
