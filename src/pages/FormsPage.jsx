import React, { useEffect, useMemo, useState } from 'react';
import ToastRegion from '../components/ToastRegion';
import Icon from '../components/Icon';

/* ── Recipient audience types ─────────────────────────────────────────── */
const RECIPIENT_TYPES = ['STUDENTS', 'INSTRUCTORS', 'MENTORS', 'USERS'];

// submitterType (singular) ↔ recipient audience (plural)
const TYPE_TO_AUDIENCE = {
  STUDENT: 'STUDENTS',
  INSTRUCTOR: 'INSTRUCTORS',
  MENTOR: 'MENTORS',
  USER: 'USERS',
};
const AUDIENCE_TO_TYPE = {
  STUDENTS: 'STUDENT',
  INSTRUCTORS: 'INSTRUCTOR',
  MENTORS: 'MENTOR',
  USERS: 'USER',
};

const AUDIENCE_META = {
  STUDENTS: { icon: 'ti-user', label: 'Students' },
  INSTRUCTORS: { icon: 'ti-blackboard', label: 'Instructors' },
  MENTORS: { icon: 'ti-headphone-alt', label: 'Mentors' },
  USERS: { icon: 'ti-id-badge', label: 'Users' },
};

/* ── Field schema for each fixed form (drives preview + submission view) ── */
const FORM_FIELDS = {
  ADMISSION_FORM: [
    { key: 'name', label: 'Full Name', type: 'text', required: true },
    { key: 'dob', label: 'Date of Birth', type: 'date', required: true },
    { key: 'location', label: 'Location', type: 'text', required: true },
    { key: 'signedOn', label: 'Signature', type: 'signature', required: true },
  ],
  HOSTEL_REGISTRATION_FORM: [
    { key: 'name', label: 'Full Name', type: 'text', required: true },
    { key: 'guardianName', label: "Guardian's Name", type: 'text', required: true },
    { key: 'roomPreference', label: 'Room Preference', type: 'select', options: ['Single', 'Twin Sharing', 'Triple Sharing'], required: true },
    { key: 'location', label: 'Home Town', type: 'text', required: true },
    { key: 'signedOn', label: 'Signature', type: 'signature', required: true },
  ],
  DIGITAL_PRIVACY_CONSENT: [
    { key: 'name', label: 'Full Name', type: 'text', required: true },
    { key: 'consent', label: 'I consent to the digital privacy policy', type: 'checkbox', required: true },
    { key: 'signedOn', label: 'Signature', type: 'signature', required: true },
  ],
  EXAM_RESULTS_CONSENT: [
    { key: 'name', label: 'Full Name', type: 'text', required: true },
    { key: 'examName', label: 'Exam Name', type: 'text', required: true },
    { key: 'consent', label: 'I consent to publish my results publicly', type: 'checkbox', required: true },
    { key: 'signedOn', label: 'Signature', type: 'signature', required: true },
  ],
};

/* ── Seed people pool, used by the dispatch picker ────────────────────── */
const PEOPLE = {
  STUDENTS: [
    { id: 1341, name: 'Abhijith C S', detail: 'abhijith@example.com', phone: '+919633104657' },
    { id: 1342, name: 'Fathima Rishana', detail: 'fathima@example.com', phone: '+919847012345' },
    { id: 1343, name: 'Arjun Nair', detail: 'arjun@example.com', phone: '+919895067890' },
    { id: 1344, name: 'Sneha Pillai', detail: 'sneha@example.com', phone: '+919744023456' },
    { id: 1345, name: 'Mohammed Aslam', detail: 'aslam@example.com', phone: '+919605078901' },
    { id: 1346, name: 'Devika Menon', detail: 'devika@example.com', phone: '+919562034567' },
  ],
  INSTRUCTORS: [
    { id: 2201, name: 'Dr. Rajesh Kumar', detail: 'Biology', phone: '+919447011223' },
    { id: 2202, name: 'Prof. Anita Varma', detail: 'Chemistry', phone: '+919847044556' },
    { id: 2203, name: 'Suresh Babu', detail: 'Physics', phone: '+919633077889' },
  ],
  MENTORS: [
    { id: 3301, name: 'Lakshmi Iyer', detail: 'Batch A mentor', phone: '+919895011224' },
    { id: 3302, name: 'Vishnu Prasad', detail: 'Batch B mentor', phone: '+919744055667' },
  ],
  USERS: [
    { id: 4401, name: 'Front Office Admin', detail: 'office@example.com', phone: '+919605033445' },
    { id: 4402, name: 'Accounts Desk', detail: 'accounts@example.com', phone: '+919562088990' },
  ],
};

/* ── Seed forms ───────────────────────────────────────────────────────── */
const SEED_FORMS = [
  {
    id: 'ADMISSION_FORM',
    title: 'Admission Form',
    version: '1.0',
    recipients: ['STUDENTS'],
    recipientsList: [
      { personId: 1341, type: 'STUDENT', name: 'Abhijith C S', sharedAt: 1717286400000, submitted: true },
      { personId: 1342, type: 'STUDENT', name: 'Fathima Rishana', sharedAt: 1717286400000, submitted: false },
      { personId: 1343, type: 'STUDENT', name: 'Arjun Nair', sharedAt: 1717372800000, submitted: true },
    ],
    submissions: [
      {
        id: 'ADMISSION_FORM',
        title: 'Admission Form',
        version: '1.0',
        data: { name: 'Abhijith C S', dob: '09-06-2006', location: 'Malappuram', signedOn: 1717372839492 },
        submitterType: 'STUDENT',
        submittedId: 1341,
        secret: '9242dmfgdfg9dfg9dgd9g9d9g9d',
        sharedAt: 1717286400000,
        submittedAt: 1717372839492,
      },
      {
        id: 'ADMISSION_FORM',
        title: 'Admission Form',
        version: '1.0',
        data: { name: 'Arjun Nair', dob: '14-02-2005', location: 'Kochi', signedOn: 1717459239535 },
        submitterType: 'STUDENT',
        submittedId: 1343,
        secret: 'a71kqp03zx8vr2nbt6hd4uw9clxq',
        sharedAt: 1717372800000,
        submittedAt: 1717459239535,
      },
    ],
  },
  {
    id: 'HOSTEL_REGISTRATION_FORM',
    title: 'Hostel Registration Form',
    version: '1.2',
    recipients: ['STUDENTS', 'MENTORS'],
    recipientsList: [
      { personId: 1344, type: 'STUDENT', name: 'Sneha Pillai', sharedAt: 1717200000000, submitted: true },
    ],
    submissions: [
      {
        id: 'HOSTEL_REGISTRATION_FORM',
        title: 'Hostel Registration Form',
        version: '1.2',
        data: { name: 'Sneha Pillai', guardianName: 'Ramesh Pillai', roomPreference: 'Twin Sharing', location: 'Thrissur', signedOn: 1717286439492 },
        submitterType: 'STUDENT',
        submittedId: 1344,
        secret: 'hj38ms0qwe7rt5yu1np4bv6cz9ax',
        sharedAt: 1717200000000,
        submittedAt: 1717286439492,
      },
    ],
  },
  {
    id: 'DIGITAL_PRIVACY_CONSENT',
    title: 'Digital Privacy Consent',
    version: '1.0',
    recipients: ['STUDENTS', 'INSTRUCTORS', 'MENTORS', 'USERS'],
    recipientsList: [],
    submissions: [],
  },
  {
    id: 'EXAM_RESULTS_CONSENT',
    title: 'Exam Results Consent',
    version: '2.0',
    recipients: ['STUDENTS'],
    recipientsList: [
      { personId: 1345, type: 'STUDENT', name: 'Mohammed Aslam', sharedAt: 1717113600000, submitted: false },
    ],
    submissions: [],
  },
];

/* ── Seed form sets (bundles of forms dispatched together) ────────────── */
const SEED_SETS = [
  {
    id: 'SET_ADMISSION_HOSTELLER',
    name: 'Admission Forms Set - Hosteller',
    formIds: ['ADMISSION_FORM', 'HOSTEL_REGISTRATION_FORM', 'DIGITAL_PRIVACY_CONSENT'],
  },
  {
    id: 'SET_ADMISSION_DAYSCHOLAR',
    name: 'Admission Forms Set - Day Scholar',
    formIds: ['ADMISSION_FORM', 'DIGITAL_PRIVACY_CONSENT'],
  },
];

