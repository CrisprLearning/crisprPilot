import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import FilterDropdown from '../components/FilterDropdown';
import ToastRegion from '../components/ToastRegion';
import OrderPaymentSummary, { paymentBadgeClass } from '../components/OrderPaymentSummary';
import UpdateDueDatesModal from '../components/UpdateDueDatesModal';
import RecordPaymentModal from '../components/RecordPaymentModal';
import { usePermission } from '../lib/userStore';
import { PERMS } from '../lib/permissions';
import { getAllOrders, useManualOrders, usePayments } from '../lib/paymentsStore';
import {
  effectiveStatus, methodIcon, methodLabel, paymentLabel, statusMeta,
} from '../lib/paymentsModel';
import Icon from '../components/Icon';

const money = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (ts) => (ts ? new Date(ts * 1000).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }) : '—');

function sortIcon(column, active, reverse) {
  if (active !== column) return 'ti-arrows-vertical';
  return reverse ? 'ti-arrow-down' : 'ti-arrow-up';
}

function getPageNumbers(current, total) {
  const max = 5;
  let start = Math.max(1, current - Math.floor(max / 2));
  const end = Math.min(total, start + max - 1);
  if (end - start + 1 < max) start = Math.max(1, end - max + 1);
  const pages = [];
  for (let p = start; p <= end; p += 1) pages.push(p);
  return pages;
}

const STATUS_RANK = { overdue: 0, pending: 1, scheduled: 2, failed: 3, paid: 4 };

