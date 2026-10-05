import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ToastRegion from '../components/ToastRegion';
import Icon from '../components/Icon';

/* ── Chapter Data (mirrors legacy practice-questions.html) ── */
const chaptersBySubject = {
  Physics: [
    { group: 'Physics - Plus One', items: [
      { code: '1P01', label: 'Chapter 1: Physical World' },{ code: '1P02', label: 'Chapter 2: Units and Measurements' },{ code: '1P03', label: 'Chapter 3: Motion in a Straight Line' },{ code: '1P04', label: 'Chapter 4: Motion in a Plane' },{ code: '1P05', label: 'Chapter 5: Laws of Motion' },{ code: '1P06', label: 'Chapter 6: Work, Energy and Power' },{ code: '1P07', label: 'Chapter 7: System of Particles and Rotational Motion' },{ code: '1P08', label: 'Chapter 8: Gravitation' },{ code: '1P09', label: 'Chapter 9: Mechanical Properties of Solids' },{ code: '1P10', label: 'Chapter 10: Mechanical Properties of Fluids' },{ code: '1P11', label: 'Chapter 11: Thermal Properties of Matter' },{ code: '1P12', label: 'Chapter 12: Thermodynamics' },{ code: '1P13', label: 'Chapter 13: Kinetic Theory' },{ code: '1P14', label: 'Chapter 14: Oscillations' },{ code: '1P15', label: 'Chapter 15: Waves' },
    ]},
    { group: 'Physics - Plus Two', items: [
      { code: '2P01', label: 'Chapter 1: Electric Charges and Fields' },{ code: '2P02', label: 'Chapter 2: Electrostatic Potential and Capacitance' },{ code: '2P03', label: 'Chapter 3: Current Electricity' },{ code: '2P04', label: 'Chapter 4: Moving Charges and Magnetism' },{ code: '2P05', label: 'Chapter 5: Magnetism and Matter' },{ code: '2P06', label: 'Chapter 6: Electromagnetic Induction' },{ code: '2P07', label: 'Chapter 7: Alternating Current' },{ code: '2P08', label: 'Chapter 8: Electromagnetic Waves' },{ code: '2P09', label: 'Chapter 9: Ray Optics and Optical Instruments' },{ code: '2P10', label: 'Chapter 10: Wave Optics' },{ code: '2P11', label: 'Chapter 11: Dual Nature of Radiation and Matter' },{ code: '2P12', label: 'Chapter 12: Atoms' },{ code: '2P13', label: 'Chapter 13: Nuclei' },{ code: '2P14', label: 'Chapter 14: Semiconductor Electronics' },{ code: '2P15', label: 'Chapter 15: Communication Systems' },
    ]},
  ],
  Chemistry: [
    { group: 'Chemistry - Plus One', items: [
      { code: '1C01', label: 'Chapter 1: Some Basic Concepts of Chemistry' },{ code: '1C02', label: 'Chapter 2: Structure of Atom' },{ code: '1C03', label: 'Chapter 3: Classification of Elements and Periodicity' },{ code: '1C04', label: 'Chapter 4: Chemical Bonding and Molecular Structure' },{ code: '1C05', label: 'Chapter 5: States of Matter' },{ code: '1C06', label: 'Chapter 6: Thermodynamics' },{ code: '1C07', label: 'Chapter 7: Equilibrium' },{ code: '1C08', label: 'Chapter 8: Redox Reactions' },{ code: '1C09', label: 'Chapter 9: Hydrogen' },{ code: '1C10', label: 'Chapter 10: The s-Block Elements' },{ code: '1C11', label: 'Chapter 11: The p-Block Elements' },{ code: '1C12', label: 'Chapter 12: Organic Chemistry - Basic Principles' },{ code: '1C13', label: 'Chapter 13: Hydrocarbons' },{ code: '1C14', label: 'Chapter 14: Environmental Chemistry' },
    ]},
    { group: 'Chemistry - Plus Two', items: [
      { code: '2C01', label: 'Chapter 1: The Solid State' },{ code: '2C02', label: 'Chapter 2: Solutions' },{ code: '2C03', label: 'Chapter 3: Electrochemistry' },{ code: '2C04', label: 'Chapter 4: Chemical Kinetics' },{ code: '2C05', label: 'Chapter 5: Surface Chemistry' },{ code: '2C06', label: 'Chapter 6: General Principles of Extraction' },{ code: '2C07', label: 'Chapter 7: The p-Block Elements' },{ code: '2C08', label: 'Chapter 8: The d and f Block Elements' },{ code: '2C09', label: 'Chapter 9: Coordination Compounds' },{ code: '2C10', label: 'Chapter 10: Haloalkanes and Haloarenes' },{ code: '2C11', label: 'Chapter 11: Alcohols, Phenols and Ethers' },{ code: '2C12', label: 'Chapter 12: Aldehydes, Ketones and Carboxylic Acids' },{ code: '2C13', label: 'Chapter 13: Amines' },{ code: '2C14', label: 'Chapter 14: Biomolecules' },{ code: '2C15', label: 'Chapter 15: Polymers' },{ code: '2C16', label: 'Chapter 16: Chemistry in Everyday Life' },
    ]},
  ],
  Mathematics: [
    { group: 'Mathematics - Plus One', items: [
      { code: '1M01', label: 'Chapter 1: Sets' },{ code: '1M02', label: 'Chapter 2: Relations and Functions' },{ code: '1M03', label: 'Chapter 3: Trigonometric Functions' },{ code: '1M04', label: 'Chapter 4: Principle of Mathematical Induction' },{ code: '1M05', label: 'Chapter 5: Complex Numbers and Quadratic Equations' },{ code: '1M06', label: 'Chapter 6: Linear Inequalities' },{ code: '1M07', label: 'Chapter 7: Permutations and Combinations' },{ code: '1M08', label: 'Chapter 8: Binomial Theorem' },{ code: '1M09', label: 'Chapter 9: Sequences and Series' },{ code: '1M10', label: 'Chapter 10: Straight Lines' },{ code: '1M11', label: 'Chapter 11: Conic Sections' },{ code: '1M12', label: 'Chapter 12: Introduction to Three Dimensional Geometry' },{ code: '1M13', label: 'Chapter 13: Limits and Derivatives' },{ code: '1M14', label: 'Chapter 14: Mathematical Reasoning' },{ code: '1M15', label: 'Chapter 15: Statistics' },{ code: '1M16', label: 'Chapter 16: Probability' },
    ]},
    { group: 'Mathematics - Plus Two', items: [
      { code: '2M01', label: 'Chapter 1: Relations and Functions' },{ code: '2M02', label: 'Chapter 2: Inverse Trigonometric Functions' },{ code: '2M03', label: 'Chapter 3: Matrices' },{ code: '2M04', label: 'Chapter 4: Determinants' },{ code: '2M05', label: 'Chapter 5: Continuity and Differentiability' },{ code: '2M06', label: 'Chapter 6: Application of Derivatives' },{ code: '2M07', label: 'Chapter 7: Integrals' },{ code: '2M08', label: 'Chapter 8: Application of Integrals' },{ code: '2M09', label: 'Chapter 9: Differential Equations' },{ code: '2M10', label: 'Chapter 10: Vector Algebra' },{ code: '2M11', label: 'Chapter 11: Three Dimensional Geometry' },{ code: '2M12', label: 'Chapter 12: Linear Programming' },{ code: '2M13', label: 'Chapter 13: Probability' },
    ]},
  ],
  Biology: [
    { group: 'Biology - Plus One', items: [
      { code: '1B01', label: 'Chapter 1: Diversity of the Living World' },{ code: '1B02', label: 'Chapter 2: Biological Classification' },{ code: '1B03', label: 'Chapter 3: Plant Kingdom' },{ code: '1B04', label: 'Chapter 4: Animal Kingdom' },{ code: '1B05', label: 'Chapter 5: Morphology of Flowering Plants' },{ code: '1B06', label: 'Chapter 6: Anatomy of Flowering Plants' },{ code: '1B07', label: 'Chapter 7: Structural Organisation in Animals' },{ code: '1B08', label: 'Chapter 8: Cell - The Unit of Life' },{ code: '1B09', label: 'Chapter 9: Biomolecules' },{ code: '1B10', label: 'Chapter 10: Cell Cycle and Cell Division' },{ code: '1B11', label: 'Chapter 11: Transport in Plants' },{ code: '1B12', label: 'Chapter 12: Mineral Nutrition' },{ code: '1B13', label: 'Chapter 13: Photosynthesis in Higher Plants' },{ code: '1B14', label: 'Chapter 14: Respiration in Plants' },{ code: '1B15', label: 'Chapter 15: Plant Growth and Development' },{ code: '1B16', label: 'Chapter 16: Digestion and Absorption' },{ code: '1B17', label: 'Chapter 17: Breathing and Exchange of Gases' },{ code: '1B18', label: 'Chapter 18: Body Fluids and Circulation' },{ code: '1B19', label: 'Chapter 19: Excretory Products and Their Elimination' },{ code: '1B20', label: 'Chapter 20: Locomotion and Movement' },{ code: '1B21', label: 'Chapter 21: Neural Control and Coordination' },{ code: '1B22', label: 'Chapter 22: Chemical Coordination and Integration' },
    ]},
    { group: 'Biology - Plus Two', items: [
      { code: '2B01', label: 'Chapter 1: Reproduction in Organisms' },{ code: '2B02', label: 'Chapter 2: Sexual Reproduction in Flowering Plants' },{ code: '2B03', label: 'Chapter 3: Human Reproduction' },{ code: '2B04', label: 'Chapter 4: Reproductive Health' },{ code: '2B05', label: 'Chapter 5: Principles of Inheritance and Variation' },{ code: '2B06', label: 'Chapter 6: Molecular Basis of Inheritance' },{ code: '2B07', label: 'Chapter 7: Evolution' },{ code: '2B08', label: 'Chapter 8: Human Health and Disease' },{ code: '2B09', label: 'Chapter 9: Strategies for Enhancement in Food Production' },{ code: '2B10', label: 'Chapter 10: Microbes in Human Welfare' },{ code: '2B11', label: 'Chapter 11: Biotechnology: Principles and Processes' },{ code: '2B12', label: 'Chapter 12: Biotechnology and Its Applications' },{ code: '2B13', label: 'Chapter 13: Organisms and Populations' },{ code: '2B14', label: 'Chapter 14: Ecosystem' },{ code: '2B15', label: 'Chapter 15: Biodiversity and Conservation' },{ code: '2B16', label: 'Chapter 16: Environmental Issues' },
    ]},
  ],
};

