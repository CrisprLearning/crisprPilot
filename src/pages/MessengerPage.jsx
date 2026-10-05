import React, { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import ToastRegion from '../components/ToastRegion';
import { availableCourses, availableBatches } from '../data/attemptReportsDemo';
import {
  listCampaigns,
  createCampaign,
  getCampaignAnalytics,
  cancelCampaign,
  retryFailedRecipients,
  listCampaignRecipients,
  buildAudienceFilter,
  extractApiError,
  campaignToMessage,
  UI_CHANNEL_TO_API,
} from '../lib/notificationsApi';
import { api } from '../lib/api';
import { useUser } from '../lib/userStore';

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

// Message-type filter: URL slug ⇄ API type code
const TYPE_SLUG_TO_CODE = { all: '', transactional: '2', broadcast: '1' };
const TYPE_CODE_TO_SLUG = { '': 'all', '2': 'transactional', '1': 'broadcast' };

function extractPlaceholders(text) {
  const out = [];
  const seen = new Set();
  if (!text) return out;
  let m;
  PLACEHOLDER_RE.lastIndex = 0;
  while ((m = PLACEHOLDER_RE.exec(text))) {
    const key = m[1];
    if (!seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}

// Cosmetic labels for known candidate.data keys
const CANDIDATE_FIELD_LABELS = {
  name: 'Full Name',
  registeredMobile: 'Registered Mobile',
  communicationMobile: 'Communication Mobile',
  email: 'Email',
  place: 'Place',
  fatherName: "Father's Name",
  motherName: "Mother's Name",
  about: 'About',
  dob: 'Date of Birth',
  yearOfPassing: 'Year of Passing',
  lastInstitution: 'Last Institution',
  genderText: 'Gender',
  aspirationText: 'Aspiration',
  classText: 'Class of Study',
  boardText: 'Board',
  candidateKey: 'Candidate Key',
};

// Keys we exclude from the dropdown (binary blobs, internal flags, raw enums)
const CANDIDATE_FIELD_HIDE = new Set([
  'id', 'photo', 'blocked', 'status', 'createdOn', 'lastUpdatedOn',
  'gender', 'aspiration', 'classOfStudy', 'board',
]);

const CHANNEL_ICON = {
  Email: { icon: 'ti-email', color: '#3B82F6', bg: '#DBEAFE', title: 'Email' },
  'App Push': { icon: 'ti-bell', color: '#8B5CF6', bg: '#EDE9FE', title: 'App Push Notification' },
  SMS: { icon: 'ti-mobile', color: '#10B981', bg: '#D1FAE5', title: 'Standard SMS' },
  WhatsApp: { icon: 'ti-comments', color: '#22C55E', bg: '#DCFCE7', title: 'WhatsApp Message' },
};

const CHANNEL_ORDER = ['Email', 'App Push', 'SMS', 'WhatsApp'];

function ChannelIcons({ channels }) {
  if (!channels || channels.length === 0) return null;
  const sorted = [...channels].sort((a, b) => {
    const ai = CHANNEL_ORDER.indexOf(a);
    const bi = CHANNEL_ORDER.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
      {sorted.map((ch) => {
        const cfg = CHANNEL_ICON[ch];
        if (!cfg) return null;
        return (
          <span
            key={ch}
            className="msg-channel-icon"
            data-tooltip={cfg.title}
            style={{
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              background: cfg.bg,
              color: cfg.color,
            }}
          >
            <i className={`ti ${cfg.icon}`} style={{ fontSize: '9px', lineHeight: 1 }} />
          </span>
        );
      })}
    </span>
  );
}

function deriveCandidateFields(data) {
  if (!data || typeof data !== 'object') return [];
  return Object.keys(data)
    .filter((k) => !CANDIDATE_FIELD_HIDE.has(k))
    .map((k) => ({ key: k, label: CANDIDATE_FIELD_LABELS[k] || k }));
}

const demoMessages = [
  {
    id: 'msg-1',
    subject: 'Welcome back to Crispr Pilot',
    abstract: 'We have exciting new features lined up for you...',
    body: 'Hello Students,\n\nWe are thrilled to welcome you back for the new term. We have prepared completely new design frameworks for the email web app. Later I will describe how it should look like, so you wont get lost. Do you have any additional questions? I attached some documents which can help you in your work.\n\nBest wishes,\nCrispr Pilot Team',
    date: '2026-04-14T09:00:00Z',
    channels: ['Email', 'App Push'],
    notifyParents: false,
    targetType: 'All Registered Students',
    targets: [],
    recipientCount: 3840,
    sender: 'Isaac Jonas'
  },
  {
    id: 'msg-2',
    subject: 'We want your feedback',
    abstract: 'For athletes, high altitude produces two contradictory effects...',
    body: 'Hi guys,\n\nWe want your feedback regarding the recent live class. Please make sure to fill the survey form available on your dashboard.\n\nRegards,\nSandra',
    date: '2026-04-13T17:00:00Z',
    channels: ['WhatsApp', 'App Push'],
    notifyParents: true,
    targetType: 'Multi Selected Batches',
    targets: ['Batch A', 'Batch C'],
    recipientCount: 124,
    sender: 'Sandra Hesus'
  },
  {
    id: 'msg-3',
    subject: 'The results to our user testing',
    abstract: 'In the eighteenth century the German philosopher Immanuel...',
    body: 'Here are the results to our user testing module.',
    date: '2026-04-12T17:00:00Z',
    channels: ['SMS'],
    notifyParents: true,
    targetType: 'Multi Selected Courses',
    targets: ['CR-101'],
    recipientCount: 450,
    sender: 'Anya Shevchenko'
  }
];

function PersonalizationModal({ open, onClose, placeholders, mappings, onSave, fields, loading }) {
  const [draft, setDraft] = useState({});

  useEffect(() => {
    if (open) {
      const seed = {};
      placeholders.forEach((p) => {
        seed[p] = mappings[p] || { field: '', defaultValue: '' };
      });
      setDraft(seed);
    }
  }, [open, placeholders, mappings]);

  if (!open) return null;

  const allMapped = placeholders.every((p) => draft[p]?.field);

  function update(ph, patch) {
    setDraft((d) => ({ ...d, [ph]: { ...(d[ph] || {}), ...patch } }));
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'white', borderRadius: '14px', width: '100%', maxWidth: '720px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#111827' }}>Map Personalisation</h3>
            <div style={{ fontSize: '13px', color: '#6B7280', marginTop: '4px' }}>
              Map each placeholder to a recipient field. The default is used when the field is empty.
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#6B7280', fontSize: '20px' }}>
            <i className="ti ti-close" />
          </button>
        </div>

        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <div style={{ color: '#6B7280', fontSize: '14px' }}>Loading available fields…</div>
          ) : placeholders.length === 0 ? (
            <div style={{ color: '#6B7280', fontSize: '14px' }}>No placeholders found in the message body.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 8px' }}>
              <thead>
                <tr style={{ fontSize: '12px', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  <th style={{ textAlign: 'left', padding: '0 8px' }}>Placeholder</th>
                  <th style={{ textAlign: 'left', padding: '0 8px' }}>Maps to</th>
                  <th style={{ textAlign: 'left', padding: '0 8px' }}>Default if empty</th>
                </tr>
              </thead>
              <tbody>
                {placeholders.map((ph) => (
                  <tr key={ph}>
                    <td style={{ padding: '6px 8px', verticalAlign: 'middle' }}>
                      <code style={{ background: '#F3F4F6', color: '#4338CA', padding: '4px 8px', borderRadius: '6px', fontSize: '13px' }}>{`{{${ph}}}`}</code>
                    </td>
                    <td style={{ padding: '6px 8px', verticalAlign: 'middle' }}>
                      <select
                        className="msg-input"
                        value={draft[ph]?.field || ''}
                        onChange={(e) => update(ph, { field: e.target.value })}
                      >
                        <option value="">— Select field —</option>
                        {fields.map((f) => (
                          <option key={f.key} value={f.key}>{f.label}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: '6px 8px', verticalAlign: 'middle' }}>
                      <input
                        type="text"
                        className="msg-input"
                        placeholder="e.g. Student"
                        value={draft[ph]?.defaultValue || ''}
                        onChange={(e) => update(ph, { defaultValue: e.target.value })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ padding: '16px 24px', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button type="button" onClick={onClose} style={{ background: 'transparent', border: '1px solid #D1D5DB', color: '#374151', padding: '10px 18px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!allMapped}
            onClick={() => onSave(draft)}
            style={{ background: allMapped ? '#8B5CF6' : '#C4B5FD', color: 'white', border: 'none', padding: '10px 18px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: allMapped ? 'pointer' : 'not-allowed' }}
          >
            Save Mappings
          </button>
        </div>
      </div>
    </div>
  );
}

function RetryConfirmModal({ open, onClose, loading, recipients, onConfirm, confirming }) {
  if (!open) return null;
  const count = recipients.length;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'white', borderRadius: '14px', width: '100%', maxWidth: '600px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#111827' }}>Retry Failed Recipients</h3>
            <div style={{ fontSize: '13px', color: '#6B7280', marginTop: '4px' }}>
              {loading ? 'Loading failed recipients…' : count === 0 ? 'No failed recipients to retry.' : `The message will be re-queued for ${count} recipient${count === 1 ? '' : 's'}.`}
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={confirming} style={{ background: 'transparent', border: 'none', cursor: confirming ? 'not-allowed' : 'pointer', color: '#6B7280', fontSize: '20px' }}>
            <i className="ti ti-close" />
          </button>
        </div>

        <div style={{ padding: '8px 0', overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <div style={{ padding: '20px 24px', color: '#6B7280', fontSize: '14px' }}>Fetching…</div>
          ) : count === 0 ? (
            <div style={{ padding: '20px 24px', color: '#6B7280', fontSize: '14px' }}>Nothing to retry.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#F9FAFB', color: '#6B7280', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.5px' }}>
                  <th style={{ textAlign: 'left', padding: '10px 24px' }}>Recipient</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px' }}>Channel</th>
                  <th style={{ textAlign: 'left', padding: '10px 24px' }}>Reason</th>
                </tr>
              </thead>
              <tbody>
                {recipients.map((r, i) => (
                  <tr key={r.id || r.uuid || i} style={{ borderTop: '1px solid #F3F4F6' }}>
                    <td style={{ padding: '10px 24px', color: '#111827', fontWeight: 500 }}>
                      {r.recipient_name || r.name || r.user?.name || r.email || r.mobile || `User #${r.user_id || r.id}`}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#374151' }}>
                      {r.channel || '—'}
                    </td>
                    <td style={{ padding: '10px 24px', color: '#B91C1C' }}>
                      {r.error_message || r.error_code || r.failure_reason || 'Unknown error'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ padding: '16px 24px', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button type="button" onClick={onClose} disabled={confirming} style={{ background: 'transparent', border: '1px solid #D1D5DB', color: '#374151', padding: '10px 18px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: confirming ? 'not-allowed' : 'pointer' }}>
            Cancel
          </button>
          <button
            type="button"
            disabled={loading || confirming || count === 0}
            onClick={onConfirm}
            style={{ background: (loading || confirming || count === 0) ? '#93C5FD' : '#2563EB', color: 'white', border: 'none', padding: '10px 18px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: (loading || confirming || count === 0) ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <i className="ti ti-reload" />
            {confirming ? 'Retrying…' : count > 0 ? `Confirm Retry (${count})` : 'Confirm Retry'}
          </button>
        </div>
      </div>
    </div>
  );
}

function KebabMenu({ items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const visible = items.filter((it) => it && !it.hidden);
  if (visible.length === 0) return null;

  return (
    <div className="kebab-menu-container" ref={ref}>
      <button
        type="button"
        className="kebab-button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        title="More actions"
      >
        <i className="ti ti-more-alt" />
      </button>
      <div className={`kebab-dropdown ${open ? 'active' : ''}`}>
        {visible.map((it, idx) => (
          <button
            key={idx}
            type="button"
            className={`kebab-dropdown-item${it.danger ? ' delete-action' : ''}`}
            onClick={() => { setOpen(false); it.onClick?.(); }}
          >
            {it.icon && <i className={`ti ${it.icon}`} />}
            <span>{it.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MultiSelectDropdown({ options, selected, onChange, placeholder }) {
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
    if (!selected.length) return placeholder;
    if (selected.length === 1) return options.find((o) => o.id === selected[0])?.name || '1 selected';
    return `${selected.length} items selected`;
  }

  return (
    <div className="msg-multiselect" ref={ref}>
      <div className="msg-multiselect-trigger" onClick={() => setOpen(!open)}>
        <span>{getLabel()}</span>
        <i className="ti ti-angle-down" />
      </div>
      {open && (
        <div className="msg-multiselect-dropdown">
          <div className="msg-multiselect-actions">
            <button type="button" onClick={() => onChange(options.map((o) => o.id))}>Select All</button>
            <button type="button" onClick={() => onChange([])}>Clear All</button>
          </div>
          {options.length === 0 ? (
            <div style={{ padding: '8px 12px', color: '#999', fontSize: '13px' }}>No options available</div>
          ) : (
            options.map((opt) => (
              <label key={opt.id} className={`msg-multiselect-item${selected.includes(opt.id) ? ' selected' : ''}`}>
                <input type="checkbox" checked={selected.includes(opt.id)} onChange={() => toggle(opt.id)} />
                <span>{opt.name}</span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function MessengerPage() {
  const userCtx = useUser();
  const currentAdminName = userCtx?.user?.name || userCtx?.user?.fullName || userCtx?.user?.email || 'Admin';

  const [messages, setMessages] = useState([]);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [isComposing, setIsComposing] = useState(true);
  const [toasts, setToasts] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  // URL ?type= slug ⇄ API type code. '' = All, '2' = Transactional, '1' = Broadcast
  const [searchParams, setSearchParams] = useSearchParams();
  const messageType = TYPE_SLUG_TO_CODE[searchParams.get('type')] || '';
  function setMessageType(code) {
    const slug = TYPE_CODE_TO_SLUG[code] || 'all';
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('type', slug);
      return next;
    });
  }
  const [sending, setSending] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  // Compose State
  const [cmpSubject, setCmpSubject] = useState('');
  const [cmpBody, setCmpBody] = useState('');
  const [cmpAudience, setCmpAudience] = useState('All Registered Students');
  const [cmpSelectedCourses, setCmpSelectedCourses] = useState([]);
  const [cmpSelectedBatches, setCmpSelectedBatches] = useState([]);
  
  // Channels
  const [chEmail, setChEmail] = useState(true);
  const [chPush, setChPush] = useState(true);
  const [chSms, setChSms] = useState(false);
  const [chWhatsapp, setChWhatsapp] = useState(false);
  const [notifyParents, setNotifyParents] = useState(false);

  // Scheduling
  const [cmpScheduleEnabled, setCmpScheduleEnabled] = useState(false);
  const [cmpScheduledAt, setCmpScheduledAt] = useState(''); // local datetime-input value

  // Personalization
  const [mapModalOpen, setMapModalOpen] = useState(false);
  const [mappings, setMappings] = useState({}); // { placeholder: { field, defaultValue } }
  const [candidateFields, setCandidateFields] = useState([]);
  const [loadingFields, setLoadingFields] = useState(false);
  const fieldsLoadedRef = useRef(false);

  const detectedPlaceholders = extractPlaceholders(cmpBody);
  const unmappedPlaceholders = detectedPlaceholders.filter((p) => !mappings[p]?.field);

  async function openMapModal() {
    setMapModalOpen(true);
    if (fieldsLoadedRef.current) return;
    setLoadingFields(true);
    try {
      const { data } = await api.get('/admin/people/candidate/profile', { params: { id: 1 } });
      const payload = data?.data || data || {};
      setCandidateFields(deriveCandidateFields(payload));
      fieldsLoadedRef.current = true;
    } catch (err) {
      showToast('error', 'Could not load fields', extractApiError(err));
    } finally {
      setLoadingFields(false);
    }
  }

  // Per-unit channel costs in paise. Will be sourced from API later.
  const CHANNEL_COST_PAISE = { sms: 18, email: 1.5, push: 0, whatsapp: 90 };

  // Mock audience counts pending real API
  const AUDIENCE_COUNTS = {
    'All Registered Students': 3840,
    'All Enrolled Students': 2150,
  };
  const COURSE_AUDIENCE_DEFAULT = 520; // per selected course

  function getAudienceCount() {
    if (cmpAudience === 'Multi Selected Courses') {
      return cmpSelectedCourses.length * COURSE_AUDIENCE_DEFAULT;
    }
    if (cmpAudience === 'Multi Selected Batches') {
      return availableBatches
        .filter((b) => cmpSelectedBatches.includes(b.id))
        .reduce((sum, b) => sum + (b.students?.length || 0), 0);
    }
    return AUDIENCE_COUNTS[cmpAudience] || 0;
  }

  function getApproxCostPaise() {
    const audience = getAudienceCount();
    let perRecipient = 0;
    if (chEmail) perRecipient += CHANNEL_COST_PAISE.email;
    if (chPush) perRecipient += CHANNEL_COST_PAISE.push;
    if (chSms) perRecipient += CHANNEL_COST_PAISE.sms;
    if (chWhatsapp) perRecipient += CHANNEL_COST_PAISE.whatsapp;
    let total = audience * perRecipient;
    if (notifyParents) total += audience * CHANNEL_COST_PAISE.whatsapp;
    return total;
  }

  function formatRupees(paise) {
    return (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function showToast(type, title, message) {
    const id = Date.now();
    setToasts((c) => [...c, { id, type, title, message }]);
    setTimeout(() => setToasts((c) => c.filter((t) => t.id !== id)), 4000);
  }

  // Load campaigns on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingList(true);
      try {
        const resp = await listCampaigns({ perPage: 25, type: messageType || undefined });
        if (cancelled) return;
        const rows = Array.isArray(resp?.data) ? resp.data : (Array.isArray(resp) ? resp : []);
        setMessages(rows.map(campaignToMessage).filter(Boolean));
      } catch (err) {
        if (!cancelled) showToast('error', 'Could not load campaigns', extractApiError(err));
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [messageType]);

  function handleCompose() {
    setIsComposing(true);
    setSelectedMessage(null);
    setAnalytics(null);
  }

  async function handleSelectMessage(m) {
    setIsComposing(false);
    setSelectedMessage(m);
    setAnalytics(null);
    if (!m?.uuid) return;
    setLoadingAnalytics(true);
    try {
      const a = await getCampaignAnalytics(m.uuid);
      setAnalytics(a);
    } catch (err) {
      showToast('error', 'Analytics unavailable', extractApiError(err));
    } finally {
      setLoadingAnalytics(false);
    }
  }

  async function handleSendMessage() {
    if (!cmpSubject.trim()) return showToast('error', 'Error', 'Message subject is required.');
    if (!cmpBody.trim()) return showToast('error', 'Error', 'Message body is required.');
    if (cmpAudience === 'Multi Selected Courses' && cmpSelectedCourses.length === 0) {
      return showToast('error', 'Error', 'Please select at least one course.');
    }
    if (cmpAudience === 'Multi Selected Batches' && cmpSelectedBatches.length === 0) {
      return showToast('error', 'Error', 'Please select at least one batch.');
    }
    const uiChannels = [];
    if (chEmail) uiChannels.push('Email');
    if (chPush) uiChannels.push('App Push');
    if (chSms) uiChannels.push('SMS');
    if (chWhatsapp) uiChannels.push('WhatsApp');

    if (uiChannels.length === 0) {
      return showToast('error', 'Error', 'Please select at least one delivery channel.');
    }

    let scheduledIso = null;
    if (cmpScheduleEnabled) {
      if (!cmpScheduledAt) return showToast('error', 'Error', 'Please pick a schedule date and time.');
      const when = new Date(cmpScheduledAt);
      if (isNaN(when.getTime())) return showToast('error', 'Error', 'Invalid schedule date.');
      if (when.getTime() <= Date.now()) return showToast('error', 'Error', 'Scheduled time must be in the future.');
      scheduledIso = when.toISOString();
    }

    if (unmappedPlaceholders.length > 0) {
      return showToast('error', 'Mapping required', `Please map all placeholders: ${unmappedPlaceholders.map((p) => `{{${p}}}`).join(', ')}`);
    }

    const personalization = {};
    detectedPlaceholders.forEach((p) => {
      const m = mappings[p];
      if (m?.field) personalization[p] = { field: m.field, default: m.defaultValue || '' };
    });

    const payload = {
      title: cmpSubject,
      message: cmpBody,
      type: 'broadcast',
      channels: uiChannels.map((c) => UI_CHANNEL_TO_API[c]).filter(Boolean),
      audience_filter: buildAudienceFilter(cmpAudience, {
        selectedCourses: cmpSelectedCourses,
        selectedBatches: cmpSelectedBatches,
      }),
      metadata: {
        notify_parents: notifyParents,
        ...(Object.keys(personalization).length ? { personalization } : {}),
      },
      ...(scheduledIso ? { scheduled_at: scheduledIso } : {}),
    };

    setSending(true);
    try {
      const resp = await createCampaign(payload);
      const created = resp?.data || resp;
      const newMsg = campaignToMessage(created) || {
        id: `tmp-${Date.now()}`,
        subject: cmpSubject,
        abstract: cmpBody.slice(0, 50) + '...',
        body: cmpBody,
        date: new Date().toISOString(),
        channels: uiChannels,
        notifyParents,
        targetType: cmpAudience,
        targets: cmpAudience === 'Multi Selected Courses' ? cmpSelectedCourses
          : cmpAudience === 'Multi Selected Batches' ? cmpSelectedBatches : [],
        recipientCount: 0,
        sender: currentAdminName,
        status: scheduledIso ? 'scheduled' : 'sent',
      };
      setMessages((m) => [newMsg, ...m]);
      showToast(
        'success',
        scheduledIso ? 'Campaign scheduled' : 'Campaign queued',
        scheduledIso
          ? `Will be sent on ${new Date(scheduledIso).toLocaleString()}.`
          : 'Your broadcast has been accepted for delivery.'
      );
      handleSelectMessage(newMsg);
      setCmpSubject('');
      setCmpBody('');
      setCmpScheduleEnabled(false);
      setCmpScheduledAt('');
      setMappings({});
    } catch (err) {
      showToast('error', 'Send failed', extractApiError(err, 'Could not create campaign'));
    } finally {
      setSending(false);
    }
  }

  async function handleCancelCampaign(m) {
    if (!m?.uuid) return;
    try {
      await cancelCampaign(m.uuid);
      showToast('success', 'Cancelled', 'The scheduled campaign has been cancelled.');
      setMessages((list) => list.map((x) => (x.id === m.id ? { ...x, status: 'cancelled' } : x)));
    } catch (err) {
      showToast('error', 'Cancel failed', extractApiError(err));
    }
  }

  // Retry-failed confirmation modal state
  const [retryModalOpen, setRetryModalOpen] = useState(false);
  const [retryTarget, setRetryTarget] = useState(null);
  const [retryRecipients, setRetryRecipients] = useState([]);
  const [retryLoading, setRetryLoading] = useState(false);
  const [retryConfirming, setRetryConfirming] = useState(false);

  async function handleRetryFailed(m) {
    if (!m?.uuid) return;
    setRetryTarget(m);
    setRetryRecipients([]);
    setRetryModalOpen(true);
    setRetryLoading(true);
    try {
      const resp = await listCampaignRecipients(m.uuid, { status: 'failed', perPage: 200 });
      const rows = Array.isArray(resp?.data) ? resp.data : (Array.isArray(resp) ? resp : []);
      setRetryRecipients(rows);
    } catch (err) {
      showToast('error', 'Could not load failed recipients', extractApiError(err));
      setRetryModalOpen(false);
    } finally {
      setRetryLoading(false);
    }
  }

  async function confirmRetryFailed() {
    if (!retryTarget?.uuid) return;
    setRetryConfirming(true);
    try {
      const resp = await retryFailedRecipients(retryTarget.uuid);
      const n = resp?.requeued ?? retryRecipients.length;
      showToast('success', 'Retry queued', `Re-queued ${n} failed recipient${n === 1 ? '' : 's'}.`);
      setRetryModalOpen(false);
      setRetryTarget(null);
      setRetryRecipients([]);
    } catch (err) {
      showToast('error', 'Retry failed', extractApiError(err));
    } finally {
      setRetryConfirming(false);
    }
  }

  function handleDownloadCsv(msg) {
    let csvContent = "data:text/csv;charset=utf-8,Student Name,Email,Mobile,Status\\n";
    for(let i=0; i<Math.min(msg.recipientCount, 20); i++) {
       csvContent += `Student ${i+1},student${i+1}@example.com,987654321${i%10},Delivered\\n`;
    }
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Recipients_${msg.id}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('info', 'Download Started', 'The recipient list has been downloaded.');
  }

  function formatTime(isoStr) {
    const d = new Date(isoStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatDateFull(isoStr) {
    const d = new Date(isoStr);
    return `${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit'})} Today, ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric'})}`;
  }

  function getAvatarColor(sender) {
    const colors = ['#8b5cf6', '#3b82f6', '#ec4899', '#14b8a6', '#f59e0b'];
    const s = sender || currentAdminName || '';
    let hash = 0;
    for(let i=0; i<s.length; i++) hash += s.charCodeAt(i);
    return colors[hash % colors.length];
  }

  return (
    <div className="messenger-layout" style={{ display: 'flex', height: 'calc(100vh - 70px)', background: '#fff' }}>
      <ToastRegion toasts={toasts} onDismiss={(id) => setToasts((c) => c.filter((t) => t.id !== id))} />

      <PersonalizationModal
        open={mapModalOpen}
        onClose={() => setMapModalOpen(false)}
        placeholders={detectedPlaceholders}
        mappings={mappings}
        fields={candidateFields}
        loading={loadingFields}
        onSave={(next) => { setMappings(next); setMapModalOpen(false); }}
      />

      <RetryConfirmModal
        open={retryModalOpen}
        onClose={() => { if (!retryConfirming) setRetryModalOpen(false); }}
        loading={retryLoading}
        recipients={retryRecipients}
        confirming={retryConfirming}
        onConfirm={confirmRetryFailed}
      />

      {/* LEFT SIDEBAR - INBOX LIST */}
      <div style={{ width: '360px', background: '#F8F9FA', borderRight: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '24px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
          <h2 style={{ margin: 0, fontSize: '28px', fontWeight: 'bold', color: '#111827' }}>Inbox</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={handleCompose}
              title="Compose"
              aria-label="Compose"
              className="compose-btn"
              style={{ background: isComposing ? '#006073' : '#E5E7EB', color: isComposing ? 'white' : '#4B5563' }}
            >
              <i className="ti ti-pencil-alt" />
            </button>
            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
              <select
                value={messageType}
                onChange={e => setMessageType(e.target.value)}
                style={{
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  MozAppearance: 'none',
                  background: '#fff',
                  color: '#111827',
                  fontSize: '13px',
                  fontWeight: 600,
                  border: '1px solid #E5E7EB',
                  borderRadius: '20px',
                  padding: '8px 30px 8px 14px',
                  textAlign: 'right',
                  textAlignLast: 'right',
                  cursor: 'pointer',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                }}
                onFocus={e => { e.target.style.borderColor = '#006073'; e.target.style.boxShadow = '0 0 0 3px rgba(0,96,115,0.12)'; }}
                onBlur={e => { e.target.style.borderColor = '#E5E7EB'; e.target.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)'; }}
              >
                <option value="">All Messages</option>
                <option value="2">Transactional</option>
                <option value="1">Broadcast</option>
              </select>
              <i
                className="ti ti-angle-down"
                style={{ position: 'absolute', right: '12px', fontSize: '12px', color: '#6B7280', pointerEvents: 'none' }}
              />
            </div>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 20px 12px' }}>
          {loadingList && (
            <div style={{ padding: '20px', textAlign: 'center', color: '#9CA3AF', fontSize: '13px' }}>
              Loading campaigns…
            </div>
          )}
          {!loadingList && messages.length === 0 && (
            <div style={{ padding: '20px', textAlign: 'center', color: '#9CA3AF', fontSize: '13px' }}>
              No campaigns yet.
            </div>
          )}
          {messages.map(m => {
            const isSel = (!isComposing && selectedMessage?.id === m.id);
            return (
              <div 
                key={m.id} 
                onClick={() => handleSelectMessage(m)}
                style={{ background: isSel ? '#E5E7EB' : 'transparent', borderRadius: '12px', padding: '16px', marginBottom: '8px', cursor: 'pointer', display: 'flex', gap: '12px', transition: 'all 0.2s' }}
              >
                <div style={{ flexShrink: 0, width: '48px', height: '48px', borderRadius: '12px', background: getAvatarColor(m.sender || currentAdminName), color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 'bold' }}>
                  {(m.sender || currentAdminName || 'A').slice(0, 1).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', gap: '8px' }}>
                    <span style={{ fontSize: '14px', fontWeight: '600', color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>{m.sender || currentAdminName}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      <ChannelIcons channels={m.channels} />
                      <span style={{ fontSize: '12px', color: '#9CA3AF' }}>{formatTime(m.date)}</span>
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#374151', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>{m.subject}</span>
                    {m.status === 'scheduled' && (
                      <span style={{ flexShrink: 0, background: '#FEF3C7', color: '#B45309', padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <i className="ti ti-time" style={{ fontSize: '10px' }} /> Scheduled
                      </span>
                    )}
                    {m.status === 'cancelled' && (
                      <span style={{ flexShrink: 0, background: '#FEE2E2', color: '#B91C1C', padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                        Cancelled
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '13px', color: '#6B7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {m.status === 'scheduled' && m.date ? `Scheduled for ${new Date(m.date).toLocaleString()}` : m.abstract}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* RIGHT PANEL - READING / COMPOSING */}
      <div style={{ flex: 1, background: '#fff', display: 'flex', flexDirection: 'column', height: '100%' }}>
        {isComposing ? (
          <div style={{ padding: '40px', maxWidth: '800px', width: '100%', margin: '0 auto', overflowY: 'auto' }}>
            <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#111827', marginBottom: '30px' }}>Compose Broadcast</h1>
            
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>Target Audience</label>
              <select className="msg-input" value={cmpAudience} onChange={e => setCmpAudience(e.target.value)}>
                <option value="All Registered Students">All Registered Students</option>
                <option value="All Enrolled Students">All Enrolled Students</option>
                <option value="Multi Selected Courses">Multi Selected Courses</option>
                <option value="Multi Selected Batches">Multi Selected Batches</option>
              </select>
            </div>
            
            {cmpAudience === 'Multi Selected Courses' && (
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>Select Courses</label>
                <MultiSelectDropdown options={availableCourses.map(c => ({id: c.id, name: c.name}))} selected={cmpSelectedCourses} onChange={setCmpSelectedCourses} placeholder="Select courses..." />
              </div>
            )}
            {cmpAudience === 'Multi Selected Batches' && (
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>Select Batches</label>
                <MultiSelectDropdown options={availableBatches.map(b => ({id: b.id, name: b.name}))} selected={cmpSelectedBatches} onChange={setCmpSelectedBatches} placeholder="Select batches..." />
              </div>
            )}

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>Subject Line</label>
              <input type="text" className="msg-input" placeholder="Enter message subject..." value={cmpSubject} onChange={e => setCmpSubject(e.target.value)} />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>Message Body</label>
                {detectedPlaceholders.length > 0 && (
                  <button
                    type="button"
                    onClick={openMapModal}
                    style={{ background: 'transparent', border: 'none', padding: 0, color: unmappedPlaceholders.length > 0 ? '#B45309' : '#2563EB', fontSize: '13px', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <i className={`ti ${unmappedPlaceholders.length > 0 ? 'ti-alert' : 'ti-link'}`} />
                    Map Personalisation
                    {unmappedPlaceholders.length > 0 && (
                      <span style={{ background: '#FEF3C7', color: '#B45309', padding: '1px 7px', borderRadius: '10px', fontSize: '11px' }}>
                        {unmappedPlaceholders.length} unmapped
                      </span>
                    )}
                  </button>
                )}
              </div>
              <textarea className="msg-input" style={{ minHeight: '200px', resize: 'vertical' }} placeholder="Write your message here... Use {{name}} for personalisation." value={cmpBody} onChange={e => setCmpBody(e.target.value)}></textarea>
              {detectedPlaceholders.length > 0 && (
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#6B7280' }}>
                  Detected: {detectedPlaceholders.map((p) => (
                    <code key={p} style={{ background: mappings[p]?.field ? '#DCFCE7' : '#FEF3C7', color: mappings[p]?.field ? '#15803D' : '#B45309', padding: '2px 6px', borderRadius: '4px', marginRight: '6px', fontSize: '11px' }}>{`{{${p}}}`}</code>
                  ))}
                </div>
              )}
            </div>

            <div style={{ background: '#F9FAFB', padding: '20px', borderRadius: '12px', marginBottom: '30px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 'bold', margin: '0 0 16px 0', color: '#111827' }}>Delivery Channels Overview</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <label className="msg-checkbox-label">
                  <input type="checkbox" checked={chEmail} onChange={e => setChEmail(e.target.checked)} />
                  <div className="msg-check-card">
                    <i className="ti ti-email" style={{ fontSize: '20px', color: '#3B82F6' }} />
                    <span style={{ fontWeight: 600 }}>Email Broadcast</span>
                  </div>
                </label>
                <label className="msg-checkbox-label">
                  <input type="checkbox" checked={chPush} onChange={e => setChPush(e.target.checked)} />
                  <div className="msg-check-card">
                    <i className="ti ti-bell" style={{ fontSize: '20px', color: '#8B5CF6' }} />
                    <span style={{ fontWeight: 600 }}>App Push Notification</span>
                  </div>
                </label>
                <label className="msg-checkbox-label">
                  <input type="checkbox" checked={chSms} onChange={e => setChSms(e.target.checked)} />
                  <div className="msg-check-card">
                    <i className="ti ti-mobile" style={{ fontSize: '20px', color: '#10B981' }} />
                    <span style={{ fontWeight: 600 }}>Standard SMS</span>
                  </div>
                </label>
                <label className="msg-checkbox-label">
                  <input type="checkbox" checked={chWhatsapp} onChange={e => setChWhatsapp(e.target.checked)} />
                  <div className="msg-check-card">
                    <i className="ti ti-comments" style={{ fontSize: '20px', color: '#22C55E' }} />
                    <span style={{ fontWeight: 600 }}>WhatsApp Message</span>
                  </div>
                </label>
              </div>
              
              <div style={{ marginTop: '20px', borderTop: '1px solid #E5E7EB', paddingTop: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                  <input type="checkbox" style={{ width: '18px', height: '18px' }} checked={notifyParents} onChange={e => setNotifyParents(e.target.checked)} />
                  <span style={{ fontSize: '14px', fontWeight: '600', color: '#4B5563' }}>Notify Parents (Sends WhatsApp clone to associated parent numbers)</span>
                </label>
              </div>
            </div>

            <div style={{ background: '#F9FAFB', padding: '20px', borderRadius: '12px', marginBottom: '30px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: cmpScheduleEnabled ? '14px' : 0 }}>
                <input type="checkbox" style={{ width: '18px', height: '18px' }} checked={cmpScheduleEnabled} onChange={e => setCmpScheduleEnabled(e.target.checked)} />
                <span style={{ fontSize: '15px', fontWeight: 'bold', color: '#111827' }}><i className="ti ti-time" style={{ marginRight: '6px', color: '#B45309' }} />Schedule for later</span>
                <span style={{ fontSize: '12px', color: '#6B7280', marginLeft: '4px' }}>Leave off to send immediately.</span>
              </label>
              {cmpScheduleEnabled && (
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>Dispatch at</label>
                  <input
                    type="datetime-local"
                    className="msg-input"
                    value={cmpScheduledAt}
                    min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                    onChange={e => setCmpScheduledAt(e.target.value)}
                  />
                  {cmpScheduledAt && (
                    <div style={{ marginTop: '8px', fontSize: '12px', color: '#6B7280' }}>
                      Will be sent on <strong>{new Date(cmpScheduledAt).toLocaleString()}</strong>.
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.3 }}>
                <span style={{ fontSize: '12px', color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Approx. Cost</span>
                <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#111827' }}>
                  ₹ {formatRupees(getApproxCostPaise())}
                </span>
                <span style={{ fontSize: '11px', color: '#9CA3AF' }}>
                  {getAudienceCount().toLocaleString('en-IN')} recipients
                </span>
              </div>
              <button
                onClick={handleSendMessage}
                disabled={sending || unmappedPlaceholders.length > 0}
                title={unmappedPlaceholders.length > 0 ? `Map ${unmappedPlaceholders.length} placeholder${unmappedPlaceholders.length === 1 ? '' : 's'} before sending` : ''}
                style={{ background: (sending || unmappedPlaceholders.length > 0) ? '#C4B5FD' : '#8B5CF6', color: 'white', border: 'none', padding: '12px 32px', borderRadius: '8px', fontSize: '15px', fontWeight: 'bold', cursor: (sending || unmappedPlaceholders.length > 0) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s' }}
              >
                {sending
                  ? (cmpScheduleEnabled ? 'Scheduling…' : 'Sending…')
                  : (cmpScheduleEnabled
                      ? <>Schedule Broadcast <i className="ti ti-time" /></>
                      : <>Send Broadcast <i className="ti ti-location-arrow" /></>)}
              </button>
            </div>

          </div>
        ) : selectedMessage ? (
          <div style={{ padding: '40px', maxWidth: '800px', width: '100%', margin: '0 auto', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                <span style={{ color: '#6B7280', fontSize: '13px' }}>
                  {selectedMessage.status === 'scheduled' ? 'Scheduled' : 'Sent'} by{' '}
                  <strong style={{ color: '#111827' }}>{selectedMessage.sender || currentAdminName}</strong>
                  {' '}at {formatDateFull(selectedMessage.date)}
                </span>
              </div>
              <KebabMenu
                items={[
                  {
                    label: 'Download Recipient List',
                    icon: 'ti-download',
                    onClick: () => handleDownloadCsv(selectedMessage),
                  },
                  {
                    label: 'Revoke Campaign',
                    icon: 'ti-close',
                    onClick: () => handleCancelCampaign(selectedMessage),
                    hidden: !(selectedMessage.status === 'scheduled' || selectedMessage.status === 'draft'),
                  },
                  {
                    label: 'Retry Failed Recipients',
                    icon: 'ti-reload',
                    onClick: () => handleRetryFailed(selectedMessage),
                    hidden: !(analytics?.status_counts?.failed > 0),
                  },
                  {
                    label: 'Delete History',
                    icon: 'ti-trash',
                    onClick: () => {},
                    danger: true,
                  },
                ]}
              />
            </div>

            {selectedMessage.status === 'scheduled' && selectedMessage.date && (() => {
              const d = new Date(selectedMessage.date);
              const dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
              const timeStr = d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
              return (
                <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', color: '#92400E', borderRadius: '12px', padding: '12px 18px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px' }}>
                  <i className="ti ti-time" style={{ fontSize: '16px' }} />
                  <span>Scheduled for <strong>{dateStr}</strong> at <strong>{timeStr}</strong></span>
                </div>
              );
            })()}

            <div style={{ background: '#EFF6FF', border: '1px solid #DBEAFE', borderRadius: '16px', padding: '24px 28px', marginBottom: '30px' }}>
              <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#111827', margin: '0 0 16px 0' }}>{selectedMessage.subject}</h1>
              <div style={{ fontSize: '15px', color: '#1F2937', lineHeight: '1.7', whiteSpace: 'pre-wrap' }}>
                {selectedMessage.body}
              </div>
            </div>

            {(loadingAnalytics || analytics) && (
              <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: '30px', marginBottom: '30px' }}>
                <h4 style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '1px' }}>Delivery Stats</h4>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '16px' }}>
                  <div style={{ background: '#F8F9FA', padding: '20px', borderRadius: '12px' }}>
                    <div style={{ fontSize: '13px', color: '#6B7280', marginBottom: '4px' }}>Audience Reach</div>
                    <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#111827', marginBottom: '4px' }}>{selectedMessage.targetType}</div>
                    <div style={{ fontSize: '13px', color: '#8B5CF6', fontWeight: 'bold' }}>{selectedMessage.recipientCount} Recipients Delivered</div>
                    {selectedMessage.targets?.length > 0 && (
                      <div style={{ marginTop: '8px', fontSize: '13px', color: '#6B7280' }}>
                        Paths: {selectedMessage.targets.join(', ')}
                      </div>
                    )}
                  </div>
                  <div style={{ background: '#F8F9FA', padding: '20px', borderRadius: '12px' }}>
                    <div style={{ fontSize: '13px', color: '#6B7280', marginBottom: '4px' }}>Execution Channels</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                      {selectedMessage.channels.map(ch => (
                        <span key={ch} style={{ background: '#E0E7FF', color: '#4338CA', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold' }}>{ch}</span>
                      ))}
                      {selectedMessage.notifyParents && (
                        <span style={{ background: '#FEF3C7', color: '#D97706', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold' }}>+ Parents Executed</span>
                      )}
                    </div>
                  </div>
                </div>

                {loadingAnalytics && !analytics ? (
                  <div style={{ color: '#9CA3AF', fontSize: '13px' }}>Loading analytics…</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                    <div style={{ background: '#F8F9FA', padding: '16px', borderRadius: '12px' }}>
                      <div style={{ fontSize: '12px', color: '#6B7280' }}>Recipients</div>
                      <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#111827' }}>{analytics?.recipient_total ?? 0}</div>
                    </div>
                    <div style={{ background: '#F8F9FA', padding: '16px', borderRadius: '12px' }}>
                      <div style={{ fontSize: '12px', color: '#6B7280' }}>Sent</div>
                      <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#111827' }}>{analytics?.metrics?.sent_count ?? analytics?.status_counts?.sent ?? 0}</div>
                    </div>
                    <div style={{ background: '#F8F9FA', padding: '16px', borderRadius: '12px' }}>
                      <div style={{ fontSize: '12px', color: '#6B7280' }}>Delivery Rate</div>
                      <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#10B981' }}>{analytics?.metrics?.delivery_rate != null ? `${analytics.metrics.delivery_rate}%` : '—'}</div>
                    </div>
                    <div style={{ background: '#F8F9FA', padding: '16px', borderRadius: '12px' }}>
                      <div style={{ fontSize: '12px', color: '#6B7280' }}>Failed</div>
                      <div style={{ fontSize: '20px', fontWeight: 'bold', color: analytics?.metrics?.failed_count > 0 ? '#EF4444' : '#111827' }}>{analytics?.metrics?.failed_count ?? analytics?.status_counts?.failed ?? 0}</div>
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>
        ) : null}
      </div>

      <style>{`
        /* Additional scoped styles avoiding global pollution */
        .messenger-layout .msg-channel-icon {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          cursor: default;
        }
        .messenger-layout .msg-channel-icon::after {
          content: attr(data-tooltip);
          position: absolute;
          bottom: calc(100% + 6px);
          left: 50%;
          transform: translateX(-50%) translateY(2px);
          background: #111827;
          color: #fff;
          font-size: 11px;
          font-weight: 500;
          line-height: 1.2;
          white-space: nowrap;
          padding: 5px 8px;
          border-radius: 6px;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.12s ease, transform 0.12s ease;
          z-index: 30;
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
        }
        .messenger-layout .msg-channel-icon::before {
          content: '';
          position: absolute;
          bottom: calc(100% + 1px);
          left: 50%;
          transform: translateX(-50%);
          border: 4px solid transparent;
          border-top-color: #111827;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.12s ease;
          z-index: 30;
        }
        .messenger-layout .msg-channel-icon:hover::after,
        .messenger-layout .msg-channel-icon:hover::before {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }
        .messenger-layout .kebab-menu-container {
          position: relative;
          display: inline-block;
        }
        .messenger-layout .kebab-button {
          width: 34px;
          height: 34px;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          background: white;
          color: #475569;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .messenger-layout .kebab-button:hover {
          border-color: #cbd5e1;
          background: #f8fafc;
        }
        .messenger-layout .kebab-dropdown {
          position: absolute;
          top: calc(100% + 6px);
          right: 0;
          min-width: 200px;
          display: none;
          overflow: hidden;
          border: 1px solid #dbe4ea;
          border-radius: 8px;
          background: white;
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.14);
          z-index: 20;
        }
        .messenger-layout .kebab-dropdown.active {
          display: block;
        }
        .messenger-layout .kebab-dropdown-item {
          display: flex;
          width: 100%;
          align-items: center;
          gap: 10px;
          padding: 11px 14px;
          border: 0;
          background: transparent;
          color: #334155;
          cursor: pointer;
          font-size: 13px;
          text-align: left;
        }
        .messenger-layout .kebab-dropdown-item:hover {
          background: #f8fafc;
        }
        .messenger-layout .kebab-dropdown-item.delete-action {
          color: #dc2626;
        }
        .messenger-layout .kebab-dropdown-item.delete-action:hover {
          background: #fef2f2;
        }
        .msg-input {
          width: 100%;
          padding: 12px 16px;
          border: 1px solid #D1D5DB;
          border-radius: 8px;
          font-size: 14px;
          background: #fff;
          transition: border-color 0.2s, box-shadow 0.2s;
          box-sizing: border-box;
          font-family: inherit;
        }
        .msg-input:focus {
          outline: none;
          border-color: #8B5CF6;
          box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.1);
        }
        .msg-checkbox-label input {
          display: none;
        }
        .msg-check-card {
          border: 2px solid #E5E7EB;
          background: white;
          padding: 16px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          gap: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .msg-checkbox-label input:checked + .msg-check-card {
          border-color: #8B5CF6;
          background: #F5F3FF;
        }
        .msg-multiselect {
          position: relative;
          width: 100%;
        }
        .msg-multiselect-trigger {
          width: 100%;
          padding: 12px 16px;
          border: 1px solid #D1D5DB;
          border-radius: 8px;
          font-size: 14px;
          background: #fff;
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
          box-sizing: border-box;
        }
        .msg-multiselect-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          margin-top: 4px;
          background: white;
          border: 1px solid #E5E7EB;
          border-radius: 8px;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
          z-index: 50;
          max-height: 250px;
          overflow-y: auto;
        }
        .msg-multiselect-actions {
          display: flex;
          justify-content: space-between;
          padding: 8px 12px;
          border-bottom: 1px solid #E5E7EB;
          background: #F9FAFB;
          position: sticky;
          top: 0;
        }
        .msg-multiselect-actions button {
          background: none;
          border: none;
          color: #8B5CF6;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .msg-multiselect-item {
          display: flex;
          align-items: center;
          padding: 10px 12px;
          cursor: pointer;
          transition: background 0.2s;
        }
        .msg-multiselect-item:hover {
          background: #F3F4F6;
        }
        .msg-multiselect-item.selected {
          background: #F5F3FF;
        }
        .msg-multiselect-item input {
          margin-right: 10px;
        }
      `}</style>
    </div>
  );
}
