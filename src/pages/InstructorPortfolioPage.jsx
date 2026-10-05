import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import ToastRegion from '../components/ToastRegion';
import FilterDropdown from '../components/FilterDropdown';
import Avatar from '../components/Avatar';
import { Can, usePermission } from '../lib/userStore';
import { PERMS } from '../lib/permissions';
import { instructorsDemo } from '../data/adminRemainingDemo';
import useDebouncedValue from '../hooks/useDebouncedValue';
import Icon from '../components/Icon';


function getPageNumbers(currentPage, totalPages) {
  const pages = [];
  const maxVisible = 5;
  let start = Math.max(1, currentPage - 2);
  let end = Math.min(totalPages, start + maxVisible - 1);
  if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1);
  for (let page = start; page <= end; page += 1) pages.push(page);
  return pages;
}

function createLessons(subject, seed) {
  const catalogs = {
    Physics: [
      ['Quantum Mechanics', 'PHYS-401', 'Wave-Particle Duality', '2 hours'],
      ['Classical Mechanics', 'PHYS-201', "Newton's Laws", '1.5 hours'],
      ['Electromagnetism', 'PHYS-301', "Maxwell's Equations", '2 hours'],
      ['Thermodynamics', 'PHYS-205', 'Entropy and Heat Engines', '1.5 hours'],
    ],
    Chemistry: [
      ['Organic Chemistry', 'CHEM-301', 'Reaction Mechanisms', '2 hours'],
      ['Analytical Chemistry', 'CHEM-401', 'Chromatography Techniques', '1.5 hours'],
      ['General Chemistry', 'CHEM-101', 'Chemical Bonding', '1.5 hours'],
      ['Physical Chemistry', 'CHEM-205', 'Thermochemistry', '2 hours'],
    ],
    Mathematics: [
      ['Advanced Calculus', 'MATH-301', 'Differential Equations', '2 hours'],
      ['Linear Algebra', 'MATH-201', 'Eigenvalues and Eigenvectors', '1.5 hours'],
      ['Probability', 'MATH-205', 'Probability Distributions', '1.5 hours'],
      ['Coordinate Geometry', 'MATH-207', 'Conic Sections', '2 hours'],
    ],
    Biology: [
      ['Molecular Biology', 'BIO-401', 'DNA Replication', '2 hours'],
      ['Cell Biology', 'BIO-201', 'Cell Division', '1.5 hours'],
      ['Genetics', 'BIO-301', 'Gene Expression', '2 hours'],
      ['Human Physiology', 'BIO-205', 'Nervous System', '1.5 hours'],
    ],
  };
  const selected = catalogs[subject] || catalogs.Mathematics;
  return selected.map((entry, index) => ({
    courseName: entry[0],
    courseCode: entry[1],
    chapterName: entry[2],
    duration: entry[3],
    id: `${subject}-${seed}-${index}`,
  }));
}

function normalizeInstructor(instructor, index) {
  const expertSubject = instructor.expertSubject || instructor.specialization || 'Mathematics';
  const qualifications =
    instructor.qualifications ||
    `${instructor.institution || 'IISER Pune'}, Certified Educator, ${(index % 5) + 6}+ years of academic mentoring`;
  const experience = Number(instructor.experienceYears || instructor.experience || (index % 7) + 6);
  const isActive = instructor.active ?? (instructor.status === 'active' || instructor.status === 1);
  const lessons = instructor.lessons || createLessons(expertSubject, index);
  return {
    ...instructor,
    brief: instructor.brief || instructor.bio || `${expertSubject} educator with structured live sessions and exam-focused delivery.`,
    photo: instructor.photo || null,
    expertSubject,
    qualifications,
    experience,
    experienceYears: experience,
    email: instructor.email || `${instructor.name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/(^\.|\.$)/g, '')}@crisprlearning.com`,
    mobile: instructor.mobile || instructor.phone || `+91 ${String(9000000000 + index + 1).slice(0, 10)}`,
    phone: instructor.phone || instructor.mobile || `+91 ${String(9000000000 + index + 1).slice(0, 10)}`,
    bio:
      instructor.bio ||
      `${instructor.name} brings ${experience} years of ${expertSubject.toLowerCase()} teaching experience with strong classroom delivery and chapter-level content ownership.`,
    rating: instructor.rating || Number((4.4 + ((index % 6) + 1) / 10).toFixed(1)),
    totalStudents: instructor.totalStudents || 140 + index * 22,
    lessonCount: lessons.length,
    lessons,
    active: isActive,
    status: isActive ? 1 : 0,
  };
}

