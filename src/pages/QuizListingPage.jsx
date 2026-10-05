import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ToastRegion from '../components/ToastRegion';
import FilterDropdown from '../components/FilterDropdown';
import { Can, usePermission } from '../lib/userStore';
import { PERMS } from '../lib/permissions';
import { draftQuizzesDemo, publishedQuizzesDemo, withSampleAttempts } from '../data/quizzesDemo';
import Icon from '../components/Icon';

function getQuizzesFromStorage() {
  const published = window.localStorage.getItem('publishedQuizzes');
  const drafts = window.localStorage.getItem('quizDrafts');
  const publishedQuizzes = published ? JSON.parse(published) : publishedQuizzesDemo;
  const draftQuizzes = drafts ? JSON.parse(drafts) : draftQuizzesDemo;
  return withSampleAttempts([...publishedQuizzes, ...draftQuizzes]).map(normalizeQuiz);
}

function normalizeQuiz(quiz, index = 0) {
  const createdAt = quiz.createdAt || (quiz.createdOn ? quiz.createdOn * 1000 : Date.now() - index * 86400000);
  const totalQuestions = quiz.totalQuestions || quiz.questions?.length || Math.max(1, Math.round((quiz.maximumMarks || 50) / 2));

  return {
    ...quiz,
    id: quiz.id || `quiz-${index + 1}`,
    title: quiz.title || 'Untitled Quiz',
    description: quiz.description || '',
    status: quiz.status || 'draft',
    totalQuestions,
    duration: quiz.duration || 30,
    maximumMarks: quiz.maximumMarks || totalQuestions * 2,
    markingScheme: quiz.markingScheme || 'standard',
    startDateTime: quiz.startDateTime || quiz.startTime || null,
    endDateTime: quiz.endDateTime || quiz.endTime || null,
    createdAt,
    createdBy: quiz.createdBy || 'Admin',
    url: quiz.url || `${window.location.origin}/quiz/${quiz.id || index + 1}`,
    batches: quiz.batches?.length ? quiz.batches : ['IAT Foundation', 'IAT Advanced'],
    attempts: quiz.attempts || [],
  };
}

