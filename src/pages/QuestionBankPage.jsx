import React, { useEffect, useMemo, useRef, useState } from 'react';
import ToastRegion from '../components/ToastRegion';
import FilterDropdown from '../components/FilterDropdown';
import { questionBankDemoLite } from '../data/adminRemainingDemo';
import Icon from '../components/Icon';

// ─── Chapter data (keyed by subject, grouped by grade) ───────────────────────
const CHAPTER_MAP = {
  Physics: [
    { group: 'Physics — Plus One', chapters: [
      { id: '1P01', name: 'Ch 1: Physical World' }, { id: '1P02', name: 'Ch 2: Units & Measurements' },
      { id: '1P03', name: 'Ch 3: Motion in a Straight Line' }, { id: '1P04', name: 'Ch 4: Motion in a Plane' },
      { id: '1P05', name: 'Ch 5: Laws of Motion' }, { id: '1P06', name: 'Ch 6: Work, Energy & Power' },
      { id: '1P07', name: 'Ch 7: Rotational Motion' }, { id: '1P08', name: 'Ch 8: Gravitation' },
      { id: '1P09', name: 'Ch 9: Mech. Properties Solids' }, { id: '1P10', name: 'Ch 10: Mech. Properties Fluids' },
      { id: '1P11', name: 'Ch 11: Thermal Properties' }, { id: '1P12', name: 'Ch 12: Thermodynamics' },
      { id: '1P13', name: 'Ch 13: Kinetic Theory' }, { id: '1P14', name: 'Ch 14: Oscillations' },
      { id: '1P15', name: 'Ch 15: Waves' },
    ]},
    { group: 'Physics — Plus Two', chapters: [
      { id: '2P01', name: 'Ch 1: Electric Charges & Fields' }, { id: '2P02', name: 'Ch 2: Electrostatic Potential' },
      { id: '2P03', name: 'Ch 3: Current Electricity' }, { id: '2P04', name: 'Ch 4: Moving Charges & Mag.' },
      { id: '2P05', name: 'Ch 5: Magnetism & Matter' }, { id: '2P06', name: 'Ch 6: EM Induction' },
      { id: '2P07', name: 'Ch 7: Alternating Current' }, { id: '2P08', name: 'Ch 8: EM Waves' },
      { id: '2P09', name: 'Ch 9: Ray Optics' }, { id: '2P10', name: 'Ch 10: Wave Optics' },
      { id: '2P11', name: 'Ch 11: Dual Nature of Radiation' }, { id: '2P12', name: 'Ch 12: Atoms' },
      { id: '2P13', name: 'Ch 13: Nuclei' }, { id: '2P14', name: 'Ch 14: Semiconductors' },
    ]},
  ],
  Chemistry: [
    { group: 'Chemistry — Plus One', chapters: [
      { id: '1C01', name: 'Ch 1: Basic Concepts of Chemistry' }, { id: '1C02', name: 'Ch 2: Structure of Atom' },
      { id: '1C03', name: 'Ch 3: Classification of Elements' }, { id: '1C04', name: 'Ch 4: Chemical Bonding' },
      { id: '1C05', name: 'Ch 5: States of Matter' }, { id: '1C06', name: 'Ch 6: Thermodynamics' },
      { id: '1C07', name: 'Ch 7: Equilibrium' }, { id: '1C08', name: 'Ch 8: Redox Reactions' },
      { id: '1C09', name: 'Ch 9: Hydrogen' }, { id: '1C10', name: 'Ch 10: s-Block Elements' },
      { id: '1C11', name: 'Ch 11: p-Block Elements' }, { id: '1C12', name: 'Ch 12: Organic Chemistry Basics' },
      { id: '1C13', name: 'Ch 13: Hydrocarbons' }, { id: '1C14', name: 'Ch 14: Environmental Chemistry' },
    ]},
    { group: 'Chemistry — Plus Two', chapters: [
      { id: '2C01', name: 'Ch 1: Solid State' }, { id: '2C02', name: 'Ch 2: Solutions' },
      { id: '2C03', name: 'Ch 3: Electrochemistry' }, { id: '2C04', name: 'Ch 4: Chemical Kinetics' },
      { id: '2C05', name: 'Ch 5: Surface Chemistry' }, { id: '2C06', name: 'Ch 6: Extraction of Elements' },
      { id: '2C07', name: 'Ch 7: p-Block Elements II' }, { id: '2C08', name: 'Ch 8: d & f Block Elements' },
      { id: '2C09', name: 'Ch 9: Coordination Compounds' }, { id: '2C10', name: 'Ch 10: Haloalkanes' },
      { id: '2C11', name: 'Ch 11: Alcohols, Phenols & Ethers' }, { id: '2C12', name: 'Ch 12: Aldehydes & Ketones' },
      { id: '2C13', name: 'Ch 13: Amines' }, { id: '2C14', name: 'Ch 14: Biomolecules' },
    ]},
  ],
  Mathematics: [
    { group: 'Mathematics — Plus One', chapters: [
      { id: '1M01', name: 'Ch 1: Sets' }, { id: '1M02', name: 'Ch 2: Relations & Functions' },
      { id: '1M03', name: 'Ch 3: Trigonometric Functions' }, { id: '1M04', name: 'Ch 4: Mathematical Induction' },
      { id: '1M05', name: 'Ch 5: Complex Numbers' }, { id: '1M06', name: 'Ch 6: Linear Inequalities' },
      { id: '1M07', name: 'Ch 7: Permutations & Combinations' }, { id: '1M08', name: 'Ch 8: Binomial Theorem' },
      { id: '1M09', name: 'Ch 9: Sequence & Series' }, { id: '1M10', name: 'Ch 10: Straight Lines' },
      { id: '1M11', name: 'Ch 11: Conic Sections' }, { id: '1M12', name: 'Ch 12: 3D Geometry' },
      { id: '1M13', name: 'Ch 13: Limits & Derivatives' }, { id: '1M14', name: 'Ch 14: Mathematical Reasoning' },
      { id: '1M15', name: 'Ch 15: Statistics' }, { id: '1M16', name: 'Ch 16: Probability' },
    ]},
    { group: 'Mathematics — Plus Two', chapters: [
      { id: '2M01', name: 'Ch 1: Relations & Functions' }, { id: '2M02', name: 'Ch 2: Inverse Trig. Functions' },
      { id: '2M03', name: 'Ch 3: Matrices' }, { id: '2M04', name: 'Ch 4: Determinants' },
      { id: '2M05', name: 'Ch 5: Continuity' }, { id: '2M06', name: 'Ch 6: App. of Derivatives' },
      { id: '2M07', name: 'Ch 7: Integrals' }, { id: '2M08', name: 'Ch 8: App. of Integrals' },
      { id: '2M09', name: 'Ch 9: Differential Equations' }, { id: '2M10', name: 'Ch 10: Vector Algebra' },
      { id: '2M11', name: 'Ch 11: 3D Geometry' }, { id: '2M12', name: 'Ch 12: Linear Programming' },
      { id: '2M13', name: 'Ch 13: Probability' },
    ]},
  ],
  Biology: [
    { group: 'Biology — Plus One', chapters: [
      { id: '1B01', name: 'Ch 1: Diversity of Living World' }, { id: '1B02', name: 'Ch 2: Biological Classification' },
      { id: '1B03', name: 'Ch 3: Plant Kingdom' }, { id: '1B04', name: 'Ch 4: Animal Kingdom' },
      { id: '1B05', name: 'Ch 5: Morphology of Plants' }, { id: '1B06', name: 'Ch 6: Anatomy of Plants' },
      { id: '1B07', name: 'Ch 7: Structural Org. in Animals' }, { id: '1B08', name: 'Ch 8: Cell — The Unit of Life' },
      { id: '1B09', name: 'Ch 9: Biomolecules' }, { id: '1B10', name: 'Ch 10: Cell Cycle' },
      { id: '1B11', name: 'Ch 11: Transport in Plants' }, { id: '1B12', name: 'Ch 12: Mineral Nutrition' },
      { id: '1B13', name: 'Ch 13: Photosynthesis' }, { id: '1B14', name: 'Ch 14: Respiration in Plants' },
      { id: '1B15', name: 'Ch 15: Plant Growth' }, { id: '1B16', name: 'Ch 16: Digestion & Absorption' },
      { id: '1B17', name: 'Ch 17: Breathing & Exchange of Gases' }, { id: '1B18', name: 'Ch 18: Body Fluids' },
      { id: '1B19', name: 'Ch 19: Excretory Products' }, { id: '1B20', name: 'Ch 20: Locomotion' },
      { id: '1B21', name: 'Ch 21: Neural Control' }, { id: '1B22', name: 'Ch 22: Chemical Coordination' },
    ]},
    { group: 'Biology — Plus Two', chapters: [
      { id: '2B01', name: 'Ch 1: Reproduction in Organisms' }, { id: '2B02', name: 'Ch 2: Sexual Reproduction' },
      { id: '2B03', name: 'Ch 3: Human Reproduction' }, { id: '2B04', name: 'Ch 4: Reproductive Health' },
      { id: '2B05', name: 'Ch 5: Inheritance & Variation' }, { id: '2B06', name: 'Ch 6: Molecular Basis' },
      { id: '2B07', name: 'Ch 7: Evolution' }, { id: '2B08', name: 'Ch 8: Human Health' },
      { id: '2B09', name: 'Ch 9: Food Production' }, { id: '2B10', name: 'Ch 10: Microbes' },
      { id: '2B11', name: 'Ch 11: Biotech Principles' }, { id: '2B12', name: 'Ch 12: Biotech Applications' },
      { id: '2B13', name: 'Ch 13: Organisms & Populations' }, { id: '2B14', name: 'Ch 14: Ecosystem' },
      { id: '2B15', name: 'Ch 15: Biodiversity' }, { id: '2B16', name: 'Ch 16: Environmental Issues' },
    ]},
  ],
};

