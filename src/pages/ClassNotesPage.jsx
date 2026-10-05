import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ToastRegion from '../components/ToastRegion';
import FilterDropdown from '../components/FilterDropdown';
import MultiSelectDropdown from '../components/MultiSelectDropdown';
import useDebouncedValue from '../hooks/useDebouncedValue';
import { Can, usePermission } from '../lib/userStore';
import { PERMS } from '../lib/permissions';
import { apiError, apiErrorMessage } from '../lib/api';
import {
  IDEAL_SIZE_TIERS,
  MAX_PDF_BYTES,
  defaultTitleFromFileName,
  findClassNoteByChecksum,
  flattenSyllabusChapters,
  formatBytes,
  listClassNoteBatches,
  listClassNoteCourses,
  listClassNotes,
  sanitizeTitle,
  saveClassNoteMetadata,
  sha256Hex,
  updateClassNoteVisibility,
  uploadClassNotePdf,
  validateClassNotePdf,
} from '../lib/classNotesApi';
import { CLASS_NOTES_DEMO, CLASS_NOTES_DEMO_BATCHES, CLASS_NOTES_DEMO_COURSES } from '../data/classNotesDemo';

// Standard 7-slot pagination window with '…' ellipsis, shared across pages.
function getPageNumbers(currentPage, totalPages) {
  const pages = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i += 1) pages.push(i);
    return pages;
  }
  pages.push(1);
  if (currentPage > 4) pages.push('...');
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);
  for (let i = start; i <= end; i += 1) pages.push(i);
  if (currentPage < totalPages - 3) pages.push('...');
  pages.push(totalPages);
  return pages;
}

