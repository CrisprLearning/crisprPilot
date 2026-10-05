import React, { useMemo, useState } from 'react';
import { catalogItemsDemo } from '../data/adminRemainingDemo';
import { demoCandidates } from '../data/candidateProfileDemo';
import { createOrderBundle } from '../lib/paymentsStore';
import Icon from './Icon';

const INR = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const round2 = (n) => Math.round(n * 100) / 100;
const GST_PERCENT = 18;

const METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'dd', label: 'Demand Draft' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'netbanking', label: 'Net Banking' },
];

function defaultItemState(catalogItem) {
  return {
    catalogItem,
    fee: String(catalogItem.sellingPrice),
    discountAmount: '',
    discountCode: '',
    paymentMode: 'FULL',
    initialStatus: 'paid',
    paidNow: '',
    installmentCount: '2',
    firstDueDate: '',
  };
}

/** Per-item derived amounts + validation error (null when the item is valid). */
function itemMath(item) {
  const fee = Number(item.fee);
  const discount = item.discountAmount === '' ? 0 : Number(item.discountAmount);
  const payable = round2(fee - discount);
  const gst = round2(payable * (GST_PERCENT / 100));
  const total = round2(payable + gst);
  const paidNow = item.paymentMode === 'INSTALLMENTS'
    ? Number(item.paidNow)
    : (item.initialStatus === 'paid' ? payable : 0);

  let error = null;
  if (!Number.isFinite(fee) || fee <= 0) error = 'Enter a fee amount.';
  else if (!Number.isFinite(discount) || discount < 0) error = 'Discount must be zero or more.';
  else if (payable <= 0) error = 'Discount cannot cover the entire fee.';
  else if (item.paymentMode === 'INSTALLMENTS') {
    const count = Number(item.installmentCount);
    if (!Number.isFinite(paidNow) || paidNow <= 0) error = 'Enter the amount collected now.';
    else if (paidNow >= payable) error = 'Amount collected covers the full fee — use Full payment instead.';
    else if (!Number.isInteger(count) || count < 1 || count > 24) error = 'Remaining installments must be between 1 and 24.';
    else if (!item.firstDueDate) error = 'Pick the first installment due date.';
  }

  return { fee, discount, payable, gst, total, paidNow: error ? 0 : round2(paidNow), error };
}

/**
 * Manual order-bundle creation — staff picks one or more catalog items (each
 * becomes its own order in the bundle), tags an already-registered student
 * (untagged/unknown people cannot be mapped to an order), and fills in the
 * pricing and payment plan for each item.
 */
