import React, { useEffect, useMemo, useRef, useState } from 'react';
import ToastRegion from '../components/ToastRegion';
import { examsDemo } from '../data/examsDemo';
import { testSeriesDemo } from '../data/testSeriesDemo';
import Icon from '../components/Icon';

function loadAvailableExams() {
  const drafts = JSON.parse(window.localStorage.getItem('examDrafts') || '[]');
  const published = JSON.parse(window.localStorage.getItem('publishedExams') || '[]');
  const map = new Map();
  [...published, ...drafts, ...examsDemo].forEach((exam) => {
    if (!map.has(exam.id)) map.set(exam.id, normalizeExam(exam));
  });
  return [...map.values()];
}

function loadSeries() {
  const stored = window.localStorage.getItem('testSeriesList');
  if (!stored) return testSeriesDemo.map(normalizeSeries);
  try {
    return JSON.parse(stored).map(normalizeSeries);
  } catch (error) {
    return testSeriesDemo.map(normalizeSeries);
  }
}

function normalizeExam(exam) {
  return {
    ...exam,
    title: exam.title || exam.name || 'Untitled Exam',
    brief: exam.brief || exam.description || '',
    duration: exam.duration || exam.totalTime || 180,
    totalQuestions: exam.totalQuestions || exam.questions?.length || 60,
    numberOfSections: exam.numberOfSections || exam.sectionsData?.length || 1,
  };
}

function normalizeSeries(series) {
  return {
    ...series,
    id: series.id || Date.now(),
    name: series.name || 'Untitled Test Series',
    description: series.description || '',
    status: Number(series.status) === 1 ? 1 : 0,
    exams: series.exams || [],
    createdAt: series.createdAt || new Date().toISOString(),
    updatedAt: series.updatedAt || new Date().toISOString(),
  };
}

function getPageNumbers(currentPage, totalPages) {
  const pages = [];
  for (let page = 1; page <= totalPages; page += 1) pages.push(page);
  return pages;
}

function sortIcon(column, activeColumn, isReverse) {
  if (activeColumn !== column) return 'ti-arrows-vertical';
  return isReverse ? 'ti-arrow-down' : 'ti-arrow-up';
}

function getFreeExamsCount(series) {
  return series.exams.filter((exam) => exam.accessType === 'free').length;
}

function getPremiumExamsCount(series) {
  return series.exams.filter((exam) => exam.accessType === 'premium').length;
}

function sortSeries(rows, sortColumn, sortReverse) {
  return [...rows].sort((left, right) => {
    let a = '';
    let b = '';

    if (sortColumn === 'name') {
      a = left.name.toLowerCase();
      b = right.name.toLowerCase();
    } else if (sortColumn === 'examCount') {
      a = left.exams.length;
      b = right.exams.length;
    } else if (sortColumn === 'status') {
      a = Number(left.status);
      b = Number(right.status);
    }

    if (a < b) return sortReverse ? 1 : -1;
    if (a > b) return sortReverse ? -1 : 1;
    return 0;
  });
}

