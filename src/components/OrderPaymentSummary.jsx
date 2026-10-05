import React, { useState } from 'react';
import { methodIcon, methodLabel, paymentLabel, statusMeta, summarizeOrder } from '../lib/paymentsModel';
import { mergeInstallments } from '../lib/paymentsStore';
import Icon from './Icon';

const money = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (ts) => (ts ? new Date(ts * 1000).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }) : '—');

export const paymentBadgeClass = (p) => (p.status === 'paid' ? 'status-completed' : (p.status === 'overdue' || p.status === 'failed') ? 'status-failed' : 'status-pending');

/**
 * Modal-body content summarising an order's payments — the meta strip, the
 * payment schedule list, and the student/fee aside. Styled after the Orders
 * page order modal; used by the Payments page detail modal and the Orders
 * page "View Payment Summary" modal.
 */
export default function OrderPaymentSummary({ order, payments, highlightPaymentId = null, canMerge = false, onMerged, onMarkPaid }) {
  const s = summarizeOrder(order, payments);
  const couponSum = (order.discounts || []).reduce((t, d) => t + d.amount, 0);
  const paidCount = s.rows.filter((p) => p.status === 'paid').length;
  const headline = s.rows.find((p) => p.id === highlightPaymentId) || null;

  // Merging: overdue/upcoming installments can be selected and combined into
  // a single installment with a new due date.
  const mergeableIds = s.rows.filter((p) => p.status === 'scheduled' || p.status === 'overdue').map((p) => p.id);
  const showCheckboxes = canMerge && mergeableIds.length >= 2;
  const [selectedIds, setSelectedIds] = useState([]);
  const [mergeDate, setMergeDate] = useState('');
  const chosen = s.rows.filter((p) => selectedIds.includes(p.id));
  const mergeBase = chosen.reduce((t, p) => t + p.baseAmount, 0);
  const mergeGst = Math.round(mergeBase * order.gstPercent) / 100;

  function toggleSelect(p, checked) {
    setSelectedIds((current) => {
      const next = checked ? [...current, p.id] : current.filter((id) => id !== p.id);
      const rows = s.rows.filter((r) => next.includes(r.id));
      const latest = rows.reduce((max, r) => Math.max(max, r.dueDate || 0), 0);
      setMergeDate(latest ? new Date(latest * 1000).toISOString().slice(0, 10) : '');
      return next;
    });
  }

  function doMerge() {
    if (chosen.length < 2 || !mergeDate) return;
    const ts = Math.floor(new Date(`${mergeDate}T12:00:00`).getTime() / 1000);
    const merged = mergeInstallments(order, selectedIds, ts);
    setSelectedIds([]);
    setMergeDate('');
    if (merged) onMerged?.(merged);
  }

  return (
    <>
      <div className="order-modal-header">
        <div>
          <Icon className="ti ti-calendar" /> {fmtDate(headline ? (headline.paidAt || headline.dueDate) : order.orderDate)}
          <span><Icon className="ti ti-user" /> {order.customer.name}</span>
          <span><Icon className="ti ti-shopping-cart" /> {order.orderNumber}</span>
          {order.bundleNumber ? <span><Icon className="ti ti-package" /> {order.bundleNumber}</span> : null}
        </div>
        {headline ? (
          <span className={`status-badge ${paymentBadgeClass(headline)}`}>{statusMeta(headline.status).label}</span>
        ) : (
          <span className={`status-badge ${s.outstanding > 0 ? 'status-pending' : 'status-completed'}`}>
            {s.outstanding > 0 ? `₹${money(s.outstanding)} due` : 'Fully settled'}
          </span>
        )}
      </div>
      <div className="order-modal-grid">
        <div>
          <h5>Payment Schedule <small className="payment-schedule-count">{paidCount} of {s.rows.length} settled</small></h5>
          {s.rows.map((p) => (
            <div key={p.id} className={`order-item payment-schedule-item ${p.id === highlightPaymentId ? 'is-current' : ''} ${selectedIds.includes(p.id) ? 'is-selected' : ''}`}>
              {showCheckboxes ? (
                <label className="merge-check" title={mergeableIds.includes(p.id) ? 'Select to merge' : undefined}>
                  <input
                    type="checkbox"
                    disabled={!mergeableIds.includes(p.id)}
                    checked={selectedIds.includes(p.id)}
                    onChange={(e) => toggleSelect(p, e.target.checked)}
                  />
                </label>
              ) : null}
              <div className={`payment-item-badge ${p.status}`}>
                <Icon className={`ti ${p.status === 'paid' ? 'ti-check' : p.status === 'overdue' || p.status === 'failed' ? 'ti-alert' : 'ti-time'}`} />
              </div>
              <div className="order-item-details">
                <h5>{paymentLabel(p)}</h5>
                <div>
                  {p.status === 'paid'
                    ? <>Paid {fmtDate(p.paidAt)} | {p.channel === 'OFFLINE' ? 'Offline' : 'Online'} | <Icon className={`ti ${methodIcon(p.method)}`} /> {methodLabel(p.method)}{p.reference ? <> | {p.reference}</> : null}</>
                    : p.dueDate ? <>Due {fmtDate(p.dueDate)}</> : <>Not scheduled</>}
                </div>
                {p.note ? <div className="payment-item-note"><Icon className="ti ti-comment-alt" /> {p.note}</div> : null}
                {p.originalBaseAmount != null && p.originalBaseAmount !== p.baseAmount ? (
                  <div className="payment-item-note">Adjusted from ₹{money(p.originalBaseAmount)} + GST</div>
                ) : null}
                {p.originalDueDate != null && p.originalDueDate !== p.dueDate ? (
                  <div className="payment-item-note">Rescheduled from {fmtDate(p.originalDueDate)}</div>
                ) : null}
                {p.mergedFrom?.length ? (
                  <div className="payment-item-note">
                    <Icon className="ti ti-layers" /> Merged from {p.mergedFrom.map((m) => `${m.label} (₹${money(m.amount)}${m.dueDate ? ` due ${fmtDate(m.dueDate)}` : ''})`).join(' + ')}
                  </div>
                ) : null}
              </div>
              <div className="order-item-price">
                <strong>₹{money(p.amount)}</strong>
                <div className="payment-item-sub">₹{money(p.baseAmount)} + GST ₹{money(p.gstAmount)}</div>
                <span className={`status-badge ${paymentBadgeClass(p)}`}>{statusMeta(p.status).label}</span>
                {onMarkPaid && p.status !== 'paid' ? (
                  <button type="button" className="mark-paid-btn" onClick={() => onMarkPaid(p)}>
                    <Icon className="ti ti-check" /> Mark as Paid
                  </button>
                ) : null}
              </div>
            </div>
          ))}
          {showCheckboxes && chosen.length >= 2 ? (
            <div className="orders-modal-form form-modal merge-panel">
              <div className="merge-panel-info">
                <strong>Merge {chosen.length} installments into one</strong>
                <span>₹{money(mergeBase)} + GST ₹{money(mergeGst)} = <strong>₹{money(mergeBase + mergeGst)}</strong></span>
              </div>
              <div className="merge-panel-controls">
                <label className="field-cell">
                  <div className="float-field float-always">
                    <input type="date" className="float-control" value={mergeDate} onChange={(e) => setMergeDate(e.target.value)} />
                    <span className="float-label">New Due Date</span>
                  </div>
                </label>
                <button type="button" className="legacy-btn legacy-btn-success" disabled={!mergeDate} onClick={doMerge}>
                  <Icon className="ti ti-layers" /> Merge Installments
                </button>
              </div>
            </div>
          ) : null}
          {showCheckboxes && chosen.length === 1 ? (
            <p className="merge-panel-hint">Select at least one more installment to merge.</p>
          ) : null}
        </div>
        <aside>
          <div className="customer-info">
            <h5>Student Details</h5>
            <p><Icon className="ti ti-user" /> {order.customer.name}</p>
            <p><Icon className="ti ti-email" /> {order.customer.email}</p>
            <p><Icon className="ti ti-mobile" /> {order.customer.phone}</p>
            <p><Icon className="ti ti-id-badge" /> ID: {order.customer.id}</p>
          </div>
          <div className="order-summary">
            {order.feeLines.map((l) => (
              <div key={l.key} className="summary-row">
                <span>{l.label}</span>
                <span>{l.originalAmount && l.originalAmount !== l.amount ? <small className="payment-fee-strike">₹{money(l.originalAmount)}</small> : null} ₹{money(l.amount)}</span>
              </div>
            ))}
            {(order.discounts || []).map((d) => (
              <div key={d.code} className="summary-row discount"><span>Discount ({d.code})</span><span>-₹{money(d.amount)}</span></div>
            ))}
            <div className="summary-row"><span>Subtotal</span><span>₹{money(order.subtotal - couponSum)}</span></div>
            <div className="summary-row"><span>GST ({order.gstPercent}%)</span><span>₹{money(order.gstAmount)}</span></div>
            <div className="summary-row total"><span>Total</span><span>₹{money(order.totalAmount)}</span></div>
            <div className="summary-row discount"><span>Paid so far</span><span>₹{money(s.paid)}</span></div>
            <div className={`summary-row ${s.outstanding > 0 ? 'outstanding' : ''}`}><span>Outstanding</span><span>₹{money(s.outstanding)}</span></div>
            {s.nextDue ? (
              <div className="summary-row outstanding"><span>{s.nextDue.status === 'overdue' ? 'Overdue since' : 'Next due'}</span><span>{fmtDate(s.nextDue.dueDate)}</span></div>
            ) : null}
          </div>
        </aside>
      </div>
    </>
  );
}