function sortInstructors(rows, sortColumn, sortReverse) {
  const sorted = [...rows];
  sorted.sort((left, right) => {
    let aValue = '';
    let bValue = '';
    switch (sortColumn) {
      case 'name':
        aValue = left.name.toLowerCase();
        bValue = right.name.toLowerCase();
        break;
      case 'expertSubject':
        aValue = left.expertSubject.toLowerCase();
        bValue = right.expertSubject.toLowerCase();
        break;
      case 'experience':
        aValue = left.experience;
        bValue = right.experience;
        break;
      case 'lessonCount':
        aValue = left.lessonCount;
        bValue = right.lessonCount;
        break;
      default:
        aValue = left.name.toLowerCase();
        bValue = right.name.toLowerCase();
        break;
    }
    if (aValue < bValue) return sortReverse ? 1 : -1;
    if (aValue > bValue) return sortReverse ? -1 : 1;
    return 0;
  });
  return sorted;
}

export default function InstructorPortfolioPage() {
  const { can } = usePermission();
  const [instructors, setInstructors] = useState(() => instructorsDemo.map(normalizeInstructor));
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebouncedValue(searchQuery);
  const [filterSubject, setFilterSubject] = useState('');
  const [sortColumn, setSortColumn] = useState('');
  const [sortReverse, setSortReverse] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalInstructors, setTotalInstructors] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [isInstructorProfileLoading, setIsInstructorProfileLoading] = useState(false);
  const [activeKebabId, setActiveKebabId] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [lessonsModalOpen, setLessonsModalOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentInstructor, setCurrentInstructor] = useState(null);
  const [selectedInstructor, setSelectedInstructor] = useState(null);
  // Direct link / Spotlight result: /instructor-portfolio?id=<id>
  const [searchParams] = useSearchParams();
  const instructorIdFromUrl = searchParams.get('id');
  const autoOpenedIdRef = useRef(null);
  const [listLoadedOnce, setListLoadedOnce] = useState(false);
  const [instructorToDelete, setInstructorToDelete] = useState(null);
  const [selectedInstructorForLessons, setSelectedInstructorForLessons] = useState(null);
  const [toasts, setToasts] = useState([]);
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

  const loadInstructors = useCallback(async (isCancelled = { current: false }) => {
    setIsLoading(true);
    const isLocalWebPreview = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    try {
      const response = await api.get('/admin/people/instructor/list', {
        params: {
          page: currentPage,
          size: pageSize,
          sortBy: sortColumn || 'name',
          sortOrder: sortReverse ? 'DESC' : 'ASC',
          searchKey: debouncedSearchQuery.trim() || undefined,
          filterBy: filterSubject || undefined,
        },
      });

      if (response.data?.status === 'success') {
        const rows = (response.data.data || []).map((instructor, idx) => normalizeInstructor(instructor, idx));
        if (!isCancelled.current) {
          setInstructors(rows);
          setTotalInstructors(response.data.meta?.total || 0);
          setTotalPages(response.data.meta?.totalPages || 1);
          setCurrentPage(response.data.meta?.page || 1);
          setIsDemoMode(false);
        }
        return;
      }
      throw new Error(response.data?.message || 'Failed to load instructors');
    } catch (error) {
      if (isCancelled.current) return;
      
      // Demo Fallback
      let rows = instructorsDemo.map(normalizeInstructor);
      const query = debouncedSearchQuery.trim().toLowerCase();
      if (query) {
        rows = rows.filter((instructor) =>
          [instructor.name, instructor.expertSubject, instructor.qualifications, instructor.brief]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(query))
        );
      }
      if (filterSubject) {
        rows = rows.filter((instructor) => instructor.expertSubject === filterSubject);
      }
      
      // Sorting for demo
      rows.sort((a, b) => {
        let aV = (a[sortColumn] || '').toString().toLowerCase();
        let bV = (b[sortColumn] || '').toString().toLowerCase();
        if (aV < bV) return sortReverse ? 1 : -1;
        if (aV > bV) return sortReverse ? -1 : 1;
        return 0;
      });

      const total = rows.length;
      const pages = Math.max(1, Math.ceil(total / pageSize));
      const page = Math.min(currentPage, pages);
      const start = (page - 1) * pageSize;

      if (!isCancelled.current) {
        setInstructors(rows.slice(start, start + pageSize));
        setTotalInstructors(total);
        setTotalPages(pages);
        setCurrentPage(page);
        setIsDemoMode(true);
        if (isLocalWebPreview) {
          showToast('info', 'Demo Data', 'Loaded demo instructor profiles because the instructor API is unreachable.');
        } else {
          showToast('error', 'Network Error', error.message || 'Error loading instructors.');
        }
      }
    } finally {
      if (!isCancelled.current) { setIsLoading(false); setListLoadedOnce(true); }
    }
  }, [currentPage, pageSize, sortColumn, sortReverse, debouncedSearchQuery, filterSubject]);

  const fetchInstructorProfile = useCallback(async (isCancelled = { current: false }) => {
    if (!viewModalOpen || !selectedInstructor?.id || isDemoMode) return;

    setIsInstructorProfileLoading(true);
    try {
      const response = await api.get(`/admin/people/instructor/profile?id=${selectedInstructor.id}`);
      if (response.data?.status === 'success' && !isCancelled.current) {
        const detailed = normalizeInstructor(response.data.data, 0);
        setSelectedInstructor(detailed);
      }
    } catch (error) {
      // Fallback: selectedInstructor already has basic data
    } finally {
      if (!isCancelled.current) setIsInstructorProfileLoading(false);
    }
  }, [viewModalOpen, selectedInstructor?.id, isDemoMode]);

  useEffect(() => {
    const isCancelled = { current: false };
    loadInstructors(isCancelled);
    return () => { isCancelled.current = true; };
  }, [loadInstructors]);

  useEffect(() => {
    const isCancelled = { current: false };
    fetchInstructorProfile(isCancelled);
    return () => { isCancelled.current = true; };
  }, [fetchInstructorProfile]);

  useEffect(() => {
    const handleClick = (event) => {
      if (kebabRef.current && !kebabRef.current.contains(event.target)) setActiveKebabId(null);
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const subjectList = useMemo(() => Array.from(new Set(instructors.map((instructor) => instructor.expertSubject))).sort(), [instructors]);

  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedInstructors = instructors;
  const pageNumbers = useMemo(() => getPageNumbers(safeCurrentPage, totalPages), [safeCurrentPage, totalPages]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  function sortIcon(column) {
    if (sortColumn !== column) return 'ti-arrows-vertical';
    return sortReverse ? 'ti-arrow-down' : 'ti-arrow-up';
  }

  function handleSort(column) {
    if (sortColumn === column) {
      setSortReverse((value) => !value);
    } else {
      setSortColumn(column);
      setSortReverse(false);
    }
  }

  function openCreateModal() {
    setEditMode(false);
    setCurrentInstructor({
      name: '',
      brief: '',
      photo: null,
      photoPreview: null,
      expertSubject: '',
      qualifications: '',
      experienceYears: '',
      email: '',
      phone: '',
      mobile: '',
      bio: '',
      active: true,
      status: 1,
      lessons: [],
    });
    setEditModalOpen(true);
  }

  function openEditModal(instructor) {
    setEditMode(true);
    setCurrentInstructor({ ...instructor, photoPreview: null });
    setEditModalOpen(true);
    setActiveKebabId(null);
  }

  async function saveInstructor() {
    if (
      !currentInstructor?.name ||
      !currentInstructor?.brief ||
      !currentInstructor?.expertSubject ||
      !currentInstructor?.qualifications ||
      !(currentInstructor?.experienceYears || currentInstructor?.experience)
    ) {
      showToast('info', 'Notification', 'Please fill in all required fields');
      return;
    }

    // API Add/Update logic
    if (!isDemoMode) {
      try {
        const formData = new FormData();
        formData.append('name', currentInstructor.name);
        formData.append('brief', currentInstructor.brief);
        formData.append('expertSubject', currentInstructor.expertSubject);
        formData.append('qualifications', currentInstructor.qualifications);
        formData.append('experienceYears', currentInstructor.experienceYears || currentInstructor.experience);
        if (currentInstructor.email) formData.append('email', currentInstructor.email);
        if (currentInstructor.mobile || currentInstructor.phone) formData.append('mobile', currentInstructor.mobile || currentInstructor.phone);

        const url = editMode && currentInstructor.id 
          ? `/admin/people/instructor/update?id=${currentInstructor.id}`
          : '/admin/people/instructor/add';

        const response = await api.post(url, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });

        if (response.data?.status === 'success') {
          showToast('success', editMode ? 'Instructor Updated' : 'Instructor Created', `${currentInstructor.name} ${editMode ? 'updated' : 'created'} successfully.`);
          setEditModalOpen(false);
          setCurrentInstructor(null);
          loadInstructors();
          return;
        }
        throw new Error(response.data?.message || 'Operation failed');
      } catch (error) {
        showToast('error', 'Error', error.message || 'Error processing request.');
        return;
      }
    }

    // Fallback/Create logic
    const experience = Number(currentInstructor.experienceYears || currentInstructor.experience || 0);
    const payload = normalizeInstructor(
      {
        ...currentInstructor,
        experienceYears: experience,
        experience,
        status: currentInstructor.active !== false ? 1 : 0,
        active: currentInstructor.active !== false,
        lessons: currentInstructor.lessons?.length ? currentInstructor.lessons : createLessons(currentInstructor.expertSubject, instructors.length + 1),
      },
      instructors.length + 1
    );

    if (editMode && payload.id) {
      setInstructors((current) => current.map((instructor) => (instructor.id === payload.id ? payload : instructor)));
      showToast('success', 'Instructor Updated', `${payload.name} updated successfully.`);
    } else {
      const created = { ...payload, id: `I-${Date.now()}` };
      setInstructors((current) => [created, ...current]);
      showToast('success', 'Instructor Created', `${created.name} created successfully.`);
    }

    setEditModalOpen(false);
    setCurrentInstructor(null);
  }

  function viewInstructor(instructor) {
    setSelectedInstructor(instructor);
    setViewModalOpen(true);
    setActiveKebabId(null);
  }

  // Open the profile modal when ?id is present (once per id, after the list
  // has loaded so the row can prime the modal before the profile fetch).
  useEffect(() => {
    if (!instructorIdFromUrl) {
      autoOpenedIdRef.current = null;
      return;
    }
    if (autoOpenedIdRef.current === instructorIdFromUrl) return;
    const found = instructors.find((i) => String(i.id) === String(instructorIdFromUrl));
    if (!found && (isLoading || !listLoadedOnce)) return;
    autoOpenedIdRef.current = instructorIdFromUrl;
    if (!found && isDemoMode) {
      showToast('error', 'Teacher Not Found', `No instructor profile found for ID ${instructorIdFromUrl}.`);
      return;
    }
    setSelectedInstructor(found || { id: instructorIdFromUrl });
    setViewModalOpen(true);
  }, [instructorIdFromUrl, instructors, isLoading, listLoadedOnce, isDemoMode]);

  function editFromView() {
    if (!selectedInstructor) return;
    setViewModalOpen(false);
    openEditModal(selectedInstructor);
  }

  function confirmDelete(instructor) {
    setInstructorToDelete(instructor);
    setDeleteModalOpen(true);
    setActiveKebabId(null);
  }

  function deleteInstructor() {
    if (!instructorToDelete) return;
    setInstructors((current) => current.filter((instructor) => instructor.id !== instructorToDelete.id));
    setDeleteModalOpen(false);
    showToast('success', 'Instructor Deleted', `${instructorToDelete.name} deleted successfully.`);
    setInstructorToDelete(null);
  }

  function viewInstructorLessons(instructor) {
    setSelectedInstructorForLessons(instructor);
    setLessonsModalOpen(true);
  }

  const startIndex = totalInstructors === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const endIndex = Math.min(safeCurrentPage * pageSize, totalInstructors);

  return (
    <section className="instructor-portfolio-page data-table-page">
      <ToastRegion toasts={toasts} onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />

      <div className="page-header-section">
        <div className="page-header-title-group">
          <span className="page-header-icon-box"><Icon className="fa fa-male" /></span>
          <div>
            <h2>Instructor Management</h2>
            <p>Manage instructor portfolios, subject ownership, and lesson contributions without changing the legacy workflow.</p>
          </div>
        </div>
        <Can permission={PERMS.INSTRUCTORS_EDIT}>
          <button type="button" className="create-instructor-button" onClick={openCreateModal}>
            <Icon className="ti ti-plus" /> New Portfolio
          </button>
        </Can>
      </div>

      <div className="filter-bar">
        <div className="search-wrapper">
          <Icon className={`ti ${searchQuery ? 'ti-close' : 'ti-search'}`} onClick={() => setSearchQuery('')} />
          <input
            type="text"
            className="search-input"
            placeholder="Search by name, subject, or qualifications..."
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setCurrentPage(1);
            }}
          />
        </div>
        <FilterDropdown
          label="All Subjects"
          value={filterSubject}
          options={[
            { value: '', label: 'All Subjects' },
            ...subjectList.map((subject) => ({ value: subject, label: subject })),
          ]}
          onChange={(value) => { setFilterSubject(value); setCurrentPage(1); }}
        />
      </div>

      {(totalInstructors > 0 || isLoading) && (
        <div className="students-table-container">
          <table className="students-table">
            <thead>
              <tr>
                <th className={`sortable ${sortColumn === 'name' ? 'active' : ''}`} onClick={() => handleSort('name')}>
                  Instructor
                  <Icon className={`sort-icon ti ${sortIcon('name')}`} />
                </th>
                <th>Brief</th>
                <th className={`sortable ${sortColumn === 'expertSubject' ? 'active' : ''}`} onClick={() => handleSort('expertSubject')}>
                  Expert Subject
                  <Icon className={`sort-icon ti ${sortIcon('expertSubject')}`} />
                </th>
                <th>Qualifications</th>
                <th className={`sortable ${sortColumn === 'experience' ? 'active' : ''}`} onClick={() => handleSort('experience')}>
                  Experience
                  <Icon className={`sort-icon ti ${sortIcon('experience')}`} />
                </th>
                <th className={`sortable ${sortColumn === 'lessonCount' ? 'active' : ''}`} onClick={() => handleSort('lessonCount')}>
                  Contribution
                  <Icon className={`sort-icon ti ${sortIcon('lessonCount')}`} />
                </th>
                <th className="actions-column" />
              </tr>
            </thead>
            {isLoading ? (
              <tbody>
                {Array.from({ length: pageSize }, (_, index) => (
                  <tr key={`instructor-skeleton-${index}`}>
                    <td>
                      <div className="instructor-skeleton-profile">
                        <div className="instructor-skeleton avatar" />
                        <div className="instructor-skeleton medium" />
                      </div>
                    </td>
                    <td><div className="instructor-skeleton long" /></td>
                    <td><div className="instructor-skeleton short" /></td>
                    <td><div className="instructor-skeleton medium" /></td>
                    <td><div className="instructor-skeleton short" /></td>
                    <td><div className="instructor-skeleton short" /></td>
                    <td />
                  </tr>
                ))}
              </tbody>
            ) : (
              <tbody ref={kebabRef}>
                {paginatedInstructors.map((instructor) => (
                  <tr key={instructor.id}>
                    <td>
                      <div className="profile-cell">
                        <Avatar
                          src={instructor.photo}
                          name={instructor.name}
                          className="avatar"
                          placeholderClassName="avatar-placeholder"
                        />
                        <div>
                          <button
                            type="button"
                            className="profile-name name-link"
                            title="View profile"
                            onClick={(e) => { e.stopPropagation(); viewInstructor(instructor); }}
                          >
                            {instructor.name}
                          </button>
                        </div>
                      </div>
                    </td>
                    <td><div className="instructor-brief">{instructor.brief}</div></td>
                    <td><span className="subject-badge">{instructor.expertSubject}</span></td>
                    <td><div className="qualifications-list">{instructor.qualifications}</div></td>
                    <td><span className="experience-badge">{instructor.experience} years</span></td>
                    <td onClick={(event) => event.stopPropagation()}>
                      <button type="button" className="lesson-count-button" onClick={() => viewInstructorLessons(instructor)} title="View lessons taught by this instructor">
                        {instructor.lessons?.length || 0} Lessons
                      </button>
                    </td>
                    <td className="instructor-actions-cell" onClick={(event) => event.stopPropagation()}>
                      <div className="kebab-menu-container">
                        <button type="button" className="kebab-button" onClick={(event) => { event.stopPropagation(); setActiveKebabId((current) => (current === instructor.id ? null : instructor.id)); }}>
                          <Icon className="ti ti-more-alt" />
                        </button>
                        <div className={`kebab-dropdown ${activeKebabId === instructor.id ? 'active' : ''}`}>
                          <button type="button" className="kebab-dropdown-item" onClick={() => viewInstructor(instructor)}>
                            <Icon className="ti ti-user" />
                            <span>View Profile</span>
                          </button>
                          {can(PERMS.INSTRUCTORS_EDIT) && (
                            <button type="button" className="kebab-dropdown-item edit-action" onClick={() => openEditModal(instructor)}>
                              <Icon className="ti ti-pencil" />
                              <span>Edit Instructor</span>
                            </button>
                          )}
                          {can(PERMS.INSTRUCTORS_DELETE) && (
                            <button type="button" className="kebab-dropdown-item delete-action" onClick={() => confirmDelete(instructor)}>
                              <Icon className="ti ti-trash" />
                              <span>Delete Instructor</span>
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
              <span>Showing {startIndex} to {endIndex} of {totalInstructors} instructors</span>
              <select
                className="page-size-select"
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setCurrentPage(1);
                }}
              >
                {[10, 20, 50, 100].map((size) => (
                  <option key={size} value={size}>Show {size}</option>
                ))}
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
      )}

      {!isLoading && totalInstructors === 0 ? (
        <div className="students-table-container">
          <div className="empty-state">
            <h4>No Portfolios Found</h4>
            <p>{searchQuery || filterSubject ? 'No Portfolios match your search criteria.' : 'No Portfolios added yet'}</p>
          </div>
        </div>
      ) : null}

      <div className={`legacy-modal-backdrop ${editModalOpen ? 'active' : ''}`} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditModalOpen(false); }}>
        <div className="legacy-modal-dialog legacy-large" role="dialog" aria-modal="true">
          <div className="legacy-modal-header">
            <h3>{editMode ? 'Edit Instructor' : 'Add New Instructor'}</h3>
            <button type="button" className="legacy-modal-close" onClick={() => setEditModalOpen(false)}>
              <Icon className="ti ti-close" />
            </button>
          </div>
          <form className="batch-modal-form form-modal" onSubmit={(event) => { event.preventDefault(); saveInstructor(); }}>
          <div className="legacy-modal-body">
            <div className="asset-form-section">
              <div className="asset-form-section-title"><Icon className="ti ti-info-circle" /> Basic Information</div>
              <div className="asset-form-grid basic-grid">
                <label className="field-cell full-span">
                  <div className="float-field">
                    <input type="text" className="float-control" placeholder=" " value={currentInstructor?.name || ''} onChange={(event) => setCurrentInstructor((current) => ({ ...current, name: event.target.value }))} />
                    <span className="float-label">Instructor Name <span className="req">*</span></span>
                  </div>
                </label>
                <label className="field-cell full-span">
                  <div className="float-field float-textarea">
                    <textarea className="float-control" placeholder=" " value={currentInstructor?.brief || ''} onChange={(event) => setCurrentInstructor((current) => ({ ...current, brief: event.target.value }))} />
                    <span className="float-label">Brief Description <span className="req">*</span></span>
                  </div>
                </label>
                <div className="field-cell full-span">
                  <div className="field-static-label">Profile Photo <span className="field-hint-inline">(Optional)</span></div>
                  <div className="mentor-photo-upload">
                    {currentInstructor?.photo || currentInstructor?.photoPreview ? (
                      <img src={currentInstructor.photoPreview || currentInstructor.photo} alt="Preview" className="mentor-photo-preview" />
                    ) : (
                      <div className="mentor-photo-placeholder"><Icon className="ti ti-camera" /></div>
                    )}
                    <div className="mentor-photo-meta">
                      <span className="file-name"><Icon className="ti ti-info-alt" /> JPG, PNG (Max 2MB)</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="asset-form-section">
              <div className="asset-form-section-title"><Icon className="ti ti-school" /> Professional Details</div>
              <div className="asset-form-grid">
                <label className="field-cell">
                  <div className="float-field">
                    <input type="text" className="float-control" placeholder=" " value={currentInstructor?.expertSubject || ''} onChange={(event) => setCurrentInstructor((current) => ({ ...current, expertSubject: event.target.value }))} />
                    <span className="float-label">Expert Subject <span className="req">*</span></span>
                  </div>
                </label>
                <label className="field-cell">
                  <div className="float-field">
                    <input type="number" className="float-control" placeholder=" " value={currentInstructor?.experienceYears || currentInstructor?.experience || ''} onChange={(event) => setCurrentInstructor((current) => ({ ...current, experienceYears: event.target.value }))} />
                    <span className="float-label">Years of Experience <span className="req">*</span></span>
                  </div>
                </label>
                <label className="field-cell full-span">
                  <div className="float-field float-textarea">
                    <textarea className="float-control" placeholder=" " value={currentInstructor?.qualifications || ''} onChange={(event) => setCurrentInstructor((current) => ({ ...current, qualifications: event.target.value }))} />
                    <span className="float-label">Qualifications <span className="req">*</span></span>
                  </div>
                </label>
              </div>
            </div>

            <div className="asset-form-section">
              <div className="asset-form-section-title"><Icon className="ti ti-address-book" /> Additional Information <span className="field-hint-inline">(Optional)</span></div>
              <div className="asset-form-grid">
                <label className="field-cell">
                  <div className="float-field">
                    <input type="email" className="float-control" placeholder=" " value={currentInstructor?.email || ''} onChange={(event) => setCurrentInstructor((current) => ({ ...current, email: event.target.value }))} />
                    <span className="float-label">Email</span>
                  </div>
                </label>
                <label className="field-cell">
                  <div className="float-field">
                    <input type="tel" className="float-control" placeholder=" " value={currentInstructor?.phone || currentInstructor?.mobile || ''} onChange={(event) => setCurrentInstructor((current) => ({ ...current, phone: event.target.value, mobile: event.target.value }))} />
                    <span className="float-label">Phone</span>
                  </div>
                </label>
              </div>
            </div>
          </div>
          <div className="legacy-modal-footer">
            <button type="button" className="legacy-btn legacy-btn-default" onClick={() => setEditModalOpen(false)}>Cancel</button>
            <button
              type="submit"
              className="legacy-btn legacy-btn-success"
              disabled={!currentInstructor?.name || !currentInstructor?.brief || !currentInstructor?.expertSubject || !currentInstructor?.qualifications || !(currentInstructor?.experienceYears || currentInstructor?.experience)}
            >
              {editMode ? 'Update Instructor' : 'Create Instructor'}
            </button>
          </div>
          </form>
        </div>
      </div>

      <div className={`legacy-modal-backdrop ${deleteModalOpen ? 'active' : ''}`} onClick={() => setDeleteModalOpen(false)}>
        <div className="legacy-modal-dialog legacy-confirm" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
          <div className="legacy-modal-header legacy-danger-header">
            <h3><Icon className="ti ti-alert" /> Confirm Delete</h3>
            <button type="button" className="legacy-modal-close" onClick={() => setDeleteModalOpen(false)}>
              <Icon className="ti ti-close" />
            </button>
          </div>
          <div className="legacy-modal-body">
            <p className="legacy-confirm-copy">Are you sure you want to delete <strong>{instructorToDelete?.name}</strong>?</p>
            <p className="instructor-delete-note">This action cannot be undone. All course chapter assignments for this instructor will need to be reassigned.</p>
          </div>
          <div className="legacy-modal-footer">
            <button type="button" className="legacy-btn legacy-btn-default" onClick={() => setDeleteModalOpen(false)}>Cancel</button>
            <button type="button" className="legacy-btn legacy-btn-danger" onClick={deleteInstructor}>
              <Icon className="ti ti-trash" /> Delete Instructor
            </button>
          </div>
        </div>
      </div>

      <div className={`legacy-modal-backdrop ${viewModalOpen ? 'active' : ''}`} onClick={() => setViewModalOpen(false)}>
        <div className="legacy-modal-dialog legacy-large" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
          <div className="legacy-modal-header">
            <h3><Icon className="ti ti-user" /> Instructor Profile</h3>
            <button type="button" className="legacy-modal-close" onClick={() => setViewModalOpen(false)}>
              <Icon className="ti ti-close" />
            </button>
          </div>
          <div className={`instructor-view-body ${isInstructorProfileLoading ? 'is-loading' : ''}`}>
            {isInstructorProfileLoading && (
              <div className="mentor-view-loading">
                <Icon className="ti ti-reload rotate" /> Loading detailed profile...
              </div>
            )}
            {selectedInstructor ? (
              <>
                <div className="mentor-profile-hero">
                  <div className="mentor-profile-avatar-shell">
                    <Avatar
                      src={selectedInstructor.photo}
                      name={selectedInstructor.name}
                      className="mentor-profile-avatar"
                      placeholderClassName="mentor-profile-avatar placeholder"
                    />
                    {selectedInstructor.active ? <div className="mentor-profile-active-dot" /> : null}
                  </div>
                  <div className="mentor-profile-copy">
                    <h2>{selectedInstructor.name}</h2>
                    <p>{selectedInstructor.brief}</p>
                    <div className="mentor-profile-rating">
                      <div className="mentor-rating-group">
                        <Icon className="fa fa-star" />
                        <span className="mentor-rating-value">{selectedInstructor.rating}</span>
                        <span className="mentor-rating-max">/5.0</span>
                      </div>
                      <div className="mentor-rating-divider" />
                      <div className="mentor-rating-students">
                        <Icon className="ti ti-users" /> {selectedInstructor.totalStudents} Students
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mentor-profile-grid">
                  <div className="profile-info-card">
                    <div className="profile-info-icon blue"><Icon className="ti ti-bookmark" /></div>
                    <div><div className="profile-info-label">Expert Subject</div><div className="profile-info-value">{selectedInstructor.expertSubject}</div></div>
                  </div>
                  <div className="profile-info-card">
                    <div className="profile-info-icon amber"><Icon className="ti ti-briefcase" /></div>
                    <div><div className="profile-info-label">Experience</div><div className="profile-info-value">{selectedInstructor.experience} years</div></div>
                  </div>
                  {selectedInstructor.qualifications ? (
                    <div className="profile-info-card wide">
                      <div className="profile-info-icon amber"><Icon className="ti ti-medal" /></div>
                      <div><div className="profile-info-label">Qualifications</div><div className="profile-info-value multiline">{selectedInstructor.qualifications}</div></div>
                    </div>
                  ) : null}
                  {selectedInstructor.email ? (
                    <div className="profile-info-card">
                      <div className="profile-info-icon indigo"><Icon className="ti ti-email" /></div>
                      <div><div className="profile-info-label">Email Address</div><div className="profile-info-value truncatable">{selectedInstructor.email}</div></div>
                    </div>
                  ) : null}
                  {selectedInstructor.mobile ? (
                    <div className="profile-info-card">
                      <div className="profile-info-icon green"><Icon className="ti ti-mobile" /></div>
                      <div><div className="profile-info-label">Mobile Number</div><div className="profile-info-value">{selectedInstructor.mobile}</div></div>
                    </div>
                  ) : null}
                </div>
                {selectedInstructor.bio ? (
                  <div className="instructor-about-panel">
                    <div className="instructor-about-title"><Icon className="ti ti-info-alt" /> <strong>About</strong></div>
                    <p>{selectedInstructor.bio}</p>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
          <div className="legacy-modal-footer">
            <button type="button" className="legacy-btn legacy-btn-success" onClick={editFromView}>
              <Icon className="ti ti-pencil" /> Edit Instructor
            </button>
            <button type="button" className="legacy-btn legacy-btn-default" onClick={() => setViewModalOpen(false)}>
              <Icon className="ti ti-close" /> Close
            </button>
          </div>
        </div>
      </div>

      <div className={`legacy-modal-backdrop ${lessonsModalOpen ? 'active' : ''}`} onClick={() => setLessonsModalOpen(false)}>
        <div className="legacy-modal-dialog legacy-large" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
          <div className="legacy-modal-header">
            <h3><Icon className="ti ti-book" /> Lessons Taught by {selectedInstructorForLessons?.name}</h3>
            <button type="button" className="legacy-modal-close" onClick={() => setLessonsModalOpen(false)}>
              <Icon className="ti ti-close" />
            </button>
          </div>
          <div className="legacy-modal-body">
            {selectedInstructorForLessons?.lessons?.length ? (
              <>
                <p className="lessons-modal-copy">
                  <strong>{selectedInstructorForLessons.name}</strong> has contributed to <strong>{selectedInstructorForLessons.lessons.length}</strong> lesson(s) across different courses.
                </p>
                <div className="mentor-scroll-table tall">
                  <table className="instructors-lessons-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Course Name</th>
                        <th>Chapter/Lesson</th>
                        <th>Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedInstructorForLessons.lessons.map((lesson, index) => (
                        <tr key={lesson.id || `${lesson.courseCode}-${index}`}>
                          <td className="centered-cell">{index + 1}</td>
                          <td>
                            <div className="lesson-course-name">{lesson.courseName}</div>
                            <div className="lesson-course-code">{lesson.courseCode}</div>
                          </td>
                          <td><div className="lesson-chapter-name">{lesson.chapterName}</div></td>
                          <td className="lesson-duration">{lesson.duration || 'N/A'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="empty-state compact">
                <Icon className="ti ti-book" />
                <h4>No Lessons Assigned</h4>
                <p>This instructor hasn't been assigned to any lessons yet.</p>
              </div>
            )}
          </div>
          <div className="legacy-modal-footer">
            <button type="button" className="legacy-btn legacy-btn-default" onClick={() => setLessonsModalOpen(false)}>Close</button>
          </div>
        </div>
      </div>
    </section>
  );
}
