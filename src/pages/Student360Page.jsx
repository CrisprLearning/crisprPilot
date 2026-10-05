import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import useDebouncedValue from '../hooks/useDebouncedValue';

/**
 * Student 360 — a 360° performance view for a single student.
 *
 * This is a presentation-first dashboard. The analytics surfaced here
 * (day-wise questions, activity map, watch hours, streaks, mock trends)
 * are not yet served by a single API, so the page renders from a derived
 * `student` model. Wire each block to its real endpoint as they land;
 * the chart primitives below accept plain arrays and need no changes.
 */

// ── Mock / derived student model ──────────────────────────────────────────
const STUDENT = {
  name: 'Aarav Sharma',
  id: 'VP-2024-10897',
  avatar: 'https://i.pravatar.cc/160?img=12',
  email: 'aarav.sharma@example.com',
  phone: '+91 98765 43210',
  goal: 'IISER',
  target: 89, // % readiness toward goal
  mentor: {
    name: 'Dr. Kavya Nair',
    role: 'Senior Mentor · Physics',
    avatar: 'https://i.pravatar.cc/80?img=47',
    since: 'Apr 2024',
  },
  batch: {
    name: 'IAT Crash 2025 — Alpha',
    mode: 'Offline',
    center: 'Kochi · MG Road',
    strength: 48,
    rank: 6,
    startedOn: '12 Mar 2024',
  },
  prepJourney: [
    { label: 'Foundation', done: true },
    { label: 'Concept Mastery', done: true },
    { label: 'Practice & PYQ', done: true },
    { label: 'Mock Phase', done: false, current: true },
    { label: 'Final Revision', done: false },
  ],
  stats: {
    questionsSolved: 8420,
    pyqSolved: 1240,
    watchHours: 312,
    currentStreak: 18,
    bestStreak: 41,
  },
  courses: [
    { name: 'IAT Complete Physics', progress: 92, type: 'course' },
    { name: 'Chemistry Masterclass', progress: 78, type: 'course' },
    { name: 'Biology Crash Course', progress: 64, type: 'course' },
    { name: 'Mathematics Foundations', progress: 88, type: 'course' },
    { name: 'IAT Grand Test Series', progress: 56, type: 'series' },
    { name: 'Weekly PYQ Series', progress: 71, type: 'series' },
  ],
  // Last 14 days of questions solved
  questionsDaily: [42, 55, 38, 61, 70, 24, 0, 48, 66, 72, 58, 80, 63, 45],
  // Offline classes attended vs scheduled (last 8 weeks)
  classesAttended: [
    { week: 'W1', attended: 5, total: 6 },
    { week: 'W2', attended: 6, total: 6 },
    { week: 'W3', attended: 4, total: 6 },
    { week: 'W4', attended: 6, total: 6 },
    { week: 'W5', attended: 5, total: 5 },
    { week: 'W6', attended: 6, total: 6 },
    { week: 'W7', attended: 3, total: 6 },
    { week: 'W8', attended: 6, total: 6 },
  ],
  // Mock test scores (last 7 tests), out of 100 percentile
  mockTests: [
    { name: 'Mock 01', percentile: 62 },
    { name: 'Mock 02', percentile: 68 },
    { name: 'Mock 03', percentile: 59 },
    { name: 'Mock 04', percentile: 74 },
    { name: 'Mock 05', percentile: 81 },
    { name: 'Mock 06', percentile: 78 },
    { name: 'Mock 07', percentile: 88 },
  ],
};

// 12 weeks × 7 days activity intensity (0–4). Deterministic pseudo-data.
const ACTIVITY = Array.from({ length: 12 }, (_, w) =>
  Array.from({ length: 7 }, (_, d) => {
    const v = (w * 7 + d * 3 + (w % 3) + (d % 4)) % 11;
    if (v > 8) return 4;
    if (v > 6) return 3;
    if (v > 4) return 2;
    if (v > 2) return 1;
    return 0;
  })
);

// ── Small primitives ───────────────────────────────────────────────────────

