import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import ToastRegion from '../components/ToastRegion';
import { PreparationJourneys } from '../lib/preparationJourneysApi';
import Icon from '../components/Icon';

/* ── Seed data: app versions published so far ─────────────────────────── */
const SEED_RELEASES = [
  {
    id: 'r5',
    version: '2.4.0',
    releaseDate: '2026-05-28',
    mandatory: false,
    summary: '<p>Introduced <strong>offline mode</strong> for downloaded lessons and improved video buffering on low-bandwidth networks.</p><ul><li>Offline lesson playback</li><li>Adaptive streaming</li></ul>',
  },
  {
    id: 'r4',
    version: '2.3.1',
    releaseDate: '2026-04-15',
    mandatory: true,
    summary: '<p><strong>Critical security patch.</strong> All users must update to continue using the app.</p><p>Fixed a session-token vulnerability and hardened login.</p>',
  },
  {
    id: 'r3',
    version: '2.3.0',
    releaseDate: '2026-03-03',
    mandatory: false,
    summary: '<p>New <em>Live Class</em> experience with in-app polls and quizzes, plus a redesigned dashboard.</p>',
  },
  {
    id: 'r2',
    version: '2.2.0',
    releaseDate: '2026-01-20',
    mandatory: false,
    summary: '<p>Performance improvements and bug fixes across the practice module.</p>',
  },
  {
    id: 'r1',
    version: '2.1.0',
    releaseDate: '2025-12-05',
    mandatory: true,
    summary: '<p>Migrated to the new authentication backend. Update required.</p>',
  },
];

/* ── Seed data: home screen slider items ──────────────────────────────── */
const SEED_SLIDERS = [
  { id: 's1', line1: 'Crack NEET 2026', line2: 'Live classes by top rankers', image: 'https://crisprlearning.com/wp-content/uploads/2026/04/banner-offline-classroom-program-2027.jpg' },
  { id: 's2', line1: 'New Test Series', line2: 'Practice with 10,000+ questions', image: 'https://crisprlearning.com/wp-content/uploads/2026/04/banner-offline-classroom-program-2027.jpg' },
  { id: 's3', line1: 'Refer & Earn', line2: 'Get ₹500 for every friend', image: 'https://crisprlearning.com/wp-content/uploads/2026/04/banner-offline-classroom-program-2027.jpg' },
];

/* ── Seed data: supported login country codes ─────────────────────────── */
const OTP_MODES = ['SMS', 'Email', 'WhatsApp'];
const SEED_LOGIN_METHODS = [
  { id: 'l1', country: 'India', code: '+91', flag: 'https://img.icons8.com/color/48/india-circular.png', defaultMode: 'SMS', enabled: true },
  { id: 'l2', country: 'United States', code: '+1', flag: 'https://img.icons8.com/color/48/usa-circular.png', defaultMode: 'Email', enabled: true },
  { id: 'l3', country: 'United Arab Emirates', code: '+971', flag: 'https://img.icons8.com/color/48/united-arab-emirates-circular.png', defaultMode: 'WhatsApp', enabled: true },
  { id: 'l4', country: 'United Kingdom', code: '+44', flag: 'https://img.icons8.com/color/48/great-britain-circular.png', defaultMode: 'Email', enabled: false },
  { id: 'l5', country: 'Nepal', code: '+977', flag: 'https://img.icons8.com/color/48/nepal-circular.png', defaultMode: 'SMS', enabled: true },
];

/* ── Seed data: preparation journeys ──────────────────────────────────── */
const JOURNEY_STATUSES = ['Active', 'Completed'];
const JOURNEY_TYPES = ['IAT', 'NEST'];
const JOURNEY_NICKNAMES = { IAT: 'IISER', NEST: 'NISER' };

const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const COUNTRY_CODE_PATTERN = /^\+\d{1,4}$/;
const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];

function getPageNumbers(currentPage, totalPages) {
  const out = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i += 1) out.push(i);
  } else if (currentPage <= 4) {
    out.push(1, 2, 3, 4, 5, '...', totalPages);
  } else if (currentPage >= totalPages - 3) {
    out.push(1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
  } else {
    out.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages);
  }
  return out;
}

function formatReleaseDate(iso) {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const day = d.getDate();
  const month = d.toLocaleString('en-US', { month: 'short' });
  return `${day} ${month}, ${d.getFullYear()}`;
}

function openDatePicker(event) {
  if (event.type === 'keydown') {
    if (event.key === 'Tab') return; // keep keyboard navigation working
    event.preventDefault(); // block manual text entry into the segments
  }
  try {
    event.currentTarget.showPicker?.();
  } catch (_) {
    // showPicker throws if already open or unsupported — safe to ignore.
  }
}

function formatExamDate(iso) {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
}

function formatExamMonth(iso) {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const month = d.toLocaleString('en-US', { month: 'long' });
  return `${month}, ${d.getFullYear()}`;
}

/* ── Minimal rich-text editor (contentEditable + execCommand) ─────────── */
function RichTextEditor({ valueRef, initialHtml = '' }) {
  const editorRef = useRef(null);

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = initialHtml;
      valueRef.current = initialHtml;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function exec(command, arg) {
    document.execCommand(command, false, arg);
    editorRef.current?.focus();
    if (editorRef.current) valueRef.current = editorRef.current.innerHTML;
  }

  // Themify Icons has no bold/italic glyphs, so those two render as styled
  // letter glyphs (B / I) instead of an icon font.
  const tools = [
    { cmd: 'bold', label: 'B', title: 'Bold', labelStyle: { fontWeight: 800 } },
    { cmd: 'italic', label: 'I', title: 'Italic', labelStyle: { fontStyle: 'italic', fontFamily: 'Georgia, "Times New Roman", serif' } },
    { cmd: 'underline', icon: 'ti-underline', title: 'Underline' },
    { cmd: 'insertUnorderedList', icon: 'ti-list', title: 'Bulleted list' },
    { cmd: 'insertOrderedList', icon: 'ti-menu-alt', title: 'Numbered list' },
  ];

  return (
    <div className="mas-rte">
      <div className="mas-rte-toolbar">
        {tools.map((t) => (
          <button key={t.cmd} type="button" title={t.title} onMouseDown={(e) => { e.preventDefault(); exec(t.cmd); }}>
            {t.icon ? <Icon className={`ti ${t.icon}`} /> : <span style={t.labelStyle}>{t.label}</span>}
          </button>
        ))}
        <button
          type="button"
          title="Insert link"
          onMouseDown={(e) => {
            e.preventDefault();
            const url = window.prompt('Enter URL');
            if (url) exec('createLink', url);
          }}
        >
          <Icon className="ti ti-link" />
        </button>
      </div>
      <div
        ref={editorRef}
        className="mas-rte-area"
        contentEditable
        suppressContentEditableWarning
        onInput={() => { if (editorRef.current) valueRef.current = editorRef.current.innerHTML; }}
        data-placeholder="Write a detailed release summary…"
      />
    </div>
  );
}

