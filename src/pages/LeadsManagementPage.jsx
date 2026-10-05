import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import ToastRegion from '../components/ToastRegion';
import { SEARCH_DEBOUNCE_MS } from '../hooks/useDebouncedValue';
import { catalogItemsDemo } from '../data/adminRemainingDemo';
import {
  listLeads,
  getLeadStats,
  getLead,
  createLead,
  updateLead,
  addFollowUp,
  changeLeadStatus,
  reassignLead as reassignLeadApi,
  setLeadCatalogItems,
  listAssociates,
  extractApiError,
} from '../lib/leadsApi';
import Icon from '../components/Icon';

function getPageNumbers(currentPage, totalPages) {
  const pages = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i += 1) pages.push(i);
    return pages;
  }
  pages.push(1);
  if (currentPage > 3) pages.push('...');
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);
  for (let i = start; i <= end; i += 1) pages.push(i);
  if (currentPage < totalPages - 2) pages.push('...');
  pages.push(totalPages);
  return pages;
}

/* ── Source Origin Config ── */
const sourceIcons = {
  'Phone': 'ti-mobile',
  'Email': 'ti-email',
  'WhatsApp': 'ti-comment-alt',
  'Form': 'ti-clipboard',
  'Website': 'ti-world',
  'Social Media': 'ti-heart',
};
const sourceOptions = Object.keys(sourceIcons);

/* ── Preferred Time Slots ── */
const timeSlotOptions = ['Morning (9–12)', 'Afternoon (12–3)', 'Evening (3–6)', 'Night (6–9)', 'Any Time'];

/* ── Preferred Communication ── */
const commOptions = [
  { key: 'Phone Call', icon: 'ti-mobile' },
  { key: 'WhatsApp', icon: 'ti-comment-alt' },
  { key: 'Email', icon: 'ti-email' },
  { key: 'SMS', icon: 'ti-comment' },
  { key: 'In-Person', icon: 'ti-user' },
];

/* ── Interest Levels ── */
const interestConfig = {
  High:    { color: '#16a34a', bg: '#dcfce7', icon: '🔥', label: 'High' },
  Neutral: { color: '#ca8a04', bg: '#fef9c3', icon: '😐', label: 'Neutral' },
  Low:     { color: '#dc2626', bg: '#fee2e2', icon: '❄️', label: 'Low' },
};

/* ── Status Config ── */
const statusConfig = {
  Received:      { color: '#0284c7', bg: '#e0f2fe' },
  'In Progress': { color: '#ca8a04', bg: '#fef9c3' },
  Converted:     { color: '#16a34a', bg: '#dcfce7' },
  Lost:          { color: '#dc2626', bg: '#fee2e2' },
};
const statusOptions = Object.keys(statusConfig);

