import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ToastRegion from '../components/ToastRegion';
import {
  CONTENT_TYPES, CONTENT_TYPE_MAP, ORIENTATIONS, RESOLUTIONS, TIMEZONES,
  TRANSITIONS, SEVERITIES, WEEKDAYS, SCOPE_STYLES,
  useAlerts, useBranches, useSchedules, useScreens, useTimelines, useDashboard, useBrandingKits,
  createAlert, createSchedule, createScreen, createTimeline, createBrandingKit,
  updateAlert, updateScreen, updateTimeline, updateSchedule, updateBrandingKit,
  deleteAlert, deleteSchedule, deleteScreen, deleteTimeline, deleteBrandingKit,
  duplicateTimeline, broadcastAlert, dismissAlert, assignTimelineToScreens,
  ensureLoopDetail, commitLoopDraft, getScreenDetail, regenerateScreenPairingCode,
  fmtBytes, fmtRelTime, fmtDuration,
} from '../lib/digitalSignageStore';
import { listLocations } from '../lib/locationsApi';
import { SIGNAGE_FOLDER, listBunnyMedia, uploadBunnyMedia, deleteBunnyMedia, buildBunnyFileName, validateUpload, bunnyErrorMessage } from '../lib/bunnyMediaApi';
import { BrandingScreen } from '../features/branding';
import Icon from '../components/Icon';

// Content types currently shippable in the loop editor. Everything else
// renders disabled with a "Coming soon" badge.
const ENABLED_CONTENT_TYPES = new Set(['BRANDING', 'SIMPLE_TEXT', 'VIDEO', 'POSTER']);

// ─── Animated Branding catalog ────────────────────────────────────────
// Six brand colour themes and six named animation presets. The player
// receives the resolved theme + preset id in the loop item payload so it
// can render without re-deriving anything.
const BRANDING_THEMES = [
  { id: 'aurora',   name: 'Aurora',   from: '#7c3aed', to: '#ec4899', accent: '#fde68a' },
  { id: 'midnight', name: 'Midnight', from: '#0f172a', to: '#1e40af', accent: '#60a5fa' },
  { id: 'sunset',   name: 'Sunset',   from: '#f97316', to: '#dc2626', accent: '#fde047' },
  { id: 'forest',   name: 'Forest',   from: '#059669', to: '#0d9488', accent: '#a7f3d0' },
  { id: 'ocean',    name: 'Ocean',    from: '#0ea5e9', to: '#6366f1', accent: '#e0f2fe' },
  { id: 'mono',     name: 'Mono',     from: '#1f2937', to: '#6b7280', accent: '#f8fafc' },
];

const BRANDING_ANIMATIONS = [
  { id: 'kinetic_type',   name: 'Kinetic Type',   icon: 'ti-text',          background: 'gradient',  desc: 'Tag lines fly in word by word.' },
  { id: 'particle_drift', name: 'Particle Drift', icon: 'ti-sparkles',      background: 'particles', desc: 'Logo centred over drifting particles.' },
  { id: 'word_cloud',     name: 'Word Cloud',     icon: 'ti-cloud',         background: 'gradient',  desc: 'Keywords arrange into a living cloud.' },
  { id: 'logo_reveal',    name: 'Logo Reveal',    icon: 'ti-stamp',         background: 'gradient',  desc: 'Bold logo entrance with light sweep.' },
  { id: 'wave_pulse',     name: 'Wave Pulse',     icon: 'ti-wave-sine',     background: 'gradient',  desc: 'Wave bands pulse with each tag line.' },
  { id: 'marquee_band',   name: 'Marquee Band',   icon: 'ti-arrows-right-left', background: 'gradient', desc: 'Scrolling tag lines + keyword chips.' },
];

// ─── Unsaved loop draft persistence ──────────────────────────────────
// While a loop is being edited, the staged (unsaved) item list is mirrored to
// localStorage so a page refresh doesn't lose work. Cleared on save/discard.
function loopDraftKey(id) { return `signage_loop_draft:${id}`; }
function readLoopDraft(id) {
  try { const raw = localStorage.getItem(loopDraftKey(id)); const v = raw ? JSON.parse(raw) : null; return Array.isArray(v) ? v : null; }
  catch { return null; }
}
function writeLoopDraft(id, items) { try { localStorage.setItem(loopDraftKey(id), JSON.stringify(items)); } catch { /* quota/private mode */ } }
function clearLoopDraft(id) { try { localStorage.removeItem(loopDraftKey(id)); } catch { /* ignore */ } }

// ─── Tabs ─────────────────────────────────────────────────────────────
const TABS = [
  { id: 'overview',  label: 'Overview',  icon: 'ti-layout-grid2' },
  { id: 'schedules', label: 'Schedules', icon: 'ti-calendar' },
  { id: 'timelines', label: 'Loops',     icon: 'ti-layers' },
  { id: 'screens',   label: 'Screens',   icon: 'ti-desktop' },
  { id: 'branding',  label: 'Branding Kit', icon: 'ti-stamp' },
  { id: 'alerts',    label: 'Alert',     icon: 'ti-alert' },
  { id: 'media',     label: 'Media',     icon: 'ti-image' },
];

const VALID_TABS = TABS.map((t) => t.id);

export default function DigitalSignagePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  // The URL ?tab= param is the source of truth so a refresh restores the tab.
  const tabParam = searchParams.get('tab');
  const tab = VALID_TABS.includes(tabParam) ? tabParam : 'overview';

  const [toasts, setToasts] = useState([]);

  // The selected branch lives in the URL (?branch=<id>) so a refresh keeps it.
  const branches = useBranches();
  const branchFilter = searchParams.get('branch') || '';
  const branchFilterLabel = branches.find((b) => String(b.id) === String(branchFilter))?.name || '';

  function setBranchFilter(id) {
    setSearchParams((prev) => {
      const sp = new URLSearchParams(prev);
      if (id) sp.set('branch', String(id));
      else sp.delete('branch');
      return sp;
    });
  }

  // If the URL carries a branch id that doesn't exist (once branches load),
  // drop it and fall back to "All branches".
  useEffect(() => {
    if (!branchFilter || branches.length === 0) return;
    const exists = branches.some((b) => String(b.id) === String(branchFilter));
    if (!exists) {
      setSearchParams((prev) => {
        const sp = new URLSearchParams(prev);
        sp.delete('branch');
        return sp;
      }, { replace: true });
    }
  }, [branchFilter, branches]); // eslint-disable-line react-hooks/exhaustive-deps

  // The loop being edited lives in the URL (?loop=<id>) so a refresh restores
  // the editor. Only meaningful on the timelines tab.
  const editingTimelineId = tab === 'timelines' ? (searchParams.get('loop') || null) : null;

  function setEditingTimelineId(id) {
    setSearchParams((prev) => {
      const sp = new URLSearchParams(prev);
      sp.set('tab', 'timelines');
      if (id) sp.set('loop', id);
      else sp.delete('loop');
      return sp;
    });
  }

  function setTab(next) {
    setSearchParams((prev) => {
      const sp = new URLSearchParams(prev);
      sp.set('tab', next);
      // Leaving the timelines tab closes any open loop editor.
      if (next !== 'timelines') sp.delete('loop');
      return sp;
    });
  }

  // Normalise the URL when no (or an invalid) tab is present.
  useEffect(() => {
    if (!VALID_TABS.includes(tabParam)) {
      setSearchParams((prev) => {
        const sp = new URLSearchParams(prev);
        sp.set('tab', 'overview');
        return sp;
      }, { replace: true });
    }
  }, [tabParam]); // eslint-disable-line react-hooks/exhaustive-deps

  function showToast(type, title, message = '') {
    const id = Date.now() + Math.random();
    setToasts((cur) => [...cur, { id, type, title, message }]);
    setTimeout(() => setToasts((cur) => cur.filter((t) => t.id !== id)), 3500);
  }
  function removeToast(id) { setToasts((cur) => cur.filter((t) => t.id !== id)); }

  function openTimelineEditor(id) {
    setEditingTimelineId(id);
    setTab('timelines');
  }

  return (
    <section className="data-table-page" style={{ position: 'relative', minHeight: '100vh', paddingBottom: 40 }}>
      <ToastRegion toasts={toasts} onDismiss={removeToast} />
      <PageHeader />

      <div style={{ display: 'flex', gap: 16, marginTop: 16, alignItems: 'flex-start' }}>
        <TabBar tab={tab} setTab={setTab} />

        <div style={{ flex: 1, minWidth: 0 }}>
          {tab === 'overview'  && <OverviewTab branchFilter={branchFilter} setBranchFilter={setBranchFilter} onJump={setTab} />}
          {tab === 'screens'   && <ScreensTab branchFilter={branchFilter} setBranchFilter={setBranchFilter} branchFilterLabel={branchFilterLabel} showToast={showToast} />}
          {tab === 'timelines' && <TimelinesTab branchFilter={branchFilter} setBranchFilter={setBranchFilter} branchFilterLabel={branchFilterLabel} editingId={editingTimelineId} setEditingId={setEditingTimelineId} showToast={showToast} />}
          {tab === 'media'     && <MediaTab branchFilter={branchFilter} setBranchFilter={setBranchFilter} branchFilterLabel={branchFilterLabel} showToast={showToast} />}
          {tab === 'branding'  && <BrandingKitsTab branchFilter={branchFilter} setBranchFilter={setBranchFilter} branchFilterLabel={branchFilterLabel} showToast={showToast} />}
          {tab === 'schedules' && <SchedulesTab branchFilter={branchFilter} setBranchFilter={setBranchFilter} branchFilterLabel={branchFilterLabel} showToast={showToast} />}
          {tab === 'alerts'    && <AlertsTab branchFilter={branchFilter} setBranchFilter={setBranchFilter} branchFilterLabel={branchFilterLabel} showToast={showToast} />}
        </div>
      </div>
    </section>
  );
}

// ───────────────────────── Header + Tabs ──────────────────────────────
function PageHeader() {
  return (
    <div className="page-header-section" style={{ flexWrap: 'wrap' }}>
      <div className="page-header-title-group">
        <span className="page-header-icon-box"><Icon className="fa fa-tv" /></span>
        <div>
          <h2>Digital Signage</h2>
          <p>Manage TV kiosks, build loops, broadcast alerts across all branches.</p>
        </div>
      </div>
    </div>
  );
}