export default function TestSeriesListPage() {
  const [allExams] = useState(() => loadAvailableExams());
  const [seriesList, setSeriesList] = useState(() => loadSeries());
  const [searchQuery, setSearchQuery] = useState('');
  const [sortColumn, setSortColumn] = useState('name');
  const [sortReverse, setSortReverse] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [activeKebabId, setActiveKebabId] = useState(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [editingSeries, setEditingSeries] = useState(null);
  const [seriesToDelete, setSeriesToDelete] = useState(null);
  const [selectedExamsMap, setSelectedExamsMap] = useState({});
  const [examSearchQuery, setExamSearchQuery] = useState('');
  const [examCurrentPage, setExamCurrentPage] = useState(1);
  const [toasts, setToasts] = useState([]);
  const [formState, setFormState] = useState({ name: '', description: '', status: 1 });
  const [isLoading, setIsLoading] = useState(true);
  const kebabRef = useRef(null);
  const toastIdRef = useRef(0);

  useEffect(() => {
    const closeMenus = (event) => {
      if (kebabRef.current && !kebabRef.current.contains(event.target)) setActiveKebabId(null);
    };
    document.addEventListener('click', closeMenus);
    return () => document.removeEventListener('click', closeMenus);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setIsLoading(false), 700);
    return () => window.clearTimeout(t);
  }, []);

  function showToast(type, title, message) {
    const id = toastIdRef.current + 1;
    toastIdRef.current = id;
    setToasts((current) => [...current, { id, type, title, message }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 5000);
  }

  function persist(next) {
    const normalized = next.map(normalizeSeries);
    setSeriesList(normalized);
    window.localStorage.setItem('testSeriesList', JSON.stringify(normalized));
  }

  function handleSort(column) {
    setCurrentPage(1);
    if (sortColumn === column) {
      setSortReverse((current) => !current);
      return;
    }
    setSortColumn(column);
    setSortReverse(false);
  }

  function openCreateModal(series = null) {
    if (series) {
      setEditingSeries(series);
      setFormState({ name: series.name, description: series.description, status: series.status });
      const selected = {};
      series.exams.forEach((examInfo) => {
        const exam = allExams.find((entry) => entry.id === examInfo.examId);
        if (exam) selected[exam.id] = { exam, accessType: examInfo.accessType };
      });
      setSelectedExamsMap(selected);
    } else {
      setEditingSeries(null);
      setFormState({ name: '', description: '', status: 1 });
      setSelectedExamsMap({});
    }
    setExamSearchQuery('');
    setExamCurrentPage(1);
    setCreateModalOpen(true);
    setActiveKebabId(null);
  }

  function closeCreateModal() {
    setCreateModalOpen(false);
    setEditingSeries(null);
    setSelectedExamsMap({});
    setExamSearchQuery('');
    setExamCurrentPage(1);
  }

  function toggleExamSelection(exam) {
    setSelectedExamsMap((current) => {
      if (current[exam.id]) {
        const next = { ...current };
        delete next[exam.id];
        return next;
      }
      return { ...current, [exam.id]: { exam, accessType: 'premium' } };
    });
  }

  function setExamAccessType(exam, accessType) {
    setSelectedExamsMap((current) => {
      if (!current[exam.id]) return current;
      return { ...current, [exam.id]: { ...current[exam.id], accessType } };
    });
  }

  function saveTestSeries() {
    if (!formState.name.trim() || Object.keys(selectedExamsMap).length === 0) {
      showToast('info', 'Notification', 'Please fill in all required fields and select at least one exam.');
      return;
    }

    const payload = normalizeSeries({
      id: editingSeries?.id || Date.now(),
      name: formState.name.trim(),
      description: formState.description,
      status: Number(formState.status),
      exams: Object.values(selectedExamsMap).map((item) => ({
        examId: item.exam.id,
        examTitle: item.exam.title,
        accessType: item.accessType,
      })),
      createdAt: editingSeries?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const next = editingSeries
      ? seriesList.map((series) => (series.id === editingSeries.id ? payload : series))
      : [...seriesList, payload];

    persist(next);
    closeCreateModal();
    showToast('success', 'Success', editingSeries ? 'Test series updated successfully!' : 'Test series created successfully!');
  }

  function deleteSeries(series) {
    setSeriesToDelete(series);
    setConfirmModalOpen(true);
    setActiveKebabId(null);
  }

  function confirmDelete() {
    persist(seriesList.filter((series) => series.id !== seriesToDelete.id));
    setConfirmModalOpen(false);
    setSeriesToDelete(null);
    showToast('success', 'Success', 'Test series deleted successfully!');
  }

  const filteredSeries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = query
      ? seriesList.filter((series) => [series.name, series.description].some((value) => String(value || '').toLowerCase().includes(query)))
      : seriesList;
    return sortSeries(filtered, sortColumn, sortReverse);
  }, [seriesList, searchQuery, sortColumn, sortReverse]);

  const totalSeries = filteredSeries.length;
  const totalPages = Math.max(1, Math.ceil(totalSeries / pageSize));
  const page = Math.min(currentPage, totalPages);
  const startIndex = totalSeries === 0 ? 0 : (page - 1) * pageSize;
  const paginatedSeries = filteredSeries.slice(startIndex, startIndex + pageSize);

  const filteredAvailableExams = useMemo(() => {
    const query = examSearchQuery.trim().toLowerCase();
    if (!query) return allExams;
    return allExams.filter((exam) => [exam.title, exam.brief].some((value) => String(value || '').toLowerCase().includes(query)));
  }, [allExams, examSearchQuery]);

  const examPageSize = 6;
  const examTotalPages = Math.max(1, Math.ceil(filteredAvailableExams.length / examPageSize));
  const visibleExamPage = Math.min(examCurrentPage, examTotalPages);
  const examStart = (visibleExamPage - 1) * examPageSize;
  const paginatedExams = filteredAvailableExams.slice(examStart, examStart + examPageSize);
  const selectedExamItems = Object.values(selectedExamsMap);

  return (
    <section className="test-series-list-page data-table-page">
      <ToastRegion toasts={toasts} onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />

      <div className="page-header-section">
        <div className="page-header-title-group">
          <span className="page-header-icon-box"><Icon className="fa fa-tasks" /></span>
          <div>
            <h2>Test Series Management</h2>
            <p>Manage grouped exam collections and assign free or premium access per exam.</p>
          </div>
        </div>
        <button type="button" className="create-test-series-btn" onClick={() => openCreateModal()}>
          <Icon className="ti ti-plus" /> Create Test Series
        </button>
      </div>

      <div className="filter-bar">
        <div className="search-wrapper">
          <Icon className={`ti ${searchQuery ? 'ti-close' : 'ti-search'}`} onClick={() => setSearchQuery('')} />
          <input
            type="text"
            className="search-input"
            placeholder="Search test series by name or description..."
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setCurrentPage(1);
            }}
          />
        </div>
      </div>

      {totalSeries > 0 ? (
        <div className="students-table-container">
          <table className={`students-table ${isLoading ? 'thead-loading' : ''}`}>
            <thead>
              <tr>
                <th className={`sortable ${sortColumn === 'name' ? 'active' : ''}`} onClick={() => handleSort('name')}>
                  Test Series Name <Icon className={`sort-icon ti ${sortIcon('name', sortColumn, sortReverse)}`} />
                </th>
                <th className={`sortable center-align ${sortColumn === 'examCount' ? 'active' : ''}`} onClick={() => handleSort('examCount')}>
                  Total Exams <Icon className={`sort-icon ti ${sortIcon('examCount', sortColumn, sortReverse)}`} />
                </th>
                <th className="center-align">Access Type</th>
                <th className={`sortable center-align ${sortColumn === 'status' ? 'active' : ''}`} onClick={() => handleSort('status')}>
                  Status <Icon className={`sort-icon ti ${sortIcon('status', sortColumn, sortReverse)}`} />
                </th>
                <th className="center-align actions-column">Actions</th>
              </tr>
            </thead>
            {isLoading ? (
              <tbody>
                {Array.from({ length: 8 }, (_, i) => (
                  <tr key={`sk-${i}`}>
                    {Array.from({ length: 5 }, (_, j) => (
                      <td key={j}><div className="table-skeleton medium" /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ) : (
            <tbody>
              {paginatedSeries.map((series) => (
                <tr key={series.id} className={activeKebabId === series.id ? 'row-active-menu' : ''}>
                  <td>
                    <div className="series-name">{series.name}</div>
                    {series.description ? <div className="series-description">{series.description}</div> : null}
                  </td>
                  <td className="center-align">
                    <span className="exam-count-badge">{series.exams.length} Exams</span>
                  </td>
                  <td className="center-align">
                    <div className="access-badges">
                      {getFreeExamsCount(series) > 0 ? <span className="access-badge free">{getFreeExamsCount(series)} Free</span> : null}
                      {getPremiumExamsCount(series) > 0 ? <span className="access-badge premium">{getPremiumExamsCount(series)} Premium</span> : null}
                    </div>
                  </td>
                  <td className="center-align">
                    <span className={`status-badge ${series.status === 1 ? 'active' : 'draft'}`}>
                      {series.status === 1 ? 'Active' : 'Draft'}
                    </span>
                  </td>
                  <td className={`center-align actions-column ${activeKebabId === series.id ? 'cell-active-menu' : ''}`}>
                    <div className="kebab-menu-container" ref={kebabRef}>
                      <button
                        type="button"
                        className="kebab-button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setActiveKebabId((current) => (current === series.id ? null : series.id));
                        }}
                      >
                        <Icon className="ti ti-more-alt" />
                      </button>
                      <div className={`kebab-dropdown ${activeKebabId === series.id ? 'active' : ''}`}>
                        <button type="button" className="kebab-dropdown-item edit-action" onClick={() => openCreateModal(series)}>
                          <Icon className="ti ti-pencil" />
                          <span>Edit Series</span>
                        </button>
                        <button type="button" className="kebab-dropdown-item delete-action" onClick={() => deleteSeries(series)}>
                          <Icon className="ti ti-trash" />
                          <span>Delete Series</span>
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            )}
          </table>

          <div className="pagination-container">
            <div className="pagination-info">
              <span>Showing {startIndex + 1} to {Math.min(startIndex + pageSize, totalSeries)} of {totalSeries} test series</span>
              <select
                className="page-size-select"
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setCurrentPage(1);
                }}
              >
                {[10, 20, 50, 200].map((size) => <option key={size} value={size}>Show {size}</option>)}
              </select>
            </div>
            <div className="pagination-controls">
              <button type="button" className="pagination-btn" disabled={page === 1} onClick={() => setCurrentPage((current) => Math.max(1, current - 1))}>
                <Icon className="ti ti-angle-left" /> Previous
              </button>
              {getPageNumbers(page, totalPages).map((pageNumber) => (
                <button key={pageNumber} type="button" className={`pagination-btn ${pageNumber === page ? 'active' : ''}`} onClick={() => setCurrentPage(pageNumber)}>
                  {pageNumber}
                </button>
              ))}
              <button type="button" className="pagination-btn" disabled={page === totalPages} onClick={() => setCurrentPage((current) => Math.min(totalPages, current + 1))}>
                Next <Icon className="ti ti-angle-right" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <Icon className="ti ti-clipboard" />
          <h3>No Test Series Found</h3>
          <p>Create your first test series to get started</p>
          <button type="button" className="btn btn-success" onClick={() => openCreateModal()}>
            <Icon className="ti ti-plus" /> Create Test Series
          </button>
        </div>
      )}

      {createModalOpen ? (
        <CreateSeriesModal
          editMode={Boolean(editingSeries)}
          formState={formState}
          setFormState={setFormState}
          selectedExamItems={selectedExamItems}
          selectedExamsMap={selectedExamsMap}
          exams={paginatedExams}
          examSearchQuery={examSearchQuery}
          setExamSearchQuery={(value) => {
            setExamSearchQuery(value);
            setExamCurrentPage(1);
          }}
          filteredAvailableExamsCount={filteredAvailableExams.length}
          examPage={visibleExamPage}
          examTotalPages={examTotalPages}
          examStart={examStart}
          onExamPageChange={setExamCurrentPage}
          onToggleExam={toggleExamSelection}
          onSetAccessType={setExamAccessType}
          onClose={closeCreateModal}
          onSave={saveTestSeries}
        />
      ) : null}

      {confirmModalOpen && seriesToDelete ? (
        <ConfirmDeleteModal
          message={`Are you sure you want to delete "${seriesToDelete.name}"? This action cannot be undone.`}
          onClose={() => {
            setConfirmModalOpen(false);
            setSeriesToDelete(null);
          }}
          onConfirm={confirmDelete}
        />
      ) : null}
    </section>
  );
}

function CreateSeriesModal({
  editMode,
  formState,
  setFormState,
  selectedExamItems,
  selectedExamsMap,
  exams,
  examSearchQuery,
  setExamSearchQuery,
  filteredAvailableExamsCount,
  examPage,
  examTotalPages,
  examStart,
  onExamPageChange,
  onToggleExam,
  onSetAccessType,
  onClose,
  onSave,
}) {
  const selectedFreeCount = selectedExamItems.filter((item) => item.accessType === 'free').length;
  const selectedPremiumCount = selectedExamItems.filter((item) => item.accessType === 'premium').length;
  const canSave = formState.name.trim() && selectedExamItems.length > 0;

  useEffect(() => {
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="crispr-modal-backdrop active"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="crispr-modal-dialog test-series-create-dialog form-modal" role="dialog" aria-modal="true">
        <div className="crispr-modal-header">
          <h3>{editMode ? 'Edit Test Series' : 'Create Test Series'}</h3>
          <button type="button" className="crispr-modal-close" onClick={onClose}><Icon className="ti ti-close" /></button>
        </div>
        <div className="crispr-modal-body">
          <div className="asset-form-section">
            <div className="asset-form-section-title"><Icon className="ti ti-info-circle" /> Basic Information</div>
            <div className="asset-form-grid basic-grid">
              <label className="field-cell">
                <div className="float-field">
                  <input
                    type="text"
                    className="float-control"
                    placeholder=" "
                    value={formState.name}
                    onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))}
                  />
                  <span className="float-label">Test Series Name <span className="req">*</span></span>
                </div>
              </label>
              <label className="field-cell">
                <div className="float-field float-always">
                  <select
                    className="float-control"
                    value={formState.status}
                    onChange={(event) => setFormState((current) => ({ ...current, status: Number(event.target.value) }))}
                  >
                    <option value={1}>Active</option>
                    <option value={0}>Draft</option>
                  </select>
                  <span className="float-label">Status</span>
                </div>
              </label>
              <label className="field-cell full-span">
                <div className="float-field float-textarea">
                  <textarea
                    className="float-control"
                    placeholder=" "
                    value={formState.description}
                    onChange={(event) => setFormState((current) => ({ ...current, description: event.target.value }))}
                  />
                  <span className="float-label">Description</span>
                </div>
              </label>
            </div>
          </div>

          <div className="asset-form-section">
            <div className="form-section-header">
              <div className="asset-form-section-title"><Icon className="ti ti-list-check" /> Select Exams <span className="req">*</span></div>
              {selectedExamItems.length > 0 ? (
                <div className="selected-exams-summary">
                  <SummaryItem label="Selected:" value={selectedExamItems.length} tone="total" />
                  <div className="summary-divider" />
                  <SummaryItem label="Free:" value={selectedFreeCount} tone="free" />
                  <div className="summary-divider" />
                  <SummaryItem label="Premium:" value={selectedPremiumCount} tone="premium" />
                </div>
              ) : null}
            </div>

            <div className="search-box">
              <div className="input-group">
                <span className="input-group-addon"><Icon className="ti ti-search" /></span>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Search exams by name..."
                  value={examSearchQuery}
                  onChange={(event) => setExamSearchQuery(event.target.value)}
                />
                {examSearchQuery ? (
                  <button type="button" className="input-group-clear" onClick={() => setExamSearchQuery('')}>
                    <Icon className="ti ti-close" />
                  </button>
                ) : null}
              </div>
            </div>

            {exams.length > 0 ? (
              <div className="exam-grid">
                {exams.map((exam) => {
                  const selected = selectedExamsMap[exam.id];
                  return (
                    <div key={exam.id} className={`exam-card ${selected ? 'selected' : ''}`} onClick={() => onToggleExam(exam)}>
                      <div className="exam-card-header">
                        <input
                          type="checkbox"
                          className="exam-checkbox"
                          checked={Boolean(selected)}
                          onChange={() => onToggleExam(exam)}
                          onClick={(event) => event.stopPropagation()}
                        />
                        <div className="exam-info">
                          <div className="exam-title">{exam.title}</div>
                          <div className="exam-meta">
                            <span><Icon className="ti ti-time" /> {exam.duration} min</span>
                            <span><Icon className="ti ti-help" /> {exam.totalQuestions} questions</span>
                            <span><Icon className="ti ti-layout-grid2" /> {exam.numberOfSections} sections</span>
                          </div>
                        </div>
                      </div>

                      {selected ? (
                        <div className="access-type-selector">
                          <div className="radio-group">
                            {['free', 'premium'].map((accessType) => (
                              <label key={accessType} className="radio-option" onClick={(event) => event.stopPropagation()}>
                                <input
                                  type="radio"
                                  name={`access_${exam.id}`}
                                  value={accessType}
                                  checked={selected.accessType === accessType}
                                  onChange={() => onSetAccessType(exam, accessType)}
                                />
                                {accessType === 'free' ? 'Free Access' : 'Premium Access'}
                              </label>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="modal-empty-state">
                <Icon className="ti ti-info-alt" />
                <p>{examSearchQuery ? `No exams found matching "${examSearchQuery}"` : 'No exams available'}</p>
              </div>
            )}

            {examTotalPages > 1 ? (
              <div className="exam-pagination">
                <button type="button" className="exam-pagination-btn" disabled={examPage === 1} onClick={() => onExamPageChange((current) => Math.max(1, current - 1))}>
                  <Icon className="ti ti-angle-left" />
                </button>
                {getPageNumbers(examPage, examTotalPages).map((page) => (
                  <button key={page} type="button" className={`exam-pagination-btn ${examPage === page ? 'active' : ''}`} onClick={() => onExamPageChange(page)}>
                    {page}
                  </button>
                ))}
                <button type="button" className="exam-pagination-btn" disabled={examPage === examTotalPages} onClick={() => onExamPageChange((current) => Math.min(examTotalPages, current + 1))}>
                  <Icon className="ti ti-angle-right" />
                </button>
                <span className="exam-pagination-info">
                  Showing {examStart + 1}-{Math.min(examStart + 6, filteredAvailableExamsCount)} of {filteredAvailableExamsCount} exams
                </span>
              </div>
            ) : null}
          </div>
        </div>
        <div className="legacy-modal-footer">
          <button type="button" className="legacy-btn legacy-btn-default" onClick={onClose}>Cancel</button>
          <button type="button" className="legacy-btn legacy-btn-success" disabled={!canSave} onClick={onSave}>
            {editMode ? 'Update' : 'Create'} Test Series
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryItem({ label, value, tone }) {
  return (
    <div className="summary-item">
      <span className="summary-label">{label}</span>
      <span className={`summary-badge ${tone}`}>{value}</span>
    </div>
  );
}

function ConfirmDeleteModal({ message, onClose, onConfirm }) {
  return (
    <div className="crispr-modal-backdrop active" role="presentation" onClick={onClose}>
      <div className="crispr-modal-dialog confirm-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="crispr-modal-header danger-header">
          <h3><Icon className="ti ti-alert" /> Confirm Delete</h3>
          <button type="button" className="crispr-modal-close" onClick={onClose}><Icon className="ti ti-close" /></button>
        </div>
        <div className="crispr-modal-body">
          <p className="confirm-message">{message}</p>
        </div>
        <div className="crispr-modal-footer">
          <button type="button" className="btn btn-default" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-danger" onClick={onConfirm}>
            <Icon className="ti ti-trash" /> Delete
          </button>
        </div>
      </div>
    </div>
  );
}
