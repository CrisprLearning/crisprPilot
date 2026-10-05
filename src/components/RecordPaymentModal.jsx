import React, { useMemo, useState } from 'react';
import { paymentLabel, statusMeta, summarizeOrder } from '../lib/paymentsModel';
import { outstandingBase, previewSchedule, recordPayment } from '../lib/paymentsStore';
import Icon from './Icon';

const INR = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (ts) => (ts ? new Date(ts * 1000).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }) : '—');

const METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'dd', label: 'Demand Draft' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
];

/**
 * Manual payment entry against an order — settle a specific installment or
 * record an ad-hoc amount, with optional automatic rebalancing of the
 * remaining installments (preview shown before submitting).
 * Styled after the Orders page modals (order-modal-header strip + the
 * form-modal float-label fields used by its Email Invoice dialog).
 */
export default function RecordPaymentModal({ order, payments, onClose, onRecorded, initialApplyToId = null }) {
  const summary = useMemo(() => summarizeOrder(order, payments), [order, payments]);
  const payable = summary.rows.filter((p) => p.status !== 'paid');
  const due = outstandingBase(order);

  const preselected = initialApplyToId != null && payable.some((p) => p.id === initialApplyToId) ? initialApplyToId : null;
  const defaultTarget = preselected ?? (summary.nextDue && summary.nextDue.status !== 'pending' ? summary.nextDue.id : (payable[0]?.id ?? ''));
  const [applyTo, setApplyTo] = useState(defaultTarget === '' ? '' : String(defaultTarget));
  const targetRow = payable.find((p) => String(p.id) === applyTo) || null;
  const [amount, setAmount] = useState(targetRow ? String(targetRow.baseAmount) : '');
  const [channel, setChannel] = useState('OFFLINE');
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [dateStr, setDateStr] = useState(() => new Date().toISOString().slice(0, 10));
  const [rebalance, setRebalance] = useState(true);
  const [error, setError] = useState('');

  const base = Number(amount);
  const gst = Math.round(base * order.gstPercent) / 100;
  const validAmount = Number.isFinite(base) && base > 0 && base <= due + 0.005;

  // Old → new view of the not-yet-paid schedule if this payment is recorded.
  const scheduleDiff = useMemo(() => {
    if (!validAmount) return [];
    const after = previewSchedule(order, { applyToId: targetRow ? targetRow.id : null, baseAmount: base });
    const afterById = new Map(after.map((p) => [p.id, p]));
    return payable
      .filter((p) => !targetRow || p.id !== targetRow.id)
      .filter((p) => p.status === 'scheduled' || p.status === 'overdue')
      .map((p) => {
        const row = afterById.get(p.id);
        return { id: p.id, label: paymentLabel(p), dueDate: p.dueDate, from: p.baseAmount, to: row ? row.baseAmount : 0, dropped: !row };
      })
      .filter((d) => d.from !== d.to || d.dropped);
  }, [order, payable, targetRow, base, validAmount]);

  function selectTarget(value) {
    setApplyTo(value);
    setError('');
    const row = payable.find((p) => String(p.id) === value);
    setAmount(row ? String(row.baseAmount) : '');
  }

  function submit() {
    if (!Number.isFinite(base) || base <= 0) { setError('Enter a valid amount received.'); return; }
    if (base > due + 0.005) { setError(`Amount exceeds the outstanding balance of ${INR(due)} (excl. GST).`); return; }
    const paidAt = Math.floor(new Date(`${dateStr}T12:00:00`).getTime() / 1000);
    const recorded = recordPayment(order, {
      applyToId: targetRow ? targetRow.id : null,
      baseAmount: base,
      channel, method, reference: reference.trim(), note: note.trim(), paidAt,
      rebalance: rebalance && scheduleDiff.length > 0,
    });
    onRecorded?.(recorded);
    onClose();
  }

  return (
    <div className="crispr-modal-backdrop active" role="presentation" onClick={onClose}>
      <div className="crispr-modal-dialog record-payment-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="crispr-modal-header">
          <h3><Icon className="ti ti-pencil-alt" /> Record Payment - {order.orderNumber}</h3>
          <button type="button" className="crispr-modal-close" onClick={onClose}><Icon className="ti ti-close" /></button>
        </div>
        <form className="orders-modal-form form-modal" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <div className="crispr-modal-body">
            <div className="order-modal-header">
              <div>
                <Icon className="ti ti-user" /> {order.customer.name}
                <span><Icon className="ti ti-book" /> {order.item.title}</span>
                <span><Icon className="ti ti-wallet" /> Paid {INR(summary.paid)}</span>
              </div>
              <span className={`status-badge ${summary.outstanding > 0 ? 'status-pending' : 'status-completed'}`}>
                {summary.outstanding > 0 ? `${INR(summary.outstanding)} due` : 'Fully settled'}
              </span>
            </div>

            {due <= 0 ? (
              <p className="field-static-label"><Icon className="ti ti-check" /> This order is fully settled — nothing left to record.</p>
            ) : (
              <>
                <div className="asset-form-section">
                  <div className="asset-form-section-title"><Icon className="ti ti-money" /> Payment Details</div>
                  <div className="asset-form-grid">
                    <label className="field-cell full-span">
                      <div className="float-field float-always">
                        <select className="float-control" value={applyTo} onChange={(e) => selectTarget(e.target.value)}>
                          {payable.map((p) => (
                            <option key={p.id} value={String(p.id)}>
                              {paymentLabel(p)} — {INR(p.baseAmount)} + GST{p.dueDate ? ` · due ${fmtDate(p.dueDate)}` : ''} ({statusMeta(p.status).label})
                            </option>
                          ))}
                          <option value="">Other amount (not tied to an installment)</option>
                        </select>
                        <span className="float-label">Apply Towards</span>
                      </div>
                    </label>
                    <label className="field-cell">
                      <div className="float-field">
                        <input type="number" min="1" step="any" className="float-control" placeholder=" " value={amount} onChange={(e) => { setAmount(e.target.value); setError(''); }} />
                        <span className="float-label">Amount Received (excl. GST) <span className="req">*</span></span>
                      </div>
                      <span className="field-hint">
                        {Number.isFinite(base) && base > 0
                          ? <>+ GST ({order.gstPercent}%) {INR(gst)} → <strong>{INR(base + gst)} total</strong></>
                          : <>Outstanding: {INR(due)} excl. GST</>}
                      </span>
                    </label>
                    <label className="field-cell">
                      <div className="float-field float-always">
                        <input type="date" className="float-control" value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
                        <span className="float-label">Received On</span>
                      </div>
                    </label>
                    <label className="field-cell">
                      <div className="float-field float-always">
                        <select className="float-control" value={channel} onChange={(e) => setChannel(e.target.value)}>
                          <option value="OFFLINE">Offline</option>
                          <option value="ONLINE">Online</option>
                        </select>
                        <span className="float-label">Channel</span>
                      </div>
                    </label>
                    <label className="field-cell">
                      <div className="float-field float-always">
                        <select className="float-control" value={method} onChange={(e) => setMethod(e.target.value)}>
                          {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                        <span className="float-label">Method</span>
                      </div>
                    </label>
                    <label className="field-cell">
                      <div className="float-field">
                        <input type="text" className="float-control" placeholder=" " value={reference} onChange={(e) => setReference(e.target.value)} />
                        <span className="float-label">Reference # (cheque / txn id)</span>
                      </div>
                    </label>
                    <label className="field-cell">
                      <div className="float-field">
                        <input type="text" className="float-control" placeholder=" " value={note} onChange={(e) => setNote(e.target.value)} />
                        <span className="float-label">Note</span>
                      </div>
                    </label>
                  </div>
                </div>

                {scheduleDiff.length > 0 && (
                  <div className="asset-form-section">
                    <div className="asset-form-section-title"><Icon className="ti ti-exchange-vertical" /> Installment Adjustment</div>
                    <label className="rp-adjust-check">
                      <input type="checkbox" checked={rebalance} onChange={(e) => setRebalance(e.target.checked)} />
                      <span>Adjust remaining installments to match the balance due</span>
                    </label>
                    {rebalance ? (
                      <div className="order-summary rp-diff">
                        {scheduleDiff.map((d) => (
                          <div key={d.id} className="summary-row">
                            <span>{d.label}{d.dueDate ? ` (due ${fmtDate(d.dueDate)})` : ''}</span>
                            {d.dropped || d.to === 0
                              ? <span className="rp-diff-to is-drop"><s>{INR(d.from)}</s> → cleared</span>
                              : <span className="rp-diff-to"><s>{INR(d.from)}</s> → <strong>{INR(d.to)}</strong> + GST</span>}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="field-hint">Installment amounts will be left as they are; the difference stays in the outstanding balance.</p>
                    )}
                  </div>
                )}

                {error ? <p className="field-error"><Icon className="ti ti-alert" /> {error}</p> : null}
              </>
            )}
          </div>
          <div className="crispr-modal-footer">
            <button type="button" className="legacy-btn legacy-btn-default" onClick={onClose}>Cancel</button>
            {due > 0 && (
              <button type="submit" className="legacy-btn legacy-btn-success" disabled={!validAmount}>
                <Icon className="ti ti-check" /> Record {Number.isFinite(base) && base > 0 ? INR(base + gst) : 'Payment'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
