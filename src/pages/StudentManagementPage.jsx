import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api, apiErrorMessage } from '../lib/api';
import useDebouncedValue from '../hooks/useDebouncedValue';
import { availableCourses, demoCandidates } from '../data/candidateProfileDemo';
import ToastRegion from '../components/ToastRegion';
import FilterDropdown from '../components/FilterDropdown';
import Avatar from '../components/Avatar';
import { Can, usePermission } from '../lib/userStore';
import { PERMS } from '../lib/permissions';

// Map the API status to a badge key. Numeric: 1 = active, 0 = inactive,
// 2 = blocked. Falls back to a lowercased string for legacy/demo data.
function mapStatus(rawStatus, blocked) {
  if (blocked) return 'blocked';
  const numeric = { 0: 'inactive', 1: 'active', 2: 'blocked' };
  if (rawStatus === 0 || rawStatus === 1 || rawStatus === 2) return numeric[rawStatus];
  const str = String(rawStatus ?? '').trim().toLowerCase();
  if (str in numeric) return numeric[str];
  return str || 'active';
}

function normalizeCandidate(candidate) {
  return {
    id: candidate.candidateKey || candidate.id,
    candidateKey: candidate.candidateKey || candidate.id,
    name: candidate.name || 'Unknown',
    email: candidate.email || '',
    mobile: candidate.mobile || candidate.registeredMobile || candidate.communicationMobile || '',
    avatar: candidate.photo || candidate.avatar || null,
    status: mapStatus(candidate.status, candidate.blocked),
    blocked: Boolean(candidate.blocked) || candidate.status === 2,
    joinedDate: candidate.joinedDate || null,
    enrollmentDate: candidate.joinedDate ? new Date(candidate.joinedDate) : null,
    totalCourseEnrollments: candidate.totalCourseEnrollments || 0,
    totalTestSeriesEnrollments: candidate.totalTestSeriesEnrollments || 0,
    enrolledCourses: [...(candidate.enrolledCourses || [])],
  };
}

function sortDemoRows(rows, sortColumn, sortReverse) {
  const items = [...rows];
  items.sort((left, right) => {
    let a = left[sortColumn];
    let b = right[sortColumn];

    if (sortColumn === 'joinedDate') {
      a = new Date(a || 0).getTime();
      b = new Date(b || 0).getTime();
    }

    a = a ?? '';
    b = b ?? '';

    if (typeof a === 'string') a = a.toLowerCase();
    if (typeof b === 'string') b = b.toLowerCase();

    if (a < b) return sortReverse ? 1 : -1;
    if (a > b) return sortReverse ? -1 : 1;
    return 0;
  });
  return items;
}

function getDemoResponse({ searchQuery, filterStatus, currentPage, itemsPerPage, sortColumn, sortReverse }) {
  let rows = demoCandidates.map(normalizeCandidate);
  const query = searchQuery.trim().toLowerCase();

  if (query) {
    rows = rows.filter((candidate) =>
      [candidate.name, candidate.email, candidate.mobile, candidate.candidateKey]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }

  if (filterStatus) {
    rows = rows.filter((candidate) => candidate.status === filterStatus);
  }

  rows = sortDemoRows(rows, sortColumn, sortReverse);

  const totalStudents = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalStudents / itemsPerPage));
  const page = Math.min(currentPage, totalPages);
  const start = (page - 1) * itemsPerPage;

  return {
    students: rows.slice(start, start + itemsPerPage),
    totalStudents,
    totalPages,
    currentPage: page,
  };
}


function formatDateFromSeconds(timestamp) {
  if (!timestamp) return 'Unknown';
  return new Date(timestamp * 1000).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
}

function getValidityStatus(validUntil) {
  if (!validUntil) return 'UNKNOWN';
  const daysRemaining = Math.ceil((validUntil - Date.now() / 1000) / 86400);
  if (daysRemaining < 0) return 'EXPIRED';
  if (daysRemaining <= 30) return 'EXPIRING SOON';
  return 'ACTIVE';
}