// Fires once when the element scrolls into view, so charts animate on entry.
// Under reduced-motion (or no IntersectionObserver) it reports "in view"
// immediately and the CSS disables the transitions — final state, no motion.
function useInView(options) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !('IntersectionObserver' in window)) { setInView(true); return; }
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setInView(true); io.disconnect(); } },
      options || { threshold: 0.25 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, inView];
}

function Card({ title, icon, action, children, className = '', style }) {
  return (
    <section className={`s360-card ${className}`} style={style}>
      {(title || action) && (
        <header className="s360-card-head">
          <h3>
            {icon && <i className={`fa ${icon}`} />}
            {title}
          </h3>
          {action}
        </header>
      )}
      <div className="s360-card-body">{children}</div>
    </section>
  );
}

function Donut({ value, size = 150, stroke = 14, label, sub }) {
  const [ref, inView] = useInView();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = inView ? c - (value / 100) * c : c;
  return (
    <>
      <div className="s360-donut" ref={ref} style={{ width: size, height: size }}>
        <svg width={size} height={size}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
          <circle
            className="s360-donut-prog"
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="url(#s360grad)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
          <defs>
            <linearGradient id="s360grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#00a8cc" />
              <stop offset="100%" stopColor="#006073" />
            </linearGradient>
          </defs>
        </svg>
        <div className="s360-donut-center">
          <strong>{value}%</strong>
          {label && <span>{label}</span>}
        </div>
      </div>
      {sub && <p className="s360-donut-sub">{sub}</p>}
    </>
  );
}

function BarChart({ data, labels, height = 160, color = '#006073' }) {
  const [ref, inView] = useInView();
  const max = Math.max(...data, 1);
  return (
    <div className="s360-bars" ref={ref} style={{ height }}>
      {data.map((v, i) => (
        <div className="s360-bar-col" key={i}>
          <div className="s360-bar-track">
            <div
              className="s360-bar-fill"
              style={{
                height: inView ? `${(v / max) * 100}%` : '0%',
                transitionDelay: `${i * 0.04}s`,
                background: color,
                '--bar': color,
              }}
              title={`${v}`}
            >
              <span className="s360-bar-val">{v}</span>
            </div>
          </div>
          {labels && <span className="s360-bar-label">{labels[i]}</span>}
        </div>
      ))}
    </div>
  );
}

