import React, { useEffect, useMemo, useRef, useState } from 'react';
import ToastRegion from '../components/ToastRegion';
import FilterDropdown from '../components/FilterDropdown';
import { Can, usePermission } from '../lib/userStore';
import { PERMS } from '../lib/permissions';
import RecordPaymentModal from '../components/RecordPaymentModal';
import UpdateDueDatesModal from '../components/UpdateDueDatesModal';
import OrderPaymentSummary from '../components/OrderPaymentSummary';
import CreateOrderBundleModal from '../components/CreateOrderBundleModal';
import { buildOrdersView, useManualOrders, usePayments } from '../lib/paymentsStore';
import Icon from '../components/Icon';

function formatDate(timestamp) {
  if (!timestamp) return 'Unknown';
  return new Date(timestamp * 1000).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getItemsSummary(order) {
  if (!order.items?.length) return 'No items';
  const firstTitle = order.items[0].title || 'Item';
  const truncated = firstTitle.length > 30 ? `${firstTitle.slice(0, 30)}...` : firstTitle;
  const remaining = order.items.length - 1;
  return remaining > 0 ? `${truncated} +${remaining}` : truncated;
}

function paymentIcon(method) {
  if (method === 'card') return 'ti-credit-card';
  if (method === 'upi') return 'ti-mobile';
  if (method === 'wallet') return 'ti-wallet';
  if (method === 'netbanking') return 'ti-desktop';
  return 'ti-money';
}

function statusClass(status) {
  if (status === 'completed') return 'active';
  if (status === 'pending') return 'pending';
  return 'inactive';
}

function getPageNumbers(currentPage, totalPages) {
  const pages = [];
  const maxVisible = 5;
  let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
  let end = Math.min(totalPages, start + maxVisible - 1);
  if (end - start + 1 < maxVisible) start = Math.max(1, end - maxVisible + 1);
  for (let page = start; page <= end; page += 1) pages.push(page);
  return pages;
}

function sortIcon(column, activeColumn, isReverse) {
  if (activeColumn !== column) return 'ti-arrows-vertical';
  return isReverse ? 'ti-arrow-down' : 'ti-arrow-up';
}

function sortOrders(rows, sortColumn, sortReverse) {
  return [...rows].sort((left, right) => {
    let a = '';
    let b = '';

    if (sortColumn === 'orderNumber') {
      a = left.orderNumber;
      b = right.orderNumber;
    } else if (sortColumn === 'customer') {
      a = left.customer.name;
      b = right.customer.name;
    } else if (sortColumn === 'orderDate') {
      a = Number(left.orderDate);
      b = Number(right.orderDate);
    } else if (sortColumn === 'totalAmount') {
      a = Number(left.totalAmount);
      b = Number(right.totalAmount);
    } else if (sortColumn === 'status') {
      a = left.status;
      b = right.status;
    } else if (sortColumn === 'paymentMethod') {
      a = left.paymentMethod;
      b = right.paymentMethod;
    }

    if (typeof a === 'string') a = a.toLowerCase();
    if (typeof b === 'string') b = b.toLowerCase();
    if (a < b) return sortReverse ? 1 : -1;
    if (a > b) return sortReverse ? -1 : 1;
    return 0;
  });
}

export default function OrdersPage() {
  const { can } = usePermission();
  const payments = usePayments();
  const manualOrders = useManualOrders();
  const [statusOverrides, setStatusOverrides] = useState({});
  const orders = useMemo(() => buildOrdersView(payments, statusOverrides), [payments, statusOverrides, manualOrders]);
  const bundleCounts = useMemo(() => {
    const counts = {};
    orders.forEach((order) => { counts[order.bundleNumber] = (counts[order.bundleNumber] || 0) + 1; });
    return counts;
  }, [orders]);

  // One cart checkout ("Order Bundle") may hold several orders — invoices are
  // issued at bundle level, aggregating every order in the bundle.
  const round2 = (n) => Math.round(n * 100) / 100;
  function bundleAggregate(order) {
    const members = orders.filter((o) => o.bundleNumber === order.bundleNumber);
    return {
      ...order,
      orderNumber: order.bundleNumber,
      items: members.map((o) => o.items[0]),
      subtotal: round2(members.reduce((sum, o) => sum + o.subtotal, 0)),
      taxAmount: round2(members.reduce((sum, o) => sum + o.taxAmount, 0)),
      discountAmount: round2(members.reduce((sum, o) => sum + o.discountAmount, 0)),
      totalAmount: round2(members.reduce((sum, o) => sum + o.totalAmount, 0)),
      discounts: members.flatMap((o) => o.discounts || []),
    };
  }
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPaymentMethod, setFilterPaymentMethod] = useState('');
  const [sortColumn, setSortColumn] = useState('orderDate');
  const [sortReverse, setSortReverse] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [openKebabId, setOpenKebabId] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [emailData, setEmailData] = useState({ to: '', subject: '', orderNumber: '' });
  const [refundData, setRefundData] = useState({ order: null, code: ['', '', '', ''], error: '' });
  const [recordOrder, setRecordOrder] = useState(null);
  const [recordApplyTo, setRecordApplyTo] = useState(null);
  const [summaryOrder, setSummaryOrder] = useState(null);
  const [dueDatesOrder, setDueDatesOrder] = useState(null);
  const [bundleOrder, setBundleOrder] = useState(null);
  const [createBundleOpen, setCreateBundleOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const menuRef = useRef(null);
  const toastIdRef = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsLoading(false), 700);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const closeMenus = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpenKebabId(null);
      }
    };
    document.addEventListener('click', closeMenus);
    return () => document.removeEventListener('click', closeMenus);
  }, []);

  function showToast(type, title, message) {
    const id = toastIdRef.current + 1;
    toastIdRef.current = id;
    setToasts((current) => [...current, { id, type, title, message }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 5000);
  }

  function handleSort(column) {
    setCurrentPage(1);
    if (sortColumn === column) {
      setSortReverse((current) => !current);
      return;
    }
    setSortColumn(column);
    setSortReverse(false);
  }

  function clearAllFilters() {
    setSearchQuery('');
    setFilterStatus('');
    setFilterPaymentMethod('');
    setCurrentPage(1);
  }

  function viewOrder(order) {
    setSelectedOrder(order);
    setOrderModalOpen(true);
    setOpenKebabId(null);
  }

  function viewInvoice(order) {
    setSelectedOrder(bundleAggregate(order));
    setInvoiceModalOpen(true);
    setOpenKebabId(null);
  }

  function openPaymentSummary(order) {
    setSummaryOrder(order.commerceOrder);
    setOpenKebabId(null);
  }

  function openDueDates(order) {
    setDueDatesOrder(order.commerceOrder);
    setOpenKebabId(null);
  }

  function sendInvoiceEmail(order) {
    setEmailData({
      to: order.customer.email,
      subject: `Invoice for Order Bundle #${order.bundleNumber}`,
      orderNumber: order.bundleNumber,
    });
    setEmailModalOpen(true);
    setOpenKebabId(null);
  }

  function openRecordPayment(order) {
    setRecordApplyTo(null);
    setRecordOrder(order.commerceOrder);
    setOpenKebabId(null);
  }

  function initiateRefund(order) {
    setRefundData({ order, code: ['', '', '', ''], error: '' });
    setRefundModalOpen(true);
    setOpenKebabId(null);
  }

  function downloadInvoice(order) {
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    ));
    const rupee = (value) => `&#8377;${formatMoney(value)}`;

    const itemRows = order.items.map((item, index) => (
      `<tr><td>${index + 1}</td><td><strong>${esc(item.title)}</strong><br><small>Code: ${esc(item.code)}</small></td><td>${rupee(item.price)}</td><td>1</td><td>${rupee(item.price)}</td></tr>`
    )).join('');

    const summaryRows = [
      `<tr><td>Subtotal</td><td>${rupee(order.subtotal)}</td></tr>`,
      order.taxAmount > 0 ? `<tr><td>Tax (${esc(order.taxPercent)}%)</td><td>${rupee(order.taxAmount)}</td></tr>` : '',
      order.discountAmount > 0 ? `<tr><td>Discount</td><td>-${rupee(order.discountAmount)}</td></tr>` : '',
      `<tr class="total"><td>Total</td><td>${rupee(order.totalAmount)}</td></tr>`,
    ].join('');

    const discountsBlock = order.discounts?.length
      ? `<div class="discounts"><h4>Discounts Applied:</h4>${order.discounts.map((discount) => `<p>${esc(discount.code)} - ${esc(discount.description)} (-${rupee(discount.amount)})</p>`).join('')}</div>`
      : '';

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${esc(order.orderNumber)}</title>
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
  .bottom { display: flex; justify-content: space-between; gap: 24px; }
  .discounts h4 { margin: 0 0 6px; font-size: 13px; }
  .discounts p { margin: 0; font-size: 12px; color: #1f8a4c; }
  .summary { width: 260px; }
  .summary table { margin: 0; }
  .summary td:last-child { text-align: right; }
  .summary tr.total td { font-weight: 700; background: #f4f9fa; }
  .terms { margin-top: 24px; font-size: 11px; color: #59757b; line-height: 1.6; }
  @media print { body { margin: 12mm; } }
</style></head><body>
  <div class="top">
    <div><h2>Crispr Pilot</h2><p>Educational Platform<br>www.crisprlearning.com<br>support@crisprlearning.com</p></div>
    <div class="meta"><h3>INVOICE</h3><p><strong>Invoice #:</strong> INV-${esc(order.orderNumber)}<br><strong>Date:</strong> ${esc(formatDate(order.orderDate))}<br><strong>Status:</strong> ${esc(order.status.toUpperCase())}</p></div>
  </div>
  <hr>
  <div class="info">
    <div><h5>Bill To:</h5><p><strong>${esc(order.customer.name)}</strong><br>${esc(order.customer.email)}<br>${esc(order.customer.phone)}</p></div>
    <div><h5>Payment Details:</h5><p><strong>Method:</strong> ${esc(order.paymentMethod.toUpperCase())}<br><strong>Reference:</strong> ${esc(order.paymentReference)}<br><strong>Status:</strong> ${esc(order.status.toUpperCase())}</p></div>
  </div>
  <table><thead><tr><th>#</th><th>Item Description</th><th>Price</th><th>Qty</th><th>Amount</th></tr></thead><tbody>${itemRows}</tbody></table>
  <div class="bottom">
    <div>${discountsBlock}</div>
    <div class="summary"><table>${summaryRows}</table></div>
  </div>
  <div class="terms"><strong>Terms &amp; Conditions:</strong><br>Thank you for your purchase. This is a computer-generated invoice and does not require a physical signature. All sales are final. For any queries, please contact our support team.</div>
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

  function confirmRefund() {
    const code = refundData.code.join('');
    if (code.length !== 4) {
      setRefundData((current) => ({ ...current, error: 'Please enter the complete 4-digit code.' }));
      return;
    }

    setStatusOverrides((current) => ({ ...current, [refundData.order.id]: 'refunded' }));
    showToast('success', 'Refund', `Refund initiated for ₹${formatMoney(refundData.order.totalAmount)}`);
    setRefundModalOpen(false);
  }

  const filteredOrders = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = orders.filter((order) => {
      const matchesSearch = !query || [
        order.orderNumber,
        order.bundleNumber,
        order.customer.name,
        order.customer.email,
        order.customer.phone,
        order.paymentReference,
      ].some((value) => String(value || '').toLowerCase().includes(query));
      const matchesStatus = !filterStatus || order.status === filterStatus;
      const matchesPayment = !filterPaymentMethod || order.paymentMethod === filterPaymentMethod;
      return matchesSearch && matchesStatus && matchesPayment;
    });
    return sortOrders(filtered, sortColumn, sortReverse);
  }, [orders, searchQuery, filterStatus, filterPaymentMethod, sortColumn, sortReverse]);

  const summary = useMemo(() => ({
    totalOrders: orders.length,
    completedOrders: orders.filter((order) => order.status === 'completed').length,
    pendingOrders: orders.filter((order) => order.status === 'pending').length,
    totalRevenue: payments.filter((p) => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0),
  }), [orders, payments]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const page = Math.min(currentPage, totalPages);
  const startIndex = filteredOrders.length === 0 ? 0 : (page - 1) * pageSize;
  const paginatedOrders = filteredOrders.slice(startIndex, startIndex + pageSize);

  return (
    <section className="orders-page data-table-page">
      <ToastRegion toasts={toasts} onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />

      <div className="page-header-section">
        <div className="page-header-title-group">
          <span className="page-header-icon-box"><Icon className="fa fa-shopping-cart" /></span>
          <div>
            <h2>Orders Management</h2>
            <p>Review transactions, customer purchases, invoice state, and refund actions.</p>
          </div>
        </div>
        <Can permission={PERMS.ORDERS_CREATE}>
          <button type="button" className="page-action-button" onClick={() => setCreateBundleOpen(true)}>
            <Icon className="ti ti-plus" /> Create Order Bundle
          </button>
        </Can>
      </div>

      <div className="orders-stats-row">
        <StatCard icon="ti-receipt" tone="indigo" value={summary.totalOrders} label="Total Orders" />
        <StatCard icon="ti-check" tone="green" value={summary.completedOrders} label="Completed" />
        <StatCard icon="ti-time" tone="orange" value={summary.pendingOrders} label="Pending" />
        <StatCard icon="ti-money" tone="teal" value={`₹${Math.round(summary.totalRevenue).toLocaleString('en-IN')}`} label="Collected" />
      </div>

      <div className="filter-bar" ref={menuRef}>
        <div className="search-wrapper">
          <Icon className={`ti ${searchQuery ? 'ti-close' : 'ti-search'}`} onClick={() => { setSearchQuery(''); setCurrentPage(1); }} />
          <input
            type="text"
            className="search-input"
            placeholder="Search by order ID, customer name, email, or phone..."
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setCurrentPage(1);
            }}
          />
        </div>
        <FilterDropdown
          label="All Status"
          value={filterStatus}
          options={[
            { value: '', label: 'All Status' },
            { value: 'completed', label: 'Completed' },
            { value: 'pending', label: 'Pending' },
            { value: 'failed', label: 'Failed' },
            { value: 'refunded', label: 'Refunded' },
          ]}
          onChange={(value) => { setFilterStatus(value); setCurrentPage(1); }}
        />
        <FilterDropdown
          label="All Payment Methods"
          value={filterPaymentMethod}
          options={[
            { value: '', label: 'All Payment Methods' },
            { value: 'card', label: 'Card' },
            { value: 'upi', label: 'UPI' },
            { value: 'netbanking', label: 'Net Banking' },
            { value: 'wallet', label: 'Wallet' },
          ]}
          onChange={(value) => { setFilterPaymentMethod(value); setCurrentPage(1); }}
        />
      </div>

      {(isLoading || filteredOrders.length > 0) ? (
        <div className="students-table-container">
          <table className={`students-table ${isLoading ? 'thead-loading' : ''}`}>
            <thead>
              <tr>
                <th className={`sortable ${sortColumn === 'orderNumber' ? 'active' : ''}`} onClick={() => handleSort('orderNumber')}>Order ID <Icon className={`sort-icon ti ${sortIcon('orderNumber', sortColumn, sortReverse)}`} /></th>
                <th>Order Bundle</th>
                <th className={`sortable ${sortColumn === 'customer' ? 'active' : ''}`} onClick={() => handleSort('customer')}>Customer <Icon className={`sort-icon ti ${sortIcon('customer', sortColumn, sortReverse)}`} /></th>
                <th className={`sortable ${sortColumn === 'orderDate' ? 'active' : ''}`} onClick={() => handleSort('orderDate')}>Date <Icon className={`sort-icon ti ${sortIcon('orderDate', sortColumn, sortReverse)}`} /></th>
                <th>Items Summary</th>
                <th className={`sortable ${sortColumn === 'totalAmount' ? 'active' : ''}`} onClick={() => handleSort('totalAmount')}>Amount <Icon className={`sort-icon ti ${sortIcon('totalAmount', sortColumn, sortReverse)}`} /></th>
                <th className={`sortable ${sortColumn === 'status' ? 'active' : ''}`} onClick={() => handleSort('status')}>Status <Icon className={`sort-icon ti ${sortIcon('status', sortColumn, sortReverse)}`} /></th>
                <th className={`sortable ${sortColumn === 'paymentMethod' ? 'active' : ''}`} onClick={() => handleSort('paymentMethod')}>Payment <Icon className={`sort-icon ti ${sortIcon('paymentMethod', sortColumn, sortReverse)}`} /></th>
                <th className="actions-column">Actions</th>
              </tr>
            </thead>
            {isLoading ? (
              <tbody>
                {Array.from({ length: pageSize > 5 ? 5 : pageSize }).map((_, index) => (
                  <tr key={`skel-${index}`}>
                    <td><div className="orders-skeleton short"><div className="orders-skeleton-shimmer" /></div></td>
                    <td><div className="orders-skeleton short"><div className="orders-skeleton-shimmer" /></div></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div className="orders-skeleton avatar"><div className="orders-skeleton-shimmer" /></div>
                        <div>
                          <div className="orders-skeleton medium" style={{ marginBottom: 5 }}><div className="orders-skeleton-shimmer" /></div>
                          <div className="orders-skeleton short" style={{ height: 12, width: 100 }}><div className="orders-skeleton-shimmer" /></div>
                        </div>
                      </div>
                    </td>
                    <td><div className="orders-skeleton medium" style={{ width: 110 }}><div className="orders-skeleton-shimmer" /></div></td>
                    <td><div className="orders-skeleton long"><div className="orders-skeleton-shimmer" /></div></td>
                    <td><div className="orders-skeleton amount"><div className="orders-skeleton-shimmer" /></div></td>
                    <td><div className="orders-skeleton badge"><div className="orders-skeleton-shimmer" /></div></td>
                    <td><div className="orders-skeleton short" style={{ width: 70 }}><div className="orders-skeleton-shimmer" /></div></td>
                    <td />
                  </tr>
                ))}
              </tbody>
            ) : (
              <tbody>
                {paginatedOrders.map((order) => (
                  <tr key={order.id} onClick={() => viewOrder(order)} className={openKebabId === order.id ? 'row-active-menu' : ''}>
                    <td><span className="order-number-link">{order.orderNumber}</span></td>
                    <td onClick={(event) => event.stopPropagation()}>
                      <button type="button" className="payments-order-link" title="View bundle contents" onClick={() => setBundleOrder(order)}>
                        <Icon className="ti ti-package" /> {order.bundleNumber}
                      </button>
                      {bundleCounts[order.bundleNumber] > 1 ? (
                        <div className="profile-subtext">{bundleCounts[order.bundleNumber]} orders in bundle</div>
                      ) : null}
                    </td>
                    <td>
                      <div className="profile-cell">
                        <div className="profile-info">
                          <div className="profile-name">{order.customer.name}</div>
                          <div className="profile-subtext">{order.customer.email}</div>
                        </div>
                      </div>
                    </td>
                    <td><div className="info-cell"><Icon className="ti ti-calendar" /> {formatDate(order.orderDate)}</div></td>
                    <td><div className="info-cell" title={order.items?.[0]?.title}>{getItemsSummary(order)}</div></td>
                    <td>
                      <span className="order-amount">₹{formatMoney(order.totalAmount)}</span>
                      {order.outstandingAmount > 0 && order.paidAmount > 0 ? (
                        <div className="order-amount-due">₹{formatMoney(order.paidAmount)} paid · ₹{formatMoney(order.outstandingAmount)} due</div>
                      ) : null}
                    </td>
                    <td><span className={`status-pill status-${statusClass(order.status)}`}>{order.status}</span></td>
                    <td><span className="crispr-badge"><Icon className={`ti ${paymentIcon(order.paymentMethod)}`} /> {order.paymentMethod.toUpperCase()}</span></td>
                    <td className={`actions-column ${openKebabId === order.id ? 'cell-active-menu' : ''}`} onClick={(event) => event.stopPropagation()}>
                      <div className="kebab-menu-container">
                        <button type="button" className="kebab-button" onClick={(event) => { event.stopPropagation(); setOpenKebabId((current) => (current === order.id ? null : order.id)); }}>
                          <Icon className="ti ti-more-alt" />
                        </button>
                        <div className={`kebab-dropdown ${openKebabId === order.id ? 'active' : ''}`}>
                          <button type="button" className="kebab-dropdown-item" onClick={() => viewOrder(order)}><Icon className="ti ti-eye" /> View Order</button>
                          <button type="button" className="kebab-dropdown-item" onClick={() => openPaymentSummary(order)}><Icon className="ti ti-wallet" /> View Payment Summary</button>
                          {can(PERMS.ORDERS_INVOICE_DOWNLOAD) && (
                            <button type="button" className="kebab-dropdown-item" onClick={() => viewInvoice(order)}><Icon className="ti ti-receipt" /> View Order Bundle Invoice</button>
                          )}
                          {can(PERMS.ORDERS_INVOICE_SEND) && (
                            <button type="button" className="kebab-dropdown-item" onClick={() => sendInvoiceEmail(order)}><Icon className="ti ti-email" /> Email Order Bundle Invoice</button>
                          )}
                          {order.outstandingAmount > 0 && order.status !== 'refunded' && can(PERMS.PAYMENTS_RECORD) ? (
                            <button type="button" className="kebab-dropdown-item" onClick={() => openRecordPayment(order)}><Icon className="ti ti-pencil-alt" /> Record Payment</button>
                          ) : null}
                          {order.scheduledCount > 0 && order.status !== 'refunded' && can(PERMS.PAYMENTS_RECORD) ? (
                            <button type="button" className="kebab-dropdown-item" onClick={() => openDueDates(order)}><Icon className="ti ti-calendar" /> Update Due Dates</button>
                          ) : null}
                          {order.status === 'completed' && can(PERMS.ORDERS_REFUND) ? (
                            <button type="button" className="kebab-dropdown-item refund-action" onClick={() => initiateRefund(order)}><Icon className="ti ti-back-left" /> Initiate Refund</button>
                          ) : null}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>

          {!isLoading && filteredOrders.length > 0 && (
            <div className="pagination-container">
              <div className="pagination-info">
                <span>Showing {startIndex + 1} to {Math.min(startIndex + pageSize, filteredOrders.length)} of {filteredOrders.length} entries</span>
                <select className="page-size-select" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setCurrentPage(1); }}>
                  {[10, 20, 50, 100].map((size) => <option key={size} value={size}>Show {size}</option>)}
                </select>
              </div>
              <div className="pagination-controls">
                <button type="button" className="pagination-btn" disabled={page === 1} onClick={() => setCurrentPage((current) => Math.max(1, current - 1))}><Icon className="ti ti-angle-left" /> Previous</button>
                {getPageNumbers(page, totalPages).map((pageNumber) => <button key={pageNumber} type="button" className={`pagination-btn ${page === pageNumber ? 'active' : ''}`} onClick={() => setCurrentPage(pageNumber)}>{pageNumber}</button>)}
                <button type="button" className="pagination-btn" disabled={page >= totalPages} onClick={() => setCurrentPage((current) => Math.min(totalPages, current + 1))}>Next <Icon className="ti ti-angle-right" /></button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="empty-state">
          <Icon className="ti ti-shopping-cart" />
          <h4>No Orders Found</h4>
          {(searchQuery || filterStatus || filterPaymentMethod) ? (
            <p>No orders match your search criteria or filters. <button type="button" onClick={clearAllFilters}>Clear all filters</button> to see all orders.</p>
          ) : (
            <p>No orders have been placed yet.</p>
          )}
        </div>
      )}

      {orderModalOpen && selectedOrder ? <OrderModal order={selectedOrder} onClose={() => setOrderModalOpen(false)} onInvoice={() => viewInvoice(selectedOrder)} /> : null}
      {invoiceModalOpen && selectedOrder ? <InvoiceModal order={selectedOrder} onClose={() => setInvoiceModalOpen(false)} onDownload={() => downloadInvoice(selectedOrder)} /> : null}
      {emailModalOpen ? <EmailModal emailData={emailData} setEmailData={setEmailData} onClose={() => setEmailModalOpen(false)} onSend={() => { if (!emailData.to) { showToast('error', 'Email', 'Please enter an email address'); return; } setEmailModalOpen(false); showToast('success', 'Email Sent', `Invoice email sent to ${emailData.to}`); }} /> : null}
      {refundModalOpen && refundData.order ? <RefundModal refundData={refundData} setRefundData={setRefundData} onClose={() => setRefundModalOpen(false)} onConfirm={confirmRefund} /> : null}
      {bundleOrder ? (() => {
        const members = orders.filter((o) => o.bundleNumber === bundleOrder.bundleNumber);
        const totals = {
          total: members.reduce((sum, o) => sum + o.totalAmount, 0),
          paid: members.reduce((sum, o) => sum + o.paidAmount, 0),
          outstanding: members.reduce((sum, o) => sum + o.outstandingAmount, 0),
          discount: members.reduce((sum, o) => sum + o.discountAmount, 0),
          subtotal: members.reduce((sum, o) => sum + o.subtotal, 0),
          tax: members.reduce((sum, o) => sum + o.taxAmount, 0),
        };
        return (
          <div className="crispr-modal-backdrop active" role="presentation" onClick={() => setBundleOrder(null)}>
            <div className="crispr-modal-dialog order-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
              <div className="crispr-modal-header">
                <h3><Icon className="ti ti-package" /> Order Bundle {bundleOrder.bundleNumber}</h3>
                <button type="button" className="crispr-modal-close" onClick={() => setBundleOrder(null)}><Icon className="ti ti-close" /></button>
              </div>
              <div className="crispr-modal-body">
                <div className="order-modal-header">
                  <div>
                    <Icon className="ti ti-calendar" /> {formatDate(bundleOrder.orderDate)}
                    <span><Icon className="ti ti-user" /> {bundleOrder.customer.name}</span>
                    <span><Icon className="ti ti-shopping-cart" /> {members.length} order{members.length === 1 ? '' : 's'} in bundle</span>
                  </div>
                  <span className={`status-badge ${totals.outstanding > 0 ? 'status-pending' : 'status-completed'}`}>
                    {totals.outstanding > 0 ? `₹${formatMoney(totals.outstanding)} due` : 'Fully paid'}
                  </span>
                </div>
                <div className="order-modal-grid">
                  <div>
                    <h5>Orders in this Bundle</h5>
                    {members.map((member) => (
                      <div key={member.id} className="order-item">
                        <div className="order-item-details">
                          <h5>{member.items[0].title}</h5>
                          <div>{member.orderNumber} | Code: {member.items[0].code} | {member.paymentMode === 'INSTALLMENTS' ? 'Installments' : 'Full payment'}</div>
                          <div className="profile-subtext">₹{formatMoney(member.paidAmount)} paid{member.outstandingAmount > 0 ? ` · ₹${formatMoney(member.outstandingAmount)} due` : ''}</div>
                        </div>
                        <div className="order-item-price">
                          <strong>₹{formatMoney(member.totalAmount)}</strong>
                          <span className={`status-badge ${member.outstandingAmount > 0 ? 'status-pending' : 'status-completed'}`}>{member.outstandingAmount > 0 ? 'Partially paid' : 'Paid'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <aside>
                    <div className="customer-info">
                      <h5>Student Details</h5>
                      <p><Icon className="ti ti-user" /> {bundleOrder.customer.name}</p>
                      <p><Icon className="ti ti-email" /> {bundleOrder.customer.email}</p>
                      <p><Icon className="ti ti-id-badge" /> ID: {bundleOrder.customer.id}</p>
                    </div>
                    <div className="order-summary">
                      <div className="summary-row"><span>Subtotal</span><span>₹{formatMoney(totals.subtotal)}</span></div>
                      {totals.discount > 0 ? <div className="summary-row discount"><span>Discount</span><span>-₹{formatMoney(totals.discount)}</span></div> : null}
                      <div className="summary-row"><span>GST</span><span>₹{formatMoney(totals.tax)}</span></div>
                      <div className="summary-row total"><span>Bundle Total</span><span>₹{formatMoney(totals.total)}</span></div>
                      <div className="summary-row discount"><span>Total Paid</span><span>₹{formatMoney(totals.paid)}</span></div>
                      <div className={`summary-row ${totals.outstanding > 0 ? 'outstanding' : ''}`}><span>Outstanding</span><span>₹{formatMoney(totals.outstanding)}</span></div>
                    </div>
                  </aside>
                </div>
              </div>
              <div className="crispr-modal-footer">
                <button type="button" className="legacy-btn legacy-btn-default" onClick={() => setBundleOrder(null)}>Close</button>
                {can(PERMS.ORDERS_INVOICE_DOWNLOAD) && (
                  <button type="button" className="legacy-btn legacy-btn-success" onClick={() => { const target = bundleOrder; setBundleOrder(null); viewInvoice(target); }}><Icon className="ti ti-receipt" /> View Bundle Invoice</button>
                )}
              </div>
            </div>
          </div>
        );
      })() : null}
      {summaryOrder ? (
        <div className="crispr-modal-backdrop active" role="presentation" onClick={() => setSummaryOrder(null)}>
          <div className="crispr-modal-dialog order-dialog payments-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="crispr-modal-header">
              <h3><Icon className="ti ti-wallet" /> Payment Summary - {summaryOrder.orderNumber}</h3>
              <button type="button" className="crispr-modal-close" onClick={() => setSummaryOrder(null)}><Icon className="ti ti-close" /></button>
            </div>
            <div className="crispr-modal-body">
              <OrderPaymentSummary
                order={summaryOrder}
                payments={payments}
                onMarkPaid={can(PERMS.PAYMENTS_RECORD) ? (p) => { const target = summaryOrder; setSummaryOrder(null); setRecordApplyTo(p.id); setRecordOrder(target); } : undefined}
                canMerge={can(PERMS.PAYMENTS_RECORD)}
                onMerged={(merged) => showToast('success', 'Installments Merged', `${merged.label} · ₹${formatMoney(merged.amount)} due ${new Date(merged.dueDate * 1000).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}`)}
              />
            </div>
            <div className="crispr-modal-footer">
              <button type="button" className="legacy-btn legacy-btn-default" onClick={() => setSummaryOrder(null)}>Close</button>
            </div>
          </div>
        </div>
      ) : null}
      {dueDatesOrder ? (
        <UpdateDueDatesModal
          order={dueDatesOrder}
          payments={payments}
          onClose={() => setDueDatesOrder(null)}
          onSaved={(count) => showToast('success', 'Due Dates Updated', `${count} installment due date${count === 1 ? '' : 's'} updated on ${dueDatesOrder.orderNumber}`)}
        />
      ) : null}
      {createBundleOpen ? (
        <CreateOrderBundleModal
          onClose={() => setCreateBundleOpen(false)}
          onCreated={({ bundleNumber, orders: created }) => showToast('success', 'Order Bundle Created', `${bundleNumber} created with ${created.length} order${created.length === 1 ? '' : 's'} for ${created[0].customer.name}`)}
        />
      ) : null}
      {recordOrder ? (
        <RecordPaymentModal
          order={recordOrder}
          payments={payments}
          initialApplyToId={recordApplyTo}
          onClose={() => { setRecordOrder(null); setRecordApplyTo(null); }}
          onRecorded={(p) => showToast('success', 'Payment Recorded', `${p.paymentNumber} · ₹${formatMoney(p.amount)} recorded against ${recordOrder.orderNumber}`)}
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

function OrderModal({ order, onClose, onInvoice }) {
  return (
    <div className="crispr-modal-backdrop active" role="presentation" onClick={onClose}>
      <div className="crispr-modal-dialog order-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="crispr-modal-header">
          <h3><Icon className="ti ti-receipt" /> Order #{order.orderNumber}</h3>
          <button type="button" className="crispr-modal-close" onClick={onClose}><Icon className="ti ti-close" /></button>
        </div>
        <div className="crispr-modal-body">
          <div className="order-modal-header">
            <div><Icon className="ti ti-calendar" /> {formatDate(order.orderDate)} <span><Icon className="ti ti-user" /> {order.customer.name}</span></div>
            <span className={`status-badge status-${order.status}`}>{order.status.toUpperCase()}</span>
          </div>
          <div className="order-modal-grid">
            <div>
              <h5>Order Items</h5>
              {order.items.map((item) => <OrderItem key={`${order.id}-${item.code}`} item={item} />)}
            </div>
            <aside>
              <div className="customer-info">
                <h5>Customer Details</h5>
                <p><Icon className="ti ti-email" /> {order.customer.email}</p>
                <p><Icon className="ti ti-mobile" /> {order.customer.phone}</p>
                <p><Icon className="ti ti-id-badge" /> ID: {order.customer.id}</p>
              </div>
              <OrderSummary order={order} />
            </aside>
          </div>
        </div>
        <div className="crispr-modal-footer">
          <button type="button" className="legacy-btn legacy-btn-default" onClick={onClose}>Close</button>
          <button type="button" className="legacy-btn legacy-btn-success" onClick={onInvoice}><Icon className="ti ti-receipt" /> View Bundle Invoice</button>
        </div>
      </div>
    </div>
  );
}

function InvoiceModal({ order, onClose, onDownload }) {
  return (
    <div className="crispr-modal-backdrop active" role="presentation" onClick={onClose}>
      <div className="crispr-modal-dialog invoice-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="crispr-modal-header invoice-header">
          <h3><Icon className="ti ti-receipt" /> Invoice - {order.orderNumber}</h3>
          <button type="button" className="crispr-modal-close" onClick={onClose}><Icon className="ti ti-close" /></button>
        </div>
        <div className="crispr-modal-body invoice-body">
          <div className="invoice-top">
            <div><h2>Crispr Pilot</h2><p>Educational Platform<br />www.crisprlearning.com<br />support@crisprlearning.com</p></div>
            <div className="invoice-meta"><h3>INVOICE</h3><p><strong>Invoice #:</strong> INV-{order.orderNumber}<br /><strong>Date:</strong> {formatDate(order.orderDate)}<br /><strong>Status:</strong> <span className={`status-badge status-${order.status}`}>{order.status.toUpperCase()}</span></p></div>
          </div>
          <hr />
          <div className="invoice-info-grid">
            <div><h5>Bill To:</h5><p><strong>{order.customer.name}</strong><br />{order.customer.email}<br />{order.customer.phone}</p></div>
            <div><h5>Payment Details:</h5><p><strong>Method:</strong> {order.paymentMethod.toUpperCase()}<br /><strong>Reference:</strong> {order.paymentReference}<br /><strong>Status:</strong> {order.status.toUpperCase()}</p></div>
          </div>
          <table className="invoice-table">
            <thead><tr><th>#</th><th>Item Description</th><th>Price</th><th>Qty</th><th>Amount</th></tr></thead>
            <tbody>{order.items.map((item, index) => <tr key={item.code}><td>{index + 1}</td><td><strong>{item.title}</strong><br /><small>Code: {item.code}</small></td><td>₹{formatMoney(item.price)}</td><td>1</td><td>₹{formatMoney(item.price)}</td></tr>)}</tbody>
          </table>
          <div className="invoice-bottom">
            <div>{order.discounts?.length ? <><h6>Discounts Applied:</h6>{order.discounts.map((discount) => <p key={discount.code} className="discount-line"><Icon className="ti ti-check" /> {discount.code} - {discount.description} (-₹{formatMoney(discount.amount)})</p>)}</> : null}</div>
            <OrderSummary order={order} invoice />
          </div>
          <div className="invoice-terms"><strong>Terms & Conditions:</strong><br />Thank you for your purchase. This is a computer-generated invoice and does not require a physical signature. All sales are final. For any queries, please contact our support team.</div>
        </div>
        <div className="crispr-modal-footer">
          <button type="button" className="legacy-btn legacy-btn-default" onClick={onClose}>Close</button>
          <button type="button" className="legacy-btn legacy-btn-success" onClick={onDownload}><Icon className="ti ti-download" /> Download</button>
        </div>
      </div>
    </div>
  );
}

function EmailModal({ emailData, setEmailData, onClose, onSend }) {
  return (
    <div className="legacy-modal-backdrop active" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="legacy-modal-dialog" role="dialog" aria-modal="true">
        <div className="legacy-modal-header">
          <h3><Icon className="ti ti-email" /> Email Invoice</h3>
          <button type="button" className="legacy-modal-close" onClick={onClose}><Icon className="ti ti-close" /></button>
        </div>
        <form className="orders-modal-form form-modal" onSubmit={(event) => { event.preventDefault(); onSend(); }}>
          <div className="legacy-modal-body">
            <div className="asset-form-section">
              <div className="asset-form-section-title"><Icon className="ti ti-send" /> Send Invoice</div>
              <p className="field-static-label">Send invoice for Order <strong>#{emailData.orderNumber}</strong> to the customer.</p>
              <div className="asset-form-grid">
                <label className="field-cell full-span">
                  <div className="float-field">
                    <input type="email" className="float-control" placeholder=" " value={emailData.to} onChange={(event) => setEmailData((current) => ({ ...current, to: event.target.value }))} />
                    <span className="float-label">Recipient Email <span className="req">*</span></span>
                  </div>
                </label>
                <label className="field-cell full-span">
                  <div className="float-field">
                    <input type="text" className="float-control" placeholder=" " value={emailData.subject} onChange={(event) => setEmailData((current) => ({ ...current, subject: event.target.value }))} />
                    <span className="float-label">Subject</span>
                  </div>
                </label>
              </div>
            </div>
          </div>
          <div className="legacy-modal-footer">
            <button type="button" className="legacy-btn legacy-btn-default" onClick={onClose}>Cancel</button>
            <button type="submit" className="legacy-btn legacy-btn-success" disabled={!emailData.to}><Icon className="ti ti-check" /> Send Email</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RefundModal({ refundData, setRefundData, onClose, onConfirm }) {
  const complete = refundData.code.every(Boolean);
  const inputsRef = useRef([]);

  return (
    <div className="crispr-modal-backdrop active" role="presentation" onClick={onClose}>
      <div className="crispr-modal-dialog refund-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="refund-header"><button type="button" className="refund-close" onClick={onClose}><Icon className="ti ti-close" /></button></div>
        <div className="crispr-modal-body refund-body">
          <div className="refund-icon"><Icon className="ti ti-alert" /></div>
          <h3>Initiate Refund</h3>
          <p>Are you sure you want to initiate a refund of <strong>₹{formatMoney(refundData.order.totalAmount)}</strong> for Order <strong>#{refundData.order.orderNumber}</strong>? Please enter the confirmatory code to continue.</p>
          <div className="refund-code-row">
            {refundData.code.map((digit, index) => (
              <input
                key={index}
                ref={(el) => { inputsRef.current[index] = el; }}
                type="text"
                maxLength="1"
                value={digit}
                onChange={(event) => {
                  const val = event.target.value.replace(/\D/g, '').slice(0, 1);
                  const next = [...refundData.code];
                  next[index] = val;
                  setRefundData((current) => ({ ...current, code: next, error: '' }));
                  if (val && index < 3) inputsRef.current[index + 1]?.focus();
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Backspace' && !digit && index > 0) {
                    inputsRef.current[index - 1]?.focus();
                  }
                }}
              />
            ))}
          </div>
          {refundData.error ? <p className="refund-error">{refundData.error}</p> : null}
          <div className="refund-actions"><button type="button" className="legacy-btn legacy-btn-default" onClick={onClose}>Cancel</button><button type="button" className="legacy-btn legacy-btn-danger" disabled={!complete} onClick={onConfirm}>Confirm Refund</button></div>
        </div>
      </div>
    </div>
  );
}

function OrderItem({ item }) {
  return (
    <div className="order-item">
      <img src={item.image || '/assets/img/default_course.png'} className="order-item-image" alt="" />
      <div className="order-item-details"><h5>{item.title}</h5><div>Code: {item.code} | Type: {item.type}</div></div>
      <div className="order-item-price"><strong>₹{formatMoney(item.price)}</strong>{item.originalPrice > item.price ? <small>₹{formatMoney(item.originalPrice)}</small> : null}</div>
    </div>
  );
}

function OrderSummary({ order, invoice = false }) {
  return (
    <div className={invoice ? 'invoice-summary' : 'order-summary'}>
      <div className="summary-row"><span>Subtotal</span><span>₹{formatMoney(order.subtotal)}</span></div>
      {order.taxAmount > 0 ? <div className="summary-row"><span>Tax ({order.taxPercent}%)</span><span>₹{formatMoney(order.taxAmount)}</span></div> : null}
      {order.discountAmount > 0 ? <div className="summary-row discount"><span>Discount</span><span>-₹{formatMoney(order.discountAmount)}</span></div> : null}
      <div className="summary-row total"><span>Total</span><span>₹{formatMoney(order.totalAmount)}</span></div>
    </div>
  );
}