function getValidityClass(validUntil) {
  const status = getValidityStatus(validUntil);
  if (status === 'ACTIVE') return 'validity-active';
  if (status === 'EXPIRING SOON') return 'validity-expiring';
  if (status === 'EXPIRED') return 'validity-expired';
  return '';
}

function getDaysRemaining(validUntil) {
  if (!validUntil) return 0;
  return Math.abs(Math.ceil((validUntil - Date.now() / 1000) / 86400));
}

function getPageNumbers(currentPage, totalPages) {
  const maxVisible = 5;
  let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
  let end = Math.min(totalPages, start + maxVisible - 1);
  if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1);
  const pages = [];
  for (let page = start; page <= end; page += 1) pages.push(page);
  return pages;
}

function mapSortColumn(column) {
  const map = {
    name: 'name',
    email: 'email',
    mobile: 'mobile',
    coursesCount: 'totalCourseEnrollments',
    enrollmentDate: 'joinedDate',
    status: 'status',
  };
  return map[column] || column;
}

function sortIcon(column, activeColumn, isReverse) {
  const mapped = mapSortColumn(column);
  if (activeColumn !== mapped) return 'ti-arrows-vertical';
  return isReverse ? 'ti-arrow-down' : 'ti-arrow-up';
}

function statusBadgeClass(status) {
  if (status === 'active') return 'active';
  if (status === 'inactive') return 'inactive';
  if (status === 'blocked') return 'inactive';
  return 'inactive';
}