function fmtDate(epochSeconds) {
  if (!epochSeconds) return '—';
  return new Date(epochSeconds * 1000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Size tone against the guidance tiers: fine up to the 20–25-page ideal
// (5 MB), "heavy" up to the 15 MB ceiling, blocked above it.
function sizeTone(bytes) {
  if (bytes > MAX_PDF_BYTES) return 'blocked';
  if (bytes > IDEAL_SIZE_TIERS[IDEAL_SIZE_TIERS.length - 1].bytes) return 'heavy';
  return 'ok';
}

// Selected multi-select values rendered as removable chips under the field —
// the trigger alone only says "2 courses", the chips show which ones.
function SelectedChips({ ids, getLabel, onRemove, chipClassName = '', disabled = false }) {
  if (!ids.length) return null;
  return (
    <div className="cn-selected-chips">
      {ids.map((id) => (
        <span key={id} className={`cn-batch-chip ${chipClassName}`} title={getLabel(id)}>
          {getLabel(id)}
          <button type="button" className="cn-chip-remove" onClick={() => onRemove(id)} disabled={disabled} title="Remove">
            <i className="ti ti-close" />
          </button>
        </span>
      ))}
    </div>
  );
}

/**
 * Edit where an already-uploaded note lives: its chapter, the courses it is
 * published under, and the batches it is visible to. The file itself is
 * immutable — re-upload to replace the PDF.
 */
function VisibilityModal({ note, chapterGroups, courses, courseById, batches, batchById, saving, onClose, onSave }) {
  const [chapterId, setChapterId] = useState(String(note.chapterId ?? ''));
  const [courseIds, setCourseIds] = useState(() => (note.courses || []).map((c) => String(c.id)));
  const [batchIds, setBatchIds] = useState(() => (note.batches || []).map((b) => String(b.id)));

  const canSave = !!chapterId && courseIds.length > 0 && !saving;

  return (
    <div className="crispr-modal-backdrop active" role="presentation" onClick={onClose}>
      <div className="crispr-modal-dialog cn-visibility-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="crispr-modal-header">
          <h3><i className="ti ti-eye" /> Visibility — {note.displayName}</h3>
          <button type="button" className="crispr-modal-close" onClick={onClose}><i className="ti ti-close" /></button>
        </div>
        <form
          className="form-modal"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSave) onSave({ chapterId: Number(chapterId), courseIds, batchIds });
          }}
        >
          <div className="crispr-modal-body cn-visibility-body">
            <div className="cn-field">
              <label>Chapter <span className="cn-required">*</span></label>
              <select className="cn-select" value={chapterId} onChange={(e) => setChapterId(e.target.value)} disabled={saving}>
                <option value="">Select the chapter…</option>
                {chapterGroups.map((g) => (
                  <optgroup key={g.group} label={g.group}>
                    {g.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="cn-field">
              <label>Courses <span className="cn-required">*</span></label>
              <MultiSelectDropdown
                value={courseIds}
                onChange={setCourseIds}
                options={courses.map((c) => String(c.id))}
                getLabel={(id) => courseById.get(String(id))?.title || id}
                allLabel="Select courses…"
                plural="courses"
                searchPlaceholder="Search courses…"
                disabled={saving}
                buttonClassName={courseIds.length ? '' : 'is-placeholder'}
              />
              <SelectedChips
                ids={courseIds}
                getLabel={(id) => courseById.get(String(id))?.title || id}
                onRemove={(id) => setCourseIds((cur) => cur.filter((x) => x !== id))}
                chipClassName="cn-course-chip"
                disabled={saving}
              />
              <span className="cn-field-hint">Every course the note is published under — at least one.</span>
            </div>
            <div className="cn-field">
              <label>Visible to batches</label>
              <MultiSelectDropdown
                value={batchIds}
                onChange={setBatchIds}
                options={batches.map((b) => String(b.id))}
                getLabel={(id) => batchById.get(String(id))?.name || id}
                allLabel="All batches"
                plural="batches"
                searchPlaceholder="Search batches…"
                disabled={saving}
                buttonClassName={batchIds.length ? '' : 'is-placeholder'}
              />
              <SelectedChips
                ids={batchIds}
                getLabel={(id) => batchById.get(String(id))?.name || id}
                onRemove={(id) => setBatchIds((cur) => cur.filter((x) => x !== id))}
                disabled={saving}
              />
              <span className="cn-field-hint">Leave empty to make the note visible to every batch.</span>
            </div>
          </div>
          <div className="crispr-modal-footer">
            <button type="button" className="legacy-btn legacy-btn-default" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="legacy-btn legacy-btn-success" disabled={!canSave}>
              <i className="ti ti-check" /> {saving ? 'Saving…' : 'Save Visibility'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ClassNotesPage() {
  const { can } = usePermission();
  const canEdit = can(PERMS.CLASS_NOTES_EDIT);
  const chapters = useMemo(() => flattenSyllabusChapters(), []);
  const chapterById = useMemo(() => {
    const m = new Map();
    chapters.forEach((c) => m.set(String(c.id), c));
    return m;
  }, [chapters]);

  // Toasts
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);
  const showToast = useCallback((type, title, message) => {
    const id = toastIdRef.current + 1;
    toastIdRef.current = id;
    setToasts((cur) => [...cur, { id, type, title, message }]);
    window.setTimeout(() => setToasts((cur) => cur.filter((t) => t.id !== id)), 4500);
  }, []);

  // ── Batches ─────────────────────────────────────────────────────────
  const [batches, setBatches] = useState([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await listClassNoteBatches();
        if (!cancelled) setBatches(rows);
      } catch {
        // Enrollment module unreachable → demo batches so the form stays usable.
        if (!cancelled) setBatches(CLASS_NOTES_DEMO_BATCHES);
      }
    })();
    return () => { cancelled = true; };
  }, []);
  const batchById = useMemo(() => {
    const m = new Map();
    batches.forEach((b) => m.set(String(b.id), b));
    return m;
  }, [batches]);

  // ── Courses ─────────────────────────────────────────────────────────
  const [courses, setCourses] = useState([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await listClassNoteCourses();
        if (!cancelled) setCourses(rows);
      } catch {
        // Course module unreachable → demo courses so the form stays usable.
        if (!cancelled) setCourses(CLASS_NOTES_DEMO_COURSES);
      }
    })();
    return () => { cancelled = true; };
  }, []);
  const courseById = useMemo(() => {
    const m = new Map();
    courses.forEach((c) => m.set(String(c.id), c));
    return m;
  }, [courses]);

  // ── Upload form ─────────────────────────────────────────────────────
  const [formChapterId, setFormChapterId] = useState('');
  const [formCourseIds, setFormCourseIds] = useState([]);
  const [formBatchIds, setFormBatchIds] = useState([]);
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [checksum, setChecksum] = useState('');
  const [checksumBusy, setChecksumBusy] = useState(false);
  const [duplicateOf, setDuplicateOf] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef(null);

  // ── List ────────────────────────────────────────────────────────────
  const [notes, setNotes] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  // Demo-mode uploads are appended here so the page stays explorable offline.
  const demoRowsRef = useRef(CLASS_NOTES_DEMO);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, 400);
  const [filterChapter, setFilterChapter] = useState('');
  const [filterCourse, setFilterCourse] = useState('');
  const [filterBatch, setFilterBatch] = useState('');

  // Row kebab menu + visibility modal
  const [openKebabId, setOpenKebabId] = useState(null);
  const [visibilityNote, setVisibilityNote] = useState(null);
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  useEffect(() => {
    const close = () => setOpenKebabId(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const loadNotes = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await listClassNotes({
        page,
        size: pageSize,
        chapterId: filterChapter || undefined,
        courseId: filterCourse || undefined,
        batchId: filterBatch || undefined,
        searchKey: debouncedSearch.trim() || undefined,
      });
      setNotes(res.rows);
      setTotal(res.total);
      setTotalPages(res.totalPages);
      setIsDemo(false);
    } catch {
      // Backend module unreachable → demo rows, filtered + paged locally.
      const q = debouncedSearch.trim().toLowerCase();
      let rows = demoRowsRef.current;
      if (filterChapter) rows = rows.filter((n) => String(n.chapterId) === String(filterChapter));
      if (filterCourse) rows = rows.filter((n) => (n.courses || []).some((c) => String(c.id) === String(filterCourse)));
      if (filterBatch) rows = rows.filter((n) => n.batches.some((b) => String(b.id) === String(filterBatch)));
      if (q) {
        rows = rows.filter((n) =>
          [n.displayName, n.fileName, n.chapterTitle, n.subject, ...(n.courses || []).map((c) => c.title)]
            .filter(Boolean).some((v) => String(v).toLowerCase().includes(q)));
      }
      const start = (page - 1) * pageSize;
      setNotes(rows.slice(start, start + pageSize));
      setTotal(rows.length);
      setTotalPages(Math.max(1, Math.ceil(rows.length / pageSize)));
      setIsDemo(true);
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, filterChapter, filterCourse, filterBatch, debouncedSearch]);

  useEffect(() => { loadNotes(); }, [loadNotes]);
  useEffect(() => { setPage(1); }, [debouncedSearch, filterChapter, filterCourse, filterBatch]);

  // ── File selection + checksum + duplicate probe ─────────────────────
  const acceptFile = useCallback(async (picked) => {
    if (!picked) return;
    const error = validateClassNotePdf(picked);
    if (error) {
      showToast('error', 'Cannot use this file', error);
      return;
    }
    setFile(picked);
    setTitle(defaultTitleFromFileName(picked.name));
    setChecksum('');
    setDuplicateOf(null);
    setChecksumBusy(true);
    try {
      const hex = await sha256Hex(picked);
      setChecksum(hex);
      // Duplicate probe: ask the backend; if the probe is unavailable, fall
      // back to whatever rows we can see (dedupe is re-enforced at save time).
      let dup;
      if (!isDemo) dup = await findClassNoteByChecksum(hex);
      if (dup === undefined || isDemo) {
        dup = demoRowsRef.current.concat(notes).find((n) => n.checksumSha256 === hex) || null;
      }
      setDuplicateOf(dup || null);
      if (dup) {
        showToast('error', 'Duplicate PDF', `This exact file is already uploaded as “${dup.displayName}” (${dup.chapterTitle || 'unknown chapter'}).`);
      }
    } catch {
      showToast('error', 'Checksum failed', 'Could not compute the file checksum. Try picking the file again.');
      setFile(null);
    } finally {
      setChecksumBusy(false);
    }
  }, [isDemo, notes, showToast]);

  const clearFile = useCallback(() => {
    setFile(null);
    setTitle('');
    setChecksum('');
    setDuplicateOf(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  // ── Upload ──────────────────────────────────────────────────────────
  const canSubmit = !!file && !!title && !!formChapterId && formCourseIds.length > 0 && !!checksum && !checksumBusy && !duplicateOf && !uploading;

  const handleUpload = useCallback(async () => {
    if (!file || !title || !formChapterId || formCourseIds.length === 0) {
      showToast('error', 'Missing details',
        !file ? 'Attach a PDF to upload.'
        : !title ? 'Give the note a title.'
        : !formChapterId ? 'Pick the chapter this note belongs to.'
        : 'Pick at least one course the note is published under.');
      return;
    }
    if (checksumBusy || !checksum) return;
    if (duplicateOf) {
      showToast('error', 'Duplicate PDF', 'This file already exists — it was not uploaded again.');
      return;
    }
    const chapter = chapterById.get(String(formChapterId));
    setUploading(true);
    setProgress(0);
    try {
      if (isDemo) {
        // Backend unreachable — simulate so the flow stays demonstrable.
        demoRowsRef.current = [{
          id: Date.now(),
          chapterId: Number(formChapterId),
          chapterTitle: chapter?.title || '',
          subject: chapter?.subject || '',
          fileName: `${checksum}.pdf`,
          displayName: title,
          fileUrl: '#',
          fileSize: file.size,
          checksumSha256: checksum,
          batches: formBatchIds.map((id) => ({ id, name: batchById.get(id)?.name || id })),
          courses: formCourseIds.map((id) => ({ id, title: courseById.get(id)?.title || id })),
          uploadedOn: Math.round(Date.now() / 1000),
        }, ...demoRowsRef.current];
        showToast('warning', 'Demo mode', 'Backend unreachable — the upload was simulated locally.');
      } else {
        const stored = await uploadClassNotePdf(file, {
          checksumSha256: checksum,
          onProgress: setProgress,
        });
        await saveClassNoteMetadata({
          chapterId: Number(formChapterId),
          courseIds: formCourseIds,
          fileUrl: stored.fileUrl,
          fileName: stored.fileName,
          displayName: title,
          fileSize: stored.fileSize,
          checksumSha256: checksum,
          batchIds: formBatchIds,
        });
        showToast('success', 'Class note uploaded', `“${title}” is now attached to ${chapter?.title || 'the chapter'}.`);
      }
      clearFile();
      setFormCourseIds([]);
      setFormBatchIds([]);
      setPage(1);
      loadNotes();
    } catch (err) {
      const e = apiError(err, 'Could not upload the class note.');
      if (e.status === 409 || e.code === 'duplicate_file') {
        showToast('error', 'Duplicate PDF', e.message || 'This exact file has already been uploaded.');
      } else {
        showToast('error', 'Upload failed', e.message);
      }
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }, [file, title, formChapterId, formCourseIds, formBatchIds, checksum, checksumBusy, duplicateOf, isDemo, chapterById, courseById, batchById, clearFile, loadNotes, showToast]);

  const handleVisibilitySave = useCallback(async ({ chapterId, courseIds, batchIds }) => {
    const note = visibilityNote;
    if (!note) return;
    const chapter = chapterById.get(String(chapterId));
    setVisibilitySaving(true);
    try {
      if (isDemo) {
        // Backend unreachable — apply the change to the local demo rows.
        demoRowsRef.current = demoRowsRef.current.map((n) => (n.id === note.id ? {
          ...n,
          chapterId,
          chapterTitle: chapter?.title || n.chapterTitle,
          subject: chapter?.subject || n.subject,
          courses: courseIds.map((id) => ({ id, title: courseById.get(id)?.title || id })),
          batches: batchIds.map((id) => ({ id, name: batchById.get(id)?.name || id })),
        } : n));
        showToast('warning', 'Demo mode', 'Backend unreachable — the visibility change was applied locally.');
      } else {
        await updateClassNoteVisibility({ id: note.id, chapterId, courseIds, batchIds });
        showToast('success', 'Visibility updated', `“${note.displayName}” now sits under ${chapter?.title || 'the selected chapter'}.`);
      }
      setVisibilityNote(null);
      loadNotes();
    } catch (err) {
      showToast('error', 'Update failed', apiErrorMessage(err, 'Could not update the visibility.'));
    } finally {
      setVisibilitySaving(false);
    }
  }, [visibilityNote, isDemo, chapterById, courseById, batchById, loadNotes, showToast]);

  const copyLink = useCallback((note) => {
    if (!note.fileUrl || note.fileUrl === '#') return;
    navigator.clipboard?.writeText(note.fileUrl)
      .then(() => showToast('success', 'Link copied', 'The CDN link is on your clipboard.'))
      .catch(() => showToast('error', 'Copy failed', 'Could not copy the link.'));
  }, [showToast]);

  // Grouped options for the chapter filter (and flat groups for the form select).
  const chapterGroups = useMemo(() => {
    const groups = [];
    const idx = new Map();
    chapters.forEach((c) => {
      if (!idx.has(c.group)) {
        idx.set(c.group, { group: c.group, options: [] });
        groups.push(idx.get(c.group));
      }
      idx.get(c.group).options.push({ value: String(c.id), label: c.label });
    });
    return groups;
  }, [chapters]);

  const chapterFilterOptions = useMemo(
    () => [{ value: '', label: 'All Chapters' }, ...chapterGroups],
    [chapterGroups]
  );
  const courseFilterOptions = useMemo(
    () => [{ value: '', label: 'All Courses' }, ...courses.map((c) => ({ value: String(c.id), label: c.title }))],
    [courses]
  );
  const batchFilterOptions = useMemo(
    () => [{ value: '', label: 'All Batches' }, ...batches.map((b) => ({ value: String(b.id), label: b.name }))],
    [batches]
  );

  const hasFilters = Boolean(searchQuery || filterChapter || filterCourse || filterBatch);
  const clearAllFilters = useCallback(() => {
    setSearchQuery('');
    setFilterChapter('');
    setFilterCourse('');
    setFilterBatch('');
    setPage(1);
  }, []);

  const start = total === 0 ? 0 : (page - 1) * pageSize;
  const tone = file ? sizeTone(file.size) : null;

  return (
    <section className="class-notes-page data-table-page">
      <ToastRegion toasts={toasts} onDismiss={(id) => setToasts((cur) => cur.filter((t) => t.id !== id))} />

      <div className="page-header-section">
        <div className="page-header-title-group">
          <span className="page-header-icon-box"><i className="fa fa-file-pdf-o" /></span>
          <div>
            <h2>Class Notes</h2>
            <p>Upload chapter-wise PDF notes for students. Files appear in the Resources section of the chapter in the mobile app, for the batches you pick.</p>
          </div>
        </div>
      </div>

      {isDemo ? <div className="courses-demo-banner">Showing demo class notes because the class-notes APIs are currently unreachable.</div> : null}

      <Can permission={PERMS.CLASS_NOTES_EDIT}>
        <div className="cn-upload-card">
          <div className="cn-upload-fields">
            <div className="cn-field">
              <label>Chapter <span className="cn-required">*</span></label>
              <select
                className="cn-select"
                value={formChapterId}
                onChange={(e) => setFormChapterId(e.target.value)}
                disabled={uploading}
              >
                <option value="">Select the chapter…</option>
                {chapterGroups.map((g) => (
                  <optgroup key={g.group} label={g.group}>
                    {g.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="cn-field">
              <label>Courses <span className="cn-required">*</span></label>
              <MultiSelectDropdown
                value={formCourseIds}
                onChange={setFormCourseIds}
                options={courses.map((c) => String(c.id))}
                getLabel={(id) => courseById.get(String(id))?.title || id}
                allLabel="Select courses…"
                plural="courses"
                searchPlaceholder="Search courses…"
                disabled={uploading}
                buttonClassName={formCourseIds.length ? '' : 'is-placeholder'}
              />
              <SelectedChips
                ids={formCourseIds}
                getLabel={(id) => courseById.get(String(id))?.title || id}
                onRemove={(id) => setFormCourseIds((cur) => cur.filter((x) => x !== id))}
                chipClassName="cn-course-chip"
                disabled={uploading}
              />
              <span className="cn-field-hint">The chapter can be part of more than one course — pick every course the note is published under.</span>
            </div>
            <div className="cn-field">
              <label>Visible to batches</label>
              <MultiSelectDropdown
                value={formBatchIds}
                onChange={setFormBatchIds}
                options={batches.map((b) => String(b.id))}
                getLabel={(id) => batchById.get(String(id))?.name || id}
                allLabel="All batches"
                plural="batches"
                searchPlaceholder="Search batches…"
                disabled={uploading}
                buttonClassName={formBatchIds.length ? '' : 'is-placeholder'}
              />
              <SelectedChips
                ids={formBatchIds}
                getLabel={(id) => batchById.get(String(id))?.name || id}
                onRemove={(id) => setFormBatchIds((cur) => cur.filter((x) => x !== id))}
                disabled={uploading}
              />
              <span className="cn-field-hint">Leave empty to make the note visible to every batch.</span>
            </div>
          </div>

          <div
            className={`cn-dropzone ${dragOver ? 'is-dragover' : ''} ${file ? 'has-file' : ''}`}
            onClick={() => !uploading && fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); if (!uploading) setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (!uploading) acceptFile(e.dataTransfer.files?.[0]);
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              style={{ display: 'none' }}
              onChange={(e) => acceptFile(e.target.files?.[0])}
            />
            {!file ? (
              <>
                <i className="ti ti-cloud-up" />
                <h4>Drop a PDF here or click to browse</h4>
                <p>
                  PDF only, up to <strong>15 MB</strong>. Ideal size: {IDEAL_SIZE_TIERS.map((t) => `${t.size} for ${t.pages}`).join(' · ')}.
                </p>
              </>
            ) : (
              <div className="cn-file-summary" onClick={(e) => e.stopPropagation()}>
                <i className="fa fa-file-pdf-o" />
                <div className="cn-file-meta">
                  <span className="cn-file-name" title={file.name}>{file.name}</span>
                  <div className="cn-title-field">
                    <label htmlFor="cn-title-input">Title <span className="cn-required">*</span></label>
                    <input
                      id="cn-title-input"
                      type="text"
                      className="cn-title-input"
                      value={title}
                      maxLength={120}
                      placeholder="Title shown to students"
                      onChange={(e) => setTitle(sanitizeTitle(e.target.value))}
                      disabled={uploading}
                    />
                    <span className="cn-field-hint">Shown to students in the app. Letters, numbers, “-” and “_” only.</span>
                  </div>
                  <span className={`cn-file-size is-${tone}`}>
                    {formatBytes(file.size)}
                    {tone === 'heavy' ? ' — heavier than the 5 MB ideal for 20–25 pages; consider compressing' : ''}
                  </span>
                  <span className="cn-file-checksum" title={checksum || undefined}>
                    {checksumBusy ? 'Computing SHA-256 checksum…' : checksum ? `SHA-256 ${checksum.slice(0, 16)}…` : ''}
                  </span>
                  {duplicateOf ? (
                    <span className="cn-file-duplicate">
                      <i className="ti ti-alert" /> Already uploaded as “{duplicateOf.displayName}”{duplicateOf.chapterTitle ? ` under ${duplicateOf.chapterTitle}` : ''}.
                    </span>
                  ) : null}
                </div>
                <button type="button" className="cn-file-remove" onClick={clearFile} disabled={uploading} title="Remove file">
                  <i className="ti ti-close" />
                </button>
              </div>
            )}
          </div>

          <div className="cn-upload-actions">
            {uploading ? (
              <div className="cn-progress">
                <div className="cn-progress-bar"><div className="cn-progress-fill" style={{ width: `${progress}%` }} /></div>
                <span>{progress > 0 ? `Uploading… ${progress}%` : 'Uploading…'}</span>
              </div>
            ) : (
              <span className="cn-upload-note">Duplicate uploads are blocked automatically using the file&apos;s SHA-256 checksum.</span>
            )}
            <button type="button" className="cn-upload-btn" disabled={!canSubmit} onClick={handleUpload}>
              <i className="ti ti-upload" /> Upload class note
            </button>
          </div>
        </div>
      </Can>

      <div className="filter-bar cn-filter-bar">
        <div className="search-wrapper">
          <i className={`ti ${searchQuery ? 'ti-close' : 'ti-search'}`} onClick={() => setSearchQuery('')} />
          <input
            type="text"
            className="search-input"
            placeholder="Search by file name, chapter, or subject..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <FilterDropdown label="All Chapters" value={filterChapter} options={chapterFilterOptions} maxHeight="300px" onChange={setFilterChapter} />
        <FilterDropdown label="All Courses" value={filterCourse} options={courseFilterOptions} maxHeight="280px" onChange={setFilterCourse} />
        <FilterDropdown label="All Batches" value={filterBatch} options={batchFilterOptions} maxHeight="280px" onChange={setFilterBatch} />
        {hasFilters ? (
          <button type="button" className="payments-clear-btn" onClick={clearAllFilters}><i className="ti ti-close" /> Clear</button>
        ) : null}
      </div>

      {(isLoading || notes.length > 0) ? (
        <div className="students-table-container">
          <table className={`students-table ${isLoading ? 'thead-loading' : ''}`}>
            <thead>
              <tr>
                <th>File</th>
                <th>Chapter</th>
                <th>Courses</th>
                <th>Visible to</th>
                <th>Size</th>
                <th>Checksum</th>
                <th>Uploaded</th>
                <th className="actions-column">Actions</th>
              </tr>
            </thead>
            {isLoading ? (
              <tbody>
                {Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`skel-${i}`}>
                    <td><div className="orders-skeleton long"><div className="orders-skeleton-shimmer" /></div></td>
                    <td><div className="orders-skeleton medium"><div className="orders-skeleton-shimmer" /></div></td>
                    <td><div className="orders-skeleton medium"><div className="orders-skeleton-shimmer" /></div></td>
                    <td><div className="orders-skeleton medium"><div className="orders-skeleton-shimmer" /></div></td>
                    <td><div className="orders-skeleton short"><div className="orders-skeleton-shimmer" /></div></td>
                    <td><div className="orders-skeleton medium"><div className="orders-skeleton-shimmer" /></div></td>
                    <td><div className="orders-skeleton short"><div className="orders-skeleton-shimmer" /></div></td>
                    <td />
                  </tr>
                ))}
              </tbody>
            ) : (
              <tbody>
                {notes.map((n) => {
                  const chapter = chapterById.get(String(n.chapterId));
                  const chapterTitle = n.chapterTitle || chapter?.title || `Chapter #${n.chapterId}`;
                  const subject = n.subject || chapter?.subject || '';
                  return (
                    <tr key={n.id}>
                      <td>
                        <div className="cn-cell-file">
                          <i className="fa fa-file-pdf-o" />
                          <div>
                            <span className="cn-cell-file-name" title={n.fileName}>{n.displayName}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span>{chapterTitle}</span>
                        {subject ? <div className="profile-subtext">{subject}{chapter?.segment ? ` · ${chapter.segment}` : ''}</div> : null}
                      </td>
                      <td>
                        {(n.courses || []).length === 0 ? (
                          <span className="profile-subtext">—</span>
                        ) : (
                          <div className="cn-batch-chips">
                            {n.courses.map((c) => (
                              <span key={c.id} className="cn-batch-chip cn-course-chip" title={c.title || courseById.get(String(c.id))?.title}>
                                {c.title || courseById.get(String(c.id))?.title || c.id}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td>
                        {n.batches.length === 0 ? (
                          <span className="profile-subtext">All batches</span>
                        ) : (
                          <div className="cn-batch-chips">
                            {n.batches.map((b) => (
                              <span key={b.id} className="cn-batch-chip" title={b.name || batchById.get(String(b.id))?.name}>
                                {b.name || batchById.get(String(b.id))?.name || b.id}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td><span className={`cn-size is-${sizeTone(n.fileSize)}`}>{formatBytes(n.fileSize)}</span></td>
                      <td>
                        {n.checksumSha256 ? (
                          <span className="cn-checksum" title={n.checksumSha256}>{n.checksumSha256.slice(0, 10)}…</span>
                        ) : <span className="profile-subtext">—</span>}
                      </td>
                      <td><div className="info-cell"><i className="ti ti-calendar" /> {fmtDate(n.uploadedOn)}</div></td>
                      <td className="actions-column">
                        <div className="cn-row-actions">
                          <a
                            className={`cn-icon-btn ${!n.fileUrl || n.fileUrl === '#' ? 'is-disabled' : ''}`}
                            href={n.fileUrl && n.fileUrl !== '#' ? n.fileUrl : undefined}
                            target="_blank"
                            rel="noreferrer"
                            title="Open PDF"
                          >
                            <i className="ti ti-new-window" />
                          </a>
                          <button type="button" className="cn-icon-btn" onClick={() => copyLink(n)} title="Copy CDN link" disabled={!n.fileUrl || n.fileUrl === '#'}>
                            <i className="ti ti-link" />
                          </button>
                          {canEdit ? (
                            <div className="kebab-menu-container" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                className="kebab-button"
                                onClick={() => setOpenKebabId((cur) => (cur === n.id ? null : n.id))}
                              >
                                <i className="ti ti-more-alt" />
                              </button>
                              <div className={`kebab-dropdown ${openKebabId === n.id ? 'active' : ''}`}>
                                <button
                                  type="button"
                                  className="kebab-dropdown-item"
                                  onClick={() => { setVisibilityNote(n); setOpenKebabId(null); }}
                                >
                                  <i className="ti ti-eye" /> Visibility
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            )}
          </table>

          {!isLoading && total > 0 && (
            <div className="pagination-container">
              <div className="pagination-info">
                <span>Showing {start + 1} to {Math.min(start + pageSize, total)} of {total} entries</span>
                <select className="page-size-select" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
                  {[10, 20, 50, 100].map((s) => <option key={s} value={s}>Show {s}</option>)}
                </select>
              </div>
              <div className="pagination-controls">
                <button type="button" className="pagination-btn" disabled={page === 1} onClick={() => setPage((c) => Math.max(1, c - 1))}><i className="ti ti-angle-left" /> Previous</button>
                {getPageNumbers(page, totalPages).map((n, i) => (
                  n === '...'
                    ? <span key={`el-${i}`} className="pagination-ellipsis">…</span>
                    : <button key={n} type="button" className={`pagination-btn ${page === n ? 'active' : ''}`} onClick={() => setPage(n)}>{n}</button>
                ))}
                <button type="button" className="pagination-btn" disabled={page >= totalPages} onClick={() => setPage((c) => Math.min(totalPages, c + 1))}>Next <i className="ti ti-angle-right" /></button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="empty-state">
          <i className="fa fa-file-pdf-o" />
          <h4>No Class Notes Found</h4>
          {hasFilters ? (
            <p>No class notes match your search or filters. <button type="button" onClick={clearAllFilters}>Clear all filters</button> to see every note.</p>
          ) : (
            <p>No class notes have been uploaded yet. Pick a chapter and upload the first PDF above.</p>
          )}
        </div>
      )}

      {visibilityNote ? (
        <VisibilityModal
          note={visibilityNote}
          chapterGroups={chapterGroups}
          courses={courses}
          courseById={courseById}
          batches={batches}
          batchById={batchById}
          saving={visibilitySaving}
          onClose={() => !visibilitySaving && setVisibilityNote(null)}
          onSave={handleVisibilitySave}
        />
      ) : null}
    </section>
  );
}
