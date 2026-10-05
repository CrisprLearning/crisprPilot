import React, { useState, useMemo, useEffect } from 'react';
import ToastRegion from '../components/ToastRegion';
import { courseViewDemo } from '../data/courseViewDemo';
import { demoCourses } from '../data/coursesListDemo';
import Icon from '../components/Icon';

function getPageNumbers(currentPage, totalPages) {
  const pages = [];
  const maxVisible = 5;
  let start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, start + maxVisible - 1);
  if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1);
  for (let page = start; page <= end; page += 1) pages.push(page);
  return pages;
}

export default function CourseViewPage() {
  const [toasts, setToasts] = useState([]);
  
  // States
  const [courseData, setCourseData] = useState(courseViewDemo);
  const [selectedSegmentId, setSelectedSegmentId] = useState('');
  const [selectedModuleId, setSelectedModuleId] = useState('');
  const [selectedChapterId, setSelectedChapterId] = useState('');
  const [selectedPartId, setSelectedPartId] = useState('');
  
  const [selectCourseModalOpen, setSelectCourseModalOpen] = useState(false);
  const [courseSearchQuery, setCourseSearchQuery] = useState('');
  const [coursePage, setCoursePage] = useState(1);
  const [coursePageSize, setCoursePageSize] = useState(10);

  // Initialization
  useEffect(() => {
    if (courseData.segments && courseData.segments.length > 0) {
      const seg = courseData.segments[0];
      setSelectedSegmentId(seg.id);
      if (seg.modules && seg.modules.length > 0) {
        const mod = seg.modules[0];
        setSelectedModuleId(mod.id);
        if (mod.chapters && mod.chapters.length > 0) {
          const chap = mod.chapters[0];
          setSelectedChapterId(chap.id);
          if (chap.parts && chap.parts.length > 0) {
            setSelectedPartId(chap.parts[0].id);
          }
        }
      }
    }
  }, [courseData]);

  // Derived state
  const availableSegments = courseData.segments || [];
  
  const selectedSegment = useMemo(() => {
    return availableSegments.find(s => s.id === selectedSegmentId) || null;
  }, [availableSegments, selectedSegmentId]);

  const availableModules = selectedSegment?.modules || [];

  const selectedModule = useMemo(() => {
    return availableModules.find(m => m.id === selectedModuleId) || null;
  }, [availableModules, selectedModuleId]);

  const availableChapters = selectedModule?.chapters || [];

  const chapterData = useMemo(() => {
    return availableChapters.find(c => c.id === selectedChapterId) || null;
  }, [availableChapters, selectedChapterId]);

  const parts = chapterData?.parts || [];

  const selectedPartIndex = useMemo(() => {
    return parts.findIndex(p => p.id === selectedPartId);
  }, [parts, selectedPartId]);

  const selectedPart = parts[selectedPartIndex] || null;

  // Handlers
  const handleSegmentChange = (e) => {
    const sId = e.target.value;
    setSelectedSegmentId(sId);
    // Reset down the chain
    const seg = availableSegments.find(s => s.id === sId);
    const mod = seg?.modules?.[0];
    setSelectedModuleId(mod ? mod.id : '');
    const chap = mod?.chapters?.[0];
    setSelectedChapterId(chap ? chap.id : '');
    setSelectedPartId(chap?.parts?.[0]?.id || '');
  };

  const handleModuleChange = (e) => {
    const mId = e.target.value;
    setSelectedModuleId(mId);
    const mod = availableModules.find(m => m.id === mId);
    const chap = mod?.chapters?.[0];
    setSelectedChapterId(chap ? chap.id : '');
    setSelectedPartId(chap?.parts?.[0]?.id || '');
  };

  const handleChapterChange = (e) => {
    const cId = e.target.value;
    setSelectedChapterId(cId);
    const chap = availableChapters.find(c => c.id === cId);
    setSelectedPartId(chap?.parts?.[0]?.id || '');
  };

  const hasPreviousPart = selectedPartIndex > 0;
  const hasNextPart = selectedPartIndex >= 0 && selectedPartIndex < parts.length - 1;

  const previousPart = () => {
    if (hasPreviousPart) {
      setSelectedPartId(parts[selectedPartIndex - 1].id);
    }
  };

  const nextPart = () => {
    if (hasNextPart) {
      setSelectedPartId(parts[selectedPartIndex + 1].id);
    }
  };

  // Format seconds to mm:ss
  const formatDuration = (seconds) => {
    if (!seconds) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Select Course logic
  const filteredCoursesArray = useMemo(() => {
    if (!courseSearchQuery) return demoCourses;
    const q = courseSearchQuery.toLowerCase();
    return demoCourses.filter(c => c.title.toLowerCase().includes(q) || c.code.toLowerCase().includes(q));
  }, [demoCourses, courseSearchQuery]);

  // Pagination for the Select Course modal table.
  const courseTotal = filteredCoursesArray.length;
  const courseTotalPages = Math.max(1, Math.ceil(courseTotal / coursePageSize));
  const safeCoursePage = Math.min(coursePage, courseTotalPages);
  const pagedCourses = useMemo(() => {
    const start = (safeCoursePage - 1) * coursePageSize;
    return filteredCoursesArray.slice(start, start + coursePageSize);
  }, [filteredCoursesArray, safeCoursePage, coursePageSize]);
  const coursePageNumbers = useMemo(() => getPageNumbers(safeCoursePage, courseTotalPages), [safeCoursePage, courseTotalPages]);
  const courseShowingStart = courseTotal === 0 ? 0 : (safeCoursePage - 1) * coursePageSize + 1;
  const courseShowingEnd = Math.min(safeCoursePage * coursePageSize, courseTotal);

  useEffect(() => {
    setCoursePage(1);
  }, [courseSearchQuery, selectCourseModalOpen]);

  const selectCourseFromModal = (code) => {
    // In a real app we would refetch courseViewDemo based on the course code.
    // Here we'll just close it and show a toast.
    setSelectCourseModalOpen(false);
    showToast('success', 'Course Loaded', `Loaded course ${code}`);
  };

  function showToast(type, title, message) {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, type, title, message }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4000);
  }

  return (
    <div style={{ padding: '0 15px' }}>
      <ToastRegion toasts={toasts} onDismiss={(id) => setToasts((c) => c.filter((t) => t.id !== id))} />

      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', padding: '20px', background: 'linear-gradient(135deg, #006073 0%, #005a6b 100%)', borderRadius: '8px', color: 'white' }}>
         <div style={{ flex: 1 }}>
            <h2 style={{ margin: '0 0 8px 0', fontSize: '28px', fontWeight: 600, color: 'white' }}>
               <Icon className="ti ti-book" /> {courseData.code}: {courseData.title}
            </h2>
            <p style={{ margin: '0 0 15px 0', opacity: 0.9, fontSize: '14px' }}>
               {courseData.description}
            </p>
            {/* Navigation Dropdowns */}
            <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
               <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '12px', opacity: 0.9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Segment</label>
                  <select value={selectedSegmentId} onChange={handleSegmentChange} style={{ padding: '8px 12px', borderRadius: '6px', border: 'none', background: 'white', color: '#2c3e50', fontWeight: 600, fontSize: '14px', minWidth: '150px', cursor: 'pointer' }}>
                     {availableSegments.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select>
               </div>
               <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '12px', opacity: 0.9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Module</label>
                  <select value={selectedModuleId} onChange={handleModuleChange} style={{ padding: '8px 12px', borderRadius: '6px', border: 'none', background: 'white', color: '#2c3e50', fontWeight: 600, fontSize: '14px', minWidth: '200px', cursor: 'pointer' }}>
                     {availableModules.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
               </div>
               <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '12px', opacity: 0.9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Chapter</label>
                  <select value={selectedChapterId} onChange={handleChapterChange} style={{ padding: '8px 12px', borderRadius: '6px', border: 'none', background: 'white', color: '#2c3e50', fontWeight: 600, fontSize: '14px', minWidth: '250px', cursor: 'pointer' }}>
                     {availableChapters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
               </div>
            </div>
         </div>
         <button className="cv-btn cv-btn-lg" style={{ background: '#ffb706', color: '#006073', border: 'none', fontWeight: 600, padding: '12px 24px', borderRadius: '6px', cursor: 'pointer', alignSelf: 'flex-start' }} onClick={() => setSelectCourseModalOpen(true)}>
            <Icon className="ti ti-layers" /> Select Course
         </button>
      </div>

      {/* Course View Container */}
      <div className="cv-course-container">
         {/* Empty State: No Content Added */}
         {chapterData && parts.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: '600px', textAlign: 'center', padding: '40px' }}>
                <Icon className="ti ti-folder-open" style={{ fontSize: '80px', color: '#dee2e6', marginBottom: '24px' }} />
                <h3 style={{ color: '#495057', marginBottom: '12px', fontWeight: 500 }}>No Content Added</h3>
                <p style={{ color: '#6c757d', fontSize: '15px', maxWidth: '400px' }}>
                   No content has been added for "{chapterData.name}" yet.
                </p>
            </div>
         )}

         {/* Normal Content View */}
         {chapterData && parts.length > 0 && (
            <div style={{ display: 'flex', width: '100%', gap: 0 }}>
               {/* Course Sidebar */}
               <div className="cv-course-sidebar">
                  {/* Mentor Info */}
                  <div className="cv-mentor" style={{ borderTop: '3px solid #006073' }}>
                      <img src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9IiM2NjdlZWEiLz4KPHN2ZyB4PSIxMCIgeT0iMTAiIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJ3aGl0ZSI+CjxwYXRoIGQ9Ik0xMiAxMmMyLjIxIDAgNC0xLjc5IDQtNHMtMS43OS00LTQtNC00IDEuNzktNCA0IDEuNzkgNCA0IDR6bTAgMmMtMi42NyAwLTggMS4zNC04IDR2MmgxNnYtMmMwLTIuNjYtNS4zMy00LTgtNHoiLz4KPC9zdmc+Cjwvc3ZnPgo=" alt="Mentor" />
                      <div className="cv-mentor-info">
                          <p>Course Instructor</p>
                          <p>Expert in {courseData.category || 'Science'}</p>
                      </div>
                  </div>

                  {/* Chapter List */}
                  <ul className="cv-chapter-list">
                      {parts.map((part, index) => (
                          <li key={part.id} 
                              className={`cv-chapter ${part.id === selectedPartId ? 'cv-active' : ''}`}
                              onClick={() => setSelectedPartId(part.id)}>
                              <div className="cv-chapter-number">{index + 1}</div>
                              <div className="cv-chapter-details">
                                  <div className="cv-chapter-title">{part.title}</div>
                                  <div className="cv-chapter-meta">
                                      <span className={`cv-progress-ring cv-${part.type === 'VIDEO' ? 'in-progress' : 'completed'}`}></span>
                                      {part.type}
                                  </div>
                              </div>
                              <div className="cv-chapter-duration">{formatDuration(part.duration)}</div>
                          </li>
                      ))}
                  </ul>
               </div>

               {/* Course Content Area */}
               <div className="cv-course-content">
                  {selectedPart && (
                      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                          {/* Content Header */}
                          <div className="cv-content-header">
                             <div style={{ flex: 1 }}>
                                <h3>{selectedPart.title}</h3>
                                <p className="cv-subtext">{selectedPart.summary}</p>
                                <div style={{ display: 'flex', gap: '20px', marginTop: '12px', fontSize: '13px', color: '#6c757d' }}>
                                   <span><Icon className="ti ti-time" style={{ marginRight: '5px' }} />{formatDuration(selectedPart.duration)}</span>
                                   <span><Icon className="ti ti-eye" style={{ marginRight: '5px' }} />12k views</span>
                                   <span><Icon className="ti ti-download" style={{ marginRight: '5px' }} />143 downloads</span>
                                   <span><Icon className="ti ti-star" style={{ color: '#ffb706', marginRight: '5px' }} />5/5</span>
                                </div>
                             </div>
                             {/* Navigation Controls */}
                             <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                <button className="cv-btn" onClick={previousPart} disabled={!hasPreviousPart}
                                        style={{ padding: '8px 14px', borderRadius: '6px', fontSize: '13px', border: '1px solid #e5e8ef', background: 'white', color: '#6c757d', cursor: hasPreviousPart ? 'pointer' : 'not-allowed', opacity: hasPreviousPart ? 1 : 0.5 }}>
                                   <Icon className="ti ti-angle-left" /> Previous
                                </button>
                                <button className="cv-btn" onClick={nextPart} disabled={!hasNextPart}
                                        style={{ padding: '8px 14px', borderRadius: '6px', fontSize: '13px', border: '1px solid #e5e8ef', background: 'white', color: '#6c757d', cursor: hasNextPart ? 'pointer' : 'not-allowed', opacity: hasNextPart ? 1 : 0.5 }}>
                                   Next <Icon className="ti ti-angle-right" />
                                </button>
                             </div>
                          </div>

                          {/* Video Player Placeholder or Empty state depending on type */}
                          <div style={{ flex: 1 }}>
                             {selectedPart.type === 'VIDEO' ? (
                                <div className="cv-video-wrapper">
                                    <div className="cv-video-placeholder">
                                        🎥
                                    </div>
                                </div>
                             ) : (
                                <div style={{ padding: '35px' }}>
                                    <div className="cv-part-info">
                                        <div className="cv-part-title"><Icon className={`ti ti-${selectedPart.type === 'QUIZ' ? 'pencil' : 'download'}`} /> {selectedPart.title}</div>
                                        <div className="cv-part-description">{selectedPart.summary}</div>
                                        <div className="cv-part-meta">
                                            <div className="cv-meta-item"><Icon className="ti ti-files" /> Type: {selectedPart.type}</div>
                                        </div>
                                    </div>
                                </div>
                             )}
                          </div>
                      </div>
                  )}
               </div>
            </div>
         )}
      </div>

      {/* Select Course Modal — standard modal + table */}
      {selectCourseModalOpen && (
        <div className="legacy-modal-backdrop active" onClick={() => setSelectCourseModalOpen(false)}>
          <div className="legacy-modal-dialog legacy-large form-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <div className="legacy-modal-header">
              <h3>Select Course</h3>
              <button type="button" className="legacy-modal-close" onClick={() => setSelectCourseModalOpen(false)}>
                <Icon className="ti ti-close" />
              </button>
            </div>
            <div className="legacy-modal-body">
              <div className="asset-form-section">
                <div className="asset-form-section-title"><Icon className="ti ti-layers" /> Available Courses</div>
                <div className="data-table-page" style={{ padding: 0 }}>
                  <div className="search-wrapper" style={{ marginBottom: 16 }}>
                    <Icon className="ti ti-search" />
                    <input
                      type="text"
                      className="search-input"
                      placeholder="Search courses by title or code..."
                      value={courseSearchQuery}
                      onChange={e => setCourseSearchQuery(e.target.value)}
                    />
                  </div>

                  <div className="students-table-container">
                    <table className="students-table">
                      <thead>
                        <tr>
                          <th style={{ width: 64 }}><Icon className="ti ti-hash" /></th>
                          <th>Course</th>
                          <th className="cv-center">Modules</th>
                          <th className="cv-center">Chapters</th>
                          <th className="cv-center">Category</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedCourses.map(course => (
                          <tr key={course.code} className="cv-course-row" onClick={() => selectCourseFromModal(course.code)}>
                            <td>
                              <div className="cv-course-avatar"><Icon className="ti ti-book" /></div>
                            </td>
                            <td>
                              <div className="cv-course-name">{course.title}</div>
                              <div className="cv-course-code">Code: {course.code}</div>
                            </td>
                            <td className="cv-center"><span className="cv-pill cv-pill-blue">{course.moduleCount}</span></td>
                            <td className="cv-center"><span className="cv-pill cv-pill-amber">{course.chapterCount}</span></td>
                            <td className="cv-center"><span className="cv-pill cv-pill-teal">{course.category}</span></td>
                          </tr>
                        ))}
                        {courseTotal === 0 && (
                          <tr>
                            <td colSpan={5}>
                              <div className="cv-empty">
                                <Icon className="ti ti-info-alt" />
                                <p>No courses available</p>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {courseTotal > 0 && (
                    <div className="pagination-container">
                      <div className="pagination-info">
                        <span>Showing {courseShowingStart} to {courseShowingEnd} of {courseTotal} entries</span>
                        <select
                          className="page-size-select"
                          value={coursePageSize}
                          onChange={e => { setCoursePageSize(Number(e.target.value)); setCoursePage(1); }}
                        >
                          <option value={10}>Show 10</option>
                          <option value={20}>Show 20</option>
                          <option value={50}>Show 50</option>
                        </select>
                      </div>
                      <div className="pagination-controls">
                        <button type="button" className="pagination-btn" disabled={safeCoursePage === 1} onClick={() => setCoursePage(p => Math.max(1, p - 1))}>
                          <Icon className="ti ti-angle-left" /> Previous
                        </button>
                        {coursePageNumbers.map(page => (
                          <button
                            key={page}
                            type="button"
                            className={`pagination-btn ${safeCoursePage === page ? 'active' : ''}`}
                            onClick={() => setCoursePage(page)}
                          >
                            {page}
                          </button>
                        ))}
                        <button type="button" className="pagination-btn" disabled={safeCoursePage === courseTotalPages} onClick={() => setCoursePage(p => Math.min(courseTotalPages, p + 1))}>
                          Next <Icon className="ti ti-angle-right" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="legacy-modal-footer">
              <button type="button" className="legacy-btn legacy-btn-default" onClick={() => setSelectCourseModalOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      <style>
      {`
        .cv-center { text-align: center; }
        .cv-course-row { cursor: pointer; }
        .cv-course-avatar {
          width: 36px; height: 36px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          background: linear-gradient(135deg, #006073 0%, #008ba3 100%);
          color: #fff; font-size: 16px;
        }
        .cv-course-name { font-size: 14px; font-weight: 600; color: #1e293b; }
        .cv-course-code { font-size: 12px; color: #64748b; margin-top: 2px; }
        .cv-pill { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; }
        .cv-pill-blue { background: #e3f2fd; color: #1976d2; }
        .cv-pill-amber { background: #fff3e0; color: #f57c00; }
        .cv-pill-teal { background: #e0f7fa; color: #006064; border-radius: 6px; }
        .cv-empty { text-align: center; padding: 48px 20px; color: #94a3b8; }
        .cv-empty i { font-size: 48px; display: block; margin-bottom: 12px; opacity: 0.5; }
      `}
      </style>
    </div>
  );
}
