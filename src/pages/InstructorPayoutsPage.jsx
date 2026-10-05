import React, { useState, useMemo, useEffect } from 'react';
import ToastRegion from '../components/ToastRegion';
import Icon from '../components/Icon';

function getPageNumbers(currentPage, totalPages) {
  const pages = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else if (currentPage <= 4) {
    for (let i = 1; i <= 5; i++) pages.push(i);
    pages.push('...');
    pages.push(totalPages);
  } else if (currentPage >= totalPages - 3) {
    pages.push(1);
    pages.push('...');
    for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    pages.push('...');
    for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
    pages.push('...');
    pages.push(totalPages);
  }
  return pages;
}

const ledgerMock = {
  'I-001': [
    { id: 1, date: '2 April 2026', type: 'WORK', description: 'Chapter 2', hours: '5 hours', amount: 5000 },
    { id: 2, date: '4 April 2026', type: 'WORK', description: 'Chapter 1', hours: '2 hours', amount: 2000 },
    { id: 3, date: '10 April 2026', type: 'PAYMENT', description: 'Payment via Bank Transfer', hours: '-', amount: -6000 },
    { id: 4, date: '13 April 2026', type: 'WORK', description: 'Chapter 5', hours: '6 hours', amount: 6000 },
  ],
  'I-002': [
    { id: 1, date: '1 April 2026', type: 'WORK', description: 'Organic Chem Overview', hours: '4 hours', amount: 6000 },
    { id: 2, date: '10 April 2026', type: 'PAYMENT', description: 'Payment via Cheque', hours: '-', amount: -3000 },
  ],
  'I-003': [
    { id: 1, date: '5 April 2026', type: 'WORK', description: 'Calculus Advanced', hours: '12 hours', amount: 10800 },
  ]
};

const initialSummaries = [
  { id: 'I-001', name: 'Dr. Arjun Mehta', specialization: 'Physics' },
  { id: 'I-002', name: 'Dr. Divya Krishnan', specialization: 'Chemistry' },
  { id: 'I-003', name: 'Prof. Sneha Menon', specialization: 'Mathematics' },
];