/* ── WhatsApp share message ───────────────────────────────────────────── */
const WHATSAPP_CONTACT = '9633104657';

function genRecipientKey() {
  return (Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10));
}

function formLink(form, key) {
  const base = `https://forms.crisprlearning.com/preview?id=${encodeURIComponent(form.id)}`;
  return key ? `${base}&key=${encodeURIComponent(key)}` : base;
}

function buildWhatsappMessage(items) {
  const lines = items.map((it) => `• ${it.title} – ${it.link}`).join('\n');
  return `Hello from Crispr! 👋\n\nWe request you to kindly complete the following forms at your earliest convenience. If you need any assistance, please feel free to contact us at ${WHATSAPP_CONTACT}.\n\n${lines}`;
}

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

function formatTimestamp(ts) {
  if (!ts) return '—';
  const d = new Date(Number(ts));
  if (Number.isNaN(d.getTime())) return String(ts);
  const day = d.getDate();
  const month = d.toLocaleString('en-US', { month: 'short' });
  const time = d.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${day} ${month} ${d.getFullYear()}, ${time}`;
}

function fieldLabel(formId, key) {
  const fields = FORM_FIELDS[formId] || [];
  const f = fields.find((x) => x.key === key);
  return f ? f.label : key;
}

function formatDataValue(formId, key, value) {
  const fields = FORM_FIELDS[formId] || [];
  const f = fields.find((x) => x.key === key);
  if (!f) return String(value);
  if (f.type === 'signature') return `Signed on ${formatTimestamp(value)}`;
  if (f.type === 'checkbox') return value ? 'Yes' : 'No';
  return String(value);
}

/* ── Multi-select dropdown of audience types (form config) ────────────── */
function RecipientMultiSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  function toggle(t) {
    if (value.includes(t)) onChange(value.filter((x) => x !== t));
    else onChange([...value, t]);
  }
  return (
    <div className="forms-ms" onClick={(e) => e.stopPropagation()}>
      <button type="button" className={`forms-ms-btn ${open ? 'open' : ''}`} onClick={() => setOpen((o) => !o)}>
        <span>{value.length ? `${value.length} audience${value.length > 1 ? 's' : ''} selected` : 'Select recipients…'}</span>
        <Icon className={`ti ti-angle-${open ? 'up' : 'down'}`} />
      </button>
      {open && (
        <div className="forms-ms-menu">
          {RECIPIENT_TYPES.map((t) => (
            <button key={t} type="button" className={`forms-ms-item ${value.includes(t) ? 'active' : ''}`} onClick={() => toggle(t)}>
              <span className={`forms-ms-check ${value.includes(t) ? 'on' : ''}`}>{value.includes(t) && <Icon className="ti ti-check" />}</span>
              <Icon className={`ti ${AUDIENCE_META[t].icon}`} />
              <span>{AUDIENCE_META[t].label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Multi-select dropdown of forms (set config) ──────────────────────── */
function FormsMultiSelect({ options, value, onChange }) {
  const [open, setOpen] = useState(false);
  function toggle(id) {
    if (value.includes(id)) onChange(value.filter((x) => x !== id));
    else onChange([...value, id]);
  }
  return (
    <div className="forms-ms" onClick={(e) => e.stopPropagation()}>
      <button type="button" className={`forms-ms-btn ${open ? 'open' : ''}`} onClick={() => setOpen((o) => !o)}>
        <span>{value.length ? `${value.length} form${value.length > 1 ? 's' : ''} selected` : 'Select forms…'}</span>
        <Icon className={`ti ti-angle-${open ? 'up' : 'down'}`} />
      </button>
      {open && (
        <div className="forms-ms-menu" style={{ maxHeight: 260, overflowY: 'auto' }}>
          {options.map((f) => (
            <button key={f.id} type="button" className={`forms-ms-item ${value.includes(f.id) ? 'active' : ''}`} onClick={() => toggle(f.id)}>
              <span className={`forms-ms-check ${value.includes(f.id) ? 'on' : ''}`}>{value.includes(f.id) && <Icon className="ti ti-check" />}</span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span>{f.title}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace' }}>{f.id}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FormsPage() {
  const [forms, setForms] = useState(SEED_FORMS);
  const [searchQuery, setSearchQuery] = useState('');
  const [toasts, setToasts] = useState([]);
  const [activeMenu, setActiveMenu] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Configure modal
  const [configForm, setConfigForm] = useState(null);
  const [configMode, setConfigMode] = useState('edit'); // 'edit' | 'new'
  const [cfgId, setCfgId] = useState('');
  const [cfgTitle, setCfgTitle] = useState('');
  const [cfgVersion, setCfgVersion] = useState('');
  const [cfgRecipients, setCfgRecipients] = useState([]);

  // Submissions modal
  const [submissionsForm, setSubmissionsForm] = useState(null);
  const [subSearch, setSubSearch] = useState('');
  const [subPage, setSubPage] = useState(1);
  const [subPageSize, setSubPageSize] = useState(5);

  // Recipients list modal
  const [recipientsForm, setRecipientsForm] = useState(null);
  const [recSearch, setRecSearch] = useState('');
  const [recStatus, setRecStatus] = useState('all');
  const [recPage, setRecPage] = useState(1);
  const [recPageSize, setRecPageSize] = useState(5);

  // Dispatch modal
  const [dispatchForm, setDispatchForm] = useState(null);
  const [dispatchType, setDispatchType] = useState(null);
  const [dispatchSelected, setDispatchSelected] = useState([]);
  const [dispatchSearch, setDispatchSearch] = useState('');

  // ── Form Sets ──
  const [sets, setSets] = useState(SEED_SETS);
  const [activeSetMenu, setActiveSetMenu] = useState(null);

  // Set config modal
  const [configSet, setConfigSet] = useState(null);
  const [setMode, setSetMode] = useState('new'); // 'edit' | 'new'
  const [setName, setSetName] = useState('');
  const [setFormIds, setSetFormIds] = useState([]);

  // Set dispatch modal
  const [dispatchSet, setDispatchSet] = useState(null);
  const [setDispType, setSetDispType] = useState(null);
  const [setDispSelected, setSetDispSelected] = useState([]);
  const [setDispSearch, setSetDispSearch] = useState('');

  // Share via WhatsApp modal (2 steps: pick recipient → enter number)
  const [whatsappTarget, setWhatsappTarget] = useState(null); // { label, formObjs: [form], audiences: [] }
  const [whatsappStep, setWhatsappStep] = useState('recipient'); // 'recipient' | 'number'
  const [whatsappAudType, setWhatsappAudType] = useState(null);
  const [whatsappSearch, setWhatsappSearch] = useState('');
  const [whatsappRecipient, setWhatsappRecipient] = useState(null); // { id, name, type }
  const [whatsappNumber, setWhatsappNumber] = useState('');

  useEffect(() => {
    const close = () => { setActiveMenu(null); setActiveSetMenu(null); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setIsLoading(false), 700);
    return () => window.clearTimeout(t);
  }, []);

  function showToast(type, title, message) {
    const id = Date.now() + Math.random();
    setToasts((cur) => [...cur, { id, type, title, message }]);
    window.setTimeout(() => setToasts((cur) => cur.filter((t) => t.id !== id)), 4000);
  }

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return forms;
    return forms.filter((f) => f.title.toLowerCase().includes(q) || f.id.toLowerCase().includes(q));
  }, [forms, searchQuery]);

  useEffect(() => { setPage(1); }, [searchQuery, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const showingStart = filtered.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const showingEnd = Math.min(safePage * pageSize, filtered.length);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  /* ── Submissions modal: search + pagination ── */
  function openSubmissions(form) {
    setSubmissionsForm(form);
    setSubSearch('');
    setSubPage(1);
  }

  const subFiltered = useMemo(() => {
    if (!submissionsForm) return [];
    const q = subSearch.trim().toLowerCase();
    const list = submissionsForm.submissions || [];
    if (!q) return list;
    return list.filter((s) => {
      const name = String(s.data?.name || '').toLowerCase();
      return name.includes(q) || String(s.submittedId).includes(q) || String(s.submitterType).toLowerCase().includes(q);
    });
  }, [submissionsForm, subSearch]);

  useEffect(() => { setSubPage(1); }, [subSearch, subPageSize]);

  const subTotalPages = Math.max(1, Math.ceil(subFiltered.length / subPageSize));
  const subSafePage = Math.min(subPage, subTotalPages);
  const subShowingStart = subFiltered.length === 0 ? 0 : (subSafePage - 1) * subPageSize + 1;
  const subShowingEnd = Math.min(subSafePage * subPageSize, subFiltered.length);
  const subPaged = subFiltered.slice((subSafePage - 1) * subPageSize, subSafePage * subPageSize);

  /* ── Recipients modal: search + pagination ── */
  function openRecipients(form) {
    setRecipientsForm(form);
    setRecSearch('');
    setRecStatus('all');
    setRecPage(1);
  }

  const recFiltered = useMemo(() => {
    if (!recipientsForm) return [];
    const q = recSearch.trim().toLowerCase();
    const list = recipientsForm.recipientsList || [];
    return list.filter((r) => {
      if (recStatus === 'submitted' && !r.submitted) return false;
      if (recStatus === 'shared' && r.submitted) return false;
      if (!q) return true;
      const status = r.submitted ? 'submitted' : 'pending';
      return String(r.name || '').toLowerCase().includes(q)
        || String(r.personId).includes(q)
        || String(r.type).toLowerCase().includes(q)
        || status.includes(q);
    });
  }, [recipientsForm, recSearch, recStatus]);

  useEffect(() => { setRecPage(1); }, [recSearch, recStatus, recPageSize]);

  const recTotalPages = Math.max(1, Math.ceil(recFiltered.length / recPageSize));
  const recSafePage = Math.min(recPage, recTotalPages);
  const recShowingStart = recFiltered.length === 0 ? 0 : (recSafePage - 1) * recPageSize + 1;
  const recShowingEnd = Math.min(recSafePage * recPageSize, recFiltered.length);
  const recPaged = recFiltered.slice((recSafePage - 1) * recPageSize, recSafePage * recPageSize);

  /* ── Preview ── */
  function previewForm(form) {
    const url = `https://forms.crisprlearning.com/preview?id=${encodeURIComponent(form.id)}`;
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (!win) {
      showToast('error', 'Popup Blocked', 'Allow popups to preview the form in a new tab.');
    }
  }

  /* ── Configure ── */
  function openConfig(form) {
    setConfigMode('edit');
    setConfigForm(form);
    setCfgId(form.id);
    setCfgTitle(form.title);
    setCfgVersion(form.version);
    setCfgRecipients([...form.recipients]);
  }
  function openNewConfig() {
    setConfigMode('new');
    setConfigForm({ id: '__new__' });
    setCfgId('');
    setCfgTitle('');
    setCfgVersion('1.0');
    setCfgRecipients([]);
  }
  function saveConfig(e) {
    e.preventDefault();
    if (!cfgTitle.trim()) { showToast('error', 'Validation Error', 'Title is required.'); return; }
    if (!cfgVersion.trim()) { showToast('error', 'Validation Error', 'Version is required.'); return; }
    if (cfgRecipients.length === 0) { showToast('error', 'Validation Error', 'Select at least one recipient audience.'); return; }

    if (configMode === 'new') {
      const id = cfgId.trim().toUpperCase().replace(/\s+/g, '_');
      if (!id) { showToast('error', 'Validation Error', 'Form ID is required.'); return; }
      if (forms.some((f) => f.id === id)) { showToast('error', 'Duplicate ID', `A form with ID ${id} already exists.`); return; }
      const newForm = {
        id,
        title: cfgTitle.trim(),
        version: cfgVersion.trim(),
        recipients: cfgRecipients,
        recipientsList: [],
        submissions: [],
      };
      setForms((cur) => [...cur, newForm]);
      showToast('success', 'Form Created', `${cfgTitle.trim()} has been configured.`);
      setConfigForm(null);
      return;
    }

    setForms((cur) => cur.map((f) => (f.id === configForm.id
      ? { ...f, title: cfgTitle.trim(), version: cfgVersion.trim(), recipients: cfgRecipients }
      : f)));
    showToast('success', 'Form Updated', `${cfgTitle.trim()} configuration saved.`);
    setConfigForm(null);
  }

  /* ── Dispatch ── */
  function openDispatch(form) {
    setDispatchForm(form);
    setDispatchType(form.recipients[0] || null);
    setDispatchSelected([]);
    setDispatchSearch('');
  }
  function toggleDispatchPerson(personId) {
    setDispatchSelected((cur) => (cur.includes(personId) ? cur.filter((x) => x !== personId) : [...cur, personId]));
  }
  function confirmDispatch() {
    if (dispatchSelected.length === 0) { showToast('error', 'Nobody Selected', 'Pick at least one recipient to dispatch the form.'); return; }
    const submitterType = AUDIENCE_TO_TYPE[dispatchType];
    const pool = PEOPLE[dispatchType] || [];
    const now = Date.now();
    const newEntries = dispatchSelected
      .filter((pid) => !(dispatchForm.recipientsList || []).some((r) => r.personId === pid && r.type === submitterType))
      .map((pid) => {
        const p = pool.find((x) => x.id === pid);
        return { personId: pid, type: submitterType, name: p ? p.name : `#${pid}`, sharedAt: now, submitted: false };
      });
    setForms((cur) => cur.map((f) => (f.id === dispatchForm.id
      ? { ...f, recipientsList: [...(f.recipientsList || []), ...newEntries] }
      : f)));
    showToast('success', 'Form Dispatched', `${dispatchForm.title} sent to ${dispatchSelected.length} recipient${dispatchSelected.length > 1 ? 's' : ''}.`);
    setDispatchForm(null);
  }

  /* ── Form Sets ── */
  const formsById = useMemo(() => Object.fromEntries(forms.map((f) => [f.id, f])), [forms]);

  // Union of audiences across the forms in a set (preserves RECIPIENT_TYPES order)
  function setAudiences(set) {
    const present = new Set();
    set.formIds.forEach((id) => (formsById[id]?.recipients || []).forEach((r) => present.add(r)));
    return RECIPIENT_TYPES.filter((t) => present.has(t));
  }

  function openNewSet() {
    setSetMode('new');
    setConfigSet({ id: '__new__' });
    setSetName('');
    setSetFormIds([]);
  }
  function openEditSet(set) {
    setSetMode('edit');
    setConfigSet(set);
    setSetName(set.name);
    setSetFormIds([...set.formIds]);
  }
  function saveSet(e) {
    e.preventDefault();
    if (!setName.trim()) { showToast('error', 'Validation Error', 'Set name is required.'); return; }
    if (setFormIds.length === 0) { showToast('error', 'Validation Error', 'Select at least one form for the set.'); return; }

    if (setMode === 'new') {
      const id = `SET_${Date.now()}`;
      setSets((cur) => [...cur, { id, name: setName.trim(), formIds: setFormIds }]);
      showToast('success', 'Set Created', `${setName.trim()} has been created.`);
    } else {
      setSets((cur) => cur.map((s) => (s.id === configSet.id ? { ...s, name: setName.trim(), formIds: setFormIds } : s)));
      showToast('success', 'Set Updated', `${setName.trim()} has been updated.`);
    }
    setConfigSet(null);
  }
  function deleteSet(set) {
    setSets((cur) => cur.filter((s) => s.id !== set.id));
    showToast('success', 'Set Removed', `${set.name} has been deleted.`);
  }

  function openSetDispatch(set) {
    setDispatchSet(set);
    setSetDispType(setAudiences(set)[0] || null);
    setSetDispSelected([]);
    setSetDispSearch('');
  }
  function toggleSetDispPerson(personId) {
    setSetDispSelected((cur) => (cur.includes(personId) ? cur.filter((x) => x !== personId) : [...cur, personId]));
  }
  function confirmSetDispatch() {
    if (setDispSelected.length === 0) { showToast('error', 'Nobody Selected', 'Pick at least one recipient to dispatch the set.'); return; }
    const submitterType = AUDIENCE_TO_TYPE[setDispType];
    const pool = PEOPLE[setDispType] || [];
    const now = Date.now();
    // Forms in the set that target the chosen audience
    const targetFormIds = dispatchSet.formIds.filter((id) => (formsById[id]?.recipients || []).includes(setDispType));
    setForms((cur) => cur.map((f) => {
      if (!targetFormIds.includes(f.id)) return f;
      const newEntries = setDispSelected
        .filter((pid) => !(f.recipientsList || []).some((r) => r.personId === pid && r.type === submitterType))
        .map((pid) => {
          const p = pool.find((x) => x.id === pid);
          return { personId: pid, type: submitterType, name: p ? p.name : `#${pid}`, sharedAt: now, submitted: false };
        });
      return { ...f, recipientsList: [...(f.recipientsList || []), ...newEntries] };
    }));
    showToast('success', 'Set Dispatched', `${targetFormIds.length} form${targetFormIds.length > 1 ? 's' : ''} from ${dispatchSet.name} sent to ${setDispSelected.length} recipient${setDispSelected.length > 1 ? 's' : ''}.`);
    setDispatchSet(null);
  }

  /* ── Share via WhatsApp ── */
  function startWhatsapp(label, formObjs, audiences) {
    setWhatsappTarget({ label, formObjs, audiences });
    setWhatsappStep('recipient');
    setWhatsappAudType(audiences[0] || null);
    setWhatsappSearch('');
    setWhatsappRecipient(null);
    setWhatsappNumber('');
  }
  function openWhatsappForForm(form) {
    startWhatsapp(form.title, [form], form.recipients || []);
  }
  function openWhatsappForSet(set) {
    const formObjs = set.formIds.map((id) => formsById[id]).filter(Boolean);
    startWhatsapp(set.name, formObjs, setAudiences(set));
  }
  function selectWhatsappRecipient(person, audType) {
    setWhatsappRecipient({ id: person.id, name: person.name, type: AUDIENCE_TO_TYPE[audType] });
    // Prefill the registered mobile number for this recipient
    setWhatsappNumber((person.phone || '').replace(/[^+0-9]/g, ''));
  }
  function goToWhatsappNumber() {
    if (!whatsappRecipient) { showToast('error', 'Recipient Required', 'Select a recipient first.'); return; }
    setWhatsappStep('number');
  }
  function sendWhatsapp(e) {
    e.preventDefault();
    const number = whatsappNumber.replace(/[^\d]/g, '');
    if (!number) { showToast('error', 'Number Required', 'Enter a valid WhatsApp number.'); return; }
    if (!whatsappRecipient) { showToast('error', 'Recipient Required', 'Select a recipient first.'); return; }
    // One unique key per (recipient, form), suffixed onto each form link.
    const items = (whatsappTarget?.formObjs || []).map((f) => ({
      title: f.title,
      link: formLink(f, genRecipientKey()),
    }));
    const message = buildWhatsappMessage(items);
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}&number=${encodeURIComponent(number)}`;
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (!win) {
      showToast('error', 'Popup Blocked', 'Allow popups to open WhatsApp.');
      return;
    }
    showToast('success', 'WhatsApp Opened', `Sharing ${whatsappTarget?.label || ''} with ${whatsappRecipient.name}.`);
    setWhatsappTarget(null);
  }

  return (
    <section className="forms-page data-table-page quiz-listing-page">
      <ToastRegion toasts={toasts} onDismiss={(id) => setToasts((cur) => cur.filter((t) => t.id !== id))} />

      <style>{`
        .forms-page .forms-id-pill { display:inline-flex; align-items:center; gap:6px; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px; font-weight:600; color:#006073; background:#e7f5f7; padding:4px 10px; border-radius:6px; }
        .forms-page .forms-title-strong { display:block; font-weight:600; color:#1e293b; }
        .forms-page .forms-id-sub { display:block; margin-top:3px; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:11px; font-weight:600; color:#94a3b8; }
        .forms-page .forms-sub-type { display:block; margin-top:3px; font-size:11px; font-weight:600; letter-spacing:.02em; color:#94a3b8; }
        .forms-page .forms-ver { display:inline-block; background:#f1f5f8; color:#475569; padding:3px 10px; border-radius:999px; font-size:12px; font-weight:700; }
        .forms-page .forms-chips { display:flex; flex-wrap:wrap; gap:6px; }
        .forms-page .forms-chip { display:inline-flex; align-items:center; gap:5px; background:#eef6f8; color:#006073; border:1px solid #cfe6ec; padding:3px 9px; border-radius:999px; font-size:11px; font-weight:600; }
        .forms-page .forms-count { display:inline-flex; align-items:center; gap:6px; font-size:13px; color:#334155; font-weight:600; }
        .forms-page .forms-count i { color:#006073; }
        .forms-page .forms-ms { position:relative; }
        .forms-page .forms-ms-btn { width:100%; min-height:44px; display:flex; align-items:center; justify-content:space-between; gap:10px; background:#fff; border:1px solid #d7e1e7; border-radius:8px; padding:0 14px; font-size:14px; color:#334155; cursor:pointer; }
        .forms-page .forms-ms-btn.open, .forms-page .forms-ms-btn:hover { border-color:#006073; box-shadow:0 0 0 3px rgba(0,96,115,.12); }
        .forms-page .forms-ms-menu { position:absolute; top:calc(100% + 6px); left:0; right:0; background:#fff; border:1px solid #e2e8f0; border-radius:10px; box-shadow:0 12px 30px rgba(15,23,42,.16); padding:6px; z-index:30; }
        .forms-page .forms-ms-item { display:flex; align-items:center; gap:10px; width:100%; background:none; border:none; padding:10px 10px; border-radius:7px; font-size:13px; font-weight:600; color:#334155; cursor:pointer; text-align:left; }
        .forms-page .forms-ms-item:hover { background:#f1f5f8; }
        .forms-page .forms-ms-item.active { background:#e7f5f7; }
        .forms-page .forms-ms-item > i.ti { color:#006073; }
        .forms-page .forms-ms-check { width:18px; height:18px; border:1.5px solid #cbd5e1; border-radius:5px; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; color:#fff; font-size:11px; }
        .forms-page .forms-ms-check.on { background:#006073; border-color:#006073; }
        .forms-page .forms-sub-row { cursor:pointer; }
        .forms-page .forms-view-link { display:inline; background:none; border:none; padding:0; color:#006073; font-size:13px; font-weight:600; text-decoration:underline; text-decoration-style:dotted; text-underline-offset:3px; cursor:pointer; }
        .forms-page .forms-view-link:hover { color:#004a59; }
        .forms-page .crispr-modal-dialog .students-table-container { overflow-x:hidden; }
        .forms-page .crispr-modal-dialog .students-table { table-layout:fixed; width:100%; min-width:0; }
        .forms-page .crispr-modal-dialog .students-table th,
        .forms-page .crispr-modal-dialog .students-table td { white-space:normal; word-break:break-word; }
        .forms-page .crispr-modal-dialog .forms-status,
        .forms-page .crispr-modal-dialog .forms-chip { white-space:nowrap; }
        .forms-page .forms-data-grid { display:grid; grid-template-columns:160px 1fr; gap:8px 16px; padding:14px 16px; background:#f8fafc; border-radius:8px; margin:4px 0 2px; }
        .forms-page .forms-data-grid dt { font-size:12px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:.03em; }
        .forms-page .forms-data-grid dd { margin:0; font-size:14px; color:#1e293b; }
        .forms-page .forms-status { display:inline-flex; align-items:center; gap:5px; padding:3px 10px; border-radius:999px; font-size:12px; font-weight:600; }
        .forms-page .forms-status.done { background:#dcfce7; color:#15803d; }
        .forms-page .forms-status.pending { background:#fef3c7; color:#b45309; }
        .forms-page .forms-disp-tabs { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:14px; }
        .forms-page .forms-disp-tab { display:inline-flex; align-items:center; gap:6px; padding:8px 14px; border-radius:8px; border:1px solid #d7e1e7; background:#fff; color:#52606d; font-size:13px; font-weight:600; cursor:pointer; }
        .forms-page .forms-disp-tab.active { background:#006073; border-color:#006073; color:#fff; }
        .forms-page .forms-disp-list { max-height:300px; overflow-y:auto; border:1px solid #e2e8f0; border-radius:10px; }
        .forms-page .forms-disp-person { display:flex; align-items:center; gap:12px; padding:11px 14px; border-bottom:1px solid #f1f5f8; cursor:pointer; }
        .forms-page .forms-disp-person:last-child { border-bottom:none; }
        .forms-page .forms-disp-person:hover { background:#f8fafc; }
        .forms-page .forms-disp-check { width:18px; height:18px; border:1.5px solid #cbd5e1; border-radius:5px; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; color:#fff; font-size:11px; }
        .forms-page .forms-disp-check.on { background:#006073; border-color:#006073; }
        .forms-page .forms-disp-name { font-weight:600; color:#1e293b; font-size:14px; }
        .forms-page .forms-disp-detail { font-size:12px; color:#94a3b8; }
        .forms-page .forms-disp-empty { padding:24px; text-align:center; color:#94a3b8; font-size:13px; }
      `}</style>

      <div className="page-header-section">
        <div className="page-header-title-group">
          <span className="page-header-icon-box"><Icon className="fa fa-wpforms" /></span>
          <div>
            <h2>Forms</h2>
            <p>Configure fixed forms, dispatch them to your audiences, and review submissions.</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button type="button" className="create-quiz-button" onClick={openNewSet}>
            <Icon className="ti ti-plus" /> Create Set
          </button>
          <button type="button" className="create-quiz-button" onClick={openNewConfig}>
            <Icon className="ti ti-plus" /> Configure New Form
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <div className="search-wrapper">
          <Icon className={`ti ${searchQuery ? 'ti-close' : 'ti-search'}`} onClick={() => setSearchQuery('')} aria-hidden="true" />
          <input
            type="text"
            className="search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by form name or ID…"
          />
        </div>
      </div>

      <div className="students-table-container">
        <table className={`students-table ${isLoading ? 'thead-loading' : ''}`}>
          <thead>
            <tr>
              <th>Form</th>
              <th style={{ textAlign: 'center' }}>Version</th>
              <th>Recipients</th>
              <th style={{ textAlign: 'center' }}>Submissions</th>
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
            {paged.length > 0 ? paged.map((form) => (
              <tr key={form.id}>
                <td>
                  <span className="forms-title-strong">{form.title}</span>
                  <span className="forms-id-sub">{form.id}</span>
                </td>
                <td style={{ textAlign: 'center' }}><span className="forms-ver">v{form.version}</span></td>
                <td>
                  <div className="forms-chips">
                    {form.recipients.map((r) => (
                      <span key={r} className="forms-chip"><Icon className={`ti ${AUDIENCE_META[r].icon}`} /> {AUDIENCE_META[r].label}</span>
                    ))}
                  </div>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <span className="forms-count">{form.submissions.length}</span>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <div className="kebab-menu-container">
                    <button type="button" className="kebab-button" onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu === form.id ? null : form.id); }}>
                      <Icon className="ti ti-more-alt" />
                    </button>
                    <div className={`kebab-dropdown ${activeMenu === form.id ? 'active' : ''}`} onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="kebab-dropdown-item" onClick={() => { previewForm(form); setActiveMenu(null); }}><Icon className="ti ti-eye" /> Preview Form</button>
                      <button type="button" className="kebab-dropdown-item" onClick={() => { openSubmissions(form); setActiveMenu(null); }}><Icon className="ti ti-files" /> Check Submissions</button>
                      <button type="button" className="kebab-dropdown-item" onClick={() => { openRecipients(form); setActiveMenu(null); }}><Icon className="fa fa-users" /> View Recipients List</button>
                      <button type="button" className="kebab-dropdown-item" onClick={() => { openConfig(form); setActiveMenu(null); }}><Icon className="ti ti-settings" /> Configure</button>
                      <button type="button" className="kebab-dropdown-item enable-action" onClick={() => { openDispatch(form); setActiveMenu(null); }}><Icon className="ti ti-share" /> Dispatch Form</button>
                      <button type="button" className="kebab-dropdown-item" onClick={() => { openWhatsappForForm(form); setActiveMenu(null); }}><Icon className="fa fa-whatsapp" /> Share via WhatsApp</button>
                    </div>
                  </div>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '40px' }}>
                  <div className="qar-empty-state" style={{ border: 'none', background: 'transparent' }}>
                    <Icon className="ti ti-clipboard" />
                    <h4>No Forms Found</h4>
                    <p>No forms match your search.</p>
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
              <span>Showing {showingStart} to {showingEnd} of {filtered.length} entries</span>
              <select className="page-size-select" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                {PAGE_SIZE_OPTIONS.map((s) => <option key={s} value={s}>Show {s}</option>)}
              </select>
            </div>
            <div className="pagination-controls">
              <button type="button" className="pagination-btn" disabled={safePage === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                <Icon className="ti ti-angle-left" /> Previous
              </button>
              {getPageNumbers(safePage, totalPages).map((p, idx) => (
                p === '...' ? (
                  <span key={`el-${idx}`} className="pagination-btn" style={{ pointerEvents: 'none', background: 'transparent', border: 'none' }}>...</span>
                ) : (
                  <button key={p} type="button" className={`pagination-btn ${safePage === p ? 'active' : ''}`} onClick={() => setPage(p)}>{p}</button>
                )
              ))}
              <button type="button" className="pagination-btn" disabled={safePage === totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                Next <Icon className="ti ti-angle-right" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Forms Set Section ── */}
      <h3 className="asset-form-section-title" style={{ marginTop: 36 }}>
        <Icon className="ti ti-layers-alt" /> Forms Set
      </h3>
      <div className="students-table-container">
        <table className={`students-table ${isLoading ? 'thead-loading' : ''}`}>
          <thead>
            <tr>
              <th>Set Name</th>
              <th>Forms Included</th>
              <th style={{ width: '60px', textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          {isLoading ? (
          <tbody>
            {Array.from({ length: 4 }, (_, i) => (
              <tr key={`set-sk-${i}`}>
                {Array.from({ length: 3 }, (_, j) => (
                  <td key={j}><div className="table-skeleton medium" /></td>
                ))}
              </tr>
            ))}
          </tbody>
          ) : (
          <tbody>
            {sets.length > 0 ? sets.map((set) => (
              <tr key={set.id}>
                <td>
                  <span className="forms-title-strong">{set.name}</span>
                  <span className="forms-id-sub">{set.formIds.length} form{set.formIds.length > 1 ? 's' : ''}</span>
                </td>
                <td>
                  <div className="forms-chips">
                    {set.formIds.map((id) => (
                      <span key={id} className="forms-chip"><Icon className="fa fa-wpforms" /> {formsById[id]?.title || id}</span>
                    ))}
                  </div>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <div className="kebab-menu-container">
                    <button type="button" className="kebab-button" onClick={(e) => { e.stopPropagation(); setActiveSetMenu(activeSetMenu === set.id ? null : set.id); }}>
                      <Icon className="ti ti-more-alt" />
                    </button>
                    <div className={`kebab-dropdown ${activeSetMenu === set.id ? 'active' : ''}`} onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="kebab-dropdown-item enable-action" onClick={() => { openSetDispatch(set); setActiveSetMenu(null); }}><Icon className="ti ti-share" /> Dispatch All Forms</button>
                      <button type="button" className="kebab-dropdown-item" onClick={() => { openWhatsappForSet(set); setActiveSetMenu(null); }}><Icon className="fa fa-whatsapp" /> Share via WhatsApp</button>
                      <button type="button" className="kebab-dropdown-item" onClick={() => { openEditSet(set); setActiveSetMenu(null); }}><Icon className="ti ti-settings" /> Edit Set</button>
                      <button type="button" className="kebab-dropdown-item delete-action" onClick={() => { deleteSet(set); setActiveSetMenu(null); }}><Icon className="ti ti-trash" /> Delete Set</button>
                    </div>
                  </div>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={3} style={{ textAlign: 'center', padding: '40px' }}>
                  <div className="qar-empty-state" style={{ border: 'none', background: 'transparent' }}>
                    <Icon className="ti ti-layers-alt" />
                    <h4>No Form Sets</h4>
                    <p>Create a set to dispatch multiple forms at once.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
          )}
        </table>
      </div>

      {/* ── Configure Modal ── */}
      <div className={`legacy-modal-backdrop ${configForm ? 'active' : ''}`} onClick={() => setConfigForm(null)}>
        {configForm && (
          <div className="legacy-modal-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="legacy-modal-header">
              <h3><Icon className={`ti ${configMode === 'new' ? 'ti-plus' : 'ti-settings'}`} /> {configMode === 'new' ? 'Configure New Form' : 'Configure Form'}</h3>
              <button type="button" className="legacy-modal-close" onClick={() => setConfigForm(null)}><Icon className="ti ti-close" /></button>
            </div>
            <form className="form-modal" onSubmit={saveConfig}>
              <div className="legacy-modal-body">
                <div className="asset-form-section">
                  <div className="asset-form-section-title"><Icon className="ti ti-info-circle" /> Form Details</div>
                  <div className="asset-form-grid basic-grid">
                    <label className="field-cell full-span">
                      <div className="float-field">
                        {configMode === 'new' ? (
                          <input type="text" className="float-control" placeholder=" " value={cfgId} onChange={(e) => setCfgId(e.target.value)} />
                        ) : (
                          <input type="text" className="float-control" placeholder=" " value={configForm.id} disabled />
                        )}
                        <span className="float-label">Form ID {configMode === 'new' && <span className="req">*</span>}</span>
                      </div>
                    </label>
                    <label className="field-cell">
                      <div className="float-field">
                        <input type="text" className="float-control" placeholder=" " value={cfgTitle} onChange={(e) => setCfgTitle(e.target.value)} />
                        <span className="float-label">Title <span className="req">*</span></span>
                      </div>
                    </label>
                    <label className="field-cell">
                      <div className="float-field">
                        <input type="text" className="float-control" placeholder=" " value={cfgVersion} onChange={(e) => setCfgVersion(e.target.value)} />
                        <span className="float-label">Version <span className="req">*</span></span>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="asset-form-section">
                  <div className="asset-form-section-title"><Icon className="fa fa-users" /> Recipients</div>
                  <div className="asset-form-grid">
                    <div className="field-cell full-span">
                      <span className="field-static-label">Recipients <span className="req">*</span></span>
                      <RecipientMultiSelect value={cfgRecipients} onChange={setCfgRecipients} />
                      {cfgRecipients.length > 0 && (
                        <div className="forms-chips" style={{ marginTop: '10px' }}>
                          {cfgRecipients.map((r) => (
                            <span key={r} className="forms-chip"><Icon className={`ti ${AUDIENCE_META[r].icon}`} /> {AUDIENCE_META[r].label}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="legacy-modal-footer">
                <button type="button" className="legacy-btn legacy-btn-default" onClick={() => setConfigForm(null)}>Cancel</button>
                <button type="submit" className="legacy-btn legacy-btn-success"><Icon className={`ti ${configMode === 'new' ? 'ti-plus' : 'ti-check'}`} /> {configMode === 'new' ? 'Create Form' : 'Save Configuration'}</button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* ── Submissions Modal ── */}
      {submissionsForm && (
        <div className="crispr-modal-backdrop active" onMouseDown={(e) => { if (e.target === e.currentTarget) setSubmissionsForm(null); }}>
          <div className="crispr-modal-dialog" style={{ maxWidth: 720 }}>
            <div className="crispr-modal-header">
              <h3><Icon className="ti ti-files" /> Submissions — {submissionsForm.title}</h3>
              <button type="button" className="crispr-modal-close" onClick={() => setSubmissionsForm(null)}><Icon className="ti ti-close" /></button>
            </div>
            <div className="crispr-modal-body">
              {submissionsForm.submissions.length > 0 ? (
                <>
                  <div className="filter-bar" style={{ marginBottom: 14 }}>
                    <div className="search-wrapper">
                      <Icon className={`ti ${subSearch ? 'ti-close' : 'ti-search'}`} onClick={() => setSubSearch('')} aria-hidden="true" />
                      <input
                        type="text"
                        className="search-input"
                        value={subSearch}
                        onChange={(e) => setSubSearch(e.target.value)}
                        placeholder="Search by submitter name, ID, or type…"
                      />
                    </div>
                  </div>

                  <div className="students-table-container" style={{ boxShadow: 'none', border: '1px solid #e2e8f0' }}>
                    <table className="students-table">
                      <thead>
                        <tr>
                          <th>Submitter</th>
                          <th style={{ width: '28%' }}>Submitted At</th>
                          <th style={{ width: '30%', textAlign: 'center' }}>Submission</th>
                        </tr>
                      </thead>
                      <tbody>
                        {subPaged.length > 0 ? subPaged.map((sub, i) => {
                          const key = `${sub.submittedId}-${(subSafePage - 1) * subPageSize + i}`;
                          return (
                            <tr key={key}>
                              <td>
                                <span className="forms-title-strong">{sub.data?.name || `#${sub.submittedId}`}</span>
                                <span className="forms-sub-type">{sub.submitterType}</span>
                              </td>
                              <td>{formatTimestamp(sub.submittedAt)}</td>
                              <td style={{ textAlign: 'center' }}>
                                <a
                                  className="forms-view-link"
                                  href={`https://forms.crisprlearning.com/read?id=${encodeURIComponent(sub.id)}&secret=${encodeURIComponent(sub.secret || '')}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  View
                                </a>
                              </td>
                            </tr>
                          );
                        }) : (
                          <tr>
                            <td colSpan={4} style={{ textAlign: 'center', padding: '32px' }}>
                              <div className="qar-empty-state" style={{ border: 'none', background: 'transparent' }}>
                                <Icon className="ti ti-search" />
                                <h4>No Matches</h4>
                                <p>No submissions match your search.</p>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>

                    {subFiltered.length > 0 && (
                      <div className="pagination-container">
                        <div className="pagination-info">
                          <span>Showing {subShowingStart} to {subShowingEnd} of {subFiltered.length} entries</span>
                          <select className="page-size-select" value={subPageSize} onChange={(e) => setSubPageSize(Number(e.target.value))}>
                            {PAGE_SIZE_OPTIONS.map((s) => <option key={s} value={s}>Show {s}</option>)}
                          </select>
                        </div>
                        <div className="pagination-controls">
                          <button type="button" className="pagination-btn" disabled={subSafePage === 1} onClick={() => setSubPage((p) => Math.max(1, p - 1))}>
                            <Icon className="ti ti-angle-left" /> Previous
                          </button>
                          {getPageNumbers(subSafePage, subTotalPages).map((p, idx) => (
                            p === '...' ? (
                              <span key={`sub-el-${idx}`} className="pagination-btn" style={{ pointerEvents: 'none', background: 'transparent', border: 'none' }}>...</span>
                            ) : (
                              <button key={p} type="button" className={`pagination-btn ${subSafePage === p ? 'active' : ''}`} onClick={() => setSubPage(p)}>{p}</button>
                            )
                          ))}
                          <button type="button" className="pagination-btn" disabled={subSafePage === subTotalPages} onClick={() => setSubPage((p) => Math.min(subTotalPages, p + 1))}>
                            Next <Icon className="ti ti-angle-right" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="qar-empty-state" style={{ border: 'none', background: 'transparent' }}>
                  <Icon className="ti ti-files" />
                  <h4>No Submissions Yet</h4>
                  <p>No one has submitted this form so far.</p>
                </div>
              )}
            </div>
            <div className="crispr-modal-footer">
              <button type="button" className="legacy-btn legacy-btn-default" onClick={() => setSubmissionsForm(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Recipients List Modal ── */}
      {recipientsForm && (
        <div className="crispr-modal-backdrop active" onMouseDown={(e) => { if (e.target === e.currentTarget) setRecipientsForm(null); }}>
          <div className="crispr-modal-dialog" style={{ maxWidth: 640 }}>
            <div className="crispr-modal-header">
              <h3><Icon className="fa fa-users" /> Recipients — {recipientsForm.title}</h3>
              <button type="button" className="crispr-modal-close" onClick={() => setRecipientsForm(null)}><Icon className="ti ti-close" /></button>
            </div>
            <div className="crispr-modal-body">
              {(recipientsForm.recipientsList || []).length > 0 ? (
                <>
                  <div className="filter-bar" style={{ marginBottom: 14, flexWrap: 'nowrap' }}>
                    <div className="search-wrapper" style={{ flex: 1, width: 'auto' }}>
                      <Icon className={`ti ${recSearch ? 'ti-close' : 'ti-search'}`} onClick={() => setRecSearch('')} aria-hidden="true" />
                      <input
                        type="text"
                        className="search-input"
                        value={recSearch}
                        onChange={(e) => setRecSearch(e.target.value)}
                        placeholder="Search by name, ID, type, or status…"
                      />
                    </div>
                    <select className="filter-select" value={recStatus} onChange={(e) => setRecStatus(e.target.value)}>
                      <option value="all">All Statuses</option>
                      <option value="shared">Form Shared</option>
                      <option value="submitted">Submitted</option>
                    </select>
                  </div>

                  <div className="students-table-container" style={{ boxShadow: 'none', border: '1px solid #e2e8f0' }}>
                    <table className="students-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th style={{ width: '30%' }}>Shared At</th>
                          <th style={{ width: '28%', textAlign: 'center' }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recPaged.length > 0 ? recPaged.map((r, i) => (
                          <tr key={`${r.personId}-${(recSafePage - 1) * recPageSize + i}`}>
                            <td>
                              <span className="forms-title-strong">{r.name}</span>
                              <span className="forms-sub-type">{r.type}</span>
                            </td>
                            <td>{formatTimestamp(r.sharedAt)}</td>
                            <td style={{ textAlign: 'center' }}>
                              {r.submitted
                                ? <span className="forms-status done"><Icon className="ti ti-check" /> Submitted</span>
                                : <span className="forms-status pending"><Icon className="ti ti-time" /> Pending</span>}
                            </td>
                          </tr>
                        )) : (
                          <tr>
                            <td colSpan={3} style={{ textAlign: 'center', padding: '32px' }}>
                              <div className="qar-empty-state" style={{ border: 'none', background: 'transparent' }}>
                                <Icon className="ti ti-search" />
                                <h4>No Matches</h4>
                                <p>No recipients match your search.</p>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>

                    {recFiltered.length > 0 && (
                      <div className="pagination-container">
                        <div className="pagination-info">
                          <span>Showing {recShowingStart} to {recShowingEnd} of {recFiltered.length} entries</span>
                          <select className="page-size-select" value={recPageSize} onChange={(e) => setRecPageSize(Number(e.target.value))}>
                            {PAGE_SIZE_OPTIONS.map((s) => <option key={s} value={s}>Show {s}</option>)}
                          </select>
                        </div>
                        <div className="pagination-controls">
                          <button type="button" className="pagination-btn" disabled={recSafePage === 1} onClick={() => setRecPage((p) => Math.max(1, p - 1))}>
                            <Icon className="ti ti-angle-left" /> Previous
                          </button>
                          {getPageNumbers(recSafePage, recTotalPages).map((p, idx) => (
                            p === '...' ? (
                              <span key={`rec-el-${idx}`} className="pagination-btn" style={{ pointerEvents: 'none', background: 'transparent', border: 'none' }}>...</span>
                            ) : (
                              <button key={p} type="button" className={`pagination-btn ${recSafePage === p ? 'active' : ''}`} onClick={() => setRecPage(p)}>{p}</button>
                            )
                          ))}
                          <button type="button" className="pagination-btn" disabled={recSafePage === recTotalPages} onClick={() => setRecPage((p) => Math.min(recTotalPages, p + 1))}>
                            Next <Icon className="ti ti-angle-right" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="qar-empty-state" style={{ border: 'none', background: 'transparent' }}>
                  <Icon className="fa fa-users" />
                  <h4>Not Shared Yet</h4>
                  <p>This form hasn't been dispatched to anyone.</p>
                </div>
              )}
            </div>
            <div className="crispr-modal-footer">
              <button type="button" className="legacy-btn legacy-btn-default" onClick={() => setRecipientsForm(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Dispatch Modal ── */}
      {dispatchForm && (
        <div className="crispr-modal-backdrop active" onMouseDown={(e) => { if (e.target === e.currentTarget) setDispatchForm(null); }}>
          <div className="crispr-modal-dialog" style={{ maxWidth: 560 }}>
            <div className="crispr-modal-header">
              <h3><Icon className="ti ti-share" /> Dispatch — {dispatchForm.title}</h3>
              <button type="button" className="crispr-modal-close" onClick={() => setDispatchForm(null)}><Icon className="ti ti-close" /></button>
            </div>
            <div className="crispr-modal-body">
              <div className="forms-disp-tabs">
                {dispatchForm.recipients.map((t) => (
                  <button key={t} type="button" className={`forms-disp-tab ${dispatchType === t ? 'active' : ''}`} onClick={() => { setDispatchType(t); setDispatchSearch(''); }}>
                    <Icon className={`ti ${AUDIENCE_META[t].icon}`} /> {AUDIENCE_META[t].label}
                  </button>
                ))}
              </div>

              <div className="search-wrapper" style={{ marginBottom: 12 }}>
                <Icon className={`ti ${dispatchSearch ? 'ti-close' : 'ti-search'}`} onClick={() => setDispatchSearch('')} aria-hidden="true" />
                <input
                  type="text"
                  className="search-input"
                  value={dispatchSearch}
                  onChange={(e) => setDispatchSearch(e.target.value)}
                  placeholder={`Search ${AUDIENCE_META[dispatchType]?.label.toLowerCase() || 'people'}…`}
                />
              </div>

              <div className="forms-disp-list">
                {(() => {
                  const pool = PEOPLE[dispatchType] || [];
                  const q = dispatchSearch.trim().toLowerCase();
                  const list = q ? pool.filter((p) => p.name.toLowerCase().includes(q) || String(p.detail).toLowerCase().includes(q)) : pool;
                  if (list.length === 0) return <div className="forms-disp-empty">No matching people.</div>;
                  return list.map((p) => {
                    const checked = dispatchSelected.includes(p.id);
                    return (
                      <div key={p.id} className="forms-disp-person" onClick={() => toggleDispatchPerson(p.id)}>
                        <span className={`forms-disp-check ${checked ? 'on' : ''}`}>{checked && <Icon className="ti ti-check" />}</span>
                        <div>
                          <div className="forms-disp-name">{p.name}</div>
                          <div className="forms-disp-detail">{p.detail}</div>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
            <div className="crispr-modal-footer">
              <span style={{ marginRight: 'auto', fontSize: 13, color: '#64748b', fontWeight: 600 }}>{dispatchSelected.length} selected</span>
              <button type="button" className="legacy-btn legacy-btn-default" onClick={() => setDispatchForm(null)}>Cancel</button>
              <button type="button" className="legacy-btn legacy-btn-success" onClick={confirmDispatch}><Icon className="ti ti-send" /> Dispatch to {dispatchSelected.length || ''}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Set Config Modal ── */}
      <div className={`legacy-modal-backdrop ${configSet ? 'active' : ''}`} onClick={() => setConfigSet(null)}>
        {configSet && (
          <div className="legacy-modal-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="legacy-modal-header">
              <h3><Icon className={`ti ${setMode === 'new' ? 'ti-plus' : 'ti-settings'}`} /> {setMode === 'new' ? 'Create Forms Set' : 'Edit Forms Set'}</h3>
              <button type="button" className="legacy-modal-close" onClick={() => setConfigSet(null)}><Icon className="ti ti-close" /></button>
            </div>
            <form className="form-modal" onSubmit={saveSet}>
              <div className="legacy-modal-body">
                <div className="asset-form-section">
                  <div className="asset-form-section-title"><Icon className="ti ti-info-circle" /> Set Details</div>
                  <div className="asset-form-grid">
                    <label className="field-cell full-span">
                      <div className="float-field">
                        <input type="text" className="float-control" placeholder=" " value={setName} onChange={(e) => setSetName(e.target.value)} />
                        <span className="float-label">Set Name <span className="req">*</span></span>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="asset-form-section">
                  <div className="asset-form-section-title"><Icon className="fa fa-wpforms" /> Forms</div>
                  <div className="asset-form-grid">
                    <div className="field-cell full-span">
                      <span className="field-static-label">Forms <span className="req">*</span></span>
                      <FormsMultiSelect options={forms} value={setFormIds} onChange={setSetFormIds} />
                      {setFormIds.length > 0 && (
                        <div className="forms-chips" style={{ marginTop: '10px' }}>
                          {setFormIds.map((id) => (
                            <span key={id} className="forms-chip"><Icon className="fa fa-wpforms" /> {formsById[id]?.title || id}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="legacy-modal-footer">
                <button type="button" className="legacy-btn legacy-btn-default" onClick={() => setConfigSet(null)}>Cancel</button>
                <button type="submit" className="legacy-btn legacy-btn-success"><Icon className={`ti ${setMode === 'new' ? 'ti-plus' : 'ti-check'}`} /> {setMode === 'new' ? 'Create Set' : 'Save Set'}</button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* ── Set Dispatch Modal ── */}
      {dispatchSet && (
        <div className="crispr-modal-backdrop active" onMouseDown={(e) => { if (e.target === e.currentTarget) setDispatchSet(null); }}>
          <div className="crispr-modal-dialog" style={{ maxWidth: 560 }}>
            <div className="crispr-modal-header">
              <h3><Icon className="ti ti-share" /> Dispatch All — {dispatchSet.name}</h3>
              <button type="button" className="crispr-modal-close" onClick={() => setDispatchSet(null)}><Icon className="ti ti-close" /></button>
            </div>
            <div className="crispr-modal-body">
              <div className="forms-chips" style={{ marginBottom: 14 }}>
                {dispatchSet.formIds.map((id) => (
                  <span key={id} className="forms-chip"><Icon className="fa fa-wpforms" /> {formsById[id]?.title || id}</span>
                ))}
              </div>

              {setAudiences(dispatchSet).length > 0 ? (
                <>
                  <div className="forms-disp-tabs">
                    {setAudiences(dispatchSet).map((t) => (
                      <button key={t} type="button" className={`forms-disp-tab ${setDispType === t ? 'active' : ''}`} onClick={() => { setSetDispType(t); setSetDispSearch(''); }}>
                        <Icon className={`ti ${AUDIENCE_META[t].icon}`} /> {AUDIENCE_META[t].label}
                      </button>
                    ))}
                  </div>

                  <div className="search-wrapper" style={{ marginBottom: 12 }}>
                    <Icon className={`ti ${setDispSearch ? 'ti-close' : 'ti-search'}`} onClick={() => setSetDispSearch('')} aria-hidden="true" />
                    <input
                      type="text"
                      className="search-input"
                      value={setDispSearch}
                      onChange={(e) => setSetDispSearch(e.target.value)}
                      placeholder={`Search ${AUDIENCE_META[setDispType]?.label.toLowerCase() || 'people'}…`}
                    />
                  </div>

                  <div className="forms-disp-list">
                    {(() => {
                      const pool = PEOPLE[setDispType] || [];
                      const q = setDispSearch.trim().toLowerCase();
                      const list = q ? pool.filter((p) => p.name.toLowerCase().includes(q) || String(p.detail).toLowerCase().includes(q)) : pool;
                      if (list.length === 0) return <div className="forms-disp-empty">No matching people.</div>;
                      return list.map((p) => {
                        const checked = setDispSelected.includes(p.id);
                        return (
                          <div key={p.id} className="forms-disp-person" onClick={() => toggleSetDispPerson(p.id)}>
                            <span className={`forms-disp-check ${checked ? 'on' : ''}`}>{checked && <Icon className="ti ti-check" />}</span>
                            <div>
                              <div className="forms-disp-name">{p.name}</div>
                              <div className="forms-disp-detail">{p.detail}</div>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </>
              ) : (
                <div className="forms-disp-empty">The forms in this set have no recipient audiences configured.</div>
              )}
            </div>
            <div className="crispr-modal-footer">
              <span style={{ marginRight: 'auto', fontSize: 13, color: '#64748b', fontWeight: 600 }}>{setDispSelected.length} selected</span>
              <button type="button" className="legacy-btn legacy-btn-default" onClick={() => setDispatchSet(null)}>Cancel</button>
              <button type="button" className="legacy-btn legacy-btn-success" onClick={confirmSetDispatch}><Icon className="ti ti-send" /> Dispatch All to {setDispSelected.length || ''}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Share via WhatsApp Modal ── */}
      {whatsappTarget && (
        <div className="crispr-modal-backdrop active" onMouseDown={(e) => { if (e.target === e.currentTarget) setWhatsappTarget(null); }}>
          <div className="crispr-modal-dialog" style={{ maxWidth: 520 }}>
            <div className="crispr-modal-header">
              <h3>
                <Icon className="fa fa-whatsapp" /> Share via WhatsApp
                <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>
                  Step {whatsappStep === 'recipient' ? '1' : '2'} of 2
                </span>
              </h3>
              <button type="button" className="crispr-modal-close" onClick={() => setWhatsappTarget(null)}><Icon className="ti ti-close" /></button>
            </div>

            {whatsappStep === 'recipient' ? (
              <>
                <div className="crispr-modal-body">
                  <p style={{ margin: '0 0 14px', fontSize: 13, color: '#64748b' }}>
                    Select the recipient for <strong style={{ color: '#1e293b' }}>{whatsappTarget.label}</strong>. A unique link key is generated per recipient.
                  </p>

                  {whatsappTarget.audiences.length > 0 ? (
                    <>
                      <div className="forms-disp-tabs">
                        {whatsappTarget.audiences.map((t) => (
                          <button key={t} type="button" className={`forms-disp-tab ${whatsappAudType === t ? 'active' : ''}`} onClick={() => { setWhatsappAudType(t); setWhatsappSearch(''); }}>
                            <Icon className={`ti ${AUDIENCE_META[t].icon}`} /> {AUDIENCE_META[t].label}
                          </button>
                        ))}
                      </div>

                      <div className="search-wrapper" style={{ marginBottom: 12 }}>
                        <Icon className={`ti ${whatsappSearch ? 'ti-close' : 'ti-search'}`} onClick={() => setWhatsappSearch('')} aria-hidden="true" />
                        <input
                          type="text"
                          className="search-input"
                          value={whatsappSearch}
                          onChange={(e) => setWhatsappSearch(e.target.value)}
                          placeholder={`Search ${AUDIENCE_META[whatsappAudType]?.label.toLowerCase() || 'people'}…`}
                        />
                      </div>

                      <div className="forms-disp-list">
                        {(() => {
                          const pool = PEOPLE[whatsappAudType] || [];
                          const q = whatsappSearch.trim().toLowerCase();
                          const list = q ? pool.filter((p) => p.name.toLowerCase().includes(q) || String(p.detail).toLowerCase().includes(q)) : pool;
                          if (list.length === 0) return <div className="forms-disp-empty">No matching people.</div>;
                          return list.map((p) => {
                            const checked = whatsappRecipient && whatsappRecipient.id === p.id && whatsappRecipient.type === AUDIENCE_TO_TYPE[whatsappAudType];
                            return (
                              <div key={p.id} className="forms-disp-person" onClick={() => selectWhatsappRecipient(p, whatsappAudType)}>
                                <span className={`forms-disp-check ${checked ? 'on' : ''}`} style={{ borderRadius: '50%' }}>{checked && <Icon className="ti ti-check" />}</span>
                                <div>
                                  <div className="forms-disp-name">{p.name}</div>
                                  <div className="forms-disp-detail">{p.detail}</div>
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </>
                  ) : (
                    <div className="forms-disp-empty">No recipient audiences are configured for these forms.</div>
                  )}
                </div>
                <div className="crispr-modal-footer">
                  <span style={{ marginRight: 'auto', fontSize: 13, color: '#64748b', fontWeight: 600 }}>
                    {whatsappRecipient ? `Selected: ${whatsappRecipient.name}` : 'No recipient selected'}
                  </span>
                  <button type="button" className="legacy-btn legacy-btn-default" onClick={() => setWhatsappTarget(null)}>Cancel</button>
                  <button type="button" className="legacy-btn legacy-btn-success" disabled={!whatsappRecipient} onClick={goToWhatsappNumber}>Next <Icon className="ti ti-angle-right" /></button>
                </div>
              </>
            ) : (
              <form onSubmit={sendWhatsapp}>
                <div className="crispr-modal-body">
                  <p style={{ margin: '0 0 14px', fontSize: 13, color: '#64748b' }}>
                    Sharing <strong style={{ color: '#1e293b' }}>{whatsappTarget.label}</strong> with <strong style={{ color: '#1e293b' }}>{whatsappRecipient?.name}</strong>.
                  </p>
                  <div className="form-row full">
                    <div className="form-group">
                      <label>WhatsApp Number <span className="required">*</span></label>
                      <input
                        type="tel"
                        className="form-input"
                        value={whatsappNumber}
                        onChange={(e) => setWhatsappNumber(e.target.value.replace(/[^+0-9]/g, ''))}
                        placeholder="e.g. +919876543210"
                        autoFocus
                      />
                    </div>
                  </div>
                </div>
                <div className="crispr-modal-footer">
                  <button type="button" className="legacy-btn legacy-btn-default" onClick={() => setWhatsappStep('recipient')}><Icon className="ti ti-angle-left" /> Back</button>
                  <button type="submit" className="legacy-btn legacy-btn-success"><Icon className="ti ti-send" /> Send</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
