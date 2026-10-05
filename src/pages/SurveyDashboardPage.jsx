import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ToastRegion from '../components/ToastRegion';
import FilterDropdown from '../components/FilterDropdown';
import { Can, usePermission } from '../lib/userStore';
import { PERMS } from '../lib/permissions';
import { availableBatches, availableCourses } from '../data/attemptReportsDemo';
import {
  QUESTION_TYPE_LABEL,
  SURVEY_AUDIENCE,
  SURVEY_AUDIENCE_LABEL,
  SURVEY_STATUS,
  SURVEY_STATUS_LABEL,
  createSurvey,
  getSurvey,
  getSurveySummary,
  listResponses,
  listSurveys,
  questionsToSchema,
  recallSurvey,
  resumeSurvey,
  pauseSurvey,
  surveyFromSchema,
} from '../lib/surveysApi';
import Icon from '../components/Icon';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const DEADLINE_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Render a datetime-local value (e.g. "2026-06-23T02:17") as "23 Jun, 2026 02:17 am".
function formatDeadlineLabel(value) {
  if (!value) return '';
  const [datePart, timePart = '00:00'] = value.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  if (!year || !month || !day) return '';
  const [rawH, rawM] = timePart.split(':').map(Number);
  const ampm = rawH >= 12 ? 'pm' : 'am';
  const hour12 = rawH % 12 === 0 ? 12 : rawH % 12;
  const pad = (n) => String(n).padStart(2, '0');
  return `${day} ${DEADLINE_MONTHS[month - 1]}, ${year} ${pad(hour12)}:${pad(rawM)} ${ampm}`;
}

// Open the native date/time picker on click; block manual text entry on key down.
function openDatePicker(event) {
  if (event.type === 'keydown') {
    if (event.key === 'Tab') return;
    event.preventDefault();
  }
  try {
    event.currentTarget.showPicker?.();
  } catch (_) {
    // showPicker throws if already open or unsupported — safe to ignore.
  }
}

