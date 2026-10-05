// Spotlight search data layer.
//
// Two sources:
//   1. Pages — every protected screen the current user may open (filtered by
//      the same role / permission rules the sidebar uses).
//   2. People — students, staff (admin accounts), mentors and teachers
//      (instructors), searched by name / mobile against the existing list
//      endpoints. Each hit links to the matching profile page via `?id=`.
//
// Each people source is fetched independently; a failing source (e.g. 403 for
// non-super-admins on /user-account/list) is simply dropped rather than
// failing the whole search.

import { api } from './api';
import { listUsers } from './userAccountsApi';
import { protectedScreens } from './legacyScreens';
import { canAccess, isSuperAdmin } from './roles';
import { has as permHas } from './permissions';

export const SPOTLIGHT_PAGE_SIZE = 5;
export const SPOTLIGHT_MAX_PAGES = 8;

// Mirrors SuperAdminRoute: super admins (or identity not yet loaded) may open
// /user-accounts, so staff search is offered to them only.
export function canSearchStaff(user) {
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  const perms = Array.isArray(user?.permissions) ? user.permissions : [];
  if (roles.length === 0 && perms.length === 0) return true;
  return isSuperAdmin(user) || perms.includes('*');
}

// ── Pages ──────────────────────────────────────────────────────────────────
export function getSearchablePages(user) {
  const role = user?.role || 'super_admin';
  const permissions = user?.permissions;
  return protectedScreens.filter((s) => {
    if (!canAccess(role, s.path)) return false;
    if (s.viewPermission && Array.isArray(permissions) && permissions.length > 0) {
      return permHas(permissions, s.viewPermission);
    }
    return true;
  });
}

function scorePage(page, q) {
  const title = (page.title || '').toLowerCase();
  const summary = (page.summary || '').toLowerCase();
  const path = (page.path || '').toLowerCase();
  const code = (page.shortCode || '').toLowerCase();
  if (title === q || code === q) return 100;
  if (title.startsWith(q)) return 80;
  if (title.split(/\s+/).some((w) => w.startsWith(q))) return 60;
  if (path.includes(q)) return 40;
  if (title.includes(q)) return 30;
  if (q.length >= 3 && summary.includes(q)) return 10;
  return 0;
}

export function searchPages(pages, query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return pages
    .map((p) => ({ p, score: scorePage(p, q) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.p.title.length - b.p.title.length || a.p.title.localeCompare(b.p.title))
    .slice(0, SPOTLIGHT_MAX_PAGES)
    .map(({ p }) => ({
      kind: 'page',
      id: `page:${p.path}`,
      title: p.title,
      subtitle: p.summary || p.path,
      icon: p.icon || 'fa-file-o',
      shortCode: p.shortCode,
      to: p.path,
    }));
}

// ── People ─────────────────────────────────────────────────────────────────
function pickMobile(u) {
  return u.mobile || u.phone || u.registeredMobile || u.communicationMobile || '';
}

const PEOPLE_SOURCES = [
  {
    kind: 'student',
    label: 'Student',
    icon: 'fa-graduation-cap',
    fetch: (q, signal) =>
      api
        .get('/admin/people/candidate/list', {
          params: { page: 1, size: SPOTLIGHT_PAGE_SIZE, sortBy: 'name', searchKey: q },
          signal,
        })
        .then((r) => (r.data?.status === 'success' ? r.data.data : [])),
    toResult: (c) => ({
      id: c.candidateKey || c.id,
      name: c.name || 'Unknown',
      mobile: pickMobile(c),
      email: c.email || '',
      avatar: c.photo || c.avatar || null,
      to: `/student-360?id=${encodeURIComponent(c.candidateKey || c.id)}`,
    }),
  },
  {
    kind: 'staff',
    label: 'Staff',
    icon: 'fa-id-badge',
    fetch: (q, signal) =>
      listUsers({ page: 1, size: SPOTLIGHT_PAGE_SIZE, sortBy: 'name', sortOrder: 'ASC', searchKey: q, signal })
        .then((r) => r?.data || []),
    toResult: (u) => ({
      id: u.id,
      name: u.name || 'Unknown',
      mobile: pickMobile(u),
      email: u.email || '',
      avatar: null,
      to: `/user-accounts?id=${encodeURIComponent(u.id)}&q=${encodeURIComponent(u.name || '')}`,
    }),
  },
  {
    kind: 'mentor',
    label: 'Mentor',
    icon: 'fa-user-circle-o',
    fetch: (q, signal) =>
      api
        .get('/admin/people/mentor/list', {
          params: { page: 1, size: SPOTLIGHT_PAGE_SIZE, sortBy: 'name', sortOrder: 'ASC', searchKey: q },
          signal,
        })
        .then((r) => (r.data?.status === 'success' ? r.data.data : [])),
    toResult: (m) => ({
      id: m.id,
      name: m.name || 'Unknown',
      mobile: pickMobile(m),
      email: m.email || '',
      avatar: m.photo || null,
      to: `/mentor-profiles?id=${encodeURIComponent(m.id)}`,
    }),
  },
  {
    kind: 'teacher',
    label: 'Teacher',
    icon: 'fa-black-tie',
    fetch: (q, signal) =>
      api
        .get('/admin/people/instructor/list', {
          params: { page: 1, size: SPOTLIGHT_PAGE_SIZE, sortBy: 'name', sortOrder: 'ASC', searchKey: q },
          signal,
        })
        .then((r) => (r.data?.status === 'success' ? r.data.data : [])),
    toResult: (t) => ({
      id: t.id,
      name: t.name || 'Unknown',
      mobile: pickMobile(t),
      email: t.email || '',
      avatar: t.photo || null,
      to: `/instructor-portfolio?id=${encodeURIComponent(t.id)}`,
    }),
  },
];

/**
 * Search every people source in parallel. Resolves with a flat list of
 * results; sources that error (network, 403, abort) contribute nothing.
 * Only sources whose target page the user can open are queried.
 */
export async function searchPeople(query, { signal, allowedPaths, includeStaff = true } = {}) {
  const q = query.trim();
  if (!q) return [];
  const sources = PEOPLE_SOURCES.filter((s) => {
    if (s.kind === 'staff') return includeStaff;
    if (!allowedPaths) return true;
    return allowedPaths.has(new URL(s.toResult({ id: 'x' }).to, 'http://x').pathname);
  });
  const settled = await Promise.allSettled(
    sources.map((s) =>
      s.fetch(q, signal).then((rows) =>
        (Array.isArray(rows) ? rows : []).map((row) => {
          const r = s.toResult(row);
          return {
            kind: s.kind,
            kindLabel: s.label,
            icon: s.icon,
            id: `${s.kind}:${r.id}`,
            title: r.name,
            subtitle: [r.mobile, r.email].filter(Boolean).join(' · '),
            avatar: r.avatar,
            to: r.to,
          };
        })
      )
    )
  );
  return settled.flatMap((res) => (res.status === 'fulfilled' ? res.value : []));
}