/* ── Helpers ── */
function genUUID() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }); }
function fmtDate(ts) { if (!ts) return 'N/A'; const d = new Date(ts); const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; return `${m[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
function sanitizeLabel(label) { return (label || '').trim().replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, ''); }

/* ── LocalStorage persistence ── */
function loadQuestions() {
  try {
    const stored = JSON.parse(localStorage.getItem('practiceQuestions') || '[]');
    if (stored.length > 0) return stored;
  } catch { /* parse error */ }
  // Fallback: in-memory cache (if localStorage quota was exceeded)
  if (window.__practiceQuestionsCache?.length > 0) return window.__practiceQuestionsCache;
  return [];
}
function saveQuestions(questions) {
  try {
    localStorage.setItem('practiceQuestions', JSON.stringify(questions));
  } catch (e) {
    console.error('Error saving to localStorage:', e);
    // Store in memory fallback so SPA navigation still works
    window.__practiceQuestionsCache = questions;
  }
}

/* ── Find last content line for image cropping ── */
function findLastContentLine(ctx, w, h) {
  const data = ctx.getImageData(0, 0, w, h).data;
  for (let y = h - 1; y >= 0; y--) { for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (data[i] < 250 || data[i+1] < 250 || data[i+2] < 250) return y; } }
  return h;
}

export default function PracticeQuestionsPage() {
  const navigate = useNavigate();
  const [questions, setQuestionsState] = useState(loadQuestions);
  const [toasts, setToasts] = useState([]);
  const [batchSearch, setBatchSearch] = useState('');
  const [batchPage, setBatchPage] = useState(1);
  const batchesPerPage = 6;

  // Processing
  const [processingMessage, setProcessingMessage] = useState('');
  const [processingProgress, setProcessingProgress] = useState(0);

  // Question viewer
  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [verificationFilter, setVerificationFilter] = useState('all');

  // Edit modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editQuestion, setEditQuestion] = useState(null);

  const modalFileInputRef = useRef(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadModalName, setUploadModalName] = useState('');
  const [uploadModalFile, setUploadModalFile] = useState(null);
  const [uploadModalProcessing, setUploadModalProcessing] = useState(false);
  const [uploadModalDone, setUploadModalDone] = useState(false);

  // Persist wrapper
  const setQ = useCallback((updater) => {
    setQuestionsState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveQuestions(next);
      return next;
    });
  }, []);

  function showToast(type, title, msg) { const id = Date.now() + Math.random(); setToasts(c => [...c, { id, type, title, message: msg }]); setTimeout(() => setToasts(c => c.filter(t => t.id !== id)), 4000); }

  /* ── Batches ── */
  const batchesList = useMemo(() => {
    const map = {};
    questions.forEach(q => {
      const bid = q.batchId || 'UNBATCHED';
      if (!map[bid]) map[bid] = { id: bid, count: 0, createdAt: q.createdAt, selected: false };
      map[bid].count++;
      if (q.createdAt < map[bid].createdAt) map[bid].createdAt = q.createdAt;
    });
    return Object.values(map).sort((a, b) => b.createdAt - a.createdAt);
  }, [questions]);

  const [selectedBatches, setSelectedBatches] = useState({});

  const filteredBatches = useMemo(() => {
    if (!batchSearch) return batchesList;
    const q = batchSearch.toLowerCase();
    return batchesList.filter(b => b.id.toLowerCase().includes(q));
  }, [batchesList, batchSearch]);

  const batchTotalPages = Math.ceil(filteredBatches.length / batchesPerPage) || 1;
  const paginatedBatches = filteredBatches.slice((batchPage - 1) * batchesPerPage, batchPage * batchesPerPage);

  const selectedBatchIds = useMemo(() => Object.entries(selectedBatches).filter(([, v]) => v).map(([k]) => k), [selectedBatches]);
  const selectedBatchCount = selectedBatchIds.length;

  /* ── Filtered Questions ── */
  const filteredQuestions = useMemo(() => {
    let f = questions;
    if (selectedBatchCount > 0) f = f.filter(q => selectedBatchIds.includes(q.batchId));
    if (verificationFilter === 'verified') f = f.filter(q => q.verified);
    if (verificationFilter === 'unverified') f = f.filter(q => !q.verified);
    return f;
  }, [questions, selectedBatchIds, selectedBatchCount, verificationFilter]);

  const unverifiedCount = useMemo(() => filteredQuestions.filter(q => !q.verified).length, [filteredQuestions]);
  const allVerified = filteredQuestions.length > 0 && unverifiedCount === 0;

  // Ensure currentQIdx is in bounds
  useEffect(() => { if (currentQIdx >= filteredQuestions.length) setCurrentQIdx(0); }, [filteredQuestions.length, currentQIdx]);

  const currentQ = filteredQuestions[currentQIdx] || null;

  /* ── Batch helpers ── */
  const toggleBatch = (bid) => {
    setSelectedBatches(prev => ({ ...prev, [bid]: !prev[bid] }));
    setCurrentQIdx(0);
  };

  const deleteBatch = (bid) => {
    const cnt = questions.filter(q => q.batchId === bid).length;
    if (!window.confirm(`Delete batch "${bid}"?\n\nThis will permanently delete ${cnt} question(s).`)) return;
    setQ(prev => prev.filter(q => q.batchId !== bid));
    setSelectedBatches(prev => { const n = { ...prev }; delete n[bid]; return n; });
    showToast('success', 'Deleted', `Batch ${bid} deleted.`);
  };

  /* ── PDF Processing (mirrors legacy) ── */
  const getNextBatchNumber = () => {
    let max = 0;
    questions.forEach(q => { if (q.batchId) { const m = q.batchId.match(/^(\d+)/); if (m) { const n = parseInt(m[1]); if (n > max) max = n; } } });
    return String(max + 1).padStart(5, '0');
  };

  const processPdf = async (file, labelText) => {
    if (!file || file.type !== 'application/pdf') { showToast('info', 'Info', 'Please select a valid PDF file.'); return; }

    const pdfjsLib = window['pdfjs-dist/build/pdf'];
    if (!pdfjsLib) { showToast('error', 'Error', 'PDF.js library not loaded. Please refresh.'); return; }

    const batchNumber = getNextBatchNumber();
    const label = sanitizeLabel(labelText) || file.name.replace(/\.[^/.]+$/, '').replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '').substring(0, 20);
    const generatedBatchId = `${batchNumber}-${label}`;

    setProcessingMessage('Loading PDF...');
    setProcessingProgress(0);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument(new Uint8Array(arrayBuffer)).promise;
      const totalPages = pdf.numPages;
      setProcessingMessage(`Converting ${totalPages} page${totalPages > 1 ? 's' : ''} to images...`);

      let startingId = 0;
      questions.forEach(q => { const n = parseInt(q.id.replace('Q', '')); if (n > startingId) startingId = n; });

      const newQuestions = [];

      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const scale = 2.5;
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: ctx, viewport }).promise;

        // Crop
        const cropW = Math.min(6 * 300 * (scale / 2.5), canvas.width);
        const lastLine = findLastContentLine(ctx, canvas.width, canvas.height);
        const paddedH = Math.min(lastLine + 1 + 66, canvas.height);
        const cropped = document.createElement('canvas');
        const cctx = cropped.getContext('2d');
        cropped.width = cropW;
        cropped.height = paddedH;
        cctx.drawImage(canvas, 0, 0, cropW, paddedH, 0, 0, cropW, paddedH);
        const imageData = cropped.toDataURL('image/jpeg', 0.92);

        newQuestions.push({
          id: 'Q' + String(startingId + pageNum).padStart(4, '0'),
          uuid: genUUID(),
          imageData,
          answerType: 'MCQ',
          correctAnswer: 'A',
          createdAt: Date.now(),
          pageNumber: pageNum,
          fileName: file.name,
          batchId: generatedBatchId,
          ocrText: '',
          verified: false,
          level: '',
          averageTime: '',
          subject: '',
          chapter: '',
        });

        setProcessingProgress(Math.round((pageNum / totalPages) * 100));
      }

      newQuestions.sort((a, b) => a.pageNumber - b.pageNumber);
      setQ(prev => [...prev, ...newQuestions]);
      setProcessingMessage(`Successfully created ${totalPages} question${totalPages > 1 ? 's' : ''} in batch ${generatedBatchId}!`);
      showToast('success', 'Upload Complete', `${totalPages} questions created from PDF.`);

      // OCR in background
      if (window.Tesseract) {
        setTimeout(() => runOCR(newQuestions), 200);
      }

      setTimeout(() => { setProcessingProgress(0); }, 2500);
    } catch (err) {
      console.error('PDF processing error:', err);
      showToast('error', 'Error', 'Error processing PDF. Please try again.');
    }
  };

  /* ── Upload Question Bundle modal ── */
  const openUploadModal = () => { setUploadModalName(''); setUploadModalFile(null); setUploadModalProcessing(false); setUploadModalDone(false); setUploadModalOpen(true); };
  const closeUploadModal = () => {
    if (uploadModalProcessing) return;
    setUploadModalOpen(false); setUploadModalName(''); setUploadModalFile(null); setUploadModalDone(false);
  };
  const handleModalFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== 'application/pdf') { if (file) showToast('info', 'Info', 'Please select a valid PDF file.'); setUploadModalFile(null); return; }
    setUploadModalFile(file);
  };
  const proceedUploadModal = async () => {
    if (!uploadModalFile || !uploadModalName.trim()) return;
    const file = uploadModalFile;
    const name = uploadModalName;
    setUploadModalDone(false);
    setUploadModalProcessing(true);
    try {
      await processPdf(file, name);
    } finally {
      setUploadModalProcessing(false);
      setUploadModalDone(true);
    }
  };

  /* ── OCR (sequential, mirrors legacy) ── */
  const runOCR = async (qs) => {
    for (const q of qs) {
      try {
        const result = await window.Tesseract.recognize(q.imageData, 'eng');
        const lines = (result.data.text || '').split('\n').map(l => l.trim()).filter(l => l.length >= 2 && /[a-zA-Z0-9]/.test(l));
        q.ocrText = lines.join('\n');
      } catch { q.ocrText = ''; }
    }
    setQ(prev => [...prev]); // trigger re-render to persist
  };

  /* ── Question field update ── */
  const updateCurrentQ = (field, value) => {
    if (!currentQ) return;
    setQ(prev => prev.map(q => q.uuid === currentQ.uuid ? { ...q, [field]: value } : q));
  };

  /* ── Edit modal ── */
  const openEditModal = (q) => { setEditQuestion({ ...q }); setEditModalOpen(true); };
  const saveEdit = () => {
    if (!editQuestion) return;
    setQ(prev => prev.map(q => q.uuid === editQuestion.uuid ? { ...editQuestion } : q));
    setEditModalOpen(false);
    showToast('success', 'Saved', 'Question updated.');
  };

  /* ── Delete question ── */
  const deleteCurrentQ = () => {
    if (!currentQ || !window.confirm('Delete this question?')) return;
    setQ(prev => prev.filter(q => q.uuid !== currentQ.uuid));
    if (currentQIdx > 0) setCurrentQIdx(currentQIdx - 1);
    showToast('success', 'Deleted', 'Question deleted.');
  };

  /* ── Toggle verified ── */
  const toggleVerified = () => { if (currentQ) updateCurrentQ('verified', !currentQ.verified); };

  /* ── Create quiz ── */
  const createQuiz = () => {
    if (selectedBatchCount === 0) { showToast('info', 'Info', 'Select at least one bundle.'); return; }
    const param = encodeURIComponent('[' + selectedBatchIds.join(',') + ']');
    // Pass questions via route state so quiz-creation gets in-memory data
    // even if localStorage quota was exceeded for large image payloads
    navigate(`/quiz-creation?bundlesSelected=${param}`, { state: { questions } });
  };

  /* ── Load PDF.js worker on mount ── */
  useEffect(() => {
    const pdfjsLib = window['pdfjs-dist/build/pdf'];
    if (pdfjsLib && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
  }, []);

  /* ── Load PDF.js & Tesseract scripts dynamically if not already loaded ── */
  useEffect(() => {
    if (!window['pdfjs-dist/build/pdf']) {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload = () => {
        const lib = window['pdfjs-dist/build/pdf'];
        if (lib) lib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      };
      document.head.appendChild(s);
    }
    if (!window.Tesseract) {
      const s2 = document.createElement('script');
      s2.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@4/dist/tesseract.min.js';
      document.head.appendChild(s2);
    }
  }, []);

  return (
    <div className="container-fluid data-table-page">
      <ToastRegion toasts={toasts} onDismiss={(id) => setToasts(c => c.filter(t => t.id !== id))} />

      <div className="page-header-section">
        <div className="page-header-title-group">
          <span className="page-header-icon-box"><Icon className="fa fa-file-text-o" /></span>
          <div>
            <h2>Practice Questions</h2>
            <p>Upload question bundles, organize them into practice sets, and manage the practice repository.</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="page-action-button" onClick={openUploadModal}>
            <Icon className="ti ti-cloud-up" /> Upload Question Bundle
          </button>
        </div>
      </div>

      {/* ═══ Batch Management Section ═══ */}
      <div style={{ background: 'white', padding: '20px', borderRadius: '8px', marginBottom: '30px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>

        {/* Batch Search */}
        {batchesList.length > 0 && (
          <div style={{ marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ position: 'relative', flex: 1, maxWidth: '300px' }}>
              <Icon className="ti ti-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#6c757d' }} />
              <input type="text" value={batchSearch} onChange={e => { setBatchSearch(e.target.value); setBatchPage(1); }} className="form-control" placeholder="Search Bundles..." style={{ fontSize: '13px', padding: '8px 12px 8px 35px' }} />
            </div>
            {batchSearch && <span style={{ fontSize: '12px', color: '#6c757d' }}>Found {filteredBatches.length} batch{filteredBatches.length !== 1 ? 'es' : ''}</span>}
          </div>
        )}

        {/* Batches Grid */}
        {batchesList.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '15px' }}>
            {paginatedBatches.map(batch => {
              const sel = !!selectedBatches[batch.id];
              return (
                <div key={batch.id} onClick={() => toggleBatch(batch.id)} style={{ border: `2px solid ${sel ? '#006073' : '#e9ecef'}`, borderRadius: '6px', padding: '15px', background: sel ? '#f0f8fa' : 'white', cursor: 'pointer', transition: 'all 0.2s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <input type="checkbox" checked={sel} onChange={() => toggleBatch(batch.id)} onClick={e => e.stopPropagation()} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
                      <strong style={{ fontSize: '15px', color: '#333' }}>{batch.id}</strong>
                    </div>
                    <button onClick={e => { e.stopPropagation(); deleteBatch(batch.id); }} style={{ padding: '4px 8px', fontSize: '11px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                      <Icon className="ti ti-trash" /> Delete
                    </button>
                  </div>
                  <div style={{ fontSize: '13px', color: '#6c757d' }}>
                    <div><Icon className="ti ti-files" /> {batch.count} question(s)</div>
                    <div style={{ marginTop: '5px' }}><Icon className="ti ti-calendar" /> {fmtDate(batch.createdAt)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '30px 20px', color: '#6c757d' }}>
            <Icon className="ti ti-package" style={{ fontSize: '40px', opacity: 0.5, display: 'block', marginBottom: '10px' }} />
            <div style={{ fontSize: '14px' }}>No bundles yet. Upload a PDF to create your first bundle.</div>
          </div>
        )}

        {/* Bottom: Pagination + Create Quiz */}
        {batchesList.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', paddingTop: '15px', borderTop: '1px solid #e9ecef' }}>
            {batchTotalPages > 1 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button onClick={() => setBatchPage(p => Math.max(1, p - 1))} disabled={batchPage === 1} className="btn btn-sm" style={{ padding: '6px 12px', fontSize: '12px' }}><Icon className="ti ti-angle-left" /> Prev</button>
                <span style={{ fontSize: '13px', color: '#495057' }}>Page {batchPage} of {batchTotalPages}</span>
                <button onClick={() => setBatchPage(p => Math.min(batchTotalPages, p + 1))} disabled={batchPage >= batchTotalPages} className="btn btn-sm" style={{ padding: '6px 12px', fontSize: '12px' }}>Next <Icon className="ti ti-angle-right" /></button>
              </div>
            ) : <div />}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '5px' }}>
              <button onClick={createQuiz} disabled={selectedBatchCount === 0 || !allVerified} style={{ padding: '10px 20px', fontSize: '14px', fontWeight: 600, background: '#006073', color: 'white', border: 'none', borderRadius: '6px', cursor: selectedBatchCount > 0 && allVerified ? 'pointer' : 'not-allowed', opacity: selectedBatchCount > 0 && allVerified ? 1 : 0.6, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icon className="ti ti-plus" /> Create Quiz from Selected Bundles
                {selectedBatchCount > 0 && <span style={{ background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '10px', fontSize: '12px' }}>{selectedBatchCount}</span>}
              </button>
              {selectedBatchCount > 0 && unverifiedCount > 0 && (
                <span style={{ fontSize: '11px', color: '#856404', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Icon className="ti ti-alert-triangle" />
                  {unverifiedCount} of {filteredQuestions.length} questions not verified. Verify them to continue.
                </span>
              )}
              {selectedBatchCount > 0 && allVerified && (
                <span style={{ fontSize: '11px', color: '#155724', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Icon className="ti ti-check" /> All {filteredQuestions.length} questions verified
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ═══ Questions Preview Section ═══ */}
      {selectedBatchCount > 0 && (
        <div style={{ background: 'white', padding: '30px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px', marginBottom: '20px', paddingBottom: '15px', borderBottom: '2px solid #e9ecef' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <h3 style={{ margin: 0, color: '#333' }}>Questions Preview</h3>
              <div style={{ fontSize: '14px', color: '#6c757d' }}>
                Total: <strong>{filteredQuestions.length}</strong> question(s)
                <span style={{ color: '#006073', marginLeft: '10px' }}>({selectedBatchCount} batch{selectedBatchCount > 1 ? 'es' : ''} selected)</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <select value={verificationFilter} onChange={e => { setVerificationFilter(e.target.value); setCurrentQIdx(0); }} className="form-control" style={{ width: 'auto', fontSize: '12px', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer' }}>
                <option value="all">All Questions</option>
                <option value="verified">Verified Only</option>
                <option value="unverified">Unverified Only</option>
              </select>
              {filteredQuestions.length > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button onClick={() => setCurrentQIdx(i => Math.max(0, i - 1))} disabled={currentQIdx === 0} className="btn btn-sm" style={{ padding: '6px 12px', fontSize: '12px' }}><Icon className="ti ti-angle-left" /> Prev</button>
                  <span style={{ fontSize: '13px', color: '#495057', fontWeight: 600 }}>{currentQIdx + 1} / {filteredQuestions.length}</span>
                  <button onClick={() => setCurrentQIdx(i => Math.min(filteredQuestions.length - 1, i + 1))} disabled={currentQIdx >= filteredQuestions.length - 1} className="btn btn-sm" style={{ padding: '6px 12px', fontSize: '12px' }}>Next <Icon className="ti ti-angle-right" /></button>
                </div>
              )}
            </div>
          </div>

          {/* Single Question Card */}
          {currentQ ? (
            <div style={{ border: '1px solid #e9ecef', borderRadius: '8px', overflow: 'hidden', transition: 'all 0.3s' }}>
              {/* Question Header */}
              <div style={{ background: '#f8f9fa', padding: '15px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e9ecef', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ fontWeight: 600, color: '#006073', fontSize: '14px' }}>
                  Question #{currentQIdx + 1} • ID: {currentQ.id}
                  <span style={{ fontSize: '12px', color: '#6c757d', fontWeight: 'normal', marginLeft: '8px' }}>• by Abhijith on {fmtDate(currentQ.createdAt)}</span>
                  {currentQ.batchId && <span style={{ fontSize: '12px', color: '#006073', fontWeight: 600, marginLeft: '8px', background: '#e3f2f5', padding: '2px 8px', borderRadius: '4px' }}><Icon className="ti ti-package" /> {currentQ.batchId}</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', background: '#e7f5f7', color: '#006073' }}>{currentQ.answerType}</span>
                  <span style={{ padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, background: '#d4edda', color: '#155724' }}>Correct: {currentQ.correctAnswer}</span>
                  <span onClick={toggleVerified} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', cursor: 'pointer', padding: '4px 12px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', marginLeft: '10px', background: currentQ.verified ? '#d4edda' : '#fff3cd', color: currentQ.verified ? '#155724' : '#856404' }} title="Click to toggle verification status">
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block', background: currentQ.verified ? '#28a745' : '#ffc107' }}></span>
                    {currentQ.verified ? 'Verified' : 'Unverified'}
                  </span>
                </div>
              </div>

              {/* Question Image */}
              <div style={{ padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '15px' }}>
                  <img src={currentQ.imageData} alt={`Question ${currentQIdx + 1}`} style={{ maxWidth: '100%', height: 'auto', maxHeight: '800px', border: '1px solid #dee2e6', borderRadius: '6px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }} />
                </div>
              </div>

              {/* Question Metadata (inline editing) */}
              <div style={{ padding: '15px 20px', background: '#f8f9fa', borderTop: '1px solid #e9ecef' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 2fr', gap: '15px' }}>
                  {/* Average Time */}
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <label style={{ fontSize: '11px', color: '#6c757d', marginBottom: '5px', textTransform: 'uppercase', fontWeight: 600 }}>Avg Time</label>
                    <input type="text" value={currentQ.averageTime || ''} onChange={e => updateCurrentQ('averageTime', e.target.value)} className="form-control" placeholder="seconds" maxLength="4" style={{ fontSize: '13px', padding: '6px 10px' }} />
                    <div style={{ marginTop: '5px', display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                      {[30, 60, 120, 180].map(v => (
                        <span key={v} onClick={() => updateCurrentQ('averageTime', v)} style={{ padding: '2px 6px', background: '#e9ecef', borderRadius: '4px', fontSize: '10px', cursor: 'pointer', userSelect: 'none' }}>{v >= 60 ? `${v / 60}m` : `${v}s`}</span>
                      ))}
                    </div>
                  </div>

                  {/* Difficulty Level */}
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <label style={{ fontSize: '11px', color: '#6c757d', marginBottom: '5px', textTransform: 'uppercase', fontWeight: 600 }}>Level</label>
                    <div style={{ display: 'flex', gap: '5px' }}>
                      {['Easy', 'Medium', 'Hard'].map(lvl => (
                        <button key={lvl} onClick={() => updateCurrentQ('level', lvl)} style={{ flex: 1, padding: '6px', fontSize: '11px', border: '1px solid #dee2e6', borderRadius: '4px', cursor: 'pointer', background: currentQ.level === lvl ? (lvl === 'Easy' ? '#28a745' : lvl === 'Medium' ? '#ffc107' : '#dc3545') : 'white', color: currentQ.level === lvl ? 'white' : '#333', fontWeight: currentQ.level === lvl ? 600 : 400 }}>{lvl}</button>
                      ))}
                    </div>
                  </div>

                  {/* Correct Answer */}
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <label style={{ fontSize: '11px', color: '#6c757d', marginBottom: '5px', textTransform: 'uppercase', fontWeight: 600 }}>Correct Answer</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '5px' }}>
                      {['A', 'B', 'C', 'D'].map(ans => (
                        <button key={ans} onClick={() => updateCurrentQ('correctAnswer', ans)} style={{ padding: '6px', fontSize: '12px', fontWeight: 600, border: '1px solid #dee2e6', borderRadius: '4px', cursor: 'pointer', background: currentQ.correctAnswer === ans ? '#28a745' : 'white', color: currentQ.correctAnswer === ans ? 'white' : '#333' }}>{ans}</button>
                      ))}
                    </div>
                  </div>

                  {/* Module + Chapter */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <label style={{ fontSize: '11px', color: '#6c757d', marginBottom: '5px', textTransform: 'uppercase', fontWeight: 600 }}>Module</label>
                      <select value={currentQ.subject || ''} onChange={e => { updateCurrentQ('subject', e.target.value); updateCurrentQ('chapter', ''); }} className="form-control" style={{ fontSize: '13px', padding: '6px 10px' }}>
                        <option value="">None</option>
                        <option value="Physics">Physics</option>
                        <option value="Chemistry">Chemistry</option>
                        <option value="Mathematics">Mathematics</option>
                        <option value="Biology">Biology</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <label style={{ fontSize: '11px', color: '#6c757d', marginBottom: '5px', textTransform: 'uppercase', fontWeight: 600 }}>
                        Chapter {currentQ.subject ? `from ${currentQ.subject}` : ''}
                      </label>
                      <select value={currentQ.chapter || ''} onChange={e => updateCurrentQ('chapter', e.target.value)} className="form-control" style={{ fontSize: '13px', padding: '6px 10px' }}>
                        <option value="">None</option>
                        {currentQ.subject && chaptersBySubject[currentQ.subject]?.map(grp => (
                          <optgroup key={grp.group} label={grp.group}>
                            {grp.items.map(ch => <option key={ch.code} value={ch.code}>{ch.label}</option>)}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <Icon className="ti ti-clipboard" style={{ fontSize: '64px', color: '#dee2e6', marginBottom: '20px', display: 'block' }} />
              <h4 style={{ color: '#495057', marginBottom: '8px' }}>No Practice Questions Yet</h4>
              <p style={{ color: '#6c757d' }}>Upload a PDF file to create practice questions from each page.</p>
            </div>
          )}
        </div>
      )}

      {/* ═══ Edit Modal ═══ */}
      {editModalOpen && editQuestion && (
        <div className="crispr-modal-backdrop active" onClick={() => setEditModalOpen(false)}>
          <div className="crispr-modal-dialog" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
            <div className="crispr-modal-header">
              <h3><Icon className="ti ti-pencil" /> Edit Question</h3>
              <button className="crispr-modal-close" onClick={() => setEditModalOpen(false)}><Icon className="ti ti-close" /></button>
            </div>
            <div className="crispr-modal-body">
              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontWeight: 600, color: '#333', marginBottom: '8px', fontSize: '14px' }}>Question ID</label>
                <input type="text" value={editQuestion.id} disabled className="form-control" />
              </div>
              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontWeight: 600, color: '#333', marginBottom: '8px', fontSize: '14px' }}>UUID</label>
                <input type="text" value={editQuestion.uuid} disabled className="form-control" />
              </div>
              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontWeight: 600, color: '#333', marginBottom: '8px', fontSize: '14px' }}>Answer Type</label>
                <select value={editQuestion.answerType} onChange={e => setEditQuestion({ ...editQuestion, answerType: e.target.value })} className="form-control">
                  <option value="MCQ">MCQ</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontWeight: 600, color: '#333', marginBottom: '8px', fontSize: '14px' }}>Correct Answer</label>
                <select value={editQuestion.correctAnswer} onChange={e => setEditQuestion({ ...editQuestion, correctAnswer: e.target.value })} className="form-control">
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                  <option value="D">D</option>
                </select>
              </div>
            </div>
            <div className="crispr-modal-footer">
              <button onClick={saveEdit} style={{ background: '#006073', color: 'white', border: 'none', padding: '10px 24px', borderRadius: '6px', fontSize: '14px', cursor: 'pointer', fontWeight: 600 }}>
                <Icon className="ti ti-check" /> Save Changes
              </button>
              <button onClick={() => setEditModalOpen(false)} style={{ background: '#6c757d', color: 'white', border: 'none', padding: '10px 24px', borderRadius: '6px', fontSize: '14px', cursor: 'pointer' }}>
                <Icon className="ti ti-close" /> Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {uploadModalOpen && (
        <div className="legacy-modal-backdrop active" onClick={closeUploadModal}>
          <div className="legacy-modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="legacy-modal-header">
              <h3><Icon className="ti ti-cloud-up" /> Upload Question Bundle</h3>
              {!uploadModalProcessing && (
                <button className="legacy-modal-close" onClick={closeUploadModal}><Icon className="ti ti-close" /></button>
              )}
            </div>
            <div className="legacy-modal-body">
              {uploadModalDone ? (
                <div style={{ textAlign: 'center', padding: '20px 10px' }}>
                  <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: '28px' }}>
                    <Icon className="ti ti-check" />
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: 600, color: '#333' }}>Questions are processed, you can close the window</div>
                </div>
              ) : uploadModalProcessing ? (
                <div style={{ padding: '10px 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', color: '#006073' }}>
                    <Icon className="ti ti-reload" style={{ fontSize: '18px', animation: 'spin 1s linear infinite' }} />
                    <strong>{processingMessage || 'Processing...'}</strong>
                  </div>
                  <div style={{ width: '100%', height: '24px', background: '#e9ecef', borderRadius: '12px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${processingProgress}%`, background: 'linear-gradient(135deg, #006073 0%, #008a9e 100%)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 600, transition: 'width 0.3s ease' }}>
                      {processingProgress}%
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="form-group" style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', fontWeight: 600, color: '#333', marginBottom: '8px', fontSize: '14px' }}>Bundle Name</label>
                    <input type="text" value={uploadModalName} onChange={e => setUploadModalName(e.target.value)} className="form-control" placeholder="Enter bundle name..." autoFocus />
                  </div>
                  <div className="form-group" style={{ marginBottom: '4px' }}>
                    <label style={{ display: 'block', fontWeight: 600, color: '#333', marginBottom: '8px', fontSize: '14px' }}>PDF File</label>
                    <input ref={modalFileInputRef} type="file" accept="application/pdf" style={{ display: 'none' }} onChange={handleModalFileSelect} />
                    <button type="button" onClick={() => modalFileInputRef.current?.click()} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 18px', fontSize: '14px', fontWeight: 500, background: '#f1f5f9', color: '#006073', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer' }}>
                      <Icon className="ti ti-file" /> Choose File
                    </button>
                    {uploadModalFile && (
                      <span style={{ marginLeft: '12px', fontSize: '13px', color: '#333' }}>
                        <Icon className="ti ti-check" style={{ color: '#16a34a', marginRight: '4px' }} />{uploadModalFile.name}
                      </span>
                    )}
                    <div style={{ fontSize: '12px', color: '#6c757d', marginTop: '8px' }}>Each page in the PDF becomes a question.</div>
                  </div>
                </>
              )}
            </div>
            <div className="legacy-modal-footer">
              {uploadModalDone ? (
                <button className="legacy-btn legacy-btn-success" onClick={closeUploadModal}>
                  <Icon className="ti ti-close" /> Close
                </button>
              ) : uploadModalProcessing ? (
                <button className="legacy-btn legacy-btn-default" disabled>Processing…</button>
              ) : (
                <>
                  <button className="legacy-btn legacy-btn-default" onClick={closeUploadModal}>Cancel</button>
                  <button className="legacy-btn legacy-btn-success" onClick={proceedUploadModal} disabled={!uploadModalFile || !uploadModalName.trim()}>
                    <Icon className="ti ti-check" /> Proceed
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
