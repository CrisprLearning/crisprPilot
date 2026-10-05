import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import ToastRegion from '../components/ToastRegion';
import FilterDropdown from '../components/FilterDropdown';
import Avatar from '../components/Avatar';
import { Can, usePermission } from '../lib/userStore';
import { PERMS } from '../lib/permissions';
import { mentorsDemo } from '../data/adminRemainingDemo';
import Icon from '../components/Icon';


function getPageNumbers(currentPage, totalPages) {
  const pages = [];
  const maxPagesToShow = 5;
  let startPage = Math.max(1, currentPage - 2);
  let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);
  if (endPage - startPage < maxPagesToShow - 1) startPage = Math.max(1, endPage - maxPagesToShow + 1);
  for (let page = startPage; page <= endPage; page += 1) pages.push(page);
  return pages;
}

function createStudent(seed, mentorId) {
  const firstNames = ['Aarav', 'Diya', 'Sneha', 'Rahul', 'Ananya', 'Farhan', 'Nikhil', 'Megha', 'Ritika', 'Arjun'];
  const lastNames = ['Nair', 'Joseph', 'Menon', 'Patel', 'Iyer', 'Khan', 'Thomas', 'S', 'Raj', 'Varma'];
  const firstName = firstNames[seed % firstNames.length];
  const lastName = lastNames[seed % lastNames.length];
  return {
    id: `${mentorId}-student-${seed + 1}`,
    name: `${firstName} ${lastName}`,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/[^a-z]/g, '')}${seed + 1}@example.com`,
    phone: `+91 ${String(9000000000 + seed + 1).slice(0, 10)}`,
    mobile: `+91 ${String(9000000000 + seed + 1).slice(0, 10)}`,
    enrolledCourses: (seed % 4) + 1,
    status: seed % 5 === 0 ? 'Inactive' : 'Active',
  };
}

function createAvailableStudents() {
  return Array.from({ length: 80 }, (_, index) => {
    const student = createStudent(index + 20, 'available');
    return {
      ...student,
      id: `available-student-${index + 1}`,
      status: index % 5 === 0 ? 'inactive' : 'active',
    };
  });
}

function normalizeMentor(mentor, index) {
  const specialisation = mentor.specialisation || mentor.specialization || 'IAT Mentorship';
  const almaMater = mentor.almaMater || mentor.institution || 'IISER Pune';
  const graduationYear = mentor.graduationYear || 2018 + index;
  const studentCount = mentor.studentCount ?? mentor.assignedStudents ?? 0;
  const isActive = mentor.active ?? (mentor.status === 'active' || mentor.status === 1);
  return {
    ...mentor,
    brief: mentor.bio || mentor.brief || `${specialisation} mentor with structured student guidance and weekly review routines.`,
    photo: mentor.photo || null,
    specialisation,
    almaMater,
    graduationYear,
    studentCount,
    active: isActive,
    status: isActive ? 1 : 0,
    rating: mentor.rating || Number((4 + ((index % 8) + 1) / 10).toFixed(1)),
    totalStudents: mentor.totalStudents || studentCount,
    mentoringStudents: Array.from({ length: Math.max(studentCount, 3) }, (_, studentIndex) => createStudent(studentIndex, mentor.id)),
  };
}

function sortMentors(rows, sortColumn, sortReverse) {
  const sorted = [...rows];
  sorted.sort((left, right) => {
    let aValue = '';
    let bValue = '';
    switch (sortColumn) {
      case 'name':
        aValue = left.name.toLowerCase();
        bValue = right.name.toLowerCase();
        break;
      case 'institution':
        aValue = left.almaMater.toLowerCase();
        bValue = right.almaMater.toLowerCase();
        break;
      case 'specialization':
        aValue = left.specialisation.toLowerCase();
        bValue = right.specialisation.toLowerCase();
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

function starClass(rating, index) {
  const value = index + 1;
  if (rating >= value) return 'fa-star';
  if (rating >= value - 0.5) return 'fa-star-half-o';
  return 'fa-star-o';
}

export default function MentorProfilesPage() {
  const { can } = usePermission();
  const [searchParams, setSearchParams] = useSearchParams();
  const mentorIdFromUrl = searchParams.get('id');
  const autoOpenedIdRef = useRef(null);
  const [mentors, setMentors] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSpecialization, setFilterSpecialization] = useState('');
  const [sortColumn, setSortColumn] = useState('name');
  const [sortReverse, setSortReverse] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalMentors, setTotalMentors] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [activeKebabId, setActiveKebabId] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [studentsModalOpen, setStudentsModalOpen] = useState(false);
  const [manageMenteesModalOpen, setManageMenteesModalOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentMentor, setCurrentMentor] = useState(null);
  const [selectedMentor, setSelectedMentor] = useState(null);
  const [selectedMentorForStudents, setSelectedMentorForStudents] = useState(null);
  const [selectedMentorForManagement, setSelectedMentorForManagement] = useState(null);
  const [mentorToDelete, setMentorToDelete] = useState(null);
  const [studentsSearchKey, setStudentsSearchKey] = useState('');
  const [studentsCurrentPage, setStudentsCurrentPage] = useState(1);
  const [studentsPageSize] = useState(5);
  const [mappedStudents, setMappedStudents] = useState([]);
  const [mappedStudentsTotal, setMappedStudentsTotal] = useState(0);
  const [mappedStudentsPages, setMappedStudentsPages] = useState(1);
  const [isMappedStudentsLoading, setIsMappedStudentsLoading] = useState(false);
  const [isMentorProfileLoading, setIsMentorProfileLoading] = useState(false);
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);
  const [selectedMappedStudents, setSelectedMappedStudents] = useState({});
  const [menteeSearchQuery, setMenteeSearchQuery] = useState('');
  const [selectedMenteesToAdd, setSelectedMenteesToAdd] = useState({});
  const [menteeCurrentPage, setMenteeCurrentPage] = useState(1);
  const [menteePageSize] = useState(8);
  const kebabRef = useRef(null);
  const allAvailableStudents = useMemo(() => createAvailableStudents(), []);

  const showToast = (type, title, message) => {
    const id = toastIdRef.current + 1;
    toastIdRef.current = id;
    setToasts((current) => [...current, { id, type, title, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4500);
  };

  // Close the profile modal and drop the ?id from the URL (and tab title).
  const closeViewModal = useCallback(() => {
    setViewModalOpen(false);
    setSearchParams((sp) => {
      if (!sp.get('id')) return sp;
      const next = new URLSearchParams(sp);
      next.delete('id');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const loadMentors = useCallback(async (isCancelled = { current: false }) => {
    setIsLoading(true);
    const isLocalWebPreview = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    try {
      const response = await api.get('/admin/people/mentor/list', {
        params: {
          page: currentPage,
          size: pageSize,
          sortBy: sortColumn || 'name',
          sortOrder: sortReverse ? 'DESC' : 'ASC',
          searchKey: searchQuery.trim() || undefined,
          specialization: filterSpecialization || undefined,
        },
      });

      if (response.data?.status === 'success') {
        const rows = (response.data.data || []).map((mentor, idx) => normalizeMentor(mentor, idx));
        if (!isCancelled.current) {
          setMentors(rows);
          setTotalMentors(response.data.meta?.total || 0);
          setTotalPages(response.data.meta?.totalPages || 1);
          setCurrentPage(response.data.meta?.page || 1);
          setIsDemoMode(false);
        }
        return;
      }
      throw new Error(response.data?.message || 'Failed to load mentors');
    } catch (error) {
      if (isCancelled.current) return;
      
      // Demo Fallback
      let rows = mentorsDemo.map(normalizeMentor);
      const query = searchQuery.trim().toLowerCase();
      if (query) {
        rows = rows.filter((mentor) =>
          [mentor.name, mentor.specialisation, mentor.almaMater, mentor.brief]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(query))
        );
      }
      if (filterSpecialization) {
        rows = rows.filter((mentor) => mentor.specialisation === filterSpecialization);
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
        setMentors(rows.slice(start, start + pageSize));
        setTotalMentors(total);
        setTotalPages(pages);
        setCurrentPage(page);
        setIsDemoMode(true);
        if (isLocalWebPreview) {
          showToast('info', 'Demo Data', 'Loaded demo mentor profiles because the mentor API is unreachable.');
        } else {
          showToast('error', 'Network Error', error.message || 'Error loading mentors.');
        }
      }
    } finally {
      if (!isCancelled.current) setIsLoading(false);
    }
  }, [currentPage, pageSize, sortColumn, sortReverse, searchQuery, filterSpecialization]);

  const loadMappedStudents = useCallback(async (isCancelled = { current: false }) => {
    if (!selectedMentorForStudents) {
      setMappedStudents([]);
      setMappedStudentsTotal(0);
      setMappedStudentsPages(1);
      return;
    }

    setIsMappedStudentsLoading(true);
    try {
      const response = await api.get('/admin/people/mentor/get-mapped-candidates', {
        params: {
          id: selectedMentorForStudents.id,
          page: studentsCurrentPage,
          size: studentsPageSize,
          searchKey: studentsSearchKey.trim() || undefined,
        },
      });

      if (response.data?.status === 'success') {
        if (!isCancelled.current) {
          setMappedStudents(response.data.data || []);
          setMappedStudentsTotal(response.data.meta?.total || 0);
          setMappedStudentsPages(response.data.meta?.totalPages || 1);
        }
        return;
      }
    } catch (error) {
      if (isCancelled.current) return;
      
      // Demo Fallback
      const query = studentsSearchKey.trim().toLowerCase();
      let items = selectedMentorForStudents.mentoringStudents || [];
      if (query) {
        items = items.filter((student) =>
          [student.name, student.email, student.phone, student.mobile]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(query))
        );
      }

      const total = items.length;
      const pages = Math.max(1, Math.ceil(total / studentsPageSize));
      const page = Math.min(studentsCurrentPage, pages);
      const start = (page - 1) * studentsPageSize;

      if (!isCancelled.current) {
        setMappedStudents(items.slice(start, start + studentsPageSize));
        setMappedStudentsTotal(total);
        setMappedStudentsPages(pages);
        setStudentsCurrentPage(page);
      }
    } finally {
      if (!isCancelled.current) setIsMappedStudentsLoading(false);
    }
  }, [selectedMentorForStudents, studentsSearchKey, studentsCurrentPage, studentsPageSize]);

  useEffect(() => {
    const isCancelled = { current: false };
    loadMentors(isCancelled);
    return () => { isCancelled.current = true; };
  }, [loadMentors]);

  useEffect(() => {
    const isCancelled = { current: false };
    loadMappedStudents(isCancelled);
    return () => { isCancelled.current = true; };
  }, [loadMappedStudents]);

  useEffect(() => {
    const handleClick = (event) => {
      if (kebabRef.current && !kebabRef.current.contains(event.target)) setActiveKebabId(null);
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const specializationList = useMemo(() => {
    return Array.from(new Set(mentors.map((mentor) => mentor.specialisation))).sort();
  }, [mentors]);

  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedMentors = mentors; // In both cases, mentors state holds the current page
  const pageNumbers = useMemo(() => getPageNumbers(safeCurrentPage, totalPages), [safeCurrentPage, totalPages]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (!viewModalOpen || !selectedMentor?.id || isDemoMode) return;

    // A bare { id } (no name) means the modal was opened from a ?id deep link and
    // the mentor wasn't in the loaded list — it must resolve from the API, or we
    // close the modal and fall back to the listing.
    const isUnresolvedDeepLink = !selectedMentor.name;
    let isCancelled = false;

    async function fetchMentorProfile() {
      setIsMentorProfileLoading(true);
      try {
        const response = await api.get(`/admin/people/mentor/profile?id=${selectedMentor.id}`);
        if (isCancelled) return;
        if (response.data?.status === 'success' && response.data?.data) {
          setSelectedMentor(normalizeMentor(response.data.data, 0));
          return;
        }
        if (isUnresolvedDeepLink) {
          showToast('error', 'Mentor Not Found', `No mentor profile found for ID ${selectedMentor.id}.`);
          closeViewModal();
        }
      } catch (error) {
        if (isCancelled) return;
        // Only bail out when there's no list data to fall back on (deep link).
        if (isUnresolvedDeepLink) {
          showToast('error', 'Mentor Not Found', `No mentor profile found for ID ${selectedMentor.id}.`);
          closeViewModal();
        }
      } finally {
        if (!isCancelled) setIsMentorProfileLoading(false);
      }
    }

    fetchMentorProfile();
    return () => { isCancelled = true; };
  }, [viewModalOpen, selectedMentor?.id, isDemoMode, closeViewModal]);

  const safeStudentsPage = Math.min(studentsCurrentPage, mappedStudentsPages);
  const paginatedStudents = mappedStudents;
  const studentsTotalCount = mappedStudentsTotal;
  const studentsTotalPages = mappedStudentsPages;
  const studentPageNumbers = useMemo(() => getPageNumbers(safeStudentsPage, studentsTotalPages), [safeStudentsPage, studentsTotalPages]);

  useEffect(() => {
    if (studentsCurrentPage > studentsTotalPages) setStudentsCurrentPage(studentsTotalPages);
  }, [studentsCurrentPage, studentsTotalPages]);

  const filteredAvailableMentees = useMemo(() => {
    const query = menteeSearchQuery.trim().toLowerCase();
    return allAvailableStudents.filter((student) => {
      if (!selectedMentorForManagement) return false;
      const alreadyMapped = new Set((selectedMentorForManagement.mentoringStudents || []).map((entry) => entry.id));
      if (alreadyMapped.has(student.id)) return false;
      if (!query) return true;
      return [student.name, student.email, student.phone]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [allAvailableStudents, menteeSearchQuery, selectedMentorForManagement]);

  const menteeTotalCount = filteredAvailableMentees.length;
  const menteeTotalPages = Math.max(1, Math.ceil(menteeTotalCount / menteePageSize));
  const safeMenteePage = Math.min(menteeCurrentPage, menteeTotalPages);
  const paginatedMentees = useMemo(
    () => filteredAvailableMentees.slice((safeMenteePage - 1) * menteePageSize, safeMenteePage * menteePageSize),
    [filteredAvailableMentees, safeMenteePage, menteePageSize],
  );
  const menteePageNumbers = useMemo(() => getPageNumbers(safeMenteePage, menteeTotalPages), [safeMenteePage, menteeTotalPages]);
  const menteeStartIndex = menteeTotalCount === 0 ? 0 : (safeMenteePage - 1) * menteePageSize + 1;
  const menteeEndIndex = Math.min(safeMenteePage * menteePageSize, menteeTotalCount);

  useEffect(() => {
    setMenteeCurrentPage(1);
  }, [menteeSearchQuery]);

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

  function toggleKebab(mentorId, event) {
    event.stopPropagation();
    setActiveKebabId((current) => (current === mentorId ? null : mentorId));
  }

  function openCreateModal() {
    setEditMode(false);
    setCurrentMentor({
      name: '',
      brief: '',
      photo: null,
      photoPreview: null,
      specialisation: '',
      almaMater: '',
      graduationYear: '',
      email: '',
      mobile: '',
      active: true,
      status: 1,
    });
    setEditModalOpen(true);
  }

  function openEditModal(mentor) {
    setEditMode(true);
    setCurrentMentor({ ...mentor, photoPreview: null });
    setEditModalOpen(true);
    setActiveKebabId(null);
  }

  async function saveMentor() {
    if (!currentMentor?.name || !currentMentor?.brief || !currentMentor?.specialisation || !currentMentor?.almaMater || !currentMentor?.graduationYear) {
      return;
    }

    // API Update logic
    if (editMode && currentMentor.id && !isDemoMode) {
      try {
        const formData = new FormData();
        formData.append('name', currentMentor.name);
        formData.append('brief', currentMentor.brief);
        formData.append('specialisation', currentMentor.specialisation);
        formData.append('almaMater', currentMentor.almaMater);
        formData.append('graduationYear', currentMentor.graduationYear);
        if (currentMentor.email) formData.append('email', currentMentor.email);
        if (currentMentor.mobile) formData.append('mobile', currentMentor.mobile);

        const response = await api.post(`/admin/people/mentor/update?id=${currentMentor.id}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });

        if (response.data?.status === 'success') {
          showToast('success', 'Mentor Updated', `${currentMentor.name} updated successfully.`);
          setEditModalOpen(false);
          setCurrentMentor(null);
          loadMentors();
          return;
        }
        throw new Error(response.data?.message || 'Update failed');
      } catch (error) {
        showToast('error', 'Update Error', error.message || 'Error updating mentor profile.');
      }
      return;
    }

    // Fallback/Create logic
    const payload = {
      ...currentMentor,
      active: currentMentor.active !== false,
      status: currentMentor.active !== false ? 1 : 0,
      totalStudents: currentMentor.totalStudents || currentMentor.studentCount || 0,
      mentoringStudents: currentMentor.mentoringStudents || [],
    };
    if (editMode && payload.id) {
      setMentors((current) => current.map((mentor) => (mentor.id === payload.id ? payload : mentor)));
      showToast('success', 'Mentor Updated', `${payload.name} updated successfully.`);
    } else {
      const created = normalizeMentor({ ...payload, id: `M-${Date.now()}` }, mentors.length + 1);
      setMentors((current) => [created, ...current]);
      showToast('success', 'Mentor Created', `${created.name} created successfully.`);
    }
    setEditModalOpen(false);
    setCurrentMentor(null);
  }

  function viewMentor(mentor) {
    setSelectedMentor(mentor);
    setViewModalOpen(true);
    setActiveKebabId(null);
  }

  // Direct link / reload with ?id: open the Mentor Profile modal by default once
  // the list has loaded (so we can prime the row, including in demo mode).
  useEffect(() => {
    if (!mentorIdFromUrl) {
      autoOpenedIdRef.current = null;
      return;
    }
    if (autoOpenedIdRef.current === mentorIdFromUrl) return;
    const found = mentors.find((mentor) => String(mentor.id) === String(mentorIdFromUrl));
    if (!found && isLoading) return;
    autoOpenedIdRef.current = mentorIdFromUrl;
    // Demo mode has no API to resolve an unknown id against — if it isn't in the
    // loaded list, drop straight back to the listing instead of an empty modal.
    if (!found && isDemoMode) {
      showToast('error', 'Mentor Not Found', `No mentor profile found for ID ${mentorIdFromUrl}.`);
      closeViewModal();
      return;
    }
    setSelectedMentor(found || { id: mentorIdFromUrl });
    setViewModalOpen(true);
  }, [mentorIdFromUrl, mentors, isLoading, isDemoMode, closeViewModal]);

  function editFromView() {
    if (!selectedMentor) return;
    closeViewModal();
    openEditModal(selectedMentor);
  }

  function confirmDelete(mentor) {
    setMentorToDelete(mentor);
    setDeleteModalOpen(true);
    setActiveKebabId(null);
  }

  function deleteMentor() {
    if (!mentorToDelete) return;
    setMentors((current) => current.filter((mentor) => mentor.id !== mentorToDelete.id));
    showToast('success', 'Mentor Deleted', `${mentorToDelete.name} deleted successfully.`);
    setDeleteModalOpen(false);
    setMentorToDelete(null);
  }

  function viewMentoringStudents(mentor) {
    setSelectedMappedStudents({});
    setSelectedMentorForStudents(mentor);
    setStudentsSearchKey('');
    setStudentsCurrentPage(1);
    setStudentsModalOpen(true);
    setActiveKebabId(null);
  }

  function toggleMappedStudentSelection(student) {
    setSelectedMappedStudents((current) => {
      const next = { ...current };
      if (next[student.id]) delete next[student.id];
      else next[student.id] = student;
      return next;
    });
  }

  function selectAllMappedStudents(checked) {
    if (!checked) {
      const next = { ...selectedMappedStudents };
      paginatedStudents.forEach((student) => delete next[student.id]);
      setSelectedMappedStudents(next);
      return;
    }
    const next = { ...selectedMappedStudents };
    paginatedStudents.forEach((student) => {
      next[student.id] = student;
    });
    setSelectedMappedStudents(next);
  }

  function removeSelectedStudents() {
    if (!selectedMentorForStudents) return;
    const ids = Object.keys(selectedMappedStudents);
    if (ids.length === 0) return;
    const nextStudents = selectedMentorForStudents.mentoringStudents.filter((student) => !ids.includes(student.id));
    const nextCount = nextStudents.length;
    setMentors((current) =>
      current.map((mentor) =>
        mentor.id === selectedMentorForStudents.id
          ? { ...mentor, mentoringStudents: nextStudents, studentCount: nextCount, totalStudents: nextCount }
          : mentor
      )
    );
    setSelectedMentorForStudents((current) =>
      current ? { ...current, mentoringStudents: nextStudents, studentCount: nextCount, totalStudents: nextCount } : current
    );
    setSelectedMappedStudents({});
    showToast('success', 'Students Removed', `${ids.length} student(s) removed successfully.`);
  }

  function manageMentees(mentor) {
    setSelectedMentorForManagement(mentor);
    setSelectedMenteesToAdd({});
    setMenteeSearchQuery('');
    setMenteeCurrentPage(1);
    setManageMenteesModalOpen(true);
    setActiveKebabId(null);
  }

  function toggleMenteeSelection(student) {
    setSelectedMenteesToAdd((current) => {
      const next = { ...current };
      if (next[student.id]) delete next[student.id];
      else next[student.id] = student;
      return next;
    });
  }

  function selectAllMentees(checked) {
    if (!checked) {
      setSelectedMenteesToAdd({});
      return;
    }
    const next = {};
    filteredAvailableMentees.forEach((student) => {
      next[student.id] = student;
    });
    setSelectedMenteesToAdd(next);
  }

  function confirmAddMentees() {
    if (!selectedMentorForManagement) return;
    const additions = Object.values(selectedMenteesToAdd).map((student) => ({
      ...student,
      enrolledCourses: student.enrolledCourses || 1,
      status: student.status === 'inactive' ? 'Inactive' : 'Active',
    }));
    if (additions.length === 0) {
      showToast('info', 'Notification', 'Please select at least one student to add.');
      return;
    }
    const nextStudents = [...selectedMentorForManagement.mentoringStudents, ...additions];
    const nextCount = nextStudents.length;
    setMentors((current) =>
      current.map((mentor) =>
        mentor.id === selectedMentorForManagement.id
          ? { ...mentor, mentoringStudents: nextStudents, studentCount: nextCount, totalStudents: nextCount }
          : mentor
      )
    );
    setSelectedMentorForManagement((current) =>
      current ? { ...current, mentoringStudents: nextStudents, studentCount: nextCount, totalStudents: nextCount } : current
    );
    setManageMenteesModalOpen(false);
    setSelectedMenteesToAdd({});
    showToast('success', 'Students Added', `${additions.length} student(s) added successfully.`);
  }

  const startIndex = totalMentors === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const endIndex = Math.min(safeCurrentPage * pageSize, totalMentors);
  const studentsStartIndex = studentsTotalCount === 0 ? 0 : (safeStudentsPage - 1) * studentsPageSize + 1;
  const studentsEndIndex = Math.min(safeStudentsPage * studentsPageSize, studentsTotalCount);

  return (
    <section className="mentor-profiles-page data-table-page">
      <ToastRegion toasts={toasts} onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />

      <div className="page-header-section">
        <div className="page-header-title-group">
          <span className="page-header-icon-box"><Icon className="fa fa-smile-o" /></span>
          <div>
            <h2>Mentor Management</h2>
            <p>Create mentor profiles, review assignments, and manage mentee mapping without changing the legacy workflow.</p>
          </div>
        </div>
        <Can permission={PERMS.MENTORS_EDIT}>
          <button type="button" className="create-mentor-button" onClick={openCreateModal}>
            <Icon className="ti ti-plus" /> New Mentor Profile
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
          label="All Specializations"
          value={filterSpecialization}
          options={[
            { value: '', label: 'All Specializations' },
            ...specializationList.map((spec) => ({ value: spec, label: spec })),
          ]}
          onChange={(value) => { setFilterSpecialization(value); setCurrentPage(1); }}
        />
      </div>

      {(paginatedMentors.length > 0 || isLoading) && (
        <div className="students-table-container">
          <table className={`students-table ${isLoading ? 'thead-loading' : ''}`}>
            <thead>
              <tr>
                <th className={`sortable ${sortColumn === 'name' ? 'active' : ''}`} onClick={() => handleSort('name')}>
                  Mentor
                  <Icon className={`sort-icon ti ${sortIcon('name')}`} />
                </th>
                <th>Brief</th>
                <th className={`sortable ${sortColumn === 'institution' ? 'active' : ''}`} onClick={() => handleSort('institution')}>
                  Alma Mater
                  <Icon className={`sort-icon ti ${sortIcon('institution')}`} />
                </th>
                <th>Students</th>
                <th className="actions-column" />
              </tr>
            </thead>
            {isLoading ? (
              <tbody>
                {Array.from({ length: pageSize }, (_, index) => (
                  <tr key={`mentor-skeleton-${index}`}>
                    <td>
                      <div className="mentor-skeleton-profile">
                        <div className="mentor-skeleton avatar" />
                        <div className="mentor-skeleton medium" />
                      </div>
                    </td>
                    <td><div className="mentor-skeleton long" /></td>
                    <td><div className="mentor-skeleton medium" /></td>
                    <td><div className="mentor-skeleton short" /></td>
                    <td />
                  </tr>
                ))}
              </tbody>
            ) : (
              <tbody ref={kebabRef}>
                {paginatedMentors.map((mentor) => (
                  <tr key={mentor.id}>
                    <td>
                      <div className="profile-cell">
                        <Avatar
                          src={mentor.photo}
                          name={mentor.name}
                          className="avatar"
                          placeholderClassName="avatar-placeholder"
                        />
                        <div>
                          <button
                            type="button"
                            className="profile-name name-link"
                            title="View profile"
                            onClick={(e) => { e.stopPropagation(); viewMentor(mentor); }}
                          >
                            {mentor.name}
                          </button>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="mentor-brief">{mentor.brief}</div>
                    </td>
                    <td>
                      <div className="mentor-alma">{mentor.almaMater}</div>
                      <div className="mentor-alma-sub">Graduated {mentor.graduationYear}</div>
                    </td>
                    <td>
                      {(mentor.studentCount || 0) > 0 ? (
                        <button type="button" className="students-count-badge" onClick={() => viewMentoringStudents(mentor)} title="View Mapped Students">
                          <Icon className="ti ti-user" />
                          <span>{mentor.studentCount} Students</span>
                        </button>
                      ) : (
                        <span className="students-count-empty">No Mentees</span>
                      )}
                    </td>
                    <td className="mentor-actions-cell">
                      <div className="kebab-menu-container">
                        <button type="button" className="kebab-button" onClick={(event) => toggleKebab(mentor.id, event)}>
                          <Icon className="ti ti-more-alt" />
                        </button>
                        <div className={`kebab-dropdown ${activeKebabId === mentor.id ? 'active' : ''}`}>
                          <button type="button" className="kebab-dropdown-item" onClick={() => viewMentor(mentor)}>
                            <Icon className="ti ti-user" />
                            <span>View Profile</span>
                          </button>
                          {can(PERMS.MENTORS_MENTEES_EDIT) && (
                            <button type="button" className="kebab-dropdown-item manage-students" onClick={() => manageMentees(mentor)}>
                              <Icon className="ti ti-user" />
                              <span>Manage Mentees</span>
                            </button>
                          )}
                          {can(PERMS.MENTORS_EDIT) && (
                            <button type="button" className="kebab-dropdown-item edit-action" onClick={() => openEditModal(mentor)}>
                              <Icon className="ti ti-pencil" />
                              <span>Edit Mentor</span>
                            </button>
                          )}
                          {can(PERMS.MENTORS_DELETE) && (
                            <button type="button" className="kebab-dropdown-item delete-action" onClick={() => confirmDelete(mentor)}>
                              <Icon className="ti ti-trash" />
                              <span>Delete Mentor</span>
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
              <span>Showing {startIndex} to {endIndex} of {totalMentors} mentors</span>
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

      {!isLoading && totalMentors === 0 ? (
        <div className="mentors-table-container">
          <div className="empty-state">
            <Icon className="ti ti-id-badge" />
            <h3>No Mentors Found</h3>
            <p>{searchQuery || filterSpecialization ? 'No mentors match your search criteria.' : 'Get started by adding your first mentor.'}</p>
          </div>
        </div>
      ) : null}

      <div className={`legacy-modal-backdrop ${manageMenteesModalOpen ? 'active' : ''}`} onClick={() => setManageMenteesModalOpen(false)}>
        <div className="legacy-modal-dialog legacy-xl" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
          <div className="legacy-modal-header">
            <h3><Icon className="ti ti-user" /> Manage Mentees - {selectedMentorForManagement?.name}</h3>
            <button type="button" className="legacy-modal-close" onClick={() => setManageMenteesModalOpen(false)}>
              <Icon className="ti ti-close" />
            </button>
          </div>
          <div className="legacy-modal-body">
            {Object.keys(selectedMenteesToAdd).length > 0 ? (
              <div className="mentor-selection-summary">
                <span><Icon className="ti ti-check" /> {Object.keys(selectedMenteesToAdd).length} student(s) selected</span>
              </div>
            ) : null}
            <div className="mentor-modal-search">
              <div className="search-wrapper">
                <Icon className="ti ti-search" />
                <input type="text" className="search-input" placeholder="Search by name, email, or phone..." value={menteeSearchQuery} onChange={(event) => setMenteeSearchQuery(event.target.value)} />
              </div>
            </div>
            {filteredAvailableMentees.length > 0 ? (
              <>
                <p className="mentor-modal-caption">Showing <strong>{filteredAvailableMentees.length}</strong> available student(s).</p>
                <div className="mentor-scroll-table">
                  <table className="students-table mentor-selection-table">
                    <thead>
                      <tr>
                        <th className="checkbox-column">
                          <input type="checkbox" checked={filteredAvailableMentees.length > 0 && filteredAvailableMentees.every((student) => selectedMenteesToAdd[student.id])} onChange={(event) => selectAllMentees(event.target.checked)} />
                        </th>
                        <th>Student</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th className="centered-cell">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedMentees.map((student) => (
                        <tr key={student.id} className={selectedMenteesToAdd[student.id] ? 'selected-row' : ''} onClick={() => toggleMenteeSelection(student)}>
                          <td className="checkbox-column" onClick={(event) => event.stopPropagation()}>
                            <input type="checkbox" checked={Boolean(selectedMenteesToAdd[student.id])} onChange={() => toggleMenteeSelection(student)} />
                          </td>
                          <td>
                            <div className="mentor-student-name">{student.name}</div>
                            <div className="mentor-student-id">ID: {student.id}</div>
                          </td>
                          <td className="mentor-small-copy">{student.email}</td>
                          <td className="mentor-small-copy">{student.phone}</td>
                          <td className="centered-cell">
                            <span className={`mentor-mini-badge ${student.status === 'active' ? 'active' : 'inactive'}`}>{student.status === 'active' ? 'Active' : 'Inactive'}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="pagination-container mentor-inner-pagination">
                    <div className="pagination-info">
                      Showing {menteeStartIndex} to {menteeEndIndex} of {menteeTotalCount} students
                    </div>
                    <div className="pagination-controls">
                      <button type="button" className="pagination-btn" onClick={() => setMenteeCurrentPage((page) => Math.max(1, page - 1))} disabled={safeMenteePage === 1}>
                        <Icon className="ti ti-angle-left" /> Previous
                      </button>
                      {menteePageNumbers.map((page) => (
                        <button key={page} type="button" className={`pagination-btn ${page === safeMenteePage ? 'active' : ''}`} onClick={() => setMenteeCurrentPage(page)}>
                          {page}
                        </button>
                      ))}
                      <button type="button" className="pagination-btn" onClick={() => setMenteeCurrentPage((page) => Math.min(menteeTotalPages, page + 1))} disabled={safeMenteePage === menteeTotalPages}>
                        Next <Icon className="ti ti-angle-right" />
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="batch-empty-panel">
                <Icon className="ti ti-user" />
                <h3>No Students Found</h3>
                <p>{menteeSearchQuery ? 'Try adjusting your search criteria' : 'No available students found'}</p>
              </div>
            )}
          </div>
          <div className="legacy-modal-footer mentor-footer-spread">
            <div />
            <div className="mentor-footer-actions">
              <button type="button" className="legacy-btn legacy-btn-default" onClick={() => setManageMenteesModalOpen(false)}>Cancel</button>
              <button type="button" className="legacy-btn legacy-btn-success" onClick={confirmAddMentees} disabled={Object.keys(selectedMenteesToAdd).length === 0}>
                <Icon className="ti ti-plus" /> Add {Object.keys(selectedMenteesToAdd).length} Mentee(s)
              </button>
            </div>
          </div>
        </div>
      </div>

      {editModalOpen && (
      <div className="legacy-modal-backdrop active" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditModalOpen(false); }}>
        <div className="legacy-modal-dialog legacy-large" role="dialog" aria-modal="true">
          <div className="legacy-modal-header">
            <h3>{editMode ? 'Edit Mentor' : 'Add New Mentor'}</h3>
            <button type="button" className="legacy-modal-close" onClick={() => setEditModalOpen(false)}>
              <Icon className="ti ti-close" />
            </button>
          </div>
          <form className="batch-modal-form form-modal" onSubmit={(event) => { event.preventDefault(); saveMentor(); }}>
          <div className="legacy-modal-body">
            <div className="asset-form-section">
              <div className="asset-form-section-title"><Icon className="ti ti-info-circle" /> Basic Information</div>
              <div className="asset-form-grid basic-grid">
                <label className="field-cell full-span">
                  <div className="float-field">
                    <input type="text" className="float-control" placeholder=" " value={currentMentor?.name || ''} onChange={(event) => setCurrentMentor((current) => ({ ...current, name: event.target.value }))} />
                    <span className="float-label">Mentor Name <span className="req">*</span></span>
                  </div>
                </label>
                <label className="field-cell full-span">
                  <div className="float-field float-textarea">
                    <textarea className="float-control" placeholder=" " value={currentMentor?.brief || ''} onChange={(event) => setCurrentMentor((current) => ({ ...current, brief: event.target.value }))} />
                    <span className="float-label">Brief Description <span className="req">*</span></span>
                  </div>
                </label>
                <div className="field-cell full-span">
                  <div className="field-static-label">Profile Photo <span className="field-hint-inline">(Optional)</span></div>
                  <div className="mentor-photo-upload">
                    {currentMentor?.photo || currentMentor?.photoPreview ? (
                      <img src={currentMentor.photoPreview || currentMentor.photo} alt="Preview" className="mentor-photo-preview" />
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
              <div className="asset-form-section-title"><Icon className="ti ti-school" /> Academic Details</div>
              <div className="asset-form-grid">
                <label className="field-cell">
                  <div className="float-field">
                    <input type="text" className="float-control" placeholder=" " value={currentMentor?.specialisation || ''} onChange={(event) => setCurrentMentor((current) => ({ ...current, specialisation: event.target.value }))} />
                    <span className="float-label">Specialization <span className="req">*</span></span>
                  </div>
                </label>
                <label className="field-cell">
                  <div className="float-field">
                    <input type="number" className="float-control" placeholder=" " value={currentMentor?.graduationYear || ''} onChange={(event) => setCurrentMentor((current) => ({ ...current, graduationYear: event.target.value }))} />
                    <span className="float-label">Graduation Year <span className="req">*</span></span>
                  </div>
                </label>
                <label className="field-cell full-span">
                  <div className="float-field">
                    <input type="text" className="float-control" placeholder=" " value={currentMentor?.almaMater || ''} onChange={(event) => setCurrentMentor((current) => ({ ...current, almaMater: event.target.value }))} />
                    <span className="float-label">Alma Mater <span className="req">*</span></span>
                  </div>
                </label>
              </div>
            </div>

            <div className="asset-form-section">
              <div className="asset-form-section-title"><Icon className="ti ti-address-book" /> Contact Information <span className="field-hint-inline">(Optional)</span></div>
              <div className="asset-form-grid">
                <label className="field-cell">
                  <div className="float-field">
                    <input type="email" className="float-control" placeholder=" " value={currentMentor?.email || ''} onChange={(event) => setCurrentMentor((current) => ({ ...current, email: event.target.value }))} />
                    <span className="float-label">Email</span>
                  </div>
                </label>
                <label className="field-cell">
                  <div className="float-field">
                    <input type="tel" className="float-control" placeholder=" " value={currentMentor?.mobile || ''} onChange={(event) => setCurrentMentor((current) => ({ ...current, mobile: event.target.value }))} />
                    <span className="float-label">Mobile</span>
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
              disabled={!currentMentor?.name || !currentMentor?.brief || !currentMentor?.specialisation || !currentMentor?.almaMater || !currentMentor?.graduationYear}
            >
              {editMode ? 'Update Mentor' : 'Create Mentor'}
            </button>
          </div>
          </form>
        </div>
      </div>
      )}

      {deleteModalOpen && (
      <div className="crispr-modal-backdrop active" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeleteModalOpen(false); }}>
        <div className="crispr-modal-dialog confirm-dialog" style={{ maxWidth: 460 }} role="dialog" aria-modal="true">
          <div className="crispr-modal-header danger-header">
            <h3><Icon className="ti ti-alert" /> Confirm Delete</h3>
            <button type="button" className="crispr-modal-close" onClick={() => setDeleteModalOpen(false)}>
              <Icon className="ti ti-close" />
            </button>
          </div>
          <div className="crispr-modal-body">
            <p style={{ margin: '0 0 8px', color: '#334155', lineHeight: 1.6 }}>Are you sure you want to delete <strong>{mentorToDelete?.name}</strong>?</p>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: 13 }}>This action cannot be undone.</p>
          </div>
          <div className="crispr-modal-footer">
            <button type="button" className="btn btn-default" onClick={() => setDeleteModalOpen(false)}>Cancel</button>
            <button type="button" className="btn btn-danger" onClick={deleteMentor}>
              <Icon className="ti ti-trash" /> Delete Mentor
            </button>
          </div>
        </div>
      </div>
      )}

      {viewModalOpen && (
      <div className="crispr-modal-backdrop active" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeViewModal(); }}>
        <div className="crispr-modal-dialog" style={{ maxWidth: 720 }} role="dialog" aria-modal="true">
          <div className="crispr-modal-header">
            <h3><Icon className="ti ti-user" /> Mentor Profile</h3>
            <button type="button" className="crispr-modal-close" onClick={closeViewModal}>
              <Icon className="ti ti-close" />
            </button>
          </div>
          <div className={`crispr-modal-body mentor-view-body ${isMentorProfileLoading ? 'is-loading' : ''}`} style={{ padding: 0 }}>
            {isMentorProfileLoading && (
              <div className="mentor-view-loading">
                <Icon className="ti ti-reload rotate" /> Loading detailed profile...
              </div>
            )}
            {selectedMentor ? (
              <>
                <div className="mentor-profile-hero">
                  <div className="mentor-profile-avatar-shell">
                    <Avatar
                      src={selectedMentor.photo}
                      name={selectedMentor.name}
                      className="mentor-profile-avatar"
                      placeholderClassName="mentor-profile-avatar placeholder"
                    />
                    {selectedMentor.active ? <div className="mentor-profile-active-dot" /> : null}
                  </div>
                  <div className="mentor-profile-copy">
                    <h2>{selectedMentor.name}</h2>
                    <p>{selectedMentor.brief}</p>
                    <div className="mentor-profile-rating">
                      <div className="mentor-rating-group">
                        <Icon className="fa fa-star" />
                        <span className="mentor-rating-value">{selectedMentor.rating}</span>
                        <span className="mentor-rating-max">/5.0</span>
                      </div>
                      <div className="mentor-rating-divider" />
                      <div className="mentor-rating-students">
                        <Icon className="ti ti-users" /> {selectedMentor.totalStudents} Students
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mentor-profile-grid">
                  <div className="profile-info-card">
                    <div className="profile-info-icon blue"><Icon className="ti ti-bookmark" /></div>
                    <div><div className="profile-info-label">Specialization</div><div className="profile-info-value">{selectedMentor.specialisation}</div></div>
                  </div>
                  <div className="profile-info-card">
                    <div className="profile-info-icon amber"><Icon className="ti ti-home" /></div>
                    <div><div className="profile-info-label">Alma Mater</div><div className="profile-info-value">{selectedMentor.almaMater}</div></div>
                  </div>
                  <div className="profile-info-card">
                    <div className="profile-info-icon indigo"><Icon className="ti ti-calendar" /></div>
                    <div><div className="profile-info-label">Graduation Year</div><div className="profile-info-value">{selectedMentor.graduationYear}</div></div>
                  </div>
                  {selectedMentor.email ? (
                    <div className="profile-info-card">
                      <div className="profile-info-icon indigo"><Icon className="ti ti-email" /></div>
                      <div><div className="profile-info-label">Email Address</div><div className="profile-info-value truncatable">{selectedMentor.email}</div></div>
                    </div>
                  ) : null}
                  {selectedMentor.mobile ? (
                    <div className="profile-info-card">
                      <div className="profile-info-icon green"><Icon className="ti ti-mobile" /></div>
                      <div><div className="profile-info-label">Mobile Number</div><div className="profile-info-value">{selectedMentor.mobile}</div></div>
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
          <div className="legacy-modal-footer">
            <button type="button" className="legacy-btn legacy-btn-default" onClick={closeViewModal}>Close</button>
            <button type="button" className="legacy-btn legacy-btn-success" onClick={editFromView}>
              <Icon className="ti ti-pencil" /> Edit Mentor
            </button>
          </div>
        </div>
      </div>
      )}

      <div className={`legacy-modal-backdrop ${studentsModalOpen ? 'active' : ''}`} onClick={() => setStudentsModalOpen(false)}>
        <div className="legacy-modal-dialog legacy-xl" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
          <div className="legacy-modal-header">
            <h3><Icon className="ti ti-user" /> Students Mentored by {selectedMentorForStudents?.name}</h3>
            <button type="button" className="legacy-modal-close" onClick={() => setStudentsModalOpen(false)}>
              <Icon className="ti ti-close" />
            </button>
          </div>
          <div className="mentor-students-search-wrap">
            <div className="search-wrapper">
              <Icon className="ti ti-search" />
              <input type="text" className="search-input" placeholder="Search students by name or email..." value={studentsSearchKey} onChange={(event) => { setStudentsSearchKey(event.target.value); setStudentsCurrentPage(1); }} />
            </div>
          </div>
          <div className="legacy-modal-body mentor-students-body">
            <div className="mentor-scroll-table tall">
              {paginatedStudents.length > 0 ? (
                <>
                  <table className="students-table mentor-selection-table">
                    <thead>
                      <tr>
                        <th className="checkbox-column">
                          <input type="checkbox" checked={paginatedStudents.length > 0 && paginatedStudents.every((student) => selectedMappedStudents[student.id])} onChange={(event) => selectAllMappedStudents(event.target.checked)} />
                        </th>
                        <th>Student Name</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th>Courses</th>
                        <th className="centered-cell">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedStudents.map((student) => (
                        <tr key={student.id} className={selectedMappedStudents[student.id] ? 'selected-row' : ''} onClick={() => toggleMappedStudentSelection(student)}>
                          <td className="checkbox-column" onClick={(event) => event.stopPropagation()}>
                            <input type="checkbox" checked={Boolean(selectedMappedStudents[student.id])} onChange={() => toggleMappedStudentSelection(student)} />
                          </td>
                          <td>
                            <div className="mentor-student-name">{student.name}</div>
                            <div className="mentor-student-id">ID: {student.id}</div>
                          </td>
                          <td className="mentor-small-copy">{student.email}</td>
                          <td className="mentor-small-copy">{student.phone || student.mobile || 'N/A'}</td>
                          <td><span className="subject-badge compact">{student.enrolledCourses || 0} course(s)</span></td>
                          <td className="centered-cell">
                            <span className={`status-badge ${student.status === 'Active' ? 'status-active' : 'status-inactive'}`}>{student.status || 'Active'}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="pagination-container mentor-inner-pagination">
                    <div className="pagination-info">
                      Showing {studentsStartIndex} to {studentsEndIndex} of {studentsTotalCount} students
                    </div>
                    <div className="pagination-controls">
                      <button type="button" className="pagination-btn" onClick={() => setStudentsCurrentPage((page) => Math.max(1, page - 1))} disabled={safeStudentsPage === 1}>
                        <Icon className="ti ti-angle-left" /> Previous
                      </button>
                      {studentPageNumbers.map((page) => (
                        <button key={page} type="button" className={`pagination-btn ${page === safeStudentsPage ? 'active' : ''}`} onClick={() => setStudentsCurrentPage(page)}>
                          {page}
                        </button>
                      ))}
                      <button type="button" className="pagination-btn" onClick={() => setStudentsCurrentPage((page) => Math.min(studentsTotalPages, page + 1))} disabled={safeStudentsPage === studentsTotalPages}>
                        Next <Icon className="ti ti-angle-right" />
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="empty-state compact">
                  <Icon className="ti ti-users" />
                  <h3>No Students Assigned Yet</h3>
                  <p>This mentor hasn't been assigned any students yet.</p>
                </div>
              )}
            </div>
          </div>
          <div className="legacy-modal-footer mentor-footer-spread large">
            {Object.keys(selectedMappedStudents).length > 0 ? (
              <div className="mentor-selected-chip"><Icon className="ti ti-check" /> {Object.keys(selectedMappedStudents).length} student(s) selected</div>
            ) : <div />}
            <div className="mentor-footer-actions">
              {Object.keys(selectedMappedStudents).length > 0 ? (
                <button type="button" className="legacy-btn legacy-btn-danger" onClick={removeSelectedStudents}>
                  <Icon className="ti ti-trash" /> Remove Mentee(s)
                </button>
              ) : null}
              <button type="button" className="legacy-btn legacy-btn-default" onClick={() => setStudentsModalOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
