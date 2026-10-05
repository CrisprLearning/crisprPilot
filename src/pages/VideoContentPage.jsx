import React, { useEffect, useMemo, useRef, useState } from 'react';
import ToastRegion from '../components/ToastRegion';
import FilterDropdown from '../components/FilterDropdown';
import { bunnyFoldersDemo, bunnyVideosDemo, instructorsDemo, videoLibraryDemo } from '../data/adminRemainingDemo';
import Icon from '../components/Icon';

const SUBJECTS = ['Biology', 'Chemistry', 'Mathematics', 'Physics'];
const CHAPTERS = {
  Biology: ['Cell Biology', 'Plant Biology', 'Genetics', 'Ecology', 'Human Physiology'],
  Chemistry: ['Organic Chemistry', 'Physical Chemistry', 'Inorganic Chemistry', 'Aromatic Chemistry'],
  Mathematics: ['Calculus', 'Integral Calculus', 'Coordinate Geometry', 'Algebra', 'Trigonometry'],
  Physics: ['Mechanics', 'Electrostatics', 'Thermodynamics', 'Optics', 'Modern Physics'],
};

function formatDuration(seconds) {
  if (!seconds) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ---- KebabMenu ----
function KebabMenu({ onView, onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="kebab-menu-container" ref={ref}>
      <button
        type="button"
        className="kebab-button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
      >
        <Icon className="ti ti-more-alt" />
      </button>
      <div className={`kebab-dropdown${open ? ' active' : ''}`}>
        <button type="button" className="kebab-dropdown-item" onClick={() => { setOpen(false); onView(); }}>
          <Icon className="ti ti-eye" /> View
        </button>
        <button type="button" className="kebab-dropdown-item" onClick={() => { setOpen(false); onEdit(); }}>
          <Icon className="ti ti-pencil" /> Edit
        </button>
        <button type="button" className="kebab-dropdown-item danger-action" onClick={() => { setOpen(false); onDelete(); }}>
          <Icon className="ti ti-trash" /> Delete
        </button>
      </div>
    </div>
  );
}

// ---- Edit Video Modal ----
function EditVideoModal({ video, onClose, onSave }) {
  const [form, setForm] = useState({
    titleName: video.titleName || '',
    classificationLevel1: video.classificationLevel1 || '',
    classificationLevel2: video.classificationLevel2 || '',
    instructorId: video.instructorId || '',
  });

  function handleSave() {
    onSave({ ...video, ...form });
  }

  const chapters = CHAPTERS[form.classificationLevel1] || [];

  return (
    <div className="crispr-modal-backdrop active" onClick={onClose}>
      <div
        className="crispr-modal-dialog"
        style={{ maxWidth: 960 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="crispr-modal-header">
          <h3><Icon className="ti ti-pencil" /> Edit Video #{video.videoId}</h3>
          <button type="button" className="crispr-modal-close" onClick={onClose}>
            <Icon className="ti ti-close" />
          </button>
        </div>
        <div className="crispr-modal-body" style={{ padding: 25 }}>
          <div className="vc-edit-layout">
            <div className="vc-edit-player">
              <div className="vc-video-embed">
                <div className="vc-video-placeholder">
                  <Icon className="ti ti-video-clapper" />
                  <p>Video Player</p>
                  <span>{video.videoDisplayKey}</span>
                </div>
              </div>
              <div className="vc-video-meta-box">
                <div className="vc-meta-row">
                  <span><strong>Video ID:</strong></span>
                  <span className="vc-mono">{video.videoId}</span>
                </div>
                <div className="vc-meta-row">
                  <span><strong>Collection:</strong></span>
                  <span>{video.collectionName || 'N/A'}</span>
                </div>
                <div className="vc-meta-row">
                  <span><strong>Duration:</strong></span>
                  <span>{formatDuration(video.durationInSeconds)}</span>
                </div>
                <div className="vc-meta-row">
                  <span><strong>Key:</strong></span>
                  <span className="vc-mono" style={{ fontSize: 12 }}>{video.videoDisplayKey}</span>
                </div>
              </div>
            </div>
            <div className="vc-edit-form">
              <div className="vc-form-group">
                <label>Title Name</label>
                <input
                  type="text"
                  className="vc-input"
                  value={form.titleName}
                  maxLength={80}
                  placeholder="Enter video title"
                  onChange={(e) => setForm((f) => ({ ...f, titleName: e.target.value }))}
                />
              </div>
              <div className="vc-form-group">
                <label>Level 1 (Subject)</label>
                <select
                  className="vc-select"
                  value={form.classificationLevel1}
                  onChange={(e) => setForm((f) => ({ ...f, classificationLevel1: e.target.value, classificationLevel2: '' }))}
                >
                  <option value="">Select Level 1</option>
                  {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="vc-form-group">
                <label>Level 2 (Chapter)</label>
                <select
                  className="vc-select"
                  value={form.classificationLevel2}
                  disabled={!form.classificationLevel1}
                  onChange={(e) => setForm((f) => ({ ...f, classificationLevel2: e.target.value }))}
                >
                  <option value="">Select Level 2</option>
                  {chapters.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="vc-form-group">
                <label>Instructor</label>
                <select
                  className="vc-select"
                  value={form.instructorId}
                  onChange={(e) => setForm((f) => ({ ...f, instructorId: e.target.value }))}
                >
                  <option value="">Select Instructor</option>
                  {instructorsDemo.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </div>
              <div style={{ marginTop: 25 }}>
                <button type="button" className="vc-btn-save" onClick={handleSave}>
                  <Icon className="ti ti-save" /> Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Link/Classify Video Modal (Add New) ----
function LinkVideoModal({ onClose, onSave }) {
  const [form, setForm] = useState({
    classificationLevel1: '',
    classificationLevel2: '',
    instructorId: '',
    collectionName: '',
  });
  const [videoItems, setVideoItems] = useState([{ targetVideoId: '', titleName: '' }]);

  const chapters = CHAPTERS[form.classificationLevel1] || [];
  const videosInFolder = form.collectionName
    ? bunnyVideosDemo.filter((v) => {
        const folder = bunnyFoldersDemo.find((f) => f.name === form.collectionName);
        return folder ? v.folderId === folder.id : false;
      })
    : [];

  function getAvailableVideos(currentItem) {
    const selectedIds = videoItems.filter((it) => it !== currentItem).map((it) => it.targetVideoId).filter(Boolean);
    return videosInFolder.filter((v) => !selectedIds.includes(v.id));
  }

  function addRow() {
    setVideoItems((items) => [...items, { targetVideoId: '', titleName: '' }]);
  }

  function removeRow(index) {
    setVideoItems((items) => items.filter((_, i) => i !== index));
  }

  function updateRow(index, key, value) {
    setVideoItems((items) => items.map((it, i) => i === index ? { ...it, [key]: value } : it));
  }

  function isComplete() {
    return form.classificationLevel1 && form.classificationLevel2 && videoItems.some((it) => it.titleName.trim());
  }

  return (
    <div className="crispr-modal-backdrop active" onClick={onClose}>
      <div
        className="crispr-modal-dialog"
        style={{ maxWidth: 960 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="crispr-modal-header">
          <h3><Icon className="ti ti-link" /> Classify Video</h3>
          <button type="button" className="crispr-modal-close" onClick={onClose}>
            <Icon className="ti ti-close" />
          </button>
        </div>
        <div className="crispr-modal-body">
          <form onSubmit={(e) => e.preventDefault()}>
            <div className="vc-form-section">
              <div className="vc-form-row">
                <div className="vc-form-group">
                  <label>Subject (L1) <span style={{ color: 'red' }}>*</span></label>
                  <select
                    className="vc-select"
                    value={form.classificationLevel1}
                    onChange={(e) => setForm((f) => ({ ...f, classificationLevel1: e.target.value, classificationLevel2: '' }))}
                  >
                    <option value="">Select Level 1 (Subject)</option>
                    {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="vc-form-group">
                  <label>Chapter (L2) <span style={{ color: 'red' }}>*</span></label>
                  <select
                    className="vc-select"
                    value={form.classificationLevel2}
                    disabled={!form.classificationLevel1}
                    onChange={(e) => setForm((f) => ({ ...f, classificationLevel2: e.target.value }))}
                  >
                    <option value="">Select Level 2 (Chapter)</option>
                    {chapters.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="vc-form-row">
                <div className="vc-form-group">
                  <label>Instructor</label>
                  <select
                    className="vc-select"
                    value={form.instructorId}
                    onChange={(e) => setForm((f) => ({ ...f, instructorId: e.target.value }))}
                  >
                    <option value="">Select Instructor Profile</option>
                    {instructorsDemo.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                </div>
                <div className="vc-form-group">
                  <label>Source Folder</label>
                  <select
                    className="vc-select"
                    value={form.collectionName}
                    onChange={(e) => setForm((f) => ({ ...f, collectionName: e.target.value }))}
                  >
                    <option value="">Select Hosting Folder</option>
                    {bunnyFoldersDemo.map((f) => (
                      <option key={f.id} value={f.name}>{f.name} ({f.videoCount} items)</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {form.collectionName && (
              <div className="vc-form-section">
                <div className="vc-form-section-title">Video Display Titles</div>
                {videoItems.map((item, index) => (
                  <div
                    key={index}
                    className="vc-form-row"
                    style={{
                      borderBottom: index < videoItems.length - 1 ? '1px dashed #eee' : 'none',
                      marginBottom: 12,
                      paddingBottom: index < videoItems.length - 1 ? 12 : 0,
                    }}
                  >
                    <div className="vc-form-group" style={{ marginBottom: 0 }}>
                      {index === 0 && <label>Select Video</label>}
                      {index > 0 && <label style={{ visibility: 'hidden', height: 0, display: 'block', margin: 0 }}>Select Video</label>}
                      <select
                        className="vc-select"
                        value={item.targetVideoId}
                        disabled={!form.collectionName}
                        onChange={(e) => updateRow(index, 'targetVideoId', e.target.value)}
                      >
                        <option value="">Select Video File</option>
                        {getAvailableVideos(item).map((v) => (
                          <option key={v.id} value={v.id}>{v.title} ({formatDuration(v.duration)})</option>
                        ))}
                      </select>
                    </div>
                    <div className="vc-form-group" style={{ marginBottom: 0 }}>
                      {index === 0 && <label>Title <span style={{ color: 'red' }}>*</span></label>}
                      {index > 0 && <label style={{ visibility: 'hidden', height: 0, display: 'block', margin: 0 }}>Title</label>}
                      <div style={{ display: 'flex', gap: 10 }}>
                        <input
                          type="text"
                          className="vc-input"
                          value={item.titleName}
                          placeholder="Enter video title"
                          maxLength={80}
                          onChange={(e) => updateRow(index, 'titleName', e.target.value)}
                        />
                        {videoItems.length > 1 && (
                          <button
                            type="button"
                            className="vc-btn-row-remove"
                            onClick={() => removeRow(index)}
                            title="Remove Row"
                          >
                            <Icon className="ti ti-close" />
                          </button>
                        )}
                        {index === videoItems.length - 1 && videoItems.length < videosInFolder.length && (
                          <button
                            type="button"
                            className="vc-btn-row-add"
                            onClick={addRow}
                            title="Add Row"
                          >
                            <Icon className="ti ti-plus" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </form>
        </div>
        <div className="crispr-modal-footer">
          <button type="button" className="btn-modal-cancel" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn-modal-save"
            disabled={!isComplete()}
            onClick={() => { onSave(form, videoItems); }}
          >
            <Icon className="ti ti-save" /> Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Main Page ----
export default function VideoContentPage() {
  const [videos, setVideos] = useState(videoLibraryDemo);
  const [isLoading, setIsLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [filterChapter, setFilterChapter] = useState('');
  const [filterInstructor, setFilterInstructor] = useState('');
  const [sortKey, setSortKey] = useState('titleName');
  const [sortDir, setSortDir] = useState('asc');
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [editVideo, setEditVideo] = useState(null);
  const [showLink, setShowLink] = useState(false);
  const [viewVideo, setViewVideo] = useState(null);
  const [deleteVideo, setDeleteVideo] = useState(null);
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const t = window.setTimeout(() => setIsLoading(false), 700);
    return () => window.clearTimeout(t);
  }, []);

  function showToast(type, title, message) {
    const id = Date.now() + Math.random();
    setToasts((cur) => [...cur, { id, type, title, message }]);
    window.setTimeout(() => setToasts((cur) => cur.filter((t) => t.id !== id)), 4000);
  }

  function dismissToast(id) {
    setToasts((cur) => cur.filter((t) => t.id !== id));
  }

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setCurrentPage(1);
  }

  function SortIcon({ col }) {
    if (sortKey !== col) return <Icon className="ti ti-arrows-vertical sort-icon" />;
    return <Icon className={`ti ti-arrow-${sortDir === 'asc' ? 'up' : 'down'} sort-icon`} />;
  }

  const subjectOptions = [
    { value: '', label: 'All Subjects' },
    ...SUBJECTS.map((s) => ({ value: s, label: s })),
  ];

  const chapterOptions = useMemo(() => {
    const list = filterSubject ? CHAPTERS[filterSubject] || [] : Object.values(CHAPTERS).flat();
    return [{ value: '', label: 'All Chapters' }, ...list.map((c) => ({ value: c, label: c }))];
  }, [filterSubject]);

  const instructorOptions = [
    { value: '', label: 'All Instructors' },
    ...instructorsDemo.map((i) => ({ value: i.id, label: i.name })),
  ];

  const filteredVideos = useMemo(() => {
    let result = videos.filter((v) => {
      if (filterSubject && v.classificationLevel1 !== filterSubject) return false;
      if (filterChapter && v.classificationLevel2 !== filterChapter) return false;
      if (filterInstructor && v.instructorId !== filterInstructor) return false;
      if (searchText.trim()) {
        const q = searchText.trim().toLowerCase();
        if (![v.titleName, v.videoDisplayKey, String(v.videoId)].some((s) => String(s).toLowerCase().includes(q))) return false;
      }
      return true;
    });

    result = [...result].sort((a, b) => {
      let av = a[sortKey] ?? '';
      let bv = b[sortKey] ?? '';
      if (sortKey === 'durationInSeconds') {
        av = Number(av); bv = Number(bv);
      } else {
        av = String(av).toLowerCase(); bv = String(bv).toLowerCase();
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [videos, searchText, filterSubject, filterChapter, filterInstructor, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredVideos.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const paginatedVideos = filteredVideos.slice(startIdx, startIdx + pageSize);

  function goToPage(p) { setCurrentPage(Math.max(1, Math.min(p, totalPages))); }

  function pageNumbers() {
    const pages = [];
    const range = 2;
    for (let i = Math.max(1, safePage - range); i <= Math.min(totalPages, safePage + range); i++) {
      pages.push(i);
    }
    return pages;
  }

  function handleCopyKey(key) {
    navigator.clipboard.writeText(key).then(() => {
      showToast('success', 'Copied', `Key "${key}" copied to clipboard.`);
    });
  }

  function confirmDelete() {
    if (!deleteVideo) return;
    setVideos((cur) => cur.filter((v) => v.id !== deleteVideo.id));
    showToast('success', 'Deleted', `"${deleteVideo.titleName}" has been removed.`);
    setDeleteVideo(null);
  }

  function handleSaveEdit(updated) {
    setVideos((cur) => cur.map((v) => (v.id === updated.id ? updated : v)));
    setEditVideo(null);
    showToast('success', 'Saved', `"${updated.titleName}" updated successfully.`);
  }

  function handleSaveLink(form, items) {
    const newEntries = items
      .filter((it) => it.titleName.trim())
      .map((it, i) => ({
        id: `VID-NEW-${Date.now()}-${i}`,
        videoId: Math.floor(Math.random() * 9000) + 1000,
        titleName: it.titleName.trim(),
        videoDisplayKey: `VID-${form.classificationLevel1?.slice(0, 3).toUpperCase() || 'NEW'}-${Math.floor(Math.random() * 900) + 100}`,
        chapterId: form.classificationLevel2,
        subject: form.classificationLevel1,
        classificationLevel1: form.classificationLevel1,
        classificationLevel2: form.classificationLevel2,
        instructorId: form.instructorId,
        instructorName: instructorsDemo.find((i) => i.id === form.instructorId)?.name || '',
        durationInSeconds: 0,
        status: 'uploading',
        createdOn: new Date().toISOString(),
        collectionName: form.collectionName,
        thumbnail: '',
      }));
    setVideos((cur) => [...newEntries, ...cur]);
    setShowLink(false);
    showToast('success', 'Video Classified', `${newEntries.length} video(s) added successfully.`);
  }

  const skeletonRows = Array.from({ length: Math.min(5, pageSize) });

  return (
    <section className="video-content-page data-table-page">
      <ToastRegion toasts={toasts} onDismiss={dismissToast} />

      {/* ── Standard Page Header ── */}
      <div className="page-header-section">
        <div className="page-header-title-group">
          <span className="page-header-icon-box"><Icon className="fa fa-video-camera" /></span>
          <div>
            <h2>Video Content</h2>
            <p>Manage linked videos, chapter metadata, and upload state.</p>
          </div>
        </div>
        <button type="button" className="page-action-button" onClick={() => setShowLink(true)}>
          <Icon className="ti ti-plus" /> Add New
        </button>
      </div>

      {/* Filter Bar */}
      <div className="filter-bar">
        <div className="search-wrapper">
          <Icon
            className={`ti ${searchText ? 'ti-close' : 'ti-search'}`}
            onClick={() => { setSearchText(''); setCurrentPage(1); }}
            style={{ cursor: searchText ? 'pointer' : 'default' }} />
          <input
            type="text"
            className="search-input"
            placeholder="Search videos..."
            value={searchText}
            onChange={(e) => { setSearchText(e.target.value); setCurrentPage(1); }}
          />
        </div>
        <FilterDropdown
          label="All Subjects"
          options={subjectOptions}
          value={filterSubject}
          onChange={(v) => { setFilterSubject(v); setFilterChapter(''); setCurrentPage(1); }}
        />
        <FilterDropdown
          label="All Chapters"
          options={chapterOptions}
          value={filterChapter}
          onChange={(v) => { setFilterChapter(v); setCurrentPage(1); }}
        />
        <FilterDropdown
          label="All Instructors"
          options={instructorOptions}
          value={filterInstructor}
          onChange={(v) => { setFilterInstructor(v); setCurrentPage(1); }}
        />
      </div>

      {/* Table */}
      <div className="students-table-container">
        <table className={`students-table ${isLoading ? 'thead-loading' : ''}`}>
          <thead>
            <tr>
              <th>Thumbnail</th>
              <th className={`sortable${sortKey === 'titleName' ? ' active' : ''}`} onClick={() => handleSort('titleName')}>
                Video Details <SortIcon col="titleName" />
              </th>
              <th className={`sortable${sortKey === 'durationInSeconds' ? ' active' : ''}`} onClick={() => handleSort('durationInSeconds')}>
                Duration <SortIcon col="durationInSeconds" />
              </th>
              <th className={`sortable${sortKey === 'classificationLevel1' ? ' active' : ''}`} onClick={() => handleSort('classificationLevel1')}>
                Classification <SortIcon col="classificationLevel1" />
              </th>
              <th className={`sortable${sortKey === 'status' ? ' active' : ''}`} onClick={() => handleSort('status')}>
                Status <SortIcon col="status" />
              </th>
              <th>Actions</th>
            </tr>
          </thead>

          {isLoading ? (
            <tbody>
              {skeletonRows.map((_, i) => (
                <tr key={`skel-${i}`}>
                  <td>
                    <div className="vc-skeleton thumb"><div className="vc-skeleton-shimmer" /></div>
                  </td>
                  <td>
                    <div className="vc-skeleton medium" style={{ marginBottom: 6 }}><div className="vc-skeleton-shimmer" /></div>
                    <div className="vc-skeleton short"><div className="vc-skeleton-shimmer" /></div>
                  </td>
                  <td>
                    <div className="vc-skeleton short"><div className="vc-skeleton-shimmer" /></div>
                  </td>
                  <td>
                    <div className="vc-skeleton medium"><div className="vc-skeleton-shimmer" /></div>
                  </td>
                  <td>
                    <div className="vc-skeleton badge"><div className="vc-skeleton-shimmer" /></div>
                  </td>
                  <td>
                    <div className="vc-skeleton short"><div className="vc-skeleton-shimmer" /></div>
                  </td>
                </tr>
              ))}
            </tbody>
          ) : (
            <tbody>
              {paginatedVideos.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 30, color: '#999' }}>
                    No videos found matching your filters.
                  </td>
                </tr>
              ) : (
                paginatedVideos.map((video) => (
                  <tr key={video.id}>
                    <td>
                      {video.thumbnail ? (
                        <img
                          src={video.thumbnail}
                          alt="Video thumbnail"
                          className="vc-thumbnail"
                          onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                        />
                      ) : null}
                      <div
                        className="vc-thumbnail-placeholder"
                        style={{ display: video.thumbnail ? 'none' : 'flex' }}
                      >
                        <Icon className="ti ti-video-clapper" />
                      </div>
                    </td>
                    <td>
                      <div className="profile-name">{video.titleName}</div>
                      <div className="profile-subtext">
                        ID: {video.videoId} | Key: {video.videoDisplayKey}
                        <span
                          className="vc-copy-icon"
                          title="Copy Key"
                          onClick={() => handleCopyKey(video.videoDisplayKey)}
                        >
                          <Icon className="ti ti-files" />
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="profile-subtext" style={{ fontSize: 13 }}>
                        <Icon className="ti ti-time" /> {formatDuration(video.durationInSeconds)}
                      </span>
                    </td>
                    <td>
                      <div className="vc-classification">
                        {video.classificationLevel1 && (
                          <span className="vc-badge vc-badge-l1">L1: {video.classificationLevel1}</span>
                        )}
                        {video.classificationLevel2 && (
                          <span className="vc-badge vc-badge-l2">L2: {video.classificationLevel2}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={`status-pill ${video.status === 'ready' ? 'status-active' : 'status-inactive'}`}>
                        {video.status === 'ready' ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <KebabMenu
                        onView={() => setViewVideo(video)}
                        onEdit={() => setEditVideo(video)}
                        onDelete={() => setDeleteVideo(video)}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          )}
        </table>

        {!isLoading && filteredVideos.length > 0 && (
          <div className="pagination-container">
            <div className="pagination-info">
              <span>
                Showing {startIdx + 1} to {Math.min(startIdx + pageSize, filteredVideos.length)} of {filteredVideos.length} videos
              </span>
              <select
                className="page-size-select"
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
              >
                {[10, 20, 50, 200].map((s) => (
                  <option key={s} value={s}>Show {s}</option>
                ))}
              </select>
            </div>
            <div className="pagination-controls">
              <button
                type="button"
                className="pagination-btn"
                disabled={safePage === 1}
                onClick={() => goToPage(safePage - 1)}
              >
                <Icon className="ti ti-angle-left" /> Previous
              </button>
              {pageNumbers().map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`pagination-btn${p === safePage ? ' active' : ''}`}
                  onClick={() => goToPage(p)}
                >
                  {p}
                </button>
              ))}
              <button
                type="button"
                className="pagination-btn"
                disabled={safePage === totalPages}
                onClick={() => goToPage(safePage + 1)}
              >
                Next <Icon className="ti ti-angle-right" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* View Modal */}
      {viewVideo && (
        <div className="crispr-modal-backdrop active" onClick={() => setViewVideo(null)}>
          <div className="crispr-modal-dialog" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
            <div className="crispr-modal-header">
              <h3><Icon className="ti ti-eye" /> Video Details</h3>
              <button type="button" className="crispr-modal-close" onClick={() => setViewVideo(null)}>
                <Icon className="ti ti-close" />
              </button>
            </div>
            <div className="crispr-modal-body" style={{ padding: 25 }}>
              <div className="vc-view-grid">
                <div className="vc-view-video">
                  <div className="vc-video-placeholder large">
                    <Icon className="ti ti-video-clapper" />
                    <p>Video Preview</p>
                    <span>{viewVideo.videoDisplayKey}</span>
                  </div>
                </div>
                <table className="vc-detail-table">
                  <tbody>
                    <tr><td><strong>Title</strong></td><td>{viewVideo.titleName}</td></tr>
                    <tr><td><strong>Video ID</strong></td><td>{viewVideo.videoId}</td></tr>
                    <tr><td><strong>Key</strong></td><td><span className="vc-mono">{viewVideo.videoDisplayKey}</span></td></tr>
                    <tr><td><strong>Duration</strong></td><td>{formatDuration(viewVideo.durationInSeconds)}</td></tr>
                    <tr><td><strong>Subject</strong></td><td>{viewVideo.classificationLevel1 || '—'}</td></tr>
                    <tr><td><strong>Chapter</strong></td><td>{viewVideo.classificationLevel2 || '—'}</td></tr>
                    <tr><td><strong>Instructor</strong></td><td>{viewVideo.instructorName || '—'}</td></tr>
                    <tr><td><strong>Collection</strong></td><td>{viewVideo.collectionName || '—'}</td></tr>
                    <tr>
                      <td><strong>Status</strong></td>
                      <td>
                        <span className={`crispr-status ${viewVideo.status === 'ready' ? 'active' : 'inactive'}`}>
                          {viewVideo.status === 'ready' ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div className="crispr-modal-footer">
              <button type="button" className="btn-modal-cancel" onClick={() => setViewVideo(null)}>Close</button>
              <button type="button" className="btn-modal-save" onClick={() => { setViewVideo(null); setEditVideo(viewVideo); }}>
                <Icon className="ti ti-pencil" /> Edit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editVideo && (
        <EditVideoModal
          video={editVideo}
          onClose={() => setEditVideo(null)}
          onSave={handleSaveEdit}
        />
      )}

      {/* Link/Classify Video Modal */}
      {showLink && (
        <LinkVideoModal
          onClose={() => setShowLink(false)}
          onSave={handleSaveLink}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteVideo && (
        <div
          className="crispr-modal-backdrop active"
          role="presentation"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setDeleteVideo(null); }}
        >
          <div className="crispr-modal-dialog" style={{ maxWidth: 460 }} role="dialog" aria-modal="true">
            <div className="crispr-modal-header">
              <h3><Icon className="ti ti-trash" /> Delete Video</h3>
              <button type="button" className="crispr-modal-close" onClick={() => setDeleteVideo(null)}>
                <Icon className="ti ti-close" />
              </button>
            </div>
            <div className="crispr-modal-body">
              <p style={{ margin: 0, color: '#334155', lineHeight: 1.6 }}>
                Are you sure you want to delete <strong>&ldquo;{deleteVideo.titleName}&rdquo;</strong>?
                This action cannot be undone.
              </p>
            </div>
            <div className="crispr-modal-footer">
              <button type="button" className="btn btn-default" onClick={() => setDeleteVideo(null)}>
                <Icon className="ti ti-close" /> Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={confirmDelete}>
                <Icon className="ti ti-trash" /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
