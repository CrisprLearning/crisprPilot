import React, { useMemo, useState } from 'react';
import { paymentLabel, statusMeta, summarizeOrder } from '../lib/paymentsModel';
import { updateDueDates } from '../lib/paymentsStore';
import Icon from './Icon';

const INR = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (ts) => (ts ? new Date(ts * 1000).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
const toInput = (ts) => (ts ? new Date(ts * 1000).toISOString().slice(0, 10) : '');

/**
 * Reschedule the due dates of an order's upcoming (unpaid) installments.
 * Styled after the Orders page modals; changed rows keep their original due
 * date visible ("Rescheduled from …") in every payment view.
 */
export default function UpdateDueDatesModal({ order, payments, onClose, onSaved }) {
  const summary = useMemo(() => summarizeOrder(order, payments), [order, payments]);
  const editable = summary.rows.filter((p) => p.status === 'scheduled' || p.status === 'overdue');
  const [dates, setDates] = useState(() => Object.fromEntries(editable.map((p) => [p.id, toInput(p.dueDate)])));

  const changes = editable
    .map((p) => {
      const str = dates[p.id];
      if (!str || str === toInput(p.dueDate)) return null; // same calendar day = no change
      const ts = Math.floor(new Date(`${str}T12:00:00`).getTime() / 1000);
      return Number.isFinite(ts) ? { id: p.id, ts } : null;
    })
    .filter(Boolean);

  function submit() {
    updateDueDates(order, Object.fromEntries(changes.map((c) => [c.id, c.ts])));
    onSaved?.(changes.length);
    onClose();
  }

  return (
    <div className="crispr-modal-backdrop active" role="presentation" onClick={onClose}>
      <div className="crispr-modal-dialog due-dates-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="crispr-modal-header">
          <h3><Icon className="ti ti-calendar" /> Update Due Dates - {order.orderNumber}</h3>
          <button type="button" className="crispr-modal-close" onClick={onClose}><Icon className="ti ti-close" /></button>
        </div>
        <form className="orders-modal-form form-modal" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <div className="crispr-modal-body">
            <div className="order-modal-header">
              <div>
                <Icon className="ti ti-user" /> {order.customer.name}
                <span><Icon className="ti ti-book" /> {order.item.title}</span>
              </div>
              <span className={`status-badge ${summary.outstanding > 0 ? 'status-pending' : 'status-completed'}`}>
                {summary.outstanding > 0 ? `${INR(summary.outstanding)} due` : 'Fully settled'}
              </span>
            </div>
            {editable.length === 0 ? (
              <p className="field-static-label"><Icon className="ti ti-check" /> No upcoming installments to reschedule on this order.</p>
            ) : (
              <div className="asset-form-section">
                <div className="asset-form-section-title"><Icon className="ti ti-time" /> Upcoming Installments</div>
                <div className="due-dates-list">
                  {editable.map((p) => (
                    <div key={p.id} className="due-dates-row">
                      <div className="due-dates-info">
                        <strong>{paymentLabel(p)}</strong>
                        <span>
                          {INR(p.amount)} · {statusMeta(p.status).label}
                          {p.originalDueDate != null && p.originalDueDate !== p.dueDate ? ` · originally ${fmtDate(p.originalDueDate)}` : ''}
                        </span>
                      </div>
                      <label className="field-cell">
                        <div className="float-field float-always">
                          <input type="date" className="float-control" value={dates[p.id]} onChange={(e) => setDates((c) => ({ ...c, [p.id]: e.target.value }))} />
                          <span className="float-label">Due Date</span>
                        </div>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="crispr-modal-footer">
            <button type="button" className="legacy-btn legacy-btn-default" onClick={onClose}>Cancel</button>
            {editable.length > 0 && (
              <button type="submit" className="legacy-btn legacy-btn-success" disabled={changes.length === 0}>
                <Icon className="ti ti-check" /> Save {changes.length > 0 ? `${changes.length} Change${changes.length === 1 ? '' : 's'}` : 'Changes'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
