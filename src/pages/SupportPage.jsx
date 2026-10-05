import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  listThreads,
  listAssociates,
  listThreadTickets,
  getTicket,
  createTicket,
  updateTicket,
  sendMessage as apiSendMessage,
  blockThread as apiBlockThread,
  unblockThread as apiUnblockThread,
  listThreadMessages,
  listTicketNotes,
  createTicketNote,
  extractApiError,
  getApiErrorCode,
} from '../lib/supportApi';
import { useUser, usePermission } from '../lib/userStore';
import { SEARCH_DEBOUNCE_MS } from '../hooks/useDebouncedValue';
import Icon from '../components/Icon';

const TAGS = ['None', 'Escalation', 'Feedback', 'Purchase', 'Complaint', 'Legal', 'Technical Issue', 'Other'];

const TEMPLATES = [
  { id: 't1', label: 'Greeting', text: 'Hello! Thank you for reaching out. How can I assist you today?' },
  { id: 't2', label: 'Apology for Delay', text: 'We sincerely apologize for the delay in our response. Let me look into this right away.' },
  { id: 't3', label: 'Feedback Acknowledgment (Negative)', text: 'We are very sorry to hear about your negative experience. Your feedback is valuable to us and we will work to address this issue.' },
  { id: 't4', label: 'Technical Issue', text: 'Please ensure your app is updated to the latest version. If the issue persists, could you share a screenshot?' },
  { id: 't5', label: 'Issue Resolved', text: 'I have checked the system and your issue should now be resolved. Let us know if you face any further difficulties.' },
  { id: 't6', label: 'Closing', text: 'If there is nothing else, I will be closing this ticket. Have a great day ahead!' },
];

const TICKET_STATUS_LABEL = { DRAFT: 'Draft', IN_PROGRESS: 'In Progress', RESOLVED: 'Resolved' };

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatTime(value) {
  const date = toDate(value);
  if (!date) return '';
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function daysSince(value) {
  const date = toDate(value);
  if (!date) return 0;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)));
}

const EMOJI_STRIP_REGEX = /[\p{Extended_Pictographic}‍️]/gu;
function stripEmojis(text) { return text.replace(EMOJI_STRIP_REGEX, ''); }

