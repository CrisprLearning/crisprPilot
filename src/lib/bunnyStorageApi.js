// Shared Bunny.net Storage-Zone client.
//
// This is the common layer that any module (Digital Signage, Asset invoices,
// …) uses to talk to Bunny Edge Storage. The Bunny storage access key must
// NEVER reach the browser, so all calls go through the backend proxy
// (Laravel), which holds the key server-side and talks to Bunny on our behalf.
//
// Each use case owns a top-level folder of the storage zone (see
// `BUNNY_FOLDERS`). The proxy enforces a folder allowlist server-side.
//
// Backend proxy contract (under the standard X-Access-Token auth):
//   GET    /admin/signage/bunny/list?path=digital-signage
//            → { data: BunnyObject[] }   (Bunny's native list shape passed through)
//   POST   /admin/signage/bunny/upload   (multipart: file, path, fileName)
//            → { data: BunnyObject }   (201)
//   DELETE /admin/signage/bunny/file?path=digital-signage/<fileName>
//            → { data: { ok: true } }
//
// A BunnyObject is Bunny's storage listing row: { Guid, ObjectName, Length,
// IsDirectory, LastChanged, DateCreated, ContentType, url, ... } — `url` is the
// CDN link the FE renders from. We tolerate both that PascalCase shape and a
// normalised snake_case one from the proxy.
//
// See SIGNAGE_MEDIA_BUNNY_PROXY.md for the full backend specification.

import { api, apiError } from './api';

export const STORAGE_BASE = '/admin/signage/bunny';

// Top-level storage-zone folders, one per use case. Keep this list in sync
// with the backend proxy's allowlist (see the contract doc).
export const BUNNY_FOLDERS = {
  SIGNAGE: 'digital-signage',
  ASSET_INVOICES: 'asset-invoices',
};

// ── Filename convention ──────────────────────────────────────────────
// {randomUUID}_ddmmYYYY_FileName.extension
export function buildBunnyFileName(originalName) {
  const uuid = (globalThis.crypto?.randomUUID?.() || fallbackUuid());
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const datePart = `${dd}${mm}${yyyy}`;

  const dot = originalName.lastIndexOf('.');
  const rawBase = dot > 0 ? originalName.slice(0, dot) : originalName;
  // Keep the original name readable but filesystem/URL-safe. Matches the
  // canonical convention the proxy re-validates against (see contract §2).
  const safeBase = rawBase.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-_.]+|[-_.]+$/g, '') || 'file';
  const ext = (dot > 0 ? originalName.slice(dot + 1) : 'bin').toLowerCase();

  return `${uuid}_${datePart}_${safeBase}.${ext}`;
}

function fallbackUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ── Upload validation (configurable per use case) ────────────────────
// 200 MB ceiling mirrors the backend; callers may pass a smaller `maxBytes`.
export const DEFAULT_MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

