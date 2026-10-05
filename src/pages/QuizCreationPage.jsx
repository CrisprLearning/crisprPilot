import React, { useMemo, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ToastRegion from '../components/ToastRegion';
import { createQuiz, quizError } from '../lib/quizApi';
import Icon from '../components/Icon';

/* Map the UI marking-scheme preset to the backend's numeric code. */
const MARKING_SCHEME_CODE = { default: 1, 'no-negative': 2, custom: 3 };

/* Convert a date (YYYY-MM-DD) + time (HH:MM) pair to a unix-seconds timestamp. */
function toUnixSeconds(dateVal, timeVal) {
  const t = new Date(`${dateVal}T${timeVal}`).getTime();
  return Number.isNaN(t) ? 0 : Math.floor(t / 1000);
}

/* ── Helpers ── */
function genUUID() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }); }
function shortId() { return genUUID().split('-')[0].toUpperCase(); }
function fmtDate(ts) { if (!ts) return 'N/A'; const d = new Date(ts); const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; return `${m[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`; }
function fmtDateTime(dateVal, timeVal) {
  if (!dateVal || !timeVal) return 'Not set';
  const d = new Date(`${dateVal}T${timeVal}`);
  if (isNaN(d.getTime())) return 'Invalid date';
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  let h = d.getHours(), min = d.getMinutes(), ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${m[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} at ${h}:${String(min).padStart(2,'0')} ${ap}`;
}

/* ── Inline styles matching legacy CSS ── */
const sty = {
  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', padding: '20px', background: 'linear-gradient(135deg, #006073 0%, #005a6b 100%)', borderRadius: '8px', color: 'white' },
  stepNav: { display: 'flex', justifyContent: 'space-between', marginBottom: '30px', background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
  sectionCard: { background: 'white', padding: '25px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '20px' },
  sectionTitle: { fontSize: '18px', fontWeight: 600, color: '#333', marginBottom: '20px', paddingBottom: '10px', borderBottom: '2px solid #e9ecef' },
  actionButtons: { display: 'flex', justifyContent: 'space-between', gap: '15px', marginTop: '30px', paddingTop: '20px', borderTop: '2px solid #e9ecef' },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' },
  formGroup: { marginBottom: '15px' },
  formLabel: { display: 'block', fontSize: '13px', fontWeight: 600, color: '#495057', marginBottom: '8px' },
  formInput: { width: '100%', padding: '10px 15px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '14px', boxSizing: 'border-box' },
};

export default function QuizCreationPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const preselectedBundles = (params.get('bundlesSelected') || '').replace(/[\[\]\s]/g, '').split(',').filter(Boolean);

  const [currentStep, setCurrentStep] = useState(1);
  const [toasts, setToasts] = useState([]);
  const customFileRef = useRef(null);

  // Load questions: prefer route state (from practice-questions navigate),
  // then localStorage, then in-memory cache (if localStorage quota was exceeded)
  const [allQuestions] = useState(() => {
    // 1. Route state: passed directly from PracticeQuestionsPage via navigate({ state })
    if (location.state?.questions?.length > 0) {
      return location.state.questions;
    }
    // 2. localStorage: standard persistence
    try {
      const stored = JSON.parse(localStorage.getItem('practiceQuestions') || '[]');
      if (stored.length > 0) return stored;
    } catch { /* parse error */ }
    // 3. Memory cache: fallback when localStorage quota was exceeded
    if (window.__practiceQuestionsCache?.length > 0) {
      return window.__practiceQuestionsCache;
    }
    return [];
  });

  const [customQuestions, setCustomQuestions] = useState([]);

  const [quizConfig, setQuizConfig] = useState(() => {
    const today = new Date();
    const tomorrow = new Date(today.getTime() + 86400000);
    return {
      title: '', description: '', duration: 180,
      markingScheme: 'default',
      customMarking: { correct: 4, incorrect: -1, unanswered: 0 },
      startDate: today.toISOString().slice(0, 10), startTime: '09:00',
      endDate: tomorrow.toISOString().slice(0, 10), endTime: '18:00',
      allowMultipleAttempts: false,
    };
  });

  const [quizUrl, setQuizUrl] = useState('');

  function showToast(type, title, msg) { const id = Date.now() + Math.random(); setToasts(c => [...c, { id, type, title, message: msg }]); setTimeout(() => setToasts(c => c.filter(t => t.id !== id)), 5000); }

  const upd = (field, val) => setQuizConfig(c => ({ ...c, [field]: val }));
  const updCustom = (field, val) => setQuizConfig(c => ({ ...c, customMarking: { ...c.customMarking, [field]: val } }));

  /* ── Batches ── */
  const allBatches = useMemo(() => {
    const map = {};
    allQuestions.forEach(q => {
      const bid = q.batchId || 'UNBATCHED';
      if (!map[bid]) map[bid] = { id: bid, count: 0, createdAt: q.createdAt };
      map[bid].count++;
      if (q.createdAt < map[bid].createdAt) map[bid].createdAt = q.createdAt;
    });
    return Object.values(map).sort((a, b) => b.createdAt - a.createdAt);
  }, [allQuestions]);

  // If preselectedBundles provided via URL, filter to only those batches
  const availableBatches = useMemo(() => {
    if (preselectedBundles.length > 0) {
      return allBatches.filter(b => preselectedBundles.includes(b.id));
    }
    return allBatches;
  }, [allBatches, preselectedBundles]);

  // Pre-select all available batches when coming from practice-questions
  const [selectedBatchIds, setSelectedBatchIds] = useState(() => {
    if (preselectedBundles.length > 0) return [...new Set(preselectedBundles)];
    return [];
  });

  const toggleBatch = (bid) => {
    setSelectedBatchIds(prev => prev.includes(bid) ? prev.filter(id => id !== bid) : [...prev, bid]);
  };

  const selectedBatchCount = selectedBatchIds.length;

  /* ── Questions from selected batches ── */
  const [removedBatchQIds, setRemovedBatchQIds] = useState([]);
  const questionsFromBatches = useMemo(
    () => allQuestions.filter(q => selectedBatchIds.includes(q.batchId) && !removedBatchQIds.includes(q.uuid)),
    [allQuestions, selectedBatchIds, removedBatchQIds]
  );

  const totalQuestions = questionsFromBatches.length + customQuestions.length;
  const totalQuestionsFromBatches = useMemo(() => {
    return availableBatches.filter(b => selectedBatchIds.includes(b.id)).reduce((sum, b) => sum + b.count, 0);
  }, [availableBatches, selectedBatchIds]);

  const maxMarks = quizConfig.markingScheme === 'custom'
    ? totalQuestions * Number(quizConfig.customMarking.correct || 0)
    : totalQuestions * (quizConfig.markingScheme === 'no-negative' ? 1 : 4);

  const isConfigValid = quizConfig.title && quizConfig.duration > 0 && quizConfig.startDate && quizConfig.startTime && quizConfig.endDate && quizConfig.endTime;

  /* ── Step Navigation ── */
  const steps = [
    { num: 1, title: 'Select Questions' },
    { num: 2, title: 'Review & Add Custom' },
    { num: 3, title: 'Configure Quiz' },
    { num: 4, title: 'Preview & Publish' },
  ];

  const validateStep = () => {
    if (currentStep === 1 && selectedBatchCount === 0) { showToast('info', 'Info', 'Please select at least one batch to continue.'); return false; }
    return true;
  };

  const goToStep = (s) => {
    if (s > currentStep && !validateStep()) return;
    setCurrentStep(s);
    if (s === 4 && !quizUrl) setQuizUrl(`https://candidate.crisprlearning.com/quiz/${shortId()}`);
  };
  const nextStep = () => { if (validateStep()) goToStep(Math.min(4, currentStep + 1)); };
  const prevStep = () => { if (currentStep > 1) goToStep(currentStep - 1); };

  /* ── Custom questions upload ── */
  const handleCustomImageUpload = (e) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) { showToast('info', 'Info', `"${file.name}" is not an image.`); return; }
      if (file.size > 10 * 1024 * 1024) { showToast('info', 'Info', `"${file.name}" exceeds 10MB.`); return; }
      const reader = new FileReader();
      reader.onload = () => {
        setCustomQuestions(prev => [...prev, {
          id: 'CQ' + String(prev.length + 1).padStart(4, '0'),
          uuid: genUUID(),
          imageData: reader.result,
          answerType: 'MCQ',
          correctAnswer: 'A',
          level: 'Medium',
          createdAt: Date.now(),
          fileName: file.name,
          isCustom: true,
        }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  /* ── Remove question ── */
  const removeQuestion = (idx, type) => {
    if (type === 'batch') {
      const q = questionsFromBatches[idx];
      if (q) setRemovedBatchQIds(prev => [...prev, q.uuid]);
    } else {
      setCustomQuestions(prev => prev.filter((_, i) => i !== idx));
    }
  };

  /* ── Copy URL ── */
  const copyUrl = () => {
    navigator.clipboard?.writeText(quizUrl).then(() => showToast('info', 'Copied', 'Quiz URL copied to clipboard!')).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = quizUrl;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('info', 'Copied', 'Quiz URL copied to clipboard!');
    });
  };

  const [submitting, setSubmitting] = useState(false);

  /* ── Save / Publish ── */
  const persistQuiz = async (status) => {
    if (!quizConfig.title.trim()) { showToast('error', 'Error', 'Quiz title is required.'); return; }
    if (totalQuestions === 0) { showToast('error', 'Error', 'Add at least one question.'); return; }
    if (status === 'published' && !window.confirm('Publish this quiz? Students will be able to access it.')) return;
    if (submitting) return;

    const resolvedUrl = quizUrl || `https://candidate.crisprlearning.com/quiz/${shortId()}`;
    if (!quizUrl) setQuizUrl(resolvedUrl);

    const allQ = [...questionsFromBatches, ...customQuestions];
    const uniqueID = resolvedUrl.split('/').pop();

    // On publish, create the quiz on the backend before persisting locally so the
    // listing only shows quizzes the server accepted.
    if (status === 'published') {
      const payload = {
        title: quizConfig.title,
        brief: quizConfig.description || '',
        terms: '',
        duration: Number(quizConfig.duration),
        totalQuestions: allQ.length,
        markingScheme: MARKING_SCHEME_CODE[quizConfig.markingScheme] ?? 1,
        challengeQuestionAllowed: 1,
        multipleAttemptsAllowed: quizConfig.allowMultipleAttempts ? 1 : 0,
        uniqueID,
        quizLimitedToBatches: selectedBatchIds,
        scheduledStart: toUnixSeconds(quizConfig.startDate, quizConfig.startTime),
        scheduledEnd: toUnixSeconds(quizConfig.endDate, quizConfig.endTime),
        questionsData: allQ.map((q, i) => ({
          o: i + 1,
          qi: q.qi ?? q.questionId ?? q.id,
          ms: 1,
        })),
      };

      setSubmitting(true);
      try {
        await createQuiz(payload);
      } catch (err) {
        const e = quizError(err);
        showToast('error', 'Publish failed', e.message);
        return;
      } finally {
        setSubmitting(false);
      }
    }

    const quiz = {
      id: uniqueID,
      uuid: genUUID(),
      title: quizConfig.title,
      description: quizConfig.description,
      duration: Number(quizConfig.duration),
      markingScheme: quizConfig.markingScheme,
      customMarking: quizConfig.customMarking,
      startDateTime: `${quizConfig.startDate}T${quizConfig.startTime}`,
      endDateTime: `${quizConfig.endDate}T${quizConfig.endTime}`,
      questions: allQ,
      totalQuestions: allQ.length,
      maximumMarks: maxMarks,
      url: resolvedUrl,
      batches: selectedBatchIds,
      createdAt: Date.now(),
      createdBy: 'Abhijith',
      status,
      allowMultipleAttempts: quizConfig.allowMultipleAttempts,
      attempts: [],
    };

    const key = status === 'draft' ? 'quizDrafts' : 'publishedQuizzes';
    const existing = JSON.parse(localStorage.getItem(key) || '[]').filter(q => q.id !== quiz.id);
    existing.unshift(quiz);
    localStorage.setItem(key, JSON.stringify(existing));

    showToast('success', status === 'draft' ? 'Saved' : 'Published', status === 'draft' ? 'Quiz saved as draft.' : `Quiz published! URL: ${resolvedUrl}`);
    setTimeout(() => navigate('/quiz-listing'), 1200);
  };

  /* ─── Marking Scheme Label ─── */
  const markingLabel = quizConfig.markingScheme === 'default' ? '+4 / -1 / 0' : quizConfig.markingScheme === 'no-negative' ? '+1 / 0 / 0' : `+${quizConfig.customMarking.correct} / ${quizConfig.customMarking.incorrect} / ${quizConfig.customMarking.unanswered}`;

  return (
    <div className="container-fluid" style={{ paddingTop: '1%' }}>
      <ToastRegion toasts={toasts} onDismiss={(id) => setToasts(c => c.filter(t => t.id !== id))} />
      <input ref={customFileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleCustomImageUpload} />

      {/* ═══ Page Header ═══ */}
      <div style={sty.pageHeader}>
        <div>
          <h2 style={{ margin: '0 0 8px 0', fontSize: '28px', fontWeight: 600, color: 'white' }}>
            <Icon className="ti ti-clipboard" style={{ marginRight: '8px' }} />Quiz Creation
          </h2>
          <p style={{ margin: 0, opacity: 0.9, fontSize: '14px', color: 'rgba(255,255,255,0.9)' }}>Create and configure quizzes from your question batches</p>
        </div>
        <button onClick={() => navigate('/practice-questions')} style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', padding: '10px 18px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Icon className="ti ti-arrow-left" /> Back to Questions
        </button>
      </div>

      {/* ═══ Step Navigation ═══ */}
      <div style={sty.stepNav}>
        {steps.map(s => {
          const isActive = currentStep === s.num;
          const isCompleted = currentStep > s.num;
          return (
            <div key={s.num} onClick={() => goToStep(s.num)} style={{ flex: 1, textAlign: 'center', padding: '15px', position: 'relative', cursor: 'pointer', background: isActive ? '#e3f2f5' : 'transparent', borderRadius: '6px', opacity: isCompleted ? 0.7 : 1 }}>
              {s.num < 4 && (
                <div style={{ position: 'absolute', right: '-10px', top: '50%', transform: 'translateY(-50%)', width: '20px', height: '2px', background: '#dee2e6', zIndex: 0 }} />
              )}
              <div style={{ display: 'inline-block', width: '36px', height: '36px', lineHeight: '36px', borderRadius: '50%', background: isActive ? '#006073' : isCompleted ? '#28a745' : '#dee2e6', color: isActive || isCompleted ? 'white' : '#6c757d', fontWeight: 600, marginBottom: '8px', position: 'relative', zIndex: 1 }}>{s.num}</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: isActive ? '#006073' : '#495057' }}>{s.title}</div>
            </div>
          );
        })}
      </div>

      {/* ═══ Step 1: Select Questions from Batches ═══ */}
      {currentStep === 1 && (
        <>
          <div style={sty.sectionCard}>
            <div style={sty.sectionTitle}><Icon className="ti ti-package" style={{ marginRight: '8px' }} />Select Question Batches</div>
            {availableBatches.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#6c757d' }}>
                <Icon className="ti ti-info-alt" style={{ fontSize: '48px', marginBottom: '15px', display: 'block' }} />
                <p style={{ fontSize: '16px', marginBottom: '10px' }}>No batches available</p>
                <p style={{ fontSize: '14px' }}>Please upload questions in Practice Questions page first.</p>
                <button onClick={() => navigate('/practice-questions')} style={{ marginTop: '15px', background: '#006073', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>
                  <Icon className="ti ti-upload" /> Go to Practice Questions
                </button>
              </div>
            ) : (
              <div>
                <p style={{ marginBottom: '20px', color: '#6c757d' }}>Click on a bundle to select or deselect it for this quiz</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '15px', marginBottom: '20px' }}>
                  {availableBatches.map(batch => {
                    const sel = selectedBatchIds.includes(batch.id);
                    return (
                      <div key={batch.id} onClick={() => toggleBatch(batch.id)} style={{ border: `2px solid ${sel ? '#006073' : '#e9ecef'}`, borderRadius: '6px', padding: '15px', cursor: 'pointer', transition: 'all 0.2s', background: sel ? '#e3f2f5' : 'white' }}>
                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
                          <input type="checkbox" checked={sel} onChange={() => toggleBatch(batch.id)} onClick={e => e.stopPropagation()} style={{ width: '18px', height: '18px', cursor: 'pointer', marginRight: '10px' }} />
                          <strong style={{ fontSize: '15px' }}>{batch.id}</strong>
                        </div>
                        <div style={{ fontSize: '13px', color: '#6c757d' }}>
                          <div><Icon className="ti ti-files" /> {batch.count} question(s)</div>
                          <div style={{ marginTop: '5px' }}><Icon className="ti ti-calendar" /> {fmtDate(batch.createdAt)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {selectedBatchCount > 0 ? (
                  <div style={{ marginTop: '20px', padding: '15px', background: '#e3f2f5', borderRadius: '6px', borderLeft: '4px solid #006073' }}>
                    <strong style={{ color: '#006073' }}><Icon className="ti ti-check" /> Selected: </strong>
                    <span>{selectedBatchCount} bundle(s), {totalQuestionsFromBatches} question(s) ready</span>
                  </div>
                ) : (
                  <div style={{ marginTop: '20px', padding: '15px', background: '#fff3cd', borderRadius: '6px', borderLeft: '4px solid #ffc107' }}>
                    <strong style={{ color: '#856404' }}><Icon className="ti ti-alert-triangle" /> No bundles selected: </strong>
                    <span style={{ color: '#856404' }}>Please select at least one bundle to continue</span>
                  </div>
                )}
              </div>
            )}
          </div>
          <div style={sty.actionButtons}>
            <div></div>
            <button onClick={nextStep} disabled={selectedBatchCount === 0} style={{ padding: '12px 28px', fontSize: '14px', fontWeight: 600, background: '#006073', color: 'white', border: 'none', borderRadius: '6px', cursor: selectedBatchCount > 0 ? 'pointer' : 'not-allowed', opacity: selectedBatchCount > 0 ? 1 : 0.5 }}>
              Next: Review Questions <Icon className="ti ti-arrow-right" />
            </button>
          </div>
        </>
      )}

      {/* ═══ Step 2: Review & Add Custom Questions ═══ */}
      {currentStep === 2 && (
        <>
          <div style={sty.sectionCard}>
            <div style={sty.sectionTitle}><Icon className="ti ti-list" style={{ marginRight: '8px' }} />Questions from Batches ({questionsFromBatches.length})</div>
            {questionsFromBatches.length > 0 ? (
              <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                {questionsFromBatches.map((q, idx) => (
                  <div key={q.uuid || q.id} style={{ background: 'white', border: '1px solid #dee2e6', borderRadius: '6px', padding: '15px', marginBottom: '15px', display: 'flex', gap: '15px' }}>
                    {q.imageData && <img src={q.imageData} alt={`Q${idx + 1}`} style={{ width: '150px', height: '150px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #dee2e6' }} />}
                    <div style={{ flex: 1 }}>
                      <div style={{ marginBottom: '8px' }}>
                        <span style={{ display: 'inline-block', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, marginRight: '5px', background: '#e3f2f5', color: '#006073' }}><Icon className="ti ti-package" /> {q.batchId}</span>
                        <strong>{q.id}</strong>
                      </div>
                      <div style={{ fontSize: '12px', color: '#6c757d', marginBottom: '8px' }}>
                        Answer: <strong>{q.correctAnswer}</strong> • Level: <strong>{q.level || 'Not set'}</strong> • Subject: <strong>{q.subject || 'Not set'}</strong>
                      </div>
                      {q.ocrText && (
                        <div style={{ fontSize: '12px', color: '#495057', maxHeight: '60px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {q.ocrText.substring(0, 200)}{q.ocrText.length > 200 ? '...' : ''}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <button onClick={() => removeQuestion(idx, 'batch')} style={{ padding: '4px 8px', fontSize: '11px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                        <Icon className="ti ti-trash" /> Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '20px', textAlign: 'center', color: '#6c757d' }}>No questions from selected batches.</div>
            )}
          </div>

          <div style={sty.sectionCard}>
            <div style={sty.sectionTitle}><Icon className="ti ti-plus" style={{ marginRight: '8px' }} />Add Custom Questions</div>
            <div onClick={() => customFileRef.current?.click()} style={{ border: '2px dashed #006073', borderRadius: '8px', padding: '40px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#f0f8fa'} onMouseLeave={e => e.currentTarget.style.background = 'white'}>
              <Icon className="ti ti-image" style={{ fontSize: '48px', color: '#006073', marginBottom: '15px', display: 'block' }} />
              <div style={{ fontSize: '16px', fontWeight: 600, color: '#333', marginBottom: '8px' }}>Upload Custom Question Images</div>
              <div style={{ fontSize: '14px', color: '#6c757d' }}>Click to browse or drag and drop image files here</div>
              <div style={{ fontSize: '12px', color: '#adb5bd', marginTop: '8px' }}>Supported formats: JPG, PNG • Maximum 10MB per image</div>
            </div>

            {customQuestions.length > 0 && (
              <div style={{ marginTop: '20px' }}>
                <h5 style={{ marginBottom: '15px', color: '#333' }}>Custom Questions ({customQuestions.length})</h5>
                <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                  {customQuestions.map((q, idx) => (
                    <div key={q.uuid} style={{ background: 'white', border: '1px solid #dee2e6', borderRadius: '6px', padding: '15px', marginBottom: '15px', display: 'flex', gap: '15px' }}>
                      {q.imageData && <img src={q.imageData} alt={`CQ${idx + 1}`} style={{ width: '150px', height: '150px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #dee2e6' }} />}
                      <div style={{ flex: 1 }}>
                        <div style={{ marginBottom: '8px' }}>
                          <span style={{ display: 'inline-block', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, marginRight: '5px', background: '#fff3cd', color: '#856404' }}><Icon className="ti ti-image" /> Custom</span>
                          <strong>{q.id}</strong>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginTop: '10px' }}>
                          <div>
                            <label style={{ fontSize: '11px', color: '#6c757d' }}>Correct Answer</label>
                            <select value={q.correctAnswer} onChange={e => setCustomQuestions(prev => prev.map((cq, i) => i === idx ? { ...cq, correctAnswer: e.target.value } : cq))} className="form-control" style={{ padding: '5px', fontSize: '13px' }}>
                              <option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="D">D</option>
                            </select>
                          </div>
                          <div>
                            <label style={{ fontSize: '11px', color: '#6c757d' }}>Level</label>
                            <select value={q.level} onChange={e => setCustomQuestions(prev => prev.map((cq, i) => i === idx ? { ...cq, level: e.target.value } : cq))} className="form-control" style={{ padding: '5px', fontSize: '13px' }}>
                              <option value="Easy">Easy</option><option value="Medium">Medium</option><option value="Hard">Hard</option>
                            </select>
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <button onClick={() => removeQuestion(idx, 'custom')} style={{ padding: '4px 8px', fontSize: '11px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                          <Icon className="ti ti-trash" /> Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={sty.actionButtons}>
            <button onClick={prevStep} style={{ padding: '12px 28px', fontSize: '14px', fontWeight: 600, background: '#e9ecef', color: '#495057', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
              <Icon className="ti ti-arrow-left" /> Previous
            </button>
            <button onClick={nextStep} style={{ padding: '12px 28px', fontSize: '14px', fontWeight: 600, background: '#006073', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
              Next: Configure Quiz <Icon className="ti ti-arrow-right" />
            </button>
          </div>
        </>
      )}

      {/* ═══ Step 3: Configure Quiz ═══ */}
      {currentStep === 3 && (
        <>
          {/* Quiz Details */}
          <div style={sty.sectionCard}>
            <div style={sty.sectionTitle}><Icon className="ti ti-settings" style={{ marginRight: '8px' }} />Quiz Details</div>
            <div style={sty.formGrid}>
              <div style={sty.formGroup}>
                <label style={sty.formLabel}><Icon className="ti ti-clipboard" /> Quiz Title *</label>
                <input type="text" value={quizConfig.title} onChange={e => upd('title', e.target.value)} placeholder="e.g., NEET Mock Test 2024" style={sty.formInput} />
              </div>
              <div style={sty.formGroup}>
                <label style={sty.formLabel}><Icon className="ti ti-timer" /> Total Duration (minutes) *</label>
                <input type="number" value={quizConfig.duration} onChange={e => upd('duration', e.target.value)} placeholder="e.g., 180" min="1" style={sty.formInput} />
              </div>
            </div>
            <div style={sty.formGroup}>
              <label style={sty.formLabel}><Icon className="ti ti-text" /> Description</label>
              <textarea value={quizConfig.description} onChange={e => upd('description', e.target.value)} placeholder="Optional description for students" style={{ ...sty.formInput, resize: 'vertical', minHeight: '80px' }} />
            </div>
          </div>

          {/* Marking Scheme */}
          <div style={sty.sectionCard}>
            <div style={sty.sectionTitle}><Icon className="ti ti-check-box" style={{ marginRight: '8px' }} />Marking Scheme</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '15px' }}>
              {[
                { key: 'default', title: 'Default (NEET/JEE Pattern)', icon: 'ti-check', details: '+4 marks for correct answer\n-1 mark for incorrect answer\n0 marks for unanswered' },
                { key: 'no-negative', title: 'No Negative Marking', icon: 'ti-check', details: '+1 mark for correct answer\n0 marks for incorrect answer\n0 marks for unanswered' },
                { key: 'custom', title: 'Custom Marking', icon: 'ti-pencil', details: 'Define your own marking scheme' },
              ].map(preset => (
                <div key={preset.key} onClick={() => upd('markingScheme', preset.key)} style={{ border: `2px solid ${quizConfig.markingScheme === preset.key ? '#006073' : '#e9ecef'}`, borderRadius: '6px', padding: '15px', cursor: 'pointer', transition: 'all 0.2s', background: quizConfig.markingScheme === preset.key ? '#e3f2f5' : 'white' }}>
                  <div style={{ fontWeight: 600, color: '#333', marginBottom: '8px' }}><Icon className={`ti ${preset.icon}`} /> {preset.title}</div>
                  <div style={{ fontSize: '13px', color: '#6c757d', whiteSpace: 'pre-line' }}>{preset.details}</div>
                </div>
              ))}
            </div>
            {quizConfig.markingScheme === 'custom' && (
              <div style={{ marginTop: '20px', padding: '20px', background: '#f8f9fa', borderRadius: '6px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px' }}>
                  <div style={sty.formGroup}><label style={sty.formLabel}>Correct Answer Marks</label><input type="number" value={quizConfig.customMarking.correct} onChange={e => updCustom('correct', Number(e.target.value))} style={sty.formInput} /></div>
                  <div style={sty.formGroup}><label style={sty.formLabel}>Incorrect Answer Marks</label><input type="number" value={quizConfig.customMarking.incorrect} onChange={e => updCustom('incorrect', Number(e.target.value))} style={sty.formInput} /></div>
                  <div style={sty.formGroup}><label style={sty.formLabel}>Unanswered Marks</label><input type="number" value={quizConfig.customMarking.unanswered} onChange={e => updCustom('unanswered', Number(e.target.value))} style={sty.formInput} /></div>
                </div>
              </div>
            )}
          </div>

          {/* Schedule */}
          <div style={sty.sectionCard}>
            <div style={sty.sectionTitle}><Icon className="ti ti-calendar" style={{ marginRight: '8px' }} />Schedule</div>
            <div style={sty.formGrid}>
              <div style={sty.formGroup}><label style={sty.formLabel}><Icon className="ti ti-calendar" /> Start Date *</label><input type="date" value={quizConfig.startDate} onChange={e => upd('startDate', e.target.value)} style={sty.formInput} /></div>
              <div style={sty.formGroup}><label style={sty.formLabel}><Icon className="ti ti-time" /> Start Time *</label><input type="time" value={quizConfig.startTime} onChange={e => upd('startTime', e.target.value)} style={sty.formInput} /></div>
              <div style={sty.formGroup}><label style={sty.formLabel}><Icon className="ti ti-calendar" /> End Date *</label><input type="date" value={quizConfig.endDate} onChange={e => upd('endDate', e.target.value)} style={sty.formInput} /></div>
              <div style={sty.formGroup}><label style={sty.formLabel}><Icon className="ti ti-time" /> End Time *</label><input type="time" value={quizConfig.endTime} onChange={e => upd('endTime', e.target.value)} style={sty.formInput} /></div>
            </div>
            {quizConfig.startDate && quizConfig.startTime && quizConfig.endDate && quizConfig.endTime && (
              <div style={{ padding: '15px', background: '#fff3cd', borderLeft: '4px solid #ffc107', borderRadius: '4px', marginTop: '15px' }}>
                <strong style={{ color: '#856404' }}><Icon className="ti ti-info-alt" /> Schedule Window</strong>
                <p style={{ margin: '8px 0 0 0', color: '#856404', fontSize: '13px' }}>
                  Students can take the quiz anytime between <strong>{fmtDateTime(quizConfig.startDate, quizConfig.startTime)}</strong> and <strong>{fmtDateTime(quizConfig.endDate, quizConfig.endTime)}</strong>
                </p>
              </div>
            )}
            <div style={{ marginTop: '20px', padding: '15px', background: '#f8f9fa', borderRadius: '6px', border: '1px solid #e9ecef' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', margin: 0 }}>
                <input type="checkbox" checked={quizConfig.allowMultipleAttempts} onChange={e => upd('allowMultipleAttempts', e.target.checked)} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
                <span style={{ fontSize: '14px', color: '#333' }}>
                  <strong>Allow Multiple Attempts for given Candidate</strong>
                  <span style={{ display: 'block', fontSize: '12px', color: '#6c757d', marginTop: '3px' }}>When enabled, candidates can retake this quiz multiple times within the schedule window</span>
                </span>
              </label>
            </div>
          </div>

          <div style={sty.actionButtons}>
            <button onClick={prevStep} style={{ padding: '12px 28px', fontSize: '14px', fontWeight: 600, background: '#e9ecef', color: '#495057', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
              <Icon className="ti ti-arrow-left" /> Previous
            </button>
            <button onClick={nextStep} disabled={!isConfigValid} style={{ padding: '12px 28px', fontSize: '14px', fontWeight: 600, background: '#006073', color: 'white', border: 'none', borderRadius: '6px', cursor: isConfigValid ? 'pointer' : 'not-allowed', opacity: isConfigValid ? 1 : 0.5 }}>
              Next: Preview & Publish <Icon className="ti ti-arrow-right" />
            </button>
          </div>
        </>
      )}

      {/* ═══ Step 4: Preview & Publish ═══ */}
      {currentStep === 4 && (
        <>
          <div style={sty.sectionCard}>
            <div style={sty.sectionTitle}><Icon className="ti ti-eye" style={{ marginRight: '8px' }} />Quiz Preview</div>
            <div style={{ background: '#f8f9fa', padding: '20px', borderRadius: '6px', marginBottom: '20px' }}>
              <h3 style={{ margin: '0 0 15px 0', color: '#333' }}>{quizConfig.title}</h3>
              {quizConfig.description && <p style={{ color: '#6c757d', marginBottom: '15px' }}>{quizConfig.description}</p>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
                <div><div style={{ fontSize: '12px', color: '#6c757d', marginBottom: '5px' }}>Total Questions</div><div style={{ fontSize: '24px', fontWeight: 600, color: '#006073' }}>{totalQuestions}</div></div>
                <div><div style={{ fontSize: '12px', color: '#6c757d', marginBottom: '5px' }}>Duration</div><div style={{ fontSize: '24px', fontWeight: 600, color: '#006073' }}>{quizConfig.duration} min</div></div>
                <div><div style={{ fontSize: '12px', color: '#6c757d', marginBottom: '5px' }}>Maximum Marks</div><div style={{ fontSize: '24px', fontWeight: 600, color: '#006073' }}>{maxMarks}</div></div>
              </div>
              <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #dee2e6' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '15px', fontSize: '13px' }}>
                  <div><strong>Marking Scheme:</strong> <span>{markingLabel}</span></div>
                  <div><strong>Schedule:</strong> {fmtDateTime(quizConfig.startDate, quizConfig.startTime)} to {fmtDateTime(quizConfig.endDate, quizConfig.endTime)}</div>
                </div>
              </div>
            </div>
            <div style={{ background: 'white', border: '1px solid #dee2e6', borderRadius: '6px', padding: '20px' }}>
              <h5 style={{ margin: '0 0 15px 0' }}>Questions Breakdown</h5>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '15px', fontSize: '14px' }}>
                <div><Icon className="ti ti-package" style={{ color: '#006073' }} /> <strong>From Batches:</strong> {questionsFromBatches.length} questions</div>
                <div><Icon className="ti ti-image" style={{ color: '#856404' }} /> <strong>Custom Questions:</strong> {customQuestions.length} questions</div>
              </div>
            </div>
          </div>

          <div style={sty.sectionCard}>
            <div style={sty.sectionTitle}><Icon className="ti ti-link" style={{ marginRight: '8px' }} />Quiz URL</div>
            <div style={{ background: '#e3f2f5', border: '2px solid #006073', borderRadius: '6px', padding: '20px', marginTop: '20px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#495057', marginBottom: '10px' }}><Icon className="ti ti-world" /> Share this URL with students:</div>
              <div style={{ fontSize: '16px', color: '#006073', fontWeight: 600, wordBreak: 'break-all', fontFamily: "'Courier New', monospace" }}>{quizUrl}</div>
              <button onClick={copyUrl} style={{ marginTop: '10px', background: '#006073', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>
                <Icon className="ti ti-files" /> Copy URL
              </button>
            </div>
            <div style={{ marginTop: '20px', padding: '15px', background: '#d1ecf1', borderLeft: '4px solid #17a2b8', borderRadius: '4px' }}>
              <strong style={{ color: '#0c5460' }}><Icon className="ti ti-info-alt" /> Next Steps</strong>
              <ul style={{ margin: '8px 0 0 20px', color: '#0c5460', fontSize: '13px' }}>
                <li>Click "Publish Quiz" to make it available to students</li>
                <li>Share the quiz URL with your students</li>
                <li>Students can access the quiz during the scheduled window</li>
                <li>Monitor quiz attempts and results in real-time</li>
              </ul>
            </div>
          </div>

          <div style={sty.actionButtons}>
            <button onClick={prevStep} style={{ padding: '12px 28px', fontSize: '14px', fontWeight: 600, background: '#e9ecef', color: '#495057', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
              <Icon className="ti ti-arrow-left" /> Previous
            </button>
            <div style={{ display: 'flex', gap: '15px' }}>
              <button onClick={() => persistQuiz('draft')} style={{ padding: '12px 28px', fontSize: '14px', fontWeight: 600, background: '#e9ecef', color: '#495057', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                <Icon className="ti ti-save" /> Save as Draft
              </button>
              <button onClick={() => persistQuiz('published')} disabled={submitting} style={{ padding: '12px 28px', fontSize: '14px', fontWeight: 600, background: '#28a745', color: 'white', border: 'none', borderRadius: '6px', cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1 }}>
                <Icon className={`ti ${submitting ? 'ti-reload' : 'ti-check'}`} /> {submitting ? 'Publishing…' : 'Publish Quiz'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
