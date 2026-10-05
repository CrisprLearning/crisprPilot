import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, apiError } from '../lib/api';
import ToastRegion from '../components/ToastRegion';
import { Can, usePermission } from '../lib/userStore';
import { PERMS } from '../lib/permissions';
import { batchesDemo } from '../data/adminRemainingDemo';
import { listLocations } from '../lib/locationsApi';
import useDebouncedValue from '../hooks/useDebouncedValue';


function titleToSlug(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function createStudent(seed, batchName, enrolledToCourse = true) {
  const studentNo = seed + 1;
  const firstNames = ['Aarav', 'Diya', 'Sneha', 'Rahul', 'Amit', 'Megha', 'Farhan', 'Ritika', 'Ananya', 'Nikhil'];
  const lastNames = ['Nair', 'Joseph', 'Menon', 'Prasad', 'Patel', 'S', 'Khan', 'Varma', 'Iyer', 'Thomas'];
  const firstName = firstNames[seed % firstNames.length];
  const lastName = lastNames[seed % lastNames.length];
  const name = `${firstName} ${lastName}`;
  return {
    id: `${titleToSlug(batchName)}-student-${studentNo}`,
    name,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/[^a-z]/g, '')}${studentNo}@example.com`,
    phone: `+91 ${String(9000000000 + studentNo).slice(0, 10)}`,
    enrolledToCourse,
    addedOn: Date.now() - seed * 86400000,
  };
}

const FROZEN_REASON = 'Batch is frozen. Unfreeze it to make changes.';

function normalizeBatch(batch, index) {
  const batchName = batch.name || batch.batchName || `Batch ${index + 1}`;
  const strength = Number(batch.strength || batch.numberOfStudents) || 0;
  const mappedCount = Number(batch.mappedCandidates) || (Array.isArray(batch.students) ? batch.students.length : 0);
  const startDate = batch.dateStart || batch.startDate || '';
  const endDate = batch.dateEnd || batch.endDate || '';
  const courses = Array.isArray(batch.courses) ? batch.courses : (batch.enrolledCourses || []);

  const baseStudents = Array.isArray(batch.students) ? batch.students : [];
  const normalizedStudents = baseStudents.map((student, studentIndex) => {
    if (typeof student === 'string') {
      return {
        ...createStudent(studentIndex + index * 10, batchName, courses.length > 0),
        name: student,
      };
    }
    return {
      ...createStudent(studentIndex + index * 10, batchName, student.enrolledToCourse !== false),
      ...student,
      enrolledToCourse: student.enrolledToCourse !== false,
    };
  });

  const fillerCount = Math.max(0, Math.min(strength - normalizedStudents.length, normalizedStudents.length > 20 ? 20 : 6));
  for (let fillerIndex = 0; fillerIndex < fillerCount; fillerIndex += 1) {
    const shouldEnroll = courses.length > 0 && fillerIndex < Math.max(fillerCount - 2, 0);
    normalizedStudents.push(createStudent(index * 100 + fillerIndex + normalizedStudents.length, batchName, shouldEnroll));
  }

  return {
    ...batch,
    batchName,
    numberOfStudents: strength,
    mappedCandidates: mappedCount,
    startDate,
    endDate,
    enrolledCourses: courses,
    active: batch.active ?? 1,
    // The API reports a frozen batch as status "Inactive" (candidate_batches.status 0).
    isFrozen: batch.isFrozen != null ? Boolean(batch.isFrozen) : String(batch.status || '').toLowerCase() === 'inactive',
    students: normalizedStudents,
    prepJourneyType: batch.prepJourneyType || '',
    prepJourneyYear: batch.prepJourneyYear || '',
    type: batch.type || '',
    locationId: batch.locationId || (typeof batch.location === 'object' ? batch.location?.id : batch.location) || null,
    locationName: batch.locationName || (typeof batch.location === 'object' ? batch.location?.name : '') || '',
  };
}

function createAvailableStudents() {
  return Array.from({ length: 60 }, (_, index) => {
    const student = createStudent(index + 50, 'available-pool', false);
    return {
      ...student,
      id: `available-${index + 1}`,
      status: index % 5 === 0 ? 'inactive' : 'active',
      registrationDate: Date.now() - index * 172800000,
    };
  });
}

function formatDate(value) {
  if (!value) return 'Not set';
  
  let date;
  const numValue = Number(value);
  
  if (!isNaN(numValue)) {
    // If timestamp is in seconds (usually < 10^11), convert to ms
    date = new Date(numValue < 10000000000 ? numValue * 1000 : numValue);
  } else {
    date = new Date(value);
  }

  if (isNaN(date.getTime())) return 'Not set';

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  
  return `${day}-${month}-${year}`;
}

// Same value handling as formatDate, but rendered like "23 Jun, 2026".
function formatDateLong(value) {
  if (!value) return 'Not set';

  let date;
  const numValue = Number(value);
  if (!isNaN(numValue)) {
    date = new Date(numValue < 10000000000 ? numValue * 1000 : numValue);
  } else {
    date = new Date(value);
  }

  if (isNaN(date.getTime())) return 'Not set';

  return `${date.getDate()} ${MONTH_LABELS[date.getMonth()]}, ${date.getFullYear()}`;
}

function formatDateForInput(value) {
  if (!value) return '';
  
  let date;
  const numValue = Number(value);
  
  if (!isNaN(numValue)) {
    date = new Date(numValue < 10000000000 ? numValue * 1000 : numValue);
  } else {
    date = new Date(value);
  }

  if (isNaN(date.getTime())) return '';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Render a YYYY-MM-DD value as e.g. "16 Jun, 2026" for display overlays.
function formatDateLabel(value) {
  if (!value) return '';
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return '';
  return `${day} ${MONTH_LABELS[month - 1]}, ${year}`;
}

function getBatchStatus(batch) {
  if (batch?.status) return batch.status;
  if (!batch?.startDate) return 'Active';
  const today = new Date();
  const startDate = new Date(batch.startDate);
  const endDate = batch.endDate ? new Date(batch.endDate) : null;
  if (today < startDate) return 'Upcoming';
  if (endDate && today > endDate) return 'Completed';
  return 'Active';
}

function getUnenrolledStudentsInBatch(batch) {
  return (batch.students || []).filter((student) => !student.enrolledToCourse).length;
}

function sortBatches(rows, column, reverse) {
  const items = [...rows];
  items.sort((left, right) => {
    let aValue;
    let bValue;
    switch (column) {
      case 'batchName':
        aValue = left.batchName.toLowerCase();
        bValue = right.batchName.toLowerCase();
        break;
      case 'studentCount':
        aValue = left.students.length;
        bValue = right.students.length;
        break;
      case 'startDate':
        aValue = new Date(left.startDate || 0).getTime();
        bValue = new Date(right.startDate || 0).getTime();
        break;
      case 'endDate':
        aValue = new Date(left.endDate || 0).getTime();
        bValue = new Date(right.endDate || 0).getTime();
        break;
      case 'status':
        aValue = getBatchStatus(left).toLowerCase();
        bValue = getBatchStatus(right).toLowerCase();
        break;
      default:
        aValue = left.batchName.toLowerCase();
        bValue = right.batchName.toLowerCase();
        break;
    }

    if (aValue < bValue) return reverse ? 1 : -1;
    if (aValue > bValue) return reverse ? -1 : 1;
    return 0;
  });
  return items;
}

function getPageNumbers(currentPage, totalPages) {
  const pages = [];
  const maxVisible = 5;
  let start = Math.max(1, currentPage - 2);
  let end = Math.min(totalPages, start + maxVisible - 1);
  if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1);
  for (let page = start; page <= end; page += 1) pages.push(page);
  return pages;
}

function getStudentInitials(name) {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length > 1) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export default function BatchManagementPage() {
  const { can } = usePermission();
  const navigate = useNavigate();
  const [attendanceBatch, setAttendanceBatch] = useState(null);
  const [attendanceDate, setAttendanceDate] = useState('');
  const [batches, setBatches] = useState(() => batchesDemo.map(normalizeBatch));
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebouncedValue(searchQuery);
  const [sortColumn, setSortColumn] = useState('batchName');
  const [sortReverse, setSortReverse] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalBatches, setTotalBatches] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [activeKebabId, setActiveKebabId] = useState(null);
  const [activeCourseMoreId, setActiveCourseMoreId] = useState(null);
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [editingBatch, setEditingBatch] = useState(false);
  const [batchDraft, setBatchDraft] = useState(null);
  const [batchErrors, setBatchErrors] = useState({});
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [availableCourses, setAvailableCourses] = useState([]);
  const [enrollCourseModalOpen, setEnrollCourseModalOpen] = useState(false);
  const [studentsModalOpen, setStudentsModalOpen] = useState(false);
  const [addStudentsModalOpen, setAddStudentsModalOpen] = useState(false);
  const [addStudentsPage, setAddStudentsPage] = useState(1);
  const [addStudentsPageSize, setAddStudentsPageSize] = useState(10);
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [studentFilter, setStudentFilter] = useState('all');
  const [selectedCourseIdForFilter, setSelectedCourseIdForFilter] = useState('');
  const [batchEnrolledStudents, setBatchEnrolledStudents] = useState([]);
  const [isBatchStudentsLoading, setIsBatchStudentsLoading] = useState(false);
  const [selectedBatchStudents, setSelectedBatchStudents] = useState({});
  const [selectedStudentsToAdd, setSelectedStudentsToAdd] = useState({});
  const [batchToFreeze, setBatchToFreeze] = useState(null);
  const [freezeModalOpen, setFreezeModalOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const kebabRef = useRef(null);
  const toastIdRef = useRef(0);
  const [allCandidates, setAllCandidates] = useState([]);
  const [isCandidatesLoading, setIsCandidatesLoading] = useState(false);
  const [availableLocations, setAvailableLocations] = useState([]);

  const showToast = (type, title, message) => {
    const id = toastIdRef.current + 1;
    toastIdRef.current = id;
    setToasts((current) => [...current, { id, type, title, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4500);
  };

  // A frozen batch refuses edits and member/course changes with 409
  // batch_frozen; refresh the list so the UI picks up the frozen state.
  const showBatchActionError = (error, fallback) => {
    const { code, message } = apiError(error, fallback);
    if (code === 'batch_frozen') {
      showToast('error', 'Batch Frozen', `${message}. Unfreeze it to make changes.`);
      setSelectedBatch((current) => (current ? { ...current, isFrozen: true } : current));
      loadBatches();
      return;
    }
    showToast('error', 'Error', message);
  };

  const loadBatches = useCallback(async (isCancelled = { current: false }) => {
    setIsLoading(true);
    const isLocalWebPreview = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    try {
      const response = await api.get('/admin/enrollment/list-batches', {
        params: {
          page: currentPage,
          size: pageSize,
          sortBy: sortColumn === 'batchName' ? 'name' : sortColumn,
          sortOrder: sortReverse ? 'DESC' : 'ASC',
          searchKey: debouncedSearchQuery.trim() || undefined,
        },
      });

      const rows = (response.data.data || []).map((batch, idx) => normalizeBatch(batch, idx));
      if (!isCancelled.current) {
        setBatches(rows);
        setTotalBatches(response.data.meta?.total || 0);
        setTotalPages(response.data.meta?.totalPages || 1);
        setCurrentPage(response.data.meta?.page || 1);
        setIsDemoMode(false);
      }
      return;
    } catch (error) {
      if (isCancelled.current) return;
      
      // Demo Fallback
      let rows = batchesDemo.map(normalizeBatch);
      const query = debouncedSearchQuery.trim().toLowerCase();
      if (query) {
        rows = rows.filter((batch) => {
          const haystack = [
            batch.batchName,
            batch.description,
            getBatchStatus(batch),
            ...(batch.enrolledCourses || []).map((c) => (typeof c === 'object' ? c.title || c.name || '' : c)),
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return haystack.includes(query);
        });
      }
      
      // Sorting for demo
      rows = sortBatches(rows, sortColumn, sortReverse);

      const total = rows.length;
      const pages = Math.max(1, Math.ceil(total / pageSize));
      const page = Math.min(currentPage, pages);
      const start = (page - 1) * pageSize;

      if (!isCancelled.current) {
        setBatches(rows.slice(start, start + pageSize));
        setTotalBatches(total);
        setTotalPages(pages);
        setCurrentPage(page);
        setIsDemoMode(true);
        if (isLocalWebPreview) {
          showToast('info', 'Demo Data', 'Loaded demo batch data because the batch API is unreachable.');
        } else {
          showToast('error', 'Network Error', apiError(error, 'Error loading batches.').message);
        }
      }
    } finally {
      if (!isCancelled.current) {
        setIsLoading(false);
        setHasLoaded(true);
      }
    }
  }, [currentPage, pageSize, sortColumn, sortReverse, debouncedSearchQuery]);

  const loadAvailableLocations = useCallback(async () => {
    try {
      const resp = await listLocations({ page: 1, size: 100, filterBy: 'open' });
      setAvailableLocations(resp?.data || []);
    } catch (error) {
      setAvailableLocations([]);
    }
  }, []);

  const loadAvailableCourses = useCallback(async () => {
    try {
      const response = await api.get('/admin/catalog/list', {
        params: {
          page: 1,
          size: 100,
          sortBy: 'name',
          filterBy: 'type',
          filterValue: 'Course'
        }
      });
      setAvailableCourses(response.data.data || []);
    } catch (error) {
      if (isDemoMode) {
        setAvailableCourses([
          { id: 'COURSE-001', title: 'IAT 2026 - Exclusive 1 Year Course' },
          { id: 'COURSE-002', title: 'NEET 2026 Complete Preparation' },
        ]);
      }
    }
  }, [isDemoMode]);
  
  const loadAllCandidates = useCallback(async (query = '') => {
    setIsCandidatesLoading(true);
    try {
      const response = await api.get('/admin/people/candidate/list', {
        params: {
          page: 1,
          size: 200,
          sortBy: 'name',
          searchKey: query || undefined,
        },
      });
      setAllCandidates(response.data.data || []);
    } catch (error) {
      if (isDemoMode) {
        setAllCandidates(createAvailableStudents());
      }
    } finally {
      setIsCandidatesLoading(false);
    }
  }, [isDemoMode]);

   useEffect(() => {
     if (addStudentsModalOpen) {
       const timer = setTimeout(() => {
         loadAllCandidates(studentSearchQuery);
       }, 500);
       return () => clearTimeout(timer);
     }
   }, [studentSearchQuery, addStudentsModalOpen, loadAllCandidates]);

  const loadBatchEnrolledStudents = useCallback(async (isCancelled = { current: false }) => {
    if (!studentsModalOpen || !selectedBatch?.id || !selectedCourseIdForFilter) {
      setBatchEnrolledStudents([]);
      return;
    }

    setIsBatchStudentsLoading(true);
    try {
      const response = await api.get('/admin/enrollment/get-enrolled-candidates-in-course-part-of-batches', {
        params: {
          page: 1,
          size: 200,
          courseId: selectedCourseIdForFilter,
          batchId: selectedBatch.id,
        },
      });

      if (!isCancelled.current) {
        const normalized = (response.data.data || []).map(student => ({
          ...student,
          enrolledToCourse: Number(student.enrollmentStatus) === 1
        }));
        setBatchEnrolledStudents(normalized);
      }
    } catch (error) {
      if (!isCancelled.current) {
        setBatchEnrolledStudents([]);
      }
    } finally {
      if (!isCancelled.current) setIsBatchStudentsLoading(false);
    }
  }, [studentsModalOpen, selectedBatch?.id, selectedCourseIdForFilter]);

  useEffect(() => {
    const isCancelled = { current: false };
    loadBatchEnrolledStudents(isCancelled);
    return () => { isCancelled.current = true; };
  }, [loadBatchEnrolledStudents]);

  // useLayoutEffect so isLoading flips to true before the browser paints the
  // frame triggered by a search/sort/page change. Otherwise React would paint
  // one frame with the stale isLoading=false, briefly showing "No Batches
  // Found" before the shimmer appears.
  useLayoutEffect(() => {
    const isCancelled = { current: false };
    loadBatches(isCancelled);
    return () => { isCancelled.current = true; };
  }, [loadBatches]);

  useEffect(() => {
    const handleClick = (event) => {
      if (kebabRef.current && !kebabRef.current.contains(event.target)) {
        setActiveKebabId(null);
      }
      if (!event.target.closest?.('.batch-course-more-wrap')) {
        setActiveCourseMoreId(null);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedBatches = batches;
  const showingStart = totalBatches === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const showingEnd = Math.min(safeCurrentPage * pageSize, totalBatches);
  const paginationPages = useMemo(() => getPageNumbers(safeCurrentPage, totalPages), [safeCurrentPage, totalPages]);

  const visibleBatchStudents = useMemo(() => {
    const query = studentSearchQuery.trim().toLowerCase();
    
    // If a course filter is active, use the API-provided enrollment data
    let baseList = selectedCourseIdForFilter ? batchEnrolledStudents : (selectedBatch?.students || []);

    if (studentFilter === 'enrolled') baseList = baseList.filter((student) => student.enrolledToCourse);
    if (studentFilter === 'not-enrolled') baseList = baseList.filter((student) => !student.enrolledToCourse);

    if (!query) return baseList;
    return baseList.filter((student) =>
      [student.name, student.email, student.phone].filter(Boolean).some((value) => String(value).toLowerCase().includes(query))
    );
  }, [selectedBatch, studentSearchQuery, studentFilter, selectedCourseIdForFilter, batchEnrolledStudents]);

  const availableStudentsForBatch = useMemo(() => {
    if (!selectedBatch) return [];
    const existingIds = new Set((selectedBatch.students || []).map((student) => student.id));
    return allCandidates.filter((student) => !existingIds.has(student.id));
  }, [allCandidates, selectedBatch]);

  // Pagination for the Manage Students modal table.
  const addStudentsTotal = availableStudentsForBatch.length;
  const addStudentsTotalPages = Math.max(1, Math.ceil(addStudentsTotal / addStudentsPageSize));
  const safeAddStudentsPage = Math.min(addStudentsPage, addStudentsTotalPages);
  const pagedAvailableStudents = useMemo(() => {
    const start = (safeAddStudentsPage - 1) * addStudentsPageSize;
    return availableStudentsForBatch.slice(start, start + addStudentsPageSize);
  }, [availableStudentsForBatch, safeAddStudentsPage, addStudentsPageSize]);
  const addStudentsPageNumbers = useMemo(
    () => getPageNumbers(safeAddStudentsPage, addStudentsTotalPages),
    [safeAddStudentsPage, addStudentsTotalPages],
  );
  const addStudentsShowingStart = addStudentsTotal === 0 ? 0 : (safeAddStudentsPage - 1) * addStudentsPageSize + 1;
  const addStudentsShowingEnd = Math.min(safeAddStudentsPage * addStudentsPageSize, addStudentsTotal);

  // Reset to the first page whenever the modal opens or the search changes.
  useEffect(() => {
    setAddStudentsPage(1);
  }, [studentSearchQuery, addStudentsModalOpen]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  function toggleKebab(batchId, event) {
    event.stopPropagation();
    setActiveKebabId((current) => (current === batchId ? null : batchId));
  }

  function handleSort(column) {
    if (sortColumn === column) {
      setSortReverse((value) => !value);
    } else {
      setSortColumn(column);
      setSortReverse(false);
    }
  }

  function updateBatchField(field, value) {
    setBatchDraft((current) => ({ ...current, [field]: value }));
    setBatchErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  // Date fields open the native picker on any interaction instead of letting
  // the user click/type into the date text segments.
  function openDatePicker(event) {
    if (event.type === 'keydown') {
      if (event.key === 'Tab') return; // keep keyboard navigation working
      event.preventDefault(); // block manual text entry into the segments
    }
    try {
      event.currentTarget.showPicker?.();
    } catch (_) {
      // showPicker throws if already open or unsupported — safe to ignore.
    }
  }

  function validateBatchDraft(draft) {
    const errors = {};
    if (!draft?.batchName?.trim()) errors.batchName = 'Batch name is required.';
    if (!draft?.numberOfStudents) {
      errors.numberOfStudents = 'Number of students is required.';
    } else if (Number(draft.numberOfStudents) < 1) {
      errors.numberOfStudents = 'Must be at least 1 student.';
    }
    if (draft?.startDate && draft?.endDate && draft.endDate < draft.startDate) {
      errors.endDate = 'Conclude date must be after the commence date.';
    }
    if (!draft?.prepJourneyType) errors.prepJourneyType = 'Select a prep journey type.';
    if (!draft?.prepJourneyYear) errors.prepJourneyYear = 'Select a prep journey year.';
    if (!draft?.type) errors.type = 'Select a batch type.';
    if (draft?.type === 'OFFLINE' && !draft?.locationId) errors.locationId = 'Select a location for offline batches.';
    return errors;
  }

  function openCreateBatchModal() {
    setEditingBatch(false);
    setBatchErrors({});
    setBatchDraft({
      id: null,
      batchName: '',
      numberOfStudents: '',
      description: '',
      startDate: '',
      endDate: '',
      prepJourneyType: '',
      prepJourneyYear: '',
      active: 1,
      isFrozen: false,
      enrolledCourses: [],
      students: [],
      type: '',
      locationId: '',
    });
    setBatchModalOpen(true);
    loadAvailableLocations();
  }

  function openEditBatchModal(batch) {
    setEditingBatch(true);
    setBatchErrors({});
    const currentLocationId = batch.locationId || (typeof batch.location === 'object' ? batch.location?.id : batch.location) || '';
    setBatchDraft({
      ...batch,
      numberOfStudents: String(batch.numberOfStudents || ''),
      startDate: formatDateForInput(batch.startDate),
      endDate: formatDateForInput(batch.endDate),
      prepJourneyType: batch.prepJourneyType || '',
      prepJourneyYear: String(batch.prepJourneyYear || ''),
      type: batch.type || '',
      locationId: currentLocationId || '',
    });
    setBatchModalOpen(true);
    setActiveKebabId(null);
    loadAvailableLocations();
  }

  async function saveBatch() {
    const errors = validateBatchDraft(batchDraft);
    if (Object.keys(errors).length > 0) {
      setBatchErrors(errors);
      showToast('info', 'Notification', 'Please fix the highlighted fields.');
      return;
    }

    const startEpoch = batchDraft.startDate ? Math.floor(new Date(batchDraft.startDate).getTime() / 1000) : null;
    const endEpoch = batchDraft.endDate ? Math.floor(new Date(batchDraft.endDate).getTime() / 1000) : null;

    const payload = {
      name: batchDraft.batchName.trim(),
      brief: batchDraft.description || '',
      strength: Number(batchDraft.numberOfStudents),
      dateStart: startEpoch,
      dateEnd: endEpoch,
      prepJourneyType: batchDraft.prepJourneyType,
      prepJourneyYear: Number(batchDraft.prepJourneyYear),
      type: batchDraft.type,
    };

    if (batchDraft.type === 'OFFLINE' && batchDraft.locationId) {
      payload.locationId = Number(batchDraft.locationId) || batchDraft.locationId;
    }

    if (!isDemoMode) {
      try {
        const url = editingBatch && batchDraft.id 
          ? `/admin/enrollment/update-batch?id=${batchDraft.id}` 
          : '/admin/enrollment/add-new-batch';
        
        await api.post(url, payload);
        showToast('success', editingBatch ? 'Batch Updated' : 'Batch Created', `${payload.name} has been ${editingBatch ? 'updated' : 'created'} successfully.`);
        setBatchModalOpen(false);
        loadBatches();
        return;
      } catch (error) {
        showBatchActionError(error, 'Error saving batch.');
        return;
      }
    }

    // Fallback logic for demo mode
    const experience = Number(batchDraft.numberOfStudents);
    const mockPayload = normalizeBatch({
      ...batchDraft,
      batchName: batchDraft.batchName.trim(),
      numberOfStudents: experience,
      startDate: batchDraft.startDate || '',
      endDate: batchDraft.endDate || '',
    }, batches.length + 1);

    if (editingBatch && mockPayload.id) {
      setBatches((current) => current.map((batch) => (batch.id === mockPayload.id ? { ...batch, ...mockPayload } : batch)));
      showToast('success', 'Batch Updated', `${mockPayload.batchName} has been updated successfully.`);
    } else {
      const created = {
        ...mockPayload,
        id: `BATCH-${Date.now()}`,
        students: [],
        enrolledCourses: [],
      };
      setBatches((current) => [created, ...current]);
      showToast('success', 'Batch Created', `${mockPayload.batchName} has been created successfully.`);
    }

    setBatchModalOpen(false);
    setBatchDraft(null);
  }

  function openManageCourses(batch) {
    setSelectedBatch(batch);
    setSelectedCourse('');
    setEnrollCourseModalOpen(true);
    setStudentsModalOpen(false);
    setAddStudentsModalOpen(false);
    setActiveKebabId(null);
    loadAvailableCourses();
  }

  async function addCourseToBatch() {
    if (!selectedBatch || !selectedCourse) return;
    
    const courseObj = availableCourses.find(c => c.id === selectedCourse) || { id: selectedCourse, title: selectedCourse };
    const courseTitle = courseObj.title;

    if (!isDemoMode) {
      try {
        await api.post(`/admin/enrollment/enroll-course-to-a-batch?batchId=${selectedBatch.id}&courseId=${selectedCourse}`);
        showToast('success', 'Course Enrolled', `${courseTitle} has been enrolled to ${selectedBatch.batchName}.`);
        setSelectedCourse('');
        loadBatches();
        // Update selected batch in modal immediately
        setSelectedBatch((current) => (current ? { 
          ...current, 
          enrolledCourses: [...current.enrolledCourses, courseObj] 
        } : current));
        return;
      } catch (error) {
        showBatchActionError(error, 'Error enrolling course.');
        return;
      }
    }

    // Demo Fallback
    if (selectedBatch.enrolledCourses.some(c => (typeof c === 'object' ? c.id === selectedCourse : c === selectedCourse))) {
      showToast('info', 'Notification', 'This course is already enrolled to the batch.');
      return;
    }

    setBatches((current) =>
      current.map((batch) =>
        batch.id === selectedBatch.id
          ? {
              ...batch,
              enrolledCourses: [...batch.enrolledCourses, courseObj],
              students: batch.students.map((student) => ({ ...student, enrolledToCourse: true })),
            }
          : batch
      )
    );

    setSelectedBatch((current) =>
      current
        ? {
            ...current,
            enrolledCourses: [...current.enrolledCourses, courseObj],
            students: current.students.map((student) => ({ ...student, enrolledToCourse: true })),
          }
        : current
    );

    showToast('success', 'Course Added (Demo)', `${courseTitle} has been added in demo mode.`);
    setSelectedCourse('');
  }

  async function removeCourseFromBatch(courseObj) {
    if (!selectedBatch) return;
    const courseTitle = typeof courseObj === 'object' ? (courseObj.title || courseObj.name || 'Course') : courseObj;
    const courseId = typeof courseObj === 'object' ? courseObj.id : courseObj;

    if (!isDemoMode) {
      try {
        await api.post(`/admin/enrollment/remove-course-from-a-batch?batchId=${selectedBatch.id}&courseId=${courseId}`);
        showToast('success', 'Course Removed', `${courseTitle} has been removed from ${selectedBatch.batchName}.`);
        loadBatches();
        
        const nextCourses = selectedBatch.enrolledCourses.filter((course) => 
          (typeof course === 'object' ? course.id !== courseId : course !== courseId)
        );
        setSelectedBatch((current) => (current ? { ...current, enrolledCourses: nextCourses } : current));
        return;
      } catch (error) {
        showBatchActionError(error, 'Error removing course.');
        return;
      }
    }

    // Demo Fallback
    const nextCourses = selectedBatch.enrolledCourses.filter((course) => course !== courseObj);
    const nextStudents =
      nextCourses.length === 0
        ? selectedBatch.students.map((student) => ({ ...student, enrolledToCourse: false }))
        : selectedBatch.students;

    setBatches((current) =>
      current.map((batch) =>
        batch.id === selectedBatch.id ? { ...batch, enrolledCourses: nextCourses, students: nextStudents } : batch
      )
    );
    setSelectedBatch((current) => (current ? { ...current, enrolledCourses: nextCourses, students: nextStudents } : current));
    showToast('success', 'Course Removed (Demo)', `${courseTitle} has been removed in demo mode.`);
  }

  async function enrollStudentToCourse(studentId) {
    if (!selectedCourseIdForFilter || !selectedBatch) return;

    try {
      await api.post('/admin/enrollment/enroll-candidates-to-course', {
        candidates: [studentId],
        course: selectedCourseIdForFilter,
        prepJourneyType: selectedBatch.prepJourneyType || 'IAT',
        prepJourneyYear: Number(selectedBatch.prepJourneyYear) || 2026,
      });

      showToast('success', 'Enrollment Successful', 'Student has been enrolled to the course.');
      loadBatchEnrolledStudents();
    } catch (error) {
      showBatchActionError(error, 'Error enrolling student.');
    }
  }

  async function unenrollStudentFromCourse(studentId) {
    if (!selectedCourseIdForFilter || !selectedBatch) return;

    try {
      await api.post('/admin/enrollment/unenroll-candidates-from-course', {
        candidates: [studentId],
        course: selectedCourseIdForFilter,
        prepJourneyType: selectedBatch.prepJourneyType || 'IAT',
        prepJourneyYear: Number(selectedBatch.prepJourneyYear) || 2026,
      });

      showToast('success', 'Unenrollment Successful', 'Student has been unenrolled from the course.');
      loadBatchEnrolledStudents();
    } catch (error) {
      showBatchActionError(error, 'Error unenrolling student.');
    }
  }

   function openStudentsModal(batch) {
     setSelectedBatch(batch);
     setStudentSearchQuery('');
     setStudentFilter('all');
     
     const firstCourse = batch.enrolledCourses?.[0];
     const firstId = typeof firstCourse === 'object' ? firstCourse.id : (firstCourse || '');
     setSelectedCourseIdForFilter(firstId);
     setBatchEnrolledStudents([]);
     setSelectedBatchStudents({});
     setStudentsModalOpen(true);
    setAddStudentsModalOpen(false);
    setEnrollCourseModalOpen(false);
    setActiveKebabId(null);
  }

  function openAddStudentsModal(batch) {
    setSelectedBatch(batch);
    setStudentSearchQuery('');
    setSelectedStudentsToAdd({});
    setAddStudentsModalOpen(true);
    setStudentsModalOpen(false);
    setEnrollCourseModalOpen(false);
    setActiveKebabId(null);
    loadAllCandidates();
  }

  function toggleBatchStudentSelection(student) {
    setSelectedBatchStudents((current) => {
      const next = { ...current };
      if (next[student.id]) delete next[student.id];
      else next[student.id] = student;
      return next;
    });
  }

  function toggleSelectAllBatchStudents(checked) {
    if (!checked) {
      setSelectedBatchStudents({});
      return;
    }
    const next = {};
    visibleBatchStudents.forEach((student) => {
      next[student.id] = student;
    });
    setSelectedBatchStudents(next);
  }

  async function removeSelectedStudents() {
    const idsToRemove = Object.keys(selectedBatchStudents);
    if (!selectedBatch || idsToRemove.length === 0) {
      showToast('info', 'Notification', 'Please select at least one student to remove.');
      return;
    }

    if (!isDemoMode) {
      try {
        await api.post(`/admin/enrollment/remove-candidates-from-a-batch?batchId=${selectedBatch.id}`, {
          candidates: idsToRemove
        });
        showToast('success', 'Students Removed', `${idsToRemove.length} student(s) removed from ${selectedBatch.batchName} successfully.`);
        setSelectedBatchStudents({});
        loadBatches();
        loadBatchEnrolledStudents();
        return;
      } catch (error) {
        showBatchActionError(error, 'Error removing students.');
        return;
      }
    }

    // Demo Fallback
    const nextStudents = selectedBatch.students.filter((student) => !idsToRemove.includes(student.id));
    setBatches((current) =>
      current.map((batch) => (batch.id === selectedBatch.id ? { ...batch, students: nextStudents } : batch))
    );
    setSelectedBatch((current) => (current ? { ...current, students: nextStudents } : current));
    setSelectedBatchStudents({});
    showToast('success', 'Students Removed (Demo)', `${idsToRemove.length} student(s) removed in demo mode.`);
  }

  function toggleStudentToAdd(student) {
    setSelectedStudentsToAdd((current) => {
      const next = { ...current };
      if (next[student.id]) delete next[student.id];
      else next[student.id] = student;
      return next;
    });
  }

  function toggleSelectAllStudentsToAdd(checked) {
    if (!checked) {
      setSelectedStudentsToAdd({});
      return;
    }
    const next = {};
    availableStudentsForBatch.forEach((student) => {
      next[student.id] = student;
    });
    setSelectedStudentsToAdd(next);
  }

  async function confirmAddStudents() {
    const studentsToAdd = Object.values(selectedStudentsToAdd);
    if (!selectedBatch || studentsToAdd.length === 0) {
      showToast('info', 'Notification', 'Please select at least one student to add.');
      return;
    }

    const candidateIds = studentsToAdd.map(s => s.id);

    if (!isDemoMode) {
      try {
        await api.post(`/admin/enrollment/add-candidates-to-a-batch?batchId=${selectedBatch.id}`, {
          candidates: candidateIds
        });
        showToast('success', 'Students Added', `${studentsToAdd.length} student(s) added to ${selectedBatch.batchName} successfully.`);
        setAddStudentsModalOpen(false);
        setSelectedStudentsToAdd({});
        loadBatches();
        return;
      } catch (error) {
        showBatchActionError(error, 'Error adding students.');
        return;
      }
    }

    // Demo Fallback
    const additions = studentsToAdd.map((student) => ({
      ...student,
      enrolledToCourse: false,
      addedOn: Date.now(),
    }));
    const nextStudents = [...selectedBatch.students, ...additions];

    setBatches((current) =>
      current.map((batch) => (batch.id === selectedBatch.id ? { ...batch, students: nextStudents } : batch))
    );
    setSelectedBatch((current) => (current ? { ...current, students: nextStudents } : current));
    setSelectedStudentsToAdd({});
    setAddStudentsModalOpen(false);
    showToast('success', 'Students Added (Demo)', `${studentsToAdd.length} student(s) added in demo mode.`);
  }

  function openFreezeModal(batch) {
    setBatchToFreeze(batch);
    setFreezeModalOpen(true);
    setActiveKebabId(null);
  }

  function openViewAttendance(batch) {
    setAttendanceBatch(batch);
    const today = new Date();
    setAttendanceDate(
      `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`,
    );
    setActiveKebabId(null);
  }

  function confirmViewAttendance() {
    if (!attendanceBatch || !attendanceDate) return;
    const [y, m, d] = attendanceDate.split('-');
    const dmy = `${d}-${m}-${y}`; // dd-mm-yyyy
    navigate(`/offline-attendance?batch=${encodeURIComponent(attendanceBatch.id)}&date=${dmy}`);
  }

  async function confirmFreeze() {
    if (!batchToFreeze) return;
    const nextFrozen = !batchToFreeze.isFrozen;
    if (!isDemoMode) {
      try {
        await api.post('/admin/enrollment/freeze-batch', null, {
          params: { batchId: batchToFreeze.id, freeze: nextFrozen ? 'true' : 'false' },
        });
      } catch (error) {
        showToast('error', 'Error', apiError(error, `Error ${nextFrozen ? 'freezing' : 'unfreezing'} batch.`).message);
        return;
      }
    }
    setBatches((current) =>
      current.map((batch) => (batch.id === batchToFreeze.id ? { ...batch, isFrozen: nextFrozen } : batch))
    );
    showToast(
      'success',
      'Batch Updated',
      `Batch "${batchToFreeze.batchName}" has been ${nextFrozen ? 'frozen' : 'unfrozen'} successfully.`
    );
    setFreezeModalOpen(false);
    setBatchToFreeze(null);
    if (!isDemoMode) loadBatches();
  }

  function sortIcon(column) {
    if (sortColumn !== column) return 'ti-arrows-vertical';
    return sortReverse ? 'ti-arrow-down' : 'ti-arrow-up';
  }

  return (
    <section className="batch-management-page data-table-page">
      <ToastRegion toasts={toasts} onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />

      <div className="page-header-section">
        <div className="page-header-title-group">
          <span className="page-header-icon-box"><i className="ti ti-layout-grid2" /></span>
          <div>
            <h2>Batch Management</h2>
            <p>Organize students into batches, manage courses, and control access without changing the existing workflow.</p>
          </div>
        </div>
        <Can permission={PERMS.BATCHES_EDIT}>
          <button type="button" className="create-batch-button" onClick={openCreateBatchModal}>
            <i className="ti ti-plus" /> Create New Batch
          </button>
        </Can>
      </div>

      <div className="filter-bar">
        <div className="search-wrapper">
          <i className={`ti ${searchQuery ? 'ti-close' : 'ti-search'}`} onClick={() => setSearchQuery('')} aria-hidden="true" />
          <input
            type="text"
            className="search-input"
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search batches by name, course, or status..."
          />
        </div>
      </div>

      {(hasLoaded && !isLoading && totalBatches === 0) ? (
        <div className="empty-state">
          <i className="ti ti-layout-grid2" />
          <h3>No Batches Found</h3>
          {searchQuery.trim() ? (
            <p>No batches match your search</p>
          ) : (
            <p>Create your first batch to start organizing students</p>
          )}
        </div>
      ) : null}

      {(totalBatches > 0 || isLoading) && (
        <div className="students-table-container">
          <table className={`students-table ${isLoading ? 'thead-loading' : ''}`}>
            <thead>
              <tr>
                <th className={`sortable ${sortColumn === 'batchName' ? 'active' : ''}`} style={{ width: '32%', minWidth: '320px' }} onClick={() => handleSort('batchName')}>
                  Batch Name
                  <i className={`sort-icon ti ${sortIcon('batchName')}`} />
                </th>
                <th className={`sortable center-align ${sortColumn === 'studentCount' ? 'active' : ''}`} onClick={() => handleSort('studentCount')}>
                  Students
                  <i className={`sort-icon ti ${sortIcon('studentCount')}`} />
                </th>
                <th>Course</th>
                <th className={`sortable ${sortColumn === 'startDate' ? 'active' : ''}`} onClick={() => handleSort('startDate')}>
                  Commence
                  <i className={`sort-icon ti ${sortIcon('startDate')}`} />
                </th>
                <th className={`sortable ${sortColumn === 'endDate' ? 'active' : ''}`} onClick={() => handleSort('endDate')}>
                  Conclude
                  <i className={`sort-icon ti ${sortIcon('endDate')}`} />
                </th>
                <th className={`sortable center-align ${sortColumn === 'status' ? 'active' : ''}`} onClick={() => handleSort('status')}>
                  Status
                  <i className={`sort-icon ti ${sortIcon('status')}`} />
                </th>
                <th className="center-align actions-column">Actions</th>
              </tr>
            </thead>
            {isLoading ? (
              <tbody>
                {Array.from({ length: 10 }, (_, index) => (
                  <tr key={`skeleton-${index}`}>
                    <td>
                      <div className="batch-skeleton long" />
                      <div className="batch-skeleton medium small-gap" />
                    </td>
                    <td><div className="batch-skeleton short centered" /></td>
                    <td><div className="batch-skeleton medium" /></td>
                    <td><div className="batch-skeleton short" /></td>
                    <td><div className="batch-skeleton short" /></td>
                    <td><div className="batch-skeleton short centered" /></td>
                    <td><div className="batch-skeleton icon centered" /></td>
                  </tr>
                ))}
              </tbody>
            ) : (
              <tbody ref={kebabRef}>
                {paginatedBatches.map((batch) => (
                  <tr key={batch.id} className={activeKebabId === batch.id ? 'row-active-menu' : ''}>
                    <td>
                      <div className="batch-name-container">
                        <div className="batch-name">{batch.batchName}</div>
                        <div className="batch-meta-line">
                          {batch.prepJourneyType && batch.prepJourneyYear && (
                            <span className="batch-journey-tag">
                              {batch.prepJourneyType} - {batch.prepJourneyYear}
                            </span>
                          )}
                          {batch.type === 'OFFLINE' ? (
                            (batch.locationName || (typeof batch.location === 'object' && batch.location?.name)) && (
                              <span className="batch-location-tag">
                                <i className="ti ti-location-pin" /> {batch.locationName || batch.location?.name}
                              </span>
                            )
                          ) : (
                            <span className="batch-location-tag online" title="Online batch">
                              <span className="batch-center-dot" /> Online
                            </span>
                          )}
                        </div>
                      </div>
                      {batch.description ? <div className="batch-description">{batch.description}</div> : null}
                    </td>
                    <td className="center-align">
                      <div className="student-count" onClick={() => openStudentsModal(batch)}>
                        {batch.mappedCandidates} / {batch.numberOfStudents}
                      </div>
                      {getUnenrolledStudentsInBatch(batch) > 0 ? (
                        <div className="course-info">
                          <span className="badge badge-warning">
                            <i className="ti ti-alert" /> {getUnenrolledStudentsInBatch(batch)} not enrolled
                          </span>
                        </div>
                      ) : null}
                    </td>
                    <td>
                      {batch.enrolledCourses.length > 0 ? (
                        <div className="batch-courses">
                          {batch.enrolledCourses.slice(0, 2).map((course, idx) => {
                            const courseTitle = typeof course === 'object' ? (course.title || course.name || 'Unknown Course') : course;
                            const courseKey = typeof course === 'object' ? (course.id || idx) : course;
                            return (
                              <span key={`${batch.id}-${courseKey}-${idx}`} className="batch-course-badge">
                                <i className="ti ti-book" /> {courseTitle}
                              </span>
                            );
                          })}
                          {batch.enrolledCourses.length > 2 && (
                            <span className="batch-course-more-wrap">
                              <button
                                type="button"
                                className="batch-course-badge batch-course-more"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setActiveCourseMoreId((current) => (current === batch.id ? null : batch.id));
                                }}
                              >
                                +{batch.enrolledCourses.length - 2}
                              </button>
                              {activeCourseMoreId === batch.id && (
                                <div className="batch-course-popover" onClick={(event) => event.stopPropagation()}>
                                  <div className="batch-course-popover-head">
                                    {batch.enrolledCourses.length - 2} more course{batch.enrolledCourses.length - 2 > 1 ? 's' : ''}
                                  </div>
                                  {batch.enrolledCourses.slice(2).map((course, idx) => {
                                    const courseTitle = typeof course === 'object' ? (course.title || course.name || 'Unknown Course') : course;
                                    const courseKey = typeof course === 'object' ? (course.id || idx) : course;
                                    return (
                                      <div key={`more-${batch.id}-${courseKey}-${idx}`} className="batch-course-popover-item">
                                        <i className="ti ti-book" /> {courseTitle}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="course-info muted">
                          <i className="ti ti-info-alt" /> Not enrolled to any course
                        </div>
                      )}
                    </td>
                    <td>
                      <div className={`course-info ${!batch.startDate ? 'muted' : ''}`}>
                        {batch.startDate ? formatDateLong(batch.startDate) : 'Not set'}
                      </div>
                    </td>
                    <td>
                      <div className={`course-info ${!batch.endDate ? 'muted' : ''}`}>
                        {batch.endDate ? formatDateLong(batch.endDate) : 'Not set'}
                      </div>
                    </td>
                    <td className="center-align">
                      {(() => {
                        const isActive = String(getBatchStatus(batch)).toLowerCase() === 'active';
                        return (
                          <span className={`batch-status-dot ${isActive ? 'is-active' : 'is-inactive'}`}>
                            <span className="batch-status-dot-mark" />
                            {batch.isFrozen ? 'Frozen' : isActive ? 'Active' : 'Inactive'}
                          </span>
                        );
                      })()}
                    </td>
                    <td className={`center-align ${activeKebabId === batch.id ? 'cell-active-menu' : ''}`}>
                      <div className="kebab-menu-container">
                        <button type="button" className="kebab-button" onClick={(event) => toggleKebab(batch.id, event)}>
                          <i className="ti ti-more-alt" />
                        </button>
                        <div className={`kebab-dropdown ${activeKebabId === batch.id ? 'active' : ''}`}>
                          <button type="button" className="kebab-dropdown-item view-profile" onClick={() => openViewAttendance(batch)}>
                            <i className="fa fa-check-square-o sb-icon" />
                            <span className="item-label">View Attendance</span>
                          </button>
                          {can(PERMS.BATCHES_COURSES_EDIT) && (
                            <button type="button" className="kebab-dropdown-item view-profile" onClick={() => openManageCourses(batch)} disabled={batch.isFrozen} title={batch.isFrozen ? FROZEN_REASON : undefined}>
                              <i className="ti ti-book" />
                              <span className="item-label">Manage Courses</span>
                            </button>
                          )}
                          {can(PERMS.BATCHES_STUDENTS_EDIT) && (
                            <button type="button" className="kebab-dropdown-item manage-students" onClick={() => openAddStudentsModal(batch)} disabled={batch.isFrozen} title={batch.isFrozen ? FROZEN_REASON : undefined}>
                              <i className="ti ti-user" />
                              <span className="item-label">Manage Students</span>
                            </button>
                          )}
                          {can(PERMS.BATCHES_EDIT) && (
                            <button type="button" className="kebab-dropdown-item edit-action" onClick={() => openEditBatchModal(batch)} disabled={batch.isFrozen} title={batch.isFrozen ? FROZEN_REASON : undefined}>
                              <i className="ti ti-pencil" />
                              <span className="item-label">Modify Batch Details</span>
                            </button>
                          )}
                          {can(PERMS.BATCHES_FREEZE) && (
                            <button
                              type="button"
                              className={`kebab-dropdown-item ${batch.isFrozen ? 'enable-action' : 'draft-action'}`}
                              onClick={() => openFreezeModal(batch)}
                            >
                              <i className={`ti ${batch.isFrozen ? 'ti-unlock' : 'ti-lock'}`} />
                              <span className="item-label">{batch.isFrozen ? 'Unfreeze' : 'Freeze'} Batch</span>
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
              <span>
                Showing {showingStart} to {showingEnd} of {totalBatches} entries
              </span>
              <select
                className="page-size-select"
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setCurrentPage(1);
                }}
              >
                <option value={10}>Show 10</option>
                <option value={20}>Show 20</option>
                <option value={50}>Show 50</option>
                <option value={200}>Show 200</option>
              </select>
            </div>
            <div className="pagination-controls">
              <button type="button" className="pagination-btn" disabled={safeCurrentPage === 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>
                <i className="ti ti-angle-left" /> Previous
              </button>
              {paginationPages.map((page) => (
                <button
                  key={page}
                  type="button"
                  className={`pagination-btn ${safeCurrentPage === page ? 'active' : ''}`}
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </button>
              ))}
              <button
                type="button"
                className="pagination-btn"
                disabled={safeCurrentPage === totalPages}
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              >
                Next <i className="ti ti-angle-right" />
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={`legacy-modal-backdrop ${batchModalOpen ? 'active' : ''}`} onClick={() => setBatchModalOpen(false)}>
        <div className="legacy-modal-dialog legacy-large" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
          <div className="legacy-modal-header">
            <h3>{editingBatch ? 'Modify Batch Details' : 'Create New Batch'}</h3>
            <button type="button" className="legacy-modal-close" onClick={() => setBatchModalOpen(false)}>
              <i className="ti ti-close" />
            </button>
          </div>
          <form className="batch-modal-form form-modal" onSubmit={(event) => { event.preventDefault(); saveBatch(); }}>
          <div className="legacy-modal-body">
            <div className="asset-form-section">
              <div className="asset-form-section-title"><i className="ti ti-info-circle" /> Basic Details</div>
              <div className="asset-form-grid basic-grid">
                <label className="field-cell">
                  <div className={`float-field ${batchErrors.batchName ? 'has-error' : ''}`}>
                    <input
                      type="text"
                      className="float-control"
                      placeholder=" "
                      value={batchDraft?.batchName || ''}
                      onChange={(event) => updateBatchField('batchName', event.target.value)}
                    />
                    <span className="float-label">Batch Name <span className="req">*</span></span>
                  </div>
                  {batchErrors.batchName && <span className="field-error">{batchErrors.batchName}</span>}
                </label>
                <label className="field-cell">
                  <div className={`float-field ${batchErrors.numberOfStudents ? 'has-error' : ''}`}>
                    <input
                      type="number"
                      min="1"
                      className="float-control"
                      placeholder=" "
                      value={batchDraft?.numberOfStudents || ''}
                      onChange={(event) => updateBatchField('numberOfStudents', event.target.value)}
                    />
                    <span className="float-label">Number of Students <span className="req">*</span></span>
                  </div>
                  {batchErrors.numberOfStudents
                    ? <span className="field-error">{batchErrors.numberOfStudents}</span>
                    : <span className="field-hint">Maximum seats available in this batch.</span>}
                </label>
                <label className="field-cell full-span">
                  <div className="float-field float-textarea">
                    <textarea
                      className="float-control"
                      placeholder=" "
                      value={batchDraft?.description || ''}
                      onChange={(event) => updateBatchField('description', event.target.value)}
                    />
                    <span className="float-label">Description</span>
                  </div>
                </label>
              </div>
            </div>

            <div className="asset-form-section">
              <div className="asset-form-section-title"><i className="ti ti-calendar" /> Schedule</div>
              <div className="asset-form-grid">
                <label className="field-cell">
                  <div className="float-field float-always date-custom">
                    <input
                      type="date"
                      className="float-control"
                      value={batchDraft?.startDate || ''}
                      onChange={(event) => updateBatchField('startDate', event.target.value)}
                      onClick={openDatePicker}
                      onKeyDown={openDatePicker}
                    />
                    <span className="float-label">Commence Date</span>
                    <span className={`date-display ${!batchDraft?.startDate ? 'is-empty' : ''}`}>
                      {batchDraft?.startDate ? formatDateLabel(batchDraft.startDate) : 'Set a Date'}
                    </span>
                  </div>
                </label>
                <label className="field-cell">
                  <div className={`float-field float-always date-custom ${batchErrors.endDate ? 'has-error' : ''}`}>
                    <input
                      type="date"
                      className="float-control"
                      min={batchDraft?.startDate || undefined}
                      value={batchDraft?.endDate || ''}
                      onChange={(event) => updateBatchField('endDate', event.target.value)}
                      onClick={openDatePicker}
                      onKeyDown={openDatePicker}
                    />
                    <span className="float-label">Conclude Date</span>
                    <span className={`date-display ${!batchDraft?.endDate ? 'is-empty' : ''}`}>
                      {batchDraft?.endDate ? formatDateLabel(batchDraft.endDate) : 'Set a Date'}
                    </span>
                  </div>
                  {batchErrors.endDate && <span className="field-error">{batchErrors.endDate}</span>}
                </label>
              </div>
            </div>

            <div className="asset-form-section">
              <div className="asset-form-section-title"><i className="ti ti-settings" /> Configuration</div>
              <div className="asset-form-grid config-grid">
                <label className="field-cell">
                  <div className={`float-field float-always ${batchErrors.prepJourneyType ? 'has-error' : ''}`}>
                    <select
                      className="float-control"
                      value={batchDraft?.prepJourneyType || ''}
                      onChange={(event) => updateBatchField('prepJourneyType', event.target.value)}
                    >
                      <option value="">Select Type</option>
                      <option value="IAT">IAT</option>
                      <option value="NEST">NEST</option>
                    </select>
                    <span className="float-label">Prep Journey Type <span className="req">*</span></span>
                  </div>
                  {batchErrors.prepJourneyType && <span className="field-error">{batchErrors.prepJourneyType}</span>}
                </label>
                <label className="field-cell">
                  <div className={`float-field float-always ${batchErrors.prepJourneyYear ? 'has-error' : ''}`}>
                    <select
                      className="float-control"
                      value={batchDraft?.prepJourneyYear || ''}
                      onChange={(event) => updateBatchField('prepJourneyYear', event.target.value)}
                    >
                      <option value="">Select Year</option>
                      <option value="2026">2026</option>
                      <option value="2027">2027</option>
                      <option value="2028">2028</option>
                    </select>
                    <span className="float-label">Prep Journey Year <span className="req">*</span></span>
                  </div>
                  {batchErrors.prepJourneyYear && <span className="field-error">{batchErrors.prepJourneyYear}</span>}
                </label>
                <label className="field-cell">
                  <div className={`float-field float-always ${batchErrors.type ? 'has-error' : ''}`}>
                    <select
                      className="float-control"
                      value={batchDraft?.type || ''}
                      onChange={(event) => {
                        const value = event.target.value;
                        setBatchDraft((current) => ({
                          ...current,
                          type: value,
                          locationId: value === 'OFFLINE' ? current.locationId : '',
                        }));
                        setBatchErrors((current) => {
                          const next = { ...current };
                          delete next.type;
                          if (value !== 'OFFLINE') delete next.locationId;
                          return next;
                        });
                      }}
                    >
                      <option value="">Select Type</option>
                      <option value="OFFLINE">Offline</option>
                      <option value="ONLINE">Online</option>
                    </select>
                    <span className="float-label">Type <span className="req">*</span></span>
                  </div>
                  {batchErrors.type && <span className="field-error">{batchErrors.type}</span>}
                </label>
                {batchDraft?.type === 'OFFLINE' && (
                  <label className="field-cell">
                    <div className={`float-field float-always ${batchErrors.locationId ? 'has-error' : ''}`}>
                      <select
                        className="float-control"
                        value={batchDraft?.locationId || ''}
                        onChange={(event) => updateBatchField('locationId', event.target.value)}
                      >
                        <option value="">Select location</option>
                        {availableLocations.map((loc) => (
                          <option key={loc.id} value={loc.id}>{loc.name}</option>
                        ))}
                      </select>
                      <span className="float-label">Location <span className="req">*</span></span>
                    </div>
                    {batchErrors.locationId && <span className="field-error">{batchErrors.locationId}</span>}
                  </label>
                )}
              </div>
            </div>
          </div>
          <div className="legacy-modal-footer">
            <button type="button" className="legacy-btn legacy-btn-default" onClick={() => setBatchModalOpen(false)}>Cancel</button>
            <button type="submit" className="legacy-btn legacy-btn-success">
              {editingBatch ? 'Update Batch' : 'Create Batch'}
            </button>
          </div>
          </form>
        </div>
      </div>

      <div className={`legacy-modal-backdrop ${enrollCourseModalOpen ? 'active' : ''}`} onClick={() => setEnrollCourseModalOpen(false)}>
        <div className="legacy-modal-dialog legacy-large" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
          <div className="legacy-modal-header">
            <h3>Manage Courses</h3>
            <button type="button" className="legacy-modal-close" onClick={() => setEnrollCourseModalOpen(false)}>
              <i className="ti ti-close" />
            </button>
          </div>
          <div className="legacy-modal-body form-modal">
            {selectedBatch ? (
              <>
                <div className="batch-modal-summary">
                  <div className="batch-modal-title">{selectedBatch.batchName}</div>
                  <div className="batch-modal-subtitle">{selectedBatch.students.length} students will inherit access to newly added courses.</div>
                </div>

                <div className="asset-form-section">
                  <div className="asset-form-section-title"><i className="ti ti-plus" /> Add a Course</div>
                  <div className="batch-course-toolbar">
                    <div className="float-field float-always">
                      <select className="float-control" value={selectedCourse} onChange={(event) => setSelectedCourse(event.target.value)}>
                        <option value="">Select a course</option>
                        {availableCourses.map((course) => (
                          <option key={course.id} value={course.id}>{course.title}</option>
                        ))}
                      </select>
                      <span className="float-label">Course</span>
                    </div>
                    <button type="button" className="legacy-btn legacy-btn-success" onClick={addCourseToBatch} disabled={selectedBatch.isFrozen} title={selectedBatch.isFrozen ? FROZEN_REASON : undefined}>
                      Add Course
                    </button>
                  </div>
                </div>

                <div className="asset-form-section">
                  <div className="asset-form-section-title"><i className="ti ti-book" /> Enrolled Courses</div>
                  {selectedBatch.enrolledCourses.length > 0 ? (
                    <div className="batch-course-cards">
                      {selectedBatch.enrolledCourses.map((course, idx) => {
                        const courseTitle = typeof course === 'object' ? (course.title || course.name || 'Unknown Course') : course;
                        const courseId = typeof course === 'object' ? (course.id || idx) : course;
                        return (
                          <div key={`${courseId}-${idx}`} className="batch-course-card">
                            <div className="batch-course-card-info">
                              <span className="batch-course-card-icon"><i className="ti ti-book" /></span>
                              <div>
                                <div className="batch-course-card-title">{courseTitle}</div>
                                <div className="batch-course-card-meta">Assigned to this batch</div>
                              </div>
                            </div>
                            <button
                              type="button"
                              className="legacy-btn legacy-btn-small batch-course-revoke"
                              onClick={() => removeCourseFromBatch(course)}
                              disabled={selectedBatch.isFrozen}
                              title={selectedBatch.isFrozen ? FROZEN_REASON : undefined}
                            >
                              Revoke
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="batch-empty-panel">No courses are currently enrolled to this batch.</div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className={`legacy-modal-backdrop ${studentsModalOpen ? 'active' : ''}`} onClick={() => setStudentsModalOpen(false)}>
        <div className="legacy-modal-dialog legacy-xl" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
          <div className="legacy-modal-header">
            <h3>Batch Students</h3>
            <button type="button" className="legacy-modal-close" onClick={() => setStudentsModalOpen(false)}>
              <i className="ti ti-close" />
            </button>
          </div>
          <div className="legacy-modal-body">
            {selectedBatch ? (
              <>
                <div className="batch-modal-summary">
                  <div className="batch-modal-title">{selectedBatch.batchName}</div>
                  <div className="batch-modal-subtitle">Review student enrollment and remove students in bulk.</div>
                </div>
                <div className="batch-students-toolbar">
                  <div className="search-wrapper">
                    <i className="ti ti-search" />
                    <input
                      type="text"
                      className="search-input"
                      value={studentSearchQuery}
                      onChange={(event) => setStudentSearchQuery(event.target.value)}
                      placeholder="Search students..."
                    />
                  </div>
                  
                  <div className="search-wrapper" style={{ width: 'auto', minWidth: '220px' }}>
                    <i className="ti ti-book" />
                    <select 
                      className="search-input" 
                      value={selectedCourseIdForFilter}
                      onChange={(event) => setSelectedCourseIdForFilter(event.target.value)}
                      style={{ paddingLeft: '36px' }}
                    >
                      {selectedBatch.enrolledCourses.length === 0 && (
                        <option value="">No Courses Enrolled</option>
                      )}
                      {selectedBatch.enrolledCourses.map((course, idx) => {
                        const title = typeof course === 'object' ? course.title || course.name : course;
                        const id = typeof course === 'object' ? course.id : course;
                        return <option key={`${id}-${idx}`} value={id}>{title}</option>;
                      })}
                    </select>
                  </div>

                  <div className="search-wrapper" style={{ width: 'auto', minWidth: '160px' }}>
                    <i className="ti ti-filter" />
                    <select 
                      className="search-input" 
                      value={studentFilter}
                      onChange={(event) => setStudentFilter(event.target.value)}
                      style={{ paddingLeft: '36px' }}
                    >
                      <option value="all">All Students</option>
                      <option value="enrolled">Enrolled</option>
                      <option value="not-enrolled">Not Enrolled</option>
                    </select>
                  </div>
                </div>
                <table className="legacy-modal-table batch-students-table">
                  <thead>
                    <tr>
                      <th className="checkbox-column">
                        <input
                          type="checkbox"
                          checked={visibleBatchStudents.length > 0 && visibleBatchStudents.every((student) => selectedBatchStudents[student.id])}
                          onChange={(event) => toggleSelectAllBatchStudents(event.target.checked)}
                        />
                      </th>
                      <th>Student</th>
                      <th>Contact</th>
                      <th>Status</th>
                      <th>Added On</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isBatchStudentsLoading ? (
                       <tr>
                         <td colSpan="5" className="center-align" style={{ padding: '40px' }}>
                           <i className="ti ti-reload rotate" style={{ marginRight: '8px' }} />
                           Loading course-wise enrollment data...
                         </td>
                       </tr>
                     ) : visibleBatchStudents.map((student) => (
                      <tr key={student.id}>
                        <td className="checkbox-column">
                          <input
                            type="checkbox"
                            checked={Boolean(selectedBatchStudents[student.id])}
                            onChange={() => toggleBatchStudentSelection(student)}
                          />
                        </td>
                        <td>
                          <div className="batch-student-cell">
                            <div className="batch-student-avatar">{getStudentInitials(student.name)}</div>
                            <div>
                              <div className="batch-student-name">{student.name}</div>
                              <div className="batch-student-id">{student.id}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="batch-contact-line">{student.email}</div>
                          <div className="batch-contact-line">{student.phone}</div>
                        </td>
                         <td>
                           <span 
                             className={`batch-student-status ${student.enrolledToCourse ? 'enrolled' : 'not-enrolled'} ${selectedCourseIdForFilter ? (student.enrolledToCourse ? 'enroll-hover-action unenroll-hover-action' : 'enroll-hover-action') : ''}`}
                             onClick={() => {
                               if (!selectedCourseIdForFilter) return;
                               if (student.enrolledToCourse) unenrollStudentFromCourse(student.id);
                               else enrollStudentToCourse(student.id);
                             }}
                           >
                             <span className="status-text-default">{student.enrolledToCourse ? 'Enrolled' : 'Not Enrolled'}</span>
                             {selectedCourseIdForFilter && (
                               <span className="status-text-hover">
                                 <i className={`ti ${student.enrolledToCourse ? 'ti-minus' : 'ti-plus'}`} /> 
                                 {student.enrolledToCourse ? 'Unenroll' : 'Enroll Now'}
                               </span>
                             )}
                           </span>
                         </td>
                        <td>{formatDate(student.addedOn)}</td>
                      </tr>
                    ))}
                    {visibleBatchStudents.length === 0 ? (
                      <tr>
                        <td colSpan={5}><div className="batch-empty-panel">No students match the selected filter.</div></td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </>
            ) : null}
          </div>
          <div className="legacy-modal-footer">
            <button
              type="button"
              className="legacy-btn legacy-btn-default"
              onClick={() => openAddStudentsModal(selectedBatch)}
              disabled={Boolean(selectedBatch?.isFrozen)}
              title={selectedBatch?.isFrozen ? FROZEN_REASON : undefined}
            >
              <i className="ti ti-user" /> Add Students
            </button>
            <button 
              type="button" 
              className="legacy-btn legacy-btn-danger" 
              onClick={removeSelectedStudents}
              disabled={Object.keys(selectedBatchStudents).length === 0 || Boolean(selectedBatch?.isFrozen)}
              title={selectedBatch?.isFrozen ? FROZEN_REASON : undefined}
            >
              <i className="ti ti-trash" /> Remove Selected
            </button>
          </div>
        </div>
      </div>

      <div className={`legacy-modal-backdrop ${addStudentsModalOpen ? 'active' : ''}`} onClick={() => setAddStudentsModalOpen(false)}>
        <div className="legacy-modal-dialog legacy-xl form-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
          <div className="legacy-modal-header">
            <h3>Manage Students</h3>
            <button type="button" className="legacy-modal-close" onClick={() => setAddStudentsModalOpen(false)}>
              <i className="ti ti-close" />
            </button>
          </div>
          <div className="legacy-modal-body">
            {selectedBatch ? (
              <>
                <div className="batch-modal-summary">
                  <div className="batch-modal-title">{selectedBatch.batchName}</div>
                  <div className="batch-modal-subtitle">Select students to add into this batch. New students are added as not enrolled by default.</div>
                </div>

                <div className="asset-form-section">
                  <div className="asset-form-section-title"><i className="ti ti-users" /> Available Students</div>
                  <div className="search-wrapper batch-modal-search">
                    <i className="ti ti-search" />
                    <input
                      type="text"
                      className="search-input"
                      value={studentSearchQuery}
                      onChange={(event) => setStudentSearchQuery(event.target.value)}
                      placeholder="Search available students..."
                    />
                  </div>

                  <div className="students-table-container">
                    <table className="students-table">
                      <thead>
                        <tr>
                          <th className="checkbox-column">
                            <input
                              type="checkbox"
                              checked={availableStudentsForBatch.length > 0 && availableStudentsForBatch.every((student) => selectedStudentsToAdd[student.id])}
                              onChange={(event) => toggleSelectAllStudentsToAdd(event.target.checked)}
                            />
                          </th>
                          <th>Student</th>
                          <th>Contact</th>
                          <th>Availability</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedAvailableStudents.map((student) => (
                          <tr key={student.id}>
                            <td className="checkbox-column">
                              <input
                                type="checkbox"
                                checked={Boolean(selectedStudentsToAdd[student.id])}
                                onChange={() => toggleStudentToAdd(student)}
                              />
                            </td>
                            <td>
                              <div className="batch-student-cell">
                                <div className="batch-student-avatar">{getStudentInitials(student.name)}</div>
                                <div>
                                  <div className="batch-student-name">{student.name}</div>
                                  <div className="batch-student-id">{student.id}</div>
                                </div>
                              </div>
                            </td>
                            <td>
                              <div className="batch-contact-line">{student.email}</div>
                              <div className="batch-contact-line">{student.phone}</div>
                            </td>
                            <td>
                              <span className={`batch-student-status ${student.status === 'active' ? 'enrolled' : 'not-enrolled'}`}>
                                {student.status === 'active' ? 'Available' : 'Inactive'}
                              </span>
                            </td>
                          </tr>
                        ))}
                        {availableStudentsForBatch.length === 0 ? (
                          <tr>
                            <td colSpan={4}><div className="batch-empty-panel">No available students found for this batch.</div></td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>

                  {addStudentsTotal > 0 && (
                    <div className="pagination-container">
                      <div className="pagination-info">
                        <span>Showing {addStudentsShowingStart} to {addStudentsShowingEnd} of {addStudentsTotal} entries</span>
                        <select
                          className="page-size-select"
                          value={addStudentsPageSize}
                          onChange={(event) => {
                            setAddStudentsPageSize(Number(event.target.value));
                            setAddStudentsPage(1);
                          }}
                        >
                          <option value={10}>Show 10</option>
                          <option value={20}>Show 20</option>
                          <option value={50}>Show 50</option>
                          <option value={200}>Show 200</option>
                        </select>
                      </div>
                      <div className="pagination-controls">
                        <button type="button" className="pagination-btn" disabled={safeAddStudentsPage === 1} onClick={() => setAddStudentsPage((page) => Math.max(1, page - 1))}>
                          <i className="ti ti-angle-left" /> Previous
                        </button>
                        {addStudentsPageNumbers.map((page) => (
                          <button
                            key={page}
                            type="button"
                            className={`pagination-btn ${safeAddStudentsPage === page ? 'active' : ''}`}
                            onClick={() => setAddStudentsPage(page)}
                          >
                            {page}
                          </button>
                        ))}
                        <button
                          type="button"
                          className="pagination-btn"
                          disabled={safeAddStudentsPage === addStudentsTotalPages}
                          onClick={() => setAddStudentsPage((page) => Math.min(addStudentsTotalPages, page + 1))}
                        >
                          Next <i className="ti ti-angle-right" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
          <div className="legacy-modal-footer">
            <div className="batch-selection-count">{Object.keys(selectedStudentsToAdd).length} selected</div>
            <button type="button" className="legacy-btn legacy-btn-default" onClick={() => setAddStudentsModalOpen(false)}>Cancel</button>
            <button type="button" className="legacy-btn legacy-btn-success" onClick={confirmAddStudents} disabled={Boolean(selectedBatch?.isFrozen)} title={selectedBatch?.isFrozen ? FROZEN_REASON : undefined}>
              Add Selected Students
            </button>
          </div>
        </div>
      </div>

      <div className={`legacy-modal-backdrop ${freezeModalOpen ? 'active' : ''}`} onClick={() => setFreezeModalOpen(false)}>
        <div className="legacy-modal-dialog legacy-confirm" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
          <div className={`legacy-modal-header ${batchToFreeze && !batchToFreeze.isFrozen ? 'legacy-danger-header' : ''}`}>
            <h3>{batchToFreeze?.isFrozen ? 'Unfreeze Batch' : 'Freeze Batch'}</h3>
            <button type="button" className="legacy-modal-close" onClick={() => setFreezeModalOpen(false)}>
              <i className="ti ti-close" />
            </button>
          </div>
          <div className="legacy-modal-body">
            {batchToFreeze ? (
              <p className="batch-freeze-copy">
                {batchToFreeze.isFrozen
                  ? `Do you want to unfreeze "${batchToFreeze.batchName}"? Its details, students and courses can be changed again.`
                  : `Do you want to freeze "${batchToFreeze.batchName}"? Its details, students and courses can't be changed until it is unfrozen. Students stay enrolled.`}
              </p>
            ) : null}
          </div>
          <div className="legacy-modal-footer">
            <button type="button" className="legacy-btn legacy-btn-default" onClick={() => setFreezeModalOpen(false)}>Cancel</button>
            <button type="button" className={`legacy-btn ${batchToFreeze?.isFrozen ? 'legacy-btn-success' : 'legacy-btn-danger'}`} onClick={confirmFreeze}>
              <i className={`ti ${batchToFreeze?.isFrozen ? 'ti-unlock' : 'ti-lock'}`} />
              {batchToFreeze?.isFrozen ? 'Unfreeze Batch' : 'Freeze Batch'}
            </button>
          </div>
        </div>
      </div>

      <div className={`legacy-modal-backdrop ${attendanceBatch ? 'active' : ''}`} onClick={() => setAttendanceBatch(null)}>
        <div className="legacy-modal-dialog form-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
          <div className="legacy-modal-header">
            <h3>View Attendance</h3>
            <button type="button" className="legacy-modal-close" onClick={() => setAttendanceBatch(null)}>
              <i className="ti ti-close" />
            </button>
          </div>
          <div className="legacy-modal-body">
            {attendanceBatch ? (
              <>
                <div className="batch-modal-summary">
                  <div className="batch-modal-title">{attendanceBatch.batchName}</div>
                  <div className="batch-modal-subtitle">Select a date to view this batch&apos;s attendance.</div>
                </div>

                <div className="asset-form-section">
                  <div className="asset-form-section-title"><i className="ti ti-calendar" /> Attendance Date</div>
                  <div className="asset-form-grid">
                    <label className="field-cell">
                      <div className="float-field float-always date-custom">
                        <input
                          type="date"
                          className="float-control"
                          value={attendanceDate}
                          onChange={(event) => setAttendanceDate(event.target.value)}
                          onClick={openDatePicker}
                          onKeyDown={openDatePicker}
                        />
                        <span className="float-label">Date</span>
                        <span className={`date-display ${!attendanceDate ? 'is-empty' : ''}`}>
                          {attendanceDate ? formatDateLabel(attendanceDate) : 'Set a Date'}
                        </span>
                      </div>
                    </label>
                  </div>
                </div>
              </>
            ) : null}
          </div>
          <div className="legacy-modal-footer">
            <button type="button" className="legacy-btn legacy-btn-default" onClick={() => setAttendanceBatch(null)}>Cancel</button>
            <button type="button" className="legacy-btn legacy-btn-success" disabled={!attendanceDate} onClick={confirmViewAttendance}>
              View Attendance
            </button>
          </div>
        </div>
      </div>
      <style>{`
        .legacy-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .batch-status-dot {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 600;
          color: #334155;
        }
        .batch-status-dot .batch-status-dot-mark {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: #cbd5e1;
          flex-shrink: 0;
        }
        .batch-status-dot.is-active .batch-status-dot-mark {
          background: #16a34a;
        }
        .batch-status-dot.is-active {
          color: #16a34a;
        }
        .batch-student-status {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          min-width: 100px;
        }
        .enroll-hover-action {
          position: relative;
          cursor: pointer;
          transition: all 0.2s ease;
          overflow: hidden;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 100px;
        }
        .enroll-hover-action .status-text-hover {
          position: absolute;
          top: 100%;
          left: 0;
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #10b981;
          color: white;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          font-weight: 600;
        }
        .enroll-hover-action .status-text-default {
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .enroll-hover-action:hover {
          background: #10b981;
          border-color: #10b981;
          color: white;
        }
        .enroll-hover-action:hover .status-text-default {
          transform: translateY(-100%);
          opacity: 0;
        }
        .enroll-hover-action:hover .status-text-hover {
          top: 0;
        }
        .batch-student-status.not-enrolled.enroll-hover-action {
          border: 1px solid #ef4444;
          color: #ef4444;
          background: #fef2f2;
        }
        .batch-student-status.not-enrolled.enroll-hover-action:hover {
          border-color: #10b981;
        }
        .batch-student-status.enrolled {
          background: #ecfdf5;
          color: #10b981;
          border: 1px solid #10b981;
        }
        .unenroll-hover-action .status-text-hover {
          background: #ef4444;
        }
        .unenroll-hover-action:hover {
          background: #ef4444;
          border-color: #ef4444;
        }
        .batch-name-container {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 2px;
        }
        .batch-name {
          font-weight: 600;
          color: #1e293b;
        }
        .batch-meta-line {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 14px;
        }
        .batch-journey-tag {
          font-size: 12px;
          font-weight: 400;
          color: #64748b;
          display: inline-flex;
          align-items: center;
          gap: 7px;
        }
        .batch-center-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #94a3b8;
          flex-shrink: 0;
        }
        .batch-location-tag {
          font-size: 12px;
          font-weight: 400;
          color: #64748b;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        .batch-location-tag i {
          color: #94a3b8;
        }
        .batch-location-tag.online {
          color: #16a34a;
        }
        .batch-location-tag.online .batch-center-dot {
          background: #16a34a;
        }
      `}</style>
    </section>
  );
}