function TabBar({ tab, setTab }) {
  return (
    <div
      style={{
        background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 6,
        display: 'flex', flexDirection: 'column', gap: 4,
        width: 196, flexShrink: 0, position: 'sticky', top: 16,
      }}
    >
      {TABS.map((t) => {
        const sel = t.id === tab;
        return (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            style={{
              border: 'none', background: sel ? 'var(--brand)' : 'transparent', color: sel ? '#fff' : 'var(--ink)',
              padding: '10px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13,
              display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
            }}>
            <Icon className={`ti ${t.icon}`} style={{ fontSize: 16, width: 18, textAlign: 'center', flexShrink: 0 }} /> {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ───────────────────────── Overview ───────────────────────────────────
function OverviewTab({ branchFilter, setBranchFilter, onJump }) {
  const screens   = useScreens();
  const timelines = useTimelines();
  const alerts    = useAlerts();
  const branches  = useBranches();
  const schedules = useSchedules();
  const dash      = useDashboard();

  // Loose comparison so int <-> string location ids both match.
  const sameId = (a, b) => a != null && b != null && String(a) === String(b);

  const filteredScreens = useMemo(
    () => branchFilter ? screens.filter((s) => sameId(s.branch_id, branchFilter)) : screens,
    [screens, branchFilter]
  );

  const activeAlerts = alerts.filter((a) => a.is_active);
  const onlineCount  = filteredScreens.filter((s) => s.device_status === 'online').length;
  const activeScheds = schedules.filter((s) => s.is_active).length;

  // Prefer the server-authoritative dashboard.now_playing when available;
  // fall back to the locally-cached screens otherwise.
  const nowPlaying = useMemo(() => {
    if (dash?.now_playing?.length) {
      return dash.now_playing
        .filter((np) => !branchFilter || sameId(np.screen?.location_id, branchFilter))
        .map((np) => ({
          screen_id:    np.screen?.id,
          name:         np.screen?.name,
          screen_code:  np.screen?.screen_code,
          loop_id:      np.loop?.id || null,
          loop_name:    np.loop?.name || null,
          current_item: np.current_item?.title || null,
        }));
    }
    return filteredScreens
      .filter((s) => s.playback_status === 'playing')
      .map((s) => {
        const tl = timelines.find((t) => t.id === s.assigned_timeline_id);
        return { screen_id: s.id, name: s.name, screen_code: s.screen_code, loop_id: tl?.id || null, loop_name: tl?.name || null, current_item: null };
      });
  }, [dash, branchFilter, filteredScreens, timelines]);

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* Active alert banner */}
      {activeAlerts.length > 0 && (
        <div style={{ background: 'linear-gradient(90deg,#fee2e2,#fecaca)', border: '1px solid #fca5a5', borderRadius: 12, padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 8, background: '#dc2626', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
            <Icon className="ti ti-alert" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: '#7f1d1d', fontSize: 14 }}>{activeAlerts.length} active alert broadcast{activeAlerts.length === 1 ? '' : 's'}</div>
            <div style={{ fontSize: 12, color: '#991b1b', marginTop: 2 }}>{activeAlerts.map((a) => a.title).join(' · ')}</div>
          </div>
          <button type="button" style={btnGhost} onClick={() => onJump('alerts')}>
            <Icon className="ti ti-arrow-right" /> Manage
          </button>
        </div>
      )}

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <StatTile icon="ti-desktop"        label="Screens"     value={filteredScreens.length} accent="#0ea5e9" onClick={() => onJump('screens')} />
        <StatTile icon="ti-signal"         label="Online"      value={onlineCount} accent="#10b981" onClick={() => onJump('screens')} />
        <StatTile icon="ti-control-play"   label="Now playing" value={nowPlaying.length} accent="#8b5cf6" onClick={() => onJump('screens')} />
        <StatTile icon="ti-calendar"       label="Schedules"   value={activeScheds} accent="#ec4899" onClick={() => onJump('schedules')} />
      </div>

      {/* Branches (left) + Now playing (right) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 300px) 1fr', gap: 20, alignItems: 'start' }}>
          {/* Left: branches */}
          <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 14, background: '#fbfcfd' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Icon className="ti ti-building" style={{ color: 'var(--brand)' }} />
              <strong style={{ fontSize: 13, color: 'var(--ink)' }}>Branches</strong>
              {branchFilter && (
                <button type="button" onClick={() => setBranchFilter('')}
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11, color: 'var(--brand)', textDecoration: 'underline', fontWeight: 600 }}>
                  Clear
                </button>
              )}
            </div>
            <div style={{ display: 'grid', gap: 2 }}>
              {branches.map((b) => {
                const ss = screens.filter((s) => sameId(s.branch_id, b.id));
                const on = ss.filter((s) => s.device_status === 'online').length;
                const allOnline = ss.length > 0 && on === ss.length;
                const dot = ss.length === 0 ? '#94a3b8' : allOnline ? '#10b981' : on > 0 ? '#f59e0b' : '#dc2626';
                const selected = sameId(b.id, branchFilter);
                // Clicking a branch filters Now playing to it (?branch=<id>);
                // clicking the selected branch again clears the filter.
                return (
                  <button key={b.id} type="button"
                    onClick={() => setBranchFilter(selected ? '' : b.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, padding: '7px 8px', borderRadius: 8,
                      border: '1px solid transparent', background: selected ? 'var(--brand)15' : 'transparent',
                      borderColor: selected ? 'var(--brand)' : 'transparent', cursor: 'pointer', textAlign: 'left', width: '100%',
                    }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: dot, flex: '0 0 auto', boxShadow: `0 0 0 3px ${dot}22` }} />
                    <strong style={{ color: selected ? 'var(--brand)' : 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</strong>
                    <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 12, flex: '0 0 auto' }}>{on}/{ss.length}</span>
                  </button>
                );
              })}
              {branches.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 4px' }}>No branches yet.</div>
              )}
            </div>
          </div>

          {/* Right: now playing */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Icon className="ti ti-control-play" style={{ color: 'var(--brand)' }} />
              <strong style={{ fontSize: 13, color: 'var(--ink)' }}>Now playing</strong>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
              {nowPlaying.slice(0, 9).map((np) => (
                <NowPlayingTile key={np.screen_id} np={np} timelines={timelines} />
              ))}
              {nowPlaying.length === 0 && (
                <div style={{ gridColumn: '1 / -1', border: '1px dashed var(--line)', borderRadius: 10, padding: 28, textAlign: 'center', color: 'var(--muted)', background: '#fbfcfd' }}>
                  <Icon className="ti ti-device-desktop" style={{ fontSize: 26, display: 'block', marginBottom: 8, color: 'var(--muted)' }} />
                  <div style={{ fontWeight: 600, color: 'var(--ink)' }}>No screens currently playing</div>
                  {filteredScreens.length > 0 && (
                    <div style={{ fontSize: 12, marginTop: 6, lineHeight: 1.6, maxWidth: 460, marginLeft: 'auto', marginRight: 'auto' }}>
                      You have {filteredScreens.length} screen{filteredScreens.length === 1 ? '' : 's'}, but none are reporting active playback yet. Open a screen's player URL and pair it to start streaming.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
  );
}

// Full-resolution virtual stage for the mini loop preview. PreviewSurface's
// type sizes are tuned for a screen this size; we render at this resolution and
// CSS-scale the whole thing down to the tile header's actual width.
const STAGE_W = 1280;
const STAGE_H = 720;

// A single "Now playing" card. Idle, it shows a play glyph on a faux screen.
// On hover it lifts (subtle animation), lazy-loads the assigned loop's items,
// and plays a live, scaled-down preview of the loop inside the mini screen.
// Clicking (or Enter/Space) opens the screen's player in a new tab.
function NowPlayingTile({ np, timelines }) {
  const [hovered, setHovered] = useState(false);
  const [preview, setPreview] = useState({ idx: 0, elapsed: 0 });
  const [scale, setScale] = useState(0.16);
  const headerRef = useRef(null);
  const loadedRef = useRef(false);

  const loop  = np.loop_id ? timelines.find((t) => String(t.id) === String(np.loop_id)) : null;
  const items = Array.isArray(loop?.items) ? loop.items : [];
  const showPreview = hovered && items.length > 0;

  // Render the loop on a full-resolution 16:9 stage (1280×720, which is what
  // PreviewSurface's type sizes are tuned for) and scale it down to the
  // header's real width so the miniature looks like a real screen.
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return undefined;
    const measure = () => setScale(el.clientWidth / STAGE_W);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Lazy-load the loop's items the first time the card is hovered.
  useEffect(() => {
    if (hovered && np.loop_id && !loadedRef.current) {
      loadedRef.current = true;
      ensureLoopDetail(np.loop_id).catch(() => {});
    }
  }, [hovered, np.loop_id]);

  // Run a lightweight playback ticker only while hovered; reset on leave.
  useEffect(() => {
    if (!hovered) { setPreview({ idx: 0, elapsed: 0 }); return undefined; }
    if (items.length === 0) return undefined;
    const interval = setInterval(() => {
      setPreview((p) => {
        const cur = items[p.idx];
        if (!cur) return { idx: 0, elapsed: 0 };
        if (p.elapsed + 1 >= (cur.duration_seconds || 1)) return { idx: (p.idx + 1) % items.length, elapsed: 0 };
        return { ...p, elapsed: p.elapsed + 1 };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [hovered, items]);

  function openPlayer() { window.open(`/player/${np.screen_code}`, '_blank', 'noopener,noreferrer'); }

  return (
    <div title={`Open player · ${np.screen_code}`} role="button" tabIndex={0}
      onClick={openPlayer}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPlayer(); } }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: 12, overflow: 'hidden', background: '#fff',
        border: `1px solid ${hovered ? 'var(--brand)' : 'var(--line)'}`,
        boxShadow: hovered ? '0 10px 22px rgba(15,23,42,.13)' : '0 1px 3px rgba(15,23,42,.06)',
        transform: hovered ? 'translateY(-3px)' : 'none', cursor: 'pointer',
        transition: 'transform .18s ease, box-shadow .18s ease, border-color .18s ease',
      }}>
      {/* Screen preview header (mimics a powered-on display) */}
      <div ref={headerRef} style={{ position: 'relative', aspectRatio: '16 / 9', background: 'linear-gradient(135deg,#0f172a 0%,#1e293b 60%,#334155 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {showPreview ? (
          <div style={{ position: 'absolute', top: 0, left: 0, width: STAGE_W, height: STAGE_H, transformOrigin: 'top left', transform: `scale(${scale})` }}>
            <PreviewSurface items={items} preview={{ ...preview, playing: true }} />
          </div>
        ) : (
          <Icon className="ti ti-control-play" style={{ fontSize: 24, color: 'rgba(255,255,255,.85)' }} />
        )}
        {/* LIVE badge */}
        <span style={{ position: 'absolute', top: 8, left: 8, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 7px', borderRadius: 999, background: 'rgba(16,185,129,.18)', border: '1px solid rgba(16,185,129,.45)', fontSize: 9, fontWeight: 800, letterSpacing: '.08em', color: '#6ee7b7' }}>
          <span style={{ width: 5, height: 5, borderRadius: 999, background: '#10b981', animation: 'pulse 1.5s infinite' }} />
          LIVE
        </span>
        {/* screen code chip */}
        <span style={{ position: 'absolute', top: 8, right: 8, fontSize: 9, fontFamily: 'monospace', color: 'rgba(255,255,255,.65)', background: 'rgba(255,255,255,.08)', padding: '2px 6px', borderRadius: 5 }}>{np.screen_code}</span>
      </div>
      {/* Info body */}
      <div style={{ padding: 10, display: 'grid', gap: 7 }}>
        <strong style={{ fontSize: 13, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{np.name}</strong>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <Icon className="ti ti-layers" style={{ color: 'var(--brand)', flex: '0 0 auto' }} />
          {np.loop_name || <em style={{ color: 'var(--muted)' }}>No loop</em>}
        </span>
        {np.current_item && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingTop: 6, borderTop: '1px solid var(--line)' }}>
            <Icon className="ti ti-music" style={{ flex: '0 0 auto' }} /> {np.current_item}
          </span>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── Screens ────────────────────────────────────
function ScreensTab({ branchFilter, setBranchFilter, branchFilterLabel, showToast }) {
  const screens   = useScreens();
  const branches  = useBranches();
  const timelines = useTimelines();
  const [statusFilter, setStatusFilter] = useState('');
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [bulkAssign, setBulkAssign] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [viewCode, setViewCode] = useState(null);

  const filtered = useMemo(() => {
    return screens
      .filter((s) => !branchFilter || String(s.branch_id) === String(branchFilter))
      .filter((s) => !statusFilter || s.device_status === statusFilter);
  }, [screens, branchFilter, statusFilter]);

  function toggleSel(id) { setSelected((cur) => { const n = new Set(cur); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  function toggleAll() { setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map((s) => s.id))); }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 220 }}>
          <LocationPicker
            value={branchFilter || null}
            initialLabel={branchFilterLabel}
            placeholder="All branches"
            onChange={(picked) => setBranchFilter(picked ? picked.id : '')}
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={selStyle}>
          <option value="">All statuses</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
          <option value="warning">Warning</option>
        </select>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {selected.size > 0 && (
            <button type="button" style={btnGhost} onClick={() => setBulkAssign(true)}>
              <Icon className="ti ti-layers" /> Assign loop ({selected.size})
            </button>
          )}
          <button type="button" style={btnPrimary} onClick={() => setCreating(true)}>
            <Icon className="ti ti-plus" /> Register screen
          </button>
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 36 }}>
                <input type="checkbox" checked={selected.size > 0 && selected.size === filtered.length} onChange={toggleAll} />
              </th>
              <th style={thStyle}>Screen</th>
              <th style={thStyle}>Branch</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Now playing</th>
              <th style={thStyle}>Last seen</th>
              <th style={thStyle}>Resolution</th>
              <th style={{ ...thStyle, textAlign: 'right', width: 200 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => {
              const branch = branches.find((b) => b.id === s.branch_id);
              const tl = timelines.find((t) => t.id === s.assigned_timeline_id);
              return (
                <tr key={s.id} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={tdStyle}>
                    <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleSel(s.id)} />
                  </td>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 700 }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                      <span style={{ fontFamily: 'monospace', background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>{s.screen_code}</span>
                      <span style={{ marginLeft: 8 }}>{s.orientation}</span>
                    </div>
                  </td>
                  <td style={tdStyle}>{branch?.name || <em style={{ color: 'var(--muted)' }}>Unassigned</em>}</td>
                  <td style={tdStyle}><StatusBadge status={s.device_status} /></td>
                  <td style={tdStyle}>
                    {tl ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {s.playback_status === 'playing' && <span style={{ width: 8, height: 8, borderRadius: 999, background: '#10b981' }} />}
                        <span style={{ fontSize: 13 }}>{tl.name}</span>
                      </div>
                    ) : <em style={{ color: 'var(--muted)' }}>No loop</em>}
                  </td>
                  <td style={tdStyle}><span style={{ color: 'var(--muted)', fontSize: 12 }}>{fmtRelTime(s.last_seen_at)}</span></td>
                  <td style={tdStyle}><span style={{ fontSize: 12, color: 'var(--muted)' }}>{s.resolution}</span></td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', justifyContent: 'flex-end' }}>
                      <KebabMenu items={[
                        { label: 'View Pairing Code', icon: 'ti-eye', onClick: () => setViewCode(s) },
                        { label: 'Open Player', icon: 'ti-new-window', onClick: () => window.open(`/player/${s.screen_code}`, '_blank', 'noopener,noreferrer') },
                        { label: 'Edit', icon: 'ti-pencil', onClick: () => setEditing(s) },
                        { label: 'Delete', icon: 'ti-trash', danger: true, onClick: () => setConfirmDelete(s) },
                      ]} />
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>No screens match your filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {(creating || editing) && (
        <ScreenModal
          screen={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSave={async (payload) => {
            try {
              if (editing) {
                await updateScreen(editing.id, payload);
                showToast('success', 'Screen updated', payload.name);
              } else {
                const sc = await createScreen(payload);
                const pairing = sc.pairing_code ? ` · pairing code ${sc.pairing_code}` : '';
                showToast('success', 'Screen registered', `${sc.name} · ${sc.screen_code}${pairing}`);
              }
              setCreating(false); setEditing(null);
            } catch (e) {
              showToast('error', e.code || 'Save failed', e.message);
            }
          }}
        />
      )}
      {confirmDelete && (
        <ConfirmModal title="Remove this screen?" message={<>The kiosk <strong>{confirmDelete.name}</strong> will stop receiving content. Re-registering uses the same screen code.</>}
          confirmLabel="Remove" confirmStyle={btnDanger}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={async () => {
            try { await deleteScreen(confirmDelete.id); showToast('success', 'Screen removed', confirmDelete.name); }
            catch (e) { showToast('error', e.code || 'Delete failed', e.message); }
            setConfirmDelete(null);
          }} />
      )}
      {bulkAssign && (
        <BulkAssignModal
          timelines={timelines}
          onClose={() => setBulkAssign(false)}
          onAssign={async (tlId) => {
            try {
              await assignTimelineToScreens(tlId, Array.from(selected));
              const tl = timelines.find((t) => t.id === tlId);
              showToast('success', 'Loop assigned', `${tl?.name || ''} → ${selected.size} screen(s)`);
              setBulkAssign(false); setSelected(new Set());
            } catch (e) { showToast('error', e.code || 'Assign failed', e.message); }
          }}
        />
      )}
      {viewCode && (
        <PairingCodeModal screen={viewCode} onClose={() => setViewCode(null)} showToast={showToast} />
      )}
    </div>
  );
}

// Shows a screen's pairing code (fetched fresh from the API, since the list
// endpoint omits it). Offers copy + regenerate. Paired screens have no active
// code until regenerated.
function PairingCodeModal({ screen, onClose, showToast }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const full = await getScreenDetail(screen.id);
        if (!cancelled) { setCode(full.pairing_code || null); setExpiresAt(full.pairing_expires_at || null); }
      } catch (e) {
        if (!cancelled) showToast('error', e.code || 'Could not load code', e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [screen.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function regenerate() {
    setBusy(true);
    try {
      const res = await regenerateScreenPairingCode(screen.id);
      setCode(res.pairing_code); setExpiresAt(res.pairing_expires_at);
      showToast('success', 'Pairing code regenerated', screen.name);
    } catch (e) {
      showToast('error', e.code || 'Regenerate failed', e.message);
    } finally { setBusy(false); }
  }

  function copyCode() {
    if (!code) return;
    navigator.clipboard?.writeText(code).then(
      () => showToast('success', 'Copied', 'Pairing code copied to clipboard'),
      () => {},
    );
  }

  return (
    <Modal title="Pairing code" onClose={onClose} maxWidth={420} icon="ti-key">
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
          Screen: <strong style={{ color: 'var(--ink)' }}>{screen.name}</strong>
          <span style={{ fontFamily: 'monospace', background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, marginLeft: 8 }}>{screen.screen_code}</span>
        </div>

        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>
            <Icon className="ti ti-reload" style={{ marginRight: 6 }} /> Loading…
          </div>
        ) : code ? (
          <>
            <div style={{ background: '#0f172a', borderRadius: 12, padding: '22px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>Enter on the kiosk</div>
              <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: '.32em', color: '#fff', fontFamily: 'monospace' }}>{code}</div>
              {expiresAt && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 10 }}>Expires {fmtRelTime(expiresAt)}</div>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
              Open <code style={{ fontFamily: 'monospace' }}>/player/{screen.screen_code}</code> on the kiosk and enter this code to pair.
            </div>
            <ModalFooter style={{ margin: '10px -24px -24px' }}>
              <button type="button" className="btn btn-default" onClick={copyCode}><Icon className="ti ti-clipboard" /> Copy</button>
              <button type="button" className="btn btn-success" disabled={busy} onClick={regenerate}><Icon className="ti ti-reload" /> {busy ? 'Regenerating…' : 'Regenerate'}</button>
            </ModalFooter>
          </>
        ) : (
          <>
            <div style={{ background: '#f8fafc', border: '1px dashed var(--line)', borderRadius: 12, padding: 22, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              <Icon className="ti ti-check" style={{ fontSize: 22, display: 'block', marginBottom: 8, color: '#059669' }} />
              This screen is already paired — no active pairing code.
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
              Regenerating issues a new code and <strong>unpairs</strong> the current player.
            </div>
            <ModalFooter style={{ margin: '10px -24px -24px' }}>
              <button type="button" className="btn btn-success" disabled={busy} onClick={regenerate}><Icon className="ti ti-reload" /> {busy ? 'Regenerating…' : 'Regenerate code'}</button>
            </ModalFooter>
          </>
        )}
      </div>
    </Modal>
  );
}

function StatusBadge({ status }) {
  const map = {
    online:  { bg: '#d1fae5', color: '#065f46', dot: '#10b981', label: 'Online' },
    offline: { bg: '#fee2e2', color: '#7f1d1d', dot: '#dc2626', label: 'Offline' },
    warning: { bg: '#fef3c7', color: '#78350f', dot: '#f59e0b', label: 'Warning' },
  }[status] || { bg: '#e2e8f0', color: '#334155', dot: '#64748b', label: status };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: map.bg, color: map.color, padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: map.dot }} />
      {map.label}
    </span>
  );
}

function ScreenModal({ screen, onClose, onSave }) {
  const branches  = useBranches();
  const timelines = useTimelines();
  const [name, setName] = useState(screen?.name || '');
  const [branchId, setBranchId] = useState(screen?.branch_id || '');
  const initialBranchLabel = branches.find((b) => b.id === screen?.branch_id)?.name || '';
  const [code, setCode] = useState(screen?.screen_code || '');
  const [resolution, setResolution] = useState(screen?.resolution || '1920x1080');
  const [orientation, setOrientation] = useState(screen?.orientation || 'landscape');
  const [timezone, setTimezone] = useState(screen?.timezone || 'Asia/Kolkata');
  const [assigned, setAssigned] = useState(screen?.assigned_timeline_id || '');

  function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      name, branch_id: branchId || null, screen_code: code, resolution, orientation, timezone,
      assigned_timeline_id: assigned || null,
    });
  }

  const captionStyle = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, letterSpacing: '.2px', color: '#64748b' };

  return (
    <div
      className="legacy-modal-backdrop active"
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="legacy-modal-dialog" style={{ maxWidth: 600 }} role="dialog" aria-modal="true">
        <div className="legacy-modal-header">
          <h3><Icon className="ti ti-desktop" /> {screen ? 'Edit screen' : 'Register screen'}</h3>
          <button type="button" className="legacy-modal-close" onClick={onClose}><Icon className="ti ti-close" /></button>
        </div>
        <form className="batch-modal-form form-modal" onSubmit={submit}>
          <div className="legacy-modal-body">
            <div className="asset-form-section">
              <div className="asset-form-section-title"><Icon className="ti ti-desktop" /> Screen Details</div>
              <div className="asset-form-grid">
                <label className="field-cell full-span">
                  <div className="float-field">
                    <input autoFocus className="float-control" placeholder=" " value={name} onChange={(e) => setName(e.target.value)} />
                    <span className="float-label">Display Name <span className="req">*</span></span>
                  </div>
                </label>
                <div className="field-cell">
                  <span style={captionStyle}>Branch</span>
                  <LocationPicker
                    value={branchId || null}
                    initialLabel={initialBranchLabel}
                    placeholder="— Unassigned —"
                    onChange={(picked) => setBranchId(picked ? picked.id : '')}
                  />
                </div>
                <label className="field-cell">
                  <div className="float-field">
                    <input className="float-control" placeholder=" " style={{ fontFamily: 'monospace' }} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
                    <span className="float-label">Screen Code</span>
                  </div>
                  <span className="field-hint">Used for /player/&#123;code&#125; — leave blank to auto-generate.</span>
                </label>
              </div>
            </div>

            <div className="asset-form-section">
              <div className="asset-form-section-title"><Icon className="ti ti-settings" /> Display Settings</div>
              <div className="asset-form-grid config-grid">
                <label className="field-cell">
                  <div className="float-field float-always">
                    <select className="float-control" value={resolution} onChange={(e) => setResolution(e.target.value)}>
                      {RESOLUTIONS.map((r) => <option key={r}>{r}</option>)}
                    </select>
                    <span className="float-label">Resolution</span>
                  </div>
                </label>
                <label className="field-cell">
                  <div className="float-field float-always">
                    <select className="float-control" value={orientation} onChange={(e) => setOrientation(e.target.value)}>
                      {ORIENTATIONS.map((o) => <option key={o}>{o}</option>)}
                    </select>
                    <span className="float-label">Orientation</span>
                  </div>
                </label>
                <label className="field-cell">
                  <div className="float-field float-always">
                    <select className="float-control" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                      {TIMEZONES.map((t) => <option key={t}>{t}</option>)}
                    </select>
                    <span className="float-label">Timezone</span>
                  </div>
                </label>
                <label className="field-cell full-span">
                  <div className="float-field float-always">
                    <select className="float-control" value={assigned} onChange={(e) => setAssigned(e.target.value)}>
                      <option value="">— None —</option>
                      {timelines.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <span className="float-label">Assigned Loop</span>
                  </div>
                </label>
              </div>
            </div>
          </div>
          <div className="legacy-modal-footer">
            <button type="button" className="legacy-btn legacy-btn-default" onClick={onClose}>Cancel</button>
            <button type="submit" className="legacy-btn legacy-btn-success">
              <Icon className={`ti ${screen ? 'ti-check' : 'ti-plus'}`} /> {screen ? 'Save' : 'Register'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function BulkAssignModal({ timelines, onClose, onAssign }) {
  const [id, setId] = useState('');
  return (
    <Modal title="Assign loop" onClose={onClose} maxWidth={460} icon="ti-layers">
      <Field label="Pick a loop">
        <select value={id} onChange={(e) => setId(e.target.value)} style={selStyle}>
          <option value="">— Select —</option>
          {timelines.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </Field>
      <ModalFooter>
        <button type="button" className="btn btn-default" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-success" onClick={() => id && onAssign(id)} disabled={!id} style={!id ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}>Assign</button>
      </ModalFooter>
    </Modal>
  );
}

// ───────────────────────── Timelines ──────────────────────────────────
function TimelinesTab({ branchFilter, setBranchFilter, branchFilterLabel, editingId, setEditingId, showToast }) {
  const timelines = useTimelines();
  const branches  = useBranches();
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [previewLoopId, setPreviewLoopId] = useState(null);

  const filtered = useMemo(() => branchFilter ? timelines.filter((t) => !t.branch_id || String(t.branch_id) === String(branchFilter)) : timelines, [timelines, branchFilter]);
  const previewLoop = previewLoopId ? timelines.find((t) => String(t.id) === String(previewLoopId)) : null;
  const editing = editingId ? timelines.find((t) => String(t.id) === String(editingId)) : null;

  if (editing) {
    return <TimelineEditor key={editing.id} timeline={editing} onBack={() => setEditingId(null)} showToast={showToast} />;
  }

  // Deep-linked (?loop=<id>) but the loops list hasn't resolved it yet —
  // show a placeholder instead of flashing the full list grid.
  if (editingId && timelines.length === 0) {
    return (
      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
        <Icon className="ti ti-reload" style={{ fontSize: 22, display: 'block', marginBottom: 10 }} />
        Loading loop…
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ minWidth: 220 }}>
          <LocationPicker
            value={branchFilter || null}
            initialLabel={branchFilterLabel}
            placeholder="All branches"
            onChange={(picked) => setBranchFilter(picked ? picked.id : '')}
          />
        </div>
        <button type="button" style={{ ...btnPrimary, marginLeft: 'auto' }} onClick={() => setCreating(true)}>
          <Icon className="ti ti-plus" /> New loop
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 12 }}>
        {filtered.map((t) => {
          const branch = branches.find((b) => b.id === t.branch_id);
          const totalSecs = t.items.reduce((a, it) => a + it.duration_seconds, 0);
          return (
            <div key={t.id} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--brand)15', color: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon className="ti ti-layers" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <strong style={{ fontSize: 15, color: 'var(--ink)' }}>{t.name}</strong>
                    {t.is_active ? <Pill color="#059669" bg="#d1fae5">Published</Pill> : <Pill color="#475569" bg="#e2e8f0">Draft</Pill>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                    {branch?.name || 'All branches'} · {t.items.length} item{t.items.length === 1 ? '' : 's'} · {fmtDuration(totalSecs)}
                  </div>
                  {t.description && <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>{t.description}</p>}
                </div>
                <KebabMenu items={[
                  { label: 'Open editor', icon: 'ti-pencil', onClick: () => setEditingId(t.id) },
                  { label: 'Preview', icon: 'ti-control-play', onClick: async () => {
                    try { await ensureLoopDetail(t.id); setPreviewLoopId(t.id); }
                    catch (e) { showToast('error', e.code || 'Preview failed', e.message); }
                  } },
                  { label: 'Duplicate', icon: 'ti-files', onClick: async () => {
                    try { const c = await duplicateTimeline(t.id); showToast('success', 'Loop duplicated', c?.name); }
                    catch (e) { showToast('error', e.code || 'Duplicate failed', e.message); }
                  } },
                  { label: t.is_active ? 'Unpublish' : 'Publish', icon: t.is_active ? 'ti-control-pause' : 'ti-control-play',
                    onClick: () => updateTimeline(t.id, { is_active: !t.is_active }) },
                  { label: 'Delete', icon: 'ti-trash', danger: true, onClick: () => setConfirmDelete(t) },
                ]} />
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ background: '#fff', border: '1px dashed var(--line)', borderRadius: 14, padding: 40, textAlign: 'center', color: 'var(--muted)', gridColumn: '1 / -1' }}>
            <Icon className="ti ti-layers" style={{ fontSize: 24, display: 'block', marginBottom: 8 }} />
            <div style={{ fontWeight: 600, color: 'var(--ink)' }}>No loops yet</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Build your first loop of branding, attendance, and toppers.</div>
            <div style={{ marginTop: 14 }}>
              <button type="button" style={btnPrimary} onClick={() => setCreating(true)}><Icon className="ti ti-plus" /> New loop</button>
            </div>
          </div>
        )}
      </div>

      {creating && (
        <TimelineModal
          onClose={() => setCreating(false)}
          onSave={async (payload) => {
            try {
              const tl = await createTimeline(payload);
              showToast('success', 'Loop created', tl.name);
              setCreating(false);
              setEditingId(tl.id);
            } catch (e) { showToast('error', e.code || 'Create failed', e.message); }
          }}
        />
      )}
      {confirmDelete && (
        <ConfirmModal title="Delete this loop?" message={<>"<strong>{confirmDelete.name}</strong>" and all its items will be removed. Screens using it become unassigned.</>}
          confirmLabel="Delete" confirmStyle={btnDanger}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={async () => {
            try { await deleteTimeline(confirmDelete.id); showToast('success', 'Loop deleted', confirmDelete.name); }
            catch (e) { showToast('error', e.code || 'Delete failed', e.message); }
            setConfirmDelete(null);
          }} />
      )}
      {previewLoop && (
        <PreviewModal
          timeline={previewLoop} items={Array.isArray(previewLoop.items) ? previewLoop.items : []}
          onClose={() => setPreviewLoopId(null)}
        />
      )}
    </div>
  );
}

function TimelineModal({ timeline, onClose, onSave }) {
  const branches = useBranches();
  const [name, setName] = useState(timeline?.name || '');
  const [description, setDescription] = useState(timeline?.description || '');
  const [branchId, setBranchId] = useState(timeline?.branch_id || '');
  const initialBranchLabel = branches.find((b) => b.id === timeline?.branch_id)?.name || '';
  const [active, setActive] = useState(timeline?.is_active ?? false);
  const [loop, setLoop] = useState(timeline?.loop_enabled ?? true);
  const [emergency, setEmergency] = useState(timeline?.emergency_override_enabled ?? true);

  function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ name, description, branch_id: branchId || null, is_active: active, loop_enabled: loop, emergency_override_enabled: emergency });
  }
  return (
    <Modal title={timeline ? 'Edit loop' : 'New loop'} onClose={onClose} maxWidth={520} icon="ti-layers">
      <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        <Field label="Name"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="e.g. Morning Branding Loop" /></Field>
        <Field label="Description (optional)"><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} /></Field>
        <Field label="Branch (optional)">
          <LocationPicker
            value={branchId || null}
            initialLabel={initialBranchLabel}
            placeholder="All branches"
            onChange={(picked) => setBranchId(picked ? picked.id : '')}
          />
        </Field>
        <div style={{ display: 'grid', gap: 8 }}>
          <Toggle label="Published" hint="Eligible to play on assigned screens" checked={active} onChange={setActive} />
          <Toggle label="Auto-replay" hint="Restart from item 1 when reaching end" checked={loop} onChange={setLoop} />
          <Toggle label="Allow alert override" hint="Pause this loop when an alert broadcast fires" checked={emergency} onChange={setEmergency} />
        </div>
        <FormActions onCancel={onClose} submitLabel={timeline ? 'Save' : 'Create loop'} />
      </form>
    </Modal>
  );
}

// ───────────────────────── Timeline Editor (visual) ─────────────────
function TimelineEditor({ timeline, onBack, showToast }) {
  const [addOpen, setAddOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [preview, setPreview] = useState({ playing: false, idx: 0, elapsed: 0 });
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [dragIdx, setDragIdx] = useState(null);
  const [dropIdx, setDropIdx] = useState(null);
  const [hoverIdx, setHoverIdx] = useState(null);

  // ── Draft editing ──────────────────────────────────────────────────
  // All item edits stage into `draft` and only hit the API on "Save changes".
  // A persisted draft (from a prior, un-saved session) is restored on mount so
  // a page refresh doesn't lose work.
  const serverItems = Array.isArray(timeline.items) ? timeline.items : [];
  const restoredDraft = useMemo(() => readLoopDraft(timeline.id), [timeline.id]);
  const [draft, setDraft] = useState(restoredDraft || serverItems);
  const [dirty, setDirty] = useState(!!restoredDraft);
  const [saving, setSaving] = useState(false);
  // Seed the temp-id counter past any tmp ids carried in a restored draft.
  const tmpCounter = useRef((restoredDraft || []).reduce((m, it) => {
    const mt = /^tmp-(\d+)$/.exec(String(it?.id || ''));
    return mt ? Math.max(m, Number(mt[1])) : m;
  }, 0));

  // List endpoint omits items[]; pull the full loop on entry so the editor
  // has something to render. ensureLoopDetail is idempotent.
  useEffect(() => { ensureLoopDetail(timeline.id); }, [timeline.id]);

  // Sync the draft from the server whenever the canonical items change AND we
  // have no pending edits (initial load, post-save refresh, external change).
  useEffect(() => {
    if (!dirty) setDraft(Array.isArray(timeline.items) ? timeline.items : []);
  }, [timeline.items, dirty]);

  // Mirror the draft to localStorage while dirty; clear it once saved/discarded.
  useEffect(() => {
    if (dirty) writeLoopDraft(timeline.id, draft);
    else clearLoopDraft(timeline.id);
  }, [draft, dirty, timeline.id]);

  const items = draft;
  const totalSecs = items.reduce((a, it) => a + (it.duration_seconds || 0), 0);

  // Local mutators (operate on the draft only)
  function makeNewItem(payload = {}) {
    const ctId = payload.content_type || 'BRANDING';
    return {
      id: `tmp-${++tmpCounter.current}`, _new: true,
      content_type: ctId,
      title: payload.title || CONTENT_TYPE_MAP[ctId]?.label || 'Untitled',
      duration_seconds: payload.duration_seconds ?? 15,
      transition_type: payload.transition_type || 'fade',
      content_reference_id: payload.content_reference_id ?? null,
      overlay_enabled: payload.overlay_enabled !== false,
      background_audio_enabled: !!payload.background_audio_enabled,
      payload: payload.payload ?? (ctId === 'SIMPLE_TEXT' ? { body: '' } : null),
    };
  }
  function addDraftItem(payload) { setDraft((d) => [...d, makeNewItem(payload)]); setDirty(true); }
  function updateDraftItem(id, payload) { setDraft((d) => d.map((x) => x.id === id ? { ...x, ...payload } : x)); setDirty(true); }
  function deleteDraftItem(id) { setDraft((d) => d.filter((x) => x.id !== id)); setDirty(true); }
  function duplicateDraftItem(id) {
    setDraft((d) => {
      const i = d.findIndex((x) => x.id === id);
      if (i < 0) return d;
      const copy = { ...d[i], id: `tmp-${++tmpCounter.current}`, _new: true };
      const next = d.slice();
      next.splice(i + 1, 0, copy);
      return next;
    });
    setDirty(true);
  }
  function bulkDraftDurations(secs) { setDraft((d) => d.map((x) => ({ ...x, duration_seconds: secs }))); setDirty(true); }

  async function saveChanges() {
    setSaving(true);
    try {
      await commitLoopDraft(timeline.id, draft);
      setDirty(false);                          // sync effect will pull fresh items
      showToast('success', 'Changes saved', timeline.name);
    } catch (e) {
      showToast('error', e.code || 'Save failed', e.message);
    } finally { setSaving(false); }
  }
  function discardChanges() {
    setDraft(Array.isArray(timeline.items) ? timeline.items : []);
    setDirty(false);
    setPreview({ playing: false, idx: 0, elapsed: 0 });
  }
  function handleBack() {
    if (dirty && !window.confirm('Discard unsaved changes to this loop?')) return;
    if (dirty) clearLoopDraft(timeline.id);   // user chose to abandon the draft
    onBack();
  }

  // Preview ticker
  useEffect(() => {
    if (!preview.playing || items.length === 0) return;
    const interval = setInterval(() => {
      setPreview((p) => {
        const cur = items[p.idx];
        if (!cur) return { ...p, playing: false };
        if (p.elapsed + 1 >= cur.duration_seconds) {
          const next = p.idx + 1;
          if (next >= items.length) {
            return timeline.loop_enabled ? { ...p, idx: 0, elapsed: 0 } : { ...p, playing: false, elapsed: cur.duration_seconds };
          }
          return { ...p, idx: next, elapsed: 0 };
        }
        return { ...p, elapsed: p.elapsed + 1 };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [preview.playing, items, timeline.loop_enabled]);

  function onDragStart(idx) { setDragIdx(idx); }
  function onDragOver(e, idx) { e.preventDefault(); setDropIdx(idx); }
  function onDrop() {
    if (dragIdx != null && dropIdx != null && dragIdx !== dropIdx) {
      setDraft((d) => {
        const next = d.slice();
        const [moved] = next.splice(dragIdx, 1);
        next.splice(dropIdx, 0, moved);
        return next;
      });
      setDirty(true);
    }
    setDragIdx(null); setDropIdx(null);
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* Header */}
      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button type="button" style={btnGhost} onClick={handleBack}><Icon className="ti ti-arrow-left" /> Back</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <strong style={{ fontSize: 16 }}>{timeline.name}</strong>
          {timeline.is_active ? <Pill color="#059669" bg="#d1fae5">Published</Pill> : <Pill color="#475569" bg="#e2e8f0">Draft</Pill>}
          {dirty && <Pill color="#b45309" bg="#fef3c7">Unsaved</Pill>}
        </div>
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>{items.length} items · {fmtDuration(totalSecs)}</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button type="button" style={btnGhost} disabled={items.length === 0}
            onClick={() => setPreviewModalOpen(true)}>
            <Icon className="ti ti-control-play" /> Preview In Action
          </button>
          {dirty && (
            <>
              <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--line)', margin: '0 2px' }} />
              <button type="button" style={{ ...btnGhost, opacity: saving ? 0.5 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}
                disabled={saving} onClick={discardChanges}>
                <Icon className="ti ti-back-left" /> Discard
              </button>
              <button type="button" style={{ ...btnPrimary, opacity: saving ? 0.5 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}
                disabled={saving} onClick={saveChanges}>
                <Icon className="ti ti-check" /> {saving ? 'Saving…' : 'Save changes'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Preview pane */}
      <div style={{ background: '#0f172a', borderRadius: 14, overflow: 'hidden', position: 'relative', aspectRatio: '16 / 6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <PreviewSurface items={items} preview={preview} />
      </div>

      {/* Timeline (Premiere-style) */}
      <TimelineTrack
        items={items} totalSecs={totalSecs} timeline={timeline}
        preview={preview} setPreview={setPreview}
        dragIdx={dragIdx} dropIdx={dropIdx} hoverIdx={hoverIdx}
        setHoverIdx={setHoverIdx} onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop}
        onEditItem={setEditingItem}
        onDuplicateItem={duplicateDraftItem}
        onDeleteItem={deleteDraftItem}
        onSetFixedDuration={() => setBulkOpen(true)}
      />

      {/* Content types catalog */}
      <Card title="Add Content to Loop Timeline" icon="ti-sparkles">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
          {CONTENT_TYPES.filter((ct) => ENABLED_CONTENT_TYPES.has(ct.id)).map((ct) => (
            <ContentTypeCard key={ct.id} ct={ct} enabled
              onAdd={() => { addDraftItem({ content_type: ct.id }); showToast('info', `${ct.label} added to draft`); }} />
          ))}
        </div>

        {CONTENT_TYPES.some((ct) => !ENABLED_CONTENT_TYPES.has(ct.id)) && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '20px 0 12px' }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--muted)' }}>Coming soon</span>
              <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
              {CONTENT_TYPES.filter((ct) => !ENABLED_CONTENT_TYPES.has(ct.id)).map((ct) => (
                <ContentTypeCard key={ct.id} ct={ct} enabled={false} />
              ))}
            </div>
          </>
        )}
      </Card>

      {addOpen && (
        <ItemModal onClose={() => setAddOpen(false)} onSave={(payload) => {
          addDraftItem(payload);
          setAddOpen(false);
        }} />
      )}
      {editingItem && (
        <ItemModal item={editingItem} onClose={() => setEditingItem(null)} onSave={(payload) => {
          updateDraftItem(editingItem.id, payload);
          setEditingItem(null);
        }} />
      )}
      {bulkOpen && (
        <BulkDurationsModal onClose={() => setBulkOpen(false)} onApply={(secs) => {
          bulkDraftDurations(secs);
          setBulkOpen(false);
        }} />
      )}
      {previewModalOpen && (
        <PreviewModal
          timeline={timeline} items={items}
          onClose={() => setPreviewModalOpen(false)}
        />
      )}
    </div>
  );
}

// Clock format: under a minute → "12s"; a minute or more → "M:SS min".
function fmtClock(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')} min`;
}

// Near-fullscreen "Preview In Action" — plays the loop as it would appear on a
// screen. Self-contained: owns its own playback state + ticker so it can be
// opened from the loop editor or from a loop card in the list.
function PreviewModal({ timeline, items, onClose }) {
  const [preview, setPreview] = useState({ playing: true, idx: 0, elapsed: 0 });
  const seekerRef = useRef(null);
  const seekStateRef = useRef({ dragging: false, wasPlaying: false });

  // Convert an absolute loop time (seconds) into { idx, elapsed } inside an
  // item and apply it. Mirrors the TimelineTrack scrub helper.
  function seekTo(targetSecs) {
    const t = Math.max(0, Math.min(targetSecs, items.reduce((a, it) => a + (it.duration_seconds || 0), 0)));
    let acc = 0;
    for (let i = 0; i < items.length; i++) {
      const d = items[i].duration_seconds || 0;
      if (t < acc + d || i === items.length - 1) {
        setPreview((p) => ({ ...p, idx: i, elapsed: Math.max(0, Math.min(d, Math.round(t - acc))) }));
        return;
      }
      acc += d;
    }
  }

  function pointerSecs(e) {
    const el = seekerRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    const x = (e.touches?.[0]?.clientX ?? e.clientX) - r.left;
    const ratio = Math.max(0, Math.min(1, x / r.width));
    const total = items.reduce((a, it) => a + (it.duration_seconds || 0), 0);
    return ratio * total;
  }

  function onSeekerDown(e) {
    if (items.length === 0) return;
    e.preventDefault();
    seekStateRef.current = { dragging: true, wasPlaying: preview.playing };
    setPreview((p) => ({ ...p, playing: false }));
    seekTo(pointerSecs(e));
    window.addEventListener('mousemove', onSeekerMove);
    window.addEventListener('mouseup',   onSeekerUp);
    window.addEventListener('touchmove', onSeekerMove, { passive: false });
    window.addEventListener('touchend',  onSeekerUp);
  }
  function onSeekerMove(e) {
    if (!seekStateRef.current.dragging) return;
    e.preventDefault?.();
    seekTo(pointerSecs(e));
  }
  function onSeekerUp() {
    const wasPlaying = seekStateRef.current.wasPlaying;
    seekStateRef.current.dragging = false;
    window.removeEventListener('mousemove', onSeekerMove);
    window.removeEventListener('mouseup',   onSeekerUp);
    window.removeEventListener('touchmove', onSeekerMove);
    window.removeEventListener('touchend',  onSeekerUp);
    if (wasPlaying) setPreview((p) => ({ ...p, playing: true }));
  }

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Playback ticker
  useEffect(() => {
    if (!preview.playing || items.length === 0) return;
    const interval = setInterval(() => {
      setPreview((p) => {
        const cur = items[p.idx];
        if (!cur) return { ...p, playing: false };
        if (p.elapsed + 1 >= cur.duration_seconds) {
          const next = p.idx + 1;
          if (next >= items.length) {
            return timeline.loop_enabled ? { ...p, idx: 0, elapsed: 0 } : { ...p, playing: false, elapsed: cur.duration_seconds };
          }
          return { ...p, idx: next, elapsed: 0 };
        }
        return { ...p, elapsed: p.elapsed + 1 };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [preview.playing, items, timeline.loop_enabled]);

  const cur = items[preview.idx];
  // Cumulative elapsed across the whole loop, and the loop's total runtime.
  const totalSecs = items.reduce((a, it) => a + (it.duration_seconds || 0), 0);
  const elapsedSecs = items.slice(0, preview.idx).reduce((a, it) => a + (it.duration_seconds || 0), 0) + preview.elapsed;
  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.82)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2.5vh 2.5vw' }}>
      <div style={{ width: '95vw', height: '95vh', background: '#0f172a', borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 30px 80px rgba(0,0,0,0.55)' }}>
        {/* Controls bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: '1px solid #1e293b', color: '#e2e8f0' }}>
          <Icon className="ti ti-layers" style={{ color: '#67e8f9', fontSize: 18 }} />
          <strong style={{ fontSize: 15 }}>{timeline.name}</strong>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>
            {items.length > 0 ? `Item ${preview.idx + 1} of ${items.length}` : 'Empty loop'}
            {cur ? ` · ${fmtDuration(cur.duration_seconds)} · ${cur.transition_type}` : ''}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => setPreview((p) => ({ ...p, playing: !p.playing }))}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
              <Icon className={`ti ${preview.playing ? 'ti-control-pause' : 'ti-control-play'}`} /> {preview.playing ? 'Pause' : 'Play'}
            </button>
            <button type="button" onClick={() => setPreview((p) => ({ ...p, idx: 0, elapsed: 0 }))}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
              <Icon className="ti ti-control-skip-backward" /> Restart
            </button>
            <button type="button" onClick={onClose}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', color: '#cbd5e1', border: '1px solid #334155', borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
              <Icon className="ti ti-close" /> Close
            </button>
          </div>
        </div>
        {/* Stage */}
        <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
          <PreviewSurface items={items} preview={preview} />
          {/* Running time (elapsed / total), bottom-right */}
          {totalSecs > 0 && (
            <div style={{ position: 'absolute', bottom: 30, right: 16, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 999, background: 'rgba(15,23,42,0.75)', border: '1px solid #334155', color: '#e2e8f0', fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
              <Icon className="ti ti-clock" style={{ color: '#67e8f9', fontSize: 13 }} />
              {fmtClock(elapsedSecs)} <span style={{ color: '#64748b' }}>/ {fmtClock(totalSecs)}</span>
            </div>
          )}
          {/* Seeker — click anywhere or drag the handle to scrub through the loop. */}
          {totalSecs > 0 && (
            <div
              ref={seekerRef}
              onMouseDown={onSeekerDown}
              onTouchStart={onSeekerDown}
              role="slider"
              aria-label="Seek through the loop"
              aria-valuemin={0}
              aria-valuemax={Math.round(totalSecs)}
              aria-valuenow={Math.round(elapsedSecs)}
              style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 22, padding: '8px 0 0', cursor: 'pointer', touchAction: 'none' }}
            >
              {/* Track */}
              <div style={{ position: 'relative', height: 6, background: 'rgba(255,255,255,0.12)' }}>
                {/* Per-item segment markers */}
                {items.map((it, i) => {
                  const start = items.slice(0, i).reduce((a, x) => a + (x.duration_seconds || 0), 0);
                  const leftPct = (start / totalSecs) * 100;
                  if (i === 0) return null;
                  return <span key={i} style={{ position: 'absolute', top: 0, bottom: 0, left: `${leftPct}%`, width: 1, background: 'rgba(255,255,255,0.25)' }} />;
                })}
                {/* Filled portion */}
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${Math.min(100, (elapsedSecs / totalSecs) * 100)}%`, background: '#0ea5e9', transition: seekStateRef.current.dragging ? 'none' : 'width 1s linear' }} />
                {/* Draggable handle */}
                <div
                  style={{
                    position: 'absolute', top: '50%', left: `${Math.min(100, (elapsedSecs / totalSecs) * 100)}%`,
                    width: 14, height: 14, borderRadius: 999, background: '#fff', border: '2px solid #0ea5e9',
                    transform: 'translate(-50%, -50%)', boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
                    transition: seekStateRef.current.dragging ? 'none' : 'left 1s linear',
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Premiere-style timeline track ───────────────────────────────────
// A dark NLE-style editor: a time ruler, a single "V1" video track whose
// clips are sized proportional to their duration, a draggable scrubber
// playhead, and per-clip hover controls. Click/scrub to move the playhead;
// drag clips to reorder.
const TL_PPS = 26;            // pixels per second
const TL_TRACK_H = 76;        // clip lane height
const TL_RULER_H = 24;        // time ruler height
const TL_GUTTER = 44;         // left track-label gutter width

function TimelineTrack({
  items, totalSecs, timeline, preview, setPreview,
  dragIdx, dropIdx, hoverIdx, setHoverIdx, onDragStart, onDragOver, onDrop,
  onEditItem, onDuplicateItem, onDeleteItem, onSetFixedDuration,
}) {
  const contentRef = useRef(null);
  const trackWidth = Math.max(Math.round(totalSecs * TL_PPS), 240);
  const tickStep = totalSecs <= 20 ? 2 : totalSecs <= 60 ? 5 : totalSecs <= 180 ? 15 : totalSecs <= 600 ? 30 : 60;

  const elapsedSecs = items.slice(0, preview.idx).reduce((a, it) => a + (it.duration_seconds || 0), 0) + (preview.elapsed || 0);

  // The ticker bumps `elapsed` once per second. A plain 1s transition toward
  // the *current* second would always trail real time by ~1s. Instead, while
  // playing we aim the head at the *next* second and glide there over 1s — so
  // at any instant it sits where playback actually is. When paused/scrubbing we
  // render the exact position with no transition.
  const targetSecs = preview.playing ? Math.min(totalSecs, elapsedSecs + 1) : elapsedSecs;
  const playheadX = Math.min(trackWidth, targetSecs * TL_PPS);

  // Suppress the glide when the head moves *backward* (loop wrap, restart, or a
  // manual scrub) so it snaps instead of sweeping back across the whole track.
  const prevXRef = useRef(0);
  const movedBackward = playheadX < prevXRef.current - 0.5;
  useEffect(() => { prevXRef.current = playheadX; });
  const playheadTransition = (preview.playing && !movedBackward) ? 'left 1s linear' : 'none';

  const ticks = [];
  for (let s = 0; s <= totalSecs; s += tickStep) ticks.push(s);

  // Map an x-pixel (within the content area) to a {idx, elapsed} and move there.
  function scrubToClientX(clientX) {
    const el = contentRef.current;
    if (!el || items.length === 0) return;
    const rect = el.getBoundingClientRect();
    const t = Math.max(0, Math.min(totalSecs, (clientX - rect.left) / TL_PPS));
    let acc = 0;
    for (let i = 0; i < items.length; i++) {
      const d = items[i].duration_seconds || 0;
      if (t < acc + d || i === items.length - 1) {
        setPreview((p) => ({ ...p, playing: false, idx: i, elapsed: Math.max(0, Math.min(d, Math.round(t - acc))) }));
        return;
      }
      acc += d;
    }
  }

  // Press-and-drag scrubbing (on the ruler or the playhead handle). Moves the
  // seeker continuously and pauses playback so the user can pick a start point.
  function beginScrub(e) {
    if (items.length === 0) return;
    e.preventDefault();
    scrubToClientX(e.clientX);
    const onMove = (ev) => scrubToClientX(ev.clientX);
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
    };
    document.body.style.userSelect = 'none';   // avoid text selection while dragging
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  return (
    <div style={{ background: '#0f1722', border: '1px solid #1e293b', borderRadius: 14, overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #1e293b', color: '#cbd5e1' }}>
        <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: '#94a3b8' }}>Timeline</span>
        <div style={{ display: 'inline-flex', gap: 6, marginLeft: 6 }}>
          <button type="button" title="Restart" onClick={() => setPreview((p) => ({ ...p, idx: 0, elapsed: 0 }))} style={tlBtn}><Icon className="ti ti-control-skip-backward" /></button>
          <button type="button" title={preview.playing ? 'Pause' : 'Play'} disabled={items.length === 0}
            onClick={() => setPreview((p) => ({ ...p, playing: !p.playing }))} style={tlBtn}>
            <Icon className={`ti ${preview.playing ? 'ti-control-pause' : 'ti-control-play'}`} />
          </button>
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
          <span style={{ color: '#e2e8f0', fontWeight: 700 }}>{fmtClock(elapsedSecs)}</span> / {fmtClock(totalSecs)} · {items.length} clip{items.length === 1 ? '' : 's'}
        </span>
        {onSetFixedDuration && (
          <button type="button" title="Set the same duration for every clip" disabled={items.length === 0}
            onClick={onSetFixedDuration}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 7, padding: '6px 11px', cursor: items.length === 0 ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 12, opacity: items.length === 0 ? 0.5 : 1 }}>
            <Icon className="ti ti-clock" /> Set Fixed Duration
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div style={{ padding: 36, textAlign: 'center', color: '#64748b' }}>
          No clips yet. Pick from <strong style={{ color: '#cbd5e1' }}>Add Content to Loop Timeline</strong> below to start.
        </div>
      ) : (
        <div style={{ display: 'flex' }}>
          {/* Left gutter with track label */}
          <div style={{ flex: `0 0 ${TL_GUTTER}px`, background: '#0b121b', borderRight: '1px solid #1e293b' }}>
            <div style={{ height: TL_RULER_H, borderBottom: '1px solid #1e293b' }} />
            <div style={{ height: TL_TRACK_H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 11, fontWeight: 800, letterSpacing: '.05em' }}>V1</div>
          </div>

          {/* Scrollable timeline body */}
          <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden' }}>
            <div ref={contentRef} style={{ position: 'relative', width: trackWidth }}>
              {/* Ruler (click or drag to scrub) */}
              <div onMouseDown={beginScrub}
                style={{ position: 'relative', height: TL_RULER_H, borderBottom: '1px solid #1e293b', cursor: 'ew-resize', background: '#0b121b' }}>
                {ticks.map((s) => (
                  <div key={s} style={{ position: 'absolute', left: s * TL_PPS, top: 0, bottom: 0, borderLeft: '1px solid #243244' }}>
                    <span style={{ position: 'absolute', left: 4, top: 4, fontSize: 9, color: '#5b6b7f', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtClock(s)}</span>
                  </div>
                ))}
              </div>

              {/* Clip lane */}
              <div onDrop={onDrop} onDragOver={(e) => e.preventDefault()}
                style={{ position: 'relative', height: TL_TRACK_H, display: 'flex', gap: 0, background: 'repeating-linear-gradient(90deg,#0f1722,#0f1722 ' + (tickStep * TL_PPS - 1) + 'px,#13202e ' + (tickStep * TL_PPS - 1) + 'px,#13202e ' + (tickStep * TL_PPS) + 'px)' }}>
                {items.map((it, idx) => {
                  const ct = CONTENT_TYPE_MAP[it.content_type];
                  const w = Math.max(2, it.duration_seconds) * TL_PPS;
                  const isCur = preview.idx === idx;
                  const isDropTarget = dropIdx === idx && dragIdx !== idx;
                  const color = ct?.color || '#64748b';
                  return (
                    <div key={it.id}
                      draggable
                      onDragStart={() => onDragStart(idx)}
                      onDragOver={(e) => onDragOver(e, idx)}
                      onMouseEnter={() => setHoverIdx(idx)}
                      onMouseLeave={() => setHoverIdx((h) => (h === idx ? null : h))}
                      onClick={() => setPreview((p) => ({ ...p, playing: false, idx, elapsed: 0 }))}
                      title={`${ct?.label} · ${it.title} · ${fmtDuration(it.duration_seconds)}`}
                      style={{
                        position: 'relative', width: w, minWidth: w, height: '100%',
                        boxSizing: 'border-box',
                        borderRight: '1px solid #0b121b',
                        outline: isCur ? `2px solid ${color}` : (isDropTarget ? '2px dashed #67e8f9' : 'none'),
                        outlineOffset: -2,
                        background: `linear-gradient(180deg, ${color}38, ${color}14)`,
                        cursor: 'grab', overflow: 'hidden',
                      }}>
                      {/* accent header */}
                      <div style={{ height: 5, background: color }} />
                      {/* clip body */}
                      <div style={{ padding: '5px 7px', height: `calc(100% - 5px)`, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                          <Icon className={`ti ${ct?.icon}`} style={{ color, fontSize: 12, flexShrink: 0 }} />
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.title}</span>
                        </div>
                        <div style={{ fontSize: 10, color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          <Icon className="ti ti-clock" style={{ fontSize: 10 }} /> {fmtDuration(it.duration_seconds)}
                          {w > 110 && <> · {it.transition_type}</>}
                        </div>
                      </div>
                      {/* hover toolbar */}
                      {hoverIdx === idx && w >= 64 && (
                        <div style={{ position: 'absolute', top: 6, right: 4, display: 'inline-flex', gap: 3 }}>
                          <button type="button" style={tlClipBtn} onClick={(e) => { e.stopPropagation(); onEditItem(it); }}><Icon className="ti ti-pencil" /></button>
                          <button type="button" style={tlClipBtn} onClick={(e) => { e.stopPropagation(); onDuplicateItem(it.id); }}><Icon className="ti ti-files" /></button>
                          <button type="button" style={{ ...tlClipBtn, color: '#fca5a5' }} onClick={(e) => { e.stopPropagation(); onDeleteItem(it.id); }}><Icon className="ti ti-trash" /></button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Playhead spanning ruler + lane */}
              <div style={{ position: 'absolute', top: 0, left: playheadX, transition: playheadTransition, height: TL_RULER_H + TL_TRACK_H, width: 2, background: '#ef4444', pointerEvents: 'none', zIndex: 5 }}>
                {/* Grabbable handle — drag to scrub */}
                <div onMouseDown={beginScrub} title="Drag to seek"
                  style={{ position: 'absolute', top: -1, left: -7, width: 16, height: 14, borderRadius: '3px 3px 6px 6px', background: '#ef4444', cursor: 'ew-resize', pointerEvents: 'auto', boxShadow: '0 1px 4px rgba(0,0,0,.4)' }} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const tlBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 28, background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 7, cursor: 'pointer', fontSize: 13 };
const tlClipBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, background: 'rgba(2,6,23,0.7)', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 5, cursor: 'pointer', fontSize: 11, padding: 0 };

// A single tile in the "Available content types" catalog. `enabled` tiles
// are clickable (add to the loop); disabled ones show a "Coming soon" badge.
function ContentTypeCard({ ct, enabled, onAdd }) {
  const sc = SCOPE_STYLES[ct.scope];
  return (
    <button type="button" disabled={!enabled}
      onClick={() => { if (enabled && onAdd) onAdd(); }}
      title={enabled ? '' : 'Coming soon'}
      style={{ textAlign: 'left', background: enabled ? '#fff' : '#f8fafc', border: '1px solid var(--line)', borderRadius: 10, padding: 12, cursor: enabled ? 'pointer' : 'not-allowed', opacity: enabled ? 1 : 0.6, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: `${ct.color}15`, color: ct.color, display: 'flex', alignItems: 'center', justifyContent: 'center', filter: enabled ? 'none' : 'grayscale(0.6)' }}>
          <Icon className={`ti ${ct.icon}`} />
        </div>
        <strong style={{ fontSize: 13, color: 'var(--ink)' }}>{ct.label}</strong>
        {enabled && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
            {ct.scope === 'CENTER' && (
              <Icon className="ti ti-bolt" title="Realtime data pull" style={{ color: '#b45309', fontSize: 12 }} />
            )}
            <span title={sc.hint} style={{ background: sc.bg, color: sc.color, fontSize: 9, fontWeight: 800, letterSpacing: '.06em', padding: '2px 6px', borderRadius: 4 }}>{sc.label}</span>
          </div>
        )}
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, lineHeight: 1.45 }}>{ct.desc}</div>
    </button>
  );
}

function PreviewSurface({ items, preview }) {
  const cur = items[preview.idx];
  if (!cur) {
    return <div style={{ color: '#94a3b8', fontSize: 14 }}>No content to preview.</div>;
  }
  const ct = CONTENT_TYPE_MAP[cur.content_type];
  const body = cur.payload?.body;
  const mediaUrl = cur.payload?.media_url;
  const isVideoUrl = /\.(mp4|webm|mov|m4v|mkv)(\?|$)/i.test(mediaUrl || '');
  const isBranding = cur.content_type === 'BRANDING';
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', textAlign: 'center', padding: 20, overflow: 'hidden', background: isBranding ? 'transparent' : `radial-gradient(circle at 30% 30%, ${ct.color}40, transparent 60%), radial-gradient(circle at 70% 80%, ${ct.color}30, transparent 60%)` }}>
      {isBranding ? (
        <BrandingPreview item={cur} />
      ) : cur.content_type === 'SIMPLE_TEXT' ? (
        <>
          <div style={{ fontSize: 32, fontWeight: 800, marginBottom: body ? 14 : 0 }}>{cur.title}</div>
          {body && <div style={{ fontSize: 18, color: '#e2e8f0', maxWidth: '80%', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{body}</div>}
        </>
      ) : mediaUrl ? (
        isVideoUrl
          ? <video src={mediaUrl} autoPlay muted loop style={{ maxWidth: '92%', maxHeight: '78%', borderRadius: 8 }} />
          : <img src={mediaUrl} alt={cur.title} style={{ maxWidth: '92%', maxHeight: '78%', objectFit: 'contain', borderRadius: 8 }} />
      ) : (
        <>
          <Icon className={`ti ${ct.icon}`} style={{ fontSize: 48, color: ct.color, marginBottom: 14, filter: 'drop-shadow(0 4px 12px rgba(0,0,0,.5))' }} />
          <div style={{ fontSize: 11, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: 6 }}>{ct.label}</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{cur.title}</div>
        </>
      )}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 8, fontSize: 12, color: '#94a3b8', textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}>Item {preview.idx + 1} of {items.length} · {cur.transition_type} · {fmtDuration(cur.duration_seconds)}</div>
    </div>
  );
}

// ─── Animated Branding renderer ──────────────────────────────────────
// Delegates to the modular scene engine in `src/features/branding/`.
// The loop item's payload (kit snapshot + theme + optional starting-scene
// hint) is read inside <BrandingScreen/> via `themeFromPayload` /
// `brandFromPayload` / `startSceneFromPayload`.
function BrandingPreview({ item }) {
  return <BrandingScreen item={item} />;
}

function ItemModal({ item, onClose, onSave }) {
  const [contentType, setContentType] = useState(item?.content_type || 'BRANDING');
  const [title, setTitle] = useState(item?.title || CONTENT_TYPE_MAP[contentType]?.label || '');
  const [duration, setDuration] = useState(item?.duration_seconds ?? 15);
  const [transition, setTransition] = useState(item?.transition_type || 'fade');
  const [mediaId, setMediaId] = useState(item?.content_reference_id || '');
  const [overlay, setOverlay] = useState(item?.overlay_enabled !== false);
  const [audio, setAudio] = useState(!!item?.background_audio_enabled);
  const [body, setBody] = useState(item?.payload?.body || '');
  const [brandingKitId, setBrandingKitId] = useState(item?.payload?.branding_kit_id || '');
  const [brandingThemeId, setBrandingThemeId] = useState(item?.payload?.branding_theme?.id || BRANDING_THEMES[0].id);
  const [brandingAnimationId, setBrandingAnimationId] = useState(item?.payload?.branding_animation?.id || item?.payload?.animation_preset || BRANDING_ANIMATIONS[0].id);

  // Branding kits feed the "Animated Branding" content type.
  const brandingKits = useBrandingKits();
  const activeKits = useMemo(() => brandingKits.filter((k) => k.is_active), [brandingKits]);

  // Linked media is sourced from the Bunny.net /digital-signage folder.
  const [bunnyMedia, setBunnyMedia] = useState([]);
  const [mediaLoading, setMediaLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setMediaLoading(true);
    listBunnyMedia(SIGNAGE_FOLDER)
      .then((rows) => { if (!cancelled) setBunnyMedia(rows); })
      .catch(() => { if (!cancelled) setBunnyMedia([]); })
      .finally(() => { if (!cancelled) setMediaLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { if (!item) setTitle(CONTENT_TYPE_MAP[contentType]?.label || ''); }, [contentType, item]);

  const isText = contentType === 'SIMPLE_TEXT';
  const isBranding = contentType === 'BRANDING';
  const mediaPickable = ['VIDEO','POSTER','BRANDING','TESTIMONIALS','TOPPERS'].includes(contentType);

  function submit(e) {
    e.preventDefault();
    let payload;
    if (isText) {
      payload = { ...(item?.payload || {}), body };
    } else if (mediaPickable) {
      // Carry the chosen Bunny file's CDN url so the player can render it.
      const sel = bunnyMedia.find((m) => m.name === mediaId);
      const base = { ...(item?.payload || {}) };
      if (sel?.url) base.media_url = sel.url; else delete base.media_url;
      // Animated Branding pulls assets from a branding kit. Store the id plus a
      // denormalised snapshot so the player renders without a second fetch.
      if (isBranding) {
        const kit = activeKits.find((k) => String(k.id) === String(brandingKitId));
        if (kit) {
          base.branding_kit_id = kit.id;
          base.branding = { display_name: kit.display_name, logo_url: kit.logo_url, taglines: kit.taglines, keywords: kit.keywords };
        } else {
          delete base.branding_kit_id;
          delete base.branding;
        }
        const theme = BRANDING_THEMES.find((t) => t.id === brandingThemeId) || BRANDING_THEMES[0];
        const anim = BRANDING_ANIMATIONS.find((a) => a.id === brandingAnimationId) || BRANDING_ANIMATIONS[0];
        base.branding_theme = { id: theme.id, name: theme.name, from: theme.from, to: theme.to, accent: theme.accent };
        base.branding_animation = { id: anim.id, name: anim.name };
        // Stay compatible with the player payload contract (§4 BRANDING).
        base.background_style = anim.background;
        base.animation_preset = anim.id;
      }
      payload = Object.keys(base).length ? base : null;
    } else {
      payload = item?.payload ?? null;
    }
    onSave({
      content_type: contentType, title: title.trim() || CONTENT_TYPE_MAP[contentType]?.label,
      duration_seconds: Math.max(1, Number(duration) || 15), transition_type: transition,
      content_reference_id: isText ? null : (mediaId || null), overlay_enabled: overlay, background_audio_enabled: audio,
      payload,
    });
  }

  return (
    <Modal title={item ? 'Edit loop item' : 'Add loop item'} onClose={onClose} maxWidth={600} icon="ti-plus">
      <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        <Field label="Content type">
          <select value={contentType} onChange={(e) => setContentType(e.target.value)} style={selStyle}>
            {CONTENT_TYPES.map((c) => {
              const enabled = ENABLED_CONTENT_TYPES.has(c.id);
              return <option key={c.id} value={c.id} disabled={!enabled}>{c.label}{enabled ? '' : ' (Coming soon)'}</option>;
            })}
          </select>
        </Field>
        <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} /></Field>

        {isText && (
          <Field label="Content">
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
              placeholder="Text to display on screen…" />
          </Field>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Duration (sec)"><input type="number" min={1} value={duration} onChange={(e) => setDuration(e.target.value)} style={inputStyle} /></Field>
          <Field label="Transition">
            <select value={transition} onChange={(e) => setTransition(e.target.value)} style={selStyle}>
              {TRANSITIONS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </Field>
        </div>

        {isBranding && (
          <>
            <Field label="Branding kit" hint={activeKits.length ? 'Pulls logo, name, taglines and keywords from the selected kit.' : 'No active kits yet — create one in the Branding Kit tab.'}>
              <select value={brandingKitId} onChange={(e) => setBrandingKitId(e.target.value)} style={selStyle}>
                <option value="">— None —</option>
                {brandingKitId && !activeKits.some((k) => String(k.id) === String(brandingKitId)) && (
                  <option value={brandingKitId}>{item?.payload?.branding?.display_name || 'Current kit'}</option>
                )}
                {activeKits.map((k) => <option key={k.id} value={k.id}>{k.display_name || 'Untitled kit'}</option>)}
              </select>
            </Field>

            <div>
              <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600, marginBottom: 8 }}>Colour theme</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
                {BRANDING_THEMES.map((t) => {
                  const sel = brandingThemeId === t.id;
                  return (
                    <button key={t.id} type="button" onClick={() => setBrandingThemeId(t.id)} title={t.name}
                      style={{ display: 'grid', gap: 6, padding: 6, borderRadius: 10, border: `2px solid ${sel ? 'var(--brand)' : 'var(--line)'}`, background: '#fff', cursor: 'pointer' }}>
                      <span style={{ display: 'block', height: 36, borderRadius: 6, background: `linear-gradient(135deg, ${t.from}, ${t.to})`, boxShadow: sel ? `0 0 0 2px ${t.accent} inset` : 'none' }} />
                      <span style={{ fontSize: 11, fontWeight: 700, textAlign: 'center', color: sel ? 'var(--brand)' : 'var(--ink)' }}>{t.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600, marginBottom: 8 }}>Animation style</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {BRANDING_ANIMATIONS.map((a) => {
                  const sel = brandingAnimationId === a.id;
                  return (
                    <button key={a.id} type="button" onClick={() => setBrandingAnimationId(a.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', padding: '10px 12px', borderRadius: 10, border: `1px solid ${sel ? 'var(--brand)' : 'var(--line)'}`, background: sel ? '#eaf3f5' : '#fff', cursor: 'pointer' }}>
                      <span style={{ width: 32, height: 32, borderRadius: 8, background: sel ? 'var(--brand)' : '#f1f5f9', color: sel ? '#fff' : 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flex: '0 0 auto' }}>
                        <Icon className={`ti ${a.icon}`} />
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{a.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.desc}</div>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {mediaPickable && (
          <Field label="Linked media (optional)" hint={`From Bunny.net / ${SIGNAGE_FOLDER}`}>
            <select value={mediaId} onChange={(e) => setMediaId(e.target.value)} style={selStyle} disabled={mediaLoading}>
              <option value="">{mediaLoading ? 'Loading media…' : '— None —'}</option>
              {/* keep the current value selectable even if it's no longer in the folder */}
              {!mediaLoading && mediaId && !bunnyMedia.some((m) => m.name === mediaId) && (
                <option value={mediaId}>{mediaId}</option>
              )}
              {bunnyMedia.map((m) => <option key={m.id} value={m.name}>{m.displayName} · {m.type}</option>)}
            </select>
          </Field>
        )}

        <div style={{ display: 'grid', gap: 8 }}>
          <Toggle label="Show overlay (attendance check-ins, etc.)" checked={overlay} onChange={setOverlay} />
          <Toggle label="Enable background audio" checked={audio} onChange={setAudio} />
        </div>

        <FormActions onCancel={onClose} submitLabel={item ? 'Save' : 'Add item'} />
      </form>
    </Modal>
  );
}

function BulkDurationsModal({ onClose, onApply }) {
  const [secs, setSecs] = useState(15);
  return (
    <Modal title="Set Fixed Duration" onClose={onClose} maxWidth={400} icon="ti-time">
      <p style={{ margin: '0 0 14px', color: 'var(--muted)', fontSize: 13 }}>Apply the same duration to every item in this loop.</p>
      <Field label="Duration (sec)"><input type="number" min={1} value={secs} onChange={(e) => setSecs(Number(e.target.value))} style={inputStyle} /></Field>
      <ModalFooter>
        <button type="button" className="btn btn-default" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-success" onClick={() => onApply(Math.max(1, secs))}>Apply</button>
      </ModalFooter>
    </Modal>
  );
}

// ───────────────────────── Media library ──────────────────────────────
function MediaTab({ branchFilter, setBranchFilter, branchFilterLabel, showToast }) { // eslint-disable-line no-unused-vars
  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const rows = await listBunnyMedia(SIGNAGE_FOLDER);
      setMedia(rows);
    } catch (e) {
      setError(bunnyErrorMessage(e, 'Failed to load media'));
      setMedia([]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const filtered = useMemo(() => media
    .filter((m) => !typeFilter || m.type === typeFilter),
  [media, typeFilter]);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 220 }}>
          <LocationPicker
            value={branchFilter || null}
            initialLabel={branchFilterLabel}
            placeholder="All branches"
            onChange={(picked) => setBranchFilter(picked ? picked.id : '')}
          />
        </div>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={selStyle}>
          <option value="">All types</option>
          <option value="image">Images</option>
          <option value="video">Videos</option>
          <option value="audio">Audio</option>
          <option value="lottie">Lottie</option>
        </select>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button type="button" style={btnGhost} onClick={reload} disabled={loading}><Icon className="ti ti-reload" /> Refresh</button>
          <button type="button" style={btnPrimary} onClick={() => setUploadOpen(true)}><Icon className="ti ti-upload" /> Upload</button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>
          <Icon className="ti ti-alert" style={{ marginRight: 6 }} />{error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
        {filtered.map((m) => (
          <div key={m.id} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ aspectRatio: '4 / 3', background: 'linear-gradient(135deg,#f1f5f9,#e2e8f0)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {m.type === 'image' && m.url
                ? <img src={m.url} alt={m.displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : m.type === 'video' && m.url
                  ? <video src={m.url} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <Icon className={`ti ${MEDIA_TYPE_ICON[m.type] || 'ti-file'}`} style={{ fontSize: 44, color: 'var(--muted)' }} />}
            </div>
            <div style={{ padding: 12, display: 'grid', gap: 6 }}>
              <strong style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={m.displayName}>{m.displayName}</strong>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                <span style={{ textTransform: 'uppercase', fontWeight: 700 }}>{m.type}</span> · {fmtBytes(m.size)}
                {m.updated_at && <> · {fmtRelTime(m.updated_at)}</>}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                {m.url
                  ? <a href={m.url} target="_blank" rel="noreferrer" style={{ ...miniBtn, textDecoration: 'none' }}><Icon className="ti ti-external-link" /> Open</a>
                  : <span />}
                <button type="button" style={miniBtn} onClick={() => setConfirmDelete(m)}><Icon className="ti ti-trash" style={{ color: '#dc2626' }} /></button>
              </div>
            </div>
          </div>
        ))}
        {!loading && filtered.length === 0 && (
          <div style={{ gridColumn: '1 / -1', padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
            {media.length === 0 ? `No files in the Bunny.net /${SIGNAGE_FOLDER} folder yet.` : 'No media matches your filters.'}
          </div>
        )}
        {loading && (
          <div style={{ gridColumn: '1 / -1', padding: 40, textAlign: 'center', color: 'var(--muted)' }}><Icon className="ti ti-reload" style={{ marginRight: 6 }} /> Loading from Bunny.net…</div>
        )}
      </div>

      {uploadOpen && (
        <UploadMediaModal onClose={() => setUploadOpen(false)} onUploaded={(m) => { setMedia((cur) => [m, ...cur]); showToast('success', 'Media uploaded', m.displayName); setUploadOpen(false); }}
          onError={(e) => showToast('error', 'Upload failed', bunnyErrorMessage(e, 'Upload failed'))} />
      )}
      {confirmDelete && (
        <ConfirmModal title="Delete this asset?" message={<><strong>{confirmDelete.displayName}</strong> will be permanently removed from Bunny.net. Loops referencing it will show a missing placeholder.</>}
          confirmLabel="Delete" confirmStyle={btnDanger}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={async () => {
            try { await deleteBunnyMedia(confirmDelete.name); setMedia((cur) => cur.filter((x) => x.id !== confirmDelete.id)); showToast('success', 'Media deleted'); }
            catch (e) { showToast('error', 'Delete failed', bunnyErrorMessage(e, 'Delete failed')); }
            setConfirmDelete(null);
          }} />
      )}
    </div>
  );
}

const MEDIA_TYPE_ICON = { image: 'ti-photo', video: 'ti-video', audio: 'ti-volume', lottie: 'ti-vector', other: 'ti-file' };

function UploadMediaModal({ onClose, onUploaded, onError }) {
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [fileError, setFileError] = useState(null);

  function pickFile(f) {
    if (!f) return;
    const err = validateUpload(f);
    setFileError(err);
    setFile(err ? null : f);
  }

  // Compute the stored name once per picked file so the preview matches what's
  // actually uploaded (UUID/date are fixed at pick-time, not regenerated).
  const storedName = useMemo(() => (file ? buildBunnyFileName(file.name) : null), [file]);

  async function submit(e) {
    e.preventDefault();
    if (!file) return;
    const err = validateUpload(file);
    if (err) { setFileError(err); return; }
    setSubmitting(true);
    try {
      const m = await uploadBunnyMedia(file, { path: SIGNAGE_FOLDER, fileName: storedName });
      onUploaded(m);
    } catch (err2) {
      onError?.(err2);
    } finally { setSubmitting(false); }
  }

  return (
    <Modal title="Upload to Bunny.net" onClose={onClose} maxWidth={480} icon="ti-upload">
      <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        <label style={{ border: '2px dashed var(--line)', borderRadius: 10, padding: 24, textAlign: 'center', background: '#fbfcfd', cursor: 'pointer', display: 'block' }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); pickFile(e.dataTransfer.files?.[0]); }}>
          <input type="file" hidden onChange={(e) => pickFile(e.target.files?.[0])}
            accept="image/*,video/*,audio/*,application/json,application/lottie+json" />
          <Icon className="ti ti-cloud-upload" style={{ fontSize: 32, color: 'var(--muted)' }} />
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 8 }}>{file ? file.name : 'Drop a file here or click to browse'}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            {file ? fmtBytes(file.size) : 'Images, videos (mp4/webm), audio, Lottie JSON · max 200 MB'}
          </div>
        </label>
        {fileError && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 8, padding: '8px 10px', fontSize: 12 }}>
            <Icon className="ti ti-alert" style={{ marginRight: 6 }} />{fileError}
          </div>
        )}
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          Destination: <code style={{ fontFamily: 'monospace' }}>Bunny.net / {SIGNAGE_FOLDER}</code>
        </div>
        {storedName && (
          <div style={{ fontSize: 11, color: 'var(--muted)', background: '#f8fafc', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px', wordBreak: 'break-all' }}>
            Will be saved as <code style={{ fontFamily: 'monospace', color: 'var(--ink)' }}>{storedName}</code>
          </div>
        )}
        <FormActions onCancel={onClose} submitLabel={submitting ? 'Uploading…' : 'Upload'} disabled={!file || submitting} />
      </form>
    </Modal>
  );
}


// ───────────────────────── Branding Kit ───────────────────────────────
const TAGLINE_MAX = 120;

function BrandingKitsTab({ branchFilter, setBranchFilter, branchFilterLabel, showToast }) {
  const kits     = useBrandingKits();
  const branches = useBranches();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const branchName = useCallback((id) => branches.find((b) => String(b.id) === String(id))?.name || `#${id}`, [branches]);

  // A kit with no branches is global; otherwise it shows only when it targets
  // the selected branch.
  const filtered = useMemo(
    () => branchFilter ? kits.filter((k) => k.branch_ids.length === 0 || k.branch_ids.map(String).includes(String(branchFilter))) : kits,
    [kits, branchFilter]
  );

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ minWidth: 220 }}>
          <LocationPicker
            value={branchFilter || null}
            initialLabel={branchFilterLabel}
            placeholder="All branches"
            onChange={(picked) => setBranchFilter(picked ? picked.id : '')}
          />
        </div>
        <button type="button" style={{ ...btnPrimary, marginLeft: 'auto' }} onClick={() => setCreating(true)}><Icon className="ti ti-plus" /> New kit</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
        {filtered.map((k) => (
          <div key={k.id} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16, display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 52, height: 52, borderRadius: 10, border: '1px solid var(--line)', background: '#fbfcfd', flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {k.logo_url
                  ? <img src={k.logo_url} alt={k.display_name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  : <Icon className="ti ti-stamp" style={{ fontSize: 22, color: 'var(--muted)' }} />}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <strong style={{ fontSize: 15, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.display_name || 'Untitled kit'}</strong>
                  {k.is_active ? <Pill color="#059669" bg="#d1fae5">On</Pill> : <Pill color="#475569" bg="#e2e8f0">Off</Pill>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                  {k.branch_ids.length === 0 ? 'All branches' : `${k.branch_ids.length} branch${k.branch_ids.length === 1 ? '' : 'es'}`}
                </div>
              </div>
              <KebabMenu items={[
                { label: k.is_active ? 'Deactivate' : 'Activate', icon: k.is_active ? 'ti-eye-off' : 'ti-eye',
                  onClick: () => updateBrandingKit(k.id, { is_active: !k.is_active }).catch((e) => showToast('error', e.code || 'Update failed', e.message)) },
                { label: 'Edit', icon: 'ti-pencil', onClick: () => setEditing(k) },
                { label: 'Delete', icon: 'ti-trash', danger: true, onClick: () => setConfirmDelete(k) },
              ]} />
            </div>

            {k.taglines.length > 0 && (
              <div style={{ display: 'grid', gap: 4 }}>
                {k.taglines.slice(0, 3).map((t, i) => (
                  <div key={i} style={{ fontSize: 12, color: 'var(--ink)', display: 'flex', gap: 6 }}>
                    <Icon className="ti ti-quote" style={{ color: 'var(--brand)', flex: '0 0 auto' }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t}</span>
                  </div>
                ))}
                {k.taglines.length > 3 && <div style={{ fontSize: 11, color: 'var(--muted)' }}>+{k.taglines.length - 3} more</div>}
              </div>
            )}

            {k.keywords.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {k.keywords.map((w, i) => (
                  <span key={i} style={{ fontSize: 11, fontWeight: 600, color: 'var(--brand)', background: '#eaf3f5', padding: '3px 9px', borderRadius: 999 }}>{w}</span>
                ))}
              </div>
            )}

            {k.branch_ids.length > 0 && (
              <div style={{ fontSize: 11, color: 'var(--muted)', borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                {k.branch_ids.slice(0, 4).map(branchName).join(' · ')}{k.branch_ids.length > 4 ? ` +${k.branch_ids.length - 4}` : ''}
              </div>
            )}
          </div>
        ))}

        {filtered.length === 0 && (
          <div style={{ gridColumn: '1 / -1', border: '1px dashed var(--line)', borderRadius: 14, padding: 40, textAlign: 'center', color: 'var(--muted)', background: '#fff' }}>
            <Icon className="ti ti-stamp" style={{ fontSize: 30, display: 'block', marginBottom: 10, color: 'var(--muted)' }} />
            <div style={{ fontWeight: 600, color: 'var(--ink)' }}>No branding kits yet</div>
            <div style={{ fontSize: 12, marginTop: 6 }}>Create a kit with your logo, name, taglines and keywords. Animated Branding loop items pull from it.</div>
            <button type="button" style={{ ...btnPrimary, marginTop: 14 }} onClick={() => setCreating(true)}><Icon className="ti ti-plus" /> New kit</button>
          </div>
        )}
      </div>

      {(creating || editing) && (
        <BrandingKitModal kit={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSave={async (payload) => {
            try {
              if (editing) { await updateBrandingKit(editing.id, payload); showToast('success', 'Kit updated', payload.display_name); }
              else         { const k = await createBrandingKit(payload); showToast('success', 'Kit created', k.display_name); }
            } catch (e) { showToast('error', e.code || 'Save failed', e.message); return; }
            setCreating(false); setEditing(null);
          }} />
      )}
      {confirmDelete && (
        <ConfirmModal title="Delete this branding kit?" message={<><strong>{confirmDelete.display_name || 'This kit'}</strong> will be removed. Loop items using it will lose their branding.</>}
          confirmLabel="Delete" confirmStyle={btnDanger}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={async () => {
            try { await deleteBrandingKit(confirmDelete.id); showToast('success', 'Kit deleted'); }
            catch (e) { showToast('error', e.code || 'Delete failed', e.message); }
            setConfirmDelete(null);
          }} />
      )}
    </div>
  );
}

function BrandingKitModal({ kit, onClose, onSave }) {
  const [displayName, setDisplayName] = useState(kit?.display_name || '');
  const [logoUrl, setLogoUrl] = useState(kit?.logo_url || '');
  const [taglines, setTaglines] = useState(kit?.taglines?.length ? kit.taglines : ['']);
  const [keywords, setKeywords] = useState(kit?.keywords || []);
  const [kwDraft, setKwDraft] = useState('');
  const [branchIds, setBranchIds] = useState(kit?.branch_ids || []);
  const [active, setActive] = useState(kit?.is_active ?? true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  const initialBranchLabels = useMemo(() => {
    const out = {};
    (kit?.branch_ids || []).forEach((id) => { out[id] = `#${id}`; });
    return out;
  }, [kit]);

  function setTagline(i, v) { setTaglines((cur) => cur.map((t, idx) => idx === i ? v.slice(0, TAGLINE_MAX) : t)); }
  function addTagline() { setTaglines((cur) => [...cur, '']); }
  function removeTagline(i) { setTaglines((cur) => cur.length === 1 ? [''] : cur.filter((_, idx) => idx !== i)); }

  function addKeyword(raw) {
    const w = raw.trim();
    if (!w) return;
    setKeywords((cur) => cur.some((x) => x.toLowerCase() === w.toLowerCase()) ? cur : [...cur, w]);
    setKwDraft('');
  }
  function removeKeyword(i) { setKeywords((cur) => cur.filter((_, idx) => idx !== i)); }
  function onKwKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addKeyword(kwDraft); }
    else if (e.key === 'Backspace' && !kwDraft && keywords.length) { removeKeyword(keywords.length - 1); }
  }

  async function pickLogo(f) {
    if (!f) return;
    const err = validateUpload(f);
    if (err) { setUploadError(err); return; }
    setUploadError(null);
    setUploading(true);
    try {
      const m = await uploadBunnyMedia(f, { path: SIGNAGE_FOLDER, fileName: buildBunnyFileName(f.name) });
      if (m?.url) setLogoUrl(m.url); else setUploadError('Upload succeeded but no URL was returned.');
    } catch (e) {
      setUploadError(e?.message || 'Upload failed.');
    } finally { setUploading(false); }
  }

  function submit(e) {
    e.preventDefault();
    if (!displayName.trim()) return;
    onSave({
      display_name: displayName.trim(),
      logo_url: logoUrl || null,
      taglines: taglines.map((t) => t.trim()).filter(Boolean),
      keywords,
      branch_ids: branchIds,
      is_active: active,
    });
  }

  return (
    <Modal title={kit ? 'Edit branding kit' : 'New branding kit'} onClose={onClose} maxWidth={620} icon="ti-stamp">
      <form onSubmit={submit} style={{ display: 'grid', gap: 16 }}>
        <Field label="Company display name"><input autoFocus value={displayName} onChange={(e) => setDisplayName(e.target.value)} style={inputStyle} placeholder="e.g. Crispr Learning" /></Field>

        <div>
          <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600, marginBottom: 6 }}>Logo</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 72, height: 72, borderRadius: 12, border: '1px solid var(--line)', background: '#fbfcfd', flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {logoUrl
                ? <img src={logoUrl} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                : <Icon className="ti ti-photo" style={{ fontSize: 24, color: 'var(--muted)' }} />}
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ ...btnGhost, cursor: uploading ? 'wait' : 'pointer' }}>
                <Icon className="ti ti-cloud-upload" /> {uploading ? 'Uploading…' : logoUrl ? 'Replace logo' : 'Upload logo'}
                <input type="file" hidden accept="image/*" disabled={uploading} onChange={(e) => pickLogo(e.target.files?.[0])} />
              </label>
              {logoUrl && (
                <button type="button" style={{ ...btnGhost, color: 'var(--danger)' }} onClick={() => setLogoUrl('')}>
                  <Icon className="ti ti-x" /> Remove
                </button>
              )}
            </div>
          </div>
          {uploadError && <div style={{ marginTop: 8, fontSize: 12, color: '#991b1b' }}><Icon className="ti ti-alert" style={{ marginRight: 6 }} />{uploadError}</div>}
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600 }}>Tag lines</span>
            <button type="button" style={{ ...btnGhost, marginLeft: 'auto', padding: '4px 10px' }} onClick={addTagline}><Icon className="ti ti-plus" /> Add line</button>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {taglines.map((t, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input value={t} maxLength={TAGLINE_MAX} onChange={(e) => setTagline(i, e.target.value)} style={{ ...inputStyle, flex: 1 }} placeholder="Short slogan to display…" />
                <span style={{ fontSize: 11, color: 'var(--muted)', width: 54, textAlign: 'right' }}>{t.length}/{TAGLINE_MAX}</span>
                <button type="button" onClick={() => removeTagline(i)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16 }} title="Remove"><Icon className="ti ti-trash" /></button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600, marginBottom: 6 }}>Keywords</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>Used to build the word-cloud display. Press Enter or comma to add.</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', border: '1px solid var(--line)', borderRadius: 8, padding: 8 }}>
            {keywords.map((w, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--brand)', background: '#eaf3f5', padding: '4px 8px 4px 10px', borderRadius: 999 }}>
                {w}
                <button type="button" onClick={() => removeKeyword(i)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--brand)', padding: 0, display: 'inline-flex' }} title="Remove"><Icon className="ti ti-x" style={{ fontSize: 12 }} /></button>
              </span>
            ))}
            <input value={kwDraft} onChange={(e) => setKwDraft(e.target.value)} onKeyDown={onKwKeyDown} onBlur={() => addKeyword(kwDraft)}
              style={{ flex: 1, minWidth: 120, border: 'none', outline: 'none', fontSize: 13, padding: '4px 2px', background: 'transparent' }}
              placeholder={keywords.length ? '' : 'e.g. IISER, NISER, IAT, Expert Teachers'} />
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600, marginBottom: 8 }}>Apply to branches</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>Leave empty to make this kit available to all branches.</div>
          <LocationMultiPicker
            valueIds={branchIds}
            initialLabels={initialBranchLabels}
            placeholder="Add branches…"
            onChange={(ids) => setBranchIds(ids)}
          />
        </div>

        <Toggle label="Active" hint="Available for selection in Animated Branding loop items" checked={active} onChange={setActive} />
        <FormActions onCancel={onClose} submitLabel={kit ? 'Save' : 'Create'} disabled={uploading} />
      </form>
    </Modal>
  );
}


// ───────────────────────── Schedules ──────────────────────────────────
function SchedulesTab({ branchFilter, setBranchFilter, branchFilterLabel, showToast }) {
  const schedules = useSchedules();
  const timelines = useTimelines();
  const screens   = useScreens();
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const filtered = useMemo(() => {
    if (!branchFilter) return schedules;
    return schedules.filter((s) => s.screen_ids.some((id) => {
      const sc = screens.find((x) => x.id === id);
      return sc && String(sc.branch_id) === String(branchFilter);
    }));
  }, [schedules, branchFilter, screens]);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ minWidth: 220 }}>
          <LocationPicker
            value={branchFilter || null}
            initialLabel={branchFilterLabel}
            placeholder="All branches"
            onChange={(picked) => setBranchFilter(picked ? picked.id : '')}
          />
        </div>
        <button type="button" style={{ ...btnPrimary, marginLeft: 'auto' }} onClick={() => setCreating(true)}><Icon className="ti ti-plus" /> New schedule</button>
      </div>

      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Schedule</th>
              <th style={thStyle}>Loop</th>
              <th style={thStyle}>Screens</th>
              <th style={thStyle}>When</th>
              <th style={thStyle}>Active period</th>
              <th style={thStyle}>Priority</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => {
              const tl = timelines.find((t) => t.id === s.timeline_id);
              return (
                <tr key={s.id} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {s.is_active ? <Pill color="#059669" bg="#d1fae5">On</Pill> : <Pill color="#475569" bg="#e2e8f0">Off</Pill>}
                      <strong>{s.name}</strong>
                    </div>
                  </td>
                  <td style={tdStyle}>
                    {tl
                      ? <a href={`/digital-signage?tab=timelines&loop=${encodeURIComponent(tl.id)}`} style={{ color: 'var(--brand)', fontWeight: 600, textDecoration: 'none' }}>{tl.name}</a>
                      : <em style={{ color: 'var(--muted)' }}>Missing</em>}
                  </td>
                  <td style={tdStyle}><span style={{ fontWeight: 700 }}>{s.screen_ids.length}</span></td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                      {WEEKDAYS.map((d) => (
                        <span key={d.id} style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: s.days.includes(d.id) ? 'var(--brand)' : '#f1f5f9', color: s.days.includes(d.id) ? '#fff' : 'var(--muted)' }}>{d.label}</span>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{s.start_time} – {s.end_time}</div>
                  </td>
                  <td style={tdStyle}><span style={{ fontSize: 12 }}>{s.start_date} {s.end_date && `→ ${s.end_date}`}</span></td>
                  <td style={tdStyle}>{s.priority}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <KebabMenu items={[
                      { label: s.is_active ? 'Pause' : 'Resume', icon: s.is_active ? 'ti-control-pause' : 'ti-control-play',
                        onClick: () => updateSchedule(s.id, { is_active: !s.is_active }).catch((e) => showToast('error', e.code || 'Update failed', e.message)) },
                      { label: 'Edit', icon: 'ti-pencil', onClick: () => setEditing(s) },
                      { label: 'Delete', icon: 'ti-trash', danger: true, onClick: () => setConfirmDelete(s) },
                    ]} />
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>No schedules yet. Create one to time-bound your loops.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {(creating || editing) && (
        <ScheduleModal schedule={editing} timelines={timelines} screens={screens}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSave={async (payload) => {
            try {
              if (editing) { await updateSchedule(editing.id, payload); showToast('success', 'Schedule updated', payload.name); }
              else         { const sch = await createSchedule(payload); showToast('success', 'Schedule created', sch.name); }
            } catch (e) { showToast('error', e.code || 'Save failed', e.message); return; }
            setCreating(false); setEditing(null);
          }} />
      )}
      {confirmDelete && (
        <ConfirmModal title="Delete this schedule?" message={<><strong>{confirmDelete.name}</strong> will be removed. Screens revert to their assigned default loop.</>}
          confirmLabel="Delete" confirmStyle={btnDanger}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={async () => {
            try { await deleteSchedule(confirmDelete.id); showToast('success', 'Schedule deleted'); }
            catch (e) { showToast('error', e.code || 'Delete failed', e.message); }
            setConfirmDelete(null);
          }} />
      )}
    </div>
  );
}

function ScheduleModal({ schedule, timelines, screens, onClose, onSave }) {
  const [name, setName] = useState(schedule?.name || '');
  const [timelineId, setTimelineId] = useState(schedule?.timeline_id || timelines[0]?.id || '');
  const [screenIds, setScreenIds] = useState(new Set(schedule?.screen_ids || []));
  const [days, setDays] = useState(new Set(schedule?.days || ['mon','tue','wed','thu','fri']));
  const [startTime, setStartTime] = useState(schedule?.start_time || '09:00');
  const [endTime, setEndTime] = useState(schedule?.end_time || '18:00');
  const [startDate, setStartDate] = useState(schedule?.start_date || new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(schedule?.end_date || '');
  const [priority, setPriority] = useState(schedule?.priority ?? 5);
  const [active, setActive] = useState(schedule?.is_active ?? true);

  function toggleDay(d) { setDays((cur) => { const n = new Set(cur); n.has(d) ? n.delete(d) : n.add(d); return n; }); }
  function toggleScreen(id) { setScreenIds((cur) => { const n = new Set(cur); n.has(id) ? n.delete(id) : n.add(id); return n; }); }

  function submit(e) {
    e.preventDefault();
    if (!name.trim() || !timelineId) return;
    onSave({
      name: name.trim(), timeline_id: timelineId, screen_ids: Array.from(screenIds),
      days: Array.from(days), start_time: startTime, end_time: endTime,
      start_date: startDate, end_date: endDate, priority: Number(priority) || 0, is_active: active,
    });
  }
  return (
    <Modal title={schedule ? 'Edit schedule' : 'New schedule'} onClose={onClose} maxWidth={620} icon="ti-calendar">
      <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        <Field label="Name"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="e.g. Morning Branding" /></Field>
        <Field label="Loop">
          <select value={timelineId} onChange={(e) => setTimelineId(e.target.value)} style={selStyle}>
            {timelines.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        <div>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>Days</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {WEEKDAYS.map((d) => {
              const sel = days.has(d.id);
              return (
                <button key={d.id} type="button" onClick={() => toggleDay(d.id)}
                  style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: `1px solid ${sel ? 'var(--brand)' : 'var(--line)'}`, background: sel ? 'var(--brand)' : '#fff', color: sel ? '#fff' : 'var(--ink)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Start time"><input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={inputStyle} /></Field>
          <Field label="End time"><input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={inputStyle} /></Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <Field label="Start date"><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} /></Field>
          <Field label="End date (optional)"><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} /></Field>
          <Field label="Priority (1-10)"><input type="number" min={1} max={10} value={priority} onChange={(e) => setPriority(e.target.value)} style={inputStyle} /></Field>
        </div>
        <div>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>Screens ({screenIds.size})</div>
          <div style={{ maxHeight: 200, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 8, padding: 8, display: 'grid', gap: 4 }}>
            {screens.map((s) => {
              const sel = screenIds.has(s.id);
              return (
                <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, background: sel ? '#eaf3f5' : 'transparent', cursor: 'pointer' }}>
                  <input type="checkbox" checked={sel} onChange={() => toggleScreen(s.id)} />
                  <span style={{ flex: 1, fontSize: 13 }}>{s.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>{s.screen_code}</span>
                </label>
              );
            })}
          </div>
        </div>
        <Toggle label="Activate immediately" checked={active} onChange={setActive} />
        <FormActions onCancel={onClose} submitLabel={schedule ? 'Save' : 'Create'} />
      </form>
    </Modal>
  );
}

// ───────────────────────── Alerts ─────────────────────────────────────
function AlertsTab({ branchFilter, setBranchFilter, branchFilterLabel, showToast }) {
  const alerts   = useAlerts();
  const branches = useBranches();
  const screens  = useScreens();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const filtered = useMemo(() => branchFilter ? alerts.filter((a) => a.branch_ids.length === 0 || a.branch_ids.includes(branchFilter)) : alerts, [alerts, branchFilter]);
  const active = filtered.filter((a) => a.is_active);

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ minWidth: 220 }}>
          <LocationPicker
            value={branchFilter || null}
            initialLabel={branchFilterLabel}
            placeholder="All branches"
            onChange={(picked) => setBranchFilter(picked ? picked.id : '')}
          />
        </div>
        <button type="button" style={{ ...btnDanger, background: '#dc2626', color: '#fff', borderColor: '#dc2626', marginLeft: 'auto' }} onClick={() => setCreating(true)}>
          <Icon className="ti ti-alert" /> New alert
        </button>
      </div>

      {active.length > 0 && (
        <Card title={`Active broadcasts (${active.length})`} icon="ti-radio">
          <div style={{ display: 'grid', gap: 10 }}>
            {active.map((a) => <AlertCard key={a.id} alert={a} branches={branches} screens={screens}
              onDismiss={() => { dismissAlert(a.id); showToast('success', 'Broadcast stopped'); }}
              onEdit={() => setEditing(a)} onDelete={() => setConfirmDelete(a)} />)}
          </div>
        </Card>
      )}

      <Card title="All broadcasts" icon="ti-list">
        <div style={{ display: 'grid', gap: 10 }}>
          {filtered.map((a) => <AlertCard key={a.id} alert={a} branches={branches} screens={screens}
            onBroadcast={() => { broadcastAlert(a.id); showToast('success', 'Broadcasting now', a.title); }}
            onDismiss={() => { dismissAlert(a.id); showToast('success', 'Broadcast stopped'); }}
            onEdit={() => setEditing(a)} onDelete={() => setConfirmDelete(a)} />)}
          {filtered.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)' }}>No alerts yet.</div>}
        </div>
      </Card>

      {(creating || editing) && (
        <AlertModal alert={editing} branches={branches} screens={screens}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSave={async (payload) => {
            try {
              if (editing) { await updateAlert(editing.id, payload); showToast('success', 'Alert updated', payload.title); }
              else         { const al = await createAlert(payload); showToast(al.is_active ? 'error' : 'success', al.is_active ? 'Broadcasting' : 'Alert saved', al.title); }
            } catch (e) { showToast('error', e.code || 'Save failed', e.message); return; }
            setCreating(false); setEditing(null);
          }} />
      )}
      {confirmDelete && (
        <ConfirmModal title="Delete this alert?" message={<><strong>{confirmDelete.title}</strong> will be removed permanently.</>}
          confirmLabel="Delete" confirmStyle={btnDanger}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={async () => {
            try { await deleteAlert(confirmDelete.id); showToast('success', 'Alert deleted'); }
            catch (e) { showToast('error', e.code || 'Delete failed', e.message); }
            setConfirmDelete(null);
          }} />
      )}
    </div>
  );
}

// Human-readable alert window. Collapses the date when start/end share a day:
//   "28 May 2026, 9:24 AM → 9:24 AM"  (same day)
//   "28 May 2026, 9:24 AM → 29 May 2026, 6:00 PM"  (spanning days)
function fmtAlertWindow(start, end) {
  const s = start ? new Date(start) : null;
  const e = end ? new Date(end) : null;
  if (!s || isNaN(s)) return '—';
  const dateOpts = { day: '2-digit', month: 'short', year: 'numeric' };
  const timeOpts = { hour: 'numeric', minute: '2-digit' };
  const sDate = s.toLocaleDateString(undefined, dateOpts);
  const sTime = s.toLocaleTimeString(undefined, timeOpts);
  if (!e || isNaN(e)) return `${sDate}, ${sTime}`;
  const eDate = e.toLocaleDateString(undefined, dateOpts);
  const eTime = e.toLocaleTimeString(undefined, timeOpts);
  return sDate === eDate
    ? `${sDate}, ${sTime} → ${eTime}`
    : `${sDate}, ${sTime} → ${eDate}, ${eTime}`;
}

// ↔ between a stored timestamp and a <input type="datetime-local"> value
// (which is always `YYYY-MM-DDTHH:mm` in local time).
function toLocalInputValue(value) {
  if (!value) return '';
  const d = new Date(value);
  if (!isNaN(d)) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  // Tolerate "YYYY-MM-DD HH:mm" (space-separated, no offset).
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(value);
  return m ? `${m[1]}T${m[2]}` : '';
}
function fromLocalInputValue(value) {
  if (!value) return '';
  const d = new Date(value); // parsed as local time
  return isNaN(d) ? value : d.toISOString(); // ISO-8601 (UTC) for the API
}

function AlertCard({ alert: a, branches, screens, onBroadcast, onDismiss, onEdit, onDelete }) {
  const sev = SEVERITIES.find((s) => s.id === a.severity) || SEVERITIES[1];
  const branchNames = a.branch_ids.length === 0 ? 'All branches' : a.branch_ids.map((id) => branches.find((b) => b.id === id)?.name).filter(Boolean).join(', ');
  return (
    <div style={{ border: `1px solid ${a.is_active ? '#fca5a5' : 'var(--line)'}`, borderRadius: 10, padding: 14, display: 'flex', alignItems: 'flex-start', gap: 12, background: a.is_active ? '#fef2f2' : '#fff' }}>
      <div style={{ width: 38, height: 38, borderRadius: 8, background: sev.bg, color: sev.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
        <Icon className="ti ti-alert" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 14, color: 'var(--ink)' }}>{a.title}</strong>
          <Pill color={sev.color} bg={sev.bg}>{sev.label}</Pill>
          {a.is_active && <Pill color="#fff" bg="#dc2626">● LIVE</Pill>}
          {a.audio_enabled && <Pill color="#7c2d12" bg="#fef3c7"><Icon className="ti ti-volume" /> Audio</Pill>}
        </div>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--ink)', lineHeight: 1.5 }}>{a.message}</p>
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Icon className="ti ti-map-pin" /> {branchNames}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Icon className="ti ti-clock" /> {fmtAlertWindow(a.start_time, a.end_time)}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {a.is_active
          ? <button type="button" style={btnGhost} onClick={onDismiss}><Icon className="ti ti-control-stop" /> Stop</button>
          : (onBroadcast && <button type="button" style={{ ...btnPrimary, background: '#dc2626' }} onClick={onBroadcast}><Icon className="ti ti-radio" /> Broadcast</button>)
        }
        <button type="button" style={btnGhost} onClick={onEdit}><Icon className="ti ti-pencil" /></button>
        <button type="button" style={btnDanger} onClick={onDelete}><Icon className="ti ti-trash" /></button>
      </div>
    </div>
  );
}

function AlertModal({ alert, branches, screens, onClose, onSave }) {
  const [title, setTitle] = useState(alert?.title || '');
  const [message, setMessage] = useState(alert?.message || '');
  const [severity, setSeverity] = useState(alert?.severity || 'warning');
  const [branchIds, setBranchIds] = useState(alert?.branch_ids || []);
  const initialBranchLabels = useMemo(() => {
    const out = {};
    (alert?.branch_ids || []).forEach((id) => {
      const b = branches.find((x) => x.id === id);
      if (b) out[id] = b.name;
    });
    return out;
  }, [alert, branches]);
  const [branchLabels, setBranchLabels] = useState(initialBranchLabels);
  const [audio, setAudio] = useState(!!alert?.audio_enabled);
  const [startTime, setStartTime] = useState(toLocalInputValue(alert?.start_time) || toLocalInputValue(new Date()));
  const [endTime, setEndTime] = useState(toLocalInputValue(alert?.end_time));
  const [active, setActive] = useState(alert?.is_active ?? true);

  function submit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    if (endTime && startTime && new Date(endTime) <= new Date(startTime)) {
      window.alert('End time must be after the start time.');
      return;
    }
    onSave({
      title, message, severity, audio_enabled: audio,
      branch_ids: branchIds, screen_ids: [],
      start_time: fromLocalInputValue(startTime), end_time: fromLocalInputValue(endTime), is_active: active,
    });
  }
  const captionStyle = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, letterSpacing: '.2px', color: '#64748b' };

  return (
    <div
      className="legacy-modal-backdrop active"
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="legacy-modal-dialog" style={{ maxWidth: 600 }} role="dialog" aria-modal="true">
        <div className="legacy-modal-header">
          <h3><Icon className="ti ti-alert" /> {alert ? 'Edit alert' : 'New alert broadcast'}</h3>
          <button type="button" className="legacy-modal-close" onClick={onClose}><Icon className="ti ti-close" /></button>
        </div>
        <form className="batch-modal-form form-modal" onSubmit={submit}>
          <div className="legacy-modal-body">
            <div className="asset-form-section">
              <div className="asset-form-section-title"><Icon className="ti ti-alert" /> Alert Details</div>
              <div className="asset-form-grid">
                <label className="field-cell full-span">
                  <div className="float-field">
                    <input autoFocus className="float-control" placeholder=" " value={title} onChange={(e) => setTitle(e.target.value)} />
                    <span className="float-label">Title <span className="req">*</span></span>
                  </div>
                </label>
                <label className="field-cell full-span">
                  <div className="float-field float-textarea">
                    <textarea className="float-control" rows={3} placeholder=" " value={message} onChange={(e) => setMessage(e.target.value)} />
                    <span className="float-label">Message</span>
                  </div>
                </label>
                <div className="field-cell full-span">
                  <span style={captionStyle}>Severity</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {SEVERITIES.map((s) => {
                      const sel = severity === s.id;
                      return (
                        <button key={s.id} type="button" onClick={() => setSeverity(s.id)}
                          style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: `1px solid ${sel ? s.color : 'var(--line)'}`, background: sel ? s.bg : '#fff', color: sel ? s.color : 'var(--ink)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="asset-form-section">
              <div className="asset-form-section-title"><Icon className="ti ti-map-pin" /> Targeting &amp; Schedule</div>
              <div className="asset-form-grid">
                <div className="field-cell full-span">
                  <span style={captionStyle}>Target branches</span>
                  <LocationMultiPicker
                    valueIds={branchIds}
                    initialLabels={branchLabels}
                    placeholder="Add branches…"
                    onChange={(ids, labels) => { setBranchIds(ids); setBranchLabels(labels); }}
                  />
                  <span className="field-hint">Leave empty to broadcast to all branches.</span>
                </div>
                <label className="field-cell">
                  <div className="float-field float-always">
                    <input type="datetime-local" className="float-control" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                    <span className="float-label">Start</span>
                  </div>
                </label>
                <label className="field-cell">
                  <div className="float-field float-always">
                    <input type="datetime-local" className="float-control" value={endTime} min={startTime || undefined} onChange={(e) => setEndTime(e.target.value)} />
                    <span className="float-label">End</span>
                  </div>
                </label>
              </div>
            </div>

            <div className="asset-form-section">
              <div className="asset-form-section-title"><Icon className="ti ti-settings" /> Options</div>
              <div style={{ display: 'grid', gap: 8 }}>
                <Toggle label="Play siren audio" hint="Loud audio cue accompanies the visual" checked={audio} onChange={setAudio} />
                <Toggle label="Broadcast immediately" hint="Overrides all assigned loops right now" checked={active} onChange={setActive} />
              </div>
            </div>
          </div>
          <div className="legacy-modal-footer">
            <button type="button" className="legacy-btn legacy-btn-default" onClick={onClose}>Cancel</button>
            <button type="submit" className={`legacy-btn ${active ? 'legacy-btn-danger' : 'legacy-btn-success'}`}>
              <Icon className={`ti ${active ? 'ti-alert' : 'ti-check'}`} /> {active ? 'Broadcast' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ───────────────────────── Shared building blocks ────────────────────
function StatTile({ icon, label, value, sub, accent = 'var(--brand)', onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: 'left', background: '#fff', border: '1px solid var(--line)', borderRadius: 14,
        padding: 14, display: 'flex', alignItems: 'center', gap: 12, cursor: onClick ? 'pointer' : 'default',
        width: '100%', font: 'inherit',
      }}>
      <span style={{ width: 40, height: 40, borderRadius: 10, background: `${accent}1a`, color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, flex: '0 0 auto' }}>
        <Icon className={`ti ${icon}`} />
      </span>
      <span style={{ display: 'grid', lineHeight: 1.15, minWidth: 0 }}>
        <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>{value}</span>
        <span style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}{sub ? <span style={{ marginLeft: 6, opacity: .85 }}>· {sub}</span> : null}
        </span>
      </span>
    </button>
  );
}

function Card({ title, icon, children }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        {icon && <Icon className={`ti ${icon}`} style={{ color: 'var(--brand)' }} />}
        <strong style={{ fontSize: 14, color: 'var(--ink)' }}>{title}</strong>
      </div>
      {children}
    </div>
  );
}

function Toolbar({ children }) {
  return <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{children}</div>;
}

function SearchBox({ value, onChange, placeholder }) {
  return (
    <div style={{ position: 'relative' }}>
      <Icon className="ti ti-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: 12 }} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{ ...inputStyle, paddingLeft: 30, width: 240 }} />
    </div>
  );
}

function Pill({ color, bg, children }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: bg, color, padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em' }}>{children}</span>;
}

// Three-dot "kebab" action menu. `items`: [{ label, icon, onClick, danger }].
// The menu is rendered with fixed positioning anchored to the button so it is
// never clipped by ancestor containers with `overflow: hidden` (e.g. tables).
function KebabMenu({ items = [] }) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    function onDown(e) {
      if (btnRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    function reposition() { if (btnRef.current) setRect(btnRef.current.getBoundingClientRect()); }
    reposition();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open]);

  const MENU_WIDTH = 180;

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button ref={btnRef} type="button" title="Actions" onClick={() => setOpen((o) => !o)}
        style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--line)', background: open ? '#f1f5f9' : '#fff', color: 'var(--muted)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
        <Icon className="ti ti-more-alt" />
      </button>
      {open && rect && (
        <div ref={menuRef} style={{ position: 'fixed', top: rect.bottom + 4, left: Math.max(8, rect.right - MENU_WIDTH), width: MENU_WIDTH, background: '#fff', border: '1px solid var(--line)', borderRadius: 10, boxShadow: '0 14px 38px rgba(0,0,0,0.14)', zIndex: 12100, padding: 4, overflow: 'hidden' }}>
          {items.map((it, i) => (
            <button key={i} type="button"
              onClick={() => { setOpen(false); it.onClick?.(); }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', padding: '9px 10px', borderRadius: 7, fontSize: 13, fontWeight: 600, color: it.danger ? '#dc2626' : 'var(--ink)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = it.danger ? '#fef2f2' : '#f1f5f9'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
              <Icon className={`ti ${it.icon}`} style={{ width: 16, textAlign: 'center' }} /> {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }) {
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 8, background: checked ? '#eaf3f5' : '#fff', cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: 2 }} />
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{hint}</div>}
      </div>
    </label>
  );
}

function Field({ label, hint, children }) {
  return (
    <label style={{ display: 'grid', gap: 6 }}>
      <span style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600 }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{hint}</span>}
    </label>
  );
}

function FormActions({ onCancel, submitLabel, submitClass = 'btn-success', disabled }) {
  return (
    <ModalFooter>
      <button type="button" className="btn btn-default" onClick={onCancel}>Cancel</button>
      <button type="submit" className={`btn ${submitClass}`} disabled={disabled}
        style={disabled ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}>{submitLabel}</button>
    </ModalFooter>
  );
}

function ConfirmModal({ title, message, confirmLabel, onCancel, onConfirm }) {
  return (
    <Modal title={title} onClose={onCancel} maxWidth={420} icon="ti-alert" variant="danger">
      <p style={{ margin: 0, color: 'var(--ink)', fontSize: 14, lineHeight: 1.5 }}>{message}</p>
      <ModalFooter>
        <button type="button" className="btn btn-default" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn-danger" onClick={onConfirm}><Icon className="ti ti-trash" /> {confirmLabel}</button>
      </ModalFooter>
    </Modal>
  );
}

function Modal({ title, children, onClose, maxWidth = 520, icon, variant }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="crispr-modal-backdrop active"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="crispr-modal-dialog" style={{ maxWidth }}>
        <div className={`crispr-modal-header${variant ? ` ${variant}-header` : ''}`}>
          <h3>{icon && <Icon className={`ti ${icon}`} />}{title}</h3>
          <button type="button" className="crispr-modal-close" onClick={onClose}><Icon className="ti ti-close" /></button>
        </div>
        <div className="crispr-modal-body">{children}</div>
      </div>
    </div>
  );
}

// Standard modal footer that breaks out of the body padding to sit flush at the
// dialog bottom (matches .crispr-modal-footer styling used across the app).
function ModalFooter({ children, style }) {
  return (
    <div className="crispr-modal-footer" style={{ margin: '24px -24px -24px', ...style }}>
      {children}
    </div>
  );
}

// ─── Location typeahead (paginated) ──────────────────────────────────
// Drives every "branch" picker on this page off the Location API
// (/admin/location/list). Pages 20 at a time, debounced search,
// IntersectionObserver-driven infinite scroll.
const LOC_PAGE_SIZE = 20;

function useLocationSearch(query, open) {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0);

  // Reset on query change (or when the panel opens)
  useEffect(() => {
    if (!open) return;
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
    if (!el) return;
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
      boxShadow: '0 14px 38px rgba(0,0,0,0.12)', zIndex: 1200,
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

// Single-select location/branch picker. value = id (string|null);
// initialLabel = best-effort display string when only id is known.
function LocationPicker({ value, initialLabel, onChange, placeholder = 'Select location…', allowClear = true, disabled = false }) {
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
    if (!open) return;
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

// Multi-select location picker — same dropdown, chip strip below.
function LocationMultiPicker({ valueIds = [], initialLabels = {}, onChange, placeholder = 'Add locations…' }) {
  const [labels, setLabels] = useState(initialLabels);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState(null);
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const dropRef = useRef(null);

  useEffect(() => { setLabels((cur) => ({ ...initialLabels, ...cur })); }, [initialLabels]);

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
    if (!open) return;
    function update() { if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect()); }
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => { window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update); };
  }, [open]);

  const selectedSet = new Set(valueIds);

  function toggle(loc) {
    const next = new Set(valueIds);
    if (next.has(loc.id)) next.delete(loc.id);
    else next.add(loc.id);
    setLabels((cur) => ({ ...cur, [loc.id]: loc.name }));
    onChange(Array.from(next), { ...labels, [loc.id]: loc.name });
  }
  function remove(id) {
    const next = valueIds.filter((x) => x !== id);
    onChange(next, labels);
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'grid', gap: 8 }}>
      <button
        ref={triggerRef} type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ ...inputStyle, width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
      >
        <Icon className="ti ti-search" style={{ color: 'var(--muted)' }} />
        <span style={{ flex: 1, color: 'var(--muted)' }}>{placeholder}</span>
        <Icon className={`ti ${open ? 'ti-chevron-up' : 'ti-chevron-down'}`} style={{ color: 'var(--muted)', fontSize: 12 }} />
      </button>
      {valueIds.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {valueIds.map((id) => (
            <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px 4px 10px', borderRadius: 999, background: '#eaf3f5', color: 'var(--brand)', fontSize: 12, fontWeight: 600 }}>
              {labels[id] || `#${id}`}
              <button type="button" onClick={() => remove(id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--brand)', padding: 0, display: 'inline-flex' }} title="Remove">
                <Icon className="ti ti-close" style={{ fontSize: 12 }} />
              </button>
            </span>
          ))}
        </div>
      )}
      {open && rect && (
        <LocationDropdown
          rect={rect} query={query} setQuery={setQuery}
          items={items} loading={loading} hasMore={hasMore} loadMore={loadMore}
          onPick={toggle} selectedIds={selectedSet} dropRef={dropRef}
          allowClear={false}
        />
      )}
    </div>
  );
}

// ─── Style tokens ─────────────────────────────────────────────────────
const inputStyle  = { padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, color: 'var(--ink)', background: '#fff', outline: 'none' };
const selStyle    = { ...inputStyle, appearance: 'auto' };
const btnPrimary  = { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--brand)', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 };
const btnGhost    = { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', color: 'var(--ink)', border: '1px solid var(--line)', padding: '7px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 12, textDecoration: 'none' };
const btnDanger   = { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', color: 'var(--danger)', border: '1px solid #f3cdc8', padding: '7px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 12 };
const miniBtn     = { background: '#fff', border: '1px solid var(--line)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 11, color: 'var(--ink)' };
const tableStyle  = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const thStyle     = { padding: '10px 18px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid var(--line)', textAlign: 'left', background: '#fbfcfd' };
const tdStyle     = { padding: '12px 18px', verticalAlign: 'middle', color: 'var(--ink)' };