export default function InstructorPayoutsPage() {
  const [toasts, setToasts] = useState([]);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const t = window.setTimeout(() => setIsLoading(false), 700);
    return () => window.clearTimeout(t);
  }, []);

  // Modals
  const [ledgerModalOpen, setLedgerModalOpen] = useState(false);
  const [selectedInstructorId, setSelectedInstructorId] = useState(null);
  
  const [makePaymentModalOpen, setMakePaymentModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDesc, setPaymentDesc] = useState('');

  const [recordHoursModalOpen, setRecordHoursModalOpen] = useState(false);
  const [hoursDesc, setHoursDesc] = useState('');
  const [hoursWorked, setHoursWorked] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');

  const [activeDropdown, setActiveDropdown] = useState(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = () => setActiveDropdown(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const [ledgerData, setLedgerData] = useState(ledgerMock);

  // Calculate dynamic summaries combining FIFO logic
  const instructorSummaries = useMemo(() => {
    return initialSummaries.map(instructor => {
        const records = ledgerData[instructor.id] || [];
        let earnings = 0;
        let paid = 0;
        records.forEach(r => {
            if (r.type === 'WORK') earnings += r.amount;
            if (r.type === 'PAYMENT') paid += Math.abs(r.amount);
        });
        return {
            ...instructor,
            totalEarnings: earnings,
            totalPaid: paid,
            balanceDue: earnings - paid
        };
    });
  }, [ledgerData]);

  const filteredSummaries = useMemo(() => {
    if (!searchQuery) return instructorSummaries;
    const lower = searchQuery.toLowerCase();
    return instructorSummaries.filter(i => i.name.toLowerCase().includes(lower) || i.specialization.toLowerCase().includes(lower));
  }, [instructorSummaries, searchQuery]);

  const totalPages = Math.ceil(filteredSummaries.length / rowsPerPage) || 1;
  const paginatedSummaries = filteredSummaries.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  function showToast(type, title, message) {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, type, title, message }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4000);
  }

  const handleKebabClick = (e, index) => {
      e.stopPropagation();
      setActiveDropdown(activeDropdown === index ? null : index);
  };

  const openLedgerModal = (instructorId) => {
      setSelectedInstructorId(instructorId);
      setLedgerModalOpen(true);
      setActiveDropdown(null);
  };
  
  const openPaymentModal = (instructorId) => {
      setSelectedInstructorId(instructorId);
      setMakePaymentModalOpen(true);
      setActiveDropdown(null);
  };

  const openRecordHoursModal = (instructorId) => {
      setSelectedInstructorId(instructorId);
      setRecordHoursModalOpen(true);
      setActiveDropdown(null);
  };

  const processLedgerWithFifo = (records) => {
      // Create a copy to track unpaid balances of WORK entries
      let workEntries = records.filter(r => r.type === 'WORK').map(r => ({ ...r, unpaid: r.amount }));
      let totalPayments = records.filter(r => r.type === 'PAYMENT').reduce((acc, r) => acc + Math.abs(r.amount), 0);
      
      // FIFO allocation
      for (let i = 0; i < workEntries.length; i++) {
          if (totalPayments <= 0) break;
          if (totalPayments >= workEntries[i].unpaid) {
              totalPayments -= workEntries[i].unpaid;
              workEntries[i].unpaid = 0;
              workEntries[i].fifoStatus = 'Settled';
          } else {
              workEntries[i].unpaid -= totalPayments;
              totalPayments = 0;
              workEntries[i].fifoStatus = 'Partial';
          }
      }
      
      workEntries.forEach(w => {
          if (w.unpaid === w.amount) {
              w.fifoStatus = 'Unpaid';
          }
      });

      // Merge back
      return records.map(r => {
          if (r.type === 'PAYMENT') return { ...r, status: '' };
          const processedWork = workEntries.find(w => w.id === r.id);
          return { ...r, status: processedWork.fifoStatus };
      });
  };

  const selectedLedgerWithFifo = useMemo(() => {
     if (!selectedInstructorId) return [];
     const records = ledgerData[selectedInstructorId] || [];
     return processLedgerWithFifo(records);
  }, [ledgerData, selectedInstructorId]);

  const selectedInstructorInfo = useMemo(() => {
     if (!selectedInstructorId) return null;
     return instructorSummaries.find(i => i.id === selectedInstructorId);
  }, [instructorSummaries, selectedInstructorId]);

  const handleMakePayment = (e) => {
      e.preventDefault();
      if (!paymentAmount || Number(paymentAmount) <= 0) return;
      
      const newEntry = {
          id: Date.now(),
          date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
          type: 'PAYMENT',
          description: paymentDesc || 'Payment via Portal',
          hours: '-',
          amount: -Math.abs(Number(paymentAmount))
      };

      setLedgerData(prev => ({
          ...prev,
          [selectedInstructorId]: [...(prev[selectedInstructorId] || []), newEntry]
      }));

      setMakePaymentModalOpen(false);
      setPaymentAmount('');
      setPaymentDesc('');
      showToast('success', 'Payment Recorded', `Payment of Rs. ${paymentAmount} has been recorded.`);
  };

  const handleRecordHours = (e) => {
      e.preventDefault();
      const hours = Number(hoursWorked);
      const rate = Number(hourlyRate);
      if (!hoursDesc.trim() || !hours || hours <= 0 || !rate || rate <= 0) return;

      const amount = Math.round(hours * rate);
      const newEntry = {
          id: Date.now(),
          date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
          type: 'WORK',
          description: hoursDesc.trim(),
          hours: `${hours} ${hours === 1 ? 'hour' : 'hours'}`,
          amount
      };

      setLedgerData(prev => ({
          ...prev,
          [selectedInstructorId]: [...(prev[selectedInstructorId] || []), newEntry]
      }));

      setRecordHoursModalOpen(false);
      setHoursDesc('');
      setHoursWorked('');
      setHourlyRate('');
      showToast('success', 'Hours Recorded', `${hours} ${hours === 1 ? 'hour' : 'hours'} (Rs. ${amount.toLocaleString()}) added.`);
  };

  return (
    <div className="container-fluid data-table-page" style={{ paddingTop: '1%' }}>
        <ToastRegion toasts={toasts} onDismiss={(id) => setToasts((c) => c.filter((t) => t.id !== id))} />

        {/* ── Standard Page Header ── */}
        <div className="page-header-section">
            <div className="page-header-title-group">
               <span className="page-header-icon-box"><Icon className="fa fa-money" /></span>
               <div>
                  <h2>Instructor Payouts</h2>
                  <p>Track payments made and pending settlements for instructors.</p>
               </div>
            </div>
        </div>

        {/* ── Search bar (standard) ── */}
        <div className="filter-bar">
            <div className="search-wrapper">
                <Icon className={`ti ${searchQuery ? 'ti-close' : 'ti-search'} search-icon`} onClick={() => setSearchQuery('')} aria-hidden="true" />
                <input
                    type="text"
                    className="search-input"
                    placeholder="Search instructor..."
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                />
            </div>
        </div>

        {/* ── Table ── */}
        <div className="students-table-container">
            <table className={`students-table ${isLoading ? 'thead-loading' : ''}`}>
                <thead>
                    <tr>
                        <th>Instructor</th>
                        <th>Total Earnings</th>
                        <th>Total Paid</th>
                        <th>Balance Due</th>
                        <th style={{ textAlign: 'center', width: '100px' }}>Actions</th>
                    </tr>
                </thead>
                {isLoading ? (
                <tbody>
                    {Array.from({ length: 8 }, (_, i) => (
                        <tr key={`sk-${i}`}>
                            {Array.from({ length: 5 }, (_, j) => (
                                <td key={j}><div className="table-skeleton medium" /></td>
                            ))}
                        </tr>
                    ))}
                </tbody>
                ) : (
                <tbody>
                    {paginatedSummaries.map((inst, index) => (
                        <tr key={inst.id}>
                            <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#e0f2f1', color: '#006073', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: '16px' }}>
                                         {inst.name.charAt(4)}
                                    </div>
                                    <div>
                                        <button
                                            type="button"
                                            className="name-link"
                                            title="View details"
                                            style={{ display: 'block', fontSize: '15px' }}
                                            onClick={(e) => { e.stopPropagation(); openLedgerModal(inst.id); }}
                                        >
                                            {inst.name}
                                        </button>
                                        <span style={{ fontSize: '12px', color: '#6b7280' }}>{inst.specialization}</span>
                                    </div>
                                </div>
                            </td>
                            <td style={{ fontWeight: 500, color: '#4b5563' }}>Rs. {inst.totalEarnings.toLocaleString()}</td>
                            <td style={{ fontWeight: 500, color: '#10b981' }}>Rs. {inst.totalPaid.toLocaleString()}</td>
                            <td>
                                <span style={{ display: 'inline-block', padding: '6px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: 600, background: inst.balanceDue > 0 ? '#fff3cd' : '#d4edda', color: inst.balanceDue > 0 ? '#856404' : '#155724' }}>
                                    Rs. {inst.balanceDue.toLocaleString()} {inst.balanceDue > 0 ? 'due' : 'cleared'}
                                </span>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                                <div className="kebab-menu-container">
                                    <button type="button" className="kebab-button" onClick={(e) => handleKebabClick(e, index)}>
                                        <Icon className="ti ti-more-alt" />
                                    </button>
                                    <div className={`kebab-dropdown${activeDropdown === index ? ' active' : ''}`} onClick={e => e.stopPropagation()}>
                                        <button type="button" className="kebab-dropdown-item" onClick={() => openLedgerModal(inst.id)}>
                                            <Icon className="ti ti-eye" /> View Details
                                        </button>
                                        <button type="button" className="kebab-dropdown-item" onClick={() => openRecordHoursModal(inst.id)}>
                                            <Icon className="ti ti-time" /> Record Hours
                                        </button>
                                        <button type="button" className="kebab-dropdown-item" onClick={() => openPaymentModal(inst.id)}>
                                            <Icon className="ti ti-money" /> Record Payment
                                        </button>
                                    </div>
                                </div>
                            </td>
                        </tr>
                    ))}
                    {paginatedSummaries.length === 0 && (
                        <tr><td colSpan="5" style={{ textAlign: 'center', padding: '30px', color: '#6b7280' }}>No instructors found matching query.</td></tr>
                    )}
                </tbody>
                )}
            </table>

            {/* Pagination */}
            {filteredSummaries.length > 0 && (
                <div className="pagination-container">
                    <div className="pagination-info">
                        <span>Showing {(currentPage - 1) * rowsPerPage + 1} to {Math.min(currentPage * rowsPerPage, filteredSummaries.length)} of {filteredSummaries.length} entries</span>
                        <select
                            className="page-size-select"
                            value={rowsPerPage}
                            onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                        >
                            {[10, 20, 50, 100].map((size) => <option key={size} value={size}>Show {size}</option>)}
                        </select>
                    </div>
                    <div className="pagination-controls">
                        <button type="button" className="pagination-btn" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                            <Icon className="ti ti-angle-left" /> Previous
                        </button>
                        {getPageNumbers(currentPage, totalPages).map((page, idx) => (
                            page === '...'
                                ? <span key={`ellipsis-${idx}`} className="pagination-ellipsis">...</span>
                                : <button key={page} type="button" className={`pagination-btn ${currentPage === page ? 'active' : ''}`} onClick={() => setCurrentPage(page)}>{page}</button>
                        ))}
                        <button type="button" className="pagination-btn" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}>
                            Next <Icon className="ti ti-angle-right" />
                        </button>
                    </div>
                </div>
            )}
        </div>

        {/* Ledger Detailed Modal */}
        {ledgerModalOpen && selectedInstructorInfo && (
            <div className="crispr-modal-backdrop active" onClick={() => setLedgerModalOpen(false)}>
                <div className="crispr-modal-dialog" style={{ maxWidth: '900px', width: '100%' }} onClick={e => e.stopPropagation()}>
                    <div className="crispr-modal-header">
                        <h3><Icon className="ti ti-agenda" /> Payout Ledger: {selectedInstructorInfo.name}</h3>
                        <button type="button" className="crispr-modal-close" onClick={() => setLedgerModalOpen(false)}>
                            <Icon className="ti ti-close" />
                        </button>
                    </div>

                    <div className="crispr-modal-body">
                        <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
                             <div style={{ flex: 1, background: 'white', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                 <div style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Total Earnings</div>
                                 <div style={{ fontSize: '24px', fontWeight: 700, color: '#1e293b' }}>Rs. {selectedInstructorInfo.totalEarnings.toLocaleString()}</div>
                             </div>
                             <div style={{ flex: 1, background: 'white', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                 <div style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Total Paid out</div>
                                 <div style={{ fontSize: '24px', fontWeight: 700, color: '#10b981' }}>Rs. {selectedInstructorInfo.totalPaid.toLocaleString()}</div>
                             </div>
                             <div style={{ flex: 1, background: 'white', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                 <div style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Current Balance Due</div>
                                 <div style={{ fontSize: '24px', fontWeight: 700, color: selectedInstructorInfo.balanceDue > 0 ? '#f59e0b' : '#333' }}>Rs. {selectedInstructorInfo.balanceDue.toLocaleString()}</div>
                             </div>
                        </div>

                        <div className="students-table-container">
                            <table className="students-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Description</th>
                                        <th>Hours</th>
                                        <th style={{ textAlign: 'right' }}>Amount</th>
                                        <th style={{ textAlign: 'center' }}>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {selectedLedgerWithFifo.map((r, i) => (
                                        <tr key={i} style={{ background: r.type === 'PAYMENT' ? '#f0fdfa' : 'white' }}>
                                            <td style={{ color: '#334155' }}>{r.date}</td>
                                            <td style={{ color: r.type === 'PAYMENT' ? '#0f766e' : '#334155', fontWeight: r.type === 'PAYMENT' ? 600 : 400 }}>
                                                 {r.type === 'PAYMENT' && <Icon className="ti ti-money" style={{ marginRight: '5px' }} />}
                                                 {r.description}
                                            </td>
                                            <td style={{ color: '#64748b' }}>{r.hours}</td>
                                            <td style={{ color: '#0f172a', textAlign: 'right', fontWeight: 500 }}>
                                                {r.amount > 0 ? `+ Rs. ${r.amount}` : `- Rs. ${Math.abs(r.amount)}`}
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                {r.type === 'WORK' && r.status && (
                                                    <span style={{ 
                                                        display: 'inline-block', padding: '4px 10px', borderRadius: '4px', fontSize: '12px', fontWeight: 600,
                                                        background: r.status === 'Settled' ? '#dcfce7' : r.status === 'Partial' ? '#fef9c3' : '#fee2e2',
                                                        color: r.status === 'Settled' ? '#166534' : r.status === 'Partial' ? '#854d0e' : '#991b1b'
                                                    }}>
                                                        {r.status}
                                                    </span>
                                                )}
                                                {r.type === 'PAYMENT' && (
                                                    <span style={{ display: 'inline-block', padding: '4px 10px', borderRadius: '4px', fontSize: '12px', fontWeight: 600, background: '#e0f2fe', color: '#0369a1' }}>
                                                        Payment
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div className="crispr-modal-footer">
                        <button type="button" className="btn btn-default" onClick={() => setLedgerModalOpen(false)}>Close Ledger</button>
                        <button type="button" className="btn btn-default" onClick={() => { setLedgerModalOpen(false); openRecordHoursModal(selectedInstructorInfo.id); }}>
                             <Icon className="ti ti-time" /> Record Hours
                        </button>
                        <button type="button" className="btn btn-success" onClick={() => { setLedgerModalOpen(false); openPaymentModal(selectedInstructorInfo.id); }}>
                             <Icon className="ti ti-plus" /> Record New Payment
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Make Payment Modal */}
        {makePaymentModalOpen && selectedInstructorInfo && (
            <div className="crispr-modal-backdrop active" onClick={() => setMakePaymentModalOpen(false)}>
                <div className="crispr-modal-dialog" style={{ maxWidth: '450px' }} onClick={e => e.stopPropagation()}>
                    <div className="crispr-modal-header" style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: 'white' }}>
                        <h3 style={{ margin: 0, fontWeight: 600 }}><Icon className="ti ti-money" /> Record Payment</h3>
                        <button className="crispr-modal-close" style={{ color: 'white' }} onClick={() => setMakePaymentModalOpen(false)}>
                            <Icon className="ti ti-close" />
                        </button>
                    </div>
                    <form onSubmit={handleMakePayment}>
                        <div className="crispr-modal-body" style={{ padding: '25px' }}>
                            <div style={{ marginBottom: '20px', textAlign: 'center' }}>
                                <p style={{ margin: '0 0 5px 0', color: '#6b7280' }}>Recording payment for</p>
                                <h4 style={{ margin: 0, color: '#111827', fontSize: '18px', fontWeight: 700 }}>{selectedInstructorInfo.name}</h4>
                                <p style={{ margin: '5px 0 0 0', color: selectedInstructorInfo.balanceDue > 0 ? '#d97706' : '#10b981', fontWeight: 600 }}>Due Balance: Rs. {selectedInstructorInfo.balanceDue.toLocaleString()}</p>
                            </div>

                            <div style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>Amount to Pay (Rs.) *</label>
                                <input type="number" required min="1" max={selectedInstructorInfo.balanceDue + 5000} value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '15px' }} placeholder="e.g. 5000" />
                            </div>

                            <div style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>Description / Reference</label>
                                <input type="text" value={paymentDesc} onChange={e => setPaymentDesc(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '15px' }} placeholder="Payment via Bank Account / Txn ID" />
                            </div>
                        </div>
                        <div className="crispr-modal-footer">
                            <button type="button" className="btn btn-default" onClick={() => setMakePaymentModalOpen(false)}>Cancel</button>
                            <button type="submit" style={{ background: '#10b981', color: 'white', border: 'none', padding: '8px 20px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>
                                Confirm Payment
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        )}

        {/* Record Hours Modal */}
        {recordHoursModalOpen && selectedInstructorInfo && (
            <div className="crispr-modal-backdrop active" onClick={() => setRecordHoursModalOpen(false)}>
                <div className="crispr-modal-dialog" style={{ maxWidth: '450px' }} onClick={e => e.stopPropagation()}>
                    <div className="crispr-modal-header" style={{ background: 'linear-gradient(135deg, #006073 0%, #00424f 100%)', color: 'white' }}>
                        <h3 style={{ margin: 0, fontWeight: 600 }}><Icon className="ti ti-time" /> Record Hours</h3>
                        <button className="crispr-modal-close" style={{ color: 'white' }} onClick={() => setRecordHoursModalOpen(false)}>
                            <Icon className="ti ti-close" />
                        </button>
                    </div>
                    <form onSubmit={handleRecordHours}>
                        <div className="crispr-modal-body" style={{ padding: '25px' }}>
                            <div style={{ marginBottom: '20px', textAlign: 'center' }}>
                                <p style={{ margin: '0 0 5px 0', color: '#6b7280' }}>Logging work for</p>
                                <h4 style={{ margin: 0, color: '#111827', fontSize: '18px', fontWeight: 700 }}>{selectedInstructorInfo.name}</h4>
                                <p style={{ margin: '5px 0 0 0', color: '#6b7280', fontWeight: 600 }}>{selectedInstructorInfo.specialization}</p>
                            </div>

                            <div style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>Description *</label>
                                <input type="text" required value={hoursDesc} onChange={e => setHoursDesc(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '15px' }} placeholder="e.g. Chapter 3 — Thermodynamics" />
                            </div>

                            <div style={{ display: 'flex', gap: '12px', marginBottom: '15px' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>Hours *</label>
                                    <input type="number" required min="0.5" step="0.5" value={hoursWorked} onChange={e => setHoursWorked(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '15px' }} placeholder="e.g. 5" />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>Rate / hr (Rs.) *</label>
                                    <input type="number" required min="1" value={hourlyRate} onChange={e => setHourlyRate(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '15px' }} placeholder="e.g. 1000" />
                                </div>
                            </div>

                            {hoursWorked && hourlyRate && Number(hoursWorked) > 0 && Number(hourlyRate) > 0 && (
                                <div style={{ background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: '6px', padding: '12px 15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ color: '#0f766e', fontWeight: 600 }}>Amount to add</span>
                                    <span style={{ color: '#0f172a', fontWeight: 700, fontSize: '18px' }}>Rs. {Math.round(Number(hoursWorked) * Number(hourlyRate)).toLocaleString()}</span>
                                </div>
                            )}
                        </div>
                        <div className="crispr-modal-footer">
                            <button type="button" className="btn btn-default" onClick={() => setRecordHoursModalOpen(false)}>Cancel</button>
                            <button type="submit" style={{ background: '#006073', color: 'white', border: 'none', padding: '8px 20px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>
                                Record Hours
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        )}

        <style>
        {`
            .po-tr-hover:hover {
                background-color: #f8f9fa;
            }
            .po-dp-hover:hover {
                background-color: #f3f4f6;
            }
            .table-button {
                padding: 6px 12px;
                background: white;
                border: 1px solid #d1d5db;
                border-radius: 4px;
                color: #4b5563;
                cursor: pointer;
                transition: all 0.2s;
            }
            .table-button:hover {
                background: #f3f4f6;
            }
        `}
        </style>
    </div>
  );
}