export default function CreateOrderBundleModal({ onClose, onCreated }) {
  const [studentQuery, setStudentQuery] = useState('');
  const [student, setStudent] = useState(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [items, setItems] = useState([]);
  const [channel, setChannel] = useState('OFFLINE');
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [dateStr, setDateStr] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState('');

  const query = studentQuery.trim().toLowerCase();
  const studentMatches = useMemo(() => {
    if (!query) return [];
    return demoCandidates
      .filter((c) => [c.name, c.email, c.mobile, c.candidateKey].some((v) => String(v || '').toLowerCase().includes(query)))
      .slice(0, 6);
  }, [query]);

  const availableItems = catalogItemsDemo.filter(
    (c) => c.status === 1 && !items.some((item) => item.catalogItem.id === c.id)
  );

  const math = items.map(itemMath);
  const totals = math.reduce((acc, m) => ({
    subtotal: round2(acc.subtotal + (m.error ? 0 : m.fee)),
    discount: round2(acc.discount + (m.error ? 0 : m.discount)),
    gst: round2(acc.gst + (m.error ? 0 : m.gst)),
    total: round2(acc.total + (m.error ? 0 : m.total)),
    paidNow: round2(acc.paidNow + m.paidNow),
  }), { subtotal: 0, discount: 0, gst: 0, total: 0, paidNow: 0 });

  const valid = student && items.length > 0 && math.every((m) => !m.error);

  function updateItem(index, patch) {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
    setError('');
  }

  function submit() {
    if (!valid) return;
    const orderDate = Math.floor(new Date(`${dateStr}T12:00:00`).getTime() / 1000);
    try {
      const result = createOrderBundle({
        customer: { id: student.candidateKey, name: student.name, email: student.email, phone: student.mobile },
        orderDate,
        payment: { channel, method, reference: reference.trim() },
        items: items.map((item, index) => ({
          catalogItem: item.catalogItem,
          feeLines: [{ key: 'course', label: `${item.catalogItem.type} Fee`, amount: math[index].fee }],
          discount: math[index].discount > 0
            ? { code: item.discountCode.trim() || 'MANUAL', description: 'Manual discount', amount: math[index].discount }
            : null,
          paymentMode: item.paymentMode,
          initialStatus: item.initialStatus,
          paidNow: Number(item.paidNow),
          installmentCount: Number(item.installmentCount),
          firstDueDate: item.firstDueDate ? Math.floor(new Date(`${item.firstDueDate}T12:00:00`).getTime() / 1000) : null,
        })),
      });
      onCreated?.(result);
      onClose();
    } catch (err) {
      setError(err.message || 'Could not create the order bundle.');
    }
  }

  return (
    <div className="crispr-modal-backdrop active" role="presentation" onClick={onClose}>
      <div className="crispr-modal-dialog order-dialog create-order-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="crispr-modal-header">
          <h3><Icon className="ti ti-plus" /> Create Order Bundle</h3>
          <button type="button" className="crispr-modal-close" onClick={onClose}><Icon className="ti ti-close" /></button>
        </div>
        <form className="orders-modal-form form-modal" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <div className="crispr-modal-body">

            <div className="asset-form-section">
              <div className="asset-form-section-title"><Icon className="ti ti-user" /> Student</div>
              {student ? (
                <div className="cob-student-card">
                  <div>
                    <strong>{student.name}</strong>
                    <div className="profile-subtext">{student.email} · {student.mobile} · {student.candidateKey}</div>
                  </div>
                  <button type="button" className="legacy-btn legacy-btn-default" onClick={() => { setStudent(null); setStudentQuery(''); }}>Change</button>
                </div>
              ) : (
                <div className="cob-student-search">
                  <div className="float-field">
                    <input
                      type="text"
                      className="float-control"
                      placeholder=" "
                      value={studentQuery}
                      onChange={(e) => setStudentQuery(e.target.value)}
                      onFocus={() => setSearchFocused(true)}
                      onBlur={() => window.setTimeout(() => setSearchFocused(false), 150)}
                    />
                    <span className="float-label">Search registered students by name, email, or phone <span className="req">*</span></span>
                  </div>
                  {searchFocused && query ? (
                    <div className="cob-student-results">
                      {studentMatches.length > 0 ? studentMatches.map((candidate) => (
                        <button
                          key={candidate.id}
                          type="button"
                          className="cob-student-result"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => { setStudent(candidate); setError(''); }}
                        >
                          <strong>{candidate.name}</strong>
                          <span>{candidate.email} · {candidate.mobile}</span>
                        </button>
                      )) : (
                        <div className="cob-student-empty">
                          <Icon className="ti ti-alert" /> No registered student matches “{studentQuery.trim()}”.
                          Orders can only be created for students already in the system.
                        </div>
                      )}
                    </div>
                  ) : null}
                  <span className="field-hint">Only registered students can be tagged — register the student first if they are not in the system.</span>
                </div>
              )}
            </div>

            <div className="asset-form-section">
              <div className="asset-form-section-title"><Icon className="ti ti-package" /> Catalog Items ({items.length} order{items.length === 1 ? '' : 's'} in bundle)</div>
              {availableItems.length > 0 && (
                <div className="cob-catalog-list">
                  {availableItems.map((catalogItem) => (
                    <div key={catalogItem.id} className="cob-catalog-row">
                      <div>
                        <strong>{catalogItem.title}</strong>
                        <div className="profile-subtext">{catalogItem.code} · {catalogItem.type} · {INR(catalogItem.sellingPrice)}</div>
                      </div>
                      <button type="button" className="legacy-btn legacy-btn-default" onClick={() => { setItems((current) => [...current, defaultItemState(catalogItem)]); setError(''); }}>
                        <Icon className="ti ti-plus" /> Add
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {items.length === 0 ? (
                <p className="field-static-label">Add at least one catalog item — each item becomes its own order within the bundle.</p>
              ) : items.map((item, index) => (
                <div key={item.catalogItem.id} className="cob-item-card">
                  <div className="cob-item-head">
                    <div>
                      <strong>{item.catalogItem.title}</strong>
                      <div className="profile-subtext">{item.catalogItem.code} · {item.catalogItem.type}</div>
                    </div>
                    <button type="button" className="cob-item-remove" title="Remove item" onClick={() => setItems((current) => current.filter((_, i) => i !== index))}>
                      <Icon className="ti ti-trash" />
                    </button>
                  </div>
                  <div className="asset-form-grid">
                    <label className="field-cell">
                      <div className="float-field">
                        <input type="number" min="1" step="any" className="float-control" placeholder=" " value={item.fee} onChange={(e) => updateItem(index, { fee: e.target.value })} />
                        <span className="float-label">Fee (excl. GST) <span className="req">*</span></span>
                      </div>
                    </label>
                    <label className="field-cell">
                      <div className="float-field">
                        <input type="number" min="0" step="any" className="float-control" placeholder=" " value={item.discountAmount} onChange={(e) => updateItem(index, { discountAmount: e.target.value })} />
                        <span className="float-label">Discount Amount</span>
                      </div>
                    </label>
                    <label className="field-cell">
                      <div className="float-field">
                        <input type="text" className="float-control" placeholder=" " value={item.discountCode} onChange={(e) => updateItem(index, { discountCode: e.target.value })} />
                        <span className="float-label">Discount Code</span>
                      </div>
                    </label>
                    <label className="field-cell">
                      <div className="float-field float-always">
                        <select className="float-control" value={item.paymentMode} onChange={(e) => updateItem(index, { paymentMode: e.target.value })}>
                          <option value="FULL">Full payment</option>
                          <option value="INSTALLMENTS">Installments</option>
                        </select>
                        <span className="float-label">Payment Plan</span>
                      </div>
                    </label>
                    {item.paymentMode === 'FULL' ? (
                      <label className="field-cell">
                        <div className="float-field float-always">
                          <select className="float-control" value={item.initialStatus} onChange={(e) => updateItem(index, { initialStatus: e.target.value })}>
                            <option value="paid">Collected</option>
                            <option value="pending">Awaiting payment</option>
                          </select>
                          <span className="float-label">Payment Status</span>
                        </div>
                      </label>
                    ) : (
                      <>
                        <label className="field-cell">
                          <div className="float-field">
                            <input type="number" min="1" step="any" className="float-control" placeholder=" " value={item.paidNow} onChange={(e) => updateItem(index, { paidNow: e.target.value })} />
                            <span className="float-label">Collected Now (excl. GST) <span className="req">*</span></span>
                          </div>
                        </label>
                        <label className="field-cell">
                          <div className="float-field">
                            <input type="number" min="1" max="24" step="1" className="float-control" placeholder=" " value={item.installmentCount} onChange={(e) => updateItem(index, { installmentCount: e.target.value })} />
                            <span className="float-label">Remaining Installments <span className="req">*</span></span>
                          </div>
                        </label>
                        <label className="field-cell">
                          <div className="float-field float-always">
                            <input type="date" className="float-control" value={item.firstDueDate} onChange={(e) => updateItem(index, { firstDueDate: e.target.value })} />
                            <span className="float-label">First Due Date <span className="req">*</span></span>
                          </div>
                        </label>
                      </>
                    )}
                  </div>
                  {math[index].error ? (
                    <p className="field-error"><Icon className="ti ti-alert" /> {math[index].error}</p>
                  ) : (
                    <span className="field-hint">
                      {INR(math[index].payable)} + GST ({GST_PERCENT}%) {INR(math[index].gst)} → <strong>{INR(math[index].total)}</strong>
                      {item.paymentMode === 'INSTALLMENTS'
                        ? <> · {INR(round2(math[index].payable - math[index].paidNow))} split into {Number(item.installmentCount) || '—'} monthly installment{Number(item.installmentCount) === 1 ? '' : 's'}</>
                        : null}
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div className="asset-form-section">
              <div className="asset-form-section-title"><Icon className="ti ti-money" /> Payment Details</div>
              <div className="asset-form-grid">
                <label className="field-cell">
                  <div className="float-field float-always">
                    <input type="date" className="float-control" value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
                    <span className="float-label">Order Date</span>
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
              </div>
            </div>

            {items.length > 0 && (
              <div className="asset-form-section">
                <div className="asset-form-section-title"><Icon className="ti ti-receipt" /> Bundle Summary</div>
                <div className="order-summary">
                  <div className="summary-row"><span>Subtotal</span><span>{INR(totals.subtotal)}</span></div>
                  {totals.discount > 0 ? <div className="summary-row discount"><span>Discount</span><span>-{INR(totals.discount)}</span></div> : null}
                  <div className="summary-row"><span>GST ({GST_PERCENT}%)</span><span>{INR(totals.gst)}</span></div>
                  <div className="summary-row total"><span>Bundle Total</span><span>{INR(totals.total)}</span></div>
                  <div className="summary-row discount"><span>Collected Now (incl. GST)</span><span>{INR(round2(totals.paidNow * (1 + GST_PERCENT / 100)))}</span></div>
                  {totals.total - totals.paidNow * (1 + GST_PERCENT / 100) > 0.005 ? (
                    <div className="summary-row outstanding"><span>Outstanding</span><span>{INR(round2(totals.total - totals.paidNow * (1 + GST_PERCENT / 100)))}</span></div>
                  ) : null}
                </div>
              </div>
            )}

            {error ? <p className="field-error"><Icon className="ti ti-alert" /> {error}</p> : null}
          </div>
          <div className="crispr-modal-footer">
            <button type="button" className="legacy-btn legacy-btn-default" onClick={onClose}>Cancel</button>
            <button type="submit" className="legacy-btn legacy-btn-success" disabled={!valid}>
              <Icon className="ti ti-check" /> Create {items.length > 0 ? `${items.length} Order${items.length === 1 ? '' : 's'} in Bundle` : 'Order Bundle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