const PYQ_TYPES = ['IAT', 'NEST', 'NEET', 'JEE Mains', 'KEAM'];
const SUBJECTS = ['Biology', 'Chemistry', 'Mathematics', 'Physics'];

function getPYQLabel(q) {
  if (q.pyqType && q.pyqYear) return `${q.pyqType} ${q.pyqYear}`;
  if (q.pyqType) return q.pyqType;
  return 'Practice';
}

// ─── KebabMenu ────────────────────────────────────────────────────────────────
function KebabMenu({ question, onView, onEdit, onToggleVerify, onToggleChallenge }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="kebab-menu-container" ref={ref}>
      <button
        type="button"
        className="kebab-button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
      >
        <Icon className="ti ti-more-alt" />
      </button>
      {open && (
        <div className="kebab-dropdown active">
          <button
            type="button"
            className="kebab-dropdown-item"
            onClick={() => { setOpen(false); onView(); }}
          >
            <Icon className="ti ti-eye" /> View Details
          </button>
          <button
            type="button"
            className="kebab-dropdown-item"
            onClick={() => { setOpen(false); onEdit(); }}
          >
            <Icon className="ti ti-pencil" /> Edit Question
          </button>
          <button
            type="button"
            className="kebab-dropdown-item"
            onClick={() => { setOpen(false); onToggleVerify(); }}
          >
            <Icon className={`ti ${question.verified ? 'ti-close' : 'ti-check'}`} /> {question.verified ? 'Unverify' : 'Mark Verified'}
          </button>
          <button
            type="button"
            className={`kebab-dropdown-item${question.challenged ? ' qb-challenge-remove' : ' qb-challenge-add'}`}
            onClick={() => { setOpen(false); onToggleChallenge(); }}
          >
            <Icon className="ti ti-alert" /> {question.challenged ? 'Remove Challenge' : 'Flag Challenge'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── View Modal ───────────────────────────────────────────────────────────────
function ViewModal({ question, onClose, onEdit }) {
  return (
    <div className="crispr-modal-backdrop active" onClick={onClose}>
      <div className="crispr-modal-dialog" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
        <div className="crispr-modal-header">
          <h3><Icon className="ti ti-help-alt" /> {question.displayKey}</h3>
          <button type="button" className="crispr-modal-close" onClick={onClose}>
            <Icon className="ti ti-close" />
          </button>
        </div>
        <div className="crispr-modal-body" style={{ padding: 24 }}>
          <div className="qb-view-flags">
            {question.verified && (
              <span className="qb-flag verified"><Icon className="ti ti-check" /> Verified</span>
            )}
            {question.hasSolution && (
              <span className="qb-flag solution"><Icon className="ti ti-book" /> Solution Added</span>
            )}
            {question.challenged && (
              <span className="qb-flag challenged"><Icon className="ti ti-alert" /> Challenged</span>
            )}
          </div>
          <table className="qb-detail-table">
            <tbody>
              <tr><td>Subject</td><td><span className="crispr-badge">{question.subject}</span></td></tr>
              <tr><td>Chapter</td><td>{question.chapter}</td></tr>
              <tr><td>Type</td><td>{question.questionType}</td></tr>
              <tr>
                <td>Level</td>
                <td>
                  <span className={`crispr-status ${question.level === 'Easy' ? 'active' : question.level === 'Medium' ? 'pending' : 'inactive'}`}>
                    {question.level}
                  </span>
                </td>
              </tr>
              <tr><td>Answer</td><td><strong>{question.answer || '—'}</strong></td></tr>
              {question.pyqType && (
                <tr><td>PYQ</td><td><span className="qb-pyq-label">{getPYQLabel(question)}</span></td></tr>
              )}
              {question.averageTimeTaken > 0 && (
                <tr><td>Avg Time</td><td>{(question.averageTimeTaken / 60).toFixed(1)} min</td></tr>
              )}
              {question.solution && (
                <tr>
                  <td>Solution</td>
                  <td className="qb-solution-text">{question.solution}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="crispr-modal-footer">
          <button type="button" className="btn-modal-cancel" onClick={onClose}>Close</button>
          <button type="button" className="btn-modal-primary" onClick={() => { onClose(); onEdit(); }}>
            <Icon className="ti ti-pencil" /> Edit
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────
function EditModal({ question, onClose, onSave }) {
  const [form, setForm] = useState({
    level: question.level || '',
    chapterId: question.chapterId || '',
    chapter: question.chapter || '',
    pyqType: question.pyqType || '',
    pyqYear: question.pyqYear ? String(question.pyqYear) : '',
    averageTimeTaken: question.averageTimeTaken ? String(question.averageTimeTaken) : '',
    answer: question.answer || '',
    solution: question.solution || '',
  });

  const groups = CHAPTER_MAP[question.subject] || [];
  const allChapters = groups.flatMap((g) => g.chapters);

  function setLevel(lvl) { setForm((f) => ({ ...f, level: lvl })); }

  function handleChapterChange(id) {
    const found = allChapters.find((c) => c.id === id);
    setForm((f) => ({ ...f, chapterId: id, chapter: found ? found.name.replace(/^Ch \d+: /, '') : '' }));
  }

  function handleSave() {
    onSave({
      ...question,
      ...form,
      pyqYear: form.pyqYear ? Number(form.pyqYear) : null,
      averageTimeTaken: form.averageTimeTaken ? Number(form.averageTimeTaken) : 0,
    });
  }

  const avgTimePresets = [30, 60, 90, 120, 150, 180, 240, 300, 360];

  return (
    <div className="crispr-modal-backdrop active" onClick={onClose}>
      <div className="crispr-modal-dialog" style={{ maxWidth: 700 }} onClick={(e) => e.stopPropagation()}>
        <div className="crispr-modal-header">
          <h3><Icon className="ti ti-pencil" /> Editing Question #{question.id}</h3>
          <button type="button" className="crispr-modal-close" onClick={onClose}>
            <Icon className="ti ti-close" />
          </button>
        </div>
        <div className="crispr-modal-body" style={{ padding: 24 }}>

          {/* Level */}
          <div className="qb-form-group">
            <label>Level of Question</label>
            <div className="qb-level-buttons">
              {['Easy', 'Medium', 'Hard'].map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  className={`qb-level-btn ${lvl.toLowerCase()}${form.level === lvl ? ' selected' : ''}`}
                  onClick={() => setLevel(lvl)}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>

          {/* Answer */}
          <div className="qb-form-group">
            <label>Correct Answer</label>
            {question.questionType === 'MCQ' ? (
              <div className="qb-answer-buttons">
                {['A', 'B', 'C', 'D'].map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    className={`qb-answer-btn${form.answer === opt ? ' selected' : ''}`}
                    onClick={() => setForm((f) => ({ ...f, answer: opt }))}
                  >
                    Option {opt}
                  </button>
                ))}
              </div>
            ) : (
              <input
                type="text"
                className="qb-input"
                value={form.answer}
                maxLength={10}
                placeholder="Enter integer answer"
                onChange={(e) => setForm((f) => ({ ...f, answer: e.target.value }))}
              />
            )}
          </div>

          <div className="qb-form-row">
            {/* PYQ Type */}
            <div className="qb-form-group">
              <label>Previous Year Question</label>
              <select
                className="qb-select"
                value={form.pyqType}
                onChange={(e) => setForm((f) => ({ ...f, pyqType: e.target.value }))}
              >
                <option value="">None</option>
                <optgroup label="Relevant">
                  {['IAT', 'NEST', 'NEET', 'JEE Mains'].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </optgroup>
                <optgroup label="Others">
                  <option value="KEAM">KEAM</option>
                </optgroup>
              </select>
              <div className="qb-year-presets">
                <span className="qb-preset" onClick={() => setForm((f) => ({ ...f, pyqType: '', pyqYear: '' }))}>None</span>
                {[2019, 2020, 2021, 2022, 2023, 2024].map((y) => (
                  <span key={y} className="qb-preset" onClick={() => setForm((f) => ({ ...f, pyqYear: String(y) }))}>{y}</span>
                ))}
              </div>
            </div>

            {/* PYQ Year */}
            <div className="qb-form-group">
              <label>Year Asked</label>
              <input
                type="text"
                className="qb-input"
                value={form.pyqYear}
                maxLength={4}
                placeholder="e.g. 2022"
                onChange={(e) => setForm((f) => ({ ...f, pyqYear: e.target.value }))}
              />
            </div>
          </div>

          <div className="qb-form-row">
            {/* Chapter */}
            <div className="qb-form-group">
              <label>Chapter ({question.subject})</label>
              <select
                className="qb-select"
                value={form.chapterId}
                onChange={(e) => handleChapterChange(e.target.value)}
              >
                <option value="">Select chapter</option>
                {groups.map((g) => (
                  <optgroup key={g.group} label={g.group}>
                    {g.chapters.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* Avg Time */}
            <div className="qb-form-group">
              <label>
                Avg Time{form.averageTimeTaken > 0 ? ` = ${(Number(form.averageTimeTaken) / 60).toFixed(1)}m` : ''}
              </label>
              <input
                type="text"
                className="qb-input"
                value={form.averageTimeTaken}
                maxLength={4}
                placeholder="in seconds"
                onChange={(e) => setForm((f) => ({ ...f, averageTimeTaken: e.target.value }))}
              />
              <div className="qb-year-presets">
                {avgTimePresets.map((s) => (
                  <span key={s} className="qb-preset" onClick={() => setForm((f) => ({ ...f, averageTimeTaken: String(s) }))}>
                    {s < 60 ? `${s}s` : `${s / 60}m`}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Solution */}
          <div className="qb-form-group">
            <label>Solution Notes</label>
            <textarea
              className="qb-textarea"
              value={form.solution}
              rows={3}
              placeholder="Enter solution explanation..."
              onChange={(e) => setForm((f) => ({ ...f, solution: e.target.value }))}
            />
          </div>
        </div>
        <div className="crispr-modal-footer">
          <button type="button" className="btn-modal-cancel" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-modal-primary" onClick={handleSave}>
            <Icon className="ti ti-save" /> Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function QuestionBankPage() {
  const [questions, setQuestions] = useState(questionBankDemoLite);
  const [isLoading, setIsLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [filterChapter, setFilterChapter] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [sortKey, setSortKey] = useState('id');
  const [sortDir, setSortDir] = useState('asc');
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [viewQuestion, setViewQuestion] = useState(null);
  const [editQuestion, setEditQuestion] = useState(null);
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const t = window.setTimeout(() => setIsLoading(false), 700);
    return () => window.clearTimeout(t);
  }, []);

  function showToast(type, title, message) {
    const id = Date.now() + Math.random();
    setToasts((cur) => [...cur, { id, type, title, message }]);
    window.setTimeout(() => setToasts((cur) => cur.filter((t) => t.id !== id)), 4000);
  }

  function handleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
    setCurrentPage(1);
  }

  function SortIcon({ col }) {
    if (sortKey !== col) return <Icon className="sort-icon ti ti-arrows-vertical" />;
    return <Icon className={`sort-icon ti ti-arrow-${sortDir === 'asc' ? 'up' : 'down'}`} />;
  }

  // Build subject options
  const subjectOptions = [
    { value: '', label: 'All Subjects' },
    ...SUBJECTS.map((s) => ({ value: s, label: s })),
  ];

  // Build chapter options for selected subject (grouped)
  const chapterOptions = useMemo(() => {
    if (!filterSubject) return [];
    const groups = CHAPTER_MAP[filterSubject] || [];
    return [
      { value: '', label: 'All Chapters' },
      ...groups.map((g) => ({
        group: g.group,
        options: g.chapters.map((c) => ({ value: c.id, label: c.name })),
      })),
    ];
  }, [filterSubject]);

  const statusOptions = [
    { value: '', label: 'All Questions' },
    { value: 'UNVERIFIED', label: 'Unverified Only' },
    { value: 'VERIFIED', label: 'Verified Only' },
    { value: 'NOSOLUTION', label: 'Without Solution' },
    { value: 'CHALLENGED', label: 'Challenged' },
    { value: 'PYQ', label: 'PYQs Only' },
  ];

  const filteredQuestions = useMemo(() => {
    let result = questions.filter((q) => {
      if (filterSubject && q.subject !== filterSubject) return false;
      if (filterChapter && q.chapterId !== filterChapter) return false;
      if (filterStatus === 'UNVERIFIED' && q.verified) return false;
      if (filterStatus === 'VERIFIED' && !q.verified) return false;
      if (filterStatus === 'NOSOLUTION' && q.hasSolution) return false;
      if (filterStatus === 'CHALLENGED' && !q.challenged) return false;
      if (filterStatus === 'PYQ' && !q.pyqType) return false;
      if (searchText.trim()) {
        const q2 = searchText.trim().toLowerCase();
        if (![String(q.id), q.displayKey, q.chapter, q.subject].some((s) => s.toLowerCase().includes(q2))) return false;
      }
      return true;
    });

    result = [...result].sort((a, b) => {
      let av = a[sortKey] ?? '';
      let bv = b[sortKey] ?? '';
      if (typeof av === 'number') {
        if (av < bv) return sortDir === 'asc' ? -1 : 1;
        if (av > bv) return sortDir === 'asc' ? 1 : -1;
      } else {
        av = String(av).toLowerCase(); bv = String(bv).toLowerCase();
        if (av < bv) return sortDir === 'asc' ? -1 : 1;
        if (av > bv) return sortDir === 'asc' ? 1 : -1;
      }
      return 0;
    });
    return result;
  }, [questions, searchText, filterSubject, filterChapter, filterStatus, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredQuestions.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const paginatedQuestions = filteredQuestions.slice(startIdx, startIdx + pageSize);

  function goToPage(p) { setCurrentPage(Math.max(1, Math.min(p, totalPages))); }

  function pageNumbers() {
    const range = 2;
    const pages = [];
    for (let i = Math.max(1, safePage - range); i <= Math.min(totalPages, safePage + range); i++) pages.push(i);
    return pages;
  }

  function handleCopy(text) {
    navigator.clipboard.writeText(text).then(() => showToast('success', 'Copied', `"${text}" copied.`));
  }

  function handleToggleVerify(question) {
    setQuestions((cur) => cur.map((q) => q.id === question.id ? { ...q, verified: !q.verified } : q));
    showToast('success', 'Updated', `${question.displayKey} ${question.verified ? 'unverified' : 'verified'}.`);
  }

  function handleToggleChallenge(question) {
    setQuestions((cur) => cur.map((q) => q.id === question.id ? { ...q, challenged: !q.challenged } : q));
    showToast(question.challenged ? 'success' : 'warning', 'Updated',
      `Challenge ${question.challenged ? 'removed from' : 'flagged on'} ${question.displayKey}.`);
  }

  function handleSaveEdit(updated) {
    setQuestions((cur) => cur.map((q) => q.id === updated.id ? updated : q));
    setEditQuestion(null);
    showToast('success', 'Saved', `${updated.displayKey} updated successfully.`);
  }

  // Summary counts
  const stats = useMemo(() => ({
    total: questions.length,
    verified: questions.filter((q) => q.verified).length,
    challenged: questions.filter((q) => q.challenged).length,
    withoutSolution: questions.filter((q) => !q.hasSolution).length,
  }), [questions]);

  const skeletonRows = Array.from({ length: Math.min(5, pageSize) });

  return (
    <section className="question-bank-page data-table-page">
      <ToastRegion toasts={toasts} onDismiss={(id) => setToasts((cur) => cur.filter((t) => t.id !== id))} />

      <div className="page-header-section">
        <div className="page-header-title-group">
          <span className="page-header-icon-box"><Icon className="fa fa-database" /></span>
          <div>
            <h2>Question Bank</h2>
            <p>Browse, verify, and manage the question repository across subjects, chapters, and difficulty levels.</p>
          </div>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="qb-stats-row">
        <div className="qb-stat-tile" onClick={() => setFilterStatus('')}>
          <div className="qb-stat-icon total"><Icon className="ti ti-help-alt" /></div>
          <div className="qb-stat-body">
            <div className="qb-stat-value">{stats.total}</div>
            <div className="qb-stat-label">Total Questions</div>
          </div>
        </div>
        <div className="qb-stat-tile" onClick={() => setFilterStatus('VERIFIED')}>
          <div className="qb-stat-icon verified"><Icon className="ti ti-check-box" /></div>
          <div className="qb-stat-body">
            <div className="qb-stat-value">{stats.verified}</div>
            <div className="qb-stat-label">Verified</div>
          </div>
        </div>
        <div className="qb-stat-tile" onClick={() => setFilterStatus('CHALLENGED')}>
          <div className="qb-stat-icon challenged"><Icon className="ti ti-alert" /></div>
          <div className="qb-stat-body">
            <div className="qb-stat-value">{stats.challenged}</div>
            <div className="qb-stat-label">Challenged</div>
          </div>
        </div>
        <div className="qb-stat-tile" onClick={() => setFilterStatus('NOSOLUTION')}>
          <div className="qb-stat-icon nosolution"><Icon className="ti ti-book" /></div>
          <div className="qb-stat-body">
            <div className="qb-stat-value">{stats.withoutSolution}</div>
            <div className="qb-stat-label">Without Solution</div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="filter-bar">
        <div className="search-wrapper">
          <Icon
            className={`ti ${searchText ? 'ti-close' : 'ti-search'}`}
            onClick={() => { setSearchText(''); setCurrentPage(1); }}
            style={{ cursor: searchText ? 'pointer' : 'default' }} />
          <input
            type="text"
            className="search-input"
            placeholder="Search question ID or chapter..."
            value={searchText}
            onChange={(e) => { setSearchText(e.target.value); setCurrentPage(1); }}
          />
        </div>

        <FilterDropdown
          label="All Subjects"
          options={subjectOptions}
          value={filterSubject}
          onChange={(v) => { setFilterSubject(v); setFilterChapter(''); setCurrentPage(1); }}
        />

        {filterSubject && (
          <FilterDropdown
            label="All Chapters"
            options={chapterOptions}
            value={filterChapter}
            onChange={(v) => { setFilterChapter(v); setCurrentPage(1); }}
            maxHeight="350px"
          />
        )}

        <FilterDropdown
          label="All Questions"
          options={statusOptions}
          value={filterStatus}
          onChange={(v) => { setFilterStatus(v); setCurrentPage(1); }}
        />
      </div>

      {/* Table */}
      <div className="students-table-container">
        <table className={`students-table ${isLoading ? 'thead-loading' : ''}`}>
          <thead>
            <tr>
              <th className="sortable" onClick={() => handleSort('id')}>
                Question ID <SortIcon col="id" />
              </th>
              <th>Display Key</th>
              <th className="sortable" onClick={() => handleSort('subject')}>
                Subject <SortIcon col="subject" />
              </th>
              <th className="sortable" onClick={() => handleSort('chapter')}>
                Chapter <SortIcon col="chapter" />
              </th>
              <th className="sortable" onClick={() => handleSort('level')}>
                Level <SortIcon col="level" />
              </th>
              <th></th>
              <th>Actions</th>
            </tr>
          </thead>

          {isLoading ? (
            <tbody>
              {skeletonRows.map((_, i) => (
                <tr key={`skel-${i}`}>
                  <td>
                    <div className="qb-skeleton medium" style={{ marginBottom: 5 }}><div className="qb-skeleton-shimmer" /></div>
                    <div className="qb-skeleton short" style={{ height: 12 }}><div className="qb-skeleton-shimmer" /></div>
                  </td>
                  <td><div className="qb-skeleton medium"><div className="qb-skeleton-shimmer" /></div></td>
                  <td><div className="qb-skeleton short"><div className="qb-skeleton-shimmer" /></div></td>
                  <td><div className="qb-skeleton long"><div className="qb-skeleton-shimmer" /></div></td>
                  <td><div className="qb-skeleton badge"><div className="qb-skeleton-shimmer" /></div></td>
                  <td><div className="qb-skeleton short"><div className="qb-skeleton-shimmer" /></div></td>
                  <td><div className="qb-skeleton short"><div className="qb-skeleton-shimmer" /></div></td>
                </tr>
              ))}
            </tbody>
          ) : (
            <tbody>
              {paginatedQuestions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="qb-empty-cell">No questions found matching your filters.</td>
                </tr>
              ) : paginatedQuestions.map((q) => (
                <tr
                  key={q.id}
                  onClick={() => setViewQuestion(q)}
                  style={{ cursor: 'pointer' }}
                >
                  {/* Question ID + status icons */}
                  <td>
                    <div className="profile-name">{q.id}</div>
                    <div className="qb-id-icons">
                      {q.verified && <Icon className="ti ti-check qb-icon-verified" title="Verified" />}
                      {q.hasSolution && <Icon className="ti ti-book qb-icon-solution" title="Solution Added" />}
                      {q.challenged && <Icon className="ti ti-alert qb-icon-challenged" title="Challenged" />}
                      <span
                        className="qb-copy-icon"
                        title="Copy ID"
                        onClick={(e) => { e.stopPropagation(); handleCopy(String(q.id)); }}
                      >
                        <Icon className="ti ti-files" />
                      </span>
                    </div>
                  </td>
                  {/* Display Key */}
                  <td>
                    <div className="profile-subtext" style={{ fontSize: 13 }}>{q.displayKey}</div>
                    <span
                      className="qb-copy-icon"
                      title="Copy Key"
                      onClick={(e) => { e.stopPropagation(); handleCopy(q.displayKey); }}
                    >
                      <Icon className="ti ti-files" />
                    </span>
                  </td>
                  {/* Subject badge */}
                  <td><span className="crispr-badge">{q.subject}</span></td>
                  {/* Chapter */}
                  <td className="profile-subtext">{q.chapter}</td>
                  {/* Level */}
                  <td>
                    <span className={`crispr-status ${q.level === 'Easy' ? 'active' : q.level === 'Medium' ? 'pending' : 'inactive'}`}>
                      {q.level}
                    </span>
                  </td>
                  {/* PYQ label */}
                  <td>
                    <span className="qb-pyq-label">{getPYQLabel(q)}</span>
                  </td>
                  {/* Actions */}
                  <td onClick={(e) => e.stopPropagation()}>
                    <KebabMenu
                      question={q}
                      onView={() => setViewQuestion(q)}
                      onEdit={() => setEditQuestion(q)}
                      onToggleVerify={() => handleToggleVerify(q)}
                      onToggleChallenge={() => handleToggleChallenge(q)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          )}
        </table>

        {/* Pagination */}
        {!isLoading && filteredQuestions.length > 0 && (
          <div className="pagination-container">
            <div className="pagination-info">
              <span>
                Showing {startIdx + 1} to {Math.min(startIdx + pageSize, filteredQuestions.length)} of {filteredQuestions.length} questions
              </span>
              <select
                className="page-size-select"
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
              >
                {[10, 20, 50, 200].map((s) => <option key={s} value={s}>Show {s}</option>)}
              </select>
            </div>
            <div className="pagination-controls">
              <button
                type="button"
                className="pagination-btn"
                disabled={safePage === 1}
                onClick={() => goToPage(safePage - 1)}
              >
                <Icon className="ti ti-angle-left" /> Previous
              </button>
              {pageNumbers().map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`pagination-btn${p === safePage ? ' active' : ''}`}
                  onClick={() => goToPage(p)}
                >
                  {p}
                </button>
              ))}
              <button
                type="button"
                className="pagination-btn"
                disabled={safePage === totalPages}
                onClick={() => goToPage(safePage + 1)}
              >
                Next <Icon className="ti ti-angle-right" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* View Modal */}
      {viewQuestion && (
        <ViewModal
          question={viewQuestion}
          onClose={() => setViewQuestion(null)}
          onEdit={() => setEditQuestion(viewQuestion)}
        />
      )}

      {/* Edit Modal */}
      {editQuestion && (
        <EditModal
          question={editQuestion}
          onClose={() => setEditQuestion(null)}
          onSave={handleSaveEdit}
        />
      )}
    </section>
  );
}
