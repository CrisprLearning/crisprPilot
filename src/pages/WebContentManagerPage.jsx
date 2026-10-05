import React, { useState, useMemo, useEffect, useRef } from 'react';
import ToastRegion from '../components/ToastRegion';
import { vouchersDemo, autoEnrollCoursesDemo, catalogItemsDemo } from '../data/adminRemainingDemo';
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

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDateLabel(value) {
  if (!value) return '';
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return '';
  return `${day} ${MONTH_LABELS[month - 1]}, ${year}`;
}

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

function VoucherKebabMenu({ voucher, onViewUsers, onRevoke }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const canViewUsers = voucher.limitedUsers;
  const canRevoke = voucher.status === 'active';

  return (
    <div className="kebab-menu-container" ref={ref}>
      <button
        type="button"
        className="kebab-button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
      >
        <Icon className="ti ti-more-alt" />
      </button>
      <div className={`kebab-dropdown${open ? ' active' : ''}`}>
        {canViewUsers && (
          <button type="button" className="kebab-dropdown-item" onClick={() => { setOpen(false); onViewUsers(voucher); }}>
            <Icon className="ti ti-user" /> View Users
          </button>
        )}
        {canRevoke && (
          <button type="button" className="kebab-dropdown-item danger-action" onClick={() => { setOpen(false); onRevoke(voucher); }}>
            <Icon className="ti ti-ban" /> Revoke Code
          </button>
        )}
        {!canViewUsers && !canRevoke && (
          <span className="kebab-dropdown-item" style={{ color: '#94a3b8', cursor: 'default' }}>
            No actions available
          </span>
        )}
      </div>
    </div>
  );
}

