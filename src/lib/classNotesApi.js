// Class Notes API client.
//
// Chapter-wise PDF class notes for the student mobile app: an admin uploads a
// PDF (stored in Bunny Edge Storage via the backend, which holds the storage
// key server-side), and its metadata — chapter, visible batches, CDN URL,
// SHA-256 checksum — is persisted in the DB. Students see the file in the
// "Resources" section of the chapter they're watching, if they belong to one
// of the linked batches.
//
// Backend contract: CLASS_NOTES_API_CONTRACT.md. Endpoints live under
// /admin/classnotes behind the standard X-Access-Token middleware.

import { api } from './api';
import { displayNameFromStored } from './bunnyStorageApi';
import syllabusFixed from '../../SYLLABUS_FIXED.json';

const BASE = '/admin/classnotes';

// Top-level storage-zone folder that owns class notes (sent as `path`).
export const STORAGE_FOLDER = 'class-notes';

// ── Size rules ───────────────────────────────────────────────────────
// Hard ceiling for a class-note PDF. The backend re-validates.
export const MAX_PDF_BYTES = 15 * 1024 * 1024; // 15 MB

// Guidance shown next to the picker — what a well-compressed PDF weighs.
export const IDEAL_SIZE_TIERS = [
  { pages: '3–4 pages', size: '~500 KB', bytes: 500 * 1024 },
  { pages: '10–12 pages', size: '~2 MB', bytes: 2 * 1024 * 1024 },
  { pages: '20–25 pages', size: '~5 MB', bytes: 5 * 1024 * 1024 },
];

