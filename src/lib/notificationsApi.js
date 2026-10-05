import { api, apiErrorMessage, apiFieldErrors } from './api';

const ADMIN_BASE = '/admin/messenger/campaigns';
const USER_BASE = '/messenger/in-app';

// ── Enums (per spec) ─────────────────────────────────────────────────────────
export const CAMPAIGN_TYPE = {
  TRANSACTIONAL: 'transactional',
  BROADCAST: 'broadcast',
  TRIGGERED: 'triggered',
  SYSTEM: 'system',
};

export const CHANNEL = {
  EMAIL: 'email',
  SMS: 'sms',
  WHATSAPP: 'whatsapp',
  IN_APP: 'in_app',
};

export const RECIPIENT_STATUS = {
  PENDING: 'pending',
  QUEUED: 'queued',
  PROCESSING: 'processing',
  SENT: 'sent',
  DELIVERED: 'delivered',
  READ: 'read',
  FAILED: 'failed',
  RETRYING: 'retrying',
  CANCELLED: 'cancelled',
};

function clean(params) {
  const out = {};
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    out[k] = v;
  });
  return out;
}

// ── Admin — Campaigns ────────────────────────────────────────────────────────
export async function listCampaigns({ page = 1, perPage = 25, type } = {}) {
  const { data } = await api.get(ADMIN_BASE, {
    params: clean({ page, per_page: perPage, type }),
  });
  return data;
}

export async function createCampaign(payload) {
  const { data } = await api.post(ADMIN_BASE, payload);
  return data;
}

export async function getCampaign(uuid) {
  const { data } = await api.get(`${ADMIN_BASE}/${uuid}`);
  return data;
}

export async function getCampaignAnalytics(uuid) {
  const { data } = await api.get(`${ADMIN_BASE}/${uuid}/analytics`);
  return data;
}

export async function listCampaignRecipients(uuid, { status, channel, page = 1, perPage = 50 } = {}) {
  const { data } = await api.get(`${ADMIN_BASE}/${uuid}/recipients`, {
    params: clean({ status, channel, page, per_page: perPage }),
  });
  return data;
}

export async function cancelCampaign(uuid) {
  const { data } = await api.post(`${ADMIN_BASE}/${uuid}/cancel`);
  return data;
}

export async function retryFailedRecipients(uuid) {
  const { data } = await api.post(`${ADMIN_BASE}/${uuid}/retry-failed`);
  return data;
}

// ── User — In-App Inbox ──────────────────────────────────────────────────────
export async function listUserInApp({ page = 1, perPage = 25 } = {}) {
  const { data } = await api.get(USER_BASE, {
    params: clean({ page, per_page: perPage }),
  });
  return data;
}

export async function getUnreadCount() {
  const { data } = await api.get(`${USER_BASE}/unread-count`);
  return data;
}

export async function markInAppRead(id) {
  const { data } = await api.post(`${USER_BASE}/${id}/read`);
  return data;
}

export async function markAllInAppRead() {
  const { data } = await api.post(`${USER_BASE}/read-all`);
  return data;
}

// ── UI ⇄ API channel mapping ─────────────────────────────────────────────────
export const UI_CHANNEL_TO_API = {
  Email: CHANNEL.EMAIL,
  SMS: CHANNEL.SMS,
  WhatsApp: CHANNEL.WHATSAPP,
  'App Push': CHANNEL.IN_APP,
};

export const API_CHANNEL_TO_UI = {
  [CHANNEL.EMAIL]: 'Email',
  [CHANNEL.SMS]: 'SMS',
  [CHANNEL.WHATSAPP]: 'WhatsApp',
  [CHANNEL.IN_APP]: 'App Push',
};

// Build the audience_filter payload from the messenger UI audience selection.
// `selectedCourses` / `selectedBatches` are arrays of ids.
export function buildAudienceFilter(audience, { selectedCourses = [], selectedBatches = [] } = {}) {
  switch (audience) {
    case 'All Registered Students':
      return { role: 'student' };
    case 'All Enrolled Students':
      return { role: 'student', status: 1 };
    case 'Multi Selected Courses':
      return selectedCourses.length === 1
        ? { role: 'student', course_id: selectedCourses[0] }
        : { role: 'student', course_ids: selectedCourses };
    case 'Multi Selected Batches':
      return { role: 'student', batch_ids: selectedBatches };
    default:
      return { role: 'student' };
  }
}

// Map an API error to a flat message string: the first field message of a
// validation_error, otherwise the error message.
export function extractApiError(err, fallback = 'Request failed') {
  const first = Object.values(apiFieldErrors(err))[0];
  return first || apiErrorMessage(err, fallback);
}

// Normalize an API campaign resource into the message-list shape MessengerPage uses.
export function campaignToMessage(c) {
  if (!c) return null;
  const channels = Array.isArray(c.channels)
    ? c.channels.map((ch) => API_CHANNEL_TO_UI[ch] || ch)
    : [];
  const audience = c.audience_filter || {};
  let targetType = 'All Registered Students';
  let targets = [];
  if (audience.batch_ids?.length) {
    targetType = 'Multi Selected Batches';
    targets = audience.batch_ids;
  } else if (audience.course_ids?.length) {
    targetType = 'Multi Selected Courses';
    targets = audience.course_ids;
  } else if (audience.course_id) {
    targetType = 'Multi Selected Courses';
    targets = [audience.course_id];
  } else if (audience.user_ids?.length) {
    targetType = 'Specific Users';
    targets = audience.user_ids;
  } else if (audience.status === 1) {
    targetType = 'All Enrolled Students';
  }

  return {
    id: c.uuid || c.id,
    uuid: c.uuid,
    subject: c.title || '',
    abstract: (c.message || '').slice(0, 60) + ((c.message || '').length > 60 ? '...' : ''),
    body: c.message || '',
    date: c.scheduled_at || c.created_at || new Date().toISOString(),
    channels,
    notifyParents: Boolean(c.metadata?.notify_parents),
    targetType,
    targets,
    recipientCount: c.recipient_total ?? c.recipients_count ?? 0,
    sender:
      c.created_by_name ||
      c.creator?.name ||
      c.creator?.fullName ||
      c.created_by?.name ||
      c.admin?.name ||
      c.admin_name ||
      c.sender_name ||
      null,
    status: c.status || 'sent',
  };
}