export default function WebContentManagerPage() {
  const [toasts, setToasts] = useState([]);
  
  // States
  const [vouchers, setVouchers] = useState(vouchersDemo);
  const [autoEnrollCourses, setAutoEnrollCourses] = useState(autoEnrollCoursesDemo);
  const [discountStatusFilter, setDiscountStatusFilter] = useState('all');
  
  // Discount Pagination
  const [discountPage, setDiscountPage] = useState(1);
  const [discountsPerPage, setDiscountsPerPage] = useState(20);

  // Modals
  const [enrollModalOpen, setEnrollModalOpen] = useState(false);
  const [courseSearch, setCourseSearch] = useState('');
  const [selectedCourses, setSelectedCourses] = useState([...autoEnrollCourses]);

  const [discountModalOpen, setDiscountModalOpen] = useState(false);
  const [newDiscount, setNewDiscount] = useState({ code: '', type: 'percentage', value: '', validUntil: '', limitUsers: false });

  // User selection for limited discount codes
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [selectedUsers, setSelectedUsers] = useState([]);
  const sampleUsers = [
    { id: 'U001', name: 'Aarav Nair', phone: '9876500001', email: 'aarav@test.com' },
    { id: 'U002', name: 'Diya Joseph', phone: '9876500002', email: 'diya@test.com' },
    { id: 'U003', name: 'Sneha Menon', phone: '9876500003', email: 'sneha@test.com' },
    { id: 'U004', name: 'Rahul Prasad', phone: '9876500004', email: 'rahul@test.com' },
    { id: 'U005', name: 'Amit Patel', phone: '9876500005', email: 'amit@test.com' },
  ];
  const filteredUsers = useMemo(() => {
    if (!userSearchQuery) return [];
    const q = userSearchQuery.toLowerCase();
    return sampleUsers.filter(u => !selectedUsers.some(s => s.id === u.id) && (u.name.toLowerCase().includes(q) || u.phone.includes(q) || u.email.toLowerCase().includes(q)));
  }, [userSearchQuery, selectedUsers]);
  
  const [viewUsersModalOpen, setViewUsersModalOpen] = useState(false);
  const [selectedVoucherForUsers, setSelectedVoucherForUsers] = useState(null);
  const [voucherUserSearch, setVoucherUserSearch] = useState('');
  const [voucherUserPage, setVoucherUserPage] = useState(1);
  const voucherUsersPerPage = 10;
  
  const [revokeModalOpen, setRevokeModalOpen] = useState(false);
  const [voucherToRevoke, setVoucherToRevoke] = useState(null);

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const t = window.setTimeout(() => setIsLoading(false), 700);
    return () => window.clearTimeout(t);
  }, []);

  function showToast(type, title, message) {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, type, title, message }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4000);
  }

  // Auto-Enrollment Logic
  const handleCourseSelectionToggle = (course) => {
    const isSelected = selectedCourses.some(c => c.code === course.code);
    if (isSelected) {
      setSelectedCourses(selectedCourses.filter(c => c.code !== course.code));
    } else {
      setSelectedCourses([...selectedCourses, course]);
    }
  };

  const saveAutoEnrollCourses = () => {
    setAutoEnrollCourses([...selectedCourses]);
    showToast('success', 'Saved', 'Auto-enrollment courses saved successfully.');
  };

  const filteredCatalogForEnrollment = useMemo(() => {
    if (!courseSearch) return catalogItemsDemo;
    return catalogItemsDemo.filter(c => c.title.toLowerCase().includes(courseSearch.toLowerCase()) || c.code.toLowerCase().includes(courseSearch.toLowerCase()));
  }, [courseSearch]);

  // Discount Logic
  const filteredVouchers = useMemo(() => {
    let result = vouchers;
    if (discountStatusFilter === 'active') {
      result = result.filter(v => v.status === 'active');
    }
    return result;
  }, [vouchers, discountStatusFilter]);

  const totalDiscountPages = Math.ceil(filteredVouchers.length / discountsPerPage) || 1;
  const paginatedVouchers = filteredVouchers.slice((discountPage - 1) * discountsPerPage, discountPage * discountsPerPage);

  const handleCreateDiscount = (e) => {
    e.preventDefault();
    if (!newDiscount.code || !newDiscount.value || !newDiscount.validUntil) {
       showToast('error', 'Error', 'Please fill all required fields');
       return;
    }
    const created = {
      id: 'VOC-' + Date.now(),
      code: newDiscount.code.toUpperCase(),
      title: 'Custom Discount',
      amountType: newDiscount.type,
      amount: Number(newDiscount.value),
      status: 'active',
      validUntil: newDiscount.validUntil,
      limitedUsers: newDiscount.limitUsers,
      users: []
    };
    setVouchers([created, ...vouchers]);
    setDiscountModalOpen(false);
    showToast('success', 'Created', 'New discount code added.');
  };

  const handleRevokeConfirm = () => {
    setVouchers(vouchers.map(v => v.id === voucherToRevoke.id ? { ...v, status: 'revoked' } : v));
    setRevokeModalOpen(false);
    showToast('success', 'Revoked', 'Discount code has been revoked.');
  };

  const openViewUsers = (voucher) => {
    setSelectedVoucherForUsers(voucher);
    setVoucherUserSearch('');
    setVoucherUserPage(1);
    setViewUsersModalOpen(true);
  };

  // Voucher users: search + pagination
  const voucherUsersAll = selectedVoucherForUsers?.users || [];
  const filteredVoucherUsers = useMemo(() => {
    const q = voucherUserSearch.trim().toLowerCase();
    if (!q) return voucherUsersAll;
    return voucherUsersAll.filter(u =>
      (u.name || '').toLowerCase().includes(q) || (u.phone || '').toLowerCase().includes(q)
    );
  }, [voucherUsersAll, voucherUserSearch]);
  const totalVoucherUserPages = Math.ceil(filteredVoucherUsers.length / voucherUsersPerPage) || 1;
  const paginatedVoucherUsers = filteredVoucherUsers.slice(
    (voucherUserPage - 1) * voucherUsersPerPage,
    voucherUserPage * voucherUsersPerPage
  );

  return (
    <div className="container-fluid data-table-page" style={{ paddingTop: '1%' }}>
        <ToastRegion toasts={toasts} onDismiss={(id) => setToasts((c) => c.filter((t) => t.id !== id))} />

        {/* Auto-Enrollment Section */}
        <div className="wcm-section-card">
            <div className="wcm-section-header">
                <h2 className="wcm-section-title"><Icon className="ti ti-user" style={{ marginRight: '10px' }} />New User Auto-Enrollment</h2>
                <button className="wcm-btn wcm-btn-primary-custom" onClick={saveAutoEnrollCourses}>
                    <Icon className="ti ti-save" /> Save Changes
                </button>
            </div>

            <div className="wcm-form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <label style={{ fontWeight: 600, color: '#4b5563', margin: 0 }}>Selected Courses</label>
                    <button className="wcm-btn wcm-btn-default" style={{ border: '1px solid #d1d5db', color: '#4b5563' }} onClick={() => setEnrollModalOpen(true)}>
                        <Icon className="ti ti-plus" /> Select Courses
                    </button>
                </div>

                <div className="wcm-course-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(30%, 1fr))' }}>
                    {autoEnrollCourses.length > 0 ? autoEnrollCourses.map(course => (
                       <div key={course.code} className="wcm-course-card" style={{ cursor: 'default', borderColor: '#006073', background: '#e5faff' }}>
                           <div className="wcm-course-icon" style={{ background: '#006073', color: 'white' }}><Icon className="ti ti-book" /></div>
                           <div>
                               <strong>{course.title || course.code}</strong>
                               <div style={{ fontSize: '12px', color: '#666' }}>{course.code}</div>
                           </div>
                       </div>
                    )) : (
                       <div style={{ padding: '30px', background: '#f9fafb', borderRadius: '8px', border: '1px dashed #d1d5db', color: '#6b7280', textAlign: 'center', gridColumn: '1 / -1' }}>
                           <Icon className="ti ti-book" style={{ fontSize: '24px', marginBottom: '10px', display: 'block' }} />
                           No courses selected for auto-enrollment.
                       </div>
                    )}
                </div>
            </div>
        </div>

        {/* Discount Codes Section */}
        <div className="wcm-section-card">
            <div className="wcm-section-header">
                <h2 className="wcm-section-title"><Icon className="ti ti-ticket" style={{ marginRight: '10px' }} />Discount Codes</h2>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <select id="wcm-statusFilter" style={{ padding: '8px 35px 8px 15px', border: '1px solid #d1d5db', borderRadius: '6px', background: 'white', color: '#4b5563', fontSize: '14px', fontWeight: 500 }} value={discountStatusFilter} onChange={(e) => { setDiscountStatusFilter(e.target.value); setDiscountPage(1); }}>
                        <option value="all">All Codes</option>
                        <option value="active">Active Only</option>
                    </select>
                    <button className="wcm-btn wcm-btn-success-custom" onClick={() => { setNewDiscount({ code: '', type: 'percentage', value: '', validUntil: '', limitUsers: false }); setDiscountModalOpen(true); }}>
                        <Icon className="ti ti-plus" /> Add New Code
                    </button>
                </div>
            </div>

            <div className="students-table-container">
                <table className={`students-table ${isLoading ? 'thead-loading' : ''}`}>
                    <thead>
                        <tr>
                            <th>Discount Code</th>
                            <th>Type</th>
                            <th>Value</th>
                            <th>Valid Until</th>
                            <th>Usage Limit</th>
                            <th style={{ textAlign: 'center' }}>Status</th>
                            <th style={{ textAlign: 'center' }}>Actions</th>
                        </tr>
                    </thead>
                    {isLoading ? (
                    <tbody>
                        {Array.from({ length: 8 }, (_, i) => (
                            <tr key={`sk-${i}`}>
                                {Array.from({ length: 7 }, (_, j) => (
                                    <td key={j}><div className="table-skeleton medium" /></td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                    ) : (
                    <tbody>
                        {paginatedVouchers.map(v => (
                            <tr key={v.id}>
                                <td><strong>{v.code}</strong><br /><small style={{ color: '#666' }}>{v.title}</small></td>
                                <td>{v.amountType === 'percentage' ? 'Percentage' : 'Fixed Amount'}</td>
                                <td>{v.amountType === 'percentage' ? `${v.amount}%` : `₹${v.amount}`}</td>
                                <td>{new Date(v.validUntil).toLocaleDateString()}</td>
                                <td>{v.limitedUsers ? `${v.users.length} Users` : 'Unlimited'}</td>
                                <td style={{ textAlign: 'center' }}>
                                    <span className={`status-pill status-${v.status === 'active' ? 'active' : 'inactive'}`}>
                                        {v.status.toUpperCase()}
                                    </span>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                    <VoucherKebabMenu
                                        voucher={v}
                                        onViewUsers={openViewUsers}
                                        onRevoke={(voucher) => { setVoucherToRevoke(voucher); setRevokeModalOpen(true); }}
                                    />
                                </td>
                            </tr>
                        ))}
                        {paginatedVouchers.length === 0 && (
                            <tr><td colSpan="7" style={{ textAlign: 'center', padding: '30px' }}>No discount codes found.</td></tr>
                        )}
                    </tbody>
                    )}
                </table>

                {filteredVouchers.length > 0 && (
                    <div className="pagination-container">
                        <div className="pagination-info">
                            <span>Showing {(discountPage - 1) * discountsPerPage + 1} to {Math.min(discountPage * discountsPerPage, filteredVouchers.length)} of {filteredVouchers.length} entries</span>
                            <select
                                className="page-size-select"
                                value={discountsPerPage}
                                onChange={(e) => { setDiscountsPerPage(Number(e.target.value)); setDiscountPage(1); }}
                            >
                                {[5, 10, 20, 50, 100].map((size) => <option key={size} value={size}>Show {size}</option>)}
                            </select>
                        </div>
                        <div className="pagination-controls">
                            <button type="button" className="pagination-btn" onClick={() => setDiscountPage(p => Math.max(1, p - 1))} disabled={discountPage === 1}>
                                <Icon className="ti ti-angle-left" /> Previous
                            </button>
                            {getPageNumbers(discountPage, totalDiscountPages).map((page, idx) => (
                                page === '...'
                                    ? <span key={`ellipsis-${idx}`} className="pagination-ellipsis">...</span>
                                    : <button key={page} type="button" className={`pagination-btn ${discountPage === page ? 'active' : ''}`} onClick={() => setDiscountPage(page)}>{page}</button>
                            ))}
                            <button type="button" className="pagination-btn" onClick={() => setDiscountPage(p => Math.min(totalDiscountPages, p + 1))} disabled={discountPage >= totalDiscountPages}>
                                Next <Icon className="ti ti-angle-right" />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>

        {/* Enroll Modal */}
        {enrollModalOpen && (
            <div className="crispr-modal-backdrop active" onClick={() => setEnrollModalOpen(false)}>
                <div className="crispr-modal-dialog" style={{ maxWidth: '800px', width: '100%' }} onClick={e => e.stopPropagation()}>
                    <div className="crispr-modal-header">
                        <h3>Select Courses</h3>
                        <button className="crispr-modal-close" onClick={() => setEnrollModalOpen(false)}>
                            <Icon className="ti ti-close" />
                        </button>
                    </div>
                    <div className="crispr-modal-body" style={{ padding: 0 }}>
                        <div style={{ padding: '20px', borderBottom: '1px solid #eee' }}>
                            <input type="text" className="wcm-form-control" placeholder="Search courses by name or code..." value={courseSearch} onChange={e => setCourseSearch(e.target.value)} />
                        </div>
                        <div style={{ maxHeight: '400px', overflowY: 'auto', padding: '20px' }}>
                            <div className="wcm-course-grid">
                                {filteredCatalogForEnrollment.map(course => {
                                    const checked = selectedCourses.some(c => c.code === course.code);
                                    return (
                                       <label key={course.code} style={{ margin: 0, fontWeight: 'normal' }}>
                                           <input type="checkbox" className="wcm-course-checkbox" checked={checked} onChange={() => handleCourseSelectionToggle(course)} />
                                           <div className="wcm-course-card">
                                               <div className="wcm-course-icon"><Icon className="ti ti-book" /></div>
                                               <div>
                                                   <strong>{course.title}</strong>
                                                   <div style={{ fontSize: '12px', color: '#666' }}>{course.code}</div>
                                               </div>
                                           </div>
                                       </label>
                                    );
                                })}
                                {filteredCatalogForEnrollment.length === 0 && (
                                    <div style={{ textAlign: 'center', padding: '40px', color: '#6c757d', gridColumn: '1 / -1' }}>
                                        <Icon className="ti ti-search" style={{ fontSize: '48px', marginBottom: '15px', display: 'block', opacity: 0.5 }} />
                                        <p style={{ margin: 0 }}>No courses found</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="crispr-modal-footer">
                        <button type="button" className="btn btn-default" onClick={() => setEnrollModalOpen(false)}>Cancel</button>
                        <button type="button" className="btn wcm-btn-primary-custom" onClick={() => setEnrollModalOpen(false)}>Confirm Selection</button>
                    </div>
                </div>
            </div>
        )}

        {/* Add Discount Modal */}
        {discountModalOpen && (
            <div className="legacy-modal-backdrop active" onClick={() => setDiscountModalOpen(false)}>
                <div className="legacy-modal-dialog" role="dialog" aria-modal="true" style={{ maxWidth: '640px' }} onClick={e => e.stopPropagation()}>
                    <div className="legacy-modal-header">
                        <h3>Add Discount Code</h3>
                        <button type="button" className="legacy-modal-close" onClick={() => setDiscountModalOpen(false)}>
                            <Icon className="ti ti-close" />
                        </button>
                    </div>

                    <form id="wcmDiscountForm" className="batch-modal-form form-modal" onSubmit={handleCreateDiscount}>
                      <div className="legacy-modal-body">
                        <div className="asset-form-section">
                            <div className="asset-form-section-title"><Icon className="ti ti-ticket" /> Discount Details</div>
                            <div className="asset-form-grid">
                                <label className="field-cell full-span">
                                    <div className="float-field">
                                        <input
                                            type="text"
                                            className="float-control"
                                            placeholder=" "
                                            value={newDiscount.code}
                                            onChange={e => setNewDiscount({...newDiscount, code: e.target.value})}
                                            required
                                            style={{ textTransform: 'uppercase', fontFamily: 'monospace', letterSpacing: '1px', fontWeight: 600 }}
                                        />
                                        <span className="float-label">Discount Code <span className="req">*</span></span>
                                    </div>
                                    <span className="field-hint">A unique code, e.g. WELCOME20.</span>
                                </label>
                                <label className="field-cell">
                                    <div className="float-field float-always">
                                        <select
                                            className="float-control"
                                            value={newDiscount.type}
                                            onChange={e => setNewDiscount({...newDiscount, type: e.target.value})}
                                        >
                                            <option value="percentage">Percentage (%)</option>
                                            <option value="fixed">Fixed Amount (₹)</option>
                                        </select>
                                        <span className="float-label">Discount Type</span>
                                    </div>
                                </label>
                                <label className="field-cell">
                                    <div className="float-field">
                                        <input
                                            type="number"
                                            className="float-control"
                                            placeholder=" "
                                            min="0"
                                            value={newDiscount.value}
                                            onChange={e => setNewDiscount({...newDiscount, value: e.target.value})}
                                            required
                                        />
                                        <span className="float-label">Discount Value <span className="req">*</span></span>
                                    </div>
                                </label>
                                <label className="field-cell">
                                    <div className="float-field float-always date-custom">
                                        <input
                                            type="date"
                                            className="float-control"
                                            value={newDiscount.validUntil}
                                            onChange={e => setNewDiscount({...newDiscount, validUntil: e.target.value})}
                                            onClick={openDatePicker}
                                            onKeyDown={openDatePicker}
                                            required
                                        />
                                        <span className="float-label">Valid Until <span className="req">*</span></span>
                                        <span className={`date-display ${!newDiscount.validUntil ? 'is-empty' : ''}`}>
                                            {newDiscount.validUntil ? formatDateLabel(newDiscount.validUntil) : 'Set a Date'}
                                        </span>
                                    </div>
                                </label>
                            </div>
                        </div>

                        <div className="asset-form-section">
                            <div className="asset-form-section-title"><Icon className="ti ti-users" /> Usage Restriction</div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', cursor: 'pointer', margin: 0, fontWeight: 600, color: '#475569' }}>
                                <input type="checkbox" checked={newDiscount.limitUsers} onChange={e => { setNewDiscount({...newDiscount, limitUsers: e.target.checked}); if (!e.target.checked) { setSelectedUsers([]); setUserSearchQuery(''); } }} style={{ margin: 0, width: '18px', height: '18px', cursor: 'pointer' }} />
                                Limit to Specific User(s)
                            </label>

                            {/* User search section - shown when limitUsers is checked */}
                            {newDiscount.limitUsers && (
                                <div style={{ marginTop: '15px' }}>
                                    {/* Search Input */}
                                    <div style={{ position: 'relative', marginBottom: '10px' }}>
                                        <input type="text" className="form-control" value={userSearchQuery} onChange={e => setUserSearchQuery(e.target.value)} placeholder="Search user by name, email, or mobile..." style={{ width: '100%', padding: '12px 16px 12px 40px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px' }} />
                                        <Icon className="ti ti-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: '16px' }} />
                                    </div>

                                    {/* Selected Users Tags */}
                                    {selectedUsers.length > 0 && (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                                            {selectedUsers.map(u => (
                                                <span key={u.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: '#e0f2f1', color: '#006073', borderRadius: '20px', fontSize: '13px', fontWeight: 500 }}>
                                                    {u.name}
                                                    <button type="button" onClick={() => setSelectedUsers(selectedUsers.filter(s => s.id !== u.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#dc2626', fontSize: '14px', lineHeight: 1 }}>
                                                        <Icon className="ti ti-close" />
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    {/* Search Results Dropdown */}
                                    {filteredUsers.length > 0 && (
                                        <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', maxHeight: '200px', overflowY: 'auto', background: 'white', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                                            {filteredUsers.map(u => (
                                                <div key={u.id} style={{ padding: '10px 15px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'background 0.15s' }} className="wcm-user-result-hover" onClick={() => { setSelectedUsers([...selectedUsers, u]); setUserSearchQuery(''); }}>
                                                    <div>
                                                        <strong style={{ fontSize: '14px' }}>{u.name}</strong>
                                                        <div style={{ fontSize: '12px', color: '#6b7280' }}>{u.email} · {u.phone}</div>
                                                    </div>
                                                    <Icon className="ti ti-plus" style={{ color: '#006073' }} />
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {userSearchQuery && filteredUsers.length === 0 && (
                                        <div style={{ textAlign: 'center', padding: '15px', color: '#9ca3af', fontSize: '13px' }}>
                                            No users found matching "{userSearchQuery}"
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                      </div>
                      <div className="legacy-modal-footer">
                          <button type="button" className="legacy-btn legacy-btn-default" onClick={() => setDiscountModalOpen(false)}>Cancel</button>
                          <button type="submit" className="legacy-btn legacy-btn-success">Create Code</button>
                      </div>
                    </form>
                </div>
            </div>
        )}

        {/* View Users Modal */}
        {viewUsersModalOpen && selectedVoucherForUsers && (
            <div className="legacy-modal-backdrop active" onClick={() => setViewUsersModalOpen(false)}>
                <div className="legacy-modal-dialog" role="dialog" aria-modal="true" style={{ maxWidth: '720px' }} onClick={e => e.stopPropagation()}>
                    <div className="legacy-modal-header">
                        <h3>Users Associated with Voucher</h3>
                        <button type="button" className="legacy-modal-close" onClick={() => setViewUsersModalOpen(false)}>
                            <Icon className="ti ti-close" />
                        </button>
                    </div>
                    <div className="legacy-modal-body">
                        <div className="asset-form-section">
                            <div className="asset-form-section-title"><Icon className="ti ti-users" /> {selectedVoucherForUsers.code}</div>
                            <div className="search-wrapper" style={{ marginBottom: '16px' }}>
                                <Icon className={`ti ${voucherUserSearch ? 'ti-close' : 'ti-search'}`} onClick={() => { setVoucherUserSearch(''); setVoucherUserPage(1); }} aria-hidden="true" />
                                <input
                                    type="text"
                                    className="search-input"
                                    value={voucherUserSearch}
                                    onChange={(e) => { setVoucherUserSearch(e.target.value); setVoucherUserPage(1); }}
                                    placeholder="Search by name or mobile…"
                                />
                            </div>
                            <div className="students-table-container">
                                <table className="students-table">
                                    <thead>
                                        <tr>
                                            <th>Name</th>
                                            <th>Mobile</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedVoucherUsers.length > 0 ? (
                                           paginatedVoucherUsers.map((u, i) => (
                                               <tr key={i}>
                                                   <td>{u.name}</td>
                                                   <td>{u.phone}</td>
                                               </tr>
                                           ))
                                        ) : (
                                           <tr><td colSpan="2" style={{ textAlign: 'center', padding: '20px' }}>No users found for this voucher.</td></tr>
                                        )}
                                    </tbody>
                                </table>

                                {filteredVoucherUsers.length > 0 && (
                                    <div className="pagination-container">
                                        <div className="pagination-info">
                                            <span>Showing {(voucherUserPage - 1) * voucherUsersPerPage + 1} to {Math.min(voucherUserPage * voucherUsersPerPage, filteredVoucherUsers.length)} of {filteredVoucherUsers.length} entries</span>
                                        </div>
                                        <div className="pagination-controls">
                                            <button type="button" className="pagination-btn" onClick={() => setVoucherUserPage(p => Math.max(1, p - 1))} disabled={voucherUserPage === 1}>
                                                <Icon className="ti ti-angle-left" /> Previous
                                            </button>
                                            {getPageNumbers(voucherUserPage, totalVoucherUserPages).map((page, idx) => (
                                                page === '...'
                                                    ? <span key={`vu-ellipsis-${idx}`} className="pagination-ellipsis">...</span>
                                                    : <button key={page} type="button" className={`pagination-btn ${voucherUserPage === page ? 'active' : ''}`} onClick={() => setVoucherUserPage(page)}>{page}</button>
                                            ))}
                                            <button type="button" className="pagination-btn" onClick={() => setVoucherUserPage(p => Math.min(totalVoucherUserPages, p + 1))} disabled={voucherUserPage >= totalVoucherUserPages}>
                                                Next <Icon className="ti ti-angle-right" />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="legacy-modal-footer">
                        <button type="button" className="legacy-btn legacy-btn-default" onClick={() => setViewUsersModalOpen(false)}>Close</button>
                    </div>
                </div>
            </div>
        )}

        {/* Revoke Confirm Modal */}
        {revokeModalOpen && voucherToRevoke && (
            <div className="crispr-modal-backdrop active" onClick={() => setRevokeModalOpen(false)}>
                <div className="crispr-modal-dialog" style={{ maxWidth: '450px' }} onClick={e => e.stopPropagation()}>
                    <div className="crispr-modal-header" style={{ background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)' }}>
                        <h3><Icon className="ti ti-alert-circle" /> Confirm Revoke</h3>
                        <button className="crispr-modal-close" onClick={() => setRevokeModalOpen(false)}>
                            <Icon className="ti ti-close" />
                        </button>
                    </div>
                    <div className="crispr-modal-body">
                        <div style={{ textAlign: 'center', padding: '20px 0' }}>
                            <Icon className="ti ti-ban" style={{ fontSize: '64px', color: '#dc2626', marginBottom: '15px' }} />
                            <h4 style={{ margin: '0 0 10px 0', color: '#1f2937' }}>Revoke Voucher Code?</h4>
                            <p style={{ color: '#6b7280', margin: '0 0 5px 0' }}>Are you sure you want to revoke this voucher code?</p>
                            <p style={{ color: '#dc2626', fontWeight: 600, margin: 0 }}>{voucherToRevoke.code}</p>
                            <p style={{ color: '#6b7280', fontSize: '13px', marginTop: '15px' }}>This action cannot be undone.</p>
                        </div>
                    </div>
                    <div className="crispr-modal-footer">
                        <button className="btn btn-default" onClick={() => setRevokeModalOpen(false)}>Cancel</button>
                        <button className="btn btn-danger" style={{ background: '#dc2626', color: 'white', border: 'none', fontWeight: 600 }} onClick={handleRevokeConfirm}>
                            <Icon className="ti ti-ban" /> Revoke Code
                        </button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
}
