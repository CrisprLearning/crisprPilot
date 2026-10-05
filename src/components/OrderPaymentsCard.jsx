import React from 'react';
import {
  methodIcon, methodLabel, orderStateMeta, paymentLabel, statusMeta, summarizeOrder,
} from '../lib/paymentsModel';
import Icon from './Icon';

const INR = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (ts) => (ts ? new Date(ts * 1000).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }) : '—');

/**
 * Order-wise payment tracker: fee breakdown, paid vs outstanding, and the
 * timeline of payments made + installments still due.
 *
 * Props:
 *  - order:     order record (see src/data/paymentsDemo.js)
 *  - payments:  payment list (global list is fine — filtered by order here)
 *  - compact:   hide the fee breakdown (used inside modals / narrow columns)
 *  - onViewPayments: optional → renders a "View in Payments" action
 *  - highlightPaymentId: optional payment id to emphasise in the timeline
 */
export default function OrderPaymentsCard({ order, payments, compact = false, onViewPayments, highlightPaymentId }) {
  const s = summarizeOrder(order, payments);
  const state = orderStateMeta(s.state);
  const lineDiscount = order.feeLines.reduce((sum, l) => sum + ((l.originalAmount || l.amount) - l.amount), 0);
  const couponDiscount = (order.discounts || []).reduce((sum, d) => sum + d.amount, 0);

  return (
    <div className={`opc opc-${state.tone}`}>
      <div className="opc-head">
        <div className="opc-title">
          <div className="opc-order">
            <span className="opc-order-no">{order.orderNumber}</span>
            <span className={`opc-mode is-${order.paymentMode.toLowerCase()}`}>
              <Icon className={`ti ${order.paymentMode === 'INSTALLMENTS' ? 'ti-layout-list-thumb' : 'ti-check-box'}`} />
              {order.paymentMode === 'INSTALLMENTS' ? 'Installments' : 'Full payment'}
            </span>
            <span className={`opc-state is-${state.tone}`}><span className="opc-state-dot" />{state.label}</span>
          </div>
          <div className="opc-item">{order.item.title} <small>· {order.item.code} · ordered {fmtDate(order.orderDate)}</small></div>
        </div>
        <div className="opc-figures">
          <div className="opc-figure"><small>Paid</small><strong className="is-good">{INR(s.paid)}</strong></div>
          <div className="opc-figure"><small>Outstanding</small><strong className={s.outstanding > 0 ? (s.state === 'overdue' ? 'is-bad' : 'is-warn') : ''}>{INR(s.outstanding)}</strong></div>
          <div className="opc-figure"><small>Order total</small><strong>{INR(s.total)}</strong></div>
        </div>
      </div>

      <div className="opc-bar" role="progressbar" aria-valuenow={s.paidPct} aria-valuemin="0" aria-valuemax="100" title={`${s.paidPct}% paid`}>
        <div className="opc-bar-fill" style={{ width: `${s.paidPct}%` }} />
      </div>
      <div className="opc-bar-meta">
        <span>{s.paidPct}% of order settled</span>
        {s.nextDue ? (
          <span className={`opc-next is-${statusMeta(s.nextDue.status).tone}`}>
            <Icon className="ti ti-alarm-clock" />
            {s.nextDue.status === 'overdue' ? 'Overdue since' : 'Next due'} {fmtDate(s.nextDue.dueDate)} · {INR(s.nextDue.amount)}
          </span>
        ) : <span className="opc-next is-good"><Icon className="ti ti-check" /> Nothing pending</span>}
      </div>

      <div className={`opc-body ${compact ? 'is-compact' : ''}`}>
        {!compact && (
          <div className="opc-fees">
            <div className="opc-section-title"><Icon className="ti ti-receipt" /> Fee breakdown</div>
            <dl className="opc-rows">
              {order.feeLines.map((l) => (
                <div key={l.key}>
                  <dt>{l.label}{l.discountNote ? <small>{l.discountNote}</small> : null}</dt>
                  <dd>
                    {l.originalAmount && l.originalAmount !== l.amount ? <s>{INR(l.originalAmount)}</s> : null}
                    {INR(l.amount)}
                  </dd>
                </div>
              ))}
              {(order.discounts || []).map((d) => (
                <div key={d.code}><dt>Discount <small>{d.code}</small></dt><dd className="is-good">− {INR(d.amount)}</dd></div>
              ))}
              <div className="opc-sep" />
              <div><dt>Subtotal</dt><dd>{INR(order.subtotal - couponDiscount)}</dd></div>
              <div><dt>GST ({order.gstPercent}%)</dt><dd>{INR(order.gstAmount)}</dd></div>
              <div className="is-total"><dt>Total payable</dt><dd>{INR(order.totalAmount)}</dd></div>
              {lineDiscount + couponDiscount > 0 ? (
                <div className="opc-saved"><dt /><dd className="is-good">You saved {INR(lineDiscount + couponDiscount)}</dd></div>
              ) : null}
            </dl>
          </div>
        )}

        <div className="opc-timeline">
          <div className="opc-section-title">
            <Icon className="ti ti-time" /> Payments
            <span className="opc-count">{s.rows.filter((p) => p.status === 'paid').length} of {s.rows.length} settled</span>
          </div>
          <ol className="opc-steps">
            {s.rows.map((p) => {
              const m = statusMeta(p.status);
              return (
                <li key={p.id} className={`opc-step is-${m.tone} ${highlightPaymentId === p.id ? 'is-highlight' : ''}`}>
                  <span className="opc-step-dot"><Icon className={`ti ${p.status === 'paid' ? 'ti-check' : p.status === 'overdue' || p.status === 'failed' ? 'ti-alert' : 'ti-time'}`} /></span>
                  <div className="opc-step-body">
                    <div className="opc-step-top">
                      <span className="opc-step-label">{paymentLabel(p)}</span>
                      <span className="opc-step-amt">{INR(p.amount)}</span>
                    </div>
                    <div className="opc-step-meta">
                      <span className={`opc-pill is-${m.tone}`}>{m.label}</span>
                      {p.status === 'paid' ? (
                        <>
                          <span><Icon className="ti ti-calendar" /> {fmtDate(p.paidAt)}</span>
                          <span className={`opc-chan is-${p.channel.toLowerCase()}`}>{p.channel}</span>
                          <span><Icon className={`ti ${methodIcon(p.method)}`} /> {methodLabel(p.method)}</span>
                          {p.reference ? <span className="is-mono">{p.reference}</span> : null}
                        </>
                      ) : (
                        <>
                          {p.dueDate ? <span><Icon className="ti ti-calendar" /> Due {fmtDate(p.dueDate)}</span> : null}
                          {p.method ? <span><Icon className={`ti ${methodIcon(p.method)}`} /> {methodLabel(p.method)}</span> : null}
                        </>
                      )}
                      {p.note ? <span className="opc-note"><Icon className="ti ti-comment-alt" /> {p.note}</span> : null}
                      {p.originalBaseAmount != null && p.originalBaseAmount !== p.baseAmount ? (
                        <span className="opc-adjusted" title={`Adjusted from ${INR(p.originalBaseAmount)} + GST`}>adjusted from <s>{INR(p.originalBaseAmount)}</s></span>
                      ) : null}
                      {p.originalDueDate != null && p.originalDueDate !== p.dueDate ? (
                        <span className="opc-adjusted">rescheduled from {fmtDate(p.originalDueDate)}</span>
                      ) : null}
                      {p.mergedFrom?.length ? (
                        <span className="opc-adjusted" title={p.mergedFrom.map((m) => `${m.label} (${INR(m.amount)})`).join(' + ')}>merged from {p.mergedFrom.length} installments</span>
                      ) : null}
                      <span className="opc-step-gst">{INR(p.baseAmount)} + GST {INR(p.gstAmount)}</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      {onViewPayments ? (
        <div className="opc-foot">
          <button type="button" className="opc-link" onClick={() => onViewPayments(order)}>
            <Icon className="ti ti-list" /> View in Payments
          </button>
        </div>
      ) : null}
    </div>
  );
}