export default function MobileAppSettingsPage() {
  const [releases, setReleases] = useState(SEED_RELEASES);
  const [searchQuery, setSearchQuery] = useState('');
  const [toasts, setToasts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const t = window.setTimeout(() => setIsLoading(false), 700);
    return () => window.clearTimeout(t);
  }, []);

  // Minimum supported version (force-update threshold)
  const [minVersion, setMinVersion] = useState('2.0.1');
  const [minMenuOpen, setMinMenuOpen] = useState(false);

  // Published Versions row action menu
  const [activeRelMenu, setActiveRelMenu] = useState(null);

  // Published Versions pagination
  const [relPage, setRelPage] = useState(1);
  const [relPageSize, setRelPageSize] = useState(5);

  // Add Release modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [formVersion, setFormVersion] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formMandatory, setFormMandatory] = useState(false);
  const [versionError, setVersionError] = useState('');
  const summaryRef = useRef('');

  // View summary modal
  const [viewRelease, setViewRelease] = useState(null);
  const [confirmDeleteRelease, setConfirmDeleteRelease] = useState(null);

  // Home screen sliders
  const [sliders, setSliders] = useState(SEED_SLIDERS);
  const [showSliderModal, setShowSliderModal] = useState(false);
  const [sliderLine1, setSliderLine1] = useState('');
  const [sliderLine2, setSliderLine2] = useState('');
  const [sliderImage, setSliderImage] = useState('');
  const [editingSliderId, setEditingSliderId] = useState(null);
  const [activeSliderMenu, setActiveSliderMenu] = useState(null);
  const [sliderIndex, setSliderIndex] = useState(0);
  const [confirmDeleteSlider, setConfirmDeleteSlider] = useState(null);

  // Keep the active slide index within bounds when sliders change
  useEffect(() => {
    setSliderIndex((i) => Math.min(i, Math.max(0, sliders.length - 1)));
  }, [sliders.length]);

  // Login methods
  const [loginMethods, setLoginMethods] = useState(SEED_LOGIN_METHODS);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginCountry, setLoginCountry] = useState('');
  const [loginCode, setLoginCode] = useState('');
  const [loginFlag, setLoginFlag] = useState('');
  const [loginMode, setLoginMode] = useState('SMS');
  const [loginEnabled, setLoginEnabled] = useState(true);
  const [loginCodeError, setLoginCodeError] = useState('');
  const [editingLoginId, setEditingLoginId] = useState(null);
  const [activeLoginMenu, setActiveLoginMenu] = useState(null);
  const [confirmDeleteLogin, setConfirmDeleteLogin] = useState(null);

  // Preparation Journeys
  const [journeys, setJourneys] = useState([]);
  const [journeysLoading, setJourneysLoading] = useState(true);
  const [journeySaving, setJourneySaving] = useState(false);
  const [journeyFilter, setJourneyFilter] = useState('active'); // 'active' | 'all' | 'completed'
  const [showJourneyModal, setShowJourneyModal] = useState(false);
  const [journeyName, setJourneyName] = useState('');
  const [journeyYear, setJourneyYear] = useState('');
  const [journeyNick, setJourneyNick] = useState('');
  const [journeyExamDate, setJourneyExamDate] = useState('');
  const [journeyDatesUnsure, setJourneyDatesUnsure] = useState(false);
  const [journeyStatus, setJourneyStatus] = useState('Active');
  const [editingJourneyId, setEditingJourneyId] = useState(null);
  const [activeJourneyMenu, setActiveJourneyMenu] = useState(null);

  useEffect(() => {
    const close = () => { setActiveLoginMenu(null); setActiveSliderMenu(null); setMinMenuOpen(false); setActiveRelMenu(null); setActiveJourneyMenu(null); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  function showToast(type, title, message) {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, type, title, message }]);
    window.setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 4000);
  }

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return releases;
    return releases.filter((r) => r.version.toLowerCase().includes(q));
  }, [releases, searchQuery]);

  // Reset to first page whenever the result set or page size changes
  useEffect(() => { setRelPage(1); }, [searchQuery, relPageSize]);

  const relTotalPages = Math.max(1, Math.ceil(filtered.length / relPageSize));
  const relSafePage = Math.min(relPage, relTotalPages);
  const relShowingStart = filtered.length === 0 ? 0 : (relSafePage - 1) * relPageSize + 1;
  const relShowingEnd = Math.min(relSafePage * relPageSize, filtered.length);
  const pagedReleases = filtered.slice((relSafePage - 1) * relPageSize, relSafePage * relPageSize);

  function openAddModal() {
    setFormVersion('');
    setFormDate('');
    setFormMandatory(false);
    setVersionError('');
    summaryRef.current = '';
    setShowAddModal(true);
  }

  function handleVersionChange(value) {
    setFormVersion(value);
    if (value && !VERSION_PATTERN.test(value.trim())) {
      setVersionError('Use the format *.*.* (e.g. 2.0.1)');
    } else {
      setVersionError('');
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    const version = formVersion.trim();
    if (!VERSION_PATTERN.test(version)) {
      setVersionError('Use the format *.*.* (e.g. 2.0.1)');
      return;
    }
    if (releases.some((r) => r.version === version)) {
      setVersionError('This release version already exists.');
      return;
    }
    if (!formDate) {
      showToast('error', 'Validation Error', 'Please select a release date.');
      return;
    }
    const newRelease = {
      id: `r${Date.now()}`,
      version,
      releaseDate: formDate,
      mandatory: formMandatory,
      summary: summaryRef.current || '',
    };
    setReleases((current) => [newRelease, ...current]);
    setShowAddModal(false);
    showToast('success', 'Release Added', `Version ${version} has been published.`);
  }

  /* ── Home screen sliders ── */
  function openSliderModal(slider = null) {
    setEditingSliderId(slider ? slider.id : null);
    setSliderLine1(slider ? slider.line1 : '');
    setSliderLine2(slider ? slider.line2 : '');
    setSliderImage(slider ? slider.image : '');
    setShowSliderModal(true);
  }

  function handleSliderSubmit(event) {
    event.preventDefault();
    if (!sliderLine1.trim()) {
      showToast('error', 'Validation Error', 'Line 1 is required.');
      return;
    }
    if (!sliderImage.trim()) {
      showToast('error', 'Validation Error', 'Image CDN URL is required.');
      return;
    }
    const data = {
      line1: sliderLine1.trim(),
      line2: sliderLine2.trim(),
      image: sliderImage.trim(),
    };
    if (editingSliderId) {
      setSliders((current) => current.map((s) => (s.id === editingSliderId ? { ...s, ...data } : s)));
      setShowSliderModal(false);
      showToast('success', 'Slider Updated', 'The home screen slider has been updated.');
    } else {
      setSliders((current) => [...current, { id: `s${Date.now()}`, ...data }]);
      setShowSliderModal(false);
      showToast('success', 'Slider Added', 'A new home screen slider has been added.');
    }
  }

  function removeSlider(slider) {
    setSliders((current) => current.filter((s) => s.id !== slider.id));
    showToast('success', 'Slider Removed', 'The slider has been removed.');
  }

  function deleteRelease(release) {
    setReleases((current) => current.filter((r) => r.id !== release.id));
    showToast('success', 'Release Deleted', `Version ${release.version} has been removed.`);
  }

  /* ── Login methods ── */
  function openLoginModal(method = null) {
    setEditingLoginId(method ? method.id : null);
    setLoginCountry(method ? method.country : '');
    setLoginCode(method ? method.code : '');
    setLoginFlag(method ? method.flag || '' : '');
    setLoginMode(method ? method.defaultMode : 'SMS');
    setLoginEnabled(method ? method.enabled : true);
    setLoginCodeError('');
    setShowLoginModal(true);
  }

  function handleLoginCodeChange(value) {
    setLoginCode(value);
    if (value && !COUNTRY_CODE_PATTERN.test(value.trim())) {
      setLoginCodeError('Use the format +<code> (e.g. +91)');
    } else {
      setLoginCodeError('');
    }
  }

  function handleLoginSubmit(event) {
    event.preventDefault();
    if (!loginCountry.trim()) {
      showToast('error', 'Validation Error', 'Country name is required.');
      return;
    }
    const code = loginCode.trim();
    if (!COUNTRY_CODE_PATTERN.test(code)) {
      setLoginCodeError('Use the format +<code> (e.g. +91)');
      return;
    }
    if (loginMethods.some((m) => m.code === code && m.id !== editingLoginId)) {
      setLoginCodeError('This country code is already configured.');
      return;
    }
    const data = {
      country: loginCountry.trim(),
      code,
      flag: loginFlag.trim(),
      defaultMode: loginMode,
      enabled: loginEnabled,
    };
    if (editingLoginId) {
      setLoginMethods((current) => current.map((m) => (m.id === editingLoginId ? { ...m, ...data } : m)));
      setShowLoginModal(false);
      showToast('success', 'Login Method Updated', `${data.country} (${code}) has been updated.`);
    } else {
      setLoginMethods((current) => [...current, { id: `l${Date.now()}`, ...data }]);
      setShowLoginModal(false);
      showToast('success', 'Login Method Added', `${data.country} (${code}) has been added.`);
    }
  }

  function deleteLoginMethod(method) {
    setLoginMethods((current) => current.filter((m) => m.id !== method.id));
    showToast('success', 'Login Method Removed', `${method.country} (${method.code}) has been removed.`);
  }

  function toggleLoginEnabled(id) {
    setLoginMethods((current) => current.map((m) => (m.id === id ? { ...m, enabled: !m.enabled } : m)));
  }

  function updateLoginMode(id, mode) {
    setLoginMethods((current) => current.map((m) => (m.id === id ? { ...m, defaultMode: mode } : m)));
  }

  /* ── Preparation journeys ── */
  const loadJourneys = useCallback(async (filter) => {
    setJourneysLoading(true);
    try {
      const { data } = await PreparationJourneys.list(filter);
      setJourneys(Array.isArray(data) ? data : []);
    } catch (err) {
      setJourneys([]);
      showToast('error', 'Failed to Load Journeys', err.message || 'Could not fetch preparation journeys.');
    } finally {
      setJourneysLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { loadJourneys(journeyFilter); }, [journeyFilter, loadJourneys]);

  function openJourneyModal(journey = null) {
    setEditingJourneyId(journey ? journey.id : null);
    setJourneyName(journey ? journey.journey : JOURNEY_TYPES[0]);
    setJourneyYear(journey ? journey.year : '');
    setJourneyNick(journey ? journey.nickName : JOURNEY_NICKNAMES[JOURNEY_TYPES[0]]);
    setJourneyExamDate(journey ? journey.examDate : '');
    setJourneyDatesUnsure(journey ? !!journey.datesUnsure : false);
    setJourneyStatus(journey ? journey.status : 'Active');
    setShowJourneyModal(true);
  }

  async function handleJourneySubmit(event) {
    event.preventDefault();
    if (!journeyName.trim()) {
      showToast('error', 'Validation Error', 'Prep journey name is required.');
      return;
    }
    if (!journeyYear.trim()) {
      showToast('error', 'Validation Error', 'Year is required.');
      return;
    }
    if (!journeyExamDate) {
      showToast('error', 'Validation Error', 'Please select the date of exam.');
      return;
    }
    const data = {
      journey: journeyName.trim(),
      year: journeyYear.trim(),
      examDate: journeyExamDate,
      datesUnsure: journeyDatesUnsure,
      status: journeyStatus,
    };
    setJourneySaving(true);
    try {
      if (editingJourneyId) {
        await PreparationJourneys.update(editingJourneyId, data);
        showToast('success', 'Journey Updated', `${data.journey} ${data.year} has been updated.`);
      } else {
        await PreparationJourneys.create(data);
        showToast('success', 'Journey Added', `${data.journey} ${data.year} has been added.`);
      }
      setShowJourneyModal(false);
      await loadJourneys(journeyFilter);
    } catch (err) {
      showToast('error', 'Save Failed', err.message || 'Could not save the preparation journey.');
    } finally {
      setJourneySaving(false);
    }
  }

  async function deleteJourney(journey) {
    try {
      await PreparationJourneys.remove(journey.id);
      showToast('success', 'Journey Removed', `${journey.journey} ${journey.year} has been removed.`);
      await loadJourneys(journeyFilter);
    } catch (err) {
      showToast('error', 'Delete Failed', err.message || 'Could not remove the preparation journey.');
    }
  }

  return (
    <section className="mobile-app-settings-page data-table-page">
      <ToastRegion toasts={toasts} onDismiss={(id) => setToasts((current) => current.filter((t) => t.id !== id))} />

      <style>{`
        .mobile-app-settings-page .mas-version-pill { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; color: #006073; font-size: 14px; }
        .mobile-app-settings-page .mas-badge { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
        .mobile-app-settings-page .mas-badge.yes { background: #fee2e2; color: #dc2626; }
        .mobile-app-settings-page .mas-badge.no { background: #e7f5f7; color: #006073; }
        .mobile-app-settings-page .mas-view-btn { background: none; border: 1px solid #cfe6ec; color: #006073; padding: 5px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
        .mobile-app-settings-page .mas-view-btn:hover { background: #e7f5f7; }
        .mobile-app-settings-page .mas-field { display: flex; flex-direction: column; gap: 8px; margin-bottom: 18px; }
        .mobile-app-settings-page .mas-field label { font-size: 13px; font-weight: 600; color: #334155; display: flex; align-items: center; gap: 6px; }
        .mobile-app-settings-page .mas-field label i { color: #006073; }
        .mobile-app-settings-page .mas-input { width: 100%; min-height: 44px; padding: 10px 14px; border: 1px solid #d7e1e7; border-radius: 8px; font-size: 14px; box-sizing: border-box; }
        .mobile-app-settings-page .mas-input:focus { outline: none; border-color: #006073; box-shadow: 0 0 0 3px rgba(0,96,115,0.12); }
        .mobile-app-settings-page .mas-input-error { border-color: #dc2626; }
        .mobile-app-settings-page .mas-error-text { color: #dc2626; font-size: 12px; }
        .mobile-app-settings-page .mas-hint { color: #94a3b8; font-size: 12px; }
        .mobile-app-settings-page .static-field-label { display: block; font-size: 12px; font-weight: 600; color: #52606d; margin-bottom: 8px; }
        .mobile-app-settings-page .mas-toggle { display: inline-flex; background: #f1f5f8; border: 1px solid #d7e1e7; border-radius: 8px; padding: 3px; gap: 3px; }
        .mobile-app-settings-page .mas-toggle button { border: none; background: transparent; padding: 8px 22px; border-radius: 6px; font-size: 13px; font-weight: 600; color: #52606d; cursor: pointer; transition: all .15s ease; }
        .mobile-app-settings-page .mas-toggle button.active { background: #006073; color: #fff; }
        .mobile-app-settings-page .mas-switch { display: inline-flex; align-items: center; gap: 12px; cursor: pointer; user-select: none; }
        .mobile-app-settings-page .mas-switch-track { position: relative; width: 44px; height: 24px; flex: none; background: #cbd5e1; border-radius: 999px; transition: background .15s ease; }
        .mobile-app-settings-page .mas-switch-track::after { content: ''; position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; background: #fff; border-radius: 50%; box-shadow: 0 1px 2px rgba(0,0,0,.2); transition: transform .15s ease; }
        .mobile-app-settings-page .mas-switch.on .mas-switch-track { background: #006073; }
        .mobile-app-settings-page .mas-switch.on .mas-switch-track::after { transform: translateX(20px); }
        .mobile-app-settings-page .mas-switch-label { font-size: 13px; font-weight: 600; color: #52606d; }
        .mobile-app-settings-page .field-cell-inline { flex-direction: row; align-items: center; justify-content: space-between; }
        .mobile-app-settings-page .field-cell-inline .static-field-label { margin-bottom: 0; }
        .mobile-app-settings-page .mas-check-row { flex-direction: row; align-items: center; gap: 9px; cursor: pointer; user-select: none; }
        .mobile-app-settings-page .mas-check { width: 17px; height: 17px; flex: none; accent-color: #006073; cursor: pointer; }
        .mobile-app-settings-page .mas-check-label { font-size: 13px; font-weight: 600; color: #334155; }
        .mobile-app-settings-page .mas-rte { border: 1px solid #d7e1e7; border-radius: 8px; overflow: hidden; }
        .mobile-app-settings-page .mas-rte-toolbar { display: flex; gap: 2px; padding: 6px 8px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
        .mobile-app-settings-page .mas-rte-toolbar button { width: 32px; height: 32px; border: none; background: transparent; border-radius: 6px; color: #475569; cursor: pointer; font-size: 15px; }
        .mobile-app-settings-page .mas-rte-toolbar button:hover { background: #e2e8f0; color: #006073; }
        .mobile-app-settings-page .mas-rte-area { min-height: 150px; max-height: 300px; overflow-y: auto; padding: 12px 14px; font-size: 14px; line-height: 1.6; color: #1e293b; }
        .mobile-app-settings-page .mas-rte-area:focus { outline: none; }
        .mobile-app-settings-page .mas-rte-area:empty:before { content: attr(data-placeholder); color: #94a3b8; }
        .mobile-app-settings-page .mas-summary-html { font-size: 14px; line-height: 1.7; color: #334155; }
        .mobile-app-settings-page .mas-summary-html ul, .mobile-app-settings-page .mas-summary-html ol { padding-left: 22px; }
        .mobile-app-settings-page .wcm-section-header { flex-wrap: wrap; gap: 10px; }
        .mobile-app-settings-page .wcm-section-title { display: inline-flex; align-items: center; }
        .mobile-app-settings-page .mas-section-sub { font-size: 12px; color: #64748b; margin: 4px 0 0; }
        .mobile-app-settings-page .wcm-btn-primary-custom { display: inline-flex; align-items: center; gap: 6px; background: linear-gradient(135deg, #006073 0%, #004d5c 100%); background-image: linear-gradient(135deg, #006073 0%, #004d5c 100%); color: #fff; border: none; padding: 8px 20px; border-radius: 6px; font-weight: 600; }
        .mobile-app-settings-page .wcm-btn-primary-custom:hover { color: #fff; box-shadow: 0 4px 12px rgba(0,96,115,0.2); }
        .mobile-app-settings-page .mas-slider-thumb { width: 84px; height: 52px; border-radius: 8px; object-fit: cover; border: 1px solid #e2e8f0; background: #f1f5f8; }
        .mobile-app-settings-page .mas-carousel { display: flex; align-items: center; justify-content: center; gap: 18px; }
        .mobile-app-settings-page .mas-carousel-nav { width: 42px; height: 42px; border-radius: 50%; border: 1px solid #d7e1e7; background: #fff; color: #006073; font-size: 18px; cursor: pointer; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; transition: all .15s ease; }
        .mobile-app-settings-page .mas-carousel-nav:hover:not(:disabled) { background: #006073; color: #fff; border-color: #006073; }
        .mobile-app-settings-page .mas-carousel-nav:disabled { opacity: .4; cursor: not-allowed; }
        .mobile-app-settings-page .mas-phone { width: 270px; background: #1e293b; border-radius: 34px; padding: 12px 12px 16px; box-shadow: 0 12px 34px rgba(15,23,42,0.28); position: relative; }
        .mobile-app-settings-page .mas-phone-notch { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); width: 110px; height: 20px; background: #1e293b; border-bottom-left-radius: 14px; border-bottom-right-radius: 14px; z-index: 2; }
        .mobile-app-settings-page .mas-phone-screen { background: #fff; border-radius: 24px; padding: 34px 18px 18px; min-height: 360px; display: flex; flex-direction: column; }
        .mobile-app-settings-page .mas-slide-text { text-align: center; margin-bottom: 16px; }
        .mobile-app-settings-page .mas-slide-line1 { font-size: 18px; font-weight: 700; color: #1e293b; line-height: 1.3; }
        .mobile-app-settings-page .mas-slide-line2 { font-size: 13px; color: #64748b; margin-top: 6px; line-height: 1.4; }
        .mobile-app-settings-page .mas-slide-image { flex: 1; border-radius: 14px; overflow: hidden; background: #f1f5f8; display: flex; align-items: center; justify-content: center; min-height: 180px; }
        .mobile-app-settings-page .mas-slide-image img { width: 100%; height: 100%; object-fit: cover; }
        .mobile-app-settings-page .mas-slide-dots { display: flex; justify-content: center; gap: 7px; margin-top: 14px; }
        .mobile-app-settings-page .mas-dot { width: 7px; height: 7px; border-radius: 50%; border: none; background: #cbd5e1; padding: 0; cursor: pointer; transition: all .15s ease; }
        .mobile-app-settings-page .mas-dot.active { background: #006073; width: 20px; border-radius: 4px; }
        .mobile-app-settings-page .mas-slide-actions { display: flex; justify-content: center; gap: 10px; margin-top: 14px; }
        .mobile-app-settings-page .mas-slide-action { display: inline-flex; align-items: center; gap: 6px; background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.25); color: #fff; padding: 6px 14px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all .15s ease; }
        .mobile-app-settings-page .mas-slide-action:hover { background: rgba(255,255,255,0.22); }
        .mobile-app-settings-page .mas-slide-action.danger:hover { background: #dc2626; border-color: #dc2626; }
        .mobile-app-settings-page .mas-cdn-link { color: #006073; font-size: 12px; word-break: break-all; }
        .mobile-app-settings-page .mas-flag-thumb { width: 26px; height: 26px; border-radius: 50%; object-fit: cover; background: #f1f5f8; flex-shrink: 0; }
        .mobile-app-settings-page .mas-row-strong { font-weight: 600; color: #1e293b; }
        .mobile-app-settings-page .mas-inline-select { padding: 6px 10px; border: 1px solid #d7e1e7; border-radius: 6px; font-size: 13px; background: #fff; color: #334155; cursor: pointer; }
        .mobile-app-settings-page .mas-inline-select:focus { outline: none; border-color: #006073; }
        .mobile-app-settings-page .mas-switch-wrap { display: inline-flex; align-items: center; gap: 9px; }
        .mobile-app-settings-page .mas-switch { position: relative; width: 40px; height: 22px; border-radius: 999px; border: none; background: #cbd5e1; cursor: pointer; padding: 0; transition: background .18s ease; flex-shrink: 0; }
        .mobile-app-settings-page .mas-switch.on { background: #16a34a; }
        .mobile-app-settings-page .mas-switch .mas-switch-knob { position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,0.25); transition: transform .18s ease; }
        .mobile-app-settings-page .mas-switch.on .mas-switch-knob { transform: translateX(18px); }
        .mobile-app-settings-page .mas-switch-label { font-size: 12px; font-weight: 600; min-width: 56px; text-align: left; }
        .mobile-app-settings-page .mas-switch-label.on { color: #16a34a; }
        .mobile-app-settings-page .mas-switch-label.off { color: #94a3b8; }
        .mobile-app-settings-page .mas-icon-btn { background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 15px; padding: 4px; border-radius: 6px; }
        .mobile-app-settings-page .mas-icon-btn:hover { color: #dc2626; background: #fee2e2; }
        .mobile-app-settings-page .mas-minver { position: relative; margin-left: auto; }
        .mobile-app-settings-page .mas-minver-btn { display: inline-flex; align-items: center; gap: 8px; height: 100%; min-height: 44px; background: #fff; border: 1px solid #d7e1e7; border-radius: 8px; padding: 0 14px; font-size: 13px; font-weight: 600; color: #334155; cursor: pointer; transition: all .15s ease; }
        .mobile-app-settings-page .mas-minver-btn:hover, .mobile-app-settings-page .mas-minver-btn.open { border-color: #006073; box-shadow: 0 0 0 3px rgba(0,96,115,0.12); }
        .mobile-app-settings-page .mas-minver-btn > i.ti-shield-check { color: #006073; font-size: 16px; }
        .mobile-app-settings-page .mas-minver-label { color: #64748b; font-weight: 600; }
        .mobile-app-settings-page .mas-minver-value { background: #e7f5f7; color: #006073; padding: 3px 10px; border-radius: 999px; font-weight: 700; }
        .mobile-app-settings-page .mas-minver-menu { position: absolute; top: calc(100% + 6px); right: 0; min-width: 220px; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; box-shadow: 0 12px 30px rgba(15,23,42,0.16); padding: 6px; z-index: 30; max-height: 280px; overflow-y: auto; }
        .mobile-app-settings-page .mas-minver-menu-head { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: #94a3b8; padding: 8px 10px 6px; }
        .mobile-app-settings-page .mas-minver-item { display: flex; align-items: center; gap: 8px; width: 100%; background: none; border: none; padding: 9px 10px; border-radius: 7px; font-size: 13px; font-weight: 600; color: #334155; cursor: pointer; text-align: left; }
        .mobile-app-settings-page .mas-minver-item i.ti-package { color: #006073; }
        .mobile-app-settings-page .mas-minver-item:hover { background: #f1f5f8; }
        .mobile-app-settings-page .mas-minver-item.active { background: #e7f5f7; }
        .mobile-app-settings-page .mas-status-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; }
        .mobile-app-settings-page .mas-status-badge.active { background: #dcfce7; color: #16a34a; }
        .mobile-app-settings-page .mas-status-badge.completed { background: #e2e8f0; color: #475569; }
        .mobile-app-settings-page .mas-status-badge i { font-size: 8px; }
        .mobile-app-settings-page .mas-jfilter-select { min-height: 44px; padding: 0 38px 0 14px; border: 1px solid #d7e1e7; border-radius: 8px; font-size: 13px; font-weight: 600; color: #334155; background-color: #fff; cursor: pointer; appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23006073' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 12px center; }
        .mobile-app-settings-page .mas-jfilter-select:focus { outline: none; border-color: #006073; box-shadow: 0 0 0 3px rgba(0,96,115,0.12); }
        .mobile-app-settings-page .mas-checkbox { display: inline-flex; align-items: center; gap: 9px; font-size: 14px; font-weight: 600; color: #334155; cursor: pointer; }
        .mobile-app-settings-page .mas-checkbox input { width: 17px; height: 17px; accent-color: #006073; cursor: pointer; }
      `}</style>

      <div className="page-header-section" style={{ flexWrap: 'wrap' }}>
        <div className="page-header-title-group">
          <span className="page-header-icon-box"><Icon className="fa fa-mobile" /></span>
          <div>
            <h2>Mobile App Settings</h2>
            <p>Manage published mobile app releases, version history, and update policies.</p>
          </div>
        </div>
      </div>

      <div className="wcm-section-card">
      <div className="wcm-section-header">
        <div>
          <h2 className="wcm-section-title"><Icon className="ti ti-package" style={{ marginRight: '10px' }} />Published Versions</h2>
          <p className="mas-section-sub">All app versions published so far, newest first.</p>
        </div>
        <button type="button" className="wcm-btn wcm-btn-primary-custom" onClick={openAddModal}>
          <Icon className="ti ti-plus" /> Add Release Note
        </button>
      </div>

      <div className="filter-bar">
        <div className="search-wrapper">
          <Icon className={`ti ${searchQuery ? 'ti-close' : 'ti-search'}`} onClick={() => setSearchQuery('')} aria-hidden="true" />
          <input
            type="text"
            className="search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by version number…"
          />
        </div>

        <div className="mas-minver" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className={`mas-minver-btn ${minMenuOpen ? 'open' : ''}`}
            onClick={() => setMinMenuOpen((o) => !o)}
            title="Users on a lower version will be asked to force update"
          >
            <Icon className="ti ti-shield-check" />
            <span className="mas-minver-label">Minimum Supported Version</span>
            <span className="mas-minver-value">{minVersion}</span>
            <Icon className={`ti ti-angle-${minMenuOpen ? 'up' : 'down'}`} />
          </button>
          {minMenuOpen && (
            <div className="mas-minver-menu">
              <div className="mas-minver-menu-head">Select minimum version</div>
              {releases.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={`mas-minver-item ${r.version === minVersion ? 'active' : ''}`}
                  onClick={() => {
                    setMinVersion(r.version);
                    setMinMenuOpen(false);
                    showToast('success', 'Minimum Version Updated', `Users below v${r.version} will be prompted to force update.`);
                  }}
                >
                  <Icon className="ti ti-package" />
                  <span>{r.version}</span>
                  {r.version === minVersion && <Icon className="ti ti-check" style={{ marginLeft: 'auto', color: '#006073' }} />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="students-table-container">
        <table className={`students-table ${isLoading ? 'thead-loading' : ''}`}>
          <thead>
            <tr>
              <th>Version</th>
              <th>Release Date</th>
              <th style={{ textAlign: 'center' }}>Mandatory Update</th>
              <th>Release Notes</th>
              <th style={{ width: '60px', textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          {isLoading ? (
          <tbody>
            {Array.from({ length: 8 }, (_, i) => (
              <tr key={`sk-${i}`}>
                {Array.from({ length: 5 }, (_, j) => (
                  <td key={j}><div className="table-skeleton medium" /></td>
                ))}
              </tr>
            ))}
          </tbody>
          ) : (
          <tbody>
            {pagedReleases.length > 0 ? pagedReleases.map((r) => (
              <tr key={r.id}>
                <td>
                  <span className="mas-version-pill"><Icon className="ti ti-package" /> {r.version}</span>
                </td>
                <td>{formatReleaseDate(r.releaseDate)}</td>
                <td style={{ textAlign: 'center' }}>
                  {r.mandatory
                    ? <span className="mas-badge yes">Yes</span>
                    : <span className="mas-badge no">No</span>}
                </td>
                <td>
                  <button type="button" className="mas-view-btn" onClick={() => setViewRelease(r)}>
                    <Icon className="ti ti-eye" /> Release Notes
                  </button>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <div className="kebab-menu-container">
                    <button type="button" className="kebab-button" onClick={(e) => { e.stopPropagation(); setActiveRelMenu(activeRelMenu === r.id ? null : r.id); }}>
                      <Icon className="ti ti-more-alt" />
                    </button>
                    <div className={`kebab-dropdown ${activeRelMenu === r.id ? 'active' : ''}`} onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="kebab-dropdown-item" onClick={() => { setViewRelease(r); setActiveRelMenu(null); }}><Icon className="ti ti-eye" /> Release Notes</button>
                      <button type="button" className="kebab-dropdown-item delete-action" onClick={() => { setConfirmDeleteRelease(r); setActiveRelMenu(null); }}><Icon className="ti ti-trash" /> Delete</button>
                    </div>
                  </div>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '40px' }}>
                  <div className="qar-empty-state" style={{ border: 'none', background: 'transparent' }}>
                    <Icon className="ti ti-mobile" />
                    <h4>No Releases Found</h4>
                    <p>No app versions match your search.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
          )}
        </table>

        {filtered.length > 0 && (
          <div className="pagination-container">
            <div className="pagination-info">
              <span>Showing {relShowingStart} to {relShowingEnd} of {filtered.length} entries</span>
              <select className="page-size-select" value={relPageSize} onChange={(e) => setRelPageSize(Number(e.target.value))}>
                {PAGE_SIZE_OPTIONS.map((s) => <option key={s} value={s}>Show {s}</option>)}
              </select>
            </div>
            <div className="pagination-controls">
              <button type="button" className="pagination-btn" disabled={relSafePage === 1} onClick={() => setRelPage((p) => Math.max(1, p - 1))}>
                <Icon className="ti ti-angle-left" /> Previous
              </button>
              {getPageNumbers(relSafePage, relTotalPages).map((p, idx) => (
                p === '...' ? (
                  <span key={`el-${idx}`} className="pagination-btn" style={{ pointerEvents: 'none', background: 'transparent', border: 'none' }}>...</span>
                ) : (
                  <button key={p} type="button" className={`pagination-btn ${relSafePage === p ? 'active' : ''}`} onClick={() => setRelPage(p)}>{p}</button>
                )
              ))}
              <button type="button" className="pagination-btn" disabled={relSafePage === relTotalPages} onClick={() => setRelPage((p) => Math.min(relTotalPages, p + 1))}>
                Next <Icon className="ti ti-angle-right" />
              </button>
            </div>
          </div>
        )}
      </div>
      </div>

      {/* ── App Home Screen Sliders ── */}
      <div className="wcm-section-card">
      <div className="wcm-section-header">
        <div>
          <h2 className="wcm-section-title"><Icon className="ti ti-layout-slider" style={{ marginRight: '10px' }} />App Home Screen Sliders</h2>
          <p className="mas-section-sub">Slides rendered in the home screen slideshow of the mobile app.</p>
        </div>
        <button type="button" className="wcm-btn wcm-btn-primary-custom" onClick={() => openSliderModal()}>
          <Icon className="ti ti-plus" /> Add Slider
        </button>
      </div>
      <div style={{ padding: '28px 20px' }}>
        {sliders.length > 0 ? (() => {
          const idx = Math.min(sliderIndex, sliders.length - 1);
          const s = sliders[idx];
          return (
            <div className="mas-carousel">
              <button
                type="button"
                className="mas-carousel-nav"
                disabled={sliders.length <= 1}
                onClick={() => setSliderIndex((i) => (i - 1 + sliders.length) % sliders.length)}
                aria-label="Previous slide"
              >
                <Icon className="ti ti-angle-left" />
              </button>

              <div className="mas-phone">
                <div className="mas-phone-notch" />
                <div className="mas-phone-screen">
                  <div className="mas-slide-text">
                    <div className="mas-slide-line1">{s.line1}</div>
                    {s.line2 ? <div className="mas-slide-line2">{s.line2}</div> : null}
                  </div>
                  <div className="mas-slide-image">
                    <img src={s.image} alt={s.line1} onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
                  </div>
                  <div className="mas-slide-dots">
                    {sliders.map((sl, i) => (
                      <button
                        key={sl.id}
                        type="button"
                        className={`mas-dot ${i === idx ? 'active' : ''}`}
                        onClick={() => setSliderIndex(i)}
                        aria-label={`Go to slide ${i + 1}`}
                      />
                    ))}
                  </div>
                </div>
                <div className="mas-slide-actions">
                  <button type="button" className="mas-slide-action" onClick={() => openSliderModal(s)}><Icon className="ti ti-pencil" /> Edit</button>
                  <button type="button" className="mas-slide-action danger" onClick={() => setConfirmDeleteSlider(s)}><Icon className="ti ti-trash" /> Delete</button>
                </div>
              </div>

              <button
                type="button"
                className="mas-carousel-nav"
                disabled={sliders.length <= 1}
                onClick={() => setSliderIndex((i) => (i + 1) % sliders.length)}
                aria-label="Next slide"
              >
                <Icon className="ti ti-angle-right" />
              </button>
            </div>
          );
        })() : (
          <div className="qar-empty-state" style={{ border: 'none', background: 'transparent' }}>
            <Icon className="ti ti-image" />
            <h4>No Sliders Configured</h4>
            <p>Add a slider to show it on the app home screen.</p>
          </div>
        )}
      </div>
      </div>

      {/* ── Login Methods ── */}
      <div className="wcm-section-card">
      <div className="wcm-section-header">
        <div>
          <h2 className="wcm-section-title"><Icon className="ti ti-world" style={{ marginRight: '10px' }} />Login Methods</h2>
          <p className="mas-section-sub">Country codes supported by the app and their default OTP delivery mode.</p>
        </div>
        <button type="button" className="wcm-btn wcm-btn-primary-custom" onClick={() => openLoginModal()}>
          <Icon className="ti ti-plus" /> Add Country
        </button>
      </div>
      <div className="students-table-container">
        <table className="students-table">
          <thead>
            <tr>
              <th>Country Name</th>
              <th>Country Code</th>
              <th>Default OTP Mode</th>
              <th style={{ textAlign: 'center' }}>Status</th>
              <th style={{ width: '60px', textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loginMethods.length > 0 ? loginMethods.map((m) => (
              <tr key={m.id}>
                <td>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
                    {m.flag
                      ? <img className="mas-flag-thumb" src={m.flag} alt={`${m.country} flag`} onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
                      : <span className="mas-flag-thumb" />}
                    <span className="mas-row-strong">{m.country}</span>
                  </span>
                </td>
                <td>{m.code}</td>
                <td>
                  <select className="mas-inline-select" value={m.defaultMode} onChange={(e) => updateLoginMode(m.id, e.target.value)}>
                    {OTP_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
                  </select>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={m.enabled}
                    className={`mas-switch ${m.enabled ? 'on' : 'off'}`}
                    onClick={() => toggleLoginEnabled(m.id)}
                    title={m.enabled ? 'Disable' : 'Enable'}
                  >
                    <span className="mas-switch-knob" />
                  </button>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <div className="kebab-menu-container">
                    <button type="button" className="kebab-button" onClick={(e) => { e.stopPropagation(); setActiveLoginMenu(activeLoginMenu === m.id ? null : m.id); }}>
                      <Icon className="ti ti-more-alt" />
                    </button>
                    <div className={`kebab-dropdown ${activeLoginMenu === m.id ? 'active' : ''}`} onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="kebab-dropdown-item" onClick={() => { openLoginModal(m); setActiveLoginMenu(null); }}><Icon className="ti ti-pencil" /> Edit</button>
                      <button type="button" className="kebab-dropdown-item" style={{ color: '#dc2626' }} onClick={() => { setConfirmDeleteLogin(m); setActiveLoginMenu(null); }}><Icon className="ti ti-trash" /> Delete</button>
                    </div>
                  </div>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '40px' }}>
                  <div className="qar-empty-state" style={{ border: 'none', background: 'transparent' }}>
                    <Icon className="ti ti-world" />
                    <h4>No Login Methods</h4>
                    <p>Add a country code to enable login from that region.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      </div>

      {/* ── Preparation Journeys ── */}
      <div className="wcm-section-card">
      <div className="wcm-section-header">
        <div>
          <h2 className="wcm-section-title"><Icon className="ti ti-rocket" style={{ marginRight: '10px' }} />Preparation Journeys</h2>
          <p className="mas-section-sub">Exam preparation tracks offered in the app, with their target exam dates.</p>
        </div>
        <button type="button" className="wcm-btn wcm-btn-primary-custom" onClick={() => openJourneyModal()}>
          <Icon className="ti ti-plus" /> Add Journey
        </button>
      </div>

      <div className="filter-bar">
        <select
          className="mas-jfilter-select"
          value={journeyFilter}
          onChange={(e) => setJourneyFilter(e.target.value)}
          aria-label="Filter preparation journeys"
        >
          <option value="active">Show Active Only</option>
          <option value="all">Show All</option>
          <option value="completed">Show Completed Only</option>
        </select>
      </div>

      <div className="students-table-container">
        <table className={`students-table ${journeysLoading ? 'thead-loading' : ''}`}>
          <thead>
            <tr>
              <th>Prep Journey</th>
              <th>Year</th>
              <th>Nick Name</th>
              <th>Date of Exam</th>
              <th style={{ textAlign: 'center' }}>Status</th>
              <th style={{ width: '60px', textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          {journeysLoading ? (
          <tbody>
            {Array.from({ length: 5 }, (_, i) => (
              <tr key={`jsk-${i}`}>
                {Array.from({ length: 6 }, (_, k) => (
                  <td key={k}><div className="table-skeleton medium" /></td>
                ))}
              </tr>
            ))}
          </tbody>
          ) : (
          <tbody>
            {journeys.length > 0 ? journeys.map((j) => (
              <tr key={j.id}>
                <td><span className="mas-row-strong">{j.journey}</span></td>
                <td>{j.year}</td>
                <td>{j.nickName || '—'}</td>
                <td>{j.datesUnsure ? formatExamMonth(j.examDate) : formatExamDate(j.examDate)}</td>
                <td style={{ textAlign: 'center' }}>
                  <span className={`mas-status-badge ${j.status === 'Active' ? 'active' : 'completed'}`}>
                    <Icon className="ti ti-circle-filled" /> {j.status}
                  </span>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <div className="kebab-menu-container">
                    <button type="button" className="kebab-button" onClick={(e) => { e.stopPropagation(); setActiveJourneyMenu(activeJourneyMenu === j.id ? null : j.id); }}>
                      <Icon className="ti ti-more-alt" />
                    </button>
                    <div className={`kebab-dropdown ${activeJourneyMenu === j.id ? 'active' : ''}`} onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="kebab-dropdown-item" onClick={() => { openJourneyModal(j); setActiveJourneyMenu(null); }}><Icon className="ti ti-pencil" /> Edit</button>
                      <button type="button" className="kebab-dropdown-item delete-action" onClick={() => { deleteJourney(j); setActiveJourneyMenu(null); }}><Icon className="ti ti-trash" /> Delete</button>
                    </div>
                  </div>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '40px' }}>
                  <div className="qar-empty-state" style={{ border: 'none', background: 'transparent' }}>
                    <Icon className="ti ti-rocket" />
                    <h4>No Preparation Journeys</h4>
                    <p>{journeyFilter === 'completed' ? 'No completed journeys yet.' : journeyFilter === 'active' ? 'No active journeys. Add one to get started.' : 'Add a preparation journey to get started.'}</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
          )}
        </table>
      </div>
      </div>

      {/* ── Add Release Note Modal ── */}
      <div className={`legacy-modal-backdrop ${showAddModal ? 'active' : ''}`} onMouseDown={(e) => { if (e.target === e.currentTarget) setShowAddModal(false); }}>
        <div className="legacy-modal-dialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
          <div className="legacy-modal-header">
            <h3>Add Release Note</h3>
            <button type="button" className="legacy-modal-close" onClick={() => setShowAddModal(false)}>
              <Icon className="ti ti-close" />
            </button>
          </div>
          <form className="form-modal" onSubmit={handleSubmit}>
            <div className="legacy-modal-body">
              <div className="asset-form-section">
                <div className="asset-form-section-title"><Icon className="ti ti-info-circle" /> Release Details</div>
                <div className="asset-form-grid basic-grid">
                  <label className="field-cell">
                    <div className={`float-field ${versionError ? 'has-error' : ''}`}>
                      <input
                        type="text"
                        className="float-control"
                        placeholder=" "
                        value={formVersion}
                        onChange={(e) => handleVersionChange(e.target.value)}
                      />
                      <span className="float-label">Release Name <span className="req">*</span></span>
                    </div>
                    {versionError
                      ? <span className="field-error">{versionError}</span>
                      : <span className="field-hint">Format must be *.*.* (e.g. 2.0.1)</span>}
                  </label>
                  <label className="field-cell">
                    <div className="float-field float-always date-custom">
                      <input
                        type="date"
                        className="float-control"
                        value={formDate}
                        onChange={(e) => setFormDate(e.target.value)}
                        onClick={openDatePicker}
                        onKeyDown={openDatePicker}
                      />
                      <span className="float-label">Release Date <span className="req">*</span></span>
                      <span className={`date-display ${!formDate ? 'is-empty' : ''}`}>
                        {formDate ? formatReleaseDate(formDate) : 'Set a Date'}
                      </span>
                    </div>
                  </label>
                  <label className="field-cell full-span mas-check-row">
                    <input
                      type="checkbox"
                      className="mas-check"
                      checked={formMandatory}
                      onChange={(e) => setFormMandatory(e.target.checked)}
                    />
                    <span className="mas-check-label">Mandatory Upgrade Required</span>
                  </label>
                </div>
              </div>

              <div className="asset-form-section">
                <div className="asset-form-section-title"><Icon className="ti ti-file-text" /> Release Summary</div>
                <div className="asset-form-grid">
                  <div className="field-cell full-span">
                    <RichTextEditor valueRef={summaryRef} />
                  </div>
                </div>
              </div>
            </div>
            <div className="legacy-modal-footer">
              <button type="button" className="legacy-btn legacy-btn-default" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button type="submit" className="legacy-btn legacy-btn-success" disabled={!!versionError || !formVersion.trim()}>
                <Icon className="ti ti-check" /> Publish Release
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* ── Add Slider Modal ── */}
      <div className={`legacy-modal-backdrop ${showSliderModal ? 'active' : ''}`} onClick={() => setShowSliderModal(false)}>
        <div className="legacy-modal-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
          <div className="legacy-modal-header">
            <h3>{editingSliderId ? 'Edit Home Screen Slider' : 'Add Home Screen Slider'}</h3>
            <button type="button" className="legacy-modal-close" onClick={() => setShowSliderModal(false)}>
              <Icon className="ti ti-close" />
            </button>
          </div>
          <form className="form-modal" onSubmit={handleSliderSubmit}>
            <div className="legacy-modal-body">
              <div className="asset-form-section">
                <div className="asset-form-section-title"><Icon className="ti ti-text" /> Slide Content</div>
                <div className="asset-form-grid">
                  <label className="field-cell full-span">
                    <div className="float-field">
                      <input
                        type="text"
                        className="float-control"
                        placeholder=" "
                        value={sliderLine1}
                        onChange={(e) => setSliderLine1(e.target.value)}
                      />
                      <span className="float-label">Line 1 <span className="req">*</span></span>
                    </div>
                  </label>
                  <label className="field-cell full-span">
                    <div className="float-field">
                      <input
                        type="text"
                        className="float-control"
                        placeholder=" "
                        value={sliderLine2}
                        onChange={(e) => setSliderLine2(e.target.value)}
                      />
                      <span className="float-label">Line 2</span>
                    </div>
                  </label>
                  <label className="field-cell full-span">
                    <div className="float-field">
                      <input
                        type="url"
                        className="float-control"
                        placeholder=" "
                        value={sliderImage}
                        onChange={(e) => setSliderImage(e.target.value)}
                      />
                      <span className="float-label">Image CDN <span className="req">*</span></span>
                    </div>
                    <span className="field-hint">Full CDN URL of the slide background image.</span>
                  </label>
                </div>
              </div>
            </div>
            <div className="legacy-modal-footer">
              <button type="button" className="legacy-btn legacy-btn-default" onClick={() => setShowSliderModal(false)}>Cancel</button>
              <button type="submit" className="legacy-btn legacy-btn-success">
                {editingSliderId ? 'Save Changes' : 'Add Slider'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* ── Add Login Method Modal ── */}
      {showLoginModal && (
        <div className="crispr-modal-backdrop active" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowLoginModal(false); }}>
          <div className="crispr-modal-dialog" style={{ maxWidth: 560 }}>
            <div className="crispr-modal-header">
              <h3><Icon className="ti ti-world" /> {editingLoginId ? 'Edit Login Country' : 'Add Login Country'}</h3>
              <button type="button" className="crispr-modal-close" onClick={() => setShowLoginModal(false)}><Icon className="ti ti-close" /></button>
            </div>
            <form onSubmit={handleLoginSubmit}>
              <div className="crispr-modal-body">
                <div className="form-row full">
                  <div className="form-group">
                    <label>Country Name <span className="required">*</span></label>
                    <input type="text" className="form-input" value={loginCountry} onChange={(e) => setLoginCountry(e.target.value)} placeholder="India" />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Country Code <span className="required">*</span></label>
                    <input
                      type="text"
                      className="form-input"
                      style={loginCodeError ? { borderColor: '#dc2626' } : undefined}
                      value={loginCode}
                      onChange={(e) => handleLoginCodeChange(e.target.value)}
                      placeholder="+91"
                    />
                    {loginCodeError
                      ? <small style={{ color: '#dc2626', fontSize: '12px', display: 'block', marginTop: '6px' }}>{loginCodeError}</small>
                      : <small style={{ color: '#94a3b8', fontSize: '12px', display: 'block', marginTop: '6px' }}>Format must be +&lt;code&gt; (e.g. +91)</small>}
                  </div>
                  <div className="form-group">
                    <label>Default Mode for OTP</label>
                    <select className="form-select" value={loginMode} onChange={(e) => setLoginMode(e.target.value)}>
                      {OTP_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-row full">
                  <div className="form-group">
                    <label>Flag CDN</label>
                    <input type="url" className="form-input" value={loginFlag} onChange={(e) => setLoginFlag(e.target.value)} placeholder="https://img.icons8.com/color/48/india-circular.png" />
                    <small style={{ color: '#94a3b8', fontSize: '12px', display: 'block', marginTop: '6px' }}>Full CDN URL of the country flag image (shown beside the country name).</small>
                  </div>
                </div>
                <div className="form-row full">
                  <div className="form-group">
                    <label>Status</label>
                    <div className="mas-switch-wrap">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={loginEnabled}
                        className={`mas-switch ${loginEnabled ? 'on' : 'off'}`}
                        onClick={() => setLoginEnabled((v) => !v)}
                        title={loginEnabled ? 'Disable' : 'Enable'}
                      >
                        <span className="mas-switch-knob" />
                      </button>
                      <span className={`mas-switch-label ${loginEnabled ? 'on' : 'off'}`}>{loginEnabled ? 'Enabled' : 'Disabled'}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="crispr-modal-footer">
                <button type="button" className="btn btn-default" onClick={() => setShowLoginModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-success" disabled={!!loginCodeError || !loginCode.trim() || !loginCountry.trim()}>
                  <Icon className="ti ti-check" /> {editingLoginId ? 'Save Changes' : 'Add Country'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Slider Confirmation ── */}
      {confirmDeleteSlider && (
        <div className="crispr-modal-backdrop active" onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmDeleteSlider(null); }}>
          <div className="crispr-modal-dialog" style={{ maxWidth: 440 }}>
            <div className="crispr-modal-header">
              <h3><Icon className="ti ti-alert-triangle" style={{ color: '#dc2626' }} /> Delete Slider</h3>
              <button type="button" className="crispr-modal-close" onClick={() => setConfirmDeleteSlider(null)}><Icon className="ti ti-close" /></button>
            </div>
            <div className="crispr-modal-body">
              <p style={{ margin: 0, color: '#475569', fontSize: '14px', lineHeight: 1.6 }}>
                Are you sure you want to delete {confirmDeleteSlider.line1 ? <>the slider <strong>"{confirmDeleteSlider.line1}"</strong></> : 'this slider'}? It will no longer appear on the app home screen.
              </p>
            </div>
            <div className="crispr-modal-footer">
              <button type="button" className="btn btn-default" onClick={() => setConfirmDeleteSlider(null)}>Cancel</button>
              <button type="button" className="btn btn-danger" onClick={() => { removeSlider(confirmDeleteSlider); setConfirmDeleteSlider(null); }}>
                <Icon className="ti ti-trash" /> Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Release Confirmation ── */}
      {confirmDeleteRelease && (
        <div className="crispr-modal-backdrop active" onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmDeleteRelease(null); }}>
          <div className="crispr-modal-dialog" style={{ maxWidth: 440 }}>
            <div className="crispr-modal-header">
              <h3><Icon className="ti ti-alert-triangle" style={{ color: '#dc2626' }} /> Delete Release Note</h3>
              <button type="button" className="crispr-modal-close" onClick={() => setConfirmDeleteRelease(null)}><Icon className="ti ti-close" /></button>
            </div>
            <div className="crispr-modal-body">
              <p style={{ margin: 0, color: '#475569', fontSize: '14px', lineHeight: 1.6 }}>
                Are you sure you want to delete release <strong>{confirmDeleteRelease.version}</strong>? This release note will be permanently removed and can't be recovered.
              </p>
            </div>
            <div className="crispr-modal-footer">
              <button type="button" className="btn btn-default" onClick={() => setConfirmDeleteRelease(null)}>Cancel</button>
              <button type="button" className="btn btn-danger" onClick={() => { deleteRelease(confirmDeleteRelease); setConfirmDeleteRelease(null); }}>
                <Icon className="ti ti-trash" /> Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Login Method Confirmation ── */}
      {confirmDeleteLogin && (
        <div className="crispr-modal-backdrop active" onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmDeleteLogin(null); }}>
          <div className="crispr-modal-dialog" style={{ maxWidth: 440 }}>
            <div className="crispr-modal-header">
              <h3><Icon className="ti ti-alert-triangle" style={{ color: '#dc2626' }} /> Remove Login Method</h3>
              <button type="button" className="crispr-modal-close" onClick={() => setConfirmDeleteLogin(null)}><Icon className="ti ti-close" /></button>
            </div>
            <div className="crispr-modal-body">
              <p style={{ margin: 0, color: '#475569', fontSize: '14px', lineHeight: 1.6 }}>
                Are you sure you want to remove <strong>{confirmDeleteLogin.country} ({confirmDeleteLogin.code})</strong> as a login method? Users from this country will no longer be able to sign in.
              </p>
            </div>
            <div className="crispr-modal-footer">
              <button type="button" className="btn btn-default" onClick={() => setConfirmDeleteLogin(null)}>Cancel</button>
              <button type="button" className="btn btn-danger" onClick={() => { deleteLoginMethod(confirmDeleteLogin); setConfirmDeleteLogin(null); }}>
                <Icon className="ti ti-trash" /> Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── View Summary Modal ── */}
      {viewRelease && (
        <div className="crispr-modal-backdrop active" onMouseDown={(e) => { if (e.target === e.currentTarget) setViewRelease(null); }}>
          <div className="crispr-modal-dialog" style={{ maxWidth: 560 }}>
            <div className="crispr-modal-header">
              <h3><Icon className="ti ti-package" /> Version {viewRelease.version}</h3>
              <button type="button" className="crispr-modal-close" onClick={() => setViewRelease(null)}><Icon className="ti ti-close" /></button>
            </div>
            <div className="crispr-modal-body">
              <div style={{ display: 'flex', gap: '20px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '13px', color: '#59757b' }}>
                  <strong style={{ color: '#334155' }}>Released:</strong> {formatReleaseDate(viewRelease.releaseDate)}
                </div>
                <div style={{ fontSize: '13px', color: '#59757b' }}>
                  <strong style={{ color: '#334155' }}>Mandatory:</strong> {viewRelease.mandatory ? 'Yes' : 'No'}
                </div>
              </div>
              {viewRelease.summary
                ? <div className="mas-summary-html" dangerouslySetInnerHTML={{ __html: viewRelease.summary }} />
                : <p style={{ color: '#94a3b8', fontStyle: 'italic' }}>No summary provided.</p>}
            </div>
            <div className="crispr-modal-footer">
              <button type="button" className="btn btn-default" onClick={() => setViewRelease(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add / Edit Journey Modal ── */}
      {showJourneyModal && (
        <div className="crispr-modal-backdrop active" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowJourneyModal(false); }}>
          <div className="crispr-modal-dialog" style={{ maxWidth: 560 }}>
            <div className="crispr-modal-header">
              <h3><Icon className="ti ti-rocket" /> {editingJourneyId ? 'Edit Preparation Journey' : 'Add Preparation Journey'}</h3>
              <button type="button" className="crispr-modal-close" onClick={() => setShowJourneyModal(false)}><Icon className="ti ti-close" /></button>
            </div>
            <form onSubmit={handleJourneySubmit}>
              <div className="crispr-modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label>Prep Journey <span className="required">*</span></label>
                    <select
                      className="form-select"
                      value={journeyName}
                      onChange={(e) => { setJourneyName(e.target.value); setJourneyNick(JOURNEY_NICKNAMES[e.target.value] || ''); }}
                    >
                      {JOURNEY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Year <span className="required">*</span></label>
                    <input type="text" className="form-input" value={journeyYear} onChange={(e) => setJourneyYear(e.target.value)} placeholder="2026" />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Nick Name</label>
                    <input type="text" className="form-input" value={journeyNick} placeholder="IISER" disabled readOnly />
                  </div>
                  <div className="form-group">
                    <label>Date of Exam <span className="required">*</span></label>
                    <input type="date" className="form-input" value={journeyExamDate} onChange={(e) => setJourneyExamDate(e.target.value)} />
                  </div>
                </div>
                <div className="form-row full">
                  <div className="form-group">
                    <label className="mas-checkbox">
                      <input type="checkbox" checked={journeyDatesUnsure} onChange={(e) => setJourneyDatesUnsure(e.target.checked)} />
                      <span>Dates Unsure</span>
                    </label>
                    <small style={{ color: '#94a3b8', fontSize: '12px', display: 'block', marginTop: '6px' }}>When enabled, only the exam month is shown in the table (e.g. June, 2027).</small>
                  </div>
                </div>
                <div className="form-row full">
                  <div className="form-group">
                    <label>Status</label>
                    <div className="mas-toggle" role="group">
                      {JOURNEY_STATUSES.map((s) => (
                        <button key={s} type="button" className={journeyStatus === s ? 'active' : ''} onClick={() => setJourneyStatus(s)}>{s}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="crispr-modal-footer">
                <button type="button" className="btn btn-default" onClick={() => setShowJourneyModal(false)} disabled={journeySaving}>Cancel</button>
                <button type="submit" className="btn btn-success" disabled={journeySaving}>
                  <Icon className={`ti ${journeySaving ? 'ti-reload' : 'ti-check'}`} /> {journeySaving ? 'Saving…' : (editingJourneyId ? 'Save Changes' : 'Add Journey')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
