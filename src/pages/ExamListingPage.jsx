import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ToastRegion from '../components/ToastRegion';
import FilterDropdown from '../components/FilterDropdown';
import { examsDemo } from '../data/examsDemo';
import Icon from '../components/Icon';

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const value = Math.random() * 16 | 0;
    const next = char === 'x' ? value : ((value & 0x3) | 0x8);
    return next.toString(16);
  });
}

function getPageNumbers(currentPage, totalPages) {
  const pages = [];
  for (let page = 1; page <= totalPages; page += 1) pages.push(page);
  return pages;
}

function formatDate(timestamp) {
  if (!timestamp) return 'Unknown';
  return new Date(timestamp * 1000).toLocaleDateString() + ' ' + new Date(timestamp * 1000).toLocaleTimeString();
}

function getStatusLabel(status) {
  switch (Number(status)) {
    case 0:
      return 'Draft';
    case 1:
      return 'Active';
    case 2:
      return 'Inactive';
    default:
      return 'Unknown';
  }
}

function getStatusClass(status) {
  switch (Number(status)) {
    case 0:
      return 'status-draft';
    case 1:
      return 'status-active';
    case 2:
      return 'status-inactive';
    default:
      return 'status-draft';
  }
}

function getMarkingSchemeLabel(scheme) {
  switch (Number(scheme)) {
    case 0:
      return 'No Marking Scheme';
    case 1:
      return '+4 for correct, -1 for incorrect';
    case 2:
      return '+4 for correct, 0 for incorrect (No negative)';
    case 3:
      return '+3 for correct, -1 for incorrect';
    case 4:
      return 'Custom Marking Scheme';
    default:
      return 'Standard Marking';
  }
}

function normalizeExam(exam) {
  return {
    challengeQuestionAllowed: 0,
    switchSectionsAllowed: 1,
    markingSchemeOverall: 1,
    ...exam,
    sectionsData: (exam.sectionsData || []).map((section, index) => ({
      order: section.order || index + 1,
      duration: section.duration || Math.max(15, Math.round((exam.duration || 60) / Math.max(exam.numberOfSections || 1, 1))),
      totalQuestions: section.totalQuestions || section.questions?.length || 0,
      enableSectionWiseTimer: section.enableSectionWiseTimer || false,
      sectionMarkingScheme: section.sectionMarkingScheme || 0,
      ...section,
    })),
  };
}

function sortExams(rows, column, reverse) {
  const sorted = [...rows];
  sorted.sort((left, right) => {
    let aValue = '';
    let bValue = '';
    switch (column) {
      case 'displayKey':
        aValue = (left.displayKey || '').toLowerCase();
        bValue = (right.displayKey || '').toLowerCase();
        break;
      case 'title':
        aValue = (left.title || '').toLowerCase();
        bValue = (right.title || '').toLowerCase();
        break;
      case 'totalQuestions':
        aValue = Number(left.totalQuestions || 0);
        bValue = Number(right.totalQuestions || 0);
        return reverse ? aValue - bValue : bValue - aValue;
      case 'duration':
        aValue = Number(left.duration || 0);
        bValue = Number(right.duration || 0);
        return reverse ? aValue - bValue : bValue - aValue;
      case 'status':
        aValue = Number(left.status || 0);
        bValue = Number(right.status || 0);
        return reverse ? aValue - bValue : bValue - aValue;
      default:
        return 0;
    }
    if (aValue < bValue) return reverse ? 1 : -1;
    if (aValue > bValue) return reverse ? -1 : 1;
    return 0;
  });
  return sorted;
}