// Strip trailing "(+91 …)" / "(<phone>)" suffix from a display name. Used
// only on the listing rows — the right-panel header keeps the full name.
function stripPhoneSuffix(name) {
  return (name || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
}

// Source label normaliser — accepts either the legacy `type` or the new
// `sourceLabel` field. Returns 'APP' or 'WHATSAPP'.
function sourceOf(thread) {
  const raw = (thread?.sourceLabel || thread?.type || '').toString().toUpperCase();
  if (raw === 'APP' || raw === 'APP_TICKET') return 'APP';
  return 'WHATSAPP';
}

export default function SupportPage() {
  const userCtx = useUser();
  const currentUserName = userCtx?.user?.name || 'You';
  const { can } = usePermission();
  const canUnblock = can('supportChat.unblock');
  const [searchParams, setSearchParams] = useSearchParams();
  const urlThreadId = searchParams.get('id') || '';
  const initialIdHandledRef = useRef(false);

  // Server-loaded data
  const [threads, setThreads] = useState([]);
  const [threadsMeta, setThreadsMeta] = useState({ page: 1, size: 10, total: 0, totalPages: 1, unreadCount: 0 });
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [threadsError, setThreadsError] = useState('');
  const [threadsRefreshTrigger, setThreadsRefreshTrigger] = useState(0);
  const bumpThreadsRefresh = () => setThreadsRefreshTrigger(n => n + 1);
  const [associates, setAssociates] = useState([]);

  // Selected thread + locally maintained message timeline (we don't yet have a
  // full thread-detail endpoint per guide §7 — seed with lastMessage on
  // selection, append locally on send/system events).
  const [selectedThreadId, setSelectedThreadId] = useState(null);
  // Backing store for a thread opened via ?id=… that doesn't appear on the
  // currently loaded threads page — kept separately so the periodic threads
  // refetch doesn't wipe it.
  const [syntheticThread, setSyntheticThread] = useState(null);
  const [localMessages, setLocalMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState('');
  const [activeTicket, setActiveTicket] = useState(null);

  const [showProfileModal, setShowProfileModal] = useState(null);

  // Filters + pagination
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('All');
  const [showPendingOnly, setShowPendingOnly] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Reply composer
  const [replyText, setReplyText] = useState('');
  const [showReplyBox, setShowReplyBox] = useState(false);
  const [emojiBlocked, setEmojiBlocked] = useState(false);
  const [asResolution, setAsResolution] = useState(false);
  const [sendError, setSendError] = useState('');
  const [sending, setSending] = useState(false);

  // Create-ticket modal
  const [showCreateTicket, setShowCreateTicket] = useState(false);
  const [ticketForm, setTicketForm] = useState({ title: '', description: '', assigneeId: '', tag: 'None', status: 'IN_PROGRESS' });
  const [ticketFormError, setTicketFormError] = useState('');
  const [creatingTicket, setCreatingTicket] = useState(false);

  // View-ticket panel
  const [showViewTicket, setShowViewTicket] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [ticketUpdateError, setTicketUpdateError] = useState('');
  const [ticketNotes, setTicketNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteError, setNoteError] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // Previous tickets modal
  const [showPreviousTickets, setShowPreviousTickets] = useState(false);
  const [previousTickets, setPreviousTickets] = useState([]);
  const [previousTicketsLoading, setPreviousTicketsLoading] = useState(false);
  const [drillTicket, setDrillTicket] = useState(null);
  const [drillNotesVisible, setDrillNotesVisible] = useState(false);
  const [drillNotes, setDrillNotes] = useState([]);
  const [drillNotesLoading, setDrillNotesLoading] = useState(false);

  const threadEndRef = useRef(null);
  const replyTextareaRef = useRef(null);

  const selectedThread = useMemo(() => {
    const inList = threads.find(t => String(t.id) === String(selectedThreadId));
    if (inList) return inList;
    if (syntheticThread && String(syntheticThread.id) === String(selectedThreadId)) return syntheticThread;
    return null;
  }, [threads, selectedThreadId, syntheticThread]);

  const hasOpenTicket = !!activeTicket && (activeTicket.status === 'DRAFT' || activeTicket.status === 'IN_PROGRESS');
  const isThreadBlocked = useMemo(() => localMessages.some(m => m.blockedThread === 1), [localMessages]);
  const [blocking, setBlocking] = useState(false);
  // 'block' | 'unblock' | null — drives the confirmation modal.
  const [confirmBlockAction, setConfirmBlockAction] = useState(null);

  const requestBlockThread = () => {
    if (!selectedThread || blocking || isThreadBlocked) return;
    setConfirmBlockAction('block');
  };

  const requestUnblockThread = () => {
    if (!selectedThread || blocking || !isThreadBlocked) return;
    setConfirmBlockAction('unblock');
  };

  const handleBlockThread = async () => {
    if (!selectedThread || blocking || isThreadBlocked) return;
    setBlocking(true);
    try {
      await apiBlockThread(selectedThread.id);
      setLocalMessages(prev => prev.map(m => ({ ...m, blockedThread: 1 })));
      setThreads(prev => prev.map(c => c.id === selectedThread.id ? { ...c, blockedThread: 1 } : c));
      bumpThreadsRefresh();
      setConfirmBlockAction(null);
    } catch (err) {
      window.alert(extractApiError(err, 'Failed to block this thread.'));
    } finally {
      setBlocking(false);
    }
  };

  const handleUnblockThread = async () => {
    if (!selectedThread || blocking || !isThreadBlocked) return;
    setBlocking(true);
    try {
      await apiUnblockThread(selectedThread.id);
      setLocalMessages(prev => prev.map(m => ({ ...m, blockedThread: 0 })));
      setThreads(prev => prev.map(c => c.id === selectedThread.id ? { ...c, blockedThread: 0 } : c));
      bumpThreadsRefresh();
      setConfirmBlockAction(null);
    } catch (err) {
      window.alert(extractApiError(err, 'Failed to unblock this thread.'));
    } finally {
      setBlocking(false);
    }
  };

  // ---------- Effects: data loading ----------

  // Debounce search input → searchQuery
  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(searchInput), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, assigneeFilter, showPendingOnly]);

  // Fetch threads on filter/page change
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setThreadsLoading(true);
      setThreadsError('');
      try {
        const { items, meta } = await listThreads({
          page: currentPage,
          size: itemsPerPage,
          search: searchQuery,
          assignee: assigneeFilter === 'All' ? '' : assigneeFilter,
          pendingOnly: showPendingOnly,
          sort: '-lastUpdate',
        });
        if (cancelled) return;
        setThreads(items);
        setThreadsMeta(meta);
      } catch (err) {
        if (!cancelled) setThreadsError(extractApiError(err, 'Failed to load chats.'));
      } finally {
        if (!cancelled) setThreadsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [currentPage, searchQuery, assigneeFilter, showPendingOnly, threadsRefreshTrigger]);

  // Auto-open the thread named in ?id=... on first load. If the id is invalid
  // (no such thread), clear it from the URL. If the thread exists in DB but is
  // not on the currently-loaded page, synthesize a minimal row so the right
  // panel can render.
  useEffect(() => {
    if (initialIdHandledRef.current) return;
    if (!urlThreadId) {
      initialIdHandledRef.current = true;
      return;
    }
    if (threadsLoading) return;
    initialIdHandledRef.current = true;

    (async () => {
      const match = threads.find(c => String(c.id) === String(urlThreadId));
      if (match) {
        handleSelectChat(match.id);
        return;
      }
      try {
        // Probe to confirm the thread exists and to learn the sender name.
        const { items } = await listThreadMessages(urlThreadId, { page: 1, size: 1 });
        const probe = items[0];
        const looksLikeWhatsApp = !!probe?.mobile;
        const synthetic = {
          id: urlThreadId,
          sourceLabel: looksLikeWhatsApp ? 'WHATSAPP' : 'APP',
          type: looksLikeWhatsApp ? 'whatsapp_lead' : 'app_ticket',
          studentName: probe?.userName
            ? (probe.mobile ? `${probe.userName} (${probe.mobile})` : probe.userName)
            : (probe?.mobile || `Thread ${urlThreadId}`),
          studentId: null,
          assignee: '',
          tag: 'None',
          status: 'In Progress',
          unread: false,
          lastUpdate: probe?.timestamp || new Date().toISOString(),
          createdAt: probe?.timestamp || new Date().toISOString(),
          messageCount: 0,
          lastMessage: probe || null,
          activeTicket: null,
          ticketCount: 0,
        };
        setSyntheticThread(synthetic);
        handleSelectChat(synthetic.id);
      } catch (err) {
        setSearchParams(prev => {
          const next = new URLSearchParams(prev);
          next.delete('id');
          return next;
        }, { replace: true });
      }
    })();
  }, [urlThreadId, threadsLoading, threads]);

  // Load associates once
  useEffect(() => {
    (async () => {
      try {
        const list = await listAssociates();
        setAssociates(list);
      } catch (err) {
        // non-fatal — UI falls back to whatever name is denormalised on each ticket
        console.error('Failed to load associates', err);
      }
    })();
  }, []);

  // Scroll to bottom of thread on selection / messages change
  useEffect(() => {
    if (threadEndRef.current) {
      threadEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [selectedThreadId, localMessages.length]);

  // Sync activeTicket with the selected thread's activeTicket
  useEffect(() => {
    setActiveTicket(selectedThread?.activeTicket || null);
  }, [selectedThread?.id, selectedThread?.activeTicket]);

  // ---------- Derived ----------

  const activeAssociates = useMemo(() => associates.filter(a => a.active !== false), [associates]);
  const assigneeFilterOptions = useMemo(() => {
    // Filter dropdown uses NAME per guide §3.1; include Unassigned + active assignees
    const names = activeAssociates.map(a => a.name);
    return ['Unassigned', ...names];
  }, [activeAssociates]);

  // ---------- Handlers ----------

  const handleSelectChat = async (chatId) => {
    setSelectedThreadId(chatId);
    // If the user is picking a row from the list, the synthetic row is no
    // longer needed.
    setSyntheticThread(prev => (prev && String(prev.id) !== String(chatId) ? null : prev));
    // Reflect selection in the URL so a refresh restores the same thread.
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('id', String(chatId));
      return next;
    }, { replace: true });
    setReplyText('');
    setShowReplyBox(false);
    setShowViewTicket(false);
    setAsResolution(false);
    setSendError('');
    setTicketUpdateError('');
    setNoteDraft('');
    setTicketNotes([]);
    setMessagesError('');

    const chat = threads.find(c => c.id === chatId);
    // Seed with the lastMessage preview so the panel isn't empty during fetch.
    setLocalMessages(chat?.lastMessage ? [chat.lastMessage] : []);

    // Optimistically mark read locally (server-side mark-read endpoint is TBD).
    if (chat?.unread) {
      setThreads(prev => prev.map(c => c.id === chatId ? { ...c, unread: false } : c));
    }

    // Fetch full message history.
    setMessagesLoading(true);
    try {
      const { items } = await listThreadMessages(chatId, { page: 1, size: 50 });
      // Sort ascending so newest is at the bottom (UI convention).
      const ordered = [...items].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      // Only commit if the user hasn't switched away mid-fetch.
      setSelectedThreadId(curId => {
        if (curId === chatId) setLocalMessages(ordered);
        return curId;
      });
    } catch (err) {
      setSelectedThreadId(curId => {
        if (curId === chatId) setMessagesError(extractApiError(err, 'Failed to load messages.'));
        return curId;
      });
    } finally {
      setMessagesLoading(false);
    }
  };

  const handleTemplateChange = (e) => {
    const templateId = e.target.value;
    if (templateId) {
      const template = TEMPLATES.find(t => t.id === templateId);
      if (template) setReplyText(prev => prev + (prev ? '\n\n' : '') + template.text);
      e.target.value = '';
    }
  };

  const handleSendMessage = async () => {
    const text = replyText.trim();
    if (!text || !selectedThread || sending) return;
    setSending(true);
    setSendError('');

    const tempId = `tmp_${Date.now()}`;
    const optimistic = {
      id: tempId,
      sender: 'agent',
      text,
      timestamp: new Date().toISOString(),
      _pending: true,
    };
    setLocalMessages(prev => [...prev, optimistic]);

    try {
      // When sending as resolution, also persist the same text as an internal
      // note on the active ticket. Must happen BEFORE the resolution send,
      // since the server rejects notes on RESOLVED tickets.
      if (asResolution && activeTicket) {
        try {
          const note = await createTicketNote(activeTicket.id, { text });
          setTicketNotes(prev => [...prev, note]);
          setActiveTicket(t => t ? { ...t, noteCount: (t.noteCount || 0) + 1 } : t);
        } catch (noteErr) {
          setLocalMessages(prev => prev.filter(m => m.id !== tempId));
          setSendError(extractApiError(noteErr, 'Failed to record internal note — resolution not sent.'));
          setSending(false);
          return;
        }
      }

      const result = await apiSendMessage(selectedThread.id, { text, asResolution });
      // asResolution=true → { message, ticket }; plain reply → ChatMessage
      const message = result?.message || result;
      const ticket = result?.ticket;

      setLocalMessages(prev => prev.map(m => m.id === tempId ? { ...message, _pending: false } : m));

      if (ticket) {
        setActiveTicket(ticket);
        setThreads(prev => prev.map(c => c.id === selectedThread.id ? { ...c, activeTicket: ticket } : c));
        // Server also emits a system audit message; reflect it locally.
        setLocalMessages(prev => [...prev, {
          id: `m_sys_${Date.now()}`,
          sender: 'system',
          text: `Ticket ${ticket.ticketCode} marked Resolved by ${currentUserName}.`,
          timestamp: new Date().toISOString(),
        }]);
      }

      setReplyText('');
      setAsResolution(false);
      replyTextareaRef.current?.focus();
      bumpThreadsRefresh();
    } catch (err) {
      setLocalMessages(prev => prev.filter(m => m.id !== tempId));
      const code = getApiErrorCode(err);
      if (code === 'no_active_ticket') setSendError('Cannot send as resolution — no active ticket on this thread.');
      else if (code === 'already_resolved') setSendError('The active ticket is already resolved.');
      else setSendError(extractApiError(err, 'Failed to send message.'));
    } finally {
      setSending(false);
    }
  };

  const handleOpenReplyBox = () => {
    setShowReplyBox(true);
    setShowViewTicket(false);
    setTimeout(() => replyTextareaRef.current?.focus(), 0);
  };

  const openCreateTicketModal = () => {
    const lastUserMsg = [...localMessages].reverse().find(m => m.sender === 'user');
    setTicketForm({
      title: lastUserMsg ? (lastUserMsg.text || '').slice(0, 80) : '',
      description: '',
      assigneeId: '',
      tag: selectedThread?.tag && selectedThread.tag !== 'None' ? selectedThread.tag : 'None',
      status: 'IN_PROGRESS',
    });
    setTicketFormError('');
    setShowCreateTicket(true);
  };

  const handleCreateTicket = async () => {
    if (!selectedThread) return;
    if (!ticketForm.title.trim()) {
      setTicketFormError('Title is required.');
      return;
    }
    setCreatingTicket(true);
    setTicketFormError('');
    try {
      const payload = {
        title: ticketForm.title.trim(),
        description: ticketForm.description.trim() || null,
        assigneeId: ticketForm.assigneeId ? Number(ticketForm.assigneeId) : null,
        tag: ticketForm.tag,
        status: ticketForm.status,
      };
      const ticket = await createTicket(selectedThread.id, payload);
      setActiveTicket(ticket);
      setThreads(prev => prev.map(c =>
        c.id === selectedThread.id
          ? { ...c, activeTicket: ticket, ticketCount: (c.ticketCount || 0) + 1 }
          : c
      ));
      // Mirror the server's audit message locally so the agent sees confirmation.
      setLocalMessages(prev => [...prev, {
        id: `m_sys_${Date.now()}`,
        sender: 'system',
        text: `Ticket ${ticket.ticketCode} raised, assigned to ${ticket.assigneeName || 'Unassigned'} by ${currentUserName}.`,
        timestamp: new Date().toISOString(),
      }]);
      setShowCreateTicket(false);
      bumpThreadsRefresh();
    } catch (err) {
      const code = getApiErrorCode(err);
      if (code === 'ticket_already_open') setTicketFormError('A ticket is already open on this thread.');
      else setTicketFormError(extractApiError(err, 'Failed to create ticket.'));
    } finally {
      setCreatingTicket(false);
    }
  };

  const patchActiveTicket = async (patch, systemMsgFn) => {
    if (!activeTicket || !selectedThread) return;
    setTicketUpdateError('');
    const prevTicket = activeTicket;
    // Optimistic local update
    const optimistic = { ...activeTicket, ...patch, updatedAt: new Date().toISOString() };
    setActiveTicket(optimistic);
    setThreads(prev => prev.map(c => c.id === selectedThread.id ? { ...c, activeTicket: optimistic } : c));
    try {
      const updated = await updateTicket(activeTicket.id, patch);
      setActiveTicket(updated);
      setThreads(prev => prev.map(c => c.id === selectedThread.id ? { ...c, activeTicket: updated } : c));
      bumpThreadsRefresh();
      if (systemMsgFn) {
        setLocalMessages(prev => [...prev, {
          id: `m_sys_${Date.now()}`,
          sender: 'system',
          text: systemMsgFn(updated, prevTicket),
          timestamp: new Date().toISOString(),
        }]);
      }
    } catch (err) {
      setActiveTicket(prevTicket);
      setThreads(prev => prev.map(c => c.id === selectedThread.id ? { ...c, activeTicket: prevTicket } : c));
      const code = getApiErrorCode(err);
      if (code === 'invalid_transition') setTicketUpdateError('That status change is not allowed.');
      else setTicketUpdateError(extractApiError(err, 'Failed to update ticket.'));
    }
  };

  const handleTicketAssigneeChange = (assigneeId) => {
    const id = assigneeId ? Number(assigneeId) : null;
    if (id === activeTicket?.assigneeId) return;
    const newName = id ? (associates.find(a => a.id === id)?.name || 'Assignee') : 'Unassigned';
    patchActiveTicket(
      { assigneeId: id, assigneeName: newName },
      (updated, prev) => `Reassigned ${prev?.assigneeName || 'Unassigned'} → ${updated.assigneeName || 'Unassigned'} by ${currentUserName}`
    );
  };

  const handleTicketTagChange = (tag) => {
    if (!activeTicket || tag === activeTicket.tag) return;
    patchActiveTicket({ tag });
  };

  const handleTicketStatusChange = (newStatus) => {
    if (!activeTicket || newStatus === activeTicket.status) return;
    patchActiveTicket(
      { status: newStatus },
      (updated) => `Status changed to ${TICKET_STATUS_LABEL[updated.status] || updated.status} by ${currentUserName}.`
    );
  };

  const handleOpenViewTicket = async () => {
    if (!activeTicket) return;
    setShowViewTicket(true);
    setShowReplyBox(false);
    setNoteDraft('');
    setNoteError('');
    setTicketUpdateError('');

    // Refresh: GET /tickets/:id now embeds notes[] (change doc §3.2)
    setNotesLoading(true);
    try {
      const fresh = await getTicket(activeTicket.id);
      setActiveTicket(fresh);
      setThreads(prev => prev.map(c => c.id === selectedThreadId ? { ...c, activeTicket: fresh } : c));
      setTicketNotes(Array.isArray(fresh?.notes) ? fresh.notes : []);
    } catch (err) {
      // Fall back to dedicated list endpoint if embedded notes weren't there
      try {
        const { items } = await listTicketNotes(activeTicket.id);
        setTicketNotes(items);
      } catch (innerErr) {
        console.error('Failed to load notes', innerErr);
      }
    } finally {
      setNotesLoading(false);
    }
  };

  const handleAddNote = async () => {
    const text = noteDraft.trim();
    if (!text || !activeTicket || addingNote) return;
    setAddingNote(true);
    setNoteError('');
    try {
      const note = await createTicketNote(activeTicket.id, { text });
      setTicketNotes(prev => [...prev, note]);
      // Bump local noteCount + updatedAt without a full refetch.
      const bumped = {
        ...activeTicket,
        noteCount: (activeTicket.noteCount || 0) + 1,
        updatedAt: new Date().toISOString(),
      };
      setActiveTicket(bumped);
      setThreads(prev => prev.map(c => c.id === selectedThreadId ? { ...c, activeTicket: bumped } : c));
      setNoteDraft('');
    } catch (err) {
      const code = getApiErrorCode(err);
      if (code === 'ticket_resolved') {
        setNoteError('This ticket was resolved. Re-open to add notes.');
        // Refresh activeTicket so the UI reflects the server's current state.
        try {
          const fresh = await getTicket(activeTicket.id);
          setActiveTicket(fresh);
          setThreads(prev => prev.map(c => c.id === selectedThreadId ? { ...c, activeTicket: fresh } : c));
          setTicketNotes(Array.isArray(fresh?.notes) ? fresh.notes : ticketNotes);
        } catch (_) { /* ignore */ }
      } else {
        setNoteError(extractApiError(err, 'Failed to add note.'));
      }
    } finally {
      setAddingNote(false);
    }
  };

  const openPreviousTickets = useCallback(async () => {
    if (!selectedThread) return;
    setShowPreviousTickets(true);
    setPreviousTicketsLoading(true);
    setPreviousTickets([]);
    setDrillTicket(null);
    try {
      const { items } = await listThreadTickets(selectedThread.id, { size: 50 });
      setPreviousTickets(items);
    } catch (err) {
      console.error('Failed to load previous tickets', err);
    } finally {
      setPreviousTicketsLoading(false);
    }
  }, [selectedThread]);

  const openDrillTicket = async (id) => {
    setDrillNotesVisible(false);
    setDrillNotes([]);
    try {
      const t = await getTicket(id);
      setDrillTicket(t);
      // GET /tickets/:id embeds notes[] per the contract — use it directly.
      if (Array.isArray(t?.notes)) setDrillNotes(t.notes);
    } catch (err) {
      console.error('Failed to load ticket', err);
    }
  };

  const toggleDrillNotes = async () => {
    if (drillNotesVisible) {
      setDrillNotesVisible(false);
      return;
    }
    setDrillNotesVisible(true);
    // If notes weren't embedded (older payload), fetch them on demand.
    if (drillTicket && drillNotes.length === 0 && (drillTicket.noteCount || 0) > 0) {
      setDrillNotesLoading(true);
      try {
        const { items } = await listTicketNotes(drillTicket.id);
        setDrillNotes(items);
      } catch (err) {
        console.error('Failed to load ticket notes', err);
      } finally {
        setDrillNotesLoading(false);
      }
    }
  };

  // ---------- Render helpers ----------

  const totalPages = Math.max(1, threadsMeta.totalPages || 1);

  const renderStatusChip = (status) => (
    <span className={`ticket-status-chip status-${status.toLowerCase()}`}>
      {TICKET_STATUS_LABEL[status] || status}
    </span>
  );

  return (
    <div className="support-inbox-page">
      <div className="page-header-section">
        <div className="page-header-title-group">
          <span className="page-header-icon-box"><Icon className="fa fa-life-ring" /></span>
          <div>
            <h2>Support Inbox</h2>
            <p>Consolidated view for student support tickets and potential leads chats.</p>
          </div>
        </div>
      </div>

      <div className="support-main-container">
        {/* Left Panel - Inbox */}
        <div className="support-left-panel">
          <div className="filter-bar support-internal-filters">
            <div className="search-wrapper" style={{ width: '100%', marginBottom: '10px' }}>
              <Icon className={`ti ${searchInput ? 'ti-close' : 'ti-search'}`}
                 style={{ cursor: searchInput ? 'pointer' : 'default' }}
                 onClick={() => { if (searchInput) setSearchInput(''); }} />
              <input
                type="text"
                className="search-input"
                placeholder="Search chats, student names..."
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
              />
            </div>

            <div className="support-filter-row">
              <select
                className="legacy-select support-filter-select"
                value={assigneeFilter}
                onChange={e => setAssigneeFilter(e.target.value)}
              >
                <option value="All">All Assignees</option>
                {assigneeFilterOptions.map(a => <option key={a} value={a}>{a}</option>)}
              </select>

              <label className="support-toggle-label">
                <input
                  type="checkbox"
                  checked={showPendingOnly}
                  onChange={e => setShowPendingOnly(e.target.checked)}
                />
                Show Pending Only
              </label>
            </div>
          </div>

          <div className="support-chat-list">
            {threadsError ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#b32f2f', fontSize: '13px' }}>
                <Icon className="ti ti-alert" /> {threadsError}
              </div>
            ) : threadsLoading && threads.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#999', fontSize: '14px' }}>
                Loading…
              </div>
            ) : threads.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#999', fontSize: '14px' }}>
                No chats found matching criteria.
              </div>
            ) : (
              threads.map(chat => {
                const lastMessage = chat.lastMessage;
                const src = sourceOf(chat);
                const isApp = src === 'APP';
                const at = chat.activeTicket;
                const rowHasOpenTicket = !!(chat.activeSupportTickets ?? (at && (at.status === 'DRAFT' || at.status === 'IN_PROGRESS')));
                return (
                  <div
                    key={chat.id}
                    className={`support-chat-item ${chat.unread ? 'unread' : ''} ${selectedThreadId === chat.id ? 'active' : ''}`}
                    onClick={() => handleSelectChat(chat.id)}
                  >
                    <span
                      className={`chat-source-icon ${isApp ? 'app_ticket' : 'whatsapp'}`}
                      data-tooltip={isApp ? 'Ticket from Students App' : 'Ticket from WhatsApp Bot'}
                      aria-label={isApp ? 'Ticket from Students App' : 'Ticket from WhatsApp Bot'}
                    >
                      <Icon className={`ti ${isApp ? 'ti-mobile' : 'ti-comment-alt'}`} />
                    </span>
                    <div className="chat-item-content">
                      <div className="chat-item-header">
                        <span className="chat-name-wrap">
                          <span className="chat-name">
                            {chat.blockedThread === 1 && (
                              <Icon className="ti ti-na chat-blocked-icon" title="Blocked Thread" aria-label="Blocked Thread" />
                            )}
                            {stripPhoneSuffix(chat.studentName)}
                          </span>
                          {rowHasOpenTicket && (() => {
                            const tag = (at?.tag || chat.tag || '').trim();
                            const showTag = tag && tag !== 'None';
                            return (
                              <span className="chat-label chat-label-progress">
                                In Progress{showTag ? ` - ${tag}` : ''}
                              </span>
                            );
                          })()}
                        </span>
                        <span className="chat-time-wrap">
                          {rowHasOpenTicket && chat.assignee && chat.assignee !== 'Unassigned' && (
                            <span className="chat-badge assignee"><Icon className="ti ti-user" /> {chat.assignee}</span>
                          )}
                          {chat.unread && <span className="chat-unread-dot" aria-label="Unread" />}
                          <span className="chat-time">{formatTime(chat.lastUpdate)}</span>
                        </span>
                      </div>
                      {lastMessage && (
                        <div className="chat-last-message">
                          {lastMessage.sender === 'agent' ? 'You: ' : ''}{lastMessage.text}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="support-pagination">
            <button
              className="legacy-btn legacy-btn-default legacy-btn-small"
              disabled={currentPage === 1 || threadsLoading}
              onClick={() => setCurrentPage(p => p - 1)}
            >
              <Icon className="ti ti-angle-left" /> Prev
            </button>
            <span style={{ fontSize: '12px', color: '#666' }}>Page {currentPage} of {totalPages}</span>
            <button
              className="legacy-btn legacy-btn-default legacy-btn-small"
              disabled={currentPage >= totalPages || threadsLoading}
              onClick={() => setCurrentPage(p => p + 1)}
            >
              Next <Icon className="ti ti-angle-right" />
            </button>
          </div>
        </div>

        {/* Right Panel - Thread */}
        <div className="support-right-panel">
          {!selectedThread ? (
            <div className="support-empty-state">
              <Icon className="ti ti-comments" />
              <h3>Select a conversation</h3>
              <p>Choose a ticket or chat from the left panel to view and reply.</p>
            </div>
          ) : (
            <>
              {/* Thread Header */}
              <div className="support-thread-header">
                <div className="thread-user-info">
                  <h3>
                    {sourceOf(selectedThread) === 'APP' ? (
                      <a
                        href="#!"
                        className="student-profile-link"
                        onClick={(e) => { e.preventDefault(); setShowProfileModal(selectedThread); }}
                      >
                        {selectedThread.studentName}
                      </a>
                    ) : (
                      selectedThread.studentName
                    )}
                    {activeTicket && renderStatusChip(activeTicket.status)}
                  </h3>
                </div>
                <div className="thread-user-meta thread-user-meta-right">
                  {(() => {
                    const ticketAge = activeTicket ? daysSince(activeTicket.createdAt) : null;
                    const parts = [];
                    if (ticketAge !== null && ticketAge > 0) parts.push(<span key="ticket-age"><strong>Ticket Age:</strong> {ticketAge} days</span>);
                    if ((selectedThread.ticketCount || 0) >= 1) {
                      parts.push(
                        <a key="prev" href="#!" onClick={e => { e.preventDefault(); openPreviousTickets(); }} className="thread-prev-tickets-link">
                          Support Tickets ({selectedThread.ticketCount})
                        </a>
                      );
                    }
                    return parts.reduce((acc, el, i) => i === 0 ? [el] : [...acc, <span key={`sep-${i}`}>•</span>, el], []);
                  })()}
                </div>
              </div>

              {/* Source banner */}
              {(() => {
                const isWa = sourceOf(selectedThread) === 'WHATSAPP';
                const bannerClass = isThreadBlocked ? 'blocked' : (isWa ? 'whatsapp' : 'app');
                const label = isThreadBlocked
                  ? 'User was texting via his WhatsApp and is Blocked currently'
                  : (isWa ? 'User is texting via his WhatsApp' : 'User is texting via from Students App');
                const iconClass = isWa ? 'ti-comment-alt' : 'ti-mobile';
                return (
                  <div className={`thread-source-banner ${bannerClass}`}>
                    <span className="thread-source-banner-main">
                      <Icon className={`ti ${isThreadBlocked ? 'ti-na' : iconClass}`} />
                      <span>{label}</span>
                    </span>
                    {isWa && !isThreadBlocked && (
                      <button
                        type="button"
                        className="thread-block-btn"
                        title="Block this WhatsApp number"
                        onClick={requestBlockThread}
                        disabled={blocking}
                      >
                        {blocking ? 'BLOCKING…' : 'BLOCK'}
                      </button>
                    )}
                    {isWa && isThreadBlocked && canUnblock && (
                      <button
                        type="button"
                        className="thread-block-btn thread-unblock-btn"
                        title="Unblock this WhatsApp number"
                        onClick={requestUnblockThread}
                        disabled={blocking}
                      >
                        {blocking ? 'UNBLOCKING…' : 'UNBLOCK'}
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* Chat Thread */}
              <div className="support-thread-messages">
                {messagesError ? (
                  <div style={{ textAlign: 'center', color: '#b32f2f', fontSize: '13px', padding: '20px' }}>
                    <Icon className="ti ti-alert" /> {messagesError}
                  </div>
                ) : messagesLoading && localMessages.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#999', fontSize: '13px', padding: '20px' }}>
                    Loading messages…
                  </div>
                ) : localMessages.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#999', fontSize: '13px', padding: '20px' }}>
                    No messages yet.
                  </div>
                ) : localMessages.map(msg => (
                  (msg.sender === 'system' || msg.intent === 'TICKET_UPDATE') ? (
                    <div key={msg.id} className="message-bubble-wrapper system">
                      <div className="system-message">
                        <div className="system-message-text">{msg.text}</div>
                        <div className="system-message-footer">
                          <span className="system-message-internal-note">
                            <svg className="eye-off-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a19.79 19.79 0 0 1 4.22-5.94" />
                              <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a19.86 19.86 0 0 1-2.16 3.19" />
                              <path d="M14.12 14.12A3 3 0 1 1 9.88 9.88" />
                              <line x1="1" y1="1" x2="23" y2="23" />
                            </svg>
                            Not visible to customer
                          </span>
                          <span className="message-time">{formatTime(msg.timestamp)}</span>
                        </div>
                      </div>
                    </div>
                  ) : (() => {
                    const isWhatsAppAction = sourceOf(selectedThread) === 'WHATSAPP'
                      && msg.isUser === true
                      && msg.intent
                      && msg.intent !== 'USER_MSG'
                      && msg.intent !== 'MENTOR_QUERY_SUBMITTED'
                      && msg.intent !== 'MENTOR_QUERY_FOLLOWUP';
                    // Redact customer-sent messages on blocked threads.
                    const isRedactableIntent = msg.intent === 'USER_MSG'
                      || msg.intent === 'MENTOR_QUERY_SUBMITTED'
                      || msg.intent === 'MENTOR_QUERY_FOLLOWUP';
                    const displayText = (isThreadBlocked && msg.isUser === true && isRedactableIntent)
                      ? (msg.text || '').replace(/\S/g, '*')
                      : msg.text;
                    return (
                      <div key={msg.id} className={`message-bubble-wrapper ${msg.sender}`}>
                        <div className={`message-bubble ${msg._pending ? 'pending' : ''} ${msg.kind === 'resolution' ? 'resolution' : ''} ${isWhatsAppAction ? 'wa-action' : ''}`}>
                          {msg.kind === 'resolution' && (
                            <div className="message-resolution-badge"><Icon className="ti ti-check" /> Resolution</div>
                          )}
                          <div>{displayText}</div>
                          {(() => {
                            const isAdminReply = msg.isUser === false
                              && (msg.repliedBy === 'ADMIN' || msg.intent === 'SUPPORT_REPLY');
                            const isAiReply = msg.intent === 'AI_REPLY' && !isAdminReply;
                            return (
                              <div className="message-time">
                                {(isWhatsAppAction || isAiReply || isAdminReply) && (
                                  <span className="message-time-leading">
                                    {isWhatsAppAction && (
                                      <span
                                        className="wa-action-info"
                                        tabIndex={0}
                                        role="button"
                                        aria-label={`User action · ${msg.intent}`}
                                        data-tooltip={`User action · ${msg.intent}`}
                                        onClick={e => e.currentTarget.focus()}
                                      >
                                        <Icon className="ti ti-info-alt" />
                                      </span>
                                    )}
                                    {isAdminReply ? (
                                      <span className="admin-reply-tag" aria-label={`Replied by ${msg.adminName || 'admin'}`}>
                                        <Icon className="ti ti-user" />
                                        {msg.adminName || 'Admin'}
                                      </span>
                                    ) : isAiReply && (
                                      <span className="ai-reply-tag" aria-label="Replied by AI">
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                          <rect x="3" y="8" width="18" height="12" rx="2" />
                                          <line x1="12" y1="3" x2="12" y2="8" />
                                          <circle cx="12" cy="3" r="1.2" fill="currentColor" />
                                          <circle cx="9" cy="13" r="1.2" fill="currentColor" />
                                          <circle cx="15" cy="13" r="1.2" fill="currentColor" />
                                          <line x1="10" y1="17" x2="14" y2="17" />
                                        </svg>
                                        Replied by AI
                                      </span>
                                    )}
                                  </span>
                                )}
                                <span>{formatTime(msg.timestamp)}{msg._pending ? ' · sending…' : ''}</span>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    );
                  })()
                ))}
                <div ref={threadEndRef} />
              </div>

              {/* Reply Box / View Ticket Panel / FAB cluster */}
              {showReplyBox ? (
                <div className="support-thread-reply">
                  <div className="reply-toolbar">
                    <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#444' }}>
                      Reply to {sourceOf(selectedThread) === 'APP' ? 'Student' : 'Lead'}
                    </span>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <select className="legacy-select" onChange={handleTemplateChange} defaultValue="">
                        <option value="" disabled>Insert Quick Template...</option>
                        {TEMPLATES.map(t => (
                          <option key={t.id} value={t.id}>{t.label}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="reply-close-btn"
                        title="Close reply"
                        onClick={() => { setShowReplyBox(false); setReplyText(''); setAsResolution(false); setSendError(''); }}
                      >
                        <Icon className="ti ti-close" />
                      </button>
                    </div>
                  </div>
                  <textarea
                    ref={replyTextareaRef}
                    className="reply-textarea"
                    placeholder="Type your message here... (Cmd/Ctrl + Enter to send)"
                    value={replyText}
                    onChange={e => {
                      const raw = e.target.value;
                      const cleaned = stripEmojis(raw);
                      if (cleaned !== raw) {
                        setEmojiBlocked(true);
                        setTimeout(() => setEmojiBlocked(false), 2000);
                      }
                      setReplyText(cleaned);
                    }}
                    onPaste={e => {
                      const pasted = e.clipboardData.getData('text');
                      const cleaned = stripEmojis(pasted);
                      if (cleaned !== pasted) {
                        e.preventDefault();
                        const el = e.target;
                        const start = el.selectionStart;
                        const end = el.selectionEnd;
                        const next = replyText.slice(0, start) + cleaned + replyText.slice(end);
                        setReplyText(next);
                        setEmojiBlocked(true);
                        setTimeout(() => setEmojiBlocked(false), 2000);
                        setTimeout(() => {
                          el.selectionStart = el.selectionEnd = start + cleaned.length;
                        }, 0);
                      }
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        handleSendMessage();
                      }
                    }}
                  ></textarea>
                  <div className="reply-actions">
                    {emojiBlocked && (
                      <span className="reply-emoji-warning">
                        <Icon className="ti ti-info-alt" /> Emojis aren't allowed — keep replies professional.
                      </span>
                    )}
                    {sendError && (
                      <span className="reply-emoji-warning" style={{ background: '#fdecec', borderColor: '#f5c2c2', color: '#b32f2f' }}>
                        <Icon className="ti ti-alert" /> {sendError}
                      </span>
                    )}
                    {hasOpenTicket && (
                      <label className="support-toggle-label" style={{ marginRight: 'auto' }}>
                        <input
                          type="checkbox"
                          checked={asResolution}
                          onChange={e => setAsResolution(e.target.checked)}
                        />
                        Send as Resolution and Close Ticket
                      </label>
                    )}
                    <button className="btn-send" onClick={handleSendMessage} disabled={sending || !replyText.trim()}>
                      <Icon className="ti ti-location-arrow" style={{ marginRight: '5px' }} />
                      {sending ? 'Sending…' : (asResolution ? 'Send & Close Ticket' : 'Send Message')}
                    </button>
                  </div>
                </div>
              ) : showViewTicket && activeTicket ? (
                <div className="support-thread-reply ticket-view-panel">
                  <div className="reply-toolbar">
                    <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#444' }}>
                      <Icon className="ti ti-ticket" style={{ marginRight: '6px' }} />
                      {activeTicket.ticketCode}
                      <span style={{ marginLeft: '10px' }}>
                        {renderStatusChip(activeTicket.status)}
                      </span>
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ color: '#c0392b', fontWeight: 700, fontSize: '12px', textDecoration: 'underline' }}>
                        These details are not visible to Customers
                      </span>
                      <button
                        type="button"
                        className="reply-close-btn"
                        title="Close ticket view"
                        onClick={() => { setShowViewTicket(false); setNoteDraft(''); setTicketUpdateError(''); }}
                      >
                        <Icon className="ti ti-close" />
                      </button>
                    </div>
                  </div>

                  {ticketUpdateError && (
                    <div className="ticket-form-error" style={{ marginBottom: 0 }}>
                      <Icon className="ti ti-alert" /> {ticketUpdateError}
                    </div>
                  )}

                  <div className="ticket-view-body">
                    {/* Left 40% — Assignee / Tag / Status */}
                    <div className="ticket-view-left">
                      <div className="ticket-form-row">
                        <label className="ticket-form-label">Assignee</label>
                        <select
                          className="legacy-select"
                          value={activeTicket.assigneeId || ''}
                          onChange={e => handleTicketAssigneeChange(e.target.value)}
                        >
                          <option value="">Unassigned</option>
                          {activeAssociates.map(a => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="ticket-form-row">
                        <label className="ticket-form-label">Tag</label>
                        <select
                          className="legacy-select"
                          value={activeTicket.tag}
                          onChange={e => handleTicketTagChange(e.target.value)}
                        >
                          {TAGS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div className="ticket-form-row">
                        <label className="ticket-form-label">Status</label>
                        <select
                          className="legacy-select"
                          value={activeTicket.status}
                          onChange={e => handleTicketStatusChange(e.target.value)}
                        >
                          <option value="DRAFT">Draft</option>
                          <option value="IN_PROGRESS">In Progress</option>
                          <option value="RESOLVED">Resolved</option>
                        </select>
                      </div>
                      <div className="ticket-form-row">
                        <label className="ticket-form-label">Created</label>
                        <div className="ticket-age-value">
                          {toDate(activeTicket.createdAt)?.toLocaleDateString() || '—'}
                          <div className="ticket-age-sub">{daysSince(activeTicket.createdAt)} days ago</div>
                        </div>
                      </div>
                    </div>

                    {/* Right 60% — Original issue + Notes + Add note */}
                    <div className="ticket-view-right">
                      <div className="ticket-original-issue">
                        <div className="ticket-section-label">Original Issue</div>
                        <div className="ticket-view-title">{activeTicket.title}</div>
                        {activeTicket.description && (
                          <div className="ticket-view-description">{activeTicket.description}</div>
                        )}
                      </div>

                      <div className="ticket-section-label">
                        Follow-up Notes ({activeTicket.noteCount ?? ticketNotes.length})
                      </div>
                      <div className="ticket-notes-list">
                        {notesLoading ? (
                          <div className="ticket-notes-empty">Loading…</div>
                        ) : ticketNotes.length === 0 ? (
                          <div className="ticket-notes-empty">No follow-up notes yet.</div>
                        ) : (
                          [...ticketNotes]
                            .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
                            .map(n => (
                              <div key={n.id} className="ticket-note-item">
                                <div className="ticket-note-meta">
                                  <strong>{n.author?.name || n.author || 'You'}</strong>
                                  <span>{toDate(n.createdAt)?.toLocaleString() || ''}</span>
                                </div>
                                <div className="ticket-note-text">{n.text}</div>
                              </div>
                            ))
                        )}
                      </div>

                      {noteError && (
                        <div className="ticket-form-error" style={{ marginBottom: 0 }}>
                          <Icon className="ti ti-alert" /> {noteError}
                        </div>
                      )}

                      <div className="ticket-note-input-row">
                        <textarea
                          className="legacy-input ticket-note-input"
                          rows={2}
                          placeholder="Enter Follow Up Comments..."
                          value={noteDraft}
                          onChange={e => { setNoteDraft(e.target.value); setNoteError(''); }}
                          disabled={activeTicket.status === 'RESOLVED'}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                              handleAddNote();
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="btn-send ticket-add-note-btn"
                          onClick={handleAddNote}
                          disabled={!noteDraft.trim() || activeTicket.status === 'RESOLVED' || addingNote}
                          title={activeTicket.status === 'RESOLVED' ? 'Reopen the ticket to add notes' : ''}
                        >
                          {addingNote ? 'Adding…' : 'Add Internal Note'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="support-fab-group">
                  {hasOpenTicket ? (
                    <button
                      type="button"
                      className="support-view-ticket-fab"
                      onClick={handleOpenViewTicket}
                      title={`View active ticket ${activeTicket.ticketCode}`}
                    >
                      <Icon className="ti ti-ticket" />
                      <span>View Active Ticket</span>
                    </button>
                  ) : !isThreadBlocked ? (
                    <button
                      type="button"
                      className="support-create-ticket-fab"
                      onClick={openCreateTicketModal}
                      title="Create a support ticket for this conversation"
                    >
                      <Icon className="ti ti-ticket" />
                      <span>Create Ticket</span>
                    </button>
                  ) : null}
                  {!isThreadBlocked && (
                    <button
                      type="button"
                      className="support-reply-fab"
                      onClick={handleOpenReplyBox}
                      title={`Reply to ${sourceOf(selectedThread) === 'APP' ? 'Student' : 'Lead'}`}
                    >
                      <Icon className="ti ti-comment-alt" />
                      <span>Reply</span>
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Block / Unblock confirmation Modal */}
      {confirmBlockAction && (
        <div className="legacy-modal-backdrop active" onClick={() => !blocking && setConfirmBlockAction(null)}>
          <div className="legacy-modal-dialog legacy-confirm" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <div className="legacy-modal-header">
              <h3>
                <Icon className={`ti ${confirmBlockAction === 'block' ? 'ti-na' : 'ti-check'}`} />
                {confirmBlockAction === 'block' ? ' Block WhatsApp Number' : ' Unblock WhatsApp Number'}
              </h3>
              <button type="button" className="legacy-modal-close" onClick={() => setConfirmBlockAction(null)} disabled={blocking}>
                <Icon className="ti ti-close" />
              </button>
            </div>
            <div className="legacy-modal-body">
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: '#16353c' }}>
                {confirmBlockAction === 'block'
                  ? 'Block this WhatsApp number? They will no longer be able to message Support.'
                  : 'Unblock this WhatsApp number? They will be able to message Support again.'}
              </p>
            </div>
            <div className="legacy-modal-footer">
              <button
                type="button"
                className="legacy-btn legacy-btn-default"
                onClick={() => setConfirmBlockAction(null)}
                disabled={blocking}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`legacy-btn ${confirmBlockAction === 'block' ? 'legacy-btn-danger' : 'legacy-btn-success'}`}
                onClick={confirmBlockAction === 'block' ? handleBlockThread : handleUnblockThread}
                disabled={blocking}
              >
                <Icon className={`ti ${confirmBlockAction === 'block' ? 'ti-na' : 'ti-check'}`} />
                {blocking
                  ? (confirmBlockAction === 'block' ? ' Blocking…' : ' Unblocking…')
                  : (confirmBlockAction === 'block' ? ' Block' : ' Unblock')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Profile Modal */}
      {showProfileModal && (
        <div className="legacy-modal-backdrop active" onClick={() => setShowProfileModal(null)}>
          <div className="legacy-modal-dialog" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <div className="legacy-modal-header">
              <h3><Icon className="ti ti-user" /> Student Profile</h3>
              <button type="button" className="legacy-modal-close" onClick={() => setShowProfileModal(null)}>
                <Icon className="ti ti-close" />
              </button>
            </div>
            <div className="legacy-modal-body">
              <div className="profile-summary-card">
                <div className="profile-avatar-circle">
                  {showProfileModal.studentName.charAt(0).toUpperCase()}
                </div>
                <div className="profile-details-col">
                  <h4>{showProfileModal.studentName}</h4>
                  <div className="profile-subtle-text">
                    <Icon className="ti ti-email" /> {showProfileModal.studentName.toLowerCase().replace(/\s+/g, '.')}@example.com
                  </div>
                  <div className="profile-subtle-text">
                    <Icon className="ti ti-mobile" /> +91 9999999999
                  </div>
                </div>
              </div>

              <div className="profile-enrolled-section">
                <div className="enrolled-sect-title">Currently Enrolled</div>
                <div className="enrolled-badge">
                  <Icon className="ti ti-crown" /> Crash Course + 2 others
                </div>
                <div className="profile-subtle-text" style={{ marginTop: '10px' }}>
                  Member since: January 14, 2026
                </div>
              </div>
            </div>
            <div className="legacy-modal-footer">
              <button
                type="button"
                className="legacy-btn legacy-btn-default"
                onClick={() => setShowProfileModal(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="legacy-btn legacy-btn-success"
                onClick={() => {
                  window.open('/candidate-detail', '_blank');
                  setShowProfileModal(null);
                }}
              >
                Open Full Profile <Icon className="ti ti-arrow-right" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Ticket Modal */}
      {showCreateTicket && selectedThread && (
        <div className="legacy-modal-backdrop active" onClick={() => !creatingTicket && setShowCreateTicket(false)}>
          <div className="legacy-modal-dialog" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <div className="legacy-modal-header">
              <h3><Icon className="ti ti-ticket" /> Create Support Ticket</h3>
              <button type="button" className="legacy-modal-close" onClick={() => setShowCreateTicket(false)} disabled={creatingTicket}>
                <Icon className="ti ti-close" />
              </button>
            </div>
            <div className="legacy-modal-body form-modal">
              <div className="ticket-form-meta">
                Raising a ticket for <strong>{selectedThread.studentName}</strong> on thread <strong>#{selectedThread.id}</strong>.
              </div>

              <div className="asset-form-grid">
                <label className="field-cell full-span">
                  <div className={`float-field ${ticketFormError ? 'has-error' : ''}`}>
                    <input
                      type="text"
                      className="float-control"
                      placeholder=" "
                      value={ticketForm.title}
                      maxLength={120}
                      onChange={e => { setTicketForm(f => ({ ...f, title: e.target.value })); setTicketFormError(''); }}
                    />
                    <span className="float-label">Title <span className="req">*</span></span>
                  </div>
                </label>

                <label className="field-cell full-span">
                  <div className="float-field float-textarea">
                    <textarea
                      className="float-control"
                      rows={4}
                      placeholder=" "
                      value={ticketForm.description}
                      onChange={e => setTicketForm(f => ({ ...f, description: e.target.value }))}
                    />
                    <span className="float-label">Description</span>
                  </div>
                </label>

                <label className="field-cell">
                  <div className="float-field float-always">
                    <select
                      className="float-control"
                      value={ticketForm.assigneeId}
                      onChange={e => setTicketForm(f => ({ ...f, assigneeId: e.target.value }))}
                    >
                      <option value="">Unassigned</option>
                      {activeAssociates.map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                    <span className="float-label">Assignee</span>
                  </div>
                </label>

                <label className="field-cell">
                  <div className="float-field float-always">
                    <select
                      className="float-control"
                      value={ticketForm.tag}
                      onChange={e => setTicketForm(f => ({ ...f, tag: e.target.value }))}
                    >
                      {TAGS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <span className="float-label">Tag</span>
                  </div>
                </label>

                <label className="field-cell full-span">
                  <div className="float-field float-always">
                    <select
                      className="float-control"
                      value={ticketForm.status}
                      onChange={e => setTicketForm(f => ({ ...f, status: e.target.value }))}
                    >
                      <option value="DRAFT">Draft</option>
                      <option value="IN_PROGRESS">In Progress</option>
                    </select>
                    <span className="float-label">Initial Status</span>
                  </div>
                </label>
              </div>

              {ticketFormError && (
                <div className="ticket-form-error">
                  <Icon className="ti ti-alert" /> {ticketFormError}
                </div>
              )}
            </div>
            <div className="legacy-modal-footer">
              <button
                type="button"
                className="legacy-btn legacy-btn-default"
                onClick={() => setShowCreateTicket(false)}
                disabled={creatingTicket}
              >
                Cancel
              </button>
              <button
                type="button"
                className="legacy-btn legacy-btn-success"
                onClick={handleCreateTicket}
                disabled={creatingTicket}
              >
                <Icon className="ti ti-plus" style={{ marginRight: '5px' }} />
                {creatingTicket ? 'Creating…' : 'Create Ticket'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Previous Tickets Modal */}
      {showPreviousTickets && (
        <div className="legacy-modal-backdrop active" onClick={() => { setShowPreviousTickets(false); setDrillTicket(null); setDrillNotesVisible(false); setDrillNotes([]); }}>
          <div className="legacy-modal-dialog" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div className="legacy-modal-header">
              <h3><Icon className="ti ti-list" /> {drillTicket ? `Ticket ${drillTicket.ticketCode}` : 'Support Tickets'}</h3>
              <button type="button" className="legacy-modal-close" onClick={() => { setShowPreviousTickets(false); setDrillTicket(null); setDrillNotesVisible(false); setDrillNotes([]); }}>
                <Icon className="ti ti-close" />
              </button>
            </div>
            <div className="legacy-modal-body">
              {drillTicket ? (
                <div>
                  <div className="ticket-view-title">{drillTicket.title}</div>
                  {drillTicket.description && (
                    <div className="ticket-view-description">{drillTicket.description}</div>
                  )}
                  <div className="ticket-view-meta-grid">
                    <div className="ticket-form-row">
                      <label className="ticket-form-label">Assignee</label>
                      <div className="ticket-age-value">{drillTicket.assigneeName || 'Unassigned'}</div>
                    </div>
                    <div className="ticket-form-row">
                      <label className="ticket-form-label">Tag</label>
                      <div className="ticket-age-value">{drillTicket.tag}</div>
                    </div>
                    <div className="ticket-form-row">
                      <label className="ticket-form-label">Status</label>
                      <div>{renderStatusChip(drillTicket.status)}</div>
                    </div>
                    <div className="ticket-form-row">
                      <label className="ticket-form-label">Created</label>
                      <div className="ticket-age-value">{toDate(drillTicket.createdAt)?.toLocaleString() || '—'}</div>
                    </div>
                  </div>

                  <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
                    <button
                      type="button"
                      className="btn-send"
                      style={{ background: '#fff4e0', color: '#b07a1f', boxShadow: 'none', border: '1px solid rgba(176,122,31,0.3)' }}
                      onClick={toggleDrillNotes}
                    >
                      <Icon className={`ti ${drillNotesVisible ? 'ti-angle-up' : 'ti-angle-down'}`} style={{ marginRight: 4 }} />
                      {drillNotesVisible ? 'Hide Notes' : `See Notes (${drillTicket.noteCount ?? drillNotes.length})`}
                    </button>
                  </div>

                  {drillNotesVisible && (
                    <div className="drill-notes-section">
                      <div className="ticket-section-label" style={{ marginTop: 12 }}>Follow-up Notes</div>
                      <div className="ticket-notes-list" style={{ maxHeight: 280 }}>
                        {drillNotesLoading ? (
                          <div className="ticket-notes-empty">Loading…</div>
                        ) : drillNotes.length === 0 ? (
                          <div className="ticket-notes-empty">No follow-up notes on this ticket.</div>
                        ) : (
                          [...drillNotes]
                            .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
                            .map(n => (
                              <div key={n.id} className="ticket-note-item">
                                <div className="ticket-note-meta">
                                  <strong>{n.author?.name || n.author || 'You'}</strong>
                                  <span>{toDate(n.createdAt)?.toLocaleString() || ''}</span>
                                </div>
                                <div className="ticket-note-text">{n.text}</div>
                              </div>
                            ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : previousTicketsLoading ? (
                <div style={{ color: '#999', fontSize: 13 }}>Loading…</div>
              ) : previousTickets.length === 0 ? (
                <div style={{ color: '#999', fontSize: 13 }}>No tickets yet.</div>
              ) : (
                <div className="previous-tickets-list">
                  {previousTickets.map(t => (
                    <div
                      key={t.id}
                      className="previous-ticket-row"
                      onClick={() => openDrillTicket(t.id)}
                    >
                      <div className="previous-ticket-row-main">
                        <strong>{t.ticketCode}</strong>
                        <span className="previous-ticket-row-title">{t.title}</span>
                      </div>
                      <div className="previous-ticket-row-meta">
                        {renderStatusChip(t.status)}
                        <span>{t.assigneeName || 'Unassigned'}</span>
                        <span>{toDate(t.createdAt)?.toLocaleDateString() || ''}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="legacy-modal-footer">
              {drillTicket && (
                <button
                  type="button"
                  className="legacy-btn legacy-btn-default"
                  onClick={() => { setDrillTicket(null); setDrillNotesVisible(false); setDrillNotes([]); }}
                >
                  <Icon className="ti ti-angle-left" /> Back to list
                </button>
              )}
              <button
                type="button"
                className="legacy-btn legacy-btn-default"
                onClick={() => { setShowPreviousTickets(false); setDrillTicket(null); setDrillNotesVisible(false); setDrillNotes([]); }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
