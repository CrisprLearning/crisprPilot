import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ToastRegion from '../components/ToastRegion';
import { api } from '../lib/api';
import useDebouncedValue from '../hooks/useDebouncedValue';
import { demoCourses, demoCourseStudents } from '../data/coursesListDemo';

function getInitials(name) {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getPageNumbers(currentPage, totalPages) {
  const pages = [];
  const startPage = Math.max(1, currentPage - 2);
  const endPage = Math.min(totalPages, currentPage + 2);
  for (let page = startPage; page <= endPage; page += 1) pages.push(page);
  return pages;
}

function formatDate(timestamp) {
  if (!timestamp) return 'N/A';
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function mapCourse(course) {
  return {
    id: course.id,
    code: course.code || '',
    title: course.title,
    category: course.category || '',
    description: course.description || '',
    modulesList: course.modules || course.modulesList || [],
    totalModules: course.totalModules || 0,
    totalChapters: course.chapters || course.totalChapters || 0,
    totalDuration: course.duration || course.totalDuration || '0h 0m',
    status: course.status || 'Draft',
    totalStudents: course.students || course.totalStudents || 0,
    instructor: course.instructor || '',
    rating: course.rating || null,
  };
}

function paginateRows(rows, currentPage, pageSize) {
  const totalItems = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    rows: rows.slice(start, start + pageSize),
    totalItems,
    totalPages,
    currentPage: safePage,
  };
}

function sortDemoCourses(rows, sortBy, sortOrder) {
  const sorted = [...rows];
  sorted.sort((left, right) => {
    let aValue = '';
    let bValue = '';
    switch (sortBy) {
      case 'code':
        aValue = (left.code || '').toLowerCase();
        bValue = (right.code || '').toLowerCase();
        break;
      case 'name':
        aValue = (left.title || '').toLowerCase();
        bValue = (right.title || '').toLowerCase();
        break;
      case 'chapters':
        aValue = left.totalChapters || 0;
        bValue = right.totalChapters || 0;
        break;
      case 'status':
        aValue = (left.status || '').toLowerCase();
        bValue = (right.status || '').toLowerCase();
        break;
      case 'students':
        aValue = left.totalStudents || 0;
        bValue = right.totalStudents || 0;
        break;
      default:
        aValue = (left.title || '').toLowerCase();
        bValue = (right.title || '').toLowerCase();
        break;
    }

    if (aValue < bValue) return sortOrder === 'DESC' ? 1 : -1;
    if (aValue > bValue) return sortOrder === 'DESC' ? -1 : 1;
    return 0;
  });
  return sorted;
}

function sortDemoStudents(rows, sortBy, sortOrder) {
  const sorted = [...rows];
  sorted.sort((left, right) => {
    let aValue = '';
    let bValue = '';
    switch (sortBy) {
      case 'name':
        aValue = (left.name || '').toLowerCase();
        bValue = (right.name || '').toLowerCase();
        break;
      case 'email':
        aValue = (left.email || '').toLowerCase();
        bValue = (right.email || '').toLowerCase();
        break;
      case 'enrollmentDate':
        aValue = Number(left.enrollmentDate || 0);
        bValue = Number(right.enrollmentDate || 0);
        break;
      case 'enrollmentStatus':
        aValue = (left.enrollmentStatusText || left.status || '').toLowerCase();
        bValue = (right.enrollmentStatusText || right.status || '').toLowerCase();
        break;
      default:
        aValue = (left.name || '').toLowerCase();
        bValue = (right.name || '').toLowerCase();
        break;
    }
    if (aValue < bValue) return sortOrder === 'DESC' ? 1 : -1;
    if (aValue > bValue) return sortOrder === 'DESC' ? -1 : 1;
    return 0;
  });
  return sorted;
}

export default function CoursesListPage() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebouncedValue(searchQuery);
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('ASC');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [pageSize, setPageSize] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [allCoursesSnapshot, setAllCoursesSnapshot] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [selectedCourseForStudents, setSelectedCourseForStudents] = useState(null);
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const debouncedStudentSearchQuery = useDebouncedValue(studentSearchQuery);
  const [paginatedStudentsList, setPaginatedStudentsList] = useState([]);
  const [studentsCurrentPage, setStudentsCurrentPage] = useState(1);
  const [studentsItemsPerPage] = useState(5);
  const [studentsTotalPages, setStudentsTotalPages] = useState(0);
  const [studentsTotalItems, setStudentsTotalItems] = useState(0);
  const [studentsSortBy, setStudentsSortBy] = useState('name');
  const [studentsSortOrder, setStudentsSortOrder] = useState('ASC');
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState('');
  const [courseToUpdate, setCourseToUpdate] = useState(null);
  const [newStatusToSet, setNewStatusToSet] = useState('');
  const [activeKebabId, setActiveKebabId] = useState(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const toastIdRef = useRef(0);
  const kebabRef = useRef(null);

  const showToast = (type, title, message) => {
    const id = toastIdRef.current + 1;
    toastIdRef.current = id;
    setToasts((current) => [...current, { id, type, title, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4500);
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
    let cancelled = false;

    async function loadCourses() {
      setIsLoading(true);
      try {
        const response = await api.get('/admin/course/list-bundles', {
          params: {
            page: currentPage,
            size: itemsPerPage,
            sortBy,
            sortOrder,
            searchKey: debouncedSearchQuery.trim() || undefined,
          },
        });

        if (response.data?.status === 'success') {
          if (cancelled) return;
          const mapped = (response.data.data || []).map(mapCourse);
          setCourses(mapped);
          setCurrentPage(response.data.meta?.page || 1);
          setTotalItems(response.data.meta?.total || 0);
          setTotalPages(response.data.meta?.totalPages || 1);
          setAllCoursesSnapshot(mapped);
          setIsDemoMode(false);
          return;
        }

        throw new Error('Failed to load courses');
      } catch {
        if (cancelled) return;
        let filtered = demoCourses.map(mapCourse);
        const query = searchQuery.trim().toLowerCase();
        if (query) {
          filtered = filtered.filter((course) =>
            [course.code, course.title, course.category].filter(Boolean).some((value) => value.toLowerCase().includes(query))
          );
        }
        filtered = sortDemoCourses(filtered, sortBy, sortOrder);
        const paginated = paginateRows(filtered, currentPage, itemsPerPage);
        setCourses(paginated.rows);
        setTotalItems(paginated.totalItems);
        setTotalPages(paginated.totalPages);
        setCurrentPage(paginated.currentPage);
        setAllCoursesSnapshot(filtered);
        setIsDemoMode(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadCourses();
    return () => {
      cancelled = true;
    };
  }, [currentPage, itemsPerPage, debouncedSearchQuery, sortBy, sortOrder]);

  useEffect(() => {
    let cancelled = false;

    async function loadCourseEnrollments() {
      if (!selectedCourseForStudents) return;
      try {
        const response = await api.get('/admin/enrollment/get-course-enrollments', {
          params: {
            course: selectedCourseForStudents.code,
            page: studentsCurrentPage,
            size: studentsItemsPerPage,
            sortBy: studentsSortBy,
            sortOrder: studentsSortOrder,
            searchKey: debouncedStudentSearchQuery.trim() || undefined,
          },
        });
        if (response.data?.status === 'success') {
          if (cancelled) return;
          const rows = (response.data.data || []).map((enrollment) => ({
            id: enrollment.candidateId || '',
            name: enrollment.name || 'Unknown Student',
            email: enrollment.email || '',
            phone: enrollment.mobile || '',
            photo: enrollment.photo || null,
            enrollmentDate: enrollment.enrollmentDate || Date.now(),
            enrollmentStatusText: enrollment.enrollmentStatus === 1 ? 'Active' : 'Inactive',
            status: enrollment.enrollmentStatus === 1 ? 'active' : 'inactive',
          }));
          setPaginatedStudentsList(rows);
          setStudentsTotalItems(response.data.total || 0);
          setStudentsTotalPages(response.data.totalPages || 0);
          setStudentsCurrentPage(response.data.page || 1);
          return;
        }
        throw new Error('Failed to load students');
      } catch {
        if (cancelled) return;
        const source = demoCourseStudents[selectedCourseForStudents.code] || [];
        let filtered = [...source];
        const query = studentSearchQuery.trim().toLowerCase();
        if (query) {
          filtered = filtered.filter((student) =>
            [student.name, student.email].filter(Boolean).some((value) => value.toLowerCase().includes(query))
          );
        }
        filtered = sortDemoStudents(filtered, studentsSortBy, studentsSortOrder);
        const paginated = paginateRows(filtered, studentsCurrentPage, studentsItemsPerPage);
        setPaginatedStudentsList(paginated.rows);
        setStudentsTotalItems(paginated.totalItems);
        setStudentsTotalPages(paginated.totalPages);
        setStudentsCurrentPage(paginated.currentPage);
      }
    }

    loadCourseEnrollments();
    return () => {
      cancelled = true;
    };
  }, [selectedCourseForStudents, debouncedStudentSearchQuery, studentsCurrentPage, studentsItemsPerPage, studentsSortBy, studentsSortOrder]);

  const pageNumbers = useMemo(() => getPageNumbers(currentPage, totalPages), [currentPage, totalPages]);
  const studentPageNumbers = useMemo(() => getPageNumbers(studentsCurrentPage, studentsTotalPages), [studentsCurrentPage, studentsTotalPages]);

  function changeSortBy(nextSortBy) {
    if (sortBy === nextSortBy) {
      setSortOrder((value) => (value === 'ASC' ? 'DESC' : 'ASC'));
    } else {
      setSortBy(nextSortBy);
      setSortOrder('ASC');
    }
    setCurrentPage(1);
  }

  function changePageSize(nextSize) {
    setPageSize(nextSize);
    setItemsPerPage(nextSize);
    setCurrentPage(1);
  }

  function toggleKebabMenu(course, event) {
    event.stopPropagation();
    setActiveKebabId((current) => (current === course.code ? null : course.code));
  }

  function viewCourseContent(course) {
    setActiveKebabId(null);
    navigate(`/course-view?courseCode=${course.code}&bundleId=${course.id || 70005}&segment=1&module=1&chapter=1&part=0`);
  }

  function toggleCourseStatus(course) {
    const nextStatus = String(course.status).toLowerCase() === 'active' ? 'Draft' : 'Active';
    setCourseToUpdate(course);
    setNewStatusToSet(nextStatus);
    setConfirmMessage(`Are you sure you want to change the status of "${course.title}" to ${nextStatus}?`);
    setConfirmModalOpen(true);
    setActiveKebabId(null);
  }

  function confirmAction() {
    if (!courseToUpdate || !newStatusToSet) return;
    setCourses((current) =>
      current.map((course) => (course.code === courseToUpdate.code ? { ...course, status: newStatusToSet } : course))
    );
    setAllCoursesSnapshot((current) =>
      current.map((course) => (course.code === courseToUpdate.code ? { ...course, status: newStatusToSet } : course))
    );
    showToast('success', 'Success', `Course status updated to ${newStatusToSet}`);
    setConfirmModalOpen(false);
    setCourseToUpdate(null);
    setNewStatusToSet('');
  }

  function viewCourseStudents(course) {
    setSelectedCourseForStudents(course);
    setStudentSearchQuery('');
    setStudentsCurrentPage(1);
    setStudentsSortBy('name');
    setStudentsSortOrder('ASC');
  }

  function changeStudentsSort(nextSortBy) {
    if (studentsSortBy === nextSortBy) {
      setStudentsSortOrder((value) => (value === 'ASC' ? 'DESC' : 'ASC'));
    } else {
      setStudentsSortBy(nextSortBy);
      setStudentsSortOrder('ASC');
    }
    setStudentsCurrentPage(1);
  }

  function closeStudentsModal() {
    setSelectedCourseForStudents(null);
    setStudentSearchQuery('');
    setPaginatedStudentsList([]);
    setStudentsCurrentPage(1);
    setStudentsTotalPages(0);
    setStudentsTotalItems(0);
    setStudentsSortBy('name');
    setStudentsSortOrder('ASC');
  }

  function viewStudentProfile(student) {
    window.localStorage.setItem('selectedStudent', JSON.stringify(student));
    window.open(`${window.location.origin}/candidate-detail`, '_blank', 'noopener,noreferrer');
  }

  function sortIcon(column) {
    if (sortBy !== column) return 'ti-arrows-vertical';
    return sortOrder === 'DESC' ? 'ti-arrow-down' : 'ti-arrow-up';
  }

  function studentSortIcon(column) {
    if (studentsSortBy !== column) return '';
    return studentsSortOrder === 'DESC' ? 'ti-sort-descending' : 'ti-sort-ascending';
  }

  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);
  const studentsStartItem = studentsTotalItems === 0 ? 0 : (studentsCurrentPage - 1) * studentsItemsPerPage + 1;
  const studentsEndItem = Math.min(studentsCurrentPage * studentsItemsPerPage, studentsTotalItems);

  return (
    <section className="courses-list-page data-table-page">
      <ToastRegion toasts={toasts} onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />

      <div className="page-header-section">
        <div className="page-header-title-group">
          <span className="page-header-icon-box"><i className="fa fa-list-alt" /></span>
          <div>
            <h2>Courses List</h2>
            <p>Browse bundles, inspect enrolled students, and route into course content without changing the legacy workflow.</p>
          </div>
        </div>
        <button type="button" className="create-course-button" onClick={() => navigate('/course-management')}>
          <i className="ti ti-plus" /> Create New Course
        </button>
      </div>

      {isDemoMode ? <div className="courses-demo-banner">Showing demo course data because the course APIs are currently unreachable.</div> : null}

      <div className="filter-bar">
        <div className="search-wrapper">
          <i className={`ti ${searchQuery ? 'ti-close' : 'ti-search'}`} onClick={() => setSearchQuery('')} />
          <input
            type="text"
            className="search-input"
            placeholder="Search courses by name, ID, or category..."
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setCurrentPage(1);
            }}
          />
        </div>
      </div>

      <div className="students-table-container" ref={kebabRef}>
        <table className={`students-table ${isLoading ? 'thead-loading' : ''}`}>
          <thead>
            <tr>
              <th className={`sortable ${sortBy === 'code' ? 'active' : ''}`} onClick={() => changeSortBy('code')}>
                Course ID
                <i className={`sort-icon ti ${sortIcon('code')}`} />
              </th>
              <th className={`sortable ${sortBy === 'name' ? 'active' : ''}`} onClick={() => changeSortBy('name')}>
                Course Name
                <i className={`sort-icon ti ${sortIcon('name')}`} />
              </th>
              <th>Modules</th>
              <th className={`sortable center-align ${sortBy === 'chapters' ? 'active' : ''}`} onClick={() => changeSortBy('chapters')}>
                Chapters
                <i className={`sort-icon ti ${sortIcon('chapters')}`} />
              </th>
              <th>Total Duration</th>
              <th className={`sortable ${sortBy === 'status' ? 'active' : ''}`} onClick={() => changeSortBy('status')}>
                Status
                <i className={`sort-icon ti ${sortIcon('status')}`} />
              </th>
              <th className={`sortable center-align ${sortBy === 'students' ? 'active' : ''}`} onClick={() => changeSortBy('students')}>
                Students
                <i className={`sort-icon ti ${sortIcon('students')}`} />
              </th>
              <th className="actions-column" />
            </tr>
          </thead>
          {isLoading ? (
            <tbody>
              {Array.from({ length: pageSize }, (_, index) => (
                <tr key={`skeleton-${index}`}>
                  <td><div className="course-skeleton short" /></td>
                  <td><div className="course-skeleton long" /><div className="course-skeleton medium top-gap" /></td>
                  <td><div className="course-skeleton medium" /></td>
                  <td className="center-align"><div className="course-skeleton short centered" /></td>
                  <td><div className="course-skeleton medium" /></td>
                  <td><div className="course-skeleton short status" /></td>
                  <td className="center-align"><div className="course-skeleton students centered" /></td>
                  <td />
                </tr>
              ))}
            </tbody>
          ) : (
            <tbody>
              {courses.map((course) => (
                <tr key={course.code} className={activeKebabId === course.code ? 'row-active-menu' : ''}>
                  <td><div className="course-id">{course.code}</div></td>
                  <td>
                    <div className="course-name">{course.title}</div>
                    <div className="course-category">{course.category}</div>
                  </td>
                  <td>
                    <div>
                      {(course.modulesList || []).map((module) => (
                        <span key={`${course.code}-${module}`} className="module-badge">{module}</span>
                      ))}
                    </div>
                  </td>
                  <td className="center-align"><div className="chapters-count">{course.totalChapters}</div></td>
                  <td><div className="time-info"><i className="ti ti-time" /> {course.totalDuration}</div></td>
                  <td><span className={`status-badge ${String(course.status).toLowerCase()}`}>{course.status}</span></td>
                  <td className="center-align" onClick={(event) => event.stopPropagation()}>
                    {course.totalStudents > 0 ? (
                      <button type="button" className="student-count-button" onClick={() => viewCourseStudents(course)} title="View enrolled students">
                        {course.totalStudents} Student{course.totalStudents !== 1 ? 's' : ''}
                      </button>
                    ) : (
                      <span className="no-students-text">No Students</span>
                    )}
                  </td>
                  <td className={`center-align ${activeKebabId === course.code ? 'cell-active-menu' : ''}`} onClick={(event) => event.stopPropagation()}>
                    <div className="kebab-menu-container">
                      <button type="button" className="kebab-button" onClick={(event) => toggleKebabMenu(course, event)}>
                        <i className="ti ti-more-alt" />
                      </button>
                      <div className={`kebab-dropdown ${activeKebabId === course.code ? 'active' : ''}`}>
                        <button type="button" className="kebab-dropdown-item view-profile" onClick={() => viewCourseContent(course)}>
                          <i className="ti ti-eye" />
                          <span className="item-label">View Course Content</span>
                        </button>
                        <button
                          type="button"
                          className={`kebab-dropdown-item ${String(course.status).toLowerCase() === 'active' ? 'draft-action' : 'enable-action'}`}
                          onClick={() => toggleCourseStatus(course)}
                        >
                          <i className={`ti ${String(course.status).toLowerCase() === 'active' ? 'ti-pencil' : 'ti-check'}`} />
                          <span className="item-label">{String(course.status).toLowerCase() === 'active' ? 'Move as Draft' : 'Enable the Course'}</span>
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          )}
        </table>

        {!isLoading && courses.length === 0 ? (
          <div className="courses-empty-state">
            <i className="ti ti-search" />
            <h3>No courses found</h3>
            <p>Try adjusting your search criteria</p>
          </div>
        ) : null}

        <div className="pagination-container">
          <div className="pagination-info">
            <span>Showing {startItem} to {endItem} of {totalItems} courses</span>
            <select className="page-size-select" value={pageSize} onChange={(event) => changePageSize(Number(event.target.value))}>
              {[10, 20, 50, 200].map((size) => (
                <option key={size} value={size}>Show {size}</option>
              ))}
            </select>
          </div>
          <div className="pagination-controls">
            <button type="button" className="pagination-btn" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage === 1}>
              <i className="ti ti-angle-left" /> Previous
            </button>
            {pageNumbers.map((page) => (
              <button key={page} type="button" className={`pagination-btn ${page === currentPage ? 'active' : ''}`} onClick={() => setCurrentPage(page)}>
                {page}
              </button>
            ))}
            <button type="button" className="pagination-btn" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={currentPage === totalPages || totalPages === 0}>
              Next <i className="ti ti-angle-right" />
            </button>
          </div>
        </div>
      </div>

      <div className={`legacy-modal-backdrop ${Boolean(selectedCourseForStudents) ? 'active' : ''}`} onClick={closeStudentsModal}>
        <div className="legacy-modal-dialog legacy-xl courses-students-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
          <div className="legacy-modal-header">
            <h3><i className="ti ti-user" /> Enrolled Students - {selectedCourseForStudents?.title}</h3>
            <button type="button" className="legacy-modal-close" onClick={closeStudentsModal}>
              <i className="ti ti-close" />
            </button>
          </div>
          <div className="legacy-modal-body">
            <div className="courses-modal-search">
              <div className="search-wrapper">
                <i className="ti ti-search" />
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search students by name or email..."
                  value={studentSearchQuery}
                  onChange={(event) => {
                    setStudentSearchQuery(event.target.value);
                    setStudentsCurrentPage(1);
                  }}
                />
              </div>
            </div>

            {selectedCourseForStudents && paginatedStudentsList.length > 0 ? (
              <>
                <table className="students-table courses-modal-table">
                  <thead>
                    <tr>
                      <th onClick={() => changeStudentsSort('name')} className="sortable">
                        Student Name
                        <i className={`ti ${studentSortIcon('name')}`} />
                      </th>
                      <th onClick={() => changeStudentsSort('email')} className="sortable">
                        Email
                        <i className={`ti ${studentSortIcon('email')}`} />
                      </th>
                      <th>Phone</th>
                      <th onClick={() => changeStudentsSort('enrollmentDate')} className="sortable">
                        Enrollment Date
                        <i className={`ti ${studentSortIcon('enrollmentDate')}`} />
                      </th>
                      <th onClick={() => changeStudentsSort('enrollmentStatus')} className="sortable">
                        Status
                        <i className={`ti ${studentSortIcon('enrollmentStatus')}`} />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedStudentsList.map((student) => (
                      <tr key={`${selectedCourseForStudents.code}-${student.id}`} onClick={() => viewStudentProfile(student)} className="clickable-row">
                        <td>
                          <div className="course-student-name">{student.name}</div>
                          <div className="course-student-id">ID: {student.id}</div>
                        </td>
                        <td><div className="course-student-copy">{student.email}</div></td>
                        <td><div className="course-student-copy">{student.phone || 'N/A'}</div></td>
                        <td><div className="course-student-copy">{formatDate(student.enrollmentDate)}</div></td>
                        <td>
                          <span className={`status-badge ${student.enrollmentStatusText === 'Active' || student.status === 'active' ? 'status-active' : 'status-inactive'}`}>
                            {student.enrollmentStatusText || student.status || 'Active'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="pagination-container courses-modal-pagination">
                  <div className="pagination-info">
                    Showing {studentsStartItem} to {studentsEndItem} of {studentsTotalItems} students
                  </div>
                  <div className="pagination-controls">
                    <button type="button" className="pagination-btn" onClick={() => setStudentsCurrentPage((page) => Math.max(1, page - 1))} disabled={studentsCurrentPage === 1}>
                      <i className="ti ti-angle-left" /> Previous
                    </button>
                    {studentPageNumbers.map((page) => (
                      <button key={page} type="button" className={`pagination-btn ${page === studentsCurrentPage ? 'active' : ''}`} onClick={() => setStudentsCurrentPage(page)}>
                        {page}
                      </button>
                    ))}
                    <button type="button" className="pagination-btn" onClick={() => setStudentsCurrentPage((page) => Math.min(studentsTotalPages, page + 1))} disabled={studentsCurrentPage === studentsTotalPages}>
                      Next <i className="ti ti-angle-right" />
                    </button>
                  </div>
                </div>
              </>
            ) : null}

            {selectedCourseForStudents && studentsTotalItems === 0 && !studentSearchQuery ? (
              <div className="courses-students-empty">
                <i className="ti ti-user" />
                <h4>No Students Enrolled</h4>
                <p>This course doesn't have any enrolled students yet.</p>
              </div>
            ) : null}

            {selectedCourseForStudents && studentsTotalItems === 0 && studentSearchQuery ? (
              <div className="courses-students-empty">
                <i className="ti ti-search" />
                <h4>No Students Found</h4>
                <p>No students match your search criteria. Try adjusting your search.</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className={`legacy-modal-backdrop ${confirmModalOpen ? 'active' : ''}`} onClick={() => setConfirmModalOpen(false)}>
        <div className="legacy-modal-dialog legacy-confirm" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
          <div className="legacy-modal-header">
            <h3><i className="ti ti-alert" /> Confirm Action</h3>
            <button type="button" className="legacy-modal-close" onClick={() => setConfirmModalOpen(false)}>
              <i className="ti ti-close" />
            </button>
          </div>
          <div className="legacy-modal-body">
            <p className="legacy-confirm-copy">{confirmMessage}</p>
          </div>
          <div className="legacy-modal-footer">
            <button type="button" className="legacy-btn legacy-btn-default" onClick={() => setConfirmModalOpen(false)}>Cancel</button>
            <button type="button" className="legacy-btn legacy-btn-success" onClick={confirmAction}>
              <i className="ti ti-check" /> Confirm
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
