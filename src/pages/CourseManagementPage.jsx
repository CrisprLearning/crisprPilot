import React, { useState, useEffect, useRef } from 'react';
import './CourseManagementPage.css';
import { courseManagementDemo } from '../data/courseManagementDemo';
import ToastRegion from '../components/ToastRegion';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';

const data = courseManagementDemo;

function deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function getPageNumbers(currentPage, totalPages) {
    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1);
    for (let page = start; page <= end; page += 1) pages.push(page);
    return pages;
}

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

export default function CourseManagementPage() {
    const [loading, setLoading] = useState(true);
    const [bundles, setBundles] = useState([]);
    const [availableModules] = useState(data.availableModules);
    const [chapters, setChapters] = useState([]);
    const [videoParts] = useState(data.videoParts);
    const [uniqueSyllabi] = useState(data.uniqueSyllabi);
    const [availableInstructors] = useState(data.availableInstructors);

    const [selectedCourseBundle, setSelectedCourseBundle] = useState(null);
    const [filteredModules, setFilteredModules] = useState([]);
    const [filteredChapters, setFilteredChapters] = useState([]);

    const [selectedModule, setSelectedModule] = useState(null);
    const [activeTab, setActiveTab] = useState('modules');
    const [editingChapterParts, setEditingChapterParts] = useState(false);
    const [editingChapterData, setEditingChapterData] = useState(null);
    const [originalChapterData, setOriginalChapterData] = useState(null);

    const [expandedModules, setExpandedModules] = useState({});
    const [expandedChapters, setExpandedChapters] = useState({});

    // Drag and drop
    const [draggedIndex, setDraggedIndex] = useState(null);
    const [dragOverIndex, setDragOverIndex] = useState(null);

    // Modal visibility
    const [showBundleModal, setShowBundleModal] = useState(false);
    const [showSelectCourseModal, setShowSelectCourseModal] = useState(false);
    const [showTeacherModal, setShowTeacherModal] = useState(false);
    const [showChangeInstructorModal, setShowChangeInstructorModal] = useState(false);
    const [showVideoPreviewModal, setShowVideoPreviewModal] = useState(false);
    const [showVideoModal, setShowVideoModal] = useState(false);
    const [showLinkQuizModal, setShowLinkQuizModal] = useState(false);
    const [showAttachMaterialModal, setShowAttachMaterialModal] = useState(false);

    // Modal data
    const [selectedTeacherProfile, setSelectedTeacherProfile] = useState(null);
    const [currentChapterForTeacherChange, setCurrentChapterForTeacherChange] = useState(null);
    const [selectedNewInstructor, setSelectedNewInstructor] = useState(null);
    const [videoPreviewPart, setVideoPreviewPart] = useState(null);
    const [selectedVideo, setSelectedVideo] = useState(null);
    const [selectedQuizForLink, setSelectedQuizForLink] = useState(null);
    const [materialUpload, setMaterialUpload] = useState({ title: '', file: null, fileName: '', brief: '' });
    const materialFileRef = useRef(null);

    // Form state for new bundle
    const [newBundle, setNewBundle] = useState({ title: '', bundleCode: '', syllabusCode: '' });

    // Search queries
    const [courseBundleSearchQuery, setCourseBundleSearchQuery] = useState('');
    const [bundlePage, setBundlePage] = useState(1);
    const [bundlePageSize, setBundlePageSize] = useState(10);
    const [instructorSearchQuery, setInstructorSearchQuery] = useState('');
    const [contentLibrarySearch, setContentLibrarySearch] = useState('');
    const [quizSearchQuery, setQuizSearchQuery] = useState('');

    const [toasts, setToasts] = useState([]);

    // Load data on mount
    useEffect(() => {
        const timer = setTimeout(() => {
            const loadedBundles = data.courseBundles;
            const loadedChapters = data.chapters;
            setBundles(loadedBundles);
            setChapters(loadedChapters);
            const firstBundle = loadedBundles[0];
            setSelectedCourseBundle(firstBundle);
            if (firstBundle) {
                const mods = availableModules.filter(m =>
                    firstBundle.modulesIncluded.some(bm => bm.moduleKey === m.moduleKey)
                );
                const chaps = loadedChapters.filter(ch =>
                    firstBundle.modulesIncluded.some(bm => bm.moduleKey === ch.moduleCode.toString())
                );
                setFilteredModules(mods);
                setFilteredChapters(chaps);
            }
            setLoading(false);
        }, 700);
        return () => clearTimeout(timer);
    }, []);

    function showToast(type, title, message) {
        const id = Date.now() + Math.random();
        setToasts(prev => [...prev, { id, type, title, message }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
    }

    // ===== Utility functions =====

    function getVideoTitle(libraryId) {
        const part = videoParts.find(p => p.libraryId === libraryId);
        return part ? part.title : libraryId || 'Unknown Part';
    }

    function getPartByLibraryId(libraryId) {
        return videoParts.find(p => p.libraryId === libraryId);
    }

    function getPartsCount(partsIncluded) {
        if (!partsIncluded) return 0;
        return Object.keys(partsIncluded).length;
    }

    function getPartsArray(partsIncluded) {
        if (!partsIncluded) return [];
        return Object.keys(partsIncluded)
            .sort((a, b) => parseInt(a) - parseInt(b))
            .map(key => ({ ...partsIncluded[key], _key: key }));
    }

    function formatDuration(seconds) {
        if (!seconds) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    function calculateChapterDuration(chapter) {
        if (!chapter.partsIncluded) return '0m';
        let totalSeconds = 0;
        for (const key in chapter.partsIncluded) {
            const part = chapter.partsIncluded[key];
            if (part.duration) totalSeconds += part.duration;
        }
        const hours = Math.floor(totalSeconds / 3600);
        const mins = Math.floor((totalSeconds % 3600) / 60);
        if (hours > 0) return `${hours}h ${mins}m`;
        return `${mins}m`;
    }

    function getPartsCountByType(chapter) {
        if (!chapter || !chapter.partsIncluded) return 'No parts';
        let videoCount = 0, fileCount = 0, testCount = 0;
        for (const key in chapter.partsIncluded) {
            const p = chapter.partsIncluded[key];
            if (p.type === 'VIDEO') videoCount++;
            else if (p.type === 'MATERIAL') fileCount++;
            else if (p.type === 'QUIZ') testCount++;
        }
        const parts = [];
        if (videoCount > 0) parts.push(`${videoCount} Video${videoCount > 1 ? 's' : ''}`);
        if (fileCount > 0) parts.push(`${fileCount} File${fileCount > 1 ? 's' : ''}`);
        if (testCount > 0) parts.push(`${testCount} Test${testCount > 1 ? 's' : ''}`);
        return parts.length > 0 ? parts.join(' | ') : 'No parts';
    }

    function getStarClass(rating, starIndex) {
        if (!rating) return 'fa-star-o';
        if (starIndex < Math.floor(rating)) return 'fa-star';
        if (starIndex === Math.floor(rating) && rating % 1 !== 0) return 'fa-star-half-o';
        return 'fa-star-o';
    }

    function getChapterCountForBundle(bundle) {
        if (!bundle || !bundle.modulesIncluded) return 0;
        return bundle.modulesIncluded.reduce((acc, m) => acc + (m.chapterIds ? m.chapterIds.length : 0), 0);
    }

    function getChaptersForModule(moduleKey, chapList) {
        const source = chapList || filteredChapters;
        return source.filter(ch => ch.moduleCode.toString() === moduleKey.toString());
    }

    // ===== Course bundle change =====

    function onCourseBundleChange(bundle) {
        setSelectedCourseBundle(bundle);
        setSelectedModule(null);
        setActiveTab('modules');
        setEditingChapterParts(false);
        setEditingChapterData(null);
        setOriginalChapterData(null);
        setExpandedModules({});
        setExpandedChapters({});
        if (bundle) {
            const mods = availableModules.filter(m =>
                bundle.modulesIncluded.some(bm => bm.moduleKey === m.moduleKey)
            );
            const chaps = chapters.filter(ch =>
                bundle.modulesIncluded.some(bm => bm.moduleKey === ch.moduleCode.toString())
            );
            setFilteredModules(mods);
            setFilteredChapters(chaps);
        } else {
            setFilteredModules([]);
            setFilteredChapters([]);
        }
    }

    // ===== Module/Chapter navigation =====

    function selectModule(module) {
        setSelectedModule(module);
        setActiveTab('chapters');
        setEditingChapterParts(false);
        setExpandedChapters({});
    }

    function backToModules() {
        setSelectedModule(null);
        setActiveTab('modules');
    }

    function toggleModule(moduleKey) {
        setExpandedModules(prev => ({ ...prev, [moduleKey]: !prev[moduleKey] }));
    }

    function toggleChapter(chapterId) {
        setExpandedChapters(prev => ({
            ...Object.fromEntries(Object.keys(prev).map(k => [k, false])),
            [chapterId]: !prev[chapterId],
        }));
    }

    // ===== Chapter parts editing =====

    function editChapter(chapter) {
        const copy = deepCopy(chapter);
        setEditingChapterData(copy);
        setOriginalChapterData(deepCopy(chapter));
        setEditingChapterParts(true);
        setActiveTab('parts');
        setContentLibrarySearch('');
    }

    function cancelChapterPartsEdit() {
        setEditingChapterParts(false);
        setEditingChapterData(null);
        setOriginalChapterData(null);
        setActiveTab('chapters');
    }

    function saveChapterParts() {
        if (!editingChapterData) return;
        const updatedChapters = chapters.map(ch =>
            ch.id === editingChapterData.id
                ? { ...ch, partsIncluded: editingChapterData.partsIncluded, lastUpdatedOn: Math.floor(Date.now() / 1000) }
                : ch
        );
        setChapters(updatedChapters);
        const chaps = updatedChapters.filter(ch =>
            selectedCourseBundle && selectedCourseBundle.modulesIncluded.some(bm => bm.moduleKey === ch.moduleCode.toString())
        );
        setFilteredChapters(chaps);
        showToast('success', 'Saved', 'Chapter parts updated successfully!');
        cancelChapterPartsEdit();
    }

    function hasChapterChanges() {
        if (!editingChapterData || !originalChapterData) return false;
        const curr = editingChapterData.partsIncluded || {};
        const orig = originalChapterData.partsIncluded || {};
        if (Object.keys(curr).length !== Object.keys(orig).length) return true;
        for (const key in curr) {
            if (!orig[key]) return true;
            if (curr[key].libraryId !== orig[key].libraryId || curr[key].type !== orig[key].type || curr[key].skipToNext !== orig[key].skipToNext) return true;
        }
        return false;
    }

    function isPartSelected(libraryId) {
        if (!editingChapterData || !editingChapterData.partsIncluded) return false;
        for (const key in editingChapterData.partsIncluded) {
            if (editingChapterData.partsIncluded[key].libraryId === libraryId) return true;
        }
        return false;
    }

    function getSelectedPartsCount() {
        if (!editingChapterData || !editingChapterData.partsIncluded) return 0;
        return Object.keys(editingChapterData.partsIncluded).length;
    }

    function togglePartSelection(part) {
        if (!editingChapterData) return;
        const parts = { ...editingChapterData.partsIncluded };
        if (isPartSelected(part.libraryId)) {
            for (const key in parts) {
                if (parts[key].libraryId === part.libraryId) delete parts[key];
            }
            // Reindex
            const reindexed = {};
            let idx = 1;
            for (const key of Object.keys(parts).sort((a, b) => parseInt(a) - parseInt(b))) {
                reindexed[idx++] = parts[key];
            }
            setEditingChapterData({ ...editingChapterData, partsIncluded: reindexed });
        } else {
            const nextKey = Object.keys(parts).length + 1;
            parts[nextKey] = { type: part.type, libraryId: part.libraryId, skipToNext: true, duration: part.duration || 0 };
            setEditingChapterData({ ...editingChapterData, partsIncluded: parts });
        }
    }

    function removePartFromChapter(partKey) {
        if (!editingChapterData) return;
        const parts = { ...editingChapterData.partsIncluded };
        delete parts[partKey];
        const reindexed = {};
        let idx = 1;
        for (const key of Object.keys(parts).sort((a, b) => parseInt(a) - parseInt(b))) {
            reindexed[idx++] = parts[key];
        }
        setEditingChapterData({ ...editingChapterData, partsIncluded: reindexed });
    }

    function updateSkipToNext(partKey, value) {
        if (!editingChapterData) return;
        const parts = { ...editingChapterData.partsIncluded };
        parts[partKey] = { ...parts[partKey], skipToNext: value };
        setEditingChapterData({ ...editingChapterData, partsIncluded: parts });
    }

    // ===== Drag and drop =====

    function handleDragStart(e, index) {
        setDraggedIndex(index);
        e.dataTransfer.effectAllowed = 'move';
    }

    function handleDragEnter(e, index) {
        e.preventDefault();
        if (index !== draggedIndex) setDragOverIndex(index);
    }

    function handleDragLeave() {
        // leave handled in drop
    }

    function handleDragOver(e, index) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (index !== draggedIndex) setDragOverIndex(index);
        return false;
    }

    function handleDrop(e, dropIndex) {
        e.stopPropagation();
        e.preventDefault();
        if (draggedIndex === null || draggedIndex === dropIndex) {
            setDraggedIndex(null);
            setDragOverIndex(null);
            return;
        }
        const partsArr = getPartsArray(editingChapterData.partsIncluded);
        const item = partsArr[draggedIndex];
        partsArr.splice(draggedIndex, 1);
        partsArr.splice(dropIndex, 0, item);
        const newParts = {};
        partsArr.forEach((p, i) => {
            const { _key, ...partData } = p;
            newParts[i + 1] = partData;
        });
        setEditingChapterData({ ...editingChapterData, partsIncluded: newParts });
        setDraggedIndex(null);
        setDragOverIndex(null);
        return false;
    }

    function handleDragEnd() {
        setDraggedIndex(null);
        setDragOverIndex(null);
    }

    // ===== Teacher/Instructor =====

    function showTeacherProfile(chapter) {
        if (chapter && chapter.teacher) {
            setSelectedTeacherProfile(chapter.teacher);
            setCurrentChapterForTeacherChange(chapter);
            setShowTeacherModal(true);
        }
    }

    function assignInstructorToChapter(chapter) {
        setCurrentChapterForTeacherChange(chapter);
        setSelectedNewInstructor(null);
        setInstructorSearchQuery('');
        setShowChangeInstructorModal(true);
    }

    function openChangeInstructorModal() {
        setShowTeacherModal(false);
        setSelectedNewInstructor(null);
        setInstructorSearchQuery('');
        setTimeout(() => setShowChangeInstructorModal(true), 50);
    }

    function confirmInstructorChange() {
        if (!selectedNewInstructor || !currentChapterForTeacherChange) return;
        const newTeacher = {
            name: selectedNewInstructor.name,
            photo: selectedNewInstructor.photo || 'assets/img/default_user.png',
            about: selectedNewInstructor.brief,
            specialization: selectedNewInstructor.expertSubject,
            experience: selectedNewInstructor.experience + '+ years',
            education: selectedNewInstructor.qualifications,
            rating: selectedNewInstructor.rating || 4.5,
            studentsCount: 0,
        };
        const chapterId = currentChapterForTeacherChange.id;
        const updatedChapters = chapters.map(ch =>
            ch.id === chapterId ? { ...ch, teacher: newTeacher } : ch
        );
        setChapters(updatedChapters);
        setFilteredChapters(updatedChapters.filter(ch =>
            selectedCourseBundle && selectedCourseBundle.modulesIncluded.some(bm => bm.moduleKey === ch.moduleCode.toString())
        ));
        setShowChangeInstructorModal(false);
        setSelectedNewInstructor(null);
        setCurrentChapterForTeacherChange(null);
        showToast('success', 'Updated', `Instructor changed to ${newTeacher.name}`);
    }

    // ===== Video modal =====

    function openVideoModal(part, chapter, partNumber) {
        setSelectedVideo({
            title: getVideoTitle(part.libraryId),
            libraryId: part.libraryId,
            partNumber,
            chapterTitle: chapter.title,
            moduleCode: chapter.moduleCode,
            type: part.type,
            skipToNext: part.skipToNext,
        });
        setShowVideoModal(true);
    }

    // ===== Video preview modal =====

    function showVideoPreview(part, e) {
        if (e) e.stopPropagation();
        if (part.type !== 'VIDEO') return;
        setVideoPreviewPart(part);
        setShowVideoPreviewModal(true);
    }

    // ===== Link Quiz =====

    function openLinkQuizModal() {
        setSelectedQuizForLink(null);
        setQuizSearchQuery('');
        setShowLinkQuizModal(true);
    }

    function linkQuizToChapter() {
        if (!selectedQuizForLink || !editingChapterData) return;
        const parts = { ...editingChapterData.partsIncluded };
        const nextKey = Object.keys(parts).length + 1;
        parts[nextKey] = {
            type: 'QUIZ',
            libraryId: 'QUIZ_' + selectedQuizForLink.id,
            skipToNext: false,
            duration: 0,
            title: selectedQuizForLink.title,
        };
        setEditingChapterData({ ...editingChapterData, partsIncluded: parts });
        showToast('success', 'Linked', `Quiz "${selectedQuizForLink.title}" linked successfully!`);
        setShowLinkQuizModal(false);
        setSelectedQuizForLink(null);
    }

    // ===== Attach Material =====

    function openAttachMaterialModal() {
        setMaterialUpload({ title: '', file: null, fileName: '', brief: '' });
        setShowAttachMaterialModal(true);
    }

    function handleMaterialFileSelect(e) {
        const file = e.target.files[0];
        if (!file) return;
        if (file.type !== 'application/pdf') {
            showToast('error', 'Error', 'Please select a PDF file');
            return;
        }
        setMaterialUpload(prev => ({
            ...prev,
            file,
            fileName: file.name,
            title: prev.title || file.name.replace('.pdf', ''),
        }));
    }

    function attachMaterialToChapter() {
        if (!materialUpload.file || !materialUpload.title || !editingChapterData) {
            showToast('error', 'Error', 'Please provide title and select a PDF file');
            return;
        }
        const parts = { ...editingChapterData.partsIncluded };
        const materialId = 'MATERIAL_' + Date.now();
        const nextKey = Object.keys(parts).length + 1;
        parts[nextKey] = {
            type: 'MATERIAL',
            libraryId: materialId,
            skipToNext: false,
            duration: 0,
            title: materialUpload.title,
            fileName: materialUpload.fileName,
            brief: materialUpload.brief || '',
        };
        setEditingChapterData({ ...editingChapterData, partsIncluded: parts });
        showToast('success', 'Attached', `Material "${materialUpload.title}" attached successfully!`);
        setShowAttachMaterialModal(false);
        setMaterialUpload({ title: '', file: null, fileName: '', brief: '' });
    }

    // ===== New Bundle creation =====

    function saveCourseBundle() {
        if (!newBundle.title || !newBundle.bundleCode || !newBundle.syllabusCode) {
            showToast('error', 'Error', 'Please fill in all required fields.');
            return;
        }
        const syllabus = uniqueSyllabi.find(s => s.code === newBundle.syllabusCode);
        if (!syllabus) {
            showToast('error', 'Error', 'Invalid syllabus selected.');
            return;
        }

        // Build modulesIncluded and create chapters
        const newChapters = [...chapters];
        const modulesIncluded = [];
        let chapterIdCounter = Math.max(...chapters.map(c => c.id), 200) + 1;
        const timestamp = Math.floor(Date.now() / 1000);

        syllabus.segments.forEach(segment => {
            segment.modules.forEach(syllabusModule => {
                const moduleKey = syllabusModule.id.toString();
                const chapterIds = [];
                syllabusModule.chapters.forEach(syllabusChapter => {
                    const newChap = {
                        id: chapterIdCounter++,
                        moduleCode: moduleKey,
                        code: syllabusChapter.chapterNumber,
                        title: syllabusChapter.title,
                        label: `${syllabusModule.moduleName} - Chapter ${syllabusChapter.chapterNumber}: ${syllabusChapter.title}`,
                        partsIncluded: {},
                        status: 1,
                        teacher: { name: 'Unassigned', photo: 'assets/img/default_user.png', rating: 0, studentsCount: 0, specialization: 'To be determined', experience: 'N/A' },
                    };
                    newChapters.push(newChap);
                    chapterIds.push(newChap.id);
                });
                modulesIncluded.push({ moduleKey, title: syllabusModule.moduleName, chapterIds, disabledCourseIds: [] });
            });
        });

        const newBundleObj = {
            id: Date.now(),
            displayKey: generateUUID(),
            title: newBundle.title,
            bundleCode: newBundle.bundleCode,
            modulesIncluded,
            active: 1,
        };

        const updatedBundles = [...bundles, newBundleObj];
        setBundles(updatedBundles);
        setChapters(newChapters);
        setShowBundleModal(false);
        setNewBundle({ title: '', bundleCode: '', syllabusCode: '' });
        onCourseBundleChangeWithChapters(newBundleObj, newChapters);
        showToast('success', 'Created', 'Course bundle created successfully! Modules and chapters initialized from syllabus.');
    }

    function onCourseBundleChangeWithChapters(bundle, chapList) {
        setSelectedCourseBundle(bundle);
        setSelectedModule(null);
        setActiveTab('modules');
        setEditingChapterParts(false);
        setEditingChapterData(null);
        setOriginalChapterData(null);
        setExpandedModules({});
        setExpandedChapters({});
        if (bundle) {
            const mods = availableModules.filter(m =>
                bundle.modulesIncluded.some(bm => bm.moduleKey === m.moduleKey)
            );
            const chaps = chapList.filter(ch =>
                bundle.modulesIncluded.some(bm => bm.moduleKey === ch.moduleCode.toString())
            );
            setFilteredModules(mods);
            setFilteredChapters(chaps);
        }
    }

    // ===== Content library filter =====

    function filterContentLibrary(part) {
        if (part.type !== 'VIDEO') return false;
        if (!contentLibrarySearch) return true;
        const s = contentLibrarySearch.toLowerCase();
        return (
            part.title.toLowerCase().includes(s) ||
            part.libraryId.toLowerCase().includes(s)
        );
    }

    // ===== Select course modal =====

    function selectCourseBundleFromModal(bundle) {
        onCourseBundleChange(bundle);
        setShowSelectCourseModal(false);
    }

    // ===== Render helpers =====

    const visibleVideoParts = videoParts.filter(filterContentLibrary);

    const chaptersForSelectedModule = selectedModule
        ? filteredChapters.filter(ch => ch.moduleCode.toString() === selectedModule.moduleKey.toString())
        : [];

    const filteredBundles = bundles.filter(b => {
        if (!courseBundleSearchQuery) return true;
        const s = courseBundleSearchQuery.toLowerCase();
        return b.title.toLowerCase().includes(s) || (b.bundleCode && b.bundleCode.toLowerCase().includes(s));
    });

    // Pagination for the Select Course Bundle modal table.
    const bundleTotal = filteredBundles.length;
    const bundleTotalPages = Math.max(1, Math.ceil(bundleTotal / bundlePageSize));
    const safeBundlePage = Math.min(bundlePage, bundleTotalPages);
    const pagedBundles = filteredBundles.slice((safeBundlePage - 1) * bundlePageSize, (safeBundlePage - 1) * bundlePageSize + bundlePageSize);
    const bundlePageNumbers = getPageNumbers(safeBundlePage, bundleTotalPages);
    const bundleShowingStart = bundleTotal === 0 ? 0 : (safeBundlePage - 1) * bundlePageSize + 1;
    const bundleShowingEnd = Math.min(safeBundlePage * bundlePageSize, bundleTotal);

    useEffect(() => {
        setBundlePage(1);
    }, [courseBundleSearchQuery, showSelectCourseModal]);

    const filteredInstructors = availableInstructors.filter(i => {
        if (!instructorSearchQuery) return true;
        const s = instructorSearchQuery.toLowerCase();
        return i.name.toLowerCase().includes(s) || i.expertSubject.toLowerCase().includes(s);
    });

    // ===== Skeleton =====

    if (loading) {
        return (
            <div className="course-management-page-wrapper">
                <div className="course-bundle-header" style={{ background: 'linear-gradient(135deg, #006073 0%, #008ba3 100%)', padding: '25px 30px', marginBottom: 25, borderRadius: 8 }}>
                    <div className="skeleton" style={{ height: 40, width: '60%', borderRadius: 6, background: 'rgba(255,255,255,0.2)' }}></div>
                </div>
                <div className="panel panel-default">
                    <div className="panel-body">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="skeleton" style={{ height: 70, marginBottom: 15, borderRadius: 8, background: '#f0f0f0' }}></div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    // ===== Main render =====

    return (
        <div className="course-management-page-wrapper">
            <ToastRegion toasts={toasts} setToasts={setToasts} />

            {/* Header */}
            <div className="course-bundle-header">
                <div className="header-content">
                    <div className="header-left">
                        <div className="welcome-section">
                            {!selectedCourseBundle ? (
                                <h2 className="welcome-title"><Icon className="ti ti-layers" /> Course Management</h2>
                            ) : (
                                <h2 className="welcome-title"><Icon className="ti ti-book" /> {selectedCourseBundle.title}</h2>
                            )}
                            {selectedCourseBundle && (
                                <p className="welcome-subtitle" style={{ background: 'rgba(255,255,255,0.15)', padding: '8px 12px', borderRadius: 4, display: 'inline-block', margin: 0 }}>
                                    <span style={{ fontWeight: 500 }}><Icon className="ti ti-folder" style={{ marginRight: 4 }} />{filteredModules.length} Modules</span>
                                    <span style={{ margin: '0 12px', opacity: 0.5 }}>|</span>
                                    <span style={{ fontWeight: 500 }}><Icon className="ti ti-list" style={{ marginRight: 4 }} />{filteredChapters.length} Chapters</span>
                                    {selectedCourseBundle.bundleCode && (
                                        <>
                                            <span style={{ margin: '0 12px', opacity: 0.5 }}>|</span>
                                            <span style={{ fontWeight: 400, opacity: 0.85 }}><Icon className="ti ti-tag" style={{ marginRight: 4 }} />{selectedCourseBundle.bundleCode}</span>
                                        </>
                                    )}
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="header-right">
                        <button className="btn btn-primary" style={{ marginRight: 10 }} onClick={() => { setCourseBundleSearchQuery(''); setShowSelectCourseModal(true); }}>
                            <Icon className="ti ti-layers" /> Select Course
                        </button>
                        <button className="btn" style={{ background: '#ffb706', color: '#006073', border: 'none', fontWeight: 600 }} onClick={() => { setNewBundle({ title: '', bundleCode: '', syllabusCode: '' }); setShowBundleModal(true); }}>
                            <Icon className="ti ti-plus" /> New Bundle
                        </button>
                    </div>
                </div>
            </div>

            {/* Main content */}
            {selectedCourseBundle && (
                <div className="row">
                    <div className="col-md-12">
                        <div className="panel panel-default">
                            <div className="panel-body">
                                {/* Tabs */}
                                <ul className="nav nav-tabs" role="tablist">
                                    <li role="presentation" className={!editingChapterParts && activeTab !== 'chapters' ? 'active' : (editingChapterParts ? 'disabled' : '')}>
                                        <a href="#" role="tab" onClick={e => { e.preventDefault(); if (!editingChapterParts) { setActiveTab('modules'); } }}>
                                            <Icon className="ti ti-folder" style={{ marginRight: 10 }} />
                                            {!selectedModule ? 'Modules' : `Module: ${selectedModule.title}`}
                                        </a>
                                    </li>
                                    {selectedModule && (
                                        <li role="presentation" className={!editingChapterParts && activeTab === 'chapters' ? 'active' : (editingChapterParts ? 'disabled' : '')}>
                                            <a href="#" role="tab" onClick={e => { e.preventDefault(); if (!editingChapterParts) setActiveTab('chapters'); }}>
                                                <Icon className="ti ti-book" style={{ marginRight: 10 }} />
                                                {!editingChapterData ? 'Chapters' : `Chapter: ${editingChapterData.code}. ${editingChapterData.title}`}
                                            </a>
                                        </li>
                                    )}
                                    {editingChapterParts && (
                                        <li role="presentation" className="active">
                                            <a href="#" role="tab" onClick={e => e.preventDefault()}>
                                                <Icon className="ti ti-video-camera" style={{ marginRight: 10 }} />Parts
                                            </a>
                                        </li>
                                    )}
                                </ul>

                                <div className="tab-content">
                                    {/* === MODULES TAB === */}
                                    {activeTab === 'modules' && !editingChapterParts && (
                                        <div className="tab-pane active">
                                            {filteredModules.length === 0 ? (
                                                <div className="alert alert-warning"><Icon className="ti ti-info" /> No modules found for this course bundle.</div>
                                            ) : (
                                                filteredModules.map(module => (
                                                    <div key={module.moduleKey} className={`module-card${selectedModule && selectedModule.moduleKey === module.moduleKey ? ' selected' : ''}`}>
                                                        <div
                                                            className={`module-header${expandedModules[module.moduleKey] ? ' expanded' : ''}`}
                                                            style={{ cursor: 'pointer' }}
                                                            onClick={() => toggleModule(module.moduleKey)}
                                                        >
                                                            <div className="row">
                                                                <div className="col-md-8">
                                                                    <div className="module-info">
                                                                        <div className="expand-indicator">
                                                                            <Icon className={`fa ${expandedModules[module.moduleKey] ? 'fa-folder-open-o' : 'fa-folder-o'}`} />
                                                                        </div>
                                                                        <div className="module-details">
                                                                            <h3 className="module-title">
                                                                                {module.title}
                                                                                {selectedModule && selectedModule.moduleKey === module.moduleKey && (
                                                                                    <span className="badge badge-success" style={{ marginLeft: 8 }}>Selected</span>
                                                                                )}
                                                                            </h3>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className="col-md-4 text-right">
                                                                    <button
                                                                        className="btn btn-success btn-sm"
                                                                        onClick={e => { e.stopPropagation(); selectModule(module); }}
                                                                    >
                                                                        <Icon className="ti ti-book" /> Modify Chapters
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {expandedModules[module.moduleKey] && (
                                                            <div className={`module-content${expandedModules[module.moduleKey] ? ' expanded' : ''}`}>
                                                                <div className="row">
                                                                    <div className="col-md-12">
                                                                        <div className="chapters-table-container">
                                                                            <table className="table table-striped table-hover">
                                                                                <thead>
                                                                                    <tr>
                                                                                        <th>Chapter</th>
                                                                                        <th>Name</th>
                                                                                        <th>Parts</th>
                                                                                        <th>Total Hours</th>
                                                                                        <th>Teacher</th>
                                                                                        <th>Status</th>
                                                                                    </tr>
                                                                                </thead>
                                                                                <tbody>
                                                                                    {getChaptersForModule(module.moduleKey).length === 0 ? (
                                                                                        <tr>
                                                                                            <td colSpan="6" className="text-center text-muted">
                                                                                                <Icon className="ti ti-info" /> No chapters assigned to this module yet
                                                                                            </td>
                                                                                        </tr>
                                                                                    ) : (
                                                                                        getChaptersForModule(module.moduleKey).map(chapter => (
                                                                                            <tr key={chapter.id}>
                                                                                                <td><strong>{chapter.code}</strong></td>
                                                                                                <td>{chapter.title}</td>
                                                                                                <td>{getPartsCountByType(chapter)}</td>
                                                                                                <td>{calculateChapterDuration(chapter)}</td>
                                                                                                <td>
                                                                                                    {chapter.teacher && (
                                                                                                        <div className="teacher-info-compact">
                                                                                                            <Avatar src={chapter.teacher.photo} name={chapter.teacher.name} className="teacher-photo-tiny" placeholderClassName="teacher-photo-tiny placeholder" />
                                                                                                            <button
                                                                                                                type="button"
                                                                                                                className="name-link"
                                                                                                                title="View teacher profile"
                                                                                                                onClick={(e) => { e.stopPropagation(); showTeacherProfile(chapter); }}
                                                                                                            >
                                                                                                                {chapter.teacher.name}
                                                                                                            </button>
                                                                                                        </div>
                                                                                                    )}
                                                                                                </td>
                                                                                                <td>
                                                                                                    <span className={`badge ${chapter.status === 1 ? 'badge-success' : 'badge-warning'}`}>
                                                                                                        {chapter.status === 1 ? 'Active' : 'Inactive'}
                                                                                                    </span>
                                                                                                </td>
                                                                                            </tr>
                                                                                        ))
                                                                                    )}
                                                                                </tbody>
                                                                            </table>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    )}

                                    {/* === CHAPTERS TAB === */}
                                    {activeTab === 'chapters' && !editingChapterParts && (
                                        <div className="tab-pane active">
                                            {!selectedModule ? (
                                                <div className="row">
                                                    <div className="col-md-12">
                                                        <div style={{ textAlign: 'center', padding: '60px 20px', background: '#f9f9f9', borderRadius: 8, border: '2px dashed #ddd' }}>
                                                            <Icon className="ti ti-info-alt" style={{ fontSize: 48, color: '#999', marginBottom: 20 }} />
                                                            <h4 style={{ color: '#666', marginBottom: 10 }}>No Module Selected</h4>
                                                            <p style={{ color: '#999' }}>Please select a module from the <strong>Modules</strong> tab to view its chapters.</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div>
                                                    <div className="row">
                                                        <div className="col-md-12" style={{ marginBottom: 20 }}>
                                                            <button className="btn btn-default" onClick={backToModules}>
                                                                <Icon className="ti ti-arrow-left" /> Back to Modules
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {chaptersForSelectedModule.length === 0 ? (
                                                        <div className="empty-chapters">
                                                            <div className="empty-icon"><Icon className="ti ti-book-open" /></div>
                                                            <h4>No Chapters in {selectedModule.title}</h4>
                                                            <p>This module doesn't have any chapters yet.</p>
                                                        </div>
                                                    ) : (
                                                        <div className="row">
                                                            <div className="col-md-12">
                                                                {chaptersForSelectedModule.map(chapter => (
                                                                    <div key={chapter.id} className="chapter-item">
                                                                        <div
                                                                            className={`chapter-header${expandedChapters[chapter.id] ? ' expanded' : ''}`}
                                                                            onClick={() => toggleChapter(chapter.id)}
                                                                        >
                                                                            <div className="row">
                                                                                <div className="col-md-8">
                                                                                    <div className="chapter-info">
                                                                                        <div className="expand-indicator">
                                                                                            <Icon className={`fa ${expandedChapters[chapter.id] ? 'fa-folder-open-o' : 'fa-folder-o'}`} />
                                                                                        </div>
                                                                                        <div className="chapter-details">
                                                                                            <h4 className="chapter-title">{chapter.title}</h4>
                                                                                            <p className="chapter-meta">
                                                                                                <span><b>Chapter {chapter.code}</b> | {getPartsCount(chapter.partsIncluded)} parts<Icon className="fa fa-circle separator-dot" aria-hidden="true" />{calculateChapterDuration(chapter)}</span>
                                                                                            </p>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                                <div className="col-md-3">
                                                                                    {chapter.teacher && chapter.teacher.name && chapter.teacher.name !== 'Unassigned' ? (
                                                                                        <div
                                                                                            className="teacher-info-simple"
                                                                                            style={{ cursor: 'pointer' }}
                                                                                            onClick={e => { e.stopPropagation(); showTeacherProfile(chapter); }}
                                                                                        >
                                                                                            <Avatar
                                                                                                src={chapter.teacher.photo}
                                                                                                name={chapter.teacher.name}
                                                                                                className="teacher-photo-small"
                                                                                                placeholderClassName="teacher-photo-small placeholder"
                                                                                            />
                                                                                            <div className="teacher-details-simple">
                                                                                                <span className="teacher-name-simple">{chapter.teacher.name}</span>
                                                                                                <div className="teacher-rating-simple">
                                                                                                    <div className="star-rating">
                                                                                                        {[0, 1, 2, 3, 4].map(i => (
                                                                                                            <Icon key={i} className={`fa ${getStarClass(chapter.teacher.rating, i)}`} />
                                                                                                        ))}
                                                                                                    </div>
                                                                                                    <span className="rating-value">({chapter.teacher.rating})</span>
                                                                                                </div>
                                                                                            </div>
                                                                                        </div>
                                                                                    ) : (
                                                                                        <div
                                                                                            className="teacher-not-mapped"
                                                                                            onClick={e => { e.stopPropagation(); assignInstructorToChapter(chapter); }}
                                                                                            style={{ cursor: 'pointer', padding: '8px 10px', border: '2px dashed #ccc', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8, background: '#f9f9f9', transition: 'all 0.3s ease' }}
                                                                                        >
                                                                                            <Icon className="ti ti-user" style={{ fontSize: 20, color: '#999' }} />
                                                                                            <div style={{ textAlign: 'left', flex: 1 }}>
                                                                                                <div style={{ color: '#666', fontSize: 12, fontWeight: 500, lineHeight: 1.2 }}>Not Mapped</div>
                                                                                                <div style={{ color: '#999', fontSize: 10, lineHeight: 1.2 }}>Click to assign</div>
                                                                                            </div>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                                <div className="col-md-1 text-right">
                                                                                    <div className="chapter-actions">
                                                                                        <button
                                                                                            className="btn btn-primary btn-sm"
                                                                                            onClick={e => { e.stopPropagation(); editChapter(chapter); }}
                                                                                        >
                                                                                            <Icon className="ti ti-pencil" /> Edit
                                                                                        </button>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        </div>

                                                                        {expandedChapters[chapter.id] && (
                                                                            <div className="parts-list expanded">
                                                                                {getPartsCount(chapter.partsIncluded) > 0 ? (
                                                                                    <div style={{ padding: 20, background: '#f8f9fa' }}>
                                                                                        <h5 style={{ margin: '0 0 15px 0', color: '#006073', fontWeight: 600 }}>
                                                                                            <Icon className="ti ti-layers" /> Parts Included in This Chapter ({getPartsCount(chapter.partsIncluded)})
                                                                                        </h5>
                                                                                        <div className="list-group">
                                                                                            {getPartsArray(chapter.partsIncluded).map((part, idx) => (
                                                                                                <div
                                                                                                    key={idx}
                                                                                                    className="list-group-item"
                                                                                                    style={{ marginBottom: 10, borderRadius: 6, cursor: 'pointer' }}
                                                                                                    onClick={() => openVideoModal(part, chapter, idx + 1)}
                                                                                                >
                                                                                                    <div className="row">
                                                                                                        <div className="col-md-1">
                                                                                                            <div className="part-number-badge-large">{idx + 1}</div>
                                                                                                        </div>
                                                                                                        <div className="col-md-1">
                                                                                                            <div className="part-type-icon">
                                                                                                                <Icon className={`ti ${part.type === 'VIDEO' ? 'ti-video-camera' : part.type === 'MATERIAL' ? 'ti-file' : 'ti-clipboard'}`} style={{ fontSize: 24 }} />
                                                                                                            </div>
                                                                                                        </div>
                                                                                                        <div className="col-md-6">
                                                                                                            <div><strong>{part.title || getVideoTitle(part.libraryId)}</strong></div>
                                                                                                            <div className="text-muted" style={{ fontSize: 12 }}>
                                                                                                                <span className={`badge badge-${part.type === 'VIDEO' ? 'primary' : part.type === 'MATERIAL' ? 'info' : 'secondary'}`}>{part.type}</span>
                                                                                                                {part.type === 'VIDEO' && part.duration > 0 && (
                                                                                                                    <span style={{ marginLeft: 10 }}><Icon className="ti ti-time" /> {formatDuration(part.duration)}</span>
                                                                                                                )}
                                                                                                            </div>
                                                                                                        </div>
                                                                                                        <div className="col-md-4 text-right">
                                                                                                            {part.skipToNext ? (
                                                                                                                <span className="badge badge-success"><Icon className="ti ti-forward" /> Skip to Next Enabled</span>
                                                                                                            ) : (
                                                                                                                <span className="badge badge-secondary"><Icon className="ti ti-control-pause" /> No Auto-Skip</span>
                                                                                                            )}
                                                                                                        </div>
                                                                                                    </div>
                                                                                                </div>
                                                                                            ))}
                                                                                        </div>
                                                                                    </div>
                                                                                ) : (
                                                                                    <div className="empty-parts">
                                                                                        <Icon className="ti ti-video-camera-off" />
                                                                                        <h6>No Parts Added</h6>
                                                                                        <p>This chapter doesn't have any parts assigned yet.</p>
                                                                                        <button className="btn btn-primary btn-sm" onClick={() => editChapter(chapter)}>
                                                                                            <Icon className="ti ti-plus" /> Add Parts
                                                                                        </button>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* === PARTS TAB === */}
                                    {activeTab === 'parts' && editingChapterParts && editingChapterData && (
                                        <div className="tab-pane active">
                                            <div className="row">
                                                <div className="col-md-12">
                                                    <div className="panel panel-default">
                                                        <div className="panel-heading" style={{ backgroundColor: '#006073', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <h4 className="panel-title" style={{ margin: 0 }}>
                                                                <Icon className="ti ti-layers" /> Chapter: {editingChapterData.code}. {editingChapterData.title}
                                                            </h4>
                                                            <div>
                                                                <button className="btn btn-success btn-sm" onClick={saveChapterParts} disabled={!hasChapterChanges()} style={{ marginRight: 8 }}>
                                                                    <Icon className="ti ti-save" /> Save
                                                                </button>
                                                                <button className="btn btn-default btn-sm" onClick={cancelChapterPartsEdit}>
                                                                    <Icon className="ti ti-close" /> Cancel
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <div className="panel-body">
                                                            {/* Selected parts list */}
                                                            <div className="form-group">
                                                                <label style={{ fontSize: 16, fontWeight: 'bold', color: '#006073' }}>
                                                                    <Icon className="ti ti-check-box" /> Parts Included in This Chapter ({getSelectedPartsCount()})
                                                                    <span style={{ fontSize: 12, color: '#999', fontWeight: 'normal', marginLeft: 10 }}>
                                                                        <Icon className="ti ti-hand-drag" /> Drag to reorder
                                                                    </span>
                                                                </label>
                                                                {getSelectedPartsCount() === 0 ? (
                                                                    <div className="alert alert-info">
                                                                        <Icon className="ti ti-info-alt" /> No parts added yet. Select parts from the "Add More Parts" section below.
                                                                    </div>
                                                                ) : (
                                                                    <div className="list-group" style={{ position: 'relative' }}>
                                                                        {getPartsArray(editingChapterData.partsIncluded).map((part, idx) => (
                                                                            <div
                                                                                key={part._key}
                                                                                className={`list-group-item drag-item${draggedIndex === idx ? ' dragging' : ''}${dragOverIndex === idx && draggedIndex !== idx ? ' drag-over' : ''}`}
                                                                                draggable
                                                                                data-index={idx}
                                                                                onDragStart={e => handleDragStart(e, idx)}
                                                                                onDragEnter={e => handleDragEnter(e, idx)}
                                                                                onDragLeave={handleDragLeave}
                                                                                onDragOver={e => handleDragOver(e, idx)}
                                                                                onDrop={e => handleDrop(e, idx)}
                                                                                onDragEnd={handleDragEnd}
                                                                                style={{ transition: 'all 0.3s ease', position: 'relative' }}
                                                                            >
                                                                                <div className="row">
                                                                                    <div className="col-md-1">
                                                                                        <div className="part-number-badge-large">{idx + 1}</div>
                                                                                    </div>
                                                                                    <div className="col-md-1">
                                                                                        <div className="part-type-icon">
                                                                                            <Icon className={`ti ${part.type === 'VIDEO' ? 'ti-video-camera' : part.type === 'MATERIAL' ? 'ti-file' : 'ti-clipboard'}`} style={{ fontSize: 24 }} />
                                                                                        </div>
                                                                                    </div>
                                                                                    <div className="col-md-5">
                                                                                        <div><strong>{part.title || getVideoTitle(part.libraryId)}</strong></div>
                                                                                        <div className="text-muted" style={{ fontSize: 12 }}>
                                                                                            <span className={`badge badge-${part.type === 'VIDEO' ? 'primary' : part.type === 'MATERIAL' ? 'info' : 'secondary'}`}>{part.type}</span>
                                                                                            {part.type === 'VIDEO' && part.duration > 0 && (
                                                                                                <span style={{ marginLeft: 10 }}><Icon className="ti ti-time" /> {formatDuration(part.duration)}</span>
                                                                                            )}
                                                                                        </div>
                                                                                    </div>
                                                                                    <div className="col-md-3">
                                                                                        <label className="checkbox-inline">
                                                                                            <input
                                                                                                type="checkbox"
                                                                                                checked={!!part.skipToNext}
                                                                                                onChange={e => updateSkipToNext(part._key, e.target.checked)}
                                                                                            /> Skip to Next
                                                                                        </label>
                                                                                    </div>
                                                                                    <div className="col-md-2 text-right">
                                                                                        <button
                                                                                            className="btn btn-xs btn-danger"
                                                                                            onClick={e => { e.stopPropagation(); removePartFromChapter(part._key); }}
                                                                                        >
                                                                                            <Icon className="ti ti-trash" /> Remove
                                                                                        </button>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>

                                                            <hr style={{ margin: '30px 0', borderTop: '2px solid #ddd' }} />

                                                            {/* Add More Parts */}
                                                            <div className="form-group">
                                                                <label style={{ fontSize: 16, fontWeight: 'bold', color: '#666' }}>
                                                                    <Icon className="ti ti-plus" /> Add More Parts from Library
                                                                </label>
                                                                <p className="text-muted" style={{ marginBottom: 15 }}>
                                                                    Click on any video below to add it to this chapter, or use the buttons to link quizzes and attach materials.
                                                                </p>

                                                                <div className="row" style={{ marginBottom: 20 }}>
                                                                    <div className="col-md-12">
                                                                        <button className="btn btn-primary" onClick={openLinkQuizModal} style={{ marginRight: 10 }}>
                                                                            <Icon className="ti ti-clipboard" /> Link Quiz
                                                                        </button>
                                                                        <button className="btn btn-success" onClick={openAttachMaterialModal}>
                                                                            <Icon className="ti ti-file" /> Attach Material
                                                                        </button>
                                                                    </div>
                                                                </div>

                                                                <div className="row" style={{ marginBottom: 20 }}>
                                                                    <div className="col-md-6">
                                                                        <div className="input-group">
                                                                            <span className="input-group-addon"><Icon className="ti ti-search" /></span>
                                                                            <input
                                                                                type="text"
                                                                                className="form-control"
                                                                                placeholder="Search videos by title or library ID..."
                                                                                value={contentLibrarySearch}
                                                                                onChange={e => setContentLibrarySearch(e.target.value)}
                                                                            />
                                                                            {contentLibrarySearch && (
                                                                                <span className="input-group-btn">
                                                                                    <button className="btn btn-default" type="button" onClick={() => setContentLibrarySearch('')}>
                                                                                        <Icon className="ti ti-close" />
                                                                                    </button>
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    <div className="col-md-6 text-right">
                                                                        <span className="text-muted" style={{ lineHeight: '34px' }}>
                                                                            Showing {visibleVideoParts.length} videos
                                                                        </span>
                                                                    </div>
                                                                </div>

                                                                <div className="parts-grid">
                                                                    {visibleVideoParts.map(part => (
                                                                        <div
                                                                            key={part.libraryId}
                                                                            className={`part-card selectable${isPartSelected(part.libraryId) ? ' selected' : ''}`}
                                                                        >
                                                                            <div className="part-header">
                                                                                <div className={`part-type-badge type-${part.type.toLowerCase()}`}>{part.type}</div>
                                                                                <div className="part-actions">
                                                                                    {part.type === 'VIDEO' && part.source && (
                                                                                        <button className="btn btn-xs btn-default" onClick={e => showVideoPreview(part, e)} title="Preview Video" style={{ marginRight: 5 }}>
                                                                                            <Icon className="ti ti-eye" />
                                                                                        </button>
                                                                                    )}
                                                                                    <button
                                                                                        className={`btn btn-xs ${isPartSelected(part.libraryId) ? 'btn-success' : 'btn-primary'}`}
                                                                                        onClick={e => { e.stopPropagation(); togglePartSelection(part); }}
                                                                                        title={isPartSelected(part.libraryId) ? 'Remove from Parts' : 'Add to Parts'}
                                                                                    >
                                                                                        {isPartSelected(part.libraryId)
                                                                                            ? 'Added'
                                                                                            : <><Icon className="fa fa-plus" /> Add</>}
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                            <div
                                                                                className="part-content"
                                                                                onClick={e => part.type === 'VIDEO' && showVideoPreview(part, e)}
                                                                                style={{ cursor: part.type === 'VIDEO' ? 'pointer' : 'default' }}
                                                                            >
                                                                                <div className="part-thumbnail">
                                                                                    <Icon className="ti ti-video-camera" />
                                                                                </div>
                                                                                <div className="part-info">
                                                                                    <h6 className="part-title">{part.title}</h6>
                                                                                    <div className="part-meta">
                                                                                        <span><Icon className="ti ti-time" /> {formatDuration(part.duration)}</span>
                                                                                    </div>
                                                                                    {part.brief && (
                                                                                        <div className="part-brief">
                                                                                            <small className="text-muted">{part.brief}</small>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                            {isPartSelected(part.libraryId) && (
                                                                                <div className="selection-indicator">
                                                                                    <Icon className="ti ti-check-box" />
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                </div>

                                                                {visibleVideoParts.length === 0 && (
                                                                    <div style={{ textAlign: 'center', padding: 40, background: '#f8f9fa', borderRadius: 8 }}>
                                                                        <Icon className="ti ti-video-camera" style={{ fontSize: 48, color: '#dee2e6' }} />
                                                                        <p className="text-muted" style={{ marginTop: 15 }}>No videos found matching your search.</p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ========================= MODALS ========================= */}

            {/* Course Bundle Creation Modal */}
            {showBundleModal && (
                <div className="legacy-modal-backdrop active" onClick={() => setShowBundleModal(false)}>
                    <div className="legacy-modal-dialog form-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
                        <div className="legacy-modal-header">
                            <h3>Create New Course Bundle</h3>
                            <button type="button" className="legacy-modal-close" onClick={() => setShowBundleModal(false)}>
                                <Icon className="ti ti-close" />
                            </button>
                        </div>
                        <form className="batch-modal-form form-modal" onSubmit={e => { e.preventDefault(); saveCourseBundle(); }}>
                            <div className="legacy-modal-body">
                                <div className="asset-form-section">
                                    <div className="asset-form-section-title"><Icon className="ti ti-book-open" /> Bundle Details</div>
                                    <div className="asset-form-grid">
                                        <label className="field-cell full-span">
                                            <div className="float-field">
                                                <input
                                                    type="text"
                                                    className="float-control"
                                                    placeholder=" "
                                                    value={newBundle.title}
                                                    onChange={e => setNewBundle({ ...newBundle, title: e.target.value })}
                                                />
                                                <span className="float-label">Bundle Title <span className="req">*</span></span>
                                            </div>
                                            <span className="field-hint">Enter a descriptive title for your course bundle</span>
                                        </label>
                                        <label className="field-cell">
                                            <div className="float-field">
                                                <input
                                                    type="text"
                                                    className="float-control"
                                                    placeholder=" "
                                                    value={newBundle.bundleCode}
                                                    onChange={e => setNewBundle({ ...newBundle, bundleCode: e.target.value })}
                                                />
                                                <span className="float-label">Bundle Code <span className="req">*</span></span>
                                            </div>
                                            <span className="field-hint">Unique identifier for the course bundle</span>
                                        </label>
                                        <label className="field-cell">
                                            <div className="float-field float-always">
                                                <select
                                                    className="float-control"
                                                    value={newBundle.syllabusCode}
                                                    onChange={e => setNewBundle({ ...newBundle, syllabusCode: e.target.value })}
                                                >
                                                    <option value="">-- Select a Syllabus --</option>
                                                    {uniqueSyllabi.map(syl => (
                                                        <option key={syl.code} value={syl.code}>{syl.name}</option>
                                                    ))}
                                                </select>
                                                <span className="float-label">Select Syllabus <span className="req">*</span></span>
                                            </div>
                                            <span className="field-hint">Select a syllabus to initialize modules and chapters.</span>
                                        </label>
                                    </div>

                                    {newBundle.syllabusCode && (
                                        <div className="cmb-info-note">
                                            <Icon className="ti ti-info-alt" />
                                            <div>
                                                <strong>Syllabus Selected:</strong> {uniqueSyllabi.find(s => s.code === newBundle.syllabusCode)?.name}
                                                <div className="cmb-info-sub">Modules will be organized by segments for easier classification</div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="legacy-modal-footer">
                                <button type="button" className="legacy-btn legacy-btn-default" onClick={() => setShowBundleModal(false)}>Cancel</button>
                                <button type="submit" className="legacy-btn legacy-btn-success" disabled={!newBundle.title || !newBundle.bundleCode || !newBundle.syllabusCode}>
                                    Create Course Bundle
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Select Course Bundle Modal — standard modal + table */}
            {showSelectCourseModal && (
                <div className="legacy-modal-backdrop active" onClick={() => setShowSelectCourseModal(false)}>
                    <div className="legacy-modal-dialog legacy-large form-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
                        <div className="legacy-modal-header">
                            <h3>Select Course Bundle</h3>
                            <button type="button" className="legacy-modal-close" onClick={() => setShowSelectCourseModal(false)}>
                                <Icon className="ti ti-close" />
                            </button>
                        </div>
                        <div className="legacy-modal-body">
                            <div className="asset-form-section">
                                <div className="asset-form-section-title"><Icon className="ti ti-layers" /> Available Bundles</div>
                                <div className="data-table-page" style={{ padding: 0 }}>
                                    <div className="search-wrapper" style={{ marginBottom: 16 }}>
                                        <Icon className="ti ti-search" />
                                        <input
                                            type="text"
                                            className="search-input"
                                            placeholder="Search course bundles by title or code..."
                                            value={courseBundleSearchQuery}
                                            onChange={e => setCourseBundleSearchQuery(e.target.value)}
                                        />
                                    </div>

                                    <div className="students-table-container">
                                        <table className="students-table">
                                            <thead>
                                                <tr>
                                                    <th style={{ width: 64 }}><Icon className="ti ti-hash" /></th>
                                                    <th>Course Bundle</th>
                                                    <th className="cm-center">Modules</th>
                                                    <th className="cm-center">Chapters</th>
                                                    <th className="cm-center">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {pagedBundles.map(bundle => (
                                                    <tr
                                                        key={bundle.id}
                                                        className={`cm-bundle-row ${selectedCourseBundle && selectedCourseBundle.id === bundle.id ? 'is-selected' : ''}`}
                                                        onClick={() => selectCourseBundleFromModal(bundle)}
                                                    >
                                                        <td><div className="cm-avatar"><Icon className="ti ti-book" /></div></td>
                                                        <td>
                                                            <div className="cm-name">{bundle.title}</div>
                                                            <div className="cm-code">Code: {bundle.bundleCode}</div>
                                                        </td>
                                                        <td className="cm-center"><span className="cm-pill cm-pill-blue">{bundle.modulesIncluded ? bundle.modulesIncluded.length : 0}</span></td>
                                                        <td className="cm-center"><span className="cm-pill cm-pill-amber">{getChapterCountForBundle(bundle)}</span></td>
                                                        <td className="cm-center"><span className={`cm-status ${bundle.active === 1 ? 'active' : 'inactive'}`}>{bundle.active === 1 ? 'Active' : 'Inactive'}</span></td>
                                                    </tr>
                                                ))}
                                                {bundleTotal === 0 && (
                                                    <tr>
                                                        <td colSpan={5}>
                                                            <div className="cm-empty">
                                                                <Icon className="ti ti-search" />
                                                                <p>No course bundles found matching your search</p>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>

                                    {bundleTotal > 0 && (
                                        <div className="pagination-container">
                                            <div className="pagination-info">
                                                <span>Showing {bundleShowingStart} to {bundleShowingEnd} of {bundleTotal} entries</span>
                                                <select
                                                    className="page-size-select"
                                                    value={bundlePageSize}
                                                    onChange={e => { setBundlePageSize(Number(e.target.value)); setBundlePage(1); }}
                                                >
                                                    <option value={10}>Show 10</option>
                                                    <option value={20}>Show 20</option>
                                                    <option value={50}>Show 50</option>
                                                </select>
                                            </div>
                                            <div className="pagination-controls">
                                                <button type="button" className="pagination-btn" disabled={safeBundlePage === 1} onClick={() => setBundlePage(p => Math.max(1, p - 1))}>
                                                    <Icon className="ti ti-angle-left" /> Previous
                                                </button>
                                                {bundlePageNumbers.map(page => (
                                                    <button
                                                        key={page}
                                                        type="button"
                                                        className={`pagination-btn ${safeBundlePage === page ? 'active' : ''}`}
                                                        onClick={() => setBundlePage(page)}
                                                    >
                                                        {page}
                                                    </button>
                                                ))}
                                                <button type="button" className="pagination-btn" disabled={safeBundlePage === bundleTotalPages} onClick={() => setBundlePage(p => Math.min(bundleTotalPages, p + 1))}>
                                                    Next <Icon className="ti ti-angle-right" />
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="legacy-modal-footer">
                            <div className="cm-footer-hint"><Icon className="ti ti-info-alt" /> Click on a row to select and open the course bundle</div>
                            <button type="button" className="legacy-btn legacy-btn-default" onClick={() => setShowSelectCourseModal(false)}>Close</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Teacher Profile Modal */}
            {showTeacherModal && selectedTeacherProfile && (
                <div className="legacy-modal-backdrop active" onClick={() => setShowTeacherModal(false)}>
                    <div className="legacy-modal-dialog form-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
                        <div className="legacy-modal-header">
                            <h3>Instructor Profile</h3>
                            <button type="button" className="legacy-modal-close" onClick={() => setShowTeacherModal(false)}>
                                <Icon className="ti ti-close" />
                            </button>
                        </div>
                        <div className="legacy-modal-body">
                            <div className="cm-profile">
                                <div className="cm-profile-side">
                                    <Avatar
                                        src={selectedTeacherProfile.photo}
                                        name={selectedTeacherProfile.name}
                                        style={{ width: 120, height: 120, borderRadius: '50%', objectFit: 'cover', border: '4px solid #006073' }}
                                        placeholderStyle={{ width: 120, height: 120, borderRadius: '50%', objectFit: 'cover', border: '4px solid #006073', background: 'linear-gradient(135deg, #006073 0%, #004d5c 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 40, fontWeight: 700 }}
                                    />
                                    <div className="cm-profile-rating">
                                        {[0, 1, 2, 3, 4].map(i => (
                                            <Icon key={i} className={`fa ${getStarClass(selectedTeacherProfile.rating, i)}`} />
                                        ))}
                                    </div>
                                    <div className="cm-profile-score">{selectedTeacherProfile.rating}/5.0</div>
                                    <div className="cm-profile-students">{selectedTeacherProfile.studentsCount || 0} Students</div>
                                </div>
                                <div className="cm-profile-main">
                                    <h4 className="cm-profile-name">{selectedTeacherProfile.name}</h4>
                                    <p className="cm-profile-brief">{selectedTeacherProfile.brief || selectedTeacherProfile.about}</p>
                                    <div className="cm-profile-row">
                                        <strong><Icon className="ti ti-bookmark" /> Specialization</strong>
                                        <p>{selectedTeacherProfile.specialization || selectedTeacherProfile.expertSubject}</p>
                                    </div>
                                    <div className="cm-profile-row">
                                        <strong><Icon className="ti ti-briefcase" /> Experience</strong>
                                        <p>{selectedTeacherProfile.experience || 'N/A'}</p>
                                    </div>
                                    {(selectedTeacherProfile.education || selectedTeacherProfile.qualifications) && (
                                        <div className="cm-profile-row">
                                            <strong><Icon className="ti ti-medall" /> Education</strong>
                                            <p>{selectedTeacherProfile.education || selectedTeacherProfile.qualifications}</p>
                                        </div>
                                    )}
                                    {selectedTeacherProfile.about && (
                                        <div className="cm-profile-row">
                                            <strong><Icon className="ti ti-info-alt" /> About</strong>
                                            <p>{selectedTeacherProfile.about}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="legacy-modal-footer">
                            <button type="button" className="legacy-btn legacy-btn-default" onClick={() => setShowTeacherModal(false)}>Close</button>
                            <button type="button" className="legacy-btn legacy-btn-success" onClick={openChangeInstructorModal}>Change Instructor</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Change Instructor Modal */}
            {showChangeInstructorModal && (
                <div className="legacy-modal-backdrop active" onClick={() => setShowChangeInstructorModal(false)}>
                    <div className="legacy-modal-dialog legacy-large form-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
                        <div className="legacy-modal-header">
                            <h3>Change Instructor</h3>
                            <button type="button" className="legacy-modal-close" onClick={() => setShowChangeInstructorModal(false)}>
                                <Icon className="ti ti-close" />
                            </button>
                        </div>
                        <div className="legacy-modal-body">
                            <div className="asset-form-section">
                                <div className="asset-form-section-title"><Icon className="ti ti-user" /> Select Instructor</div>
                                {currentChapterForTeacherChange && (
                                    <div className="cmb-info-note">
                                        <Icon className="ti ti-info-alt" />
                                        <div>Reassigning instructor for <strong>{currentChapterForTeacherChange.title}</strong></div>
                                    </div>
                                )}
                                <div className="data-table-page" style={{ padding: 0, marginTop: 16 }}>
                                    <div className="search-wrapper" style={{ marginBottom: 16 }}>
                                        <Icon className="ti ti-search" />
                                        <input
                                            type="text"
                                            className="search-input"
                                            placeholder="Search instructors by name, subject, or expertise..."
                                            value={instructorSearchQuery}
                                            onChange={e => setInstructorSearchQuery(e.target.value)}
                                        />
                                    </div>
                                    <div className="cm-instructor-list">
                                        {filteredInstructors.map(instructor => (
                                            <div
                                                key={instructor.id}
                                                className={`cm-instructor-card${selectedNewInstructor && selectedNewInstructor.id === instructor.id ? ' is-selected' : ''}`}
                                                onClick={() => setSelectedNewInstructor(instructor)}
                                            >
                                                <Avatar
                                                    src={instructor.photo}
                                                    name={instructor.name}
                                                    style={{ width: 54, height: 54, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                                                    placeholderStyle={{ width: 54, height: 54, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg, #006073 0%, #004d5c 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 18, fontWeight: 700 }}
                                                />
                                                <div style={{ flex: 1 }}>
                                                    <div className="cm-instructor-name">
                                                        {instructor.name}
                                                        {selectedNewInstructor && selectedNewInstructor.id === instructor.id && (
                                                            <Icon className="ti ti-check-box cm-instructor-check" />
                                                        )}
                                                    </div>
                                                    <div className="cm-instructor-brief">{instructor.brief}</div>
                                                    <div className="cm-instructor-meta">
                                                        <span><Icon className="ti ti-bookmark-alt" /> <strong>Subject:</strong> {instructor.expertSubject}</span>
                                                        <span><Icon className="ti ti-briefcase" /> <strong>Experience:</strong> {instructor.experience} years</span>
                                                        <span><Icon className="ti ti-star" /> <strong>Rating:</strong> {instructor.rating}/5</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                        {filteredInstructors.length === 0 && (
                                            <div className="cm-empty">
                                                <Icon className="ti ti-search" />
                                                <p>No instructors found matching your search.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="legacy-modal-footer">
                            <button type="button" className="legacy-btn legacy-btn-default" onClick={() => setShowChangeInstructorModal(false)}>Cancel</button>
                            <button type="button" className="legacy-btn legacy-btn-success" onClick={confirmInstructorChange} disabled={!selectedNewInstructor}>Assign Instructor</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Video Modal */}
            {showVideoModal && selectedVideo && (
                <div className="legacy-modal-backdrop active" onClick={() => setShowVideoModal(false)}>
                    <div className="legacy-modal-dialog legacy-large form-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
                        <div className="legacy-modal-header">
                            <h3>{selectedVideo.title}</h3>
                            <button type="button" className="legacy-modal-close" onClick={() => setShowVideoModal(false)}>
                                <Icon className="ti ti-close" />
                            </button>
                        </div>
                        <div className="legacy-modal-body">
                            <div className="cm-video-layout">
                                <div className="cm-video-frame">
                                    <div>
                                        <Icon className="ti ti-video-camera" />
                                        <p>Video Player</p>
                                        <small>Video URL: {selectedVideo.libraryId}</small>
                                    </div>
                                </div>
                                <div className="cm-video-side">
                                    <div className="asset-form-section-title"><Icon className="ti ti-info-circle" /> Video Details</div>
                                    <ul className="cm-detail-list">
                                        <li><strong>Part</strong> <span>{selectedVideo.partNumber}</span></li>
                                        <li><strong>Chapter</strong> <span>{selectedVideo.chapterTitle}</span></li>
                                        <li><strong>Module</strong> <span>{selectedVideo.moduleCode}</span></li>
                                        <li><strong>Type</strong> <span>{selectedVideo.type}</span></li>
                                        <li><strong>Skip to Next</strong> <span className={`cm-status ${selectedVideo.skipToNext ? 'active' : 'inactive'}`}>{selectedVideo.skipToNext ? 'Yes' : 'No'}</span></li>
                                    </ul>
                                    <button type="button" className="legacy-btn legacy-btn-default cm-video-action" onClick={() => showToast('info', '', 'Added to playlist!')}>Add to Playlist</button>
                                </div>
                            </div>
                        </div>
                        <div className="legacy-modal-footer">
                            <button type="button" className="legacy-btn legacy-btn-default" onClick={() => setShowVideoModal(false)}>Close</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Video Preview Modal */}
            {showVideoPreviewModal && videoPreviewPart && (
                <div className="legacy-modal-backdrop active" onClick={() => setShowVideoPreviewModal(false)}>
                    <div className="legacy-modal-dialog legacy-large form-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
                        <div className="legacy-modal-header">
                            <h3>{videoPreviewPart.title}</h3>
                            <button type="button" className="legacy-modal-close" onClick={() => setShowVideoPreviewModal(false)}>
                                <Icon className="ti ti-close" />
                            </button>
                        </div>
                        <div className="legacy-modal-body">
                            <div className="cm-video-embed">
                                <div className="cm-video-embed-inner">
                                    <div>
                                        <Icon className="ti ti-video-camera" />
                                        <p>Video preview not available in demo</p>
                                    </div>
                                </div>
                            </div>
                            <div className="cm-video-meta">
                                <span><Icon className="ti ti-time" /> {formatDuration(videoPreviewPart.duration)}</span>
                                <span><Icon className="ti ti-bookmark" /> {videoPreviewPart.libraryId}</span>
                            </div>
                        </div>
                        <div className="legacy-modal-footer">
                            <button type="button" className="legacy-btn legacy-btn-default" onClick={() => setShowVideoPreviewModal(false)}>Hide</button>
                            <button
                                type="button"
                                className={`legacy-btn ${isPartSelected(videoPreviewPart.libraryId) ? 'legacy-btn-danger' : 'legacy-btn-success'}`}
                                onClick={() => togglePartSelection(videoPreviewPart)}
                            >
                                {isPartSelected(videoPreviewPart.libraryId) ? 'Remove from Parts' : 'Add to Parts'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Link Quiz Modal — standard modal + table */}
            {showLinkQuizModal && (
                <div className="legacy-modal-backdrop active" onClick={() => setShowLinkQuizModal(false)}>
                    <div className="legacy-modal-dialog legacy-large form-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
                        <div className="legacy-modal-header">
                            <h3>Link Quiz to Chapter</h3>
                            <button type="button" className="legacy-modal-close" onClick={() => setShowLinkQuizModal(false)}>
                                <Icon className="ti ti-close" />
                            </button>
                        </div>
                        <div className="legacy-modal-body">
                            <div className="asset-form-section">
                                <div className="asset-form-section-title"><Icon className="ti ti-clipboard" /> Available Quizzes</div>
                                <div className="cmb-info-note">
                                    <Icon className="ti ti-info-alt" />
                                    <div>Select a quiz from the list below to add it as a part in this chapter.</div>
                                </div>
                                <div className="data-table-page" style={{ padding: 0, marginTop: 16 }}>
                                    <div className="search-wrapper" style={{ marginBottom: 16 }}>
                                        <Icon className="ti ti-search" />
                                        <input
                                            type="text"
                                            className="search-input"
                                            placeholder="Search quizzes by title or description..."
                                            value={quizSearchQuery}
                                            onChange={e => setQuizSearchQuery(e.target.value)}
                                        />
                                    </div>
                                    <div className="students-table-container">
                                        <table className="students-table">
                                            <thead>
                                                <tr>
                                                    <th style={{ width: 56 }}></th>
                                                    <th>Quiz Title</th>
                                                    <th className="cm-center">Questions</th>
                                                    <th className="cm-center">Max Marks</th>
                                                    <th className="cm-center">Duration</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr>
                                                    <td colSpan={5}>
                                                        <div className="cm-empty">
                                                            <Icon className="ti ti-clipboard" />
                                                            <p>No published quizzes available. Create quizzes in the Practice Quizzes section.</p>
                                                        </div>
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="legacy-modal-footer">
                            <button type="button" className="legacy-btn legacy-btn-default" onClick={() => setShowLinkQuizModal(false)}>Cancel</button>
                            <button type="button" className="legacy-btn legacy-btn-success" onClick={linkQuizToChapter} disabled={!selectedQuizForLink}>Link Quiz</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Attach Material Modal — standard modal + form */}
            {showAttachMaterialModal && (
                <div className="legacy-modal-backdrop active" onClick={() => setShowAttachMaterialModal(false)}>
                    <div className="legacy-modal-dialog form-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
                        <div className="legacy-modal-header">
                            <h3>Attach Material (PDF)</h3>
                            <button type="button" className="legacy-modal-close" onClick={() => setShowAttachMaterialModal(false)}>
                                <Icon className="ti ti-close" />
                            </button>
                        </div>
                        <form className="batch-modal-form form-modal" onSubmit={e => { e.preventDefault(); attachMaterialToChapter(); }}>
                            <div className="legacy-modal-body">
                                <div className="asset-form-section">
                                    <div className="asset-form-section-title"><Icon className="ti ti-file" /> Material Details</div>
                                    <div className="cmb-info-note">
                                        <Icon className="ti ti-info-alt" />
                                        <div>Upload a PDF document to add it as a study material in this chapter.</div>
                                    </div>
                                    <div className="asset-form-grid" style={{ marginTop: 16 }}>
                                        <label className="field-cell full-span">
                                            <div className="float-field">
                                                <input
                                                    type="text"
                                                    className="float-control"
                                                    placeholder=" "
                                                    value={materialUpload.title}
                                                    onChange={e => setMaterialUpload({ ...materialUpload, title: e.target.value })}
                                                />
                                                <span className="float-label">Material Title <span className="req">*</span></span>
                                            </div>
                                            <span className="field-hint">This will be shown to students</span>
                                        </label>
                                        <label className="field-cell full-span">
                                            <div className="float-field float-always cm-upload-field">
                                                <input type="file" ref={materialFileRef} accept=".pdf,application/pdf" onChange={handleMaterialFileSelect} style={{ display: 'none' }} />
                                                <button type="button" className="cm-upload-btn" onClick={() => materialFileRef.current && materialFileRef.current.click()}>
                                                    <Icon className="ti ti-upload" /> {materialUpload.fileName || 'Choose PDF File'}
                                                </button>
                                                <span className="float-label">PDF File <span className="req">*</span></span>
                                            </div>
                                            <span className="field-hint">Only PDF files are allowed</span>
                                        </label>
                                        <label className="field-cell full-span">
                                            <div className="float-field float-textarea">
                                                <textarea
                                                    className="float-control"
                                                    placeholder=" "
                                                    value={materialUpload.brief}
                                                    onChange={e => setMaterialUpload({ ...materialUpload, brief: e.target.value })}
                                                />
                                                <span className="float-label">Brief Description</span>
                                            </div>
                                        </label>
                                    </div>

                                    {materialUpload.fileName && (
                                        <div className="cm-file-preview">
                                            <Icon className="ti ti-file-text cm-file-icon" />
                                            <div>
                                                <div className="cm-file-name">{materialUpload.fileName}</div>
                                                <div className="cm-file-type">PDF Document</div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="legacy-modal-footer">
                                <button type="button" className="legacy-btn legacy-btn-default" onClick={() => setShowAttachMaterialModal(false)}>Cancel</button>
                                <button type="submit" className="legacy-btn legacy-btn-success" disabled={!materialUpload.file || !materialUpload.title}>Attach Material</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