// ─── BatchMultiSelect ──────────────────────────────────────────────────────────
function BatchMultiSelect({ batches, selected, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function toggle(id) {
    if (selected.includes(id)) onChange(selected.filter((s) => s !== id));
    else onChange([...selected, id]);
  }

  function getLabel() {
    if (!selected.length) return 'Select Batches';
    if (selected.length === 1) return batches.find((b) => b.id === selected[0])?.name || '1 selected';
    return `${selected.length} batches selected`;
  }

  return (
    <div className="qar-batch-multiselect" ref={ref}>
      <div
        className={`qar-batch-trigger${disabled ? ' disabled' : ''}`}
        onClick={() => !disabled && setOpen((o) => !o)}
      >
        <span>{getLabel()}</span>
        <span style={{ display: 'flex', alignItems: 'center' }}>
          {selected.length > 0 && <span className="qar-batch-count">{selected.length}</span>}
          <Icon className="ti ti-angle-down" style={{ marginLeft: 8 }} />
        </span>
      </div>
      {open && !disabled && (
        <div className="qar-batch-dropdown" style={{ zIndex: 100 }}>
          <div className="qar-batch-actions">
            <button type="button" className="qar-batch-select-all" onClick={() => onChange(batches.map((b) => b.id))}>Select All</button>
            <button type="button" className="qar-batch-clear-all" onClick={() => onChange([])}>Clear All</button>
          </div>
          {batches.length === 0 ? (
            <div className="qar-batch-empty">No batches available</div>
          ) : (
            batches.map((batch) => (
              <label key={batch.id} className={`qar-batch-item${selected.includes(batch.id) ? ' selected' : ''}`}>
                <input
                  type="checkbox"
                  checked={selected.includes(batch.id)}
                  onChange={() => toggle(batch.id)}
                  onClick={(e) => e.stopPropagation()}
                />
                <span>{batch.name}</span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function CourseMultiSelect({ courses, selected, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function toggle(id) {
    if (selected.includes(id)) onChange(selected.filter((s) => s !== id));
    else onChange([...selected, id]);
  }

  function getLabel() {
    if (!selected.length) return 'Select Courses';
    if (selected.length === 1) return courses.find((c) => c.id === selected[0])?.name || '1 selected';
    return `${selected.length} courses selected`;
  }

  return (
    <div className="qar-batch-multiselect" ref={ref}>
      <div
        className={`qar-batch-trigger${disabled ? ' disabled' : ''}`}
        onClick={() => !disabled && setOpen((o) => !o)}
      >
        <span>{getLabel()}</span>
        <span style={{ display: 'flex', alignItems: 'center' }}>
          {selected.length > 0 && <span className="qar-batch-count">{selected.length}</span>}
          <Icon className="ti ti-angle-down" style={{ marginLeft: 8 }} />
        </span>
      </div>
      {open && !disabled && (
        <div className="qar-batch-dropdown" style={{ zIndex: 100 }}>
          <div className="qar-batch-actions">
            <button type="button" className="qar-batch-select-all" onClick={() => onChange(courses.map((c) => c.id))}>Select All</button>
            <button type="button" className="qar-batch-clear-all" onClick={() => onChange([])}>Clear All</button>
          </div>
          {courses.length === 0 ? (
            <div className="qar-batch-empty">No courses available</div>
          ) : (
            courses.map((course) => (
              <label key={course.id} className={`qar-batch-item${selected.includes(course.id) ? ' selected' : ''}`}>
                <input
                  type="checkbox"
                  checked={selected.includes(course.id)}
                  onChange={() => toggle(course.id)}
                  onClick={(e) => e.stopPropagation()}
                />
                <span>{course.name}</span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function KebabMenu({ survey, onAction, can }) {
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
        <Icon className="ti ti-more-alt" />
      </button>
      {open && (
        <div className="kebab-dropdown active">
          <button type="button" className="kebab-dropdown-item" onClick={() => { setOpen(false); onAction(survey, 'view_survey'); }}>
            <Icon className="ti ti-desktop" /> Preview Survey Form
          </button>
          <button type="button" className="kebab-dropdown-item" onClick={() => { setOpen(false); onAction(survey, 'view_responses'); }}>
            <Icon className="ti ti-list" /> View Responses
          </button>
          {survey.status === SURVEY_STATUS.ACTIVE && can?.('surveys.status.edit') && (
            <button type="button" className="kebab-dropdown-item" onClick={() => { setOpen(false); onAction(survey, 'pause'); }}>
              <Icon className="ti ti-control-pause" /> Pause Survey
            </button>
          )}
          {survey.status === SURVEY_STATUS.PAUSED && can?.('surveys.status.edit') && (
            <button type="button" className="kebab-dropdown-item" onClick={() => { setOpen(false); onAction(survey, 'resume'); }}>
              <Icon className="ti ti-control-play" /> Resume Survey
            </button>
          )}
          {survey.status !== SURVEY_STATUS.RECALLED && can?.('surveys.recall') && (
            <button type="button" className="kebab-dropdown-item danger-action" onClick={() => { setOpen(false); onAction(survey, 'recall'); }}>
              <Icon className="ti ti-back-left" /> Recall Survey
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── status visual mapping ────────────────────────────────────────────────────
// Active → Live (green), Recalled → Revoked (red), anything else → Completed (grey).
function statusDisplay(statusInt) {
  if (statusInt === SURVEY_STATUS.ACTIVE) return { label: 'Live', tone: 'live' };
  if (statusInt === SURVEY_STATUS.RECALLED) return { label: 'Revoked', tone: 'revoked' };
  return { label: 'Completed', tone: 'completed' };
}

function SurveyStatus({ statusInt }) {
  const { label, tone } = statusDisplay(statusInt);
  return (
    <span className={`survey-status survey-status-${tone}`}>
      <span className="survey-status-dot" />
      {label}
    </span>
  );
}

function timeWindowLabel(survey) {
  if (!survey.closesAt) return 'Open ended';
  const d = new Date(Number(survey.closesAt) * 1000);
  if (Number.isNaN(d.getTime())) return 'Open ended';
  return `Closes ${d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
}

export default function SurveyDashboardPage() {
  const { can } = usePermission();
  const [toasts, setToasts] = useState([]);
  function showToast(type, title, message) {
    const id = Date.now() + Math.random();
    setToasts((cur) => [...cur, { id, type, title, message }]);
    setTimeout(() => setToasts((cur) => cur.filter((t) => t.id !== id)), 5000);
  }

  const [searchParams, setSearchParams] = useSearchParams();
  const [currentView, setCurrentView] = useState('list'); // 'list' | 'create' | 'responses'
  const [surveys, setSurveys] = useState([]);
  const [surveysLoading, setSurveysLoading] = useState(false);
  const [activeSurvey, setActiveSurvey] = useState(null);
  const [surveyToView, setSurveyToView] = useState(null);
  const [audienceModalSurvey, setAudienceModalSurvey] = useState(null);

  // ─── Survey List Filters ────────────────────────────────────────────────────
  const [listSearch, setListSearch] = useState('');
  const [listStatusFilter, setListStatusFilter] = useState('all'); // 'all' | '0' | '1' | '2'
  const [listResponseFilter, setListResponseFilter] = useState('all');
  const [listAudienceFilter, setListAudienceFilter] = useState(''); // '' | '0' | '1' | '2'
  const [listPage, setListPage] = useState(1);
  const [listPageSize, setListPageSize] = useState(20);

  // ─── Load surveys ──────────────────────────────────────────────────────────
  const loadSurveys = useCallback(async () => {
    setSurveysLoading(true);
    try {
      const resp = await listSurveys({
        status: listStatusFilter === 'all' ? undefined : Number(listStatusFilter),
        audienceType: listAudienceFilter === '' ? undefined : Number(listAudienceFilter),
        size: 100,
      });
      const rows = resp?.data || resp?.surveys || (Array.isArray(resp) ? resp : []) || [];
      setSurveys(rows.map(surveyFromSchema));
    } catch (error) {
      showToast('error', 'Load failed', error?.response?.data?.error?.message || error?.response?.data?.message || error.message || 'Could not load surveys.');
      setSurveys([]);
    } finally {
      setSurveysLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listStatusFilter, listAudienceFilter]);

  useEffect(() => { loadSurveys(); }, [loadSurveys]);

  // Deep link: landing on /survey-dashboard?id=<surveyId> opens that survey's
  // responses view directly (fetch the survey definition, then let the responses
  // effect load rows + summary). Runs once on mount; in-app navigation manages
  // the `id` param itself.
  useEffect(() => {
    const idParam = searchParams.get('id');
    if (!idParam) return;
    (async () => {
      try {
        const resp = await getSurvey(idParam);
        const survey = surveyFromSchema(resp?.data || resp);
        if (!survey) throw new Error('Survey not found.');
        setRsSearch(''); setRsCourse(''); setRsBatches([]); setRsFrom(''); setRsTo('');
        setRsPage(1);
        setSummary(null);
        setActiveSurvey({ ...survey, responses: [] });
        setCurrentView('responses');
      } catch (error) {
        showToast('error', 'Load failed', error?.response?.data?.error?.message || error?.response?.data?.message || error.message || 'Could not open that survey.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredSurveys = useMemo(() => {
    let next = [...surveys];
    if (listResponseFilter === 'zero_responses') next = next.filter((s) => (s.responseCount || 0) === 0);
    if (listResponseFilter === 'has_responses') next = next.filter((s) => (s.responseCount || 0) > 0);
    const q = listSearch.trim().toLowerCase();
    if (q) next = next.filter((s) => (s.title || '').toLowerCase().includes(q) || (s.brief || '').toLowerCase().includes(q));
    return next;
  }, [surveys, listResponseFilter, listSearch]);

  const hasActiveListFilters = listSearch.trim() !== '' || listStatusFilter !== 'all' || listResponseFilter !== 'all' || listAudienceFilter !== '';

  // ─── Survey List Pagination (client-side) ───────────────────────────────────
  const listTotalPages = Math.max(1, Math.ceil(filteredSurveys.length / listPageSize));
  const listSafePage = Math.min(listPage, listTotalPages);
  const listStart = (listSafePage - 1) * listPageSize;
  const pagedSurveys = filteredSurveys.slice(listStart, listStart + listPageSize);
  const listShowingStart = filteredSurveys.length === 0 ? 0 : listStart + 1;
  const listShowingEnd = Math.min(listStart + listPageSize, filteredSurveys.length);

  useEffect(() => { setListPage(1); }, [listSearch, listStatusFilter, listResponseFilter, listAudienceFilter, listPageSize, surveys]);

  function listPageNumbers() {
    const total = listTotalPages;
    const cur = listSafePage;
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    if (cur <= 4) return [1, 2, 3, 4, 5, '...', total];
    if (cur >= total - 3) return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
    return [1, '...', cur - 1, cur, cur + 1, '...', total];
  }

  // ─── Create Survey State ────────────────────────────────────────────────────
  const [csTitle, setCsTitle] = useState('');
  const [csBrief, setCsBrief] = useState('');
  const [csAudience, setCsAudience] = useState('All Registered Students');
  const [csSelectedCourses, setCsSelectedCourses] = useState([]);
  const [csSelectedBatches, setCsSelectedBatches] = useState([]);
  const [csWindowType, setCsWindowType] = useState('open'); // 'open', 'strict'
  const [csDeadline, setCsDeadline] = useState('');
  const [csAnonymous, setCsAnonymous] = useState(false);
  const [csMultipleAllowed, setCsMultipleAllowed] = useState(false);
  const [csQuestions, setCsQuestions] = useState([{ text: '', type: 'Text Input', required: true, options: ['', ''] }]);
  const [csSaving, setCsSaving] = useState(false);

  // ─── Filter State for Responses View ───────────────────────────────────────
  const [rsSearch, setRsSearch] = useState('');
  const [rsCourse, setRsCourse] = useState('');
  const [rsBatches, setRsBatches] = useState([]);
  const [rsFrom, setRsFrom] = useState('');
  const [rsTo, setRsTo] = useState('');
  const [showRsFilterModal, setShowRsFilterModal] = useState(false);
  const [rsPage, setRsPage] = useState(1);
  const [rsPageSize, setRsPageSize] = useState(20);
  const [rsTotal, setRsTotal] = useState(0);
  const [rsServerLastPage, setRsServerLastPage] = useState(1);

  // Server-side consolidated summary for the analytics cards (see §4.3). Covers
  // the whole filtered response set, not just the page shown in the table.
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const filteredBatchesForCourse = useMemo(
    () => availableBatches.filter((b) => !rsCourse || b.courseId === rsCourse),
    [rsCourse]
  );

  const filteredResponses = useMemo(() => {
    if (!activeSurvey) return [];
    let next = [...(activeSurvey.responses || [])];
    
    if (rsSearch.trim()) {
      const q = rsSearch.toLowerCase();
      next = next.filter(r => (r.studentName || '').toLowerCase().includes(q) || (r.studentEmail || '').toLowerCase().includes(q));
    }
    if (rsCourse) {
      next = next.filter(r => r.courseId === rsCourse);
    }
    if (rsBatches.length) {
      next = next.filter(r => rsBatches.includes(r.batchId));
    }
    if (rsFrom) next = next.filter(r => new Date(r.date) >= new Date(rsFrom));
    if (rsTo) next = next.filter(r => new Date(r.date) <= new Date(rsTo));
    
    return next;
  }, [activeSurvey, rsSearch, rsCourse, rsBatches, rsFrom, rsTo]);

  const hasActiveRsFilters = rsSearch || rsCourse || rsBatches.length || rsFrom || rsTo;
  const rsModalFilterCount = (rsCourse ? 1 : 0) + (rsBatches.length ? 1 : 0) + (rsFrom ? 1 : 0) + (rsTo ? 1 : 0);
  const hasRsModalFilters = rsModalFilterCount > 0;

  // Pagination is server-driven (rsTotal / rsServerLastPage). Client only
  // slices when a course filter (not sent to API) shrinks the visible set.
  const rsTotalPages = Math.max(1, rsServerLastPage || 1);
  const rsSafePage = Math.min(rsPage, rsTotalPages);
  const rsStart = (rsSafePage - 1) * rsPageSize;
  const visibleResponses = filteredResponses;
  const rsShowingStart = rsTotal === 0 ? 0 : rsStart + 1;
  const rsShowingEnd = Math.min(rsStart + rsPageSize, rsTotal);

  useEffect(() => { setRsPage(1); }, [rsSearch, rsCourse, rsBatches, rsFrom, rsTo, rsPageSize, activeSurvey?.id]);

  useEffect(() => {
    if (currentView !== 'responses' || !activeSurvey?.id) return;
    const timer = setTimeout(() => {
      fetchResponses(activeSurvey.id, { page: rsPage, size: rsPageSize });
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentView, activeSurvey?.id, rsPage, rsPageSize, rsSearch, rsBatches, rsFrom, rsTo]);

  // Summary tracks the same filters as the table but not paging — the server
  // aggregates over the whole filtered set, so the cards stay correct as the
  // user pages through responses.
  useEffect(() => {
    if (currentView !== 'responses' || !activeSurvey?.id) return;
    const timer = setTimeout(() => {
      fetchSummary(activeSurvey.id);
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentView, activeSurvey?.id, rsSearch, rsBatches, rsFrom, rsTo]);

  function rsPageNumbers() {
    const total = rsTotalPages;
    const cur = rsSafePage;
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    if (cur <= 4) return [1, 2, 3, 4, 5, '...', total];
    if (cur >= total - 3) return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
    return [1, '...', cur - 1, cur, cur + 1, '...', total];
  }

  function openStudentProfile(r) {
    if (!r || r.isAnonymous) return;
    window.localStorage.setItem('selectedStudent', JSON.stringify({
      id: r.candidateId,
      name: r.studentName,
      email: r.studentEmail,
    }));
    window.open(`${window.location.origin}/candidate-detail`, '_blank', 'noopener,noreferrer');
  }

  function handleDownloadCsv() {
    if (!activeSurvey || filteredResponses.length === 0) return showToast('error', 'Error', 'No responses to download.');

    const headers = ['Date', 'Student_Name', 'Student_Email', 'Course_ID', 'Batch_ID', 'Is_Anonymous'];
    activeSurvey.questions.forEach((q, i) => headers.push(`Q${i+1}: ${q.text.replace(/,/g, '')}`));

    const rows = filteredResponses.map(r => {
      const row = [
        r.date,
        r.isAnonymous ? 'Anonymous' : (r.studentName || ''),
        r.isAnonymous ? '' : (r.studentEmail || ''),
        r.courseId || '',
        r.batchId || '',
        r.isAnonymous ? 'Yes' : 'No'
      ];
      activeSurvey.questions.forEach((q, i) => {
        let ans = r.answers[i] || '';
        if (typeof ans === 'string') ans = ans.replace(/"/g, '""');
        row.push(`"${ans}"`);
      });
      return row.join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Survey_${activeSurvey.id}_Responses.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showToast('success', 'Download Started', 'Your CSV file is downloading.');
  }

  async function handleAction(survey, action) {
    try {
      if (action === 'pause') {
        await pauseSurvey(survey.id);
        showToast('info', 'Survey Paused', 'Users will see a warning that responses are no longer accepted.');
        await loadSurveys();
      } else if (action === 'resume') {
        await resumeSurvey(survey.id);
        showToast('success', 'Survey Resumed', 'The survey is accepting responses again.');
        await loadSurveys();
      } else if (action === 'recall') {
        await recallSurvey(survey.id);
        showToast('info', 'Survey Recalled', 'The survey has been recalled and is no longer visible to users.');
        await loadSurveys();
      } else if (action === 'view_responses') {
        setActiveSurvey({ ...survey, responses: [] });
        setRsSearch(''); setRsCourse(''); setRsBatches([]); setRsFrom(''); setRsTo('');
        setRsPage(1);
        setSummary(null);
        setCurrentView('responses');
        setSearchParams((sp) => {
          const next = new URLSearchParams(sp);
          next.set('id', String(survey.id));
          return next;
        }, { replace: true });
        // fetchResponses is fired by the useEffect on currentView/activeSurvey changes
      } else if (action === 'view_survey') {
        setSurveyToView(survey);
      }
    } catch (error) {
      showToast('error', 'Action failed', error?.response?.data?.error?.message || error?.response?.data?.message || error.message || 'Action could not be completed.');
    }
  }

  async function fetchResponses(surveyId, opts = {}) {
    const page = opts.page ?? rsPage;
    const size = opts.size ?? rsPageSize;
    try {
      const resp = await listResponses(surveyId, {
        page,
        size,
        q: rsSearch || undefined,
        batchId: (rsBatches && rsBatches.length === 1) ? rsBatches[0] : undefined,
        dateFrom: rsFrom ? rsFrom.slice(0, 10) : undefined,
        dateTo: rsTo ? rsTo.slice(0, 10) : undefined,
      });
      const rows = resp?.data || resp?.responses || (Array.isArray(resp) ? resp : []) || [];
      const meta = resp?.pagination || resp?.meta || {};
      setRsTotal(Number(meta.total ?? rows.length));
      setRsServerLastPage(Number(meta.lastPage ?? meta.totalPages ?? Math.max(1, Math.ceil((meta.total ?? rows.length) / size))));
      // Schema responses: [{ id, fk_id_registered_candidates, response: JSON, submittedAt }]
      // Backend is expected to enrich with student name/email/batch when available.
      const ui = rows.map((r) => {
        const answersArr = (() => {
          if (Array.isArray(r.response)) return r.response;
          try { return JSON.parse(r.response || '[]'); } catch (_e) { return []; }
        })();
        const answersByQ = {};
        answersArr.forEach((a) => { if (a && a.q != null) answersByQ[Number(a.q)] = a.a; });
        return {
          id: r.id,
          studentName: r.studentName || r.candidateName || '',
          studentEmail: r.studentEmail || r.email || '',
          candidateId: r.fk_id_registered_candidates ?? r.candidateId ?? null,
          courseId: r.courseId || '',
          batchId: r.batchId || '',
          date: r.submittedAt ? new Date(Number(r.submittedAt) * 1000).toISOString() : (r.submittedAtIso || ''),
          isAnonymous: !r.studentName && !r.candidateName,
          // For UI cells indexed by question order
          answers: (activeSurvey?.questions || []).map((_, i) => {
            const raw = answersByQ[i + 1];
            if (Array.isArray(raw)) return raw.join(', ');
            return raw == null ? '' : String(raw);
          }),
          rawAnswers: answersByQ,
        };
      });
      setActiveSurvey((cur) => (cur ? { ...cur, responses: ui } : cur));
    } catch (error) {
      showToast('error', 'Load failed', error?.response?.data?.error?.message || error?.response?.data?.message || error.message || 'Could not load responses.');
    }
  }

  async function fetchSummary(surveyId) {
    setSummaryLoading(true);
    try {
      const resp = await getSurveySummary(surveyId, {
        q: rsSearch || undefined,
        batchId: (rsBatches && rsBatches.length === 1) ? rsBatches[0] : undefined,
        dateFrom: rsFrom ? rsFrom.slice(0, 10) : undefined,
        dateTo: rsTo ? rsTo.slice(0, 10) : undefined,
      });
      setSummary(resp?.data || resp || null);
    } catch (error) {
      showToast('error', 'Summary failed', error?.response?.data?.error?.message || error?.response?.data?.message || error.message || 'Could not load summary.');
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }

  async function handleCreateSurvey(e) {
    e.preventDefault();
    if (!csTitle.trim()) return showToast('error', 'Error', 'Please enter a title.');
    if (!csQuestions.length) return showToast('error', 'Error', 'Add at least one question.');

    for (let i = 0; i < csQuestions.length; i += 1) {
      const q = csQuestions[i];
      if (!q.text || !q.text.trim()) return showToast('error', 'Error', `Question ${i + 1} text is required.`);
      if (q.type === 'Multi Select') {
        if (!q.options || q.options.length < 2) return showToast('error', 'Error', `Question ${i + 1} needs at least 2 options.`);
        if (q.options.some((o) => !o.trim())) return showToast('error', 'Error', `All options in Question ${i + 1} must be filled.`);
      }
    }

    let audienceType;
    let audienceBatchIds;
    if (csAudience === 'All Registered Students') {
      audienceType = SURVEY_AUDIENCE.OPEN;
    } else if (csAudience === 'All Enrolled Students') {
      audienceType = SURVEY_AUDIENCE.ALL_ENROLLED;
    } else if (csAudience === 'Multi Selected Batches') {
      if (csSelectedBatches.length === 0) return showToast('error', 'Error', 'Please select at least one batch.');
      audienceType = SURVEY_AUDIENCE.BATCH;
      audienceBatchIds = csSelectedBatches;
    } else if (csAudience === 'Multi Selected Courses') {
      // Resolve courses → batches (course-to-batch mapping lives in availableBatches)
      const resolved = availableBatches.filter((b) => csSelectedCourses.includes(b.courseId)).map((b) => b.id);
      if (resolved.length === 0) return showToast('error', 'Error', 'Selected courses have no associated batches.');
      audienceType = SURVEY_AUDIENCE.BATCH;
      audienceBatchIds = resolved;
    }

    if (csWindowType === 'strict' && !csDeadline) return showToast('error', 'Error', 'Please set a deadline.');

    const payload = {
      title: csTitle.trim(),
      brief: csBrief.trim(),
      surveyContent: questionsToSchema(csQuestions),
      anonymousSubmissionsAllowed: csAnonymous ? 1 : 0,
      multipleSubmissionsAllowed: csMultipleAllowed ? 1 : 0,
      audienceType,
      closesAt: csWindowType === 'strict' ? Math.floor(new Date(csDeadline).getTime() / 1000) : null,
    };
    if (audienceBatchIds) payload.audienceBatchIds = audienceBatchIds;

    setCsSaving(true);
    try {
      await createSurvey(payload);
      showToast('success', 'Survey Created', 'Your survey is now live.');
      setCurrentView('list');
      // Reset
      setCsTitle(''); setCsBrief(''); setCsWindowType('open'); setCsDeadline('');
      setCsAnonymous(false); setCsMultipleAllowed(false);
      setCsQuestions([{ text: '', type: 'Text Input', required: true, options: ['', ''] }]);
      setCsSelectedCourses([]); setCsSelectedBatches([]); setCsAudience('All Registered Students');
      await loadSurveys();
    } catch (error) {
      showToast('error', 'Create failed', error?.response?.data?.error?.message || error?.response?.data?.message || error.message || 'Could not create survey.');
    } finally {
      setCsSaving(false);
    }
  }

  return (
    <div className="quiz-attempt-report-page data-table-page" style={{ minHeight: '100vh' }}>
      <ToastRegion toasts={toasts} onDismiss={(id) => setToasts((cur) => cur.filter((t) => t.id !== id))} />

      {(currentView === 'list' || currentView === 'create') && (
        <section className="courses-list-page" style={{ padding: 0 }}>
          <div className="page-header-section">
            <div className="page-header-title-group">
              <span className="page-header-icon-box"><Icon className="fa fa-bar-chart" /></span>
              <div>
                <h2>Survey Dashboard</h2>
                <p>Create, dispatch, and review custom surveys for students.</p>
              </div>
            </div>
            <Can permission={PERMS.SURVEYS_EDIT}>
              <button type="button" className="page-action-button" onClick={() => setCurrentView('create')}>
                <Icon className="ti ti-plus" /> Create Survey
              </button>
            </Can>
          </div>

          <div className="filter-bar" style={{ marginBottom: '24px' }}>
            <div className="search-wrapper">
              <Icon className={`ti ${listSearch ? 'ti-close' : 'ti-search'}`} onClick={() => setListSearch('')} aria-hidden="true" />
              <input
                type="text"
                className="search-input"
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
                placeholder="Search surveys by title or brief..."
              />
            </div>

            <FilterDropdown
              label="All Statuses"
              value={listStatusFilter}
              options={[
                { value: 'all', label: 'All Statuses' },
                { value: String(SURVEY_STATUS.ACTIVE), label: SURVEY_STATUS_LABEL[SURVEY_STATUS.ACTIVE] },
                { value: String(SURVEY_STATUS.PAUSED), label: SURVEY_STATUS_LABEL[SURVEY_STATUS.PAUSED] },
                { value: String(SURVEY_STATUS.RECALLED), label: SURVEY_STATUS_LABEL[SURVEY_STATUS.RECALLED] },
              ]}
              onChange={(value) => setListStatusFilter(value)}
            />

            <FilterDropdown
              label="All Responses"
              value={listResponseFilter}
              options={[
                { value: 'all', label: 'All Responses' },
                { value: 'has_responses', label: 'Has Responses (> 0)' },
                { value: 'zero_responses', label: 'No Responses (0)' },
              ]}
              onChange={(value) => setListResponseFilter(value)}
            />

            <FilterDropdown
              label="All Audiences"
              value={listAudienceFilter}
              options={[
                { value: '', label: 'All Audiences' },
                { value: String(SURVEY_AUDIENCE.OPEN), label: SURVEY_AUDIENCE_LABEL[SURVEY_AUDIENCE.OPEN] },
                { value: String(SURVEY_AUDIENCE.ALL_ENROLLED), label: SURVEY_AUDIENCE_LABEL[SURVEY_AUDIENCE.ALL_ENROLLED] },
                { value: String(SURVEY_AUDIENCE.BATCH), label: SURVEY_AUDIENCE_LABEL[SURVEY_AUDIENCE.BATCH] },
              ]}
              onChange={(value) => setListAudienceFilter(value)}
            />

            {hasActiveListFilters && (
              <button type="button" className="filter-clear-btn" onClick={() => {
                setListSearch(''); setListStatusFilter('all'); setListResponseFilter('all'); setListAudienceFilter('');
              }}>
                <Icon className="ti ti-close" /> Clear
              </button>
            )}
          </div>

          <div className="students-table-container">
            <table className={`students-table ${surveysLoading ? 'thead-loading' : ''}`}>
              <thead>
                <tr>
                  <th>Survey Details</th>
                  <th>Target Audience</th>
                  <th>Time Window</th>
                  <th>Anonymous</th>
                  <th>Status</th>
                  <th>Responses</th>
                  <th style={{ width: '80px', textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              {surveysLoading ? (
                <tbody>
                  {Array.from({ length: 8 }, (_, i) => (
                    <tr key={`sk-${i}`}>
                      {Array.from({ length: 7 }, (_, j) => (
                        <td key={j}><div className="table-skeleton medium" /></td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              ) : (
              <tbody>
                {pagedSurveys.length > 0 ? pagedSurveys.map(s => (
                  <tr key={s.id}>
                    <td>
                      <div className="student-name-cell">
                        <div>
                          <div className="student-name">{s.title}</div>
                          <div className="student-id">ID: {s.id}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="contact-info">
                        {s.audienceType === SURVEY_AUDIENCE.BATCH && s.audienceBatchIds.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => setAudienceModalSurvey(s)}
                            style={{ background: 'none', border: 'none', padding: 0, color: '#006073', fontWeight: 600, textDecoration: 'underline', cursor: 'pointer' }}
                          >
                            {s.audienceLabel}
                          </button>
                        ) : (
                          s.audienceLabel
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="contact-info">
                        <Icon className="ti ti-calendar" style={{ marginRight: '6px' }} />
                        {timeWindowLabel(s)}
                      </div>
                    </td>
                    <td>{s.anonymousSubmissionsAllowed ? <span style={{ color: '#006073', fontWeight: 'bold' }}>Yes</span> : <span style={{ color: '#dc2626', fontWeight: 'bold' }}>No</span>}</td>
                    <td>
                      <SurveyStatus statusInt={s.status} />
                    </td>
                    <td>
                      <span className="courses-badge" style={{ fontWeight: 'bold', background: '#eef4f5', color: '#006073', padding: '4px 12px', borderRadius: '12px' }}>
                        {s.responseCount}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <KebabMenu survey={s} onAction={handleAction} can={can} />
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '40px' }}>
                      <div className="qar-empty-state" style={{ border: 'none', background: 'transparent' }}>
                        <Icon className="ti ti-search" />
                        <h4>No Surveys Found</h4>
                        <p>Adjust your filters or create a new survey.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
              )}
            </table>

            {!surveysLoading && filteredSurveys.length > 0 && (
              <div className="pagination-container">
                <div className="pagination-info">
                  <span>Showing {listShowingStart} to {listShowingEnd} of {filteredSurveys.length} entries</span>
                  <select className="page-size-select" value={listPageSize} onChange={(e) => setListPageSize(Number(e.target.value))}>
                    {[20, 50, 100, 200].map((s) => (
                      <option key={s} value={s}>Show {s}</option>
                    ))}
                  </select>
                </div>
                <div className="pagination-controls">
                  <button type="button" className="pagination-btn" disabled={listSafePage === 1} onClick={() => setListPage((p) => Math.max(1, p - 1))}>
                    <Icon className="ti ti-angle-left" /> Previous
                  </button>
                  {listPageNumbers().map((p, idx) => (
                    p === '...' ? (
                      <span key={`le-${idx}`} className="pagination-ellipsis">...</span>
                    ) : (
                      <button key={p} type="button" className={`pagination-btn${listSafePage === p ? ' active' : ''}`} onClick={() => setListPage(p)}>{p}</button>
                    )
                  ))}
                  <button type="button" className="pagination-btn" disabled={listSafePage === listTotalPages} onClick={() => setListPage((p) => Math.min(listTotalPages, p + 1))}>
                    Next <Icon className="ti ti-angle-right" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {currentView === 'create' && (
        <div className="legacy-modal-backdrop active" onMouseDown={(e) => { if (e.target === e.currentTarget && !csSaving) setCurrentView('list'); }}>
          <div className="legacy-modal-dialog legacy-large" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
            <div className="legacy-modal-header">
              <h3><Icon className="ti ti-pencil" /> Create a New Survey</h3>
              <button type="button" className="legacy-modal-close" onClick={() => setCurrentView('list')}><Icon className="ti ti-close" /></button>
            </div>

          <form className="survey-modal-form form-modal" onSubmit={handleCreateSurvey}>
            <div className="legacy-modal-body">

              <div className="asset-form-section">
                <div className="asset-form-section-title"><Icon className="ti ti-info-circle" /> Survey Details</div>
                <div className="asset-form-grid basic-grid">
                  <label className="field-cell">
                    <div className="float-field">
                      <input type="text" className="float-control" placeholder=" " value={csTitle} onChange={e => setCsTitle(e.target.value)} required />
                      <span className="float-label">Survey Title <span className="req">*</span></span>
                    </div>
                  </label>
                  <label className="field-cell">
                    <div className="float-field float-always">
                      <select className="float-control" value={csAudience} onChange={e => setCsAudience(e.target.value)}>
                        <option value="All Registered Students">All Registered Students</option>
                        <option value="All Enrolled Students">All Enrolled Students</option>
                        <option value="Multi Selected Courses">Multi Selected Courses</option>
                        <option value="Multi Selected Batches">Multi Selected Batches</option>
                      </select>
                      <span className="float-label">Target Audience</span>
                    </div>
                  </label>
                  <label className="field-cell full-span">
                    <div className="float-field float-textarea">
                      <textarea className="float-control" rows={2} placeholder=" " value={csBrief} onChange={(e) => setCsBrief(e.target.value)} />
                      <span className="float-label">Brief</span>
                    </div>
                    <span className="field-hint">Short description shown to respondents.</span>
                  </label>
                  {csAudience === 'Multi Selected Courses' && (
                    <label className="field-cell full-span">
                      <span className="field-static-label">Select Courses</span>
                      <CourseMultiSelect courses={availableCourses} selected={csSelectedCourses} onChange={setCsSelectedCourses} />
                    </label>
                  )}
                  {csAudience === 'Multi Selected Batches' && (
                    <label className="field-cell full-span">
                      <span className="field-static-label">Select Batches</span>
                      <BatchMultiSelect batches={availableBatches} selected={csSelectedBatches} onChange={setCsSelectedBatches} />
                    </label>
                  )}
                </div>
              </div>

              <div className="asset-form-section">
                <div className="asset-form-section-title"><Icon className="ti ti-settings" /> Availability &amp; Access</div>
                <div className="asset-form-grid">
                  <label className="field-cell">
                    <div className="float-field float-always">
                      <select className="float-control" value={csWindowType} onChange={e => setCsWindowType(e.target.value)}>
                        <option value="open">Open Ended</option>
                        <option value="strict">Strict Deadline</option>
                      </select>
                      <span className="float-label">Time Window</span>
                    </div>
                  </label>
                  {csWindowType === 'strict' && (
                    <label className="field-cell">
                      <div className="float-field float-always date-custom">
                        <input
                          type="datetime-local"
                          className="float-control"
                          value={csDeadline}
                          onChange={e => setCsDeadline(e.target.value)}
                          onClick={openDatePicker}
                          onKeyDown={openDatePicker}
                          required
                        />
                        <span className="float-label">Deadline Date &amp; Time <span className="req">*</span></span>
                        <span className={`date-display ${!csDeadline ? 'is-empty' : ''}`}>
                          {csDeadline ? formatDeadlineLabel(csDeadline) : 'Set Date & Time'}
                        </span>
                      </div>
                    </label>
                  )}
                  <div className="full-span survey-toggle-grid">
                    <label className="field-cell survey-toggle-row" htmlFor="anonToggle">
                      <input type="checkbox" id="anonToggle" className="survey-toggle-check" checked={csAnonymous} onChange={e => setCsAnonymous(e.target.checked)} />
                      <span>
                        <strong>Accept Anonymous Responses</strong>
                        <small>Collect feedback without recording who submitted it.</small>
                      </span>
                    </label>
                    <label className="field-cell survey-toggle-row" htmlFor="multiToggle">
                      <input type="checkbox" id="multiToggle" className="survey-toggle-check" checked={csMultipleAllowed} onChange={(e) => setCsMultipleAllowed(e.target.checked)} />
                      <span>
                        <strong>Allow Multiple Submissions per User</strong>
                        <small>Let the same respondent submit more than once.</small>
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="asset-form-section">
                <div className="asset-form-section-title"><Icon className="ti ti-list-check" /> Questions Base</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {csQuestions.map((q, idx) => (
                    <div key={idx} className="survey-question-card">

                      <div className="asset-form-grid" style={{ gridTemplateColumns: '3fr 1fr auto auto', alignItems: 'start' }}>
                        <label className="field-cell">
                          <div className="float-field">
                            <input type="text" className="float-control" placeholder=" " value={q.text} onChange={e => {
                              const n = [...csQuestions]; n[idx].text = e.target.value; setCsQuestions(n);
                            }} required />
                            <span className="float-label">Question {idx + 1} <span className="req">*</span></span>
                          </div>
                        </label>
                        <label className="field-cell">
                          <div className="float-field float-always">
                            <select className="float-control" value={q.type} onChange={e => {
                              const n = [...csQuestions]; n[idx].type = e.target.value; setCsQuestions(n);
                            }}>
                              <option>Text Input</option>
                              <option>Star Rating</option>
                              <option>Multi Select</option>
                            </select>
                            <span className="float-label">Type</span>
                          </div>
                        </label>
                        <label className="field-cell survey-required-cell">
                          <span className="field-static-label">Required</span>
                          <input type="checkbox" className="survey-toggle-check" checked={q.required} onChange={e => {
                            const n = [...csQuestions]; n[idx].required = e.target.checked; setCsQuestions(n);
                          }} />
                        </label>
                        {csQuestions.length > 1 && (
                          <button type="button" className="survey-icon-btn danger" onClick={() => setCsQuestions(csQuestions.filter((_, i) => i !== idx))}>
                            <Icon className="ti ti-trash" />
                          </button>
                        )}
                      </div>

                      {q.type === 'Multi Select' && (
                        <div className="survey-options-box">
                          <span className="field-static-label">Define Options</span>
                          {(q.options || []).map((opt, oIdx) => (
                            <div key={oIdx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <div className="float-field" style={{ flex: 1 }}>
                                <input type="text" className="float-control" placeholder=" " value={opt} onChange={e => {
                                  const n = [...csQuestions]; n[idx].options[oIdx] = e.target.value; setCsQuestions(n);
                                }} />
                                <span className="float-label">Option {oIdx + 1}</span>
                              </div>
                              {(q.options || []).length > 2 && (
                                <button type="button" className="survey-icon-btn danger" onClick={() => {
                                  const n = [...csQuestions]; n[idx].options = n[idx].options.filter((_, i) => i !== oIdx); setCsQuestions(n);
                                }}>
                                  <Icon className="ti ti-trash" />
                                </button>
                              )}
                            </div>
                          ))}
                          <button type="button" className="survey-add-btn" style={{ alignSelf: 'flex-start' }} onClick={() => {
                            const n = [...csQuestions];
                            if (!n[idx].options) n[idx].options = [];
                            n[idx].options.push('');
                            setCsQuestions(n);
                          }}>
                            <Icon className="ti ti-plus" /> Add Option
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <button type="button" className="survey-add-btn block" onClick={() => setCsQuestions([...csQuestions, { text: '', type: 'Text Input', required: true, options: ['', ''] }])}>
                  <Icon className="ti ti-plus" /> Add Next Question
                </button>
              </div>

            </div>

            <div className="legacy-modal-footer">
              <button type="button" className="legacy-btn legacy-btn-default" onClick={() => setCurrentView('list')}>Cancel</button>
              <button type="submit" className="legacy-btn legacy-btn-success" disabled={csSaving}>
                {csSaving ? 'Creating...' : <><Icon className="ti ti-check" /> Create Survey</>}
              </button>
            </div>
          </form>
          </div>
        </div>
      )}

      {currentView === 'responses' && activeSurvey && (
        <>
          <div className="page-header-section" style={{ flexWrap: 'wrap' }}>
            <div>
              <h2><Icon className="ti ti-bar-chart-alt" /> {activeSurvey.title} - Responses</h2>
              <p>Detailed analytical view of all feedback received for this survey.</p>
            </div>
            <button type="button" className="page-action-button" onClick={() => { setCurrentView('list'); setSearchParams((sp) => { const next = new URLSearchParams(sp); next.delete('id'); return next; }, { replace: true }); }}>
              <Icon className="ti ti-arrow-left" /> Back to Dashboard
            </button>
          </div>

          {/* Consolidated summary — aggregated server-side over the whole
              filtered response set (§4.3), so it stays correct across pages. */}
          {summary && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', marginBottom: '20px', fontSize: '13px', color: '#59757b' }}>
              <span><strong style={{ color: '#006073', fontSize: '16px' }}>{summary.totalResponses ?? rsTotal}</strong> total responses</span>
              {Number(summary.anonymousCount) > 0 && <span><strong style={{ color: 'var(--ink)' }}>{summary.anonymousCount}</strong> anonymous</span>}
              {summary.lastResponseAt && <span>Last response {formatDateTime(new Date(Number(summary.lastResponseAt) * 1000).toISOString())}</span>}
            </div>
          )}

          {summaryLoading && !summary ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginBottom: '24px' }}>
              {Array.from({ length: 2 }, (_, i) => (
                <div key={i} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: '12px', padding: '20px' }}>
                  <div className="table-skeleton medium" style={{ marginBottom: '12px' }} />
                  <div className="table-skeleton medium" />
                </div>
              ))}
            </div>
          ) : summary && Array.isArray(summary.questions) ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginBottom: '24px' }}>
              {summary.questions.map((sq) => {
                const qIndex = Number(sq.o) - 1;
                const q = activeSurvey.questions[qIndex];
                if (!q) return null;

                if (sq.t === 'RATING') {
                  if (!sq.answered) return null;
                  const avg = Number(sq.average || 0).toFixed(1);
                  return (
                    <div key={sq.o} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: '12px', padding: '20px' }}>
                      <div style={{ fontSize: '13px', color: '#59757b', marginBottom: '4px', fontWeight: 'bold', textTransform: 'uppercase' }}>Avg. Rating on QN #{sq.o}</div>
                      <div style={{ fontWeight: 'bold', marginBottom: '16px', color: 'var(--ink)' }}>{q.text}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '32px', fontWeight: 'bold', color: '#006073', lineHeight: 1 }}>{avg}</span>
                        <div style={{ display: 'flex', color: '#fbbf24', fontSize: '20px', gap: '2px' }}>
                          {[1, 2, 3, 4, 5].map(star => (
                            <Icon key={star} className="fa fa-star" style={{ color: star <= Math.round(Number(avg)) ? '#fbbf24' : '#d6dde0' }} />
                          ))}
                        </div>
                        <span style={{ fontSize: '12px', color: '#59757b', marginLeft: 'auto' }}>{sq.answered} responses</span>
                      </div>
                    </div>
                  );
                }

                if (sq.t === 'MULTI') {
                  if (!sq.answered) return null;
                  const options = Array.isArray(sq.options) ? sq.options : [];
                  return (
                    <div key={sq.o} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: '12px', padding: '20px' }}>
                      <div style={{ fontSize: '13px', color: '#59757b', marginBottom: '4px', fontWeight: 'bold', textTransform: 'uppercase' }}>Summary of QN #{sq.o}</div>
                      <div style={{ fontWeight: 'bold', marginBottom: '16px', color: 'var(--ink)' }}>{q.text}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {options.map((opt) => {
                          const pct = Math.round(Number(opt.percent ?? 0));
                          return (
                            <div key={opt.label} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                                <span style={{ fontWeight: '500' }}>{opt.label}</span>
                                <span style={{ color: '#59757b' }}><strong>{pct}%</strong> <span style={{ opacity: 0.7 }}>({opt.count} responses)</span></span>
                              </div>
                              <div style={{ width: '100%', height: '8px', background: '#eef4f5', borderRadius: '4px', overflow: 'hidden' }}>
                                <div style={{ width: `${pct}%`, height: '100%', background: '#00a8cc', borderRadius: '4px' }}></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                }

                return null;
              })}
            </div>
          ) : null}

          <div className="filter-bar" style={{ marginBottom: '12px' }}>
            <div className="search-wrapper">
              <Icon className={`ti ${rsSearch ? 'ti-close' : 'ti-search'}`} onClick={() => setRsSearch('')} aria-hidden="true" />
              <input
                type="text"
                className="search-input"
                value={rsSearch}
                onChange={(e) => setRsSearch(e.target.value)}
                placeholder="Search by student name or email..."
              />
            </div>

            <button
              type="button"
              className={`filter-toggle-btn${hasRsModalFilters ? ' active' : ''}`}
              onClick={() => setShowRsFilterModal(true)}
            >
              <Icon className="ti ti-filter" /> Filters
              {hasRsModalFilters && <span className="filter-count">{rsModalFilterCount}</span>}
            </button>

            {hasActiveRsFilters && (
              <button type="button" className="filter-clear-btn" onClick={() => {
                setRsSearch(''); setRsCourse(''); setRsBatches([]); setRsFrom(''); setRsTo('');
              }}>
                <Icon className="ti ti-close" /> Clear
              </button>
            )}

            <Can permission={PERMS.SURVEYS_RESPONSES_EXPORT}>
              <button
                type="button"
                className="ear-btn-export"
                disabled={filteredResponses.length === 0}
                onClick={handleDownloadCsv}
                style={{ marginLeft: 'auto', background: '#006073', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: filteredResponses.length === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px', opacity: filteredResponses.length === 0 ? 0.5 : 1 }}
              >
                <Icon className="ti ti-download" /> Export to CSV
              </button>
            </Can>
          </div>

          <div className="students-table-container">
            <table className="students-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Student</th>
                  {activeSurvey.questions.map((q, i) => (
                    <th key={i} style={{ maxWidth: '200px' }}>Q{i + 1}: {q.text}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleResponses.length > 0 ? visibleResponses.map(r => (
                  <tr key={r.id}>
                    <td className="qar-datetime">{formatDateTime(r.date)}</td>
                    <td>
                      {r.isAnonymous ? (
                        <span style={{ fontStyle: 'italic', color: '#6c757d' }}>Anonymous</span>
                      ) : (
                        <a
                          href={`${window.location.origin}/candidate-detail`}
                          onClick={(e) => { e.preventDefault(); openStudentProfile(r); }}
                          style={{ color: '#006073', fontWeight: 500, cursor: 'pointer', textDecoration: 'none' }}
                        >
                          {r.studentName}
                        </a>
                      )}
                    </td>
                    {activeSurvey.questions.map((q, i) => {
                      const ans = r.answers[i];
                      if ((q.type === 'Star Rating' || q.type === 'Rating') && Number(ans) > 0) {
                        const val = Math.round(Number(ans));
                        return (
                          <td key={i}>
                            <span style={{ display: 'inline-flex', gap: '2px', color: '#fbbf24', fontSize: '15px' }}>
                              {[1, 2, 3, 4, 5].map((s) => (
                                <Icon key={s} className="fa fa-star" style={{ color: s <= val ? '#fbbf24' : '#d6dde0' }} />
                              ))}
                            </span>
                          </td>
                        );
                      }
                      return <td key={i}>{ans || '-'}</td>;
                    })}
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={2 + activeSurvey.questions.length} style={{ textAlign: 'center', padding: '40px' }}>
                      <div className="qar-empty-state" style={{ border: 'none', background: 'transparent' }}>
                        <Icon className="ti ti-search" />
                        <h4>No Responses Found</h4>
                        <p>Adjust your filters or wait for students to submit.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {filteredResponses.length > 0 && (
              <div className="pagination-container">
                <div className="pagination-info">
                  <span>Showing {rsShowingStart} to {rsShowingEnd} of {rsTotal} entries</span>
                  <select className="page-size-select" value={rsPageSize} onChange={(e) => setRsPageSize(Number(e.target.value))}>
                    {[20, 50, 100, 200].map((s) => (
                      <option key={s} value={s}>Show {s}</option>
                    ))}
                  </select>
                </div>
                <div className="pagination-controls">
                  <button type="button" className="pagination-btn" disabled={rsSafePage === 1} onClick={() => setRsPage((p) => Math.max(1, p - 1))}>
                    <Icon className="ti ti-angle-left" /> Previous
                  </button>
                  {rsPageNumbers().map((p, idx) => (
                    p === '...' ? (
                      <span key={`el-${idx}`} className="pagination-ellipsis">...</span>
                    ) : (
                      <button key={p} type="button" className={`pagination-btn${rsSafePage === p ? ' active' : ''}`} onClick={() => setRsPage(p)}>{p}</button>
                    )
                  ))}
                  <button type="button" className="pagination-btn" disabled={rsSafePage === rsTotalPages} onClick={() => setRsPage((p) => Math.min(rsTotalPages, p + 1))}>
                    Next <Icon className="ti ti-angle-right" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Responses Filter Modal ── */}
      {showRsFilterModal && (
        <div className="legacy-modal-backdrop active" onClick={() => setShowRsFilterModal(false)}>
          <div className="legacy-modal-dialog" role="dialog" aria-modal="true" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="legacy-modal-header">
              <h3><Icon className="ti ti-filter" /> Filter Responses</h3>
              <button type="button" className="legacy-modal-close" onClick={() => setShowRsFilterModal(false)}>
                <Icon className="ti ti-close" />
              </button>
            </div>
            <div className="survey-filter-form form-modal">
              <div className="legacy-modal-body">

                <div className="asset-form-section">
                  <div className="asset-form-section-title"><Icon className="ti ti-calendar" /> Date Range</div>
                  <div className="asset-form-grid">
                    <label className="field-cell">
                      <div className="float-field float-always date-custom">
                        <input
                          type="datetime-local"
                          className="float-control"
                          value={rsFrom}
                          onChange={(e) => setRsFrom(e.target.value)}
                          onClick={openDatePicker}
                          onKeyDown={openDatePicker}
                        />
                        <span className="float-label">From Date</span>
                        <span className={`date-display ${!rsFrom ? 'is-empty' : ''}`}>
                          {rsFrom ? formatDeadlineLabel(rsFrom) : 'Set Date & Time'}
                        </span>
                      </div>
                    </label>
                    <label className="field-cell">
                      <div className="float-field float-always date-custom">
                        <input
                          type="datetime-local"
                          className="float-control"
                          value={rsTo}
                          onChange={(e) => setRsTo(e.target.value)}
                          onClick={openDatePicker}
                          onKeyDown={openDatePicker}
                        />
                        <span className="float-label">To Date</span>
                        <span className={`date-display ${!rsTo ? 'is-empty' : ''}`}>
                          {rsTo ? formatDeadlineLabel(rsTo) : 'Set Date & Time'}
                        </span>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="asset-form-section">
                  <div className="asset-form-section-title"><Icon className="ti ti-book" /> Course &amp; Batch</div>
                  <div className="asset-form-grid">
                    <label className="field-cell full-span">
                      <div className="float-field float-always">
                        <select className="float-control" value={rsCourse} onChange={(e) => { setRsCourse(e.target.value); setRsBatches([]); }}>
                          <option value="">All Courses</option>
                          {availableCourses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <span className="float-label">Course</span>
                      </div>
                    </label>
                    <label className="field-cell full-span">
                      <span className="field-static-label">Batch</span>
                      <BatchMultiSelect batches={filteredBatchesForCourse} selected={rsBatches} onChange={(val) => setRsBatches(val)} disabled={!rsCourse} />
                    </label>
                  </div>
                </div>

              </div>
              <div className="legacy-modal-footer">
                <button type="button" className="legacy-btn legacy-btn-default" onClick={() => { setRsCourse(''); setRsBatches([]); setRsFrom(''); setRsTo(''); }}>
                  <Icon className="ti ti-reload" /> Clear Filters
                </button>
                <button type="button" className="legacy-btn legacy-btn-success" onClick={() => setShowRsFilterModal(false)}>
                  <Icon className="ti ti-check" /> Apply Filters
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── View Survey Preview Modal ── */}
      {surveyToView && (
        <div className="legacy-modal-backdrop active" onClick={() => setSurveyToView(null)}>
          <div className="legacy-modal-dialog legacy-large" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="legacy-modal-header">
              <h3><Icon className="ti ti-desktop" /> Survey Preview: {surveyToView.title}</h3>
              <button type="button" className="legacy-modal-close" onClick={() => setSurveyToView(null)}>
                <Icon className="ti ti-close" />
              </button>
            </div>

            <div className="legacy-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="survey-preview-head">
                <div className="survey-preview-head-top">
                  <h4 className="survey-preview-title">{surveyToView.title}</h4>
                  <SurveyStatus statusInt={surveyToView.status} />
                </div>
                {surveyToView.brief ? <p className="survey-preview-brief">{surveyToView.brief}</p> : null}
                <div className="survey-meta-chips">
                  <div className="survey-meta-chip">
                    <span className="survey-meta-icon"><Icon className="ti ti-user" /></span>
                    <span className="survey-meta-text">
                      <small>Audience</small>
                      <strong>{surveyToView.audienceLabel}</strong>
                    </span>
                  </div>
                  <div className="survey-meta-chip">
                    <span className="survey-meta-icon"><Icon className="ti ti-eye" /></span>
                    <span className="survey-meta-text">
                      <small>Anonymous</small>
                      <strong>{surveyToView.anonymousSubmissionsAllowed ? 'Allowed' : 'Disabled'}</strong>
                    </span>
                  </div>
                  <div className="survey-meta-chip">
                    <span className="survey-meta-icon"><Icon className="ti ti-reload" /></span>
                    <span className="survey-meta-text">
                      <small>Multiple Submissions</small>
                      <strong>{surveyToView.multipleSubmissionsAllowed ? 'Allowed' : 'Disabled'}</strong>
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <h4 style={{ color: '#006073', marginBottom: '16px' }}>Configured Questions ({surveyToView.questions.length})</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {surveyToView.questions.map((q, i) => (
                    <div key={i} style={{ border: '1px solid var(--line)', borderRadius: '12px', padding: '16px', background: '#f8fafc' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <strong style={{ color: 'var(--ink)', fontSize: '14px' }}>{i + 1}. {q.text}</strong>
                        {q.required && <span style={{ color: '#dc2626', fontSize: '12px', fontWeight: 'bold' }}>Required</span>}
                      </div>
                      <div style={{ fontSize: '12px', color: '#59757b', marginBottom: '12px' }}><Icon className="ti ti-info-circle" /> Type: {q.type}</div>
                      
                      {q.type === 'Text Input' && (
                        <input type="text" disabled placeholder="Text response block..." style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--line)', borderRadius: '6px', background: '#eef4f5', color: '#a0aab2' }} />
                      )}
                      {(q.type === 'Star Rating' || q.type === 'Rating') && (
                        <div style={{ display: 'flex', color: '#fbbf24', fontSize: '24px', gap: '4px' }}>
                          {[1,2,3,4,5].map(s => <Icon key={s} className="ti ti-star" style={{ opacity: 0.4 }} /> )}
                        </div>
                      )}
                      {q.type === 'Multi Select' && q.options && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {q.options.map((opt, oItx) => (
                            <label key={oItx} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'not-allowed', opacity: 0.7 }}>
                              <input type="checkbox" disabled style={{ width: '16px', height: '16px' }} />
                              <span style={{ fontSize: '14px' }}>{opt}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {surveyToView.questions.length === 0 && (
                    <div style={{ color: '#59757b', fontSize: '13px', fontStyle: 'italic' }}>No questions configured for this survey.</div>
                  )}
                </div>
              </div>
            </div>
            <div className="legacy-modal-footer">
              <button type="button" className="legacy-btn legacy-btn-default" onClick={() => setSurveyToView(null)}>Close Preview</button>
            </div>
          </div>
        </div>
      )}

      {audienceModalSurvey && (
        <div className="crispr-modal-backdrop active" onMouseDown={(e) => { if (e.target === e.currentTarget) setAudienceModalSurvey(null); }}>
          <div className="crispr-modal-dialog" style={{ maxWidth: 480 }}>
            <div className="crispr-modal-header">
              <h3><Icon className="ti ti-target" /> Target Batches — {audienceModalSurvey.title}</h3>
              <button type="button" className="crispr-modal-close" onClick={() => setAudienceModalSurvey(null)}><Icon className="ti ti-close" /></button>
            </div>
            <div className="crispr-modal-body">
              <p style={{ margin: '0 0 16px', color: '#59757b', fontSize: '13px' }}>
                This survey is targeted to the following {audienceModalSurvey.audienceBatchIds.length} batch(es):
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {audienceModalSurvey.audienceBatchIds.map((bid) => {
                  const batch = availableBatches.find((b) => b.id === bid);
                  return (
                    <div key={bid} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', border: '1px solid var(--line)', borderRadius: '8px', background: '#f8fafc' }}>
                      <Icon className="ti ti-users" style={{ color: '#006073' }} />
                      <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{batch?.name || `Batch #${bid}`}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="crispr-modal-footer">
              <button type="button" className="btn btn-default" onClick={() => setAudienceModalSurvey(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