// Named accept presets. A preset returns true if the file is allowed.
export const ACCEPT = {
  // Image / video / audio + Lottie JSON — Digital Signage media.
  MEDIA: (file) => {
    const mime = file.type || '';
    if (/^image\//.test(mime) || /^video\//.test(mime) || /^audio\//.test(mime)) return true;
    if (mime === 'application/json' || mime === 'application/lottie+json') return true;
    return ['json', 'lottie'].includes(extOf(file.name));
  },
  // PDF + image — invoices, receipts, scanned documents.
  DOCUMENT: (file) => {
    const mime = file.type || '';
    if (mime === 'application/pdf' || /^image\//.test(mime)) return true;
    return ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif'].includes(extOf(file.name));
  },
};

function extOf(name = '') {
  return (name.split('.').pop() || '').toLowerCase();
}

// Returns an error string if the file is invalid, else null.
//   accept    — a predicate from ACCEPT (default: MEDIA)
//   maxBytes  — size ceiling (default: DEFAULT_MAX_UPLOAD_BYTES)
//   typeError — message shown when the type check fails
export function validateUpload(file, { accept = ACCEPT.MEDIA, maxBytes = DEFAULT_MAX_UPLOAD_BYTES, typeError } = {}) {
  if (!file) return 'Pick a file to upload.';
  if (!accept(file)) return typeError || 'Unsupported file type.';
  if (file.size > maxBytes) return `File is too large. Maximum size is ${Math.round(maxBytes / (1024 * 1024))} MB.`;
  return null;
}

// ── Shape helpers ────────────────────────────────────────────────────
const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp'];
const VIDEO_EXT = ['mp4', 'webm', 'mov', 'm4v', 'mkv'];
const AUDIO_EXT = ['mp3', 'wav', 'ogg', 'aac', 'm4a'];
const LOTTIE_EXT = ['json', 'lottie'];

export function mediaTypeFromName(name = '') {
  const ext = extOf(name);
  if (IMAGE_EXT.includes(ext)) return 'image';
  if (VIDEO_EXT.includes(ext)) return 'video';
  if (AUDIO_EXT.includes(ext)) return 'audio';
  if (LOTTIE_EXT.includes(ext)) return 'lottie';
  if (ext === 'pdf') return 'pdf';
  return 'other';
}

// Recover a human-friendly original name from our stored convention.
export function displayNameFromStored(name = '') {
  // {uuid}_{ddmmYYYY}_{FileName}.ext  →  FileName.ext
  const m = /^[0-9a-fA-F-]{8,}_\d{8}_(.+)$/.exec(name);
  return m ? m[1] : name;
}

export function normalize(o) {
  if (!o) return null;
  const name = o.ObjectName ?? o.object_name ?? o.name ?? o.fileName ?? '';
  const isDir = o.IsDirectory ?? o.is_directory ?? o.isDirectory ?? false;
  const size = o.Length ?? o.length ?? o.size_bytes ?? o.size ?? 0;
  const url = o.url ?? o.cdn_url ?? o.cdnUrl ?? o.Url ?? null;
  const updated = o.LastChanged ?? o.last_changed ?? o.updated_at ?? o.DateCreated ?? o.date_created ?? null;
  return {
    id: o.Guid ?? o.guid ?? o.id ?? name,
    name,
    displayName: displayNameFromStored(name),
    isDirectory: !!isDir,
    size: Number(size) || 0,
    url,
    type: mediaTypeFromName(name),
    updated_at: updated,
    raw: o,
  };
}

function unwrapList(res) {
  const body = res?.data;
  const rows = body?.data ?? body ?? [];
  return (Array.isArray(rows) ? rows : []).map(normalize).filter((x) => x && !x.isDirectory);
}

// ── Error surfacing ──────────────────────────────────────────────────
// The signage Bunny proxy returns the project-standard error body
//   HTTP <status> { success: false, error: { code, message, fields? } }
// (see crispr-api docs/API_ERRORS.md). Map the documented codes to friendly
// copy, falling back to the server message then a generic line.
const STORAGE_ERROR_COPY = {
  validation_error: 'Invalid request. Check the file and try again.',
  unsupported_type: 'Unsupported file type. Use image, video, audio, or Lottie JSON.',
  too_large:        'File is too large. Maximum size is 200 MB.',
  not_found:        'The file was not found.',
  storage_error:    'Storage is unavailable right now. Please try again.',
  forbidden:        'You do not have permission to manage signage media.',
};

export function bunnyErrorMessage(error, fallback = 'Storage request failed.') {
  if (error && !error.isAxiosError && !error.response) return error.message || fallback;
  const { code, message } = apiError(error, fallback);
  return STORAGE_ERROR_COPY[code] || message;
}

// ── API ──────────────────────────────────────────────────────────────
// All three take an explicit `path` (folder) — callers should pass a value
// from BUNNY_FOLDERS. Use-case wrappers may default the folder for ergonomics.
export async function listBunnyStorage(path) {
  const res = await api.get(`${STORAGE_BASE}/list`, { params: { path } });
  return unwrapList(res);
}

export async function uploadBunnyStorage(file, { path, fileName } = {}) {
  const finalName = fileName || buildBunnyFileName(file.name);
  const fd = new FormData();
  fd.append('file', file);
  fd.append('path', path);
  fd.append('fileName', finalName);
  // Browser sets the multipart boundary — do not set Content-Type manually.
  const res = await api.post(`${STORAGE_BASE}/upload`, fd);
  const created = res?.data?.data ?? res?.data ?? { ObjectName: finalName, Length: file.size };
  return normalize(created) || { id: finalName, name: finalName, displayName: displayNameFromStored(finalName), size: file.size, type: mediaTypeFromName(finalName) };
}

export async function deleteBunnyStorage(fileName, path) {
  await api.delete(`${STORAGE_BASE}/file`, { params: { path: `${path}/${fileName}` } });
}
