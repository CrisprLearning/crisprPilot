import React, { useMemo, useState } from 'react';
import { batchesDemo, catalogItemsDemo } from '../data/adminRemainingDemo';
import { getAllOrders, useManualOrders, usePayments } from '../lib/paymentsStore';
import { methodLabel, paymentLabel } from '../lib/paymentsModel';
import MultiSelectDropdown from '../components/MultiSelectDropdown';
import Icon from '../components/Icon';

const INR = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const round2 = (n) => Math.round(n * 100) / 100;
const fmtDate = (ts) => (ts ? new Date(ts * 1000).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }) : '—');

const METHOD_OPTIONS = ['upi', 'card', 'netbanking', 'wallet', 'cash', 'cheque', 'bank_transfer', 'dd'];
const FY_OPTIONS = [2024, 2025, 2026, 2027];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const pad2 = (n) => String(n).padStart(2, '0');
const localYmd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const fyOf = (d) => (d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1); // FY starts 1 April

/** One-click period presets; each returns the wizard fields it wants set. */
const PRESETS = [
  { label: 'This month', make: (now) => ({ periodMode: 'month', monthStr: `${now.getFullYear()}-${pad2(now.getMonth() + 1)}` }) },
  { label: 'Last month', make: (now) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { periodMode: 'month', monthStr: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}` };
  } },
  { label: 'Last 3 months', make: (now) => ({
    periodMode: 'range',
    fromStr: localYmd(new Date(now.getFullYear(), now.getMonth() - 2, 1)),
    toStr: localYmd(now),
  }) },
  { label: 'This FY', make: (now) => ({ periodMode: 'fy', fyStart: fyOf(now) }) },
  { label: 'Last FY', make: (now) => ({ periodMode: 'fy', fyStart: fyOf(now) - 1 }) },
];

/** Resolves the wizard's period inputs to {start, end} UNIX seconds + label. */
function resolvePeriod({ periodMode, fromStr, toStr, monthStr, fyStart }) {
  if (periodMode === 'range') {
    if (!fromStr || !toStr) return null;
    const start = new Date(`${fromStr}T00:00:00`).getTime() / 1000;
    const end = new Date(`${toStr}T23:59:59`).getTime() / 1000;
    if (!(start <= end)) return null;
    return { start, end, label: `${fmtDate(start)} – ${fmtDate(end)}` };
  }
  if (periodMode === 'month') {
    if (!monthStr) return null;
    const [year, month] = monthStr.split('-').map(Number);
    const start = new Date(year, month - 1, 1).getTime() / 1000;
    const end = new Date(year, month, 1).getTime() / 1000 - 1;
    return { start, end, label: `${MONTH_NAMES[month - 1]} ${year}` };
  }
  const start = new Date(fyStart, 3, 1).getTime() / 1000; // 1 April
  const end = new Date(fyStart + 1, 3, 1).getTime() / 1000 - 1; // 31 March EOD
  return { start, end, label: `FY ${fyStart}–${String((fyStart + 1) % 100).padStart(2, '0')} (Apr ${fyStart} – Mar ${fyStart + 1})` };
}

function csvEscape(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename, headerRows, columns, rows, totalsRow) {
  const lines = [
    ...headerRows.map((r) => csvEscape(r)),
    columns.map(csvEscape).join(','),
    ...rows.map((row) => row.map(csvEscape).join(',')),
    totalsRow.map(csvEscape).join(','),
  ];
  // BOM so Excel opens UTF-8 (₹ in labels) correctly.
  const blob = new Blob(['\ufeff', lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Standalone printable HTML document for the View / PDF actions. */
function openReportWindow({ title, meta, columns, rows, totalsRow, gstTotal, grandTotal, print }) {
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
  const numeric = new Set(columns.filter((c) => c.numeric).map((c) => c.label));
  const th = columns.map((c) => `<th class="${numeric.has(c.label) ? 'num' : ''}">${esc(c.label)}</th>`).join('');
  const body = rows.map((row) => `<tr>${row.map((cell, i) => `<td class="${columns[i].numeric ? 'num' : ''}">${esc(cell)}</td>`).join('')}</tr>`).join('');
  const totals = `<tr class="totals">${totalsRow.map((cell, i) => `<td class="${columns[i].numeric ? 'num' : ''}">${esc(cell)}</td>`).join('')}</tr>`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #16353c; margin: 28px; }
  h2 { margin: 0 0 2px; }
  .brand { color: #59757b; font-size: 12px; margin: 0 0 14px; }
  .meta { font-size: 13px; color: #16353c; margin: 0 0 4px; }
  .meta strong { display: inline-block; min-width: 110px; }
  .highlights { display: flex; gap: 12px; margin: 16px 0; }
  .highlight { border: 1px solid #d7e5e8; border-radius: 8px; padding: 10px 16px; }
  .highlight small { display: block; color: #59757b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
  .highlight strong { font-size: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 11.5px; margin-top: 6px; }
  th, td { border: 1px solid #d7e5e8; padding: 6px 8px; text-align: left; }
  thead th { background: #006073; color: #fff; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  tr.totals td { font-weight: 700; background: #f4f9fa; }
  .footer { margin-top: 18px; font-size: 11px; color: #59757b; }
  @media print { body { margin: 10mm; } }
</style></head><body>
  <h2>${esc(title)}</h2>
  <p class="brand">Crispr Pilot · Educational Platform · www.crisprlearning.com</p>
  ${meta.map((m) => `<p class="meta"><strong>${esc(m[0])}:</strong> ${esc(m[1])}</p>`).join('')}
  <div class="highlights">
    <div class="highlight"><small>Records</small><strong>${rows.length}</strong></div>
    <div class="highlight"><small>Total GST</small><strong>${esc(INR(gstTotal))}</strong></div>
    <div class="highlight"><small>Grand Total</small><strong>${esc(INR(grandTotal))}</strong></div>
  </div>
  <table><thead><tr>${th}</tr></thead><tbody>${body}${totals}</tbody></table>
  <p class="footer">Generated on ${esc(new Date().toLocaleString('en-IN'))} — computer-generated report, no signature required.</p>
  ${print ? '<script>window.onload = function () { window.print(); };</script>' : ''}
</body></html>`;

  const win = window.open('', '_blank');
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}

export default function CommerceReportsPage() {
  const payments = usePayments();
  const manualOrders = useManualOrders();
  const allOrders = useMemo(() => getAllOrders(), [manualOrders]);

  const [reportType, setReportType] = useState('orders');
  const [periodMode, setPeriodMode] = useState('range');
  const [fromStr, setFromStr] = useState('');
  const [toStr, setToStr] = useState('');
  const [monthStr, setMonthStr] = useState('');
  const [fyStart, setFyStart] = useState(2026);
  const [courseCodes, setCourseCodes] = useState([]); // [] = all courses / items
  const [batchIds, setBatchIds] = useState([]); // [] = all students
  const [method, setMethod] = useState('');
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');

  // Course choices = catalog entries + any item that appears on an order
  // (covers legacy order items that were never added to the catalog demo).
  const courseOptions = useMemo(() => {
    const byCode = new Map(catalogItemsDemo.map((c) => [c.code, c.title]));
    allOrders.forEach((o) => { if (!byCode.has(o.item.code)) byCode.set(o.item.code, o.item.title); });
    return [...byCode.entries()].map(([code, title]) => ({ code, title }));
  }, [allOrders]);

  const period = resolvePeriod({ periodMode, fromStr, toStr, monthStr, fyStart });

  function applyPreset(preset) {
    const patch = preset.make(new Date());
    setPeriodMode(patch.periodMode);
    if (patch.fromStr != null) setFromStr(patch.fromStr);
    if (patch.toStr != null) setToStr(patch.toStr);
    if (patch.monthStr != null) setMonthStr(patch.monthStr);
    if (patch.fyStart != null) {
      setFyStart(Math.min(Math.max(patch.fyStart, FY_OPTIONS[0]), FY_OPTIONS[FY_OPTIONS.length - 1]));
    }
    setError('');
  }

  function generate() {
    if (!period) {
      setError(periodMode === 'range' ? 'Pick a valid from / to date (from must not be after to).' : 'Pick a month.');
      return;
    }
    setError('');

    const batches = batchesDemo.filter((b) => batchIds.includes(b.id));
    const batchStudents = batches.length ? new Set(batches.flatMap((b) => b.students)) : null;
    const courses = courseOptions.filter((c) => courseCodes.includes(c.code));
    const courseSet = courses.length ? new Set(courses.map((c) => c.code)) : null;

    const filters = [];
    if (courses.length) {
      filters.push([
        courses.length === 1 ? 'Course / item' : 'Courses / items',
        courses.map((c) => `${c.title} (${c.code})`).join(', '),
      ]);
    }
    if (batches.length) {
      filters.push([
        batches.length === 1 ? 'Student batch' : 'Student batches',
        `${batches.map((b) => b.batchName).join(', ')} (${batchStudents.size} students)`,
      ]);
    }
    if (reportType === 'payments' && method) filters.push(['Payment method', methodLabel(method)]);

    if (reportType === 'orders') {
      const rows = allOrders
        .filter((o) => o.orderDate >= period.start && o.orderDate <= period.end)
        .filter((o) => !courseSet || courseSet.has(o.item.code))
        .filter((o) => !batchStudents || batchStudents.has(o.customer.name))
        .sort((a, b) => a.orderDate - b.orderDate)
        .map((o) => {
          const discount = (o.discounts || []).reduce((s, d) => s + d.amount, 0);
          const paid = payments.filter((p) => p.orderId === o.id && p.status === 'paid').reduce((s, p) => s + p.amount, 0);
          return {
            cells: [
              o.orderNumber, o.bundleNumber, fmtDate(o.orderDate), o.customer.name,
              `${o.item.title} (${o.item.code})`, o.paymentMode === 'INSTALLMENTS' ? 'Installments' : 'Full',
              o.subtotal, discount, round2(o.subtotal - discount), o.gstAmount, o.totalAmount,
              round2(paid), round2(Math.max(0, o.totalAmount - paid)),
            ],
            gst: o.gstAmount, total: o.totalAmount,
          };
        });
      setReport(buildReport({
        title: 'Orders Report', period, filters, rows,
        columns: [
          { label: 'Order ID' }, { label: 'Bundle' }, { label: 'Order Date' }, { label: 'Customer' },
          { label: 'Item' }, { label: 'Plan' },
          { label: 'Subtotal', numeric: true, sum: true }, { label: 'Discount', numeric: true, sum: true },
          { label: 'Taxable', numeric: true, sum: true }, { label: 'GST', numeric: true, sum: true },
          { label: 'Total', numeric: true, sum: true }, { label: 'Paid', numeric: true, sum: true },
          { label: 'Outstanding', numeric: true, sum: true },
        ],
      }));
    } else {
      const orderById = new Map(allOrders.map((o) => [o.id, o]));
      const rows = payments
        .filter((p) => p.status === 'paid' && p.paidAt && p.paidAt >= period.start && p.paidAt <= period.end)
        .filter((p) => !method || p.method === method)
        .filter((p) => !courseSet || courseSet.has(p.itemCode) || courseSet.has(orderById.get(p.orderId)?.item.code))
        .filter((p) => !batchStudents || batchStudents.has(p.customer.name))
        .sort((a, b) => a.paidAt - b.paidAt)
        .map((p) => ({
          cells: [
            p.paymentNumber, fmtDate(p.paidAt), p.orderNumber, p.customer.name, p.itemTitle,
            paymentLabel(p), p.channel === 'OFFLINE' ? 'Offline' : 'Online', methodLabel(p.method), p.reference || '—',
            p.baseAmount, p.gstAmount, p.amount,
          ],
          gst: p.gstAmount, total: p.amount,
        }));
      setReport(buildReport({
        title: method ? `Payments Report — ${methodLabel(method)}` : 'Payments Report', period, filters, rows,
        columns: [
          { label: 'Payment #' }, { label: 'Paid On' }, { label: 'Order ID' }, { label: 'Customer' },
          { label: 'Item' }, { label: 'Towards' }, { label: 'Channel' }, { label: 'Method' }, { label: 'Reference' },
          { label: 'Base (excl. GST)', numeric: true, sum: true }, { label: 'GST', numeric: true, sum: true },
          { label: 'Amount', numeric: true, sum: true },
        ],
      }));
    }
  }

  function buildReport({ title, period: p, filters, columns, rows }) {
    const sums = columns.map((col, i) => (
      col.sum ? round2(rows.reduce((s, row) => s + Number(row.cells[i] || 0), 0)) : null
    ));
    const gstIndex = columns.findIndex((c) => c.label === 'GST');
    const grandIndex = columns.findIndex((c) => c.label === 'Total' || c.label === 'Amount');
    const baseIndex = columns.findIndex((c) => c.label === 'Taxable' || c.label === 'Base (excl. GST)');
    return {
      title, periodLabel: p.label, filters, columns, rows, sums,
      baseTotal: sums[baseIndex] || 0,
      baseLabel: columns[baseIndex]?.label === 'Taxable' ? 'Taxable Value' : 'Base (excl. GST)',
      gstTotal: sums[gstIndex] || 0,
      grandTotal: sums[grandIndex] || 0,
    };
  }

  function totalsRowText(r) {
    return r.columns.map((col, i) => {
      if (i === 0) return 'TOTAL';
      return r.sums[i] != null ? INR(r.sums[i]) : '';
    });
  }

  function exportRows(r) {
    // Money cells rendered as plain numbers for CSV, formatted for HTML/PDF.
    return {
      display: r.rows.map((row) => row.cells.map((cell, i) => (r.columns[i].numeric ? INR(cell) : cell))),
      raw: r.rows.map((row) => row.cells),
    };
  }

  function slug(r) {
    return `${r.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${r.periodLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`.replace(/-+$/, '');
  }

  function handleView(print) {
    const { display } = exportRows(report);
    const ok = openReportWindow({
      title: report.title,
      meta: [['Period', report.periodLabel], ...report.filters],
      columns: report.columns, rows: display, totalsRow: totalsRowText(report),
      gstTotal: report.gstTotal, grandTotal: report.grandTotal, print,
    });
    if (!ok) setError('Pop-up blocked — allow pop-ups for this site to view or download the report.');
  }

  function handleCsv() {
    const { raw } = exportRows(report);
    downloadCsv(
      `${slug(report)}.csv`,
      [report.title, `Period: ${report.periodLabel}`, ...report.filters.map(([k, v]) => `${k}: ${v}`), ''],
      report.columns.map((c) => c.label),
      raw,
      report.columns.map((col, i) => (i === 0 ? 'TOTAL' : (report.sums[i] != null ? report.sums[i] : ''))),
    );
  }

  return (
    <section className="commerce-reports-page data-table-page">
      <div className="page-header-section">
        <div className="page-header-title-group">
          <span className="page-header-icon-box"><Icon className="fa fa-bar-chart" /></span>
          <div>
            <h2>Commerce Reports</h2>
            <p>Generate order and payment reports for any period — filter by course, payment method, or student batch.</p>
          </div>
        </div>
      </div>

      <div className="crp-wizard form-modal">
        <div className="crp-step">
          <div className="crp-step-head">
            <span className="crp-step-num">1</span>
            <div>
              <h4>Report type</h4>
              <p>What do you want to report on?</p>
            </div>
          </div>
          <div className="crp-step-body">
            <div className="crp-seg">
              <button type="button" className={reportType === 'orders' ? 'active' : ''} onClick={() => { setReportType('orders'); setReport(null); }}>
                <span className="crp-seg-icon"><Icon className="ti ti-receipt" /></span>
                <span className="crp-seg-text">Orders<span>Every order created during the period</span></span>
                <Icon className="ti ti-check crp-seg-check" />
              </button>
              <button type="button" className={reportType === 'payments' ? 'active' : ''} onClick={() => { setReportType('payments'); setReport(null); }}>
                <span className="crp-seg-icon"><Icon className="ti ti-wallet" /></span>
                <span className="crp-seg-text">Payments<span>Every payment recorded during the period</span></span>
                <Icon className="ti ti-check crp-seg-check" />
              </button>
            </div>
          </div>
        </div>

        <div className="crp-step">
          <div className="crp-step-head">
            <span className="crp-step-num">2</span>
            <div>
              <h4>Period</h4>
              <p>Pick a date range, a month, or a financial year</p>
            </div>
          </div>
          <div className="crp-step-body">
          <div className="crp-period-toolbar">
            <div className="crp-seg crp-seg-small">
              <button type="button" className={periodMode === 'range' ? 'active' : ''} onClick={() => setPeriodMode('range')}><Icon className="ti ti-direction-alt" /> Date range</button>
              <button type="button" className={periodMode === 'month' ? 'active' : ''} onClick={() => setPeriodMode('month')}><Icon className="ti ti-calendar" /> Month</button>
              <button type="button" className={periodMode === 'fy' ? 'active' : ''} onClick={() => setPeriodMode('fy')}><Icon className="ti ti-briefcase" /> Financial year</button>
            </div>
            <div className="crp-presets">
              <span>Quick picks</span>
              {PRESETS.map((preset) => (
                <button key={preset.label} type="button" onClick={() => applyPreset(preset)}>{preset.label}</button>
              ))}
            </div>
          </div>

          {periodMode === 'range' && (
            <div className="crp-range-group">
              <label className="crp-range-field">
                <span>From <b className="req">*</b></span>
                <input type="date" value={fromStr} max={toStr || undefined} onChange={(e) => { setFromStr(e.target.value); setError(''); }} />
              </label>
              <span className="crp-range-arrow"><Icon className="ti ti-arrow-right" /></span>
              <label className="crp-range-field">
                <span>To <b className="req">*</b></span>
                <input type="date" value={toStr} min={fromStr || undefined} onChange={(e) => { setToStr(e.target.value); setError(''); }} />
              </label>
            </div>
          )}

          {periodMode === 'month' && (
            <MonthGridPicker value={monthStr} onChange={(v) => { setMonthStr(v); setError(''); }} />
          )}

          {periodMode === 'fy' && (
            <div className="crp-fy-chips">
              {FY_OPTIONS.map((y) => (
                <button key={y} type="button" className={fyStart === y ? 'active' : ''} onClick={() => setFyStart(y)}>
                  <strong>FY {y}–{String((y + 1) % 100).padStart(2, '0')}</strong>
                  <span>Apr {y} – Mar {y + 1}</span>
                  <Icon className="ti ti-check" />
                </button>
              ))}
            </div>
          )}

          {period ? (
            <div className="crp-period-echo">
              <Icon className="ti ti-calendar" /> Reporting period: <strong>{period.label}</strong>
              <em>{Math.round((period.end + 1 - period.start) / 86400)} days</em>
            </div>
          ) : (
            <div className="crp-period-echo is-empty">
              <Icon className="ti ti-info-alt" /> {periodMode === 'range' ? 'Pick both dates to set the period' : 'Pick a month to set the period'}
            </div>
          )}
          </div>
        </div>

        <div className="crp-step">
          <div className="crp-step-head">
            <span className="crp-step-num">3</span>
            <div>
              <h4>Narrow it down <em>optional</em></h4>
              <p>Limit the report to one course, batch{reportType === 'payments' ? ', or payment method' : ''}</p>
            </div>
          </div>
          <div className="crp-step-body">
          <div className="asset-form-grid">
            <div className="field-cell">
              <div className="float-field float-always msd-field">
                <MultiSelectDropdown
                  value={courseCodes}
                  onChange={setCourseCodes}
                  options={courseOptions.map((c) => c.code)}
                  getLabel={(code) => {
                    const c = courseOptions.find((o) => o.code === code);
                    return c ? `${c.title} (${c.code})` : code;
                  }}
                  allLabel="All courses / items"
                  plural="courses"
                  searchPlaceholder="Search courses…"
                  buttonClassName="float-control"
                />
                <span className="float-label">Course / Catalog Item</span>
              </div>
            </div>
            <div className="field-cell">
              <div className="float-field float-always msd-field">
                <MultiSelectDropdown
                  value={batchIds}
                  onChange={setBatchIds}
                  options={batchesDemo.map((b) => b.id)}
                  getLabel={(id) => batchesDemo.find((b) => b.id === id)?.batchName || id}
                  allLabel="All students"
                  plural="batches"
                  searchPlaceholder="Search batches…"
                  buttonClassName="float-control"
                />
                <span className="float-label">Student Batch</span>
              </div>
            </div>
            {reportType === 'payments' && (
              <label className="field-cell">
                <div className="float-field float-always">
                  <select className="float-control" value={method} onChange={(e) => setMethod(e.target.value)}>
                    <option value="">All payment methods</option>
                    {METHOD_OPTIONS.map((m) => <option key={m} value={m}>{methodLabel(m)}</option>)}
                  </select>
                  <span className="float-label">Payment Method</span>
                </div>
              </label>
            )}
          </div>
          </div>
        </div>

        <div className="crp-generate-row">
          {error
            ? <p className="field-error"><Icon className="ti ti-alert" /> {error}</p>
            : (
              <p className="crp-generate-summary">
                <Icon className="ti ti-info-alt" />
                {reportType === 'orders' ? 'Orders' : 'Payments'}
                {period ? <> · {period.label}</> : <> · pick a period</>}
                {courseCodes.length ? ` · ${courseCodes.length} course${courseCodes.length === 1 ? '' : 's'}` : ''}
                {batchIds.length ? ` · ${batchIds.length} batch${batchIds.length === 1 ? '' : 'es'}` : ''}
                {reportType === 'payments' && method ? ` · ${methodLabel(method)}` : ''}
              </p>
            )}
          <button type="button" className="page-action-button" onClick={generate}>
            <Icon className="ti ti-bar-chart" /> Generate Report
          </button>
        </div>
      </div>

      {report ? (
        <div className="crp-result">
          <div className="crp-result-header">
            <div className="crp-result-title">
              <span className="crp-result-icon"><Icon className={report.title.startsWith('Orders') ? 'ti ti-receipt' : 'ti ti-wallet'} /></span>
              <div>
                <h3>{report.title}</h3>
                <div className="crp-chips">
                  <span className="crp-chip crp-chip-period"><Icon className="ti ti-calendar" /> {report.periodLabel}</span>
                  {report.filters.map(([k, v]) => <span key={k} className="crp-chip"><Icon className="ti ti-filter" /> {v}</span>)}
                </div>
              </div>
            </div>
            <div className="crp-result-actions">
              <button type="button" className="legacy-btn legacy-btn-default" onClick={() => handleView(false)}><Icon className="ti ti-new-window" /> View HTML</button>
              <button type="button" className="legacy-btn legacy-btn-default" onClick={handleCsv}><Icon className="ti ti-download" /> Excel CSV</button>
              <button type="button" className="legacy-btn legacy-btn-success" onClick={() => handleView(true)}><Icon className="ti ti-printer" /> PDF</button>
            </div>
          </div>

          <div className="orders-stats-row crp-stats">
            <div className="stat-card"><div className="stat-icon indigo"><Icon className="ti ti-list" /></div><div className="stat-info"><h3>{report.rows.length}</h3><p>Records</p></div></div>
            <div className="stat-card"><div className="stat-icon green"><Icon className="ti ti-layout-list-thumb" /></div><div className="stat-info"><h3>{INR(report.baseTotal)}</h3><p>{report.baseLabel}</p></div></div>
            <div className="stat-card"><div className="stat-icon orange"><Icon className="ti ti-stamp" /></div><div className="stat-info"><h3>{INR(report.gstTotal)}</h3><p>Total GST</p></div></div>
            <div className="stat-card"><div className="stat-icon teal"><Icon className="ti ti-money" /></div><div className="stat-info"><h3>{INR(report.grandTotal)}</h3><p>Grand Total</p></div></div>
          </div>

          {report.rows.length === 0 ? (
            <div className="empty-state">
              <Icon className="ti ti-bar-chart" />
              <h4>No Records In This Period</h4>
              <p>Nothing matched the selected period and filters — widen the period or clear a filter.</p>
            </div>
          ) : (
            <div className="students-table-container">
              <table className="students-table crp-table">
                <thead>
                  <tr>{report.columns.map((c) => <th key={c.label} className={c.numeric ? 'crp-num' : ''}>{c.label}</th>)}</tr>
                </thead>
                <tbody>
                  {report.rows.map((row, rIndex) => (
                    <tr key={rIndex}>
                      {row.cells.map((cell, i) => (
                        <td key={i} className={report.columns[i].numeric ? 'crp-num' : ''}>
                          {report.columns[i].numeric ? INR(cell) : cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="crp-totals-row">
                    {totalsRowText(report).map((cell, i) => (
                      <td key={i} className={report.columns[i].numeric ? 'crp-num' : ''}>{cell}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

/** Year stepper + 12-month grid — replaces the native month input. */
function MonthGridPicker({ value, onChange }) {
  const now = new Date();
  const selYear = value ? Number(value.split('-')[0]) : null;
  const selMonth = value ? Number(value.split('-')[1]) : null;
  const [viewYear, setViewYear] = useState(selYear || now.getFullYear());
  return (
    <div className="crp-month-picker">
      <div className="crp-month-picker-head">
        <button type="button" aria-label="Previous year" onClick={() => setViewYear((y) => y - 1)}><Icon className="ti ti-angle-left" /></button>
        <strong>{viewYear}</strong>
        <button type="button" aria-label="Next year" onClick={() => setViewYear((y) => y + 1)}><Icon className="ti ti-angle-right" /></button>
      </div>
      <div className="crp-month-grid">
        {MONTH_NAMES.map((name, i) => {
          const isSel = selYear === viewYear && selMonth === i + 1;
          const isNow = now.getFullYear() === viewYear && now.getMonth() === i;
          return (
            <button
              key={name}
              type="button"
              className={`${isSel ? 'active' : ''} ${isNow ? 'is-current' : ''}`}
              title={`${name} ${viewYear}`}
              onClick={() => onChange(`${viewYear}-${pad2(i + 1)}`)}
            >
              {name.slice(0, 3)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