export default function PaymentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortColumn, setSortColumn] = useState('date');
  const [sortReverse, setSortReverse] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState(null);
  const [openKebabId, setOpenKebabId] = useState(null);
  const [invoicePayment, setInvoicePayment] = useState(null);
  const [emailState, setEmailState] = useState(null);
  const [dueOrder, setDueOrder] = useState(null);
  const [recordState, setRecordState] = useState(null); // { order, applyToId }
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);
  const { can } = usePermission();

  function showToast(type, title, message) {
    const id = toastIdRef.current + 1;
    toastIdRef.current = id;
    setToasts((current) => [...current, { id, type, title, message }]);
    window.setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 5000);
  }

  // Filters live in the URL so other pages (e.g. student detail) can deep-link.
  const filterOrder = searchParams.get('order') || '';
  const filterStudent = searchParams.get('student') || '';
  const filterMode = searchParams.get('mode') || '';
  const filterChannel = searchParams.get('channel') || '';
  const filterStatus = searchParams.get('status') || '';

  function setFilter(key, value) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    setSearchParams(next, { replace: true });
    setCurrentPage(1);
  }
  function clearAll() {
    setSearchParams({}, { replace: true });
    setSearchQuery('');
    setCurrentPage(1);
  }

  useEffect(() => {
    const t = window.setTimeout(() => setIsLoading(false), 500);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const closeMenus = () => setOpenKebabId(null);
    document.addEventListener('click', closeMenus);
    return () => document.removeEventListener('click', closeMenus);
  }, []);

  const allPayments = usePayments();
  const manualOrders = useManualOrders();
  const allOrders = useMemo(() => getAllOrders(), [manualOrders]);
  const ordersById = useMemo(() => Object.fromEntries(allOrders.map((o) => [o.id, o])), [allOrders]);
  const payments = useMemo(() => allPayments.map((p) => ({ ...p, status: effectiveStatus(p) })), [allPayments]);

  const orderOptions = useMemo(() => [
    { value: '', label: 'All Orders' },
    ...allOrders.map((o) => ({ value: o.orderNumber, label: `${o.orderNumber} · ${o.customer.name}` })),
  ], [allOrders]);
  const studentOptions = useMemo(() => {
    const seen = new Map();
    allOrders.forEach((o) => seen.set(o.customer.id, o.customer.name));
    return [{ value: '', label: 'All Students' }, ...[...seen].map(([id, name]) => ({ value: id, label: name }))];
  }, [allOrders]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const rows = payments.filter((p) => {
      if (filterOrder && p.orderNumber !== filterOrder) return false;
      if (filterStudent && p.customer.id !== filterStudent) return false;
      if (filterMode && p.paymentMode !== filterMode) return false;
      if (filterChannel && p.channel !== filterChannel) return false;
      if (filterStatus && p.status !== filterStatus) return false;
      if (!q) return true;
      return [p.paymentNumber, p.orderNumber, p.reference, p.customer.name, p.customer.email, p.customer.phone, p.itemTitle, p.itemCode]
        .some((v) => v && String(v).toLowerCase().includes(q));
    });
    const dir = sortReverse ? -1 : 1;
    return [...rows].sort((a, b) => {
      let av; let bv;
      switch (sortColumn) {
        case 'order': av = a.orderNumber; bv = b.orderNumber; break;
        case 'student': av = a.customer.name; bv = b.customer.name; break;
        case 'amount': av = a.amount; bv = b.amount; break;
        case 'status': av = STATUS_RANK[a.status]; bv = STATUS_RANK[b.status]; break;
        default: av = a.paidAt || a.dueDate || 0; bv = b.paidAt || b.dueDate || 0;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return (a.id - b.id) * dir;
    });
  }, [payments, searchQuery, filterOrder, filterStudent, filterMode, filterChannel, filterStatus, sortColumn, sortReverse]);

  const summary = useMemo(() => {
    const collected = filtered.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
    const upcoming = filtered.filter((p) => p.status === 'scheduled' || p.status === 'pending').reduce((s, p) => s + p.amount, 0);
    const overdueRows = filtered.filter((p) => p.status === 'overdue');
    const overdue = overdueRows.reduce((s, p) => s + p.amount, 0);
    return { collected, upcoming, overdue, overdueCount: overdueRows.length, count: filtered.length };
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(currentPage, totalPages);
  const start = filtered.length === 0 ? 0 : (page - 1) * pageSize;
  const pageRows = filtered.slice(start, start + pageSize);
  const hasFilters = Boolean(searchQuery || filterOrder || filterStudent || filterMode || filterChannel || filterStatus);

  function handleSort(col) {
    if (sortColumn === col) setSortReverse((r) => !r);
    else { setSortColumn(col); setSortReverse(col === 'date'); }
  }

  return (
    <section className="orders-page payments-page data-table-page">
      <ToastRegion toasts={toasts} onDismiss={(id) => setToasts((current) => current.filter((t) => t.id !== id))} />

      <div className="page-header-section">
        <div className="page-header-title-group">
          <span className="page-header-icon-box"><Icon className="fa fa-credit-card" /></span>
          <div>
            <h2>Payments</h2>
            <p>Every payment across orders — initial payments, follow-up installments, and what is still due.</p>
          </div>
        </div>
      </div>

      <div className="orders-stats-row">
        <StatCard icon="ti-check" tone="green" value={`₹${money(summary.collected)}`} label="Collected" />
        <StatCard icon="ti-time" tone="orange" value={`₹${money(summary.upcoming)}`} label="Upcoming / Pending" />
        <StatCard icon="ti-alert" tone="red" value={`₹${money(summary.overdue)}`} label={`Overdue${summary.overdueCount ? ` (${summary.overdueCount})` : ''}`} />
        <StatCard icon="ti-list" tone="indigo" value={summary.count} label="Payments listed" />
      </div>

      <div className="filter-bar payments-filter-bar">
        <div className="search-wrapper">
          <Icon className={`ti ${searchQuery ? 'ti-close' : 'ti-search'}`} onClick={() => { setSearchQuery(''); setCurrentPage(1); }} />
          <input
            type="text"
            className="search-input"
            placeholder="Search by payment #, order #, reference, student, or course..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
          />
        </div>
        <FilterDropdown label="All Orders" value={filterOrder} options={orderOptions} maxHeight="280px" onChange={(v) => setFilter('order', v)} />
        <FilterDropdown label="All Students" value={filterStudent} options={studentOptions} maxHeight="280px" onChange={(v) => setFilter('student', v)} />
        <FilterDropdown
          label="All Types"
          value={filterMode}
          options={[{ value: '', label: 'All Types' }, { value: 'FULL', label: 'Full payment' }, { value: 'INSTALLMENTS', label: 'Installments' }]}
          onChange={(v) => setFilter('mode', v)}
        />
        <FilterDropdown
          label="Online & Offline"
          value={filterChannel}
          options={[{ value: '', label: 'Online & Offline' }, { value: 'ONLINE', label: 'Online' }, { value: 'OFFLINE', label: 'Offline' }]}
          onChange={(v) => setFilter('channel', v)}
        />
        <FilterDropdown
          label="All Status"
          value={filterStatus}
          options={[
            { value: '', label: 'All Status' },
            { value: 'paid', label: 'Paid' },
            { value: 'scheduled', label: 'Upcoming' },
            { value: 'pending', label: 'Pending' },
            { value: 'overdue', label: 'Overdue' },
            { value: 'failed', label: 'Failed' },
          ]}
          onChange={(v) => setFilter('status', v)}
        />
        {hasFilters ? (
          <button type="button" className="payments-clear-btn" onClick={clearAll}><Icon className="ti ti-close" /> Clear</button>
        ) : null}
      </div>

      {(isLoading || filtered.length > 0) ? (
        <div className="students-table-container">
          <table className={`students-table ${isLoading ? 'thead-loading' : ''}`}>
            <thead>
              <tr>
                <th>Payment</th>
                <th className={`sortable ${sortColumn === 'order' ? 'active' : ''}`} onClick={() => handleSort('order')}>Order <Icon className={`sort-icon ti ${sortIcon('order', sortColumn, sortReverse)}`} /></th>
                <th className={`sortable ${sortColumn === 'student' ? 'active' : ''}`} onClick={() => handleSort('student')}>Student <Icon className={`sort-icon ti ${sortIcon('student', sortColumn, sortReverse)}`} /></th>
                <th>Type</th>
                <th className={`sortable ${sortColumn === 'amount' ? 'active' : ''}`} onClick={() => handleSort('amount')}>Amount <Icon className={`sort-icon ti ${sortIcon('amount', sortColumn, sortReverse)}`} /></th>
                <th>Channel</th>
                <th className={`sortable ${sortColumn === 'date' ? 'active' : ''}`} onClick={() => handleSort('date')}>Paid / Due <Icon className={`sort-icon ti ${sortIcon('date', sortColumn, sortReverse)}`} /></th>
                <th className={`sortable ${sortColumn === 'status' ? 'active' : ''}`} onClick={() => handleSort('status')}>Status <Icon className={`sort-icon ti ${sortIcon('status', sortColumn, sortReverse)}`} /></th>
                <th className="actions-column">Actions</th>
              </tr>
            </thead>
            {isLoading ? (
              <tbody>
                {Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`skel-${i}`}>
                    <td><div className="orders-skeleton short"><div className="orders-skeleton-shimmer" /></div></td>
                    <td><div className="orders-skeleton medium"><div className="orders-skeleton-shimmer" /></div></td>
                    <td><div className="orders-skeleton medium"><div className="orders-skeleton-shimmer" /></div></td>
                    <td><div className="orders-skeleton long"><div className="orders-skeleton-shimmer" /></div></td>
                    <td><div className="orders-skeleton amount"><div className="orders-skeleton-shimmer" /></div></td>
                    <td><div className="orders-skeleton short" style={{ width: 70 }}><div className="orders-skeleton-shimmer" /></div></td>
                    <td><div className="orders-skeleton medium" style={{ width: 110 }}><div className="orders-skeleton-shimmer" /></div></td>
                    <td><div className="orders-skeleton badge"><div className="orders-skeleton-shimmer" /></div></td>
                    <td />
                  </tr>
                ))}
              </tbody>
            ) : (
              <tbody>
                {pageRows.map((p) => {
                  const m = statusMeta(p.status);
                  const isDue = p.status !== 'paid';
                  return (
                    <tr key={p.id} onClick={() => setSelected(p)} className={openKebabId === p.id ? 'row-active-menu' : ''}>
                      <td>
                        <span className="order-number-link">{p.paymentNumber}</span>
                        {p.reference ? <div className="profile-subtext is-mono">{p.reference}</div> : null}
                      </td>
                      <td>
                        <button type="button" className="payments-order-link" onClick={(e) => { e.stopPropagation(); setFilter('order', p.orderNumber); }} title="Filter by this order">
                          {p.orderNumber}
                        </button>
                        <div className="profile-subtext" title={p.itemTitle}>{p.itemTitle}</div>
                      </td>
                      <td>
                        <div className="profile-cell">
                          <div className="profile-info">
                            <button type="button" className="profile-name payments-student-link" onClick={(e) => { e.stopPropagation(); setFilter('student', p.customer.id); }} title="Filter by this student">{p.customer.name}</button>
                            <div className="profile-subtext">{p.customer.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`payments-mode is-${p.paymentMode.toLowerCase()}`}>{p.paymentMode === 'INSTALLMENTS' ? 'Installments' : 'Full'}</span>
                        <div className="profile-subtext">{paymentLabel(p)}{p.kind === 'INITIAL' ? ' · initial' : ''}</div>
                      </td>
                      <td>
                        <span className="order-amount">₹{money(p.amount)}</span>
                        <div className="profile-subtext">₹{money(p.baseAmount)} + GST ₹{money(p.gstAmount)}</div>
                      </td>
                      <td>
                        {p.method ? (
                          <>
                            <span className={`crispr-badge payments-channel is-${p.channel.toLowerCase()}`}>{p.channel}</span>
                            <div className="profile-subtext"><Icon className={`ti ${methodIcon(p.method)}`} /> {methodLabel(p.method)}</div>
                          </>
                        ) : <span className="profile-subtext">Not yet paid</span>}
                      </td>
                      <td>
                        <div className="info-cell"><Icon className="ti ti-calendar" /> {fmtDate(isDue ? p.dueDate : p.paidAt)}</div>
                        {isDue && p.dueDate ? <div className="profile-subtext">{p.status === 'overdue' ? 'was due' : 'due date'}</div> : null}
                      </td>
                      <td><span className={`status-pill status-${m.pill} payments-status is-${m.tone}`}>{m.label}</span></td>
                      <td className={`actions-column ${openKebabId === p.id ? 'cell-active-menu' : ''}`} onClick={(e) => e.stopPropagation()}>
                        <div className="kebab-menu-container">
                          <button type="button" className="kebab-button" onClick={(e) => { e.stopPropagation(); setOpenKebabId((current) => (current === p.id ? null : p.id)); }}>
                            <Icon className="ti ti-more-alt" />
                          </button>
                          <div className={`kebab-dropdown ${openKebabId === p.id ? 'active' : ''}`}>
                            <button type="button" className="kebab-dropdown-item" onClick={() => { setSelected(p); setOpenKebabId(null); }}><Icon className="ti ti-wallet" /> View Payment Summary</button>
                            <button type="button" className="kebab-dropdown-item" onClick={() => { setInvoicePayment(p); setOpenKebabId(null); }}><Icon className="ti ti-receipt" /> View Payment Invoice</button>
                            <button type="button" className="kebab-dropdown-item" onClick={() => { setEmailState({ payment: p, to: p.customer.email, subject: `Payment Invoice ${p.paymentNumber} — ${p.orderNumber}` }); setOpenKebabId(null); }}><Icon className="ti ti-email" /> Email Payment Invoice</button>
                            {p.status !== 'paid' && ordersById[p.orderId] && can(PERMS.PAYMENTS_RECORD) ? (
                              <button type="button" className="kebab-dropdown-item" onClick={() => { setRecordState({ order: ordersById[p.orderId], applyToId: p.id }); setOpenKebabId(null); }}><Icon className="ti ti-check" /> Mark as Paid</button>
                            ) : null}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            )}
          </table>

          {!isLoading && filtered.length > 0 && (
            <div className="pagination-container">
              <div className="pagination-info">
                <span>Showing {start + 1} to {Math.min(start + pageSize, filtered.length)} of {filtered.length} entries</span>
                <select className="page-size-select" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}>
                  {[10, 20, 50, 100].map((s) => <option key={s} value={s}>Show {s}</option>)}
                </select>
              </div>
              <div className="pagination-controls">
                <button type="button" className="pagination-btn" disabled={page === 1} onClick={() => setCurrentPage((c) => Math.max(1, c - 1))}><Icon className="ti ti-angle-left" /> Previous</button>
                {getPageNumbers(page, totalPages).map((n) => <button key={n} type="button" className={`pagination-btn ${page === n ? 'active' : ''}`} onClick={() => setCurrentPage(n)}>{n}</button>)}
                <button type="button" className="pagination-btn" disabled={page >= totalPages} onClick={() => setCurrentPage((c) => Math.min(totalPages, c + 1))}>Next <Icon className="ti ti-angle-right" /></button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="empty-state">
          <Icon className="ti ti-credit-card" />
          <h4>No Payments Found</h4>
          {hasFilters ? (
            <p>No payments match your search or filters. <button type="button" onClick={clearAll}>Clear all filters</button> to see every payment.</p>
          ) : (
            <p>No payments have been recorded yet.</p>
          )}
        </div>
      )}

      {selected ? (() => {
        const order = ordersById[selected.orderId];
        if (!order) return null;
        const hasReschedulable = payments.some((p) => p.orderId === order.id && (p.status === 'scheduled' || p.status === 'overdue'));
        return (
          <div className="crispr-modal-backdrop active" role="presentation" onClick={() => setSelected(null)}>
            <div className="crispr-modal-dialog order-dialog payments-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
              <div className="crispr-modal-header">
                <h3><Icon className="ti ti-credit-card" /> Payment {selected.paymentNumber}</h3>
                <button type="button" className="crispr-modal-close" onClick={() => setSelected(null)}><Icon className="ti ti-close" /></button>
              </div>
              <div className="crispr-modal-body">
                <OrderPaymentSummary
                  order={order}
                  payments={payments}
                  highlightPaymentId={selected.id}
                  onMarkPaid={can(PERMS.PAYMENTS_RECORD) ? (p) => { setSelected(null); setRecordState({ order, applyToId: p.id }); } : undefined}
                  canMerge={can(PERMS.PAYMENTS_RECORD)}
                  onMerged={(merged) => showToast('success', 'Installments Merged', `${merged.label} · ₹${money(merged.amount)} due ${fmtDate(merged.dueDate)}`)}
                />
              </div>
              <div className="crispr-modal-footer">
                <button type="button" className="legacy-btn legacy-btn-default" onClick={() => setSelected(null)}>Close</button>
                {hasReschedulable && can(PERMS.PAYMENTS_RECORD) ? (
                  <button type="button" className="legacy-btn legacy-btn-success" onClick={() => { setDueOrder(order); setSelected(null); }}>
                    <Icon className="ti ti-calendar" /> Update Due Dates
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        );
      })() : null}

      {invoicePayment && ordersById[invoicePayment.orderId] ? (
        <PaymentInvoiceModal
          payment={invoicePayment}
          order={ordersById[invoicePayment.orderId]}
          onClose={() => setInvoicePayment(null)}
          onDownload={() => downloadPaymentInvoice(invoicePayment, ordersById[invoicePayment.orderId], showToast)}
          onEmail={() => { setEmailState({ payment: invoicePayment, to: invoicePayment.customer.email, subject: `Payment Invoice ${invoicePayment.paymentNumber} — ${invoicePayment.orderNumber}` }); setInvoicePayment(null); }}
        />
      ) : null}

      {emailState ? (
        <PaymentEmailModal
          emailState={emailState}
          setEmailState={setEmailState}
          onClose={() => setEmailState(null)}
          onSend={() => {
            if (!emailState.to) { showToast('error', 'Email', 'Please enter an email address'); return; }
            setEmailState(null);
            showToast('success', 'Email Sent', `Payment invoice ${emailState.payment.paymentNumber} sent to ${emailState.to}`);
          }}
        />
      ) : null}

      {recordState ? (
        <RecordPaymentModal
          order={recordState.order}
          payments={allPayments}
          initialApplyToId={recordState.applyToId}
          onClose={() => setRecordState(null)}
          onRecorded={(rec) => showToast('success', 'Payment Recorded', `${rec.paymentNumber} · ₹${money(rec.amount)} recorded against ${recordState.order.orderNumber}`)}
        />
      ) : null}

      {dueOrder ? (
        <UpdateDueDatesModal
          order={dueOrder}
          payments={allPayments}
          onClose={() => setDueOrder(null)}
          onSaved={(count) => showToast('success', 'Due Dates Updated', `${count} installment due date${count === 1 ? '' : 's'} updated on ${dueOrder.orderNumber}`)}
        />
      ) : null}
    </section>
  );
}

function StatCard({ icon, tone, value, label }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone}`}><Icon className={`ti ${icon}`} /></div>
      <div className="stat-info"><h3>{value}</h3><p>{label}</p></div>
    </div>
  );
}


function PaymentInvoiceModal({ payment, order, onClose, onDownload, onEmail }) {
  return (
    <div className="crispr-modal-backdrop active" role="presentation" onClick={onClose}>
      <div className="crispr-modal-dialog invoice-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="crispr-modal-header invoice-header">
          <h3><Icon className="ti ti-receipt" /> Payment Invoice - {payment.paymentNumber}</h3>
          <button type="button" className="crispr-modal-close" onClick={onClose}><Icon className="ti ti-close" /></button>
        </div>
        <div className="crispr-modal-body invoice-body">
          <div className="invoice-top">
            <div><h2>Crispr Pilot</h2><p>Educational Platform<br />www.crisprlearning.com<br />support@crisprlearning.com</p></div>
            <div className="invoice-meta"><h3>PAYMENT INVOICE</h3><p><strong>Invoice #:</strong> INV-{payment.paymentNumber}<br /><strong>Date:</strong> {fmtDate(payment.paidAt || payment.dueDate)}<br /><strong>Status:</strong> <span className={`status-badge ${paymentBadgeClass(payment)}`}>{statusMeta(payment.status).label.toUpperCase()}</span></p></div>
          </div>
          <hr />
          <div className="invoice-info-grid">
            <div><h5>Bill To:</h5><p><strong>{payment.customer.name}</strong><br />{payment.customer.email}<br />{payment.customer.phone}</p></div>
            <div>
              <h5>Payment Details:</h5>
              <p>
                <strong>Order:</strong> {payment.orderNumber}{order?.bundleNumber ? <><br /><strong>Order Bundle:</strong> {order.bundleNumber}</> : null}
                <br /><strong>Channel:</strong> {payment.method ? (payment.channel === 'OFFLINE' ? 'Offline' : 'Online') : '—'}
                <br /><strong>Method:</strong> {methodLabel(payment.method)}
                {payment.reference ? <><br /><strong>Reference:</strong> {payment.reference}</> : null}
              </p>
            </div>
          </div>
          <table className="invoice-table">
            <thead><tr><th>#</th><th>Description</th><th>Amount</th><th>GST ({order?.gstPercent ?? 18}%)</th><th>Total</th></tr></thead>
            <tbody>
              <tr>
                <td>1</td>
                <td><strong>{paymentLabel(payment)}</strong><br /><small>{payment.itemTitle} · Order {payment.orderNumber}</small></td>
                <td>₹{money(payment.baseAmount)}</td>
                <td>₹{money(payment.gstAmount)}</td>
                <td>₹{money(payment.amount)}</td>
              </tr>
            </tbody>
          </table>
          <div className="invoice-bottom">
            <div>
              {payment.status !== 'paid' && payment.dueDate ? (
                <p className="discount-line"><Icon className="ti ti-alarm-clock" /> {payment.status === 'overdue' ? 'Was due' : 'Due'} {fmtDate(payment.dueDate)}</p>
              ) : null}
            </div>
            <div className="invoice-summary">
              <div className="summary-row"><span>Amount</span><span>₹{money(payment.baseAmount)}</span></div>
              <div className="summary-row"><span>GST ({order?.gstPercent ?? 18}%)</span><span>₹{money(payment.gstAmount)}</span></div>
              <div className="summary-row total"><span>{payment.status === 'paid' ? 'Total Paid' : 'Total Due'}</span><span>₹{money(payment.amount)}</span></div>
            </div>
          </div>
          <div className="invoice-terms"><strong>Terms &amp; Conditions:</strong><br />This is a computer-generated payment invoice and does not require a physical signature. For any queries, please contact our support team.</div>
        </div>
        <div className="crispr-modal-footer">
          <button type="button" className="legacy-btn legacy-btn-default" onClick={onClose}>Close</button>
          <button type="button" className="legacy-btn legacy-btn-default" onClick={onEmail}><Icon className="ti ti-email" /> Email</button>
          <button type="button" className="legacy-btn legacy-btn-success" onClick={onDownload}><Icon className="ti ti-download" /> Download</button>
        </div>
      </div>
    </div>
  );
}

function PaymentEmailModal({ emailState, setEmailState, onClose, onSend }) {
  return (
    <div className="legacy-modal-backdrop active" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="legacy-modal-dialog" role="dialog" aria-modal="true">
        <div className="legacy-modal-header">
          <h3><Icon className="ti ti-email" /> Email Payment Invoice</h3>
          <button type="button" className="legacy-modal-close" onClick={onClose}><Icon className="ti ti-close" /></button>
        </div>
        <form className="orders-modal-form form-modal" onSubmit={(e) => { e.preventDefault(); onSend(); }}>
          <div className="legacy-modal-body">
            <div className="asset-form-section">
              <div className="asset-form-section-title"><Icon className="ti ti-send" /> Send Payment Invoice</div>
              <p className="field-static-label">Send the invoice for payment <strong>{emailState.payment.paymentNumber}</strong> ({emailState.payment.orderNumber}) to the student.</p>
              <div className="asset-form-grid">
                <label className="field-cell full-span">
                  <div className="float-field">
                    <input type="email" className="float-control" placeholder=" " value={emailState.to} onChange={(e) => setEmailState((c) => ({ ...c, to: e.target.value }))} />
                    <span className="float-label">Recipient Email <span className="req">*</span></span>
                  </div>
                </label>
                <label className="field-cell full-span">
                  <div className="float-field">
                    <input type="text" className="float-control" placeholder=" " value={emailState.subject} onChange={(e) => setEmailState((c) => ({ ...c, subject: e.target.value }))} />
                    <span className="float-label">Subject</span>
                  </div>
                </label>
              </div>
            </div>
          </div>
          <div className="legacy-modal-footer">
            <button type="button" className="legacy-btn legacy-btn-default" onClick={onClose}>Cancel</button>
            <button type="submit" className="legacy-btn legacy-btn-success" disabled={!emailState.to}><Icon className="ti ti-check" /> Send Email</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function downloadPaymentInvoice(payment, order, showToast) {
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const rupee = (v) => `&#8377;${money(v)}`;
  const statusLabel = statusMeta(payment.status).label.toUpperCase();
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Payment Invoice ${esc(payment.paymentNumber)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #16353c; margin: 32px; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; }
  .top h2 { margin: 0 0 4px; }
  .top p { margin: 0; color: #59757b; font-size: 13px; line-height: 1.5; }
  .meta { text-align: right; }
  .meta h3 { margin: 0 0 6px; letter-spacing: 1px; }
  hr { border: none; border-top: 1px solid #d7e5e8; margin: 18px 0; }
  .info { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 18px; }
  .info h5 { margin: 0 0 6px; font-size: 13px; }
  .info p { margin: 0; font-size: 13px; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 18px; }
  th, td { border: 1px solid #d7e5e8; padding: 7px 10px; text-align: left; }
  thead th { background: #006073; color: #fff; }
  .summary { width: 260px; margin-left: auto; }
  .summary table { margin: 0; }
  .summary td:last-child { text-align: right; }
  .summary tr.total td { font-weight: 700; background: #f4f9fa; }
  .terms { margin-top: 24px; font-size: 11px; color: #59757b; line-height: 1.6; }
  @media print { body { margin: 12mm; } }
</style></head><body>
  <div class="top">
    <div><h2>Crispr Pilot</h2><p>Educational Platform<br>www.crisprlearning.com<br>support@crisprlearning.com</p></div>
    <div class="meta"><h3>PAYMENT INVOICE</h3><p><strong>Invoice #:</strong> INV-${esc(payment.paymentNumber)}<br><strong>Date:</strong> ${esc(fmtDate(payment.paidAt || payment.dueDate))}<br><strong>Status:</strong> ${esc(statusLabel)}</p></div>
  </div>
  <hr>
  <div class="info">
    <div><h5>Bill To:</h5><p><strong>${esc(payment.customer.name)}</strong><br>${esc(payment.customer.email)}<br>${esc(payment.customer.phone)}</p></div>
    <div><h5>Payment Details:</h5><p><strong>Order:</strong> ${esc(payment.orderNumber)}${order?.bundleNumber ? `<br><strong>Order Bundle:</strong> ${esc(order.bundleNumber)}` : ''}<br><strong>Method:</strong> ${esc(methodLabel(payment.method))}${payment.reference ? `<br><strong>Reference:</strong> ${esc(payment.reference)}` : ''}</p></div>
  </div>
  <table><thead><tr><th>#</th><th>Description</th><th>Amount</th><th>GST</th><th>Total</th></tr></thead>
  <tbody><tr><td>1</td><td><strong>${esc(paymentLabel(payment))}</strong><br><small>${esc(payment.itemTitle)} &middot; Order ${esc(payment.orderNumber)}</small></td><td>${rupee(payment.baseAmount)}</td><td>${rupee(payment.gstAmount)}</td><td>${rupee(payment.amount)}</td></tr></tbody></table>
  <div class="summary"><table>
    <tr><td>Amount</td><td>${rupee(payment.baseAmount)}</td></tr>
    <tr><td>GST</td><td>${rupee(payment.gstAmount)}</td></tr>
    <tr class="total"><td>${payment.status === 'paid' ? 'Total Paid' : 'Total Due'}</td><td>${rupee(payment.amount)}</td></tr>
  </table></div>
  <div class="terms"><strong>Terms &amp; Conditions:</strong><br>This is a computer-generated payment invoice and does not require a physical signature. For any queries, please contact our support team.</div>
  <script>window.onload = function () { window.print(); };</script>
</body></html>`;
  const win = window.open('', '_blank');
  if (!win) {
    showToast('error', 'Pop-up blocked', 'Allow pop-ups for this site to download the invoice.');
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