export default function StudentManagementPage() {
  const { can } = usePermission();
  const [students, setStudents] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebouncedValue(searchQuery);
  const [filterStatus, setFilterStatus] = useState('');
  const [sortColumn, setSortColumn] = useState('name');
  const [sortReverse, setSortReverse] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalStudents, setTotalStudents] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage] = useState('Loading students...');
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [selectedStudentForCourses, setSelectedStudentForCourses] = useState(null);
  const [coursesModalOpen, setCoursesModalOpen] = useState(false);
  const [enrollCourseModalOpen, setEnrollCourseModalOpen] = useState(false);
  const [courseSearchQuery, setCourseSearchQuery] = useState('');
  const [studentToBlacklist, setStudentToBlacklist] = useState(null);
  const [blacklistModalOpen, setBlacklistModalOpen] = useState(false);
  const [blacklistConfirmMessage, setBlacklistConfirmMessage] = useState('');
  const [activeKebabId, setActiveKebabId] = useState(null);
  const [toasts, setToasts] = useState([]);
  const kebabRef = useRef(null);
  const toastIdRef = useRef(0);

  const showToast = (type, title, message) => {
    const id = toastIdRef.current + 1;
    toastIdRef.current = id;
    setToasts((current) => [...current, { id, type, title, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 5000);
  };

  useEffect(() => {
    const handleClick = (event) => {
      if (kebabRef.current && !kebabRef.current.contains(event.target)) {
        setActiveKebabId(null);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  useEffect(() => {
    let isCancelled = false;

    async function loadStudents() {
      setIsLoading(true);
      const isLocalWebPreview = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

      try {
        const response = await api.get('/admin/people/candidate/list', {
          params: {
            page: currentPage,
            size: itemsPerPage,
            sortBy: sortColumn,
            searchKey: debouncedSearchQuery.trim() || undefined,
            status: filterStatus || undefined,
          },
        });

        const rows = (response.data.data || []).map(normalizeCandidate);
        if (!isCancelled) {
          setStudents(rows);
          setTotalStudents(response.data.meta?.total || 0);
          setTotalPages(response.data.meta?.totalPages || 1);
          setCurrentPage(response.data.meta?.page || 1);
          setIsDemoMode(false);
        }
        return;
      } catch (error) {
        const demo = getDemoResponse({
          searchQuery: debouncedSearchQuery,
          filterStatus,
          currentPage,
          itemsPerPage,
          sortColumn,
          sortReverse,
        });

        if (!isCancelled) {
          setStudents(demo.students);
          setTotalStudents(demo.totalStudents);
          setTotalPages(demo.totalPages);
          setCurrentPage(demo.currentPage);
          setIsDemoMode(true);
          if (isLocalWebPreview) {
            showToast('info', 'Demo Data', 'Loaded demo candidate data because the candidate API is not reachable.');
          } else {
            showToast('error', 'Network Error', apiErrorMessage(error, 'Error loading students.'));
          }
        }
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    }

    loadStudents();
    return () => {
      isCancelled = true;
    };
  }, [currentPage, filterStatus, itemsPerPage, debouncedSearchQuery, sortColumn, sortReverse]);

  const activeStudents = useMemo(
    () => students.filter((student) => student.status === 'active' && !student.blocked).length,
    [students]
  );

  const totalEnrollments = useMemo(
    () => students.reduce((sum, student) => sum + (student.totalCourseEnrollments || 0), 0),
    [students]
  );

  const blockedStudents = useMemo(
    () => students.filter((student) => student.status === 'blocked' || student.blocked).length,
    [students]
  );

  const filteredAvailableCourses = useMemo(() => {
    if (!selectedStudentForCourses) return [];
    const enrolledCourseIds = new Set((selectedStudentForCourses.enrolledCourses || []).map((course) => course.courseId));
    return availableCourses.filter((course) => {
      if (enrolledCourseIds.has(course.courseId)) return false;
      if (!courseSearchQuery.trim()) return true;
      const query = courseSearchQuery.trim().toLowerCase();
      return course.courseName.toLowerCase().includes(query) || course.courseCode.toLowerCase().includes(query);
    });
  }, [courseSearchQuery, selectedStudentForCourses]);

  const paginationPages = useMemo(() => getPageNumbers(currentPage, totalPages), [currentPage, totalPages]);

  function handleSort(column) {
    const mapped = mapSortColumn(column);
    if (sortColumn === mapped) {
      setSortReverse((value) => !value);
    } else {
      setSortColumn(mapped);
      setSortReverse(false);
    }
    setCurrentPage(1);
  }

  function openStudentCourses(student) {
    setSelectedStudentForCourses(student);
    setCoursesModalOpen(true);
    setEnrollCourseModalOpen(false);
    setCourseSearchQuery('');
    setActiveKebabId(null);
  }

  function openStudentDetail(student) {
    window.localStorage.setItem('selectedStudent', JSON.stringify(student));
    window.open(`${window.location.origin}/candidate-detail`, '_blank', 'noopener,noreferrer');
    setActiveKebabId(null);
  }

  function toggleBlacklist(student) {
    setStudentToBlacklist(student);
    setBlacklistConfirmMessage(`Do you really want to blacklist the profile of ${student.name}. By doing this, the candidate won't be able to login to the application anymore. You can re-enable access anytime.`);
    setBlacklistModalOpen(true);
    setActiveKebabId(null);
  }

  function confirmBlacklist() {
    if (!studentToBlacklist) return;
    showToast('success', 'Profile Blacklisted', `${studentToBlacklist.name} has been successfully blacklisted.`);
    setBlacklistModalOpen(false);
    setStudentToBlacklist(null);
  }

  function enrollStudentToCourse(course) {
    if (!selectedStudentForCourses) return;
    const newEnrollment = {
      courseId: course.courseId,
      courseCode: course.courseCode,
      courseName: course.courseName,
      enrollmentDate: Math.floor(Date.now() / 1000),
      validUntil: Math.floor(Date.now() / 1000) + 180 * 86400,
      enrollmentStatusText: 'ACTIVE',
    };

    setSelectedStudentForCourses((current) => ({
      ...current,
      enrolledCourses: [...(current?.enrolledCourses || []), newEnrollment],
      totalCourseEnrollments: (current?.totalCourseEnrollments || 0) + 1,
    }));

    setStudents((current) =>
      current.map((student) =>
        student.id === selectedStudentForCourses.id
          ? {
              ...student,
              enrolledCourses: [...student.enrolledCourses, newEnrollment],
              totalCourseEnrollments: student.totalCourseEnrollments + 1,
            }
          : student
      )
    );

    showToast('success', 'Enrollment Successful', `Successfully enrolled ${selectedStudentForCourses.name} to ${course.courseName}!`);
  }

  const showingStart = totalStudents === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const showingEnd = Math.min(currentPage * itemsPerPage, totalStudents);

  return (
    <section className="candidate-profile-page data-table-page">
      <ToastRegion toasts={toasts} onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />

      <div className="page-header-section">
        <div className="page-header-title-group">
          <span className="page-header-icon-box"><i className="fa fa-users" /></span>
          <div>
            <h2>Student Management</h2>
            <p>Manage students, track enrollments, and review candidate access.</p>
          </div>
        </div>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-icon teal"><i className="ti ti-user" /></div>
          <div className="stat-info">
            <h3>{totalStudents}</h3>
            <p>Total Students</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><i className="ti ti-check-box" /></div>
          <div className="stat-info">
            <h3>{activeStudents}</h3>
            <p>Active Students</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange"><i className="ti ti-book" /></div>
          <div className="stat-info">
            <h3>{totalEnrollments}</h3>
            <p>Total Enrollments</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon purple"><i className="ti ti-na" /></div>
          <div className="stat-info">
            <h3>{blockedStudents}</h3>
            <p>Blocked Students</p>
          </div>
        </div>
      </div>

      {isDemoMode ? (
        <div className="candidate-profile-info-banner">
          Showing demo candidate records mapped to the current API response structure for local preview.
        </div>
      ) : null}

      <div className="filter-bar">
        <div className="search-wrapper">
          <i
            className={`ti ${searchQuery ? 'ti-close' : 'ti-search'}`}
            onClick={() => {
              setSearchQuery('');
              setCurrentPage(1);
            }}
          />
          <input
            type="text"
            className="search-input"
            placeholder="Search by name, email, mobile number, or enrolled courses..."
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
            { value: 'blocked', label: 'Blocked' },
          ]}
          onChange={(value) => { setFilterStatus(value); setCurrentPage(1); }}
        />
      </div>

      <div className="students-table-container">
        <table className="students-table">
          <thead>
            <tr>
              <th className={`sortable ${sortColumn === 'name' ? 'active' : ''}`} onClick={() => handleSort('name')}>
                Student
                <i className={`sort-icon ti ${sortIcon('name', sortColumn, sortReverse)}`} />
              </th>
              <th className={`sortable ${sortColumn === 'email' ? 'active' : ''}`} onClick={() => handleSort('email')}>
                Email
                <i className={`sort-icon ti ${sortIcon('email', sortColumn, sortReverse)}`} />
              </th>
              <th className={`sortable ${sortColumn === 'mobile' ? 'active' : ''}`} onClick={() => handleSort('mobile')}>
                Mobile
                <i className={`sort-icon ti ${sortIcon('mobile', sortColumn, sortReverse)}`} />
              </th>
              <th className={`sortable ${sortColumn === 'totalCourseEnrollments' ? 'active' : ''}`} onClick={() => handleSort('coursesCount')}>
                Enrolled Courses
                <i className={`sort-icon ti ${sortIcon('coursesCount', sortColumn, sortReverse)}`} />
              </th>
              <th className={`sortable ${sortColumn === 'joinedDate' ? 'active' : ''}`} onClick={() => handleSort('enrollmentDate')}>
                Prep Journey
                <i className={`sort-icon ti ${sortIcon('enrollmentDate', sortColumn, sortReverse)}`} />
              </th>
              <th className={`sortable ${sortColumn === 'status' ? 'active' : ''}`} onClick={() => handleSort('status')}>
                Status
                <i className={`sort-icon ti ${sortIcon('status', sortColumn, sortReverse)}`} />
              </th>
              <th style={{ width: '50px' }} />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              [...Array(itemsPerPage)].map((_, index) => (
                <tr key={`loading-${index}`}>
                  <td>
                    <div className="student-name-cell">
                      <div className="student-avatar-placeholder skeleton-circle" />
                      <div>
                        <div className="skeleton-line skeleton-medium" />
                        <div className="skeleton-line skeleton-short" />
                      </div>
                    </div>
                  </td>
                  <td><div className="skeleton-line skeleton-medium" /></td>
                  <td><div className="skeleton-line skeleton-medium" /></td>
                  <td><div className="skeleton-line skeleton-short" /></td>
                  <td><div className="skeleton-line skeleton-short" /></td>
                  <td><div className="skeleton-line skeleton-short" /></td>
                  <td />
                </tr>
              ))
            ) : students.length > 0 ? (
              students.map((student) => (
                <tr key={student.id} className={activeKebabId === student.id ? 'row-active-menu' : ''}>
                  <td>
                    <div className="student-name-cell">
                      <Avatar
                        src={student.avatar}
                        name={student.name}
                        className="student-avatar"
                        placeholderClassName="student-avatar-placeholder"
                      />
                      <div>
                        <button
                          type="button"
                          className="student-name name-link"
                          title="View profile"
                          onClick={(event) => { event.stopPropagation(); openStudentDetail(student); }}
                        >
                          {student.name}
                        </button>
                        <div className="student-id">ID: {student.id}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="contact-info">
                      <i className="ti ti-email" />
                      {student.email}
                    </div>
                  </td>
                  <td>
                    <div className="contact-info">
                      <i className="ti ti-mobile" />
                      {student.mobile}
                    </div>
                  </td>
                  <td>
                    <span
                      className="courses-badge clickable"
                      onClick={(event) => {
                        event.stopPropagation();
                        openStudentCourses(student);
                      }}
                    >
                      {student.totalCourseEnrollments || 0} Course{student.totalCourseEnrollments !== 1 ? 's' : ''}
                    </span>
                  </td>
                  <td>
                    <div className="enrollment-date">
                      {student.enrollmentDate ? student.enrollmentDate.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Unknown'}
                    </div>
                  </td>
                  <td>
                    <span className={`status-badge ${statusBadgeClass(student.status)}`}>
                      {student.status}
                    </span>
                  </td>
                  <td
                    style={{ textAlign: 'center' }}
                    className={activeKebabId === student.id ? 'cell-active-menu' : ''}
                  >
                    <div className="kebab-menu-container" ref={activeKebabId === student.id ? kebabRef : null}>
                      <button
                        type="button"
                        className="kebab-button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setActiveKebabId((current) => current === student.id ? null : student.id);
                        }}
                      >
                        <i className="ti ti-more-alt" />
                      </button>
                      <div className={`kebab-dropdown ${activeKebabId === student.id ? 'active' : ''}`}>
                        <div className="kebab-dropdown-item view-profile" onClick={() => openStudentDetail(student)}>
                          <i className="ti ti-user" />
                          <span className="item-label">View Profile</span>
                        </div>
                        {can(PERMS.STUDENTS_BLACKLIST) && (
                          <div className="kebab-dropdown-item blacklist-profile" onClick={() => toggleBlacklist(student)}>
                            <i className="ti ti-na" />
                            <span className="item-label">Blacklist Profile</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="7">
                  <div className="empty-state">
                    <i className="ti ti-user" />
                    <h3>No Students Found</h3>
                    <p>{searchQuery || filterStatus ? 'No students match your search criteria.' : 'Get started by adding your first student.'}</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {students.length > 0 ? (
          <div className="pagination-container">
            <div className="pagination-info">
              <span>Showing {showingStart} to {showingEnd} of {totalStudents} students</span>
              <select
                className="page-size-select"
                value={itemsPerPage}
                onChange={(event) => {
                  setItemsPerPage(Number(event.target.value));
                  setCurrentPage(1);
                }}
              >
                {[10, 20, 50, 200].map((size) => (
                  <option key={size} value={size}>{`Show ${size}`}</option>
                ))}
              </select>
            </div>
            <div className="pagination-controls">
              <button type="button" className="pagination-btn" disabled={currentPage === 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>
                <i className="ti ti-angle-left" /> Previous
              </button>
              {paginationPages.map((page) => (
                <button key={page} type="button" className={`pagination-btn ${page === currentPage ? 'active' : ''}`} onClick={() => setCurrentPage(page)}>
                  {page}
                </button>
              ))}
              <button type="button" className="pagination-btn" disabled={currentPage === totalPages} onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}>
                Next <i className="ti ti-angle-right" />
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className={`legacy-modal-backdrop ${coursesModalOpen ? 'active' : ''}`}>
        <div className="legacy-modal-dialog legacy-large" onClick={(event) => event.stopPropagation()}>
          <div className="legacy-modal-header">
            <h3><i className="ti ti-book" /> Enrolled Courses - {selectedStudentForCourses?.name}</h3>
            <button type="button" className="legacy-modal-close" onClick={() => { setCoursesModalOpen(false); setSelectedStudentForCourses(null); }}>
              <i className="ti ti-close" />
            </button>
          </div>
          <div className="legacy-modal-body">
            {selectedStudentForCourses ? (
              <div className="legacy-candidate-card">
                <Avatar
                  src={selectedStudentForCourses.avatar}
                  name={selectedStudentForCourses.name}
                  className="legacy-candidate-avatar"
                  placeholderClassName="legacy-candidate-avatar placeholder"
                />
                <div className="legacy-candidate-info">
                  <div className="legacy-candidate-name">{selectedStudentForCourses.name}</div>
                  <div className="legacy-candidate-email">{selectedStudentForCourses.email}</div>
                </div>
                <div className="legacy-candidate-total">
                  <div>{selectedStudentForCourses.totalCourseEnrollments || 0}</div>
                  <span>Total Enrollments</span>
                </div>
              </div>
            ) : null}

            {selectedStudentForCourses?.enrolledCourses?.length ? (
              <table className="legacy-modal-table">
                <thead>
                  <tr>
                    <th>Course Name</th>
                    <th>Active Till</th>
                    <th style={{ textAlign: 'center' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedStudentForCourses.enrolledCourses.map((course) => (
                    <tr key={`${selectedStudentForCourses.id}-${course.courseId}`}>
                      <td>
                        <div className="legacy-table-title">{course.courseName}</div>
                        <div className="legacy-table-subtitle">{course.courseCode}</div>
                        <div className="legacy-table-meta">
                          Enrolled: {course.enrollmentDate ? formatDateFromSeconds(course.enrollmentDate) : 'Unknown'}
                        </div>
                      </td>
                      <td>
                        <div>{formatDateFromSeconds(course.validUntil)}</div>
                        <div className="legacy-table-meta">
                          {getDaysRemaining(course.validUntil)} days {getValidityStatus(course.validUntil) === 'EXPIRED' ? 'expired' : 'remaining'}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`validity-badge ${getValidityClass(course.validUntil)}`}>
                          {course.enrollmentStatusText || getValidityStatus(course.validUntil)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="legacy-empty-modal">
                <i className="ti ti-book" />
                <p>No courses enrolled</p>
              </div>
            )}
          </div>
          <div className="legacy-modal-footer">
            <button type="button" className="legacy-btn legacy-btn-default" onClick={() => { setCoursesModalOpen(false); setSelectedStudentForCourses(null); }}>
              <i className="ti ti-close" /> Close
            </button>
            <Can permission={PERMS.STUDENTS_ENROLL}>
              <button type="button" className="legacy-btn legacy-btn-success" onClick={() => setEnrollCourseModalOpen(true)}>
                <i className="ti ti-plus" /> Enroll Course
              </button>
            </Can>
          </div>
        </div>
      </div>

      <div className={`legacy-modal-backdrop ${enrollCourseModalOpen ? 'active' : ''}`}>
        <div className="legacy-modal-dialog legacy-xl" onClick={(event) => event.stopPropagation()}>
          <div className="legacy-modal-header">
            <h3><i className="ti ti-book" /> Enroll Course - {selectedStudentForCourses?.name}</h3>
            <button type="button" className="legacy-modal-close" onClick={() => setEnrollCourseModalOpen(false)}>
              <i className="ti ti-close" />
            </button>
          </div>
          <div className="legacy-modal-body">
            <div className="legacy-search-group">
              <span className="legacy-input-addon"><i className="ti ti-search" /></span>
              <input
                type="text"
                className="legacy-form-control"
                placeholder="Search courses by name or code..."
                value={courseSearchQuery}
                onChange={(event) => setCourseSearchQuery(event.target.value)}
              />
              {courseSearchQuery ? (
                <button type="button" className="legacy-input-clear" onClick={() => setCourseSearchQuery('')}>
                  <i className="ti ti-close" />
                </button>
              ) : null}
            </div>

            {filteredAvailableCourses.length > 0 ? (
              <>
                <p className="legacy-list-caption">Showing <strong>{filteredAvailableCourses.length}</strong> available course(s).</p>
                <div className="legacy-scroll-box">
                  <table className="legacy-modal-table">
                    <thead>
                      <tr>
                        <th>Course Name</th>
                        <th>Code</th>
                        <th style={{ textAlign: 'center' }}>Duration</th>
                        <th style={{ textAlign: 'center' }}>Price</th>
                        <th style={{ textAlign: 'center' }}>Status</th>
                        <th style={{ textAlign: 'center' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAvailableCourses.map((course) => (
                        <tr key={course.courseId}>
                          <td>
                            <div className="legacy-table-title">{course.courseName}</div>
                            <div className="legacy-table-subtitle">{course.modules || 0} modules</div>
                          </td>
                          <td>{course.courseCode}</td>
                          <td style={{ textAlign: 'center' }}>
                            <i className="ti ti-calendar" style={{ marginRight: 5, color: '#6c757d' }} />
                            {course.duration || 'N/A'}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <strong style={{ color: '#006073' }}>${course.price || 0}</strong>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span className="legacy-inline-active">{course.status || 'Active'}</span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button type="button" className="legacy-btn legacy-btn-success legacy-btn-small" onClick={() => enrollStudentToCourse(course)}>
                              <i className="ti ti-plus" /> Enroll
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="legacy-empty-modal">
                <i className="ti ti-book" />
                <p>{courseSearchQuery ? `No courses found matching "${courseSearchQuery}"` : 'No courses available for enrollment'}</p>
              </div>
            )}
          </div>
          <div className="legacy-modal-footer">
            <button type="button" className="legacy-btn legacy-btn-default" onClick={() => setEnrollCourseModalOpen(false)}>
              <i className="ti ti-close" /> Close
            </button>
          </div>
        </div>
      </div>

      <div className={`legacy-modal-backdrop ${blacklistModalOpen ? 'active' : ''}`}>
        <div className="legacy-modal-dialog legacy-confirm" onClick={(event) => event.stopPropagation()}>
          <div className="legacy-modal-header legacy-danger-header">
            <h3><i className="ti ti-alert" /> Confirm Blacklist</h3>
            <button type="button" className="legacy-modal-close" onClick={() => setBlacklistModalOpen(false)}>
              <i className="ti ti-close" />
            </button>
          </div>
          <div className="legacy-modal-body">
            <p className="legacy-confirm-copy">{blacklistConfirmMessage}</p>
          </div>
          <div className="legacy-modal-footer">
            <button type="button" className="legacy-btn legacy-btn-default" onClick={() => setBlacklistModalOpen(false)}>Cancel</button>
            <button type="button" className="legacy-btn legacy-btn-danger" onClick={confirmBlacklist}>
              <i className="ti ti-na" /> Blacklist Profile
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