/* ── Auto-calculate next follow-up ── */
function nextFollowUpDate(interest) {
  const days = interest === 'High' ? 1 : interest === 'Neutral' ? 3 : 7;
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

/* ── Date helpers ── */
function todayStr() { return new Date().toISOString().split('T')[0]; }
function tomorrowStr() { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; }
function daysBetween(dateStr) {
  if (!dateStr) return 0;
  const created = new Date(dateStr);
  const now = new Date();
  return Math.max(0, Math.floor((now - created) / (1000 * 60 * 60 * 24)));
}

/* ── Map server lead → UI lead shape (preserve original UI fields) ── */
function adaptLead(srv) {
  if (!srv) return srv;
  return {
    ...srv,
    // UI uses `associate` (display name) — server returns `associateName` + `associateId`
    associate: srv.associateName || srv.associate || '',
    associateId: srv.associateId || srv.associate_id || '',
    catalogItems: Array.isArray(srv.catalogItems) ? srv.catalogItems : [],
    timeline: Array.isArray(srv.timeline) ? srv.timeline : [],
    preferredTimeSlot: srv.preferredTimeSlot ?? '',
    preferredComm: srv.preferredComm ?? '',
    description: srv.description ?? '',
    nextFollowUp: srv.nextFollowUp || '',
    // lastFollowUpAt may come from server (list endpoint omits timeline)
    lastFollowUpAt: srv.lastFollowUpAt || null,
  };
}

export default function LeadsManagementPage() {
  const [leads, setLeads] = useState([]);
  const [associates, setAssociates] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [interestFilter, setInterestFilter] = useState('all');
  const [associateFilter, setAssociateFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');      // '' = no filter, 'today', 'tomorrow', or 'YYYY-MM-DD'
  const [customDatePick, setCustomDatePick] = useState('');
  const [followUpMenuOpen, setFollowUpMenuOpen] = useState(false);
  const [pickingDate, setPickingDate] = useState(false);
  const followUpRef = useRef(null);
  const followUpDateRef = useRef(null);

  // Pagination — server-side
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Loading / error
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  // Stats (from server)
  const [stats, setStats] = useState({ total: 0, received: 0, inProgress: 0, converted: 0, lost: 0 });

  // Modals
  const [selectedLead, setSelectedLead] = useState(null);
  const [editingLead, setEditingLead] = useState(null);
  const [reassignLead, setReassignLead] = useState(null);

  // Follow-up form state
  const [followUpText, setFollowUpText] = useState('');
  const [followUpInterest, setFollowUpInterest] = useState('Neutral');
  const [followUpNextDate, setFollowUpNextDate] = useState('');

  // Dropdown
  const [activeDropdown, setActiveDropdown] = useState(null);

  // Course selection in detail modal
  const [courseSelectOpen, setCourseSelectOpen] = useState(false);

  useEffect(() => {
    const handleClick = () => setActiveDropdown(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  useEffect(() => {
    if (!followUpMenuOpen) { setPickingDate(false); return undefined; }
    const handleClick = (event) => {
      if (followUpRef.current && !followUpRef.current.contains(event.target)) setFollowUpMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [followUpMenuOpen]);

  useEffect(() => {
    if (pickingDate && followUpDateRef.current?.showPicker) {
      try { followUpDateRef.current.showPicker(); } catch { /* ignore */ }
    }
  }, [pickingDate]);

  const showToast = useCallback((type, title, message) => {
    const id = Date.now() + Math.random();
    setToasts(c => [...c, { id, type, title, message }]);
    setTimeout(() => setToasts(c => c.filter(t => t.id !== id)), 4000);
  }, []);

  // resolve date filter to YYYY-MM-DD
  const resolvedDateFilter = useMemo(() => {
    if (dateFilter === 'today') return todayStr();
    if (dateFilter === 'tomorrow') return tomorrowStr();
    if (dateFilter && dateFilter !== 'custom') return dateFilter;
    if (dateFilter === 'custom' && customDatePick) return customDatePick;
    return '';
  }, [dateFilter, customDatePick]);

  const followUpLabel = useMemo(() => {
    if (dateFilter === 'today') return 'Today';
    if (dateFilter === 'tomorrow') return 'Tomorrow';
    if (dateFilter === 'custom') {
      if (!customDatePick) return 'Select a Date';
      const d = new Date(`${customDatePick}T00:00:00`);
      if (Number.isNaN(d.getTime())) return 'Select a Date';
      return `${d.getDate()} ${d.toLocaleString('en-US', { month: 'short' })}, ${d.getFullYear()}`;
    }
    return 'All';
  }, [dateFilter, customDatePick]);

  // ── Resolve associate filter (selected by name in UI) → associateId for the API
  const associateIdFilter = useMemo(() => {
    if (associateFilter === 'all') return '';
    const found = associates.find(a => a.name === associateFilter);
    return found?.id || '';
  }, [associateFilter, associates]);

  // ── Debounced search query
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // ── Server-side list fetch
  const reloadLeads = useCallback(async (signal = { cancelled: false }) => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const { items, meta } = await listLeads({
        page: currentPage,
        size: rowsPerPage,
        q: debouncedSearch,
        status: statusFilter !== 'all' ? statusFilter : '',
        interest: interestFilter !== 'all' ? interestFilter : '',
        associateId: associateIdFilter,
        followUpDate: resolvedDateFilter,
        sortBy: 'createdAt',
        sortDir: 'desc',
      });
      if (signal.cancelled) return;
      setLeads(items.map(adaptLead));
      setTotalItems(Number(meta.total ?? items.length));
      setTotalPages(Number(meta.totalPages ?? Math.max(1, Math.ceil((meta.total ?? items.length) / rowsPerPage))));
    } catch (err) {
      if (signal.cancelled) return;
      const msg = extractApiError(err, 'Failed to load leads.');
      setLoadError(msg);
      setLeads([]);
      setTotalItems(0);
      setTotalPages(1);
      showToast('error', 'Load Error', msg);
    } finally {
      if (!signal.cancelled) setIsLoading(false);
    }
  }, [currentPage, rowsPerPage, debouncedSearch, statusFilter, interestFilter, associateIdFilter, resolvedDateFilter, showToast]);

  const reloadStats = useCallback(async () => {
    try {
      const s = await getLeadStats();
      setStats({
        total: Number(s.total) || 0,
        received: Number(s.received) || 0,
        inProgress: Number(s.inProgress) || 0,
        converted: Number(s.converted) || 0,
        lost: Number(s.lost) || 0,
      });
    } catch (err) {
      // Stats are non-critical; surface silently.
      // eslint-disable-next-line no-console
      console.warn('Failed to load lead stats:', extractApiError(err));
    }
  }, []);

  // Reset to page 1 whenever filters/search change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, statusFilter, interestFilter, associateIdFilter, resolvedDateFilter]);

  // Fetch leads when filters/page change
  useEffect(() => {
    const signal = { cancelled: false };
    reloadLeads(signal);
    return () => { signal.cancelled = true; };
  }, [reloadLeads]);

  // Fetch associates + initial stats once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listAssociates();
        if (!cancelled) setAssociates(list.filter(a => a.active !== false));
      } catch (err) {
        if (!cancelled) showToast('error', 'Load Error', extractApiError(err, 'Failed to load associates.'));
      }
    })();
    reloadStats();
    return () => { cancelled = true; };
  }, [reloadStats, showToast]);

  // Associate names available in the filter dropdown (from the associates list, not just current page)
  const uniqueAssociates = useMemo(
    () => associates.map(a => a.name).sort(),
    [associates]
  );

  // The list is already server-paginated — render `leads` directly
  const paginated = leads;

  // ── Mutation helpers ──
  const applyLeadUpdate = useCallback((updated) => {
    if (!updated) return;
    const adapted = adaptLead(updated);
    setLeads(c => c.map(l => l.id === adapted.id ? { ...l, ...adapted } : l));
    setSelectedLead(prev => (prev && prev.id === adapted.id ? { ...prev, ...adapted } : prev));
  }, []);

  // ── Handlers ──
  const handleSaveLead = async (e) => {
    e.preventDefault();
    if (!editingLead.name || !editingLead.phone) {
      showToast('error', 'Error', 'Name and phone are required.');
      return;
    }
    const isNew = !editingLead.id;
    setIsSaving(true);
    try {
      // Resolve associate name → id (the API expects associateId)
      const assoc = associates.find(a => a.name === editingLead.associate);
      const associateId = editingLead.associateId || assoc?.id;
      if (isNew && !associateId) {
        showToast('error', 'Error', 'Please pick an associate.');
        setIsSaving(false);
        return;
      }
      if (isNew) {
        const payload = {
          name: editingLead.name,
          phone: editingLead.phone,
          email: editingLead.email || '',
          source: editingLead.source,
          interest: editingLead.interest,
          status: editingLead.status,
          associateId,
          description: editingLead.description || '',
        };
        await createLead(payload);
        showToast('success', 'Created', 'Lead created successfully.');
      } else {
        const payload = {
          name: editingLead.name,
          phone: editingLead.phone,
          email: editingLead.email || '',
          source: editingLead.source,
          interest: editingLead.interest,
          status: editingLead.status,
          ...(associateId ? { associateId } : {}),
          description: editingLead.description || '',
        };
        const updated = await updateLead(editingLead.id, payload);
        applyLeadUpdate(updated);
        showToast('success', 'Saved', 'Lead updated successfully.');
      }
      setEditingLead(null);
      await reloadLeads();
      reloadStats();
    } catch (err) {
      showToast('error', 'Save Failed', extractApiError(err, 'Failed to save lead.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddFollowUp = async () => {
    if (!followUpText.trim()) { showToast('error', 'Error', 'Follow-up note cannot be empty.'); return; }
    if (!selectedLead) return;
    setIsSaving(true);
    try {
      const payload = {
        text: followUpText.trim(),
        interest: followUpInterest,
        ...(followUpNextDate ? { nextFollowUp: followUpNextDate } : {}),
      };
      const updated = await addFollowUp(selectedLead.id, payload);
      applyLeadUpdate(updated);
      setFollowUpText('');
      setFollowUpInterest('Neutral');
      setFollowUpNextDate('');
      showToast('success', 'Follow-up Added', 'Follow-up note has been saved.');
      reloadStats();
    } catch (err) {
      showToast('error', 'Save Failed', extractApiError(err, 'Failed to add follow-up.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleStatusChange = async (leadId, newStatus) => {
    try {
      const updated = await changeLeadStatus(leadId, newStatus);
      applyLeadUpdate(updated);
      showToast('success', 'Status Updated', `Lead marked as ${newStatus}.`);
      reloadStats();
    } catch (err) {
      showToast('error', 'Update Failed', extractApiError(err, 'Failed to change status.'));
    }
  };

  const handleReassign = async (assocName) => {
    const target = reassignLead;
    if (!target) return;
    if (target.associate === assocName) { setReassignLead(null); return; }
    const assoc = associates.find(a => a.name === assocName);
    if (!assoc) { showToast('error', 'Error', 'Associate not found.'); return; }
    try {
      const updated = await reassignLeadApi(target.id, assoc.id);
      applyLeadUpdate(updated);
      showToast('success', 'Reassigned', `Lead reassigned to ${assocName}.`);
    } catch (err) {
      showToast('error', 'Reassign Failed', extractApiError(err, 'Failed to reassign lead.'));
    } finally {
      setReassignLead(null);
    }
  };

  const toggleCatalogItem = async (code) => {
    if (!selectedLead) return;
    const items = selectedLead.catalogItems || [];
    const next = items.includes(code) ? items.filter(c => c !== code) : [...items, code];
    // Optimistic UI
    const prevSelected = selectedLead;
    setSelectedLead({ ...selectedLead, catalogItems: next });
    try {
      const updated = await setLeadCatalogItems(selectedLead.id, next);
      applyLeadUpdate(updated);
    } catch (err) {
      setSelectedLead(prevSelected); // rollback
      showToast('error', 'Update Failed', extractApiError(err, 'Failed to update catalog items.'));
    }
  };

  // Debounce timer for inline preference edits
  const fieldSaveTimers = useRef({});
  const updateLeadField = (field, value) => {
    if (!selectedLead) return;
    // Optimistic local update
    setSelectedLead(prev => ({ ...prev, [field]: value }));
    // Debounce save per field
    const key = `${selectedLead.id}:${field}`;
    if (fieldSaveTimers.current[key]) clearTimeout(fieldSaveTimers.current[key]);
    fieldSaveTimers.current[key] = setTimeout(async () => {
      try {
        const updated = await updateLead(selectedLead.id, { [field]: value });
        applyLeadUpdate(updated);
      } catch (err) {
        showToast('error', 'Update Failed', extractApiError(err, 'Failed to save preference.'));
      }
    }, 400);
  };

  const openLeadDetail = async (lead) => {
    // Open immediately with what we already have, then fetch the full lead (with timeline) in background
    setSelectedLead({ ...lead, timeline: lead.timeline || [] });
    setFollowUpText('');
    setFollowUpInterest('Neutral');
    setFollowUpNextDate('');
    setCourseSelectOpen(false);
    setActiveDropdown(null);
    try {
      const full = await getLead(lead.id);
      if (full) setSelectedLead(adaptLead(full));
    } catch (err) {
      showToast('error', 'Load Error', extractApiError(err, 'Failed to load lead details.'));
    }
  };

  const openNewLead = () => {
    const first = associates[0];
    setEditingLead({
      name: '', phone: '', email: '', source: 'Phone',
      interest: 'Neutral', status: 'Received',
      associate: first?.name || '',
      associateId: first?.id || '',
      description: '',
      nextFollowUp: nextFollowUpDate('Neutral'),
      preferredTimeSlot: '', preferredComm: '',
    });
  };

  // ── PDF Export ──
  // Fetch all leads matching the current filters (capped at backend max page size) and render print HTML.
  const handleExportPDF = async () => {
    try {
      const { items } = await listLeads({
        page: 1,
        size: 100,
        q: debouncedSearch,
        status: statusFilter !== 'all' ? statusFilter : '',
        interest: interestFilter !== 'all' ? interestFilter : '',
        associateId: associateIdFilter,
        followUpDate: resolvedDateFilter,
        sortBy: 'createdAt',
        sortDir: 'desc',
      });
      const exportRows = items.map(adaptLead);
      const fmtDate = (d) => { if (!d) return '-'; try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return d; } };
      const rows = exportRows.map(lead => {
        const lastFu = lead.lastFollowUpAt;
        return `<tr>
          <td>${lead.name || ''}</td>
          <td>${lead.phone || ''}</td>
          <td>${lead.source || ''}</td>
          <td>${lead.associate || ''}</td>
          <td>${lead.interest || ''}</td>
          <td>${lead.status || ''}</td>
          <td>${lastFu ? fmtDate(lastFu) : '-'}</td>
          <td>${lead.nextFollowUp ? fmtDate(lead.nextFollowUp) : '-'}</td>
          <td>${daysBetween(lead.createdAt)}d</td>
          <td>${lead.preferredTimeSlot || '-'}</td>
          <td>${lead.preferredComm || '-'}</td>
        </tr>`;
      }).join('');
      const html = `<!DOCTYPE html><html><head><title>Leads Report</title>
<style>
  body { font-family: 'Source Sans Pro', 'Segoe UI', 'Droid Sans', Tahoma, Arial, sans-serif; padding: 30px; color: #1e293b; }
  h1 { font-size: 22px; color: #006073; margin-bottom: 4px; }
  .meta { font-size: 13px; color: #6b7280; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #006073; color: white; padding: 8px 10px; text-align: left; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
  td { padding: 7px 10px; border-bottom: 1px solid #e5e7eb; }
  tr:nth-child(even) { background: #f8fafc; }
  .footer { margin-top: 20px; font-size: 11px; color: #9ca3af; text-align: center; }
  @media print { body { padding: 10px; } }
</style></head><body>
  <h1>Leads Management Report</h1>
  <div class="meta">Generated on ${new Date().toLocaleString('en-IN')} · ${exportRows.length} lead(s) · Filters: Status=${statusFilter}, Interest=${interestFilter}, Associate=${associateFilter}</div>
  <table><thead><tr><th>Name</th><th>Phone</th><th>Source</th><th>Associate</th><th>Interest</th><th>Status</th><th>Last F/U</th><th>Next F/U</th><th>Age</th><th>Pref. Time</th><th>Pref. Comm</th></tr></thead>
  <tbody>${rows}</tbody></table>
  <div class="footer">Crispr Pilot · Leads Management</div>
</body></html>`;

      const printWindow = window.open('', '_blank', 'width=1100,height=700');
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => { printWindow.print(); }, 400);
    } catch (err) {
      showToast('error', 'Export Failed', extractApiError(err, 'Failed to export leads.'));
    }
  };

  const formatDate = (d) => { if (!d) return '-'; try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return d; } };
  const formatDateTime = (d) => { if (!d) return '-'; try { return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return d; } };

  const catalogMap = useMemo(() => {
    const m = {};
    catalogItemsDemo.forEach(c => { m[c.code] = c; });
    return m;
  }, []);

  return (
    <div className="container-fluid data-table-page">
      <ToastRegion toasts={toasts} onDismiss={(id) => setToasts(c => c.filter(t => t.id !== id))} />

      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', padding: '20px', background: 'linear-gradient(135deg, #006073 0%, #005a6b 100%)', borderRadius: '8px', color: 'white' }}>
        <div className="page-header-title-group">
          <span className="page-header-icon-box"><Icon className="fa fa-bullhorn" /></span>
          <div>
            <h2 style={{ margin: '0 0 8px 0', fontSize: '28px', fontWeight: 600, color: 'white' }}>
              Leads Management
            </h2>
            <p style={{ margin: 0, opacity: 0.9, fontSize: '14px', color: 'rgba(255,255,255,0.9)' }}>Track incoming leads, assign associates, and manage follow-ups.</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={handleExportPDF} style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', padding: '10px 18px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon className="ti ti-export" /> Export List
          </button>
          <button onClick={openNewLead} style={{ background: '#ffb706', color: '#006073', border: 'none', padding: '10px 22px', borderRadius: '6px', fontWeight: 700, cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon className="ti ti-plus" /> Add New Lead
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '15px', marginBottom: '25px' }}>
        {[
          { label: 'Total Leads', value: stats.total, icon: 'ti-layers-alt', bg: '#e7f5f7', color: '#006073' },
          { label: 'Received', value: stats.received, icon: 'ti-import', bg: '#e0f2fe', color: '#075985' },
          { label: 'In Progress', value: stats.inProgress, icon: 'ti-reload', bg: '#fff3cd', color: '#856404' },
          { label: 'Converted', value: stats.converted, icon: 'ti-check-box', bg: '#d4edda', color: '#155724' },
          { label: 'Lost', value: stats.lost, icon: 'ti-na', bg: '#f8d7da', color: '#721c24' },
        ].map(s => (
          <div key={s.label} style={{ background: 'white', borderRadius: '8px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: s.bg, color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', flexShrink: 0 }}>
              <Icon className={`ti ${s.icon}`} />
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px' }}>{s.label}</div>
              <div style={{ fontSize: '26px', fontWeight: 700, color: '#1e293b' }}>{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter Row 1: Search + dropdowns */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ position: 'relative' }}>
            <input type="text" placeholder="Search by name, phone, email..." style={{ padding: '8px 12px 8px 35px', borderRadius: '6px', border: '1px solid #d1d5db', width: '300px', fontSize: '14px' }} value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }} />
            <Icon className="ti ti-search" style={{ position: 'absolute', left: '12px', top: '10px', color: '#9ca3af' }} />
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <select style={selStyle} value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }}>
              <option value="all">All Status</option>
              {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select style={selStyle} value={interestFilter} onChange={e => { setInterestFilter(e.target.value); setCurrentPage(1); }}>
              <option value="all">All Interest</option>
              <option value="High">🔥 High</option>
              <option value="Neutral">😐 Neutral</option>
              <option value="Low">❄️ Low</option>
            </select>
            <select style={selStyle} value={associateFilter} onChange={e => { setAssociateFilter(e.target.value); setCurrentPage(1); }}>
              <option value="all">All Associates</option>
              {uniqueAssociates.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <div ref={followUpRef} style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setFollowUpMenuOpen(o => !o)}
              style={{ ...selStyle, display: 'flex', alignItems: 'center', gap: '8px', minWidth: '160px', justifyContent: 'space-between', cursor: 'pointer', borderColor: dateFilter ? '#006073' : '#d1d5db' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Icon className="ti ti-calendar" style={{ fontSize: '13px', color: '#6b7280' }} />{followUpLabel}</span>
              <Icon className={`ti ti-angle-${followUpMenuOpen ? 'up' : 'down'}`} style={{ fontSize: '12px' }} />
            </button>
            {followUpMenuOpen && (
              <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 30, minWidth: '180px', background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 8px 20px rgba(0,0,0,0.12)', overflow: 'hidden' }}>
                {[
                  { key: '', label: 'All' },
                  { key: 'today', label: 'Today' },
                  { key: 'tomorrow', label: 'Tomorrow' },
                ].map(f => (
                  <button
                    key={f.key || 'all'}
                    type="button"
                    onClick={() => { setDateFilter(f.key); setCustomDatePick(''); setCurrentPage(1); setFollowUpMenuOpen(false); }}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '9px 14px', border: 'none', background: (dateFilter === f.key && f.key !== 'custom') ? '#e0f2f1' : 'white', color: '#374151', fontSize: '13px', textAlign: 'left', cursor: 'pointer', fontWeight: dateFilter === f.key ? 600 : 400 }}
                  >
                    {f.label}
                    {dateFilter === f.key && <Icon className="ti ti-check" style={{ color: '#006073', fontSize: '12px' }} />}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPickingDate(true)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '9px 14px', border: 'none', borderTop: '1px solid #f1f5f9', background: dateFilter === 'custom' ? '#e0f2f1' : 'white', color: '#374151', fontSize: '13px', textAlign: 'left', cursor: 'pointer', fontWeight: dateFilter === 'custom' ? 600 : 400 }}
                >
                  Select a Date
                  {dateFilter === 'custom' && <Icon className="ti ti-check" style={{ color: '#006073', fontSize: '12px' }} />}
                </button>
                {(pickingDate || dateFilter === 'custom') && (
                  <div style={{ padding: '10px 14px', borderTop: '1px solid #f1f5f9' }}>
                    <input
                      ref={followUpDateRef}
                      type="date"
                      value={dateFilter === 'custom' ? customDatePick : ''}
                      onChange={e => { setDateFilter('custom'); setCustomDatePick(e.target.value); setCurrentPage(1); setPickingDate(false); setFollowUpMenuOpen(false); }}
                      style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px', color: '#4b5563', cursor: 'pointer' }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
          {dateFilter && (
            <button onClick={() => { setDateFilter(''); setCustomDatePick(''); setCurrentPage(1); }} style={{ padding: '3px 10px', borderRadius: '20px', border: '1px solid #fecaca', background: '#fee2e2', color: '#dc2626', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}>
              <Icon className="ti ti-close" style={{ fontSize: '10px' }} /> Clear
            </button>
          )}
          </div>
        </div>

        {/* Table */}
        <div className="students-table-container">
          <table className={`students-table ${isLoading ? 'thead-loading' : ''}`}>
            <thead>
              <tr>
                <th>Lead</th>
                <th>Origin</th>
                <th>Associate</th>
                <th style={{ textAlign: 'center' }}>Interest</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                <th>Last Follow-up</th>
                <th>Next Follow-up</th>
                <th style={{ textAlign: 'center' }}>Age</th>
                <th style={{ textAlign: 'center', width: '80px' }}>Actions</th>
              </tr>
            </thead>
            {isLoading ? (
            <tbody>
              {Array.from({ length: 8 }, (_, i) => (
                <tr key={`sk-${i}`}>
                  {Array.from({ length: 9 }, (_, j) => (
                    <td key={j}><div className="table-skeleton medium" /></td>
                  ))}
                </tr>
              ))}
            </tbody>
            ) : (
            <tbody>
              {paginated.map((lead) => {
                const lastFu = lead.lastFollowUpAt
                  ? { at: lead.lastFollowUpAt }
                  : (Array.isArray(lead.timeline) ? [...lead.timeline].reverse().find(t => t.type === 'followup') : null);
                const sc = statusConfig[lead.status] || {};
                const ic = interestConfig[lead.interest] || {};
                const ageDays = daysBetween(lead.createdAt);
                return (
                  <tr key={lead.id} style={{ borderBottom: '1px solid #e9ecef', transition: 'background 0.15s' }} className="lm-tr-hover">
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: '#e0f2f1', color: '#006073', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '15px', flexShrink: 0 }}>
                          {lead.name.charAt(0)}
                        </div>
                        <div>
                          <button
                            type="button"
                            className="name-link"
                            title="View lead"
                            style={{ display: 'block', fontSize: '14px' }}
                            onClick={(e) => { e.stopPropagation(); openLeadDetail(lead); }}
                          >
                            {lead.name}
                          </button>
                          <span style={{ fontSize: '12px', color: '#6b7280' }}>{lead.phone}{lead.email ? ` · ${lead.email}` : ''}</span>
                        </div>
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', background: '#f1f5f9', borderRadius: '6px', fontSize: '13px', fontWeight: 500, color: '#475569' }}>
                        <Icon className={`ti ${sourceIcons[lead.source] || 'ti-info-alt'}`} />{lead.source}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ cursor: 'pointer', color: '#006073', fontWeight: 600, fontSize: '13px', borderBottom: '1px dashed #006073' }} onClick={() => setReassignLead(lead)}>
                        {lead.associate}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 600, background: ic.bg, color: ic.color }}>
                        {ic.icon} {ic.label}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <span style={{ display: 'inline-block', padding: '5px 12px', borderRadius: '4px', fontSize: '12px', fontWeight: 600, background: sc.bg, color: sc.color }}>
                        {lead.status}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: '13px', color: '#475569' }}>{lastFu ? formatDateTime(lastFu.at) : <em style={{ color: '#9ca3af' }}>None</em>}</span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: '13px', color: '#475569' }}>{lead.nextFollowUp ? formatDate(lead.nextFollowUp) : '-'}</span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 600, background: ageDays > 14 ? '#fee2e2' : ageDays > 7 ? '#fef9c3' : '#e0f2fe', color: ageDays > 14 ? '#991b1b' : ageDays > 7 ? '#854d0e' : '#0369a1' }}>
                        {ageDays}d
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <div className="kebab-menu-container">
                        <button type="button" className="kebab-button" onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === lead.id ? null : lead.id); }}>
                          <Icon className="ti ti-more-alt" />
                        </button>
                        <div className={`kebab-dropdown ${activeDropdown === lead.id ? 'active' : ''}`} onClick={e => e.stopPropagation()}>
                          <button type="button" className="kebab-dropdown-item" onClick={() => openLeadDetail(lead)}><Icon className="ti ti-eye" /> View Details</button>
                          <button type="button" className="kebab-dropdown-item" onClick={() => { setEditingLead(lead); setActiveDropdown(null); }}><Icon className="ti ti-pencil" /> Edit Lead</button>
                          <button type="button" className="kebab-dropdown-item" onClick={() => { setReassignLead(lead); setActiveDropdown(null); }}><Icon className="ti ti-exchange-vertical" /> Reassign</button>
                          {statusOptions.filter(s => s !== lead.status).map(s => (
                            <button key={s} type="button" className="kebab-dropdown-item" style={{ color: statusConfig[s].color }} onClick={() => { handleStatusChange(lead.id, s); setActiveDropdown(null); }}>
                              Mark as {s}
                            </button>
                          ))}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {paginated.length === 0 && (
                <tr><td colSpan="9" style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>{loadError ? loadError : 'No leads found.'}</td></tr>
              )}
            </tbody>
            )}
          </table>
        </div>

        {/* Pagination */}
        {totalItems > 0 && (
          <div className="pagination-container">
            <div className="pagination-info">
              <span>Showing {(currentPage - 1) * rowsPerPage + 1} to {Math.min(currentPage * rowsPerPage, totalItems)} of {totalItems} entries</span>
              <select
                className="page-size-select"
                value={rowsPerPage}
                onChange={(event) => { setRowsPerPage(Number(event.target.value)); setCurrentPage(1); }}
              >
                {[20, 50, 100, 200].map((size) => <option key={size} value={size}>Show {size}</option>)}
              </select>
            </div>
            <div className="pagination-controls">
              <button type="button" className="pagination-btn" disabled={currentPage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>
                <Icon className="ti ti-angle-left" /> Previous
              </button>
              {getPageNumbers(currentPage, totalPages).map((page, index) => (
                page === '...'
                  ? <span key={`ellipsis-${index}`} className="pagination-ellipsis">...</span>
                  : (
                    <button
                      key={page}
                      type="button"
                      className={`pagination-btn${currentPage === page ? ' active' : ''}`}
                      onClick={() => setCurrentPage(page)}
                    >
                      {page}
                    </button>
                  )
              ))}
              <button type="button" className="pagination-btn" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}>
                Next <Icon className="ti ti-angle-right" />
              </button>
            </div>
          </div>
        )}

      {/* ══════ Lead Detail / Follow-up Modal ══════ */}
      {selectedLead && (
        <div className="crispr-modal-backdrop active" onClick={() => setSelectedLead(null)}>
          <div className="crispr-modal-dialog" style={{ maxWidth: '850px', width: '100%' }} onClick={e => e.stopPropagation()}>
            <div className="crispr-modal-header">
              <h3><Icon className="ti ti-user" /> {selectedLead.name}</h3>
              <button className="crispr-modal-close" onClick={() => setSelectedLead(null)}><Icon className="ti ti-close" /></button>
            </div>
            <div className="crispr-modal-body" style={{ padding: 0, background: '#f8fafc' }}>
              {/* Lead Summary Bar */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', padding: '20px', borderBottom: '1px solid #e2e8f0', background: 'white' }}>
                <div><div style={metaLabel}>Status</div>
                  <span style={{ display: 'inline-block', padding: '4px 10px', borderRadius: '4px', fontSize: '12px', fontWeight: 600, background: (statusConfig[selectedLead.status] || {}).bg, color: (statusConfig[selectedLead.status] || {}).color, marginTop: '4px' }}>{selectedLead.status}</span>
                </div>
                <div><div style={metaLabel}>Interest</div>
                  <span style={{ marginTop: '4px', display: 'block', fontWeight: 600, color: (interestConfig[selectedLead.interest] || {}).color }}>{(interestConfig[selectedLead.interest] || {}).icon} {selectedLead.interest}</span>
                </div>
                <div><div style={metaLabel}>Associate</div>
                  <span style={{ cursor: 'pointer', color: '#006073', fontWeight: 600, fontSize: '14px', borderBottom: '1px dashed #006073', marginTop: '4px', display: 'inline-block' }} onClick={() => setReassignLead(selectedLead)}>{selectedLead.associate}</span>
                </div>
                <div><div style={metaLabel}>Age</div>
                  <span style={{ marginTop: '4px', display: 'block', fontWeight: 700, fontSize: '18px', color: '#1e293b' }}>{daysBetween(selectedLead.createdAt)} days</span>
                </div>
              </div>

              <div style={{ padding: '20px' }}>
                {/* Description */}
                <div style={{ background: 'white', borderRadius: '8px', padding: '15px', border: '1px solid #e2e8f0', marginBottom: '18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <Icon className={`ti ${sourceIcons[selectedLead.source] || 'ti-info-alt'}`} style={{ color: '#006073' }} />
                    <strong style={{ fontSize: '13px', color: '#475569' }}>Source: {selectedLead.source}</strong>
                    <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#9ca3af' }}>Created {formatDateTime(selectedLead.createdAt)}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '14px', color: '#334155' }}>{selectedLead.description || 'No description.'}</p>
                </div>

                {/* Preferences */}
                <div style={{ background: 'white', borderRadius: '8px', padding: '15px', border: '1px solid #e2e8f0', marginBottom: '18px' }}>
                  <h5 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600, color: '#1e293b' }}><Icon className="ti ti-settings" style={{ marginRight: '5px', color: '#006073' }} />Contact Preferences</h5>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '6px' }}><Icon className="ti ti-time" style={{ marginRight: '4px' }} />Preferred Time Slot</label>
                      <select value={selectedLead.preferredTimeSlot || ''} onChange={e => updateLeadField('preferredTimeSlot', e.target.value)} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', background: 'white' }}>
                        <option value="">Not Set</option>
                        {timeSlotOptions.map(ts => <option key={ts} value={ts}>{ts}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '6px' }}><Icon className="ti ti-comments" style={{ marginRight: '4px' }} />Preferred Communication</label>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {commOptions.map(co => {
                          const active = selectedLead.preferredComm === co.key;
                          return (
                            <button key={co.key} type="button" onClick={() => updateLeadField('preferredComm', active ? '' : co.key)} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid', borderColor: active ? '#006073' : '#e2e8f0', background: active ? '#e0f2f1' : 'white', color: active ? '#006073' : '#64748b', fontSize: '12px', fontWeight: active ? 600 : 400, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', transition: 'all 0.15s' }}>
                              <Icon className={`ti ${co.icon}`} />{co.key}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Interested Courses */}
                <div style={{ background: 'white', borderRadius: '8px', padding: '15px', border: '1px solid #e2e8f0', marginBottom: '18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <h5 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#1e293b' }}><Icon className="ti ti-book" style={{ marginRight: '5px', color: '#006073' }} />Interested Courses / Products</h5>
                    <button onClick={() => setCourseSelectOpen(!courseSelectOpen)} style={{ padding: '4px 12px', borderRadius: '4px', border: '1px solid #006073', background: courseSelectOpen ? '#006073' : 'white', color: courseSelectOpen ? 'white' : '#006073', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                      {courseSelectOpen ? 'Done' : '+ Map Course'}
                    </button>
                  </div>
                  {/* Selected course tags */}
                  {(selectedLead.catalogItems || []).length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: courseSelectOpen ? '12px' : 0 }}>
                      {selectedLead.catalogItems.map(code => {
                        const ci = catalogMap[code];
                        return ci ? (
                          <span key={code} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: '#e0f2f1', color: '#006073', borderRadius: '6px', fontSize: '13px', fontWeight: 500 }}>
                            {ci.title}
                            <button type="button" onClick={() => toggleCatalogItem(code)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#dc2626', fontSize: '13px', lineHeight: 1 }}><Icon className="ti ti-close" /></button>
                          </span>
                        ) : null;
                      })}
                    </div>
                  ) : !courseSelectOpen && (
                    <p style={{ margin: 0, fontSize: '13px', color: '#9ca3af', fontStyle: 'italic' }}>No courses mapped yet.</p>
                  )}
                  {/* Course picker */}
                  {courseSelectOpen && (
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                      {catalogItemsDemo.map(ci => {
                        const checked = (selectedLead.catalogItems || []).includes(ci.code);
                        return (
                          <label key={ci.code} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 15px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', background: checked ? '#f0fdfa' : 'white', margin: 0 }}>
                            <input type="checkbox" checked={checked} onChange={() => toggleCatalogItem(ci.code)} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                            <div style={{ flex: 1 }}>
                              <strong style={{ fontSize: '13px', color: '#1e293b' }}>{ci.title}</strong>
                              <div style={{ fontSize: '11px', color: '#6b7280' }}>{ci.code} · {ci.type} · ₹{ci.sellingPrice.toLocaleString()}</div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Follow-up Timeline (Vertical) */}
                <h4 style={{ margin: '0 0 15px 0', fontSize: '15px', fontWeight: 600, color: '#1e293b' }}>
                  <Icon className="ti ti-comment-alt" style={{ marginRight: '6px', color: '#006073' }} />Timeline ({selectedLead.timeline.length})
                </h4>
                <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '20px', paddingLeft: '18px', position: 'relative' }}>
                  {/* Vertical line */}
                  {selectedLead.timeline.length > 0 && (
                    <div style={{ position: 'absolute', left: '26px', top: '8px', bottom: '8px', width: '2px', background: '#e2e8f0' }}></div>
                  )}
                  {selectedLead.timeline.length > 0 ? selectedLead.timeline.slice().reverse().map((evt, i) => {
                    if (evt.type === 'reassign') {
                      return (
                        <div key={i} style={{ display: 'flex', gap: '16px', marginBottom: '16px', position: 'relative' }}>
                          <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#f59e0b', border: '3px solid #fef3c7', flexShrink: 0, zIndex: 1, marginTop: '3px' }}></div>
                          <div style={{ flex: 1, padding: '10px 14px', borderRadius: '8px', background: '#fffbeb', border: '1px solid #fde68a' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: '13px', fontWeight: 600, color: '#92400e' }}>
                                <Icon className="ti ti-exchange-vertical" style={{ marginRight: '4px' }} />Reassigned
                              </span>
                              <span style={{ fontSize: '12px', color: '#b45309' }}>{formatDateTime(evt.at)}</span>
                            </div>
                            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#78350f' }}>
                              {evt.from} → <strong>{evt.to}</strong>
                            </p>
                          </div>
                        </div>
                      );
                    }
                    // followup
                    const fic = interestConfig[evt.interest] || {};
                    return (
                      <div key={i} style={{ display: 'flex', gap: '16px', marginBottom: '16px', position: 'relative' }}>
                        <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: fic.color || '#94a3b8', border: `3px solid ${fic.bg || '#f1f5f9'}`, flexShrink: 0, zIndex: 1, marginTop: '3px' }}></div>
                        <div style={{ flex: 1, padding: '12px 14px', borderRadius: '8px', background: 'white', border: '1px solid #e2e8f0' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <strong style={{ fontSize: '13px', color: '#334155' }}>{evt.addedBy}</strong>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: fic.bg, color: fic.color, fontWeight: 600 }}>{fic.icon} {evt.interest}</span>
                              <span style={{ fontSize: '12px', color: '#94a3b8' }}>{formatDateTime(evt.at)}</span>
                            </div>
                          </div>
                          <p style={{ margin: 0, fontSize: '14px', color: '#475569', lineHeight: 1.5 }}>{evt.text}</p>
                        </div>
                      </div>
                    );
                  }) : (
                    <div style={{ textAlign: 'center', padding: '30px', color: '#9ca3af', background: 'white', borderRadius: '8px', border: '1px dashed #e2e8f0', marginLeft: '-18px' }}>
                      <Icon className="ti ti-comment" style={{ fontSize: '32px', display: 'block', marginBottom: '8px', opacity: 0.5 }} />
                      No activity yet. Add a follow-up note below.
                    </div>
                  )}
                </div>

                {/* Add Follow-up Section */}
                <div style={{ background: 'white', borderRadius: '8px', padding: '15px', border: '1px solid #e2e8f0' }}>
                  <h5 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600, color: '#1e293b' }}><Icon className="ti ti-plus" style={{ marginRight: '5px', color: '#006073' }} />Add Follow-up Note</h5>
                  <textarea value={followUpText} onChange={e => setFollowUpText(e.target.value)} placeholder="Type your follow-up note here..." style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', minHeight: '70px', resize: 'vertical', fontFamily: 'inherit' }}></textarea>
                  <div style={{ display: 'flex', gap: '12px', marginTop: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px', display: 'block' }}>Interest Level</label>
                      <select value={followUpInterest} onChange={e => { setFollowUpInterest(e.target.value); setFollowUpNextDate(nextFollowUpDate(e.target.value)); }} style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px' }}>
                        <option value="High">🔥 High</option>
                        <option value="Neutral">😐 Neutral</option>
                        <option value="Low">❄️ Low</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px', display: 'block' }}>Next Follow-up</label>
                      <input type="date" value={followUpNextDate || nextFollowUpDate(followUpInterest)} onChange={e => setFollowUpNextDate(e.target.value)} style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px' }} />
                    </div>
                    <button onClick={handleAddFollowUp} style={{ background: '#006073', color: 'white', border: 'none', padding: '8px 18px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', fontSize: '13px', marginLeft: 'auto', alignSelf: 'flex-end' }}>
                      <Icon className="ti ti-check" /> Save Note
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="crispr-modal-footer">
              <div style={{ display: 'flex', gap: '8px', marginRight: 'auto' }}>
                {statusOptions.map(s => (
                  <button key={s} disabled={selectedLead.status === s} onClick={() => handleStatusChange(selectedLead.id, s)} style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid', borderColor: selectedLead.status === s ? (statusConfig[s]?.color || '#ccc') : '#e2e8f0', background: selectedLead.status === s ? (statusConfig[s]?.bg || '#eee') : 'white', color: statusConfig[s]?.color || '#333', fontWeight: 600, fontSize: '12px', cursor: selectedLead.status === s ? 'default' : 'pointer', opacity: selectedLead.status === s ? 1 : 0.8 }}>
                    {s}
                  </button>
                ))}
              </div>
              <button className="btn btn-default" onClick={() => setSelectedLead(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ══════ Add/Edit Lead Modal ══════ */}
      {editingLead && (
        <div className="crispr-modal-backdrop active" onClick={() => setEditingLead(null)}>
          <div className="crispr-modal-dialog" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
            <div className="crispr-modal-header">
              <h3><Icon className="ti ti-pencil-alt" /> {editingLead.id ? 'Edit Lead' : 'Add New Lead'}</h3>
              <button className="crispr-modal-close" onClick={() => setEditingLead(null)}><Icon className="ti ti-close" /></button>
            </div>
            <form onSubmit={handleSaveLead}>
              <div className="crispr-modal-body">
                <div className="form-section" style={{ marginBottom: '0' }}>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Name <span className="required">*</span></label>
                      <input type="text" className="form-control" required value={editingLead.name} onChange={e => setEditingLead({ ...editingLead, name: e.target.value })} placeholder="Lead name" />
                    </div>
                    <div className="form-group">
                      <label>Phone <span className="required">*</span></label>
                      <input type="text" className="form-control" required value={editingLead.phone} onChange={e => setEditingLead({ ...editingLead, phone: e.target.value })} placeholder="Mobile number" />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Email</label>
                      <input type="email" className="form-control" value={editingLead.email} onChange={e => setEditingLead({ ...editingLead, email: e.target.value })} placeholder="Email (optional)" />
                    </div>
                    <div className="form-group">
                      <label>Source Origin</label>
                      <select className="form-control" value={editingLead.source} onChange={e => setEditingLead({ ...editingLead, source: e.target.value })}>
                        {sourceOptions.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Interest Level</label>
                      <select className="form-control" value={editingLead.interest} onChange={e => setEditingLead({ ...editingLead, interest: e.target.value })}>
                        <option value="High">🔥 High</option>
                        <option value="Neutral">😐 Neutral</option>
                        <option value="Low">❄️ Low</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Assigned Associate</label>
                      <select className="form-control" value={editingLead.associate} onChange={e => {
                        const picked = associates.find(a => a.name === e.target.value);
                        setEditingLead({ ...editingLead, associate: e.target.value, associateId: picked?.id || '' });
                      }}>
                        {associates.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="form-row full">
                    <div className="form-group">
                      <label>Description</label>
                      <textarea className="form-textarea" value={editingLead.description} onChange={e => setEditingLead({ ...editingLead, description: e.target.value })} placeholder="Lead description / notes"></textarea>
                    </div>
                  </div>
                </div>
              </div>
              <div className="crispr-modal-footer">
                <button type="button" className="btn btn-default" onClick={() => setEditingLead(null)}>Cancel</button>
                <button type="submit" style={{ background: '#006073', color: 'white', border: 'none', padding: '8px 20px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>Save Lead</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════ Reassign Associate Modal ══════ */}
      {reassignLead && (
        <div className="crispr-modal-backdrop active" onClick={() => setReassignLead(null)}>
          <div className="crispr-modal-dialog" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
            <div className="crispr-modal-header">
              <h3><Icon className="ti ti-exchange-vertical" /> Reassign Associate</h3>
              <button className="crispr-modal-close" onClick={() => setReassignLead(null)}><Icon className="ti ti-close" /></button>
            </div>
            <div className="crispr-modal-body">
              <p style={{ margin: '0 0 15px 0', color: '#475569', fontSize: '14px' }}>
                Select a new associate for <strong>{reassignLead.name}</strong>:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {associates.map(a => (
                  <div key={a.id} onClick={() => handleReassign(a.name)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 15px', borderRadius: '8px', border: '1px solid', borderColor: reassignLead.associate === a.name ? '#006073' : '#e2e8f0', background: reassignLead.associate === a.name ? '#e0f2f1' : 'white', cursor: 'pointer', transition: 'all 0.15s' }} className="lm-dp-hover">
                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: reassignLead.associate === a.name ? '#006073' : '#e0f2f1', color: reassignLead.associate === a.name ? 'white' : '#006073', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '14px' }}>
                      {a.name.charAt(0)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <strong style={{ fontSize: '14px', color: '#1e293b' }}>{a.name}</strong>
                      {reassignLead.associate === a.name && <span style={{ fontSize: '11px', color: '#006073', marginLeft: '8px' }}>(Current)</span>}
                    </div>
                    {reassignLead.associate === a.name && <Icon className="ti ti-check" style={{ color: '#006073', fontSize: '18px' }} />}
                  </div>
                ))}
              </div>
            </div>
            <div className="crispr-modal-footer">
              <button className="btn btn-default" onClick={() => setReassignLead(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .lm-tr-hover:hover { background-color: #f8f9fa; }
        .lm-dp-hover:hover { background-color: #f3f4f6; }
      `}</style>
    </div>
  );
}

/* ── Shared inline styles ── */
const tdStyle = { padding: '14px 16px', verticalAlign: 'middle', color: '#4b5563', fontSize: '14px' };
const selStyle = { padding: '8px 15px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', fontWeight: 500, background: 'white', color: '#4b5563' };
const metaLabel = { fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' };