function formatDate(timestamp) {
  if (!timestamp) return 'N/A';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(value) {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })} ${date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`;
}

function getPageNumbers(currentPage, totalPages) {
  const pages = [];
  const maxPages = 5;
  let start = Math.max(1, currentPage - Math.floor(maxPages / 2));
  let end = Math.min(totalPages, start + maxPages - 1);
  if (end - start < maxPages - 1) start = Math.max(1, end - maxPages + 1);
  for (let page = start; page <= end; page += 1) pages.push(page);
  return pages;
}

function sortIcon(column, activeColumn, isReverse) {
  if (activeColumn !== column) return 'ti-arrows-vertical';
  return isReverse ? 'ti-arrow-down' : 'ti-arrow-up';
}

function sortQuizzes(rows, sortColumn, sortReverse) {
  if (!sortColumn) return rows;
  const numericColumns = ['totalQuestions', 'duration', 'maximumMarks', 'attemptCount', 'createdAt'];
  return [...rows].sort((left, right) => {
    let a = sortColumn === 'attemptCount' ? left.attempts?.length || 0 : left[sortColumn];
    let b = sortColumn === 'attemptCount' ? right.attempts?.length || 0 : right[sortColumn];

    if (sortColumn === 'createdAt') {
      a = new Date(a || 0).getTime();
      b = new Date(b || 0).getTime();
    }

    if (numericColumns.includes(sortColumn)) {
      a = Number(a) || 0;
      b = Number(b) || 0;
      if (a === b) return 0;
      return sortReverse ? a - b : b - a;
    }

    a = String(a || '').toLowerCase();
    b = String(b || '').toLowerCase();
    if (a < b) return sortReverse ? 1 : -1;
    if (a > b) return sortReverse ? -1 : 1;
    return 0;
  });
}

function getAttemptStats(attempts = []) {
  return {
    total: attempts.length,
    completed: attempts.filter((attempt) => attempt.status === 'completed').length,
    inProgress: attempts.filter((attempt) => attempt.status !== 'completed').length,
  };
}

export default function QuizListingPage() {
  const { can } = usePermission();
  const navigate = useNavigate();
  const [allQuizzes, setAllQuizzes] = useState(() => getQuizzesFromStorage());
  const [currentTab, setCurrentTab] = useState('all');
  const [quizSearchQuery, setQuizSearchQuery] = useState('');
  const [sortColumn, setSortColumn] = useState('');
  const [sortReverse, setSortReverse] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [activeKebabId, setActiveKebabId] = useState(null);
  const [selectedQuiz, setSelectedQuiz] = useState(null);
  const [quizToDelete, setQuizToDelete] = useState(null);
  const [quizToPublish, setQuizToPublish] = useState(null);
  const [attemptsQuiz, setAttemptsQuiz] = useState(null);
  const [attemptSearchQuery, setAttemptSearchQuery] = useState('');
  const [attemptsPage, setAttemptsPage] = useState(1);
  const [toasts, setToasts] = useState([]);
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

  function persistQuizzes(updated) {
    const normalized = updated.map(normalizeQuiz);
    setAllQuizzes(normalized);
    window.localStorage.setItem('publishedQuizzes', JSON.stringify(normalized.filter((quiz) => quiz.status === 'published')));
    window.localStorage.setItem('quizDrafts', JSON.stringify(normalized.filter((quiz) => quiz.status === 'draft')));
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

  function openAttempts(quiz) {
    setAttemptsQuiz(quiz);
    setAttemptSearchQuery('');
    setAttemptsPage(1);
  }

  function viewReport(quiz) {
    window.localStorage.setItem('reportQuizData', JSON.stringify(quiz));
    navigate(`/quiz-attempt-report?quiz=${quiz.id}`);
  }

  function confirmDelete() {
    const updated = allQuizzes.filter((quiz) => quiz.id !== quizToDelete.id);
    persistQuizzes(updated);
    showToast('success', 'Quiz Deleted', 'Quiz deleted successfully.');
    setQuizToDelete(null);
  }

  function confirmPublish() {
    const updated = allQuizzes.map((quiz) => (quiz.id === quizToPublish.id ? { ...quiz, status: 'published' } : quiz));
    persistQuizzes(updated);
    showToast('success', 'Quiz Published', 'Quiz published successfully.');
    setQuizToPublish(null);
  }

  const filteredQuizzes = useMemo(() => {
    const tabbed = currentTab === 'all' ? allQuizzes : allQuizzes.filter((quiz) => quiz.status === currentTab);
    const query = quizSearchQuery.trim().toLowerCase();
    const searched = query
      ? tabbed.filter((quiz) => [quiz.title, quiz.description].some((value) => String(value || '').toLowerCase().includes(query)))
      : tabbed;
    return sortQuizzes(searched, sortColumn, sortReverse);
  }, [allQuizzes, currentTab, quizSearchQuery, sortColumn, sortReverse]);

  const totalItems = filteredQuizzes.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(currentPage, totalPages);
  const startIndex = totalItems === 0 ? 0 : (page - 1) * pageSize;
  const paginatedQuizzes = filteredQuizzes.slice(startIndex, startIndex + pageSize);
  const paginationPages = getPageNumbers(page, totalPages);

  const filteredAttempts = useMemo(() => {
    const query = attemptSearchQuery.trim().toLowerCase();
    const attempts = attemptsQuiz?.attempts || [];
    if (!query) return attempts;
    return attempts.filter((attempt) => [attempt.studentName, attempt.studentEmail].some((value) => String(value || '').toLowerCase().includes(query)));
  }, [attemptSearchQuery, attemptsQuiz]);

  const attemptsPageSize = 5;
  const totalAttempts = filteredAttempts.length;
  const totalAttemptsPages = Math.max(1, Math.ceil(totalAttempts / attemptsPageSize));
  const visibleAttemptsPage = Math.min(attemptsPage, totalAttemptsPages);
  const attemptsStart = totalAttempts === 0 ? 0 : (visibleAttemptsPage - 1) * attemptsPageSize;
  const paginatedAttempts = filteredAttempts.slice(attemptsStart, attemptsStart + attemptsPageSize);
  const attemptStats = getAttemptStats(attemptsQuiz?.attempts);

  return (
    <section className="quiz-listing-page data-table-page">
      <ToastRegion toasts={toasts} onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />

      <div className="page-header-section">
        <div className="page-header-title-group">
          <span className="page-header-icon-box"><Icon className="fa fa-list-ul" /></span>
          <div>
            <h2>Quiz Listing</h2>
            <p>Manage practice quizzes, review student attempts, and publish draft quizzes.</p>
          </div>
        </div>
        <Can permission={PERMS.QUIZZES_EDIT}>
          <button type="button" className="create-quiz-button" onClick={() => navigate('/quiz-creation')}>
            <Icon className="ti ti-plus" /> Create Quiz
          </button>
        </Can>
      </div>

      {(allQuizzes.length > 0 || quizSearchQuery) ? (
        <div className="filter-bar">
          <div className="search-wrapper">
            <Icon className={`ti ${quizSearchQuery ? 'ti-close' : 'ti-search'}`} onClick={() => setQuizSearchQuery('')} />
            <input
              className="search-input"
              type="text"
              placeholder="Search quizzes by title or description..."
              value={quizSearchQuery}
              onChange={(event) => {
                setQuizSearchQuery(event.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
          <FilterDropdown
            label="All Quizzes"
            value={currentTab}
            options={[
              { value: 'all', label: 'All Quizzes' },
              { value: 'published', label: 'Published' },
              { value: 'draft', label: 'Drafts' },
            ]}
            onChange={(value) => { setCurrentTab(value); setCurrentPage(1); }}
          />
        </div>
      ) : null}

      {totalItems > 0 ? (
        <div className="students-table-container">
          <table className={`students-table quiz-list-table ${isLoading ? 'thead-loading' : ''}`}>
            <thead>
              <tr>
                <th className={`sortable ${sortColumn === 'title' ? 'active' : ''}`} onClick={() => handleSort('title')}>
                  Quiz Title <Icon className={`sort-icon ti ${sortIcon('title', sortColumn, sortReverse)}`} />
                </th>
                <th className={`sortable ${sortColumn === 'status' ? 'active' : ''}`} onClick={() => handleSort('status')}>
                  Status <Icon className={`sort-icon ti ${sortIcon('status', sortColumn, sortReverse)}`} />
                </th>
                <th className={`sortable ${sortColumn === 'totalQuestions' ? 'active' : ''}`} onClick={() => handleSort('totalQuestions')}>
                  Questions <Icon className={`sort-icon ti ${sortIcon('totalQuestions', sortColumn, sortReverse)}`} />
                </th>
                <th className={`sortable ${sortColumn === 'duration' ? 'active' : ''}`} onClick={() => handleSort('duration')}>
                  Duration <Icon className={`sort-icon ti ${sortIcon('duration', sortColumn, sortReverse)}`} />
                </th>
                <th className={`sortable ${sortColumn === 'maximumMarks' ? 'active' : ''}`} onClick={() => handleSort('maximumMarks')}>
                  Max Marks <Icon className={`sort-icon ti ${sortIcon('maximumMarks', sortColumn, sortReverse)}`} />
                </th>
                <th>Schedule</th>
                <th className={`sortable ${sortColumn === 'attemptCount' ? 'active' : ''}`} onClick={() => handleSort('attemptCount')}>
                  Attempts <Icon className={`sort-icon ti ${sortIcon('attemptCount', sortColumn, sortReverse)}`} />
                </th>
                <th className={`sortable ${sortColumn === 'createdAt' ? 'active' : ''}`} onClick={() => handleSort('createdAt')}>
                  Created <Icon className={`sort-icon ti ${sortIcon('createdAt', sortColumn, sortReverse)}`} />
                </th>
                <th className="center-align actions-column">Actions</th>
              </tr>
            </thead>
            {isLoading ? (
              <tbody>
                {Array.from({ length: 8 }, (_, i) => (
                  <tr key={`sk-${i}`}>
                    {Array.from({ length: 9 }, (_, j) => (
                      <td key={j}><div className="table-skeleton medium" /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ) : (
            <tbody>
              {paginatedQuizzes.map((quiz) => (
                <tr key={quiz.id} className={activeKebabId === quiz.id ? 'row-active-menu' : ''}>
                  <td>
                    <strong className="quiz-title">{quiz.title}</strong>
                    {quiz.description ? <div className="quiz-description-cell">{quiz.description.slice(0, 50)}{quiz.description.length > 50 ? '...' : ''}</div> : null}
                  </td>
                  <td>
                    <span className={`badge-status ${quiz.status === 'published' ? 'badge-published' : 'badge-draft'}`}>
                      {quiz.status}
                    </span>
                  </td>
                  <td>{quiz.totalQuestions}</td>
                  <td>{quiz.duration} min</td>
                  <td>{quiz.maximumMarks}</td>
                  <td className="schedule-cell">
                    <div>Start: {formatDateTime(quiz.startDateTime)}</div>
                    <div>End: {formatDateTime(quiz.endDateTime)}</div>
                  </td>
                  <td>
                    {quiz.attempts?.length ? (
                      <button type="button" className="attempts-link" onClick={() => openAttempts(quiz)}>
                        {quiz.attempts.length} Student{quiz.attempts.length > 1 ? 's' : ''}
                      </button>
                    ) : (
                      <span className="muted-table-text">No attempts</span>
                    )}
                  </td>
                  <td className="created-cell">
                    {formatDate(quiz.createdAt)}
                    <br />
                    <span>by {quiz.createdBy}</span>
                  </td>
                  <td className={`center-align actions-column ${activeKebabId === quiz.id ? 'cell-active-menu' : ''}`}>
                    <div className="kebab-menu-container" ref={kebabRef}>
                      <button
                        type="button"
                        className="kebab-button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setActiveKebabId((current) => (current === quiz.id ? null : quiz.id));
                        }}
                      >
                        <Icon className="ti ti-more-alt" />
                      </button>
                      <div className={`kebab-dropdown ${activeKebabId === quiz.id ? 'active' : ''}`}>
                        <button type="button" className="kebab-dropdown-item view-action" onClick={() => { setSelectedQuiz(quiz); setActiveKebabId(null); }}>
                          <Icon className="ti ti-eye" />
                          <span>View Details</span>
                        </button>
                        {quiz.attempts?.length ? (
                          <button type="button" className="kebab-dropdown-item report-action" onClick={() => viewReport(quiz)}>
                            <Icon className="ti ti-bar-chart" />
                            <span>View Report</span>
                          </button>
                        ) : null}
                        {quiz.status === 'draft' && can(PERMS.QUIZZES_EDIT) ? (
                          <button type="button" className="kebab-dropdown-item publish-action" onClick={() => { setQuizToPublish(quiz); setActiveKebabId(null); }}>
                            <Icon className="ti ti-check" />
                            <span>Publish Quiz</span>
                          </button>
                        ) : null}
                        {can(PERMS.QUIZZES_DELETE) && (
                          <button type="button" className="kebab-dropdown-item delete-action" onClick={() => { setQuizToDelete(quiz); setActiveKebabId(null); }}>
                            <Icon className="ti ti-trash" />
                            <span>Delete Quiz</span>
                          </button>
                        )}
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
              <span>Showing {startIndex + 1} to {Math.min(startIndex + pageSize, totalItems)} of {totalItems} entries</span>
              <select
                className="page-size-select"
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setCurrentPage(1);
                }}
              >
                <option value="10">Show 10</option>
                <option value="20">Show 20</option>
                <option value="50">Show 50</option>
                <option value="100">Show 100</option>
              </select>
            </div>
            <div className="pagination-controls">
              <button type="button" className="pagination-btn" disabled={page === 1} onClick={() => setCurrentPage((current) => Math.max(1, current - 1))}>
                <Icon className="ti ti-angle-left" /> Previous
              </button>
              {paginationPages.map((pageNumber) => (
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
          <h4>No Quizzes Found</h4>
          <p>{currentTab === 'all' ? "You haven't created any quizzes yet." : currentTab === 'published' ? "You haven't published any quizzes yet." : "You don't have any draft quizzes."}</p>
        </div>
      )}

      {selectedQuiz ? (
        <QuizDetailsModal quiz={selectedQuiz} onClose={() => setSelectedQuiz(null)} />
      ) : null}

      {quizToDelete ? (
        <ConfirmModal
          tone="danger"
          icon="ti-trash"
          title="Confirm Delete"
          heading={`Delete "${quizToDelete.title}"?`}
          body="This action cannot be undone. All quiz data and attempts will be permanently deleted."
          actionLabel="Delete Quiz"
          onClose={() => setQuizToDelete(null)}
          onConfirm={confirmDelete}
        />
      ) : null}

      {quizToPublish ? (
        <ConfirmModal
          tone="success"
          icon="ti-check"
          title="Confirm Publish"
          heading={`Publish "${quizToPublish.title}"?`}
          body="Once published, students will be able to access this quiz during the scheduled time window."
          actionLabel="Publish Quiz"
          onClose={() => setQuizToPublish(null)}
          onConfirm={confirmPublish}
        />
      ) : null}

      {attemptsQuiz ? (
        <AttemptsModal
          quiz={attemptsQuiz}
          stats={attemptStats}
          attemptSearchQuery={attemptSearchQuery}
          onSearchChange={(value) => {
            setAttemptSearchQuery(value);
            setAttemptsPage(1);
          }}
          attempts={paginatedAttempts}
          totalAttempts={totalAttempts}
          startIndex={attemptsStart}
          page={visibleAttemptsPage}
          totalPages={totalAttemptsPages}
          onPageChange={setAttemptsPage}
          onClose={() => setAttemptsQuiz(null)}
        />
      ) : null}
    </section>
  );
}

function QuizDetailsModal({ quiz, onClose }) {
  return (
    <div className="crispr-modal-backdrop active" role="presentation" onClick={onClose}>
      <div className="crispr-modal-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="crispr-modal-header">
          <h3><Icon className="ti ti-eye" /> Quiz Details</h3>
          <button type="button" className="crispr-modal-close" onClick={onClose}><Icon className="ti ti-close" /></button>
        </div>
        <div className="crispr-modal-body">
          <h4 className="quiz-modal-title">{quiz.title}</h4>
          {quiz.description ? (
            <div className="quiz-modal-description">
              <strong>Description:</strong>
              {quiz.description}
            </div>
          ) : null}
          <div className="quiz-info-grid">
            <InfoItem label="Total Questions" value={`${quiz.totalQuestions} questions`} />
            <InfoItem label="Duration" value={`${quiz.duration} minutes`} />
            <InfoItem label="Maximum Marks" value={`${quiz.maximumMarks} marks`} />
            <InfoItem label="Marking Scheme" value={quiz.markingScheme} />
            <InfoItem label="Start Date & Time" value={formatDateTime(quiz.startDateTime)} />
            <InfoItem label="End Date & Time" value={formatDateTime(quiz.endDateTime)} />
            <div className="info-item">
              <div className="info-label">Status</div>
              <div className="info-value">
                <span className={`badge-status ${quiz.status === 'published' ? 'badge-published' : 'badge-draft'}`}>{quiz.status}</span>
              </div>
            </div>
            <InfoItem label="Quiz URL" value={quiz.url} className="url-value" />
          </div>
          <div className="selected-batches">
            <div className="info-label">Selected Batches</div>
            <div className="batch-pill-row">
              {quiz.batches.map((batch) => <span key={batch} className="batch-pill">{batch}</span>)}
            </div>
          </div>
        </div>
        <div className="crispr-modal-footer">
          <button type="button" className="btn btn-default" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function InfoItem({ label, value, className = '' }) {
  return (
    <div className="info-item">
      <div className="info-label">{label}</div>
      <div className={`info-value ${className}`}>{value}</div>
    </div>
  );
}

function ConfirmModal({ tone, icon, title, heading, body, actionLabel, onClose, onConfirm }) {
  const isDanger = tone === 'danger';
  return (
    <div className="crispr-modal-backdrop active" role="presentation" onClick={onClose}>
      <div className="crispr-modal-dialog quiz-confirm-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className={`crispr-modal-header ${isDanger ? 'danger-header' : 'success-header'}`}>
          <h3><Icon className={`ti ${icon}`} /> {title}</h3>
          <button type="button" className="crispr-modal-close" onClick={onClose}><Icon className="ti ti-close" /></button>
        </div>
        <div className="crispr-modal-body">
          <div className="quiz-confirm-body">
            <div className={`quiz-confirm-icon ${isDanger ? 'danger' : 'success'}`}>
              <Icon className={`ti ${isDanger ? 'ti-alert' : 'ti-check'}`} />
            </div>
            <div>
              <h4>{heading}</h4>
              <p>{body}</p>
            </div>
          </div>
        </div>
        <div className="crispr-modal-footer">
          <button type="button" className="btn btn-default" onClick={onClose}>Cancel</button>
          <button type="button" className={`btn ${isDanger ? 'btn-danger' : 'btn-success'}`} onClick={onConfirm}>
            <Icon className={`ti ${icon}`} /> {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function AttemptsModal({ quiz, stats, attemptSearchQuery, onSearchChange, attempts, totalAttempts, startIndex, page, totalPages, onPageChange, onClose }) {
  return (
    <div className="crispr-modal-backdrop active" role="presentation" onClick={onClose}>
      <div className="crispr-modal-dialog attempts-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="crispr-modal-header">
          <h3><Icon className="ti ti-user" /> Quiz Attempts: {quiz.title}</h3>
          <button type="button" className="crispr-modal-close" onClick={onClose}><Icon className="ti ti-close" /></button>
        </div>
        <div className="crispr-modal-body">
          <div className="attempt-stats-row">
            <AttemptStat label="Total Attempts" value={stats.total} />
            <AttemptStat label="Completed" value={stats.completed} tone="completed" />
            <AttemptStat label="In Progress" value={stats.inProgress ?? 0} tone="progress" />
          </div>
          <div className="attempt-search">
            <input
              type="text"
              className="search-input"
              placeholder="Search by student name or email..."
              value={attemptSearchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </div>
          {totalAttempts > 0 ? (
            <>
              <div className="students-table-container attempts-table-container">
                <table className="students-table attempts-table">
                  <thead>
                    <tr>
                      <th>Student Name</th>
                      <th>Status</th>
                      <th>Score</th>
                      <th>Started At</th>
                      <th>Completed At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attempts.map((attempt, index) => (
                      <tr key={`${attempt.studentEmail}-${index}`}>
                        <td>
                          <strong>{attempt.studentName}</strong>
                          {attempt.studentId ? <div className="attempt-id">ID: {attempt.studentId}</div> : null}
                        </td>
                        <td>
                          <span className={`attempt-status ${attempt.status === 'completed' ? 'is-completed' : 'is-progress'}`}>
                            <span className="attempt-status-dot" />
                            {attempt.status === 'completed' ? 'Completed' : 'In Progress'}
                          </span>
                        </td>
                        <td>
                          {attempt.status === 'completed' ? (
                            <span className="score-badge">{attempt.score}/{quiz.maximumMarks} <span>({Math.round((Number(attempt.score || 0) / Number(quiz.maximumMarks || 1)) * 100)}%)</span></span>
                          ) : (
                            <span className="muted-table-text">-</span>
                          )}
                        </td>
                        <td className="attempt-date">{formatDateTime(attempt.startedAt)}</td>
                        <td className="attempt-date">{attempt.status === 'completed' ? formatDateTime(attempt.completedAt) : <span className="muted-table-text">-</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="pagination-container attempts-pagination">
                <div className="pagination-info">
                  Showing {startIndex + 1} to {Math.min(startIndex + attempts.length, totalAttempts)} of {totalAttempts} attempts
                </div>
                <div className="pagination-controls">
                  <button type="button" className="pagination-btn" disabled={page === 1} onClick={() => onPageChange((current) => Math.max(1, current - 1))}>
                    <Icon className="ti ti-angle-left" /> Previous
                  </button>
                  {getPageNumbers(page, totalPages).map((pageNumber) => (
                    <button key={pageNumber} type="button" className={`pagination-btn ${pageNumber === page ? 'active' : ''}`} onClick={() => onPageChange(pageNumber)}>
                      {pageNumber}
                    </button>
                  ))}
                  <button type="button" className="pagination-btn" disabled={page === totalPages} onClick={() => onPageChange((current) => Math.min(totalPages, current + 1))}>
                    Next <Icon className="ti ti-angle-right" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="attempts-empty-state">
              <Icon className="ti ti-search" />
              <p>No attempts found matching your search.</p>
            </div>
          )}
        </div>
        <div className="legacy-modal-footer">
          <button type="button" className="legacy-btn legacy-btn-success" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function AttemptStat({ label, value, tone = '' }) {
  return (
    <div className={`attempt-stat ${tone}`}>
      <div>{label}</div>
      <strong>{value}</strong>
    </div>
  );
}