export default function ExamListingPage() {
  const navigate = useNavigate();
  const [exams, setExams] = useState(() => {
    const storedDrafts = window.localStorage.getItem('examDrafts');
    const storedPublished = window.localStorage.getItem('publishedExams');
    const drafts = storedDrafts ? JSON.parse(storedDrafts) : [];
    const published = storedPublished ? JSON.parse(storedPublished) : [];
    const map = new Map();
    [...published, ...drafts, ...examsDemo].map(normalizeExam).forEach((exam) => {
      if (!map.has(exam.id)) map.set(exam.id, exam);
    });
    return [...map.values()];
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [selectedExam, setSelectedExam] = useState(null);
  const [examToDelete, setExamToDelete] = useState(null);
  const [sortColumn, setSortColumn] = useState('');
  const [sortReverse, setSortReverse] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isLoading, setIsLoading] = useState(true);
  const [activeKebabId, setActiveKebabId] = useState(null);
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);
  const kebabRef = useRef(null);

  const showToast = (type, title, message) => {
    const id = toastIdRef.current + 1;
    toastIdRef.current = id;
    setToasts((current) => [...current, { id, type, title, message }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4500);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => setIsLoading(false), 900);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleClick = (event) => {
      if (kebabRef.current && !kebabRef.current.contains(event.target)) setActiveKebabId(null);
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const filteredExams = useMemo(() => {
    let rows = exams;
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      rows = rows.filter((exam) =>
        exam.title.toLowerCase().includes(query) ||
        exam.brief.toLowerCase().includes(query) ||
        exam.sectionsData.some((section) => section.name.toLowerCase().includes(query))
      );
    }
    if (filterStatus === 'active') rows = rows.filter((exam) => Number(exam.status) === 1);
    if (filterStatus === 'inactive') rows = rows.filter((exam) => Number(exam.status) === 2 || Number(exam.status) === 0);
    if (sortColumn) rows = sortExams(rows, sortColumn, sortReverse);
    return rows;
  }, [exams, filterStatus, searchQuery, sortColumn, sortReverse]);

  const summary = useMemo(() => {
    const source = filteredExams.length || searchQuery || filterStatus ? filteredExams : exams;
    const totalDuration = source.reduce((sum, exam) => sum + (exam.duration || 0), 0);
    return {
      totalExams: source.length,
      totalQuestions: source.reduce((sum, exam) => sum + (exam.totalQuestions || 0), 0),
      totalActive: source.filter((exam) => Number(exam.status) === 1).length,
      totalDraft: source.filter((exam) => Number(exam.status) === 0).length,
      totalDuration: Math.round(totalDuration / 60),
    };
  }, [exams, filteredExams, filterStatus, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredExams.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedExams = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredExams.slice(start, start + pageSize);
  }, [filteredExams, pageSize, safeCurrentPage]);
  const pageNumbers = useMemo(() => getPageNumbers(safeCurrentPage, totalPages), [safeCurrentPage, totalPages]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  function handleSort(column) {
    if (sortColumn === column) {
      setSortReverse((value) => !value);
    } else {
      setSortColumn(column);
      setSortReverse(false);
    }
  }

  function sortIcon(column) {
    if (sortColumn !== column) return 'ti-arrows-vertical';
    return sortReverse ? 'ti-arrow-down' : 'ti-arrow-up';
  }

  function toggleKebabMenu(exam, event) {
    event.stopPropagation();
    setActiveKebabId((current) => (current === exam.id ? null : exam.id));
  }

  function viewExam(exam) {
    setSelectedExam(exam);
    setActiveKebabId(null);
  }

  function viewAttempts(exam) {
    window.localStorage.setItem('reportExamData', JSON.stringify(exam));
    navigate(`/exam-attempt-report?exam=${exam.id}`);
    setActiveKebabId(null);
  }

  function editExam(exam) {
    navigate(`/exam-creation-wizard?edit=${exam.id}`);
    setActiveKebabId(null);
  }

  function duplicateExam(exam) {
    const duplicatedExam = normalizeExam({
      ...exam,
      id: exams.length > 0 ? Math.max(...exams.map((entry) => Number(entry.id))) + 1 : 1,
      displayKey: generateUUID(),
      title: `${exam.title} (Copy)`,
      status: 0,
      createdOn: Math.floor(Date.now() / 1000),
      lastUpdatedOn: Math.floor(Date.now() / 1000),
    });
    const updated = [duplicatedExam, ...exams];
    setExams(updated);
    window.localStorage.setItem('examDrafts', JSON.stringify(updated.filter((entry) => Number(entry.status) === 0)));
    showToast('success', 'Exam Duplicated', 'Exam duplicated successfully! The new exam is now in Draft mode.');
  }

  function confirmDelete() {
    if (!examToDelete) return;
    const updated = exams.filter((exam) => exam.id !== examToDelete.id);
    setExams(updated);
    window.localStorage.setItem('examDrafts', JSON.stringify(updated.filter((entry) => Number(entry.status) === 0)));
    window.localStorage.setItem('publishedExams', JSON.stringify(updated.filter((entry) => Number(entry.status) === 1)));
    showToast('success', 'Exam Deleted', `Exam "${examToDelete.title}" deleted successfully!`);
    setExamToDelete(null);
  }

  const showingStart = filteredExams.length === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const showingEnd = Math.min(safeCurrentPage * pageSize, filteredExams.length);

  return (
    <section className="exam-listing-page data-table-page">
      <ToastRegion toasts={toasts} onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />

      <div className="page-header-section">
        <div>
          <h2><Icon className="ti ti-clipboard" /> Exam Listing</h2>
          <p>Manage exam drafts, published tests, and attempt reports without changing the legacy workflow.</p>
        </div>
        <button type="button" className="create-exam-button" onClick={() => navigate('/exam-creation-wizard')}>
          <Icon className="ti ti-plus" /> Create New Exam
        </button>
      </div>

      <div className="stats-row">
        <button type="button" className={`stat-card ${!filterStatus ? 'filterAppliedTile' : ''}`} onClick={() => { setFilterStatus(''); setCurrentPage(1); }}>
          <div className="stat-icon blue"><Icon className="ti ti-clipboard" /></div>
          <div className="stat-info"><h3>{summary.totalExams}</h3><p>Total Exams</p></div>
        </button>
        <button type="button" className="stat-card plain-button" onClick={() => { setSearchQuery(''); setFilterStatus(''); }}>
          <div className="stat-icon green"><Icon className="ti ti-help-alt" /></div>
          <div className="stat-info"><h3>{summary.totalQuestions}</h3><p>Total Questions</p></div>
        </button>
        <button type="button" className={`stat-card ${filterStatus === 'active' ? 'filterAppliedTile' : ''}`} onClick={() => { setFilterStatus('active'); setCurrentPage(1); }}>
          <div className="stat-icon orange"><Icon className="ti ti-check-box" /></div>
          <div className="stat-info"><h3>{summary.totalActive}</h3><p>Active</p></div>
        </button>
        <button type="button" className={`stat-card ${filterStatus === 'inactive' ? 'filterAppliedTile' : ''}`} onClick={() => { setFilterStatus('inactive'); setCurrentPage(1); }}>
          <div className="stat-icon indigo"><Icon className="ti ti-pencil-alt" /></div>
          <div className="stat-info"><h3>{summary.totalDraft}</h3><p>Draft / Inactive</p></div>
        </button>
      </div>

      <div className="filter-bar">
        <div className="search-wrapper">
          <Icon className={`ti ${searchQuery ? 'ti-close' : 'ti-search'}`} onClick={() => setSearchQuery('')} />
          <input
            type="text"
            className="search-input"
            placeholder="Search exams by title, description, or sections..."
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setCurrentPage(1);
            }}
          />
        </div>
        <FilterDropdown
          label="All Status"
          value={filterStatus}
          options={[
            { value: '', label: 'All Status' },
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ]}
          onChange={(value) => { setFilterStatus(value); setCurrentPage(1); }}
        />
      </div>

      <div className="students-table-container" ref={kebabRef}>
        <table className={`students-table ${isLoading ? 'thead-loading' : ''}`}>
          <thead>
            <tr>
              <th className={`sortable ${sortColumn === 'displayKey' ? 'active' : ''}`} onClick={() => handleSort('displayKey')}>
                Exam ID
                <Icon className={`sort-icon ti ${sortIcon('displayKey')}`} />
              </th>
              <th className={`sortable ${sortColumn === 'title' ? 'active' : ''}`} onClick={() => handleSort('title')}>
                Exam Name
                <Icon className={`sort-icon ti ${sortIcon('title')}`} />
              </th>
              <th>Sections</th>
              <th className={`sortable center-align ${sortColumn === 'totalQuestions' ? 'active' : ''}`} onClick={() => handleSort('totalQuestions')}>
                Questions
                <Icon className={`sort-icon ti ${sortIcon('totalQuestions')}`} />
              </th>
              <th className={`sortable ${sortColumn === 'duration' ? 'active' : ''}`} onClick={() => handleSort('duration')}>
                Duration
                <Icon className={`sort-icon ti ${sortIcon('duration')}`} />
              </th>
              <th className={`sortable ${sortColumn === 'status' ? 'active' : ''}`} onClick={() => handleSort('status')}>
                Status
                <Icon className={`sort-icon ti ${sortIcon('status')}`} />
              </th>
              <th className="center-align">Actions</th>
            </tr>
          </thead>
          {isLoading ? (
            <tbody>
              {Array.from({ length: Number(pageSize) || 10 }, (_, index) => (
                <tr key={`skeleton-${index}`}>
                  <td><div className="exam-skeleton medium" /></td>
                  <td><div className="exam-skeleton long" /><div className="exam-skeleton medium top-gap" /></td>
                  <td><div className="exam-skeleton medium" /></td>
                  <td><div className="exam-skeleton short centered" /></td>
                  <td><div className="exam-skeleton short" /></td>
                  <td><div className="exam-skeleton short" /></td>
                  <td><div className="exam-skeleton icon centered" /></td>
                </tr>
              ))}
            </tbody>
          ) : (
            <tbody>
              {paginatedExams.map((exam) => (
                <tr key={exam.id}>
                  <td><div className="exam-id">{exam.displayKey}</div></td>
                  <td>
                    <div className="exam-name">{exam.title}</div>
                    {exam.brief ? <div className="exam-description">{exam.brief}</div> : null}
                  </td>
                  <td>
                    <div>
                      {(exam.sectionsData || []).slice(0, 3).map((section) => (
                        <span key={`${exam.id}-${section.name}`} className="section-badge">{section.name}</span>
                      ))}
                      {Number(exam.numberOfSections) > 3 ? <span className="section-badge">+{Number(exam.numberOfSections) - 3} more</span> : null}
                    </div>
                  </td>
                  <td className="center-align"><div className="questions-count">{exam.totalQuestions}</div></td>
                  <td><div className="time-info"><Icon className="ti ti-time" /> {exam.duration} min</div></td>
                  <td><span className={`status-badge ${getStatusClass(exam.status)}`}>{getStatusLabel(exam.status)}</span></td>
                  <td className="center-align">
                    <div className="kebab-menu-container">
                      <button type="button" className="kebab-button" onClick={(event) => toggleKebabMenu(exam, event)}>
                        <Icon className="ti ti-more-alt" />
                      </button>
                      <div className={`kebab-dropdown ${activeKebabId === exam.id ? 'active' : ''}`}>
                        <button type="button" className="kebab-dropdown-item" onClick={() => viewExam(exam)}>
                          <Icon className="ti ti-eye" />
                          <span>View Details</span>
                        </button>
                        <button type="button" className="kebab-dropdown-item report-action" onClick={() => viewAttempts(exam)}>
                          <Icon className="ti ti-bar-chart" />
                          <span>View Attempts</span>
                        </button>
                        <button type="button" className="kebab-dropdown-item edit-action" onClick={() => editExam(exam)}>
                          <Icon className="ti ti-pencil" />
                          <span>Edit Exam</span>
                        </button>
                        <button type="button" className="kebab-dropdown-item duplicate-action" onClick={() => duplicateExam(exam)}>
                          <Icon className="ti ti-files" />
                          <span>Duplicate Exam</span>
                        </button>
                        <button type="button" className="kebab-dropdown-item delete-action" onClick={() => { setExamToDelete(exam); setActiveKebabId(null); }}>
                          <Icon className="ti ti-trash" />
                          <span>Delete Exam</span>
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          )}
        </table>

        {!isLoading && filteredExams.length === 0 ? (
          <div className="exam-empty-state">
            <Icon className="ti ti-list" />
            <h3>No exams found</h3>
            {searchQuery || filterStatus ? (
              <p>Try adjusting your search criteria or <button type="button" className="inline-link" onClick={() => { setSearchQuery(''); setFilterStatus(''); }}>clear all filters</button></p>
            ) : (
              <p><button type="button" className="inline-link" onClick={() => navigate('/exam-creation-wizard')}>Create your first exam</button> to get started</p>
            )}
          </div>
        ) : null}

        <div className="pagination-container">
          <div className="pagination-info">
            <span>Showing {showingStart} to {showingEnd} of {filteredExams.length} exams</span>
            <select className="page-size-select" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setCurrentPage(1); }}>
              <option value={10}>Show 10</option>
              <option value={20}>Show 20</option>
              <option value={50}>Show 50</option>
              <option value={100}>Show 100</option>
            </select>
          </div>
          <div className="pagination-controls">
            <button type="button" className="pagination-btn" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={safeCurrentPage === 1}>
              <Icon className="ti ti-angle-left" /> Previous
            </button>
            {pageNumbers.map((page) => (
              <button key={page} type="button" className={`pagination-btn ${page === safeCurrentPage ? 'active' : ''}`} onClick={() => setCurrentPage(page)}>
                {page}
              </button>
            ))}
            <button type="button" className="pagination-btn" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={safeCurrentPage === totalPages}>
              Next <Icon className="ti ti-angle-right" />
            </button>
          </div>
        </div>
      </div>

      <div className={`legacy-modal-backdrop ${Boolean(selectedExam) ? 'active' : ''}`} onClick={() => setSelectedExam(null)}>
        <div className="legacy-modal-dialog exam-view-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
          <div className="legacy-modal-header">
            <h3><Icon className="ti ti-eye" /> Exam Details</h3>
            <button type="button" className="legacy-modal-close" onClick={() => setSelectedExam(null)}>
              <Icon className="ti ti-close" />
            </button>
          </div>
          <div className="legacy-modal-body">
            {selectedExam ? (
              <>
                <div className="exam-view-header">
                  <div className="exam-view-copy">
                    <h3>{selectedExam.title}</h3>
                    <p>{selectedExam.brief}</p>
                    <p className="exam-view-meta"><strong>Exam ID:</strong> {selectedExam.displayKey} | <strong>Created:</strong> {formatDate(selectedExam.createdOn)}</p>
                  </div>
                  <div className="exam-view-status">
                    <span className={`status-badge ${getStatusClass(selectedExam.status)} larger`}>{getStatusLabel(selectedExam.status)}</span>
                  </div>
                </div>

                <div className="exam-view-stats">
                  <div className="exam-view-stat"><div className="value">{selectedExam.duration}</div><div className="label">Minutes</div></div>
                  <div className="exam-view-stat"><div className="value green">{selectedExam.totalQuestions}</div><div className="label">Questions</div></div>
                  <div className="exam-view-stat"><div className="value blue">{selectedExam.numberOfSections}</div><div className="label">Sections</div></div>
                  <div className="exam-view-stat"><div className="value orange">{selectedExam.challengeQuestionAllowed ? 'Yes' : 'No'}</div><div className="label">Challenges</div></div>
                </div>

                <div className="exam-section-block">
                  <h5><Icon className="ti ti-layout" /> Exam Sections</h5>
                  {(selectedExam.sectionsData || []).map((section) => (
                    <div key={`${selectedExam.id}-${section.order}`} className="exam-section-card">
                      <div className="exam-section-main">
                        <div className="exam-section-copy">
                          <h6><span className="section-order-pill">{section.order}</span>{section.name}</h6>
                          <div className="exam-section-meta">
                            <Icon className="ti ti-clock" /> {section.duration} min
                            <span>|</span>
                            <Icon className="ti ti-help-alt" /> {section.totalQuestions} questions
                            <span>|</span>
                            <Icon className="ti ti-timer" /> {section.enableSectionWiseTimer ? 'Section Timer Enabled' : 'No Section Timer'}
                          </div>
                        </div>
                        <div className="exam-section-action">
                          <button type="button" className="section-view-btn" onClick={() => showToast('info', 'Section Questions', `Section has ${section.questions.length} questions (IDs: ${section.questions.map((question) => question.qi).join(', ')})`)}>
                            <Icon className="ti ti-eye" /> View Questions ({section.questions.length})
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {selectedExam.specialTerms ? (
                  <div className="exam-terms-block">
                    <h5><Icon className="ti ti-info" /> Special Terms & Conditions</h5>
                    <div className="exam-terms-box">{selectedExam.specialTerms.replace(/<[^>]+>/g, ' ')}</div>
                  </div>
                ) : null}

                <div className="exam-settings-block">
                  <h5><Icon className="ti ti-settings" /> Exam Settings</h5>
                  <table className="exam-settings-table">
                    <tbody>
                      <tr><td>Switch Sections Allowed:</td><td>{selectedExam.switchSectionsAllowed ? 'Yes' : 'No'}</td></tr>
                      <tr><td>Challenge Questions Allowed:</td><td>{selectedExam.challengeQuestionAllowed ? 'Yes' : 'No'}</td></tr>
                      <tr><td>Marking Scheme:</td><td>{getMarkingSchemeLabel(selectedExam.markingSchemeOverall)}</td></tr>
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </div>
          <div className="legacy-modal-footer">
            <button type="button" className="legacy-btn legacy-btn-success" onClick={() => selectedExam && editExam(selectedExam)}>
              <Icon className="ti ti-pencil" /> Edit Exam
            </button>
            <button type="button" className="legacy-btn legacy-btn-default exam-duplicate-btn" onClick={() => selectedExam && duplicateExam(selectedExam)}>
              <Icon className="ti ti-files" /> Duplicate
            </button>
            <button type="button" className="legacy-btn legacy-btn-default" onClick={() => setSelectedExam(null)}>
              <Icon className="ti ti-close" /> Close
            </button>
          </div>
        </div>
      </div>

      <div className={`legacy-modal-backdrop ${Boolean(examToDelete) ? 'active' : ''}`} onClick={() => setExamToDelete(null)}>
        <div className="legacy-modal-dialog legacy-confirm" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
          <div className="legacy-modal-header legacy-danger-header">
            <h3><Icon className="ti ti-alert" /> Confirm Delete</h3>
            <button type="button" className="legacy-modal-close" onClick={() => setExamToDelete(null)}>
              <Icon className="ti ti-close" />
            </button>
          </div>
          <div className="legacy-modal-body">
            {examToDelete ? (
              <div className="exam-delete-copy">
                <div className="exam-delete-icon"><Icon className="ti ti-alert" /></div>
                <div>
                  <h4>Delete "{examToDelete.title}"?</h4>
                  <p>Are you sure you want to delete the exam "{examToDelete.title}"? This action cannot be undone.</p>
                </div>
              </div>
            ) : null}
          </div>
          <div className="legacy-modal-footer">
            <button type="button" className="legacy-btn legacy-btn-default" onClick={() => setExamToDelete(null)}>Cancel</button>
            <button type="button" className="legacy-btn legacy-btn-danger" onClick={confirmDelete}>
              <Icon className="ti ti-trash" /> Delete Exam
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