function LineChart({ points, height = 180, width = 460 }) {
  const max = Math.max(...points.map((p) => p.percentile));
  const min = Math.min(...points.map((p) => p.percentile));
  const range = Math.max(max - min, 1);
  const pad = 28;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const coords = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * innerW;
    const y = pad + innerH - ((p.percentile - min) / range) * innerH;
    return [x, y];
  });
  const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c[0]},${c[1]}`).join(' ');
  const area = `${path} L${coords[coords.length - 1][0]},${pad + innerH} L${coords[0][0]},${pad + innerH} Z`;
  const [ref, inView] = useInView();
  return (
    <svg
      ref={ref}
      className={`s360-line${inView ? ' s360-line-in' : ''}`}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="s360area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00a8cc" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#00a8cc" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className="s360-line-area" d={area} fill="url(#s360area)" />
      <path className="s360-line-path" d={path} pathLength="1" fill="none" stroke="#006073" strokeWidth="2.5" strokeLinejoin="round" />
      {coords.map((c, i) => (
        <g className="s360-line-pt" style={{ animationDelay: `${0.55 + i * 0.08}s` }} key={i}>
          <circle cx={c[0]} cy={c[1]} r="4.5" fill="#fff" stroke="#006073" strokeWidth="2.5" />
          <text x={c[0]} y={c[1] - 12} textAnchor="middle" className="s360-line-val">
            {points[i].percentile}
          </text>
          <text x={c[0]} y={height - 8} textAnchor="middle" className="s360-line-label">
            {points[i].name.replace('Mock ', 'M')}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ── Student typeahead ───────────────────────────────────────────────────────
// Searches the live candidate list (debounced) and emits the picked student.
function StudentSearch({ onSelect }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const debounced = useDebouncedValue(query);
  const boxRef = useRef(null);

  // Close on outside click.
  useEffect(() => {
    function onDown(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // Fetch on debounced query.
  useEffect(() => {
    const q = debounced.trim();
    if (q.length < 2) { setResults([]); setLoading(false); setError(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(false);
    api
      .get('/admin/people/candidate/list', { params: { searchKey: q, page: 1, size: 8, sortBy: 'name' } })
      .then((res) => {
        if (cancelled) return;
        const list = res?.data?.data || [];
        setResults(
          list.map((c) => ({
            id: c.candidateKey || c.id,
            name: c.name,
            email: c.email,
            phone: c.communicationMobile || c.registeredMobile || c.mobile,
            avatar: c.photo,
          }))
        );
        setHighlight(-1);
      })
      .catch(() => { if (!cancelled) { setResults([]); setError(true); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [debounced]);

  function pick(student) {
    onSelect(student);
    setQuery(student.name || '');
    setOpen(false);
  }

  function onKeyDown(e) {
    if (!open || !results.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => Math.min(h + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter' && highlight >= 0) { e.preventDefault(); pick(results[highlight]); }
    else if (e.key === 'Escape') { setOpen(false); }
  }

  const showDropdown = open && debounced.trim().length >= 2;

  return (
    <div className="s360-search" ref={boxRef}>
      <i className="fa fa-search s360-search-icon" />
      <input
        type="text"
        className="s360-search-input"
        placeholder="Search a student by name, email or phone…"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {query && (
        <button type="button" className="s360-search-clear" onClick={() => { setQuery(''); setResults([]); }}>
          <i className="fa fa-times" />
        </button>
      )}
      {showDropdown && (
        <div className="s360-search-menu">
          {loading && <div className="s360-search-state"><i className="fa fa-spinner fa-spin" /> Searching…</div>}
          {!loading && error && <div className="s360-search-state">Couldn't reach the server. Try again.</div>}
          {!loading && !error && results.length === 0 && (
            <div className="s360-search-state">No students match “{debounced.trim()}”.</div>
          )}
          {!loading && results.map((r, i) => (
            <button
              type="button"
              key={r.id}
              className={`s360-search-item${i === highlight ? ' active' : ''}`}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => pick(r)}
            >
              {r.avatar
                ? <img src={r.avatar} alt="" className="s360-search-avatar" />
                : <span className="s360-search-avatar s360-search-avatar-fallback">{(r.name || '?').charAt(0).toUpperCase()}</span>}
              <span className="s360-search-meta">
                <strong>{r.name || 'Unnamed'}</strong>
                <small>{r.email || r.phone || r.id}</small>
              </span>
              <span className="s360-search-pick">View <i className="fa fa-arrow-right" /></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function Student360Page() {
  const [range, setRange] = useState('14d');
  const [photoOpen, setPhotoOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('id');

  // Live profile fields for the selected student. Analytics blocks below still
  // render from the mock model until their endpoints are wired; the hero and
  // identity reflect the real student behind ?id.
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // When a student is picked from the typeahead, push ?id and prime the profile
  // immediately from the list row (no extra round-trip).
  const handleSelect = useCallback((student) => {
    setProfile(student);
    setSearchParams((sp) => {
      const next = new URLSearchParams(sp);
      next.set('id', String(student.id));
      return next;
    }, { replace: false });
  }, [setSearchParams]);

  // On load / direct link with ?id (and no primed profile for that id), fetch it.
  useEffect(() => {
    if (!selectedId) { setProfile(null); return; }
    if (profile && String(profile.id) === String(selectedId)) return;
    let cancelled = false;
    setProfileLoading(true);
    api
      .get('/admin/people/candidate/profile', { params: { id: selectedId } })
      .then((res) => {
        if (cancelled) return;
        const d = res?.data?.data || res?.data || {};
        setProfile({
          id: selectedId,
          name: d.name || d.candidateName,
          email: d.email,
          phone: d.communicationMobile || d.registeredMobile || d.mobile,
          avatar: d.photo || d.image,
        });
      })
      .catch(() => { if (!cancelled) setProfile({ id: selectedId }); })
      .finally(() => { if (!cancelled) setProfileLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Merge the live identity over the mock model so analytics keep rendering.
  const s = useMemo(() => ({
    ...STUDENT,
    id: profile?.id || STUDENT.id,
    name: profile?.name || STUDENT.name,
    email: profile?.email || STUDENT.email,
    phone: profile?.phone || STUDENT.phone,
    avatar: profile?.avatar || STUDENT.avatar,
  }), [profile]);

  const avgMock = useMemo(
    () => Math.round(s.mockTests.reduce((a, b) => a + b.percentile, 0) / s.mockTests.length),
    [s.mockTests]
  );
  const lastMock = s.mockTests[s.mockTests.length - 1].percentile;
  const prevMock = s.mockTests[s.mockTests.length - 2].percentile;
  const mockDelta = lastMock - prevMock;

  const totalAttended = s.classesAttended.reduce((a, b) => a + b.attended, 0);
  const totalClasses = s.classesAttended.reduce((a, b) => a + b.total, 0);
  const attendancePct = Math.round((totalAttended / totalClasses) * 100);

  const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  // Subtle reveal-on-scroll: fade + lift each tile as it enters the viewport.
  useEffect(() => {
    const els = document.querySelectorAll(
      '.student360-page .s360-card, .student360-page .s360-kpi'
    );
    if (!els.length) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('s360-in'));
      return;
    }
    els.forEach((el) => el.classList.add('s360-reveal'));
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('s360-in');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="student360-page">
      {/* Header */}
      <div className="s360-pagehead">
        <div className="s360-pagehead-title">
          <span className="s360-pagehead-icon"><i className="fa fa-user-circle-o" /></span>
          <div>
            <h2>Student 360</h2>
            <p>A complete view of the student's preparation, performance and engagement.</p>
          </div>
        </div>
        <div className="s360-pagehead-actions">
          <StudentSearch onSelect={handleSelect} />
          <button type="button" className="s360-btn-ghost" onClick={() => window.print()}>
            <i className="fa fa-download" /> Export report
          </button>
        </div>
      </div>

      {/* Row 1 — Profile hero + headline stats */}
      <div className="s360-grid s360-grid-hero">
        <Card className={`s360-hero${profileLoading ? ' s360-hero-loading' : ''}`}>
          <div className="s360-hero-top">
            {s.avatar ? (
              <button
                type="button"
                className="s360-avatar-btn"
                onClick={() => setPhotoOpen(true)}
                title="View photo"
                aria-label={`View ${s.name}'s photo`}
              >
                <img className="s360-avatar" src={s.avatar} alt={s.name} />
                <span className="s360-avatar-zoom"><i className="fa fa-search-plus" /></span>
              </button>
            ) : (
              <span className="s360-avatar s360-avatar-empty">{(s.name || '?').charAt(0).toUpperCase()}</span>
            )}
            <div className="s360-hero-id">
              <h3>{s.name} {profileLoading && <i className="fa fa-spinner fa-spin s360-hero-spin" />}</h3>
              <span className="s360-id-chip">{s.id}</span>
              <ul className="s360-contact">
                <li><i className="fa fa-phone" /> {s.phone}</li>
              </ul>
            </div>
            <div className="s360-goal-chip">
              <span>Goal</span>
              <strong>{s.goal}</strong>
            </div>
          </div>

          {/* Prep Journey */}
          <div className="s360-journey">
            <div className="s360-journey-head">
              <h4><i className="fa fa-flag-checkered" /> Prep Journey: IAT 2026</h4>
              <span className="s360-journey-mentor">
                <img src={s.mentor.avatar} alt={s.mentor.name} className="s360-journey-dp" /> Mentor:{' '}
                <Link to="/mentor-profiles?id=20425492429424524" className="s360-mentor-link">
                  {s.mentor.name}
                </Link>
                <span className="s360-journey-sep">·</span>
                <img src="https://i.pravatar.cc/80?img=53" alt="Ajeesh Nair" className="s360-journey-dp" /> Parent:{' '}
                <Link to="/parent-profiles?id=20425492429424524" className="s360-mentor-link">
                  Ajeesh Nair
                </Link>
                <span className="s360-journey-sep">·</span>
                <i className="fa fa-cubes s360-journey-ic" /> Batch: <strong>Offline O1</strong>
              </span>
            </div>
          </div>
        </Card>

        {/* Overall progress toward goal */}
        <Card className="s360-progress-card">
          <Donut value={s.target} label={`close to`} sub={`Readiness toward ${s.goal}`} />
          <p className="s360-progress-note">
            Based on Prep Journey, mock trends &amp; syllabus coverage.
          </p>
        </Card>
      </div>

      {/* Row 2 — Headline KPI tiles */}
      <div className="s360-kpis">
        <KpiTile icon="fa-pencil-square-o" tint="#006073" value={s.stats.questionsSolved.toLocaleString()} label="Questions Solved" />
        <KpiTile icon="fa-history" tint="#7367f0" value={s.stats.pyqSolved.toLocaleString()} label="PYQ Solved" />
        <KpiTile icon="fa-play-circle-o" tint="#00a8cc" value={`${s.stats.watchHours} hrs`} label="Course Watch Hours" />
        <KpiTile icon="fa-fire" tint="#ff9f43" value={`${s.stats.currentStreak} days`} label="Current Streak" sub={`Best ${s.stats.bestStreak}d`} />
        <KpiTile icon="fa-line-chart" tint="#28c76f" value={`${avgMock}%`} label="Avg Mock Percentile" />
      </div>

      {/* Row 3 — Batch + Courses */}
      <div className="s360-grid s360-grid-2">
        <Card title="Batch Summary" icon="fa-layout-grid2 fa fa-cubes">
          <div className="s360-batch">
            <div className="s360-batch-name">
              <strong>{s.batch.name}</strong>
              <span className={`s360-mode-badge ${s.batch.mode.toLowerCase()}`}>{s.batch.mode}</span>
            </div>
            <div className="s360-batch-grid">
              <div><span>Center</span><strong>{s.batch.center}</strong></div>
              <div><span>Batch Strength</span><strong>{s.batch.strength}</strong></div>
              <div><span>Rank in Batch</span><strong>#{s.batch.rank}</strong></div>
              <div><span>Enrolled</span><strong>{s.batch.startedOn}</strong></div>
            </div>
          </div>
        </Card>

        <Card title="Courses & Test Series" icon="fa-graduation-cap" action={<span className="s360-count-chip">{s.courses.length} enrolled</span>}>
          <ul className="s360-courses">
            {s.courses.map((c, i) => (
              <li key={i}>
                <span className={`s360-course-icon ${c.type}`}>
                  <i className={`fa ${c.type === 'series' ? 'fa-tasks' : 'fa-book'}`} />
                </span>
                <div className="s360-course-meta">
                  <span className="s360-course-name">{c.name}</span>
                  <div className="s360-progress-bar">
                    <div style={{ width: `${c.progress}%` }} />
                  </div>
                </div>
                <span className="s360-course-pct">{c.progress}%</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Row 4 — Questions daily + Mock performance */}
      <div className="s360-grid s360-grid-2">
        <Card
          title="Questions Solved — Day-wise"
          icon="fa-bar-chart"
          action={
            <div className="s360-seg">
              {['14d', '30d'].map((r) => (
                <button key={r} className={range === r ? 'active' : ''} onClick={() => setRange(r)}>{r}</button>
              ))}
            </div>
          }
        >
          <BarChart
            data={s.questionsDaily}
            labels={s.questionsDaily.map((_, i) => `${i + 1}`)}
          />
        </Card>

        <Card
          title="Mock Test Performance"
          icon="fa-trophy"
          action={
            <span className={`s360-delta ${mockDelta >= 0 ? 'up' : 'down'}`}>
              <i className={`fa fa-arrow-${mockDelta >= 0 ? 'up' : 'down'}`} /> {Math.abs(mockDelta)}%
            </span>
          }
        >
          <LineChart points={s.mockTests} />
          <div className="s360-mock-foot">
            <span>Latest: <strong>{lastMock}%ile</strong></span>
            <span>Best: <strong>{Math.max(...s.mockTests.map((m) => m.percentile))}%ile</strong></span>
            <span>Avg: <strong>{avgMock}%ile</strong></span>
          </div>
        </Card>
      </div>

      {/* Row 5 — Offline classes + Streak */}
      <div className="s360-grid s360-grid-2">
        <Card
          title="Offline Classes Attended"
          icon="fa-check-square-o"
          action={<span className="s360-count-chip">{attendancePct}% overall</span>}
        >
          <div className="s360-attend">
            <BarChart
              data={s.classesAttended.map((w) => w.attended)}
              labels={s.classesAttended.map((w) => w.week)}
              color="#28c76f"
              height={150}
            />
            <p className="s360-attend-note">
              <strong>{totalAttended}</strong> of {totalClasses} sessions attended over the last 8 weeks.
            </p>
          </div>
        </Card>

        <Card title="Online Streaks" icon="fa-fire">
          <div className="s360-streak">
            <div className="s360-streak-big">
              <i className="fa fa-fire" />
              <div>
                <strong>{s.stats.currentStreak}</strong>
                <span>day current streak</span>
              </div>
            </div>
            <div className="s360-streak-week">
              {dayLabels.map((d, i) => (
                <div key={i} className={`s360-streak-day${i < 5 ? ' lit' : ''}`}>
                  <span className="s360-streak-flame"><i className="fa fa-fire" /></span>
                  <span className="s360-streak-dl">{d}</span>
                </div>
              ))}
            </div>
            <div className="s360-streak-foot">
              <span>Best streak <strong>{s.stats.bestStreak} days</strong></span>
              <span>Avg watch <strong>1.8 hrs/day</strong></span>
            </div>
          </div>
        </Card>
      </div>

      {/* Row 6 — Activity map */}
      <Card title="Overall Activity Map" icon="fa-calendar" action={<span className="s360-muted">Last 12 weeks</span>}>
        <div className="s360-heatmap-wrap">
          <div className="s360-heatmap">
            {ACTIVITY.map((week, wi) => (
              <div className="s360-heat-week" key={wi}>
                {week.map((lvl, di) => (
                  <span key={di} className={`s360-heat-cell lvl-${lvl}`} title={`Level ${lvl}`} />
                ))}
              </div>
            ))}
          </div>
          <div className="s360-heat-legend">
            <span>Less</span>
            {[0, 1, 2, 3, 4].map((l) => <span key={l} className={`s360-heat-cell lvl-${l}`} />)}
            <span>More</span>
          </div>
        </div>
      </Card>

      {/* Photo lightbox */}
      {photoOpen && s.avatar && (
        <PhotoLightbox src={s.avatar} name={s.name} onClose={() => setPhotoOpen(false)} />
      )}
    </div>
  );
}

function PhotoLightbox({ src, name, onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="s360-lightbox" onClick={onClose} role="dialog" aria-modal="true" aria-label={`${name} photo`}>
      <button type="button" className="s360-lightbox-close" onClick={onClose} aria-label="Close">
        <i className="fa fa-times" />
      </button>
      <figure className="s360-lightbox-figure" onClick={(e) => e.stopPropagation()}>
        <img src={src} alt={name} />
        {name && <figcaption>{name}</figcaption>}
      </figure>
    </div>
  );
}

function KpiTile({ icon, tint, value, label, sub }) {
  return (
    <div className="s360-kpi">
      <span className="s360-kpi-icon" style={{ '--kpi-bg': `${tint}1a`, '--kpi-fg': tint, background: `${tint}1a`, color: tint }}>
        <i className={`fa ${icon}`} />
      </span>
      <div className="s360-kpi-meta">
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
      {sub && <span className="s360-kpi-sub">{sub}</span>}
    </div>
  );
}