export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(n >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

// PDF-only + ≤15 MB. Returns an error string, or null when valid.
export function validateClassNotePdf(file) {
  if (!file) return 'Pick a PDF to upload.';
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
  if (!isPdf) return 'Only PDF files are allowed for class notes.';
  if (file.size > MAX_PDF_BYTES) {
    return `File is ${formatBytes(file.size)} — the maximum allowed is 15 MB. Compress the PDF and try again.`;
  }
  return null;
}

// ── Title ────────────────────────────────────────────────────────────
// The admin-facing title shown to students in the app. Restricted to
// letters, digits, "-" and "_" (the Bunny object itself is named by
// checksum, so the title is the only human-readable handle).
export function sanitizeTitle(input) {
  return String(input || '').replace(/[^A-Za-z0-9_-]/g, '');
}

// Default title from the picked file's name: strip the extension, split on
// anything outside the allowed charset, Proper-Case each word, join with "_".
// e.g. "structure of atom — revision notes.pdf" → "Structure_Of_Atom_Revision_Notes"
export function defaultTitleFromFileName(name) {
  const dot = String(name || '').lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : (name || '');
  const words = base.split(/[^A-Za-z0-9]+/).filter(Boolean);
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('_');
}

// ── SHA-256 checksum ─────────────────────────────────────────────────
// Computed client-side over the raw bytes; sent with the upload AND the
// metadata row so the backend can reject a re-upload of the same document.
export async function sha256Hex(file) {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ── Chapters (from the fixed syllabus) ───────────────────────────────
// The chapter dropdown is populated from SYLLABUS_FIXED.json — same ids the
// backend's syllabus chapters use (see contract §4).
export function flattenSyllabusChapters(data = syllabusFixed) {
  const out = [];
  const segments = data?.syllabus || data?.segments || [];
  segments.forEach((seg) => {
    (seg.modules || []).forEach((mod) => {
      (mod.chapters || []).forEach((ch) => {
        out.push({
          id: ch.id,
          chapterNumber: ch.chapterNumber,
          title: ch.title,
          subject: mod.moduleName,
          segment: seg.name,
          group: `${mod.moduleName} · ${seg.name}`,
          label: `Ch ${ch.chapterNumber} — ${ch.title}`,
        });
      });
    });
  });
  return out;
}

// ── Batches ──────────────────────────────────────────────────────────
// Same enrollment endpoint the I-Card generator uses; rows are { id, name }.
export async function listClassNoteBatches() {
  const { data } = await api.get('/admin/enrollment/list-batches', {
    params: { page: 1, size: 200, sortBy: 'name', sortOrder: 'ASC' },
  });
  return (data?.data || []).map((b) => ({ id: String(b.id), name: b.name || `Batch ${b.id}` }));
}

// ── Courses ──────────────────────────────────────────────────────────
// Same bundle endpoint the Courses page uses; a note is attached to one
// chapter but published under one or more course bundles.
export async function listClassNoteCourses() {
  const { data } = await api.get('/admin/course/list-bundles', {
    params: { page: 1, size: 200, sortBy: 'name', sortOrder: 'ASC' },
  });
  return (data?.data || []).map((c) => ({
    id: String(c.id),
    code: c.code || '',
    title: c.title || `Course ${c.id}`,
  }));
}

// ── Row normalisation ────────────────────────────────────────────────
// Tolerates the alias table from the contract (§3) plus batch shapes:
// `batches: [{id,name}]`, or `batchIds` + `batchNames` in parallel.
function toEpochSeconds(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v > 1e12 ? Math.round(v / 1000) : v;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : Math.round(t / 1000);
}

export function normalizeClassNote(row) {
  if (!row) return null;
  const fileUrl = row.fileUrl ?? row.url ?? row.cdnUrl ?? '';
  const fileName = row.fileName ?? row.objectName ?? (fileUrl ? decodeURIComponent(fileUrl.split('/').pop() || '') : '');
  let batches = [];
  if (Array.isArray(row.batches)) {
    batches = row.batches.map((b) => ({ id: String(b.id ?? b.batchId ?? ''), name: b.name ?? b.batchName ?? '' }));
  } else if (Array.isArray(row.batchIds)) {
    batches = row.batchIds.map((id, i) => ({ id: String(id), name: row.batchNames?.[i] ?? '' }));
  }
  let courses = [];
  if (Array.isArray(row.courses)) {
    courses = row.courses.map((c) => ({ id: String(c.id ?? c.courseId ?? ''), title: c.title ?? c.name ?? '' }));
  } else if (Array.isArray(row.courseIds)) {
    courses = row.courseIds.map((id, i) => ({ id: String(id), title: row.courseNames?.[i] ?? '' }));
  }
  return {
    id: row.id,
    chapterId: row.chapterId ?? row.fk_id_chapter ?? null,
    chapterTitle: row.chapterTitle ?? row.title ?? '',
    subject: row.subject ?? '',
    fileName,
    displayName: row.displayName ?? row.originalName ?? displayNameFromStored(fileName),
    fileUrl,
    fileSize: Number(row.fileSize ?? row.size ?? 0) || 0,
    checksumSha256: (row.checksumSha256 ?? row.checksum ?? row.sha256 ?? '').toLowerCase(),
    batches,
    courses,
    hidden: !!(row.hidden ?? row.isHidden),
    uploadedOn: toEpochSeconds(row.uploadedOn ?? row.createdOn),
  };
}

// ── API calls ────────────────────────────────────────────────────────

// Step 1 of 2 — push the PDF to Bunny Storage through the backend proxy.
// The stored object is named by its checksum (`<sha256>.pdf`), so identical
// content can never exist twice in the zone. Returns the CDN URL + name.
export async function uploadClassNotePdf(file, { checksumSha256, onProgress } = {}) {
  const fileName = `${checksumSha256}.pdf`;
  const fd = new FormData();
  fd.append('file', file);
  fd.append('path', STORAGE_FOLDER);
  fd.append('fileName', fileName);
  fd.append('checksumSha256', checksumSha256);
  const res = await api.post(`${BASE}/upload-classnote.php`, fd, {
    onUploadProgress: (e) => {
      if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
    },
  });
  const data = res?.data?.data ?? res?.data ?? {};
  return {
    fileUrl: data.fileUrl ?? data.url ?? '',
    fileName: data.fileName ?? data.ObjectName ?? fileName,
    fileSize: Number(data.fileSize ?? file.size) || file.size,
  };
}

// Step 2 of 2 — persist the metadata row linking file → chapter → courses → batches.
export async function saveClassNoteMetadata({ chapterId, courseIds, fileUrl, fileName, displayName, fileSize, checksumSha256, batchIds }) {
  const { data } = await api.post(`${BASE}/update-classnotes-metadata.php`, {
    chapterId,
    courseIds,
    fileUrl,
    fileName,
    displayName,
    fileSize,
    checksumSha256,
    batchIds,
  });
  return data;
}

// Update an existing note's visibility links — chapter, courses, batches.
// Same endpoint as the create call; the presence of `id` makes it an update
// (file fields are immutable — re-upload to change the PDF itself).
export async function updateClassNoteVisibility({ id, chapterId, courseIds, batchIds }) {
  const { data } = await api.post(`${BASE}/update-classnotes-metadata.php`, {
    id,
    chapterId,
    courseIds,
    batchIds,
  });
  return data;
}

// Server-side duplicate probe by checksum. Returns the normalized existing
// row, or null when no duplicate. Throws only on unexpected errors — callers
// treat a failed probe as "unknown" and rely on the 409 at save time.
export async function findClassNoteByChecksum(checksumSha256) {
  try {
    const { data } = await api.get(`${BASE}/check-classnote-checksum.php`, {
      params: { checksum: checksumSha256 },
    });
    const row = data?.data;
    return row ? normalizeClassNote(row) : null;
  } catch (err) {
    if (err?.response?.status === 404) return null; // endpoint says "no such row"
    return undefined; // probe unavailable — dedupe enforced at save time instead
  }
}

// Server-side list with paging + filters. Returns { rows, total, totalPages }.
export async function listClassNotes({ page = 1, size = 20, chapterId, courseId, batchId, searchKey } = {}) {
  const params = { page, size };
  if (chapterId) params.chapterId = chapterId;
  if (courseId) params.courseId = courseId;
  if (batchId) params.batchId = batchId;
  if (searchKey) params.searchKey = searchKey;
  const { data } = await api.get(`${BASE}/list-classnotes-metadata.php`, { params });
  const rows = (data?.data ?? data?.notes ?? []).map(normalizeClassNote).filter(Boolean);
  const total = Number(data?.total ?? rows.length) || rows.length;
  return {
    rows,
    total,
    totalPages: Number(data?.totalPages) || Math.max(1, Math.ceil(total / size)),
  };
}
