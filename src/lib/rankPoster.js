// Rank-poster engine: a tiny, dependency-free "design tool" model that renders
// a 1920×1080 poster onto a <canvas>. The same render function drives the
// on-screen editor preview and the exported PNG, so what you see is exactly
// what gets published.
//
// Model shape:
//   {
//     type: 'top3-photos' | 'top10-photos' | 'top10-list' | 'top20-list' | 'custom',
//     background: { mode: 'solid' | 'gradient', color1, color2, angle },
//     elements: [ Element, ... ]          // drawn in array order (last = on top)
//   }
// Element types:
//   text    { x, y, w, text, fontSize, weight, color, align }
//   winner  { x, y, size, entryId, nameColor, scoreColor }   // photo + name + score + rank badge
//   list    { x, y, w, entryIds, columns, fontSize, color, card }
//   image   { x, y, w, h, src }
import { getInitials } from './userStore';

export const POSTER_W = 1920;
export const POSTER_H = 1080;

export const FONT_STACK = "'Source Sans Pro', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

export const POSTER_TYPES = [
  { id: 'top3-photos', label: 'Top 3 with Photos', icon: 'ti-cup', limit: 3, photos: true, desc: 'Podium of the top three — photo, name, score and rank badge.' },
  { id: 'top10-photos', label: 'Top 10 with Photos', icon: 'ti-gallery', limit: 10, photos: true, desc: 'Photo grid of the top ten with names and scores.' },
  { id: 'top10-list', label: 'Top 10 List', icon: 'ti-list', limit: 10, photos: false, desc: 'Clean ranked list of the top ten.' },
  { id: 'top20-list', label: 'Top 20 List', icon: 'ti-layout-column2', limit: 20, photos: false, desc: 'Two-column ranked list of the top twenty.' },
  { id: 'custom', label: 'Custom List with Text', icon: 'ti-text', limit: null, photos: false, desc: 'Pick how many ranks to show and add your own message.' },
];

// Curated backgrounds — the first one is the default.
export const BG_PRESETS = [
  { name: 'Ocean', mode: 'gradient', color1: '#006073', color2: '#0b2e4f', angle: 135 },
  { name: 'Royal', mode: 'gradient', color1: '#1e1b4b', color2: '#7c3aed', angle: 135 },
  { name: 'Sunset', mode: 'gradient', color1: '#7f1d1d', color2: '#f59e0b', angle: 160 },
  { name: 'Forest', mode: 'gradient', color1: '#064e3b', color2: '#10b981', angle: 135 },
  { name: 'Midnight', mode: 'gradient', color1: '#0f172a', color2: '#1e293b', angle: 180 },
  { name: 'Charcoal', mode: 'solid', color1: '#111827', color2: '#111827', angle: 135 },
  { name: 'Teal', mode: 'solid', color1: '#006073', color2: '#006073', angle: 135 },
  { name: 'Snow', mode: 'solid', color1: '#f8fafc', color2: '#f8fafc', angle: 135 },
];

export const RANK_COLORS = {
  1: { fill: '#f5b301', text: '#3b2a00', label: 'Gold' },
  2: { fill: '#c8d0d9', text: '#1f2937', label: 'Silver' },
  3: { fill: '#cd7f32', text: '#2b1600', label: 'Bronze' },
};

const AVATAR_PALETTE = [
  ['#f97316', '#ef4444'], ['#8b5cf6', '#6366f1'], ['#06b6d4', '#3b82f6'],
  ['#10b981', '#14b8a6'], ['#ec4899', '#f43f5e'], ['#f59e0b', '#eab308'],
];

let idSeq = 1;
export function nextId(prefix = 'el') {
  idSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${idSeq}`;
}

// ─── Entries ────────────────────────────────────────────────────────────────
// Normalise a page's ranking rows into what the poster needs. Only completed
// attempts with a numeric rank qualify.
export function normalizeEntries(rankings, maxMarks) {
  const seen = new Map();
  return (rankings || [])
    .filter((r) => r && r.status === 'completed' && Number.isFinite(Number(r.rank)))
    .map((r) => {
      // Ids must be unique per attempt row — demo data (and re-attempts) can
      // repeat a student, so suffix duplicates instead of collapsing them.
      const base = String(r.studentId ?? r.rollNumber ?? r.studentName);
      const n = (seen.get(base) || 0) + 1;
      seen.set(base, n);
      return { ...r, __id: n === 1 ? base : `${base}#${n}` };
    })
    .map((r) => ({
      id: r.__id,
      rank: Number(r.rank),
      name: String(r.studentName || 'Student'),
      rollNumber: r.rollNumber || '',
      score: Number(r.score) || 0,
      maxMarks: Number(r.maximumMarks ?? maxMarks) || 0,
      photoUrl: r.photoUrl || r.avatar || r.profilePhoto || r.photo || null,
    }))
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
}

// Take the first `limit` entries by rank, plus anyone tied at the boundary —
// so "Top 3" with two students at rank 2 yields four people.
export function pickTop(entries, limit) {
  if (!limit || entries.length <= limit) return entries.slice();
  const boundaryRank = entries[limit - 1].rank;
  return entries.filter((e, i) => i < limit || e.rank === boundaryRank);
}

export function isLightColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255; const g = (n >> 8) & 255; const b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 170;
}

// ─── Layout builders ────────────────────────────────────────────────────────
function makeText(text, x, y, w, fontSize, opts = {}) {
  return {
    id: nextId('text'), type: 'text', x, y, w, text,
    fontSize, weight: opts.weight || 700, color: opts.color || '#ffffff', align: opts.align || 'center',
  };
}

function makeWinner(entryId, x, y, size) {
  return { id: nextId('winner'), type: 'winner', x, y, size, entryId, nameColor: '#ffffff', scoreColor: 'rgba(255,255,255,0.85)' };
}

function makeList(entryIds, x, y, w, columns, fontSize) {
  return { id: nextId('list'), type: 'list', x, y, w, entryIds, columns, fontSize, color: '#ffffff', card: true };
}

// Winners laid out along a row centred on the canvas. Rank 1 is emphasised
// (bigger, raised) and, when there are exactly three distinct podium ranks,
// placed in the middle like a real podium.
function layoutWinnersRow(top, y, baseSize) {
  const distinct = new Set(top.map((e) => e.rank));
  const podium = top.length === 3 && distinct.size === 3;
  const ordered = podium ? [top[1], top[0], top[2]] : top;
  const gap = top.length <= 3 ? 110 : 40;
  const sizes = ordered.map((e) => (e.rank === 1 ? baseSize * 1.15 : baseSize));
  const widths = sizes.map((s) => winnerBoxWidth(s));
  const total = widths.reduce((s, w) => s + w, 0) + gap * (ordered.length - 1);
  let x = (POSTER_W - total) / 2;
  return ordered.map((e, i) => {
    const el = makeWinner(e.id, x, y - (e.rank === 1 ? 40 : 0), sizes[i]);
    x += widths[i] + gap;
    return el;
  });
}

function layoutWinnersGrid(top, yStart, size, rows) {
  const perRow = Math.ceil(top.length / rows);
  const gap = 36;
  const boxW = winnerBoxWidth(size);
  const boxH = winnerBoxHeight(size);
  const els = [];
  for (let r = 0; r < rows; r += 1) {
    const rowEntries = top.slice(r * perRow, (r + 1) * perRow);
    const total = rowEntries.length * boxW + gap * (rowEntries.length - 1);
    let x = (POSTER_W - total) / 2;
    rowEntries.forEach((e) => {
      els.push(makeWinner(e.id, x, yStart + r * (boxH + 30), size));
      x += boxW + gap;
    });
  }
  return els;
}

// Pick a list font size that fills the space below the headings (~800px)
// without overflowing, so short lists don't look lost on the canvas.
function listFontFor(count, columns) {
  const rows = Math.max(1, Math.ceil(count / columns));
  return Math.max(26, Math.min(44, Math.floor(780 / rows / 1.85)));
}

export function buildPoster(type, entries, meta = {}) {
  const def = POSTER_TYPES.find((t) => t.id === type) || POSTER_TYPES[0];
  const title = meta.title || 'Rank List';
  const bg = { ...BG_PRESETS[0] };
  delete bg.name;
  const elements = [];

  switch (def.id) {
    case 'top3-photos': {
      const top = pickTop(entries, 3);
      elements.push(makeText(title, 160, 70, 1600, 72));
      elements.push(makeText('Top 3 Performers', 160, 170, 1600, 36, { weight: 500, color: 'rgba(255,255,255,0.8)' }));
      const size = top.length <= 3 ? 300 : Math.max(180, Math.min(300, (POSTER_W - 300) / top.length - 120));
      elements.push(...layoutWinnersRow(top, 330, size));
      break;
    }
    case 'top10-photos': {
      const top = pickTop(entries, 10);
      elements.push(makeText(title, 160, 50, 1600, 62));
      elements.push(makeText('Top 10 Performers', 160, 135, 1600, 32, { weight: 500, color: 'rgba(255,255,255,0.8)' }));
      const rows = top.length > 6 ? 2 : 1;
      const perRow = Math.ceil(top.length / rows);
      const size = Math.min(190, Math.floor((POSTER_W - 120 - 36 * (perRow - 1)) / perRow / 1.35));
      elements.push(...layoutWinnersGrid(top, rows === 1 ? 380 : 230, size, rows));
      break;
    }
    case 'top10-list': {
      const top = pickTop(entries, 10);
      elements.push(makeText(title, 160, 60, 1600, 62));
      elements.push(makeText('Top 10 Rank List', 160, 145, 1600, 30, { weight: 500, color: 'rgba(255,255,255,0.8)' }));
      elements.push(makeList(top.map((e) => e.id), 410, 230, 1100, 1, listFontFor(top.length, 1)));
      break;
    }
    case 'top20-list': {
      const top = pickTop(entries, 20);
      elements.push(makeText(title, 160, 50, 1600, 58));
      elements.push(makeText('Top 20 Rank List', 160, 130, 1600, 28, { weight: 500, color: 'rgba(255,255,255,0.8)' }));
      elements.push(makeList(top.map((e) => e.id), 160, 210, 1600, 2, listFontFor(top.length, 2)));
      break;
    }
    default: {
      const top = pickTop(entries, Math.min(10, entries.length || 10));
      elements.push(makeText(title, 160, 60, 1600, 60));
      elements.push(makeText('Congratulations to all our achievers! Keep up the great work.', 160, 150, 1600, 30, { weight: 500, color: 'rgba(255,255,255,0.85)' }));
      elements.push(makeList(top.map((e) => e.id), 410, 240, 1100, 1, listFontFor(top.length, 1)));
      break;
    }
  }

  return { type: def.id, background: bg, elements };
}

// ─── Geometry helpers ───────────────────────────────────────────────────────
export function winnerBoxWidth(size) { return Math.round(size * 1.55); }
export function winnerBoxHeight(size) { return Math.round(size + 30 + size * 0.19 * 1.35 + size * 0.15 * 1.4 + 12); }

export function listRowHeight(fontSize) { return Math.round(fontSize * 1.85); }
export function listPadding(fontSize) { return Math.round(fontSize * 0.7); }

export function listBoxHeight(el) {
  const columns = Math.max(1, el.columns || 1);
  const rows = Math.ceil((el.entryIds?.length || 0) / columns);
  return rows * listRowHeight(el.fontSize) + listPadding(el.fontSize) * 2;
}

function textLines(ctx, el) {
  ctx.font = `${el.weight || 700} ${el.fontSize}px ${FONT_STACK}`;
  const lines = [];
  String(el.text ?? '').split('\n').forEach((para) => {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(''); return; }
    let cur = '';
    words.forEach((word) => {
      const test = cur ? `${cur} ${word}` : word;
      if (ctx.measureText(test).width > el.w && cur) { lines.push(cur); cur = word; } else cur = test;
    });
    lines.push(cur);
  });
  return lines;
}

let measureCtx = null;
function getMeasureCtx() {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  return measureCtx;
}

// Bounding box of an element in poster coordinates.
export function elementBounds(el) {
  switch (el.type) {
    case 'text': {
      const lines = textLines(getMeasureCtx(), el);
      return { x: el.x, y: el.y, w: el.w, h: Math.max(1, lines.length) * el.fontSize * 1.25 };
    }
    case 'winner':
      return { x: el.x, y: el.y, w: winnerBoxWidth(el.size), h: winnerBoxHeight(el.size) };
    case 'list':
      return { x: el.x, y: el.y, w: el.w, h: listBoxHeight(el) };
    case 'image':
      return { x: el.x, y: el.y, w: el.w, h: el.h };
    default:
      return { x: el.x, y: el.y, w: 10, h: 10 };
  }
}

export function hitTest(poster, px, py) {
  for (let i = poster.elements.length - 1; i >= 0; i -= 1) {
    const b = elementBounds(poster.elements[i]);
    if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return poster.elements[i];
  }
  return null;
}

export function clampToCanvas(el) {
  const b = elementBounds(el);
  const x = Math.min(Math.max(el.x, -b.w * 0.5), POSTER_W - b.w * 0.5);
  const y = Math.min(Math.max(el.y, -b.h * 0.5), POSTER_H - b.h * 0.5);
  return { ...el, x: Math.round(x), y: Math.round(y) };
}

// ─── Drawing ────────────────────────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawBackground(ctx, bg) {
  if (bg.mode === 'gradient') {
    const a = ((bg.angle ?? 135) % 360) * (Math.PI / 180);
    // CSS-style angle: 0deg = to top, 90deg = to right.
    const cx = POSTER_W / 2; const cy = POSTER_H / 2;
    const len = Math.abs(POSTER_W * Math.sin(a)) + Math.abs(POSTER_H * Math.cos(a));
    const dx = Math.sin(a) * len / 2; const dy = -Math.cos(a) * len / 2;
    const g = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
    g.addColorStop(0, bg.color1);
    g.addColorStop(1, bg.color2);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = bg.color1;
  }
  ctx.fillRect(0, 0, POSTER_W, POSTER_H);
  // Subtle decorative glow so solid colours don't look flat.
  const glow = ctx.createRadialGradient(POSTER_W * 0.8, -100, 0, POSTER_W * 0.8, -100, 900);
  glow.addColorStop(0, 'rgba(255,255,255,0.12)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, POSTER_W, POSTER_H);
}

function drawText(ctx, el) {
  const lines = textLines(ctx, el);
  ctx.font = `${el.weight || 700} ${el.fontSize}px ${FONT_STACK}`;
  ctx.fillStyle = el.color || '#fff';
  ctx.textBaseline = 'top';
  ctx.textAlign = el.align || 'center';
  const ax = el.align === 'left' ? el.x : el.align === 'right' ? el.x + el.w : el.x + el.w / 2;
  lines.forEach((line, i) => ctx.fillText(line, ax, el.y + i * el.fontSize * 1.25));
}

function fitFont(ctx, text, maxWidth, size, weight, min) {
  let s = size;
  for (; s > min; s -= 1) {
    ctx.font = `${weight} ${s}px ${FONT_STACK}`;
    if (ctx.measureText(text).width <= maxWidth) break;
  }
  return s;
}

function avatarColors(name) {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

function drawCirclePhoto(ctx, entry, cx, cy, d, images) {
  const img = entry.photoUrl ? images?.get(entry.photoUrl) : null;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (img && img !== 'error' && img.naturalWidth) {
    const scale = Math.max(d / img.naturalWidth, d / img.naturalHeight);
    const w = img.naturalWidth * scale; const h = img.naturalHeight * scale;
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  } else {
    const [c1, c2] = avatarColors(entry.name);
    const g = ctx.createLinearGradient(cx - d / 2, cy - d / 2, cx + d / 2, cy + d / 2);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.fillRect(cx - d / 2, cy - d / 2, d, d);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.font = `700 ${Math.round(d * 0.38)}px ${FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(getInitials(entry.name), cx, cy + d * 0.02);
  }
  ctx.restore();
}

function drawRankBadge(ctx, rank, cx, cy, d) {
  const c = RANK_COLORS[rank] || { fill: '#ffffff', text: '#0f172a' };
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = d * 0.25;
  ctx.shadowOffsetY = d * 0.08;
  ctx.beginPath();
  ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
  ctx.fillStyle = c.fill;
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(2, d * 0.07);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.stroke();
  ctx.fillStyle = c.text;
  ctx.font = `800 ${Math.round(d * 0.55)}px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(rank), cx, cy + d * 0.03);
}

function drawWinner(ctx, el, entries, images) {
  const entry = entries.get(el.entryId);
  if (!entry) return;
  const size = el.size;
  const boxW = winnerBoxWidth(size);
  const cx = el.x + boxW / 2;
  const cy = el.y + size / 2;
  const rankColor = (RANK_COLORS[entry.rank] || { fill: 'rgba(255,255,255,0.85)' }).fill;

  // Ring + glow
  ctx.save();
  ctx.shadowColor = rankColor;
  ctx.shadowBlur = size * 0.12;
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2 + size * 0.035, 0, Math.PI * 2);
  ctx.fillStyle = rankColor;
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = '#0f172a';
  ctx.fill();

  drawCirclePhoto(ctx, entry, cx, cy, size, images);

  // Rank badge sits on the bottom-right of the ring; rank 1 also gets a crown pill.
  const badgeD = size * 0.3;
  drawRankBadge(ctx, entry.rank, cx + size * 0.34, cy + size * 0.36, badgeD);

  // Name (auto-shrinks to fit), then score.
  const nameSize = Math.round(size * 0.19);
  const fitted = fitFont(ctx, entry.name, boxW - 12, nameSize, 700, Math.round(nameSize * 0.6));
  ctx.font = `700 ${fitted}px ${FONT_STACK}`;
  ctx.fillStyle = el.nameColor || '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const nameY = el.y + size + 30;
  ctx.fillText(entry.name, cx, nameY);

  const scoreSize = Math.round(size * 0.15);
  const scoreY = nameY + nameSize * 1.35;
  ctx.font = `600 ${scoreSize}px ${FONT_STACK}`;
  ctx.fillStyle = el.scoreColor || 'rgba(255,255,255,0.85)';
  ctx.fillText(`${entry.score} / ${entry.maxMarks}`, cx, scoreY);
}

function drawList(ctx, el, entries) {
  const columns = Math.max(1, el.columns || 1);
  const fontSize = el.fontSize;
  const rowH = listRowHeight(fontSize);
  const pad = listPadding(fontSize);
  const rows = Math.ceil(el.entryIds.length / columns);
  const boxH = rows * rowH + pad * 2;
  const light = el.color && isLightColor(el.color);

  if (el.card) {
    roundRect(ctx, el.x, el.y, el.w, boxH, fontSize * 0.6);
    ctx.fillStyle = light ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = light ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.12)';
    ctx.stroke();
  }

  const colGap = pad;
  const colW = (el.w - pad * 2 - colGap * (columns - 1)) / columns;
  const badgeD = fontSize * 1.35;

  el.entryIds.forEach((id, i) => {
    const entry = entries.get(id);
    if (!entry) return;
    const col = Math.floor(i / rows);
    const row = i % rows;
    const x = el.x + pad + col * (colW + colGap);
    const y = el.y + pad + row * rowH;
    const midY = y + rowH / 2;

    if (row % 2 === 1) {
      ctx.fillStyle = light ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
      roundRect(ctx, x, y + 2, colW, rowH - 4, 8);
      ctx.fill();
    }

    drawRankBadge(ctx, entry.rank, x + pad * 0.6 + badgeD / 2, midY, badgeD);

    ctx.font = `600 ${fontSize}px ${FONT_STACK}`;
    ctx.fillStyle = el.color || '#fff';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const scoreText = `${entry.score} / ${entry.maxMarks}`;
    const scoreW = ctx.measureText(scoreText).width;
    ctx.fillText(scoreText, x + colW - pad * 0.6, midY);

    const nameX = x + pad * 0.6 + badgeD + pad * 0.7;
    const nameMax = colW - (nameX - x) - scoreW - pad * 1.2;
    const fitted = fitFont(ctx, entry.name, nameMax, fontSize, 600, Math.round(fontSize * 0.6));
    ctx.font = `600 ${fitted}px ${FONT_STACK}`;
    ctx.textAlign = 'left';
    ctx.fillText(entry.name, nameX, midY);
  });
}

function drawImage(ctx, el, images) {
  const img = images?.get(el.src);
  if (!img || img === 'error' || !img.naturalWidth) {
    ctx.save();
    ctx.setLineDash([12, 10]);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 3;
    ctx.strokeRect(el.x, el.y, el.w, el.h);
    ctx.restore();
    return;
  }
  const scale = Math.min(el.w / img.naturalWidth, el.h / img.naturalHeight);
  const w = img.naturalWidth * scale; const h = img.naturalHeight * scale;
  ctx.drawImage(img, el.x + (el.w - w) / 2, el.y + (el.h - h) / 2, w, h);
}

/**
 * Render the poster.
 * @param ctx      2D context of a POSTER_W×POSTER_H canvas
 * @param poster   model
 * @param entries  Map<entryId, entry>
 * @param images   Map<src, HTMLImageElement | 'error'>
 * @param opts     { selectedId, guides: {x?, y?} } — editor-only overlays
 */
export function renderPoster(ctx, poster, entries, images, opts = {}) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, POSTER_W, POSTER_H);
  drawBackground(ctx, poster.background);
  poster.elements.forEach((el) => {
    ctx.save();
    switch (el.type) {
      case 'text': drawText(ctx, el); break;
      case 'winner': drawWinner(ctx, el, entries, images); break;
      case 'list': drawList(ctx, el, entries); break;
      case 'image': drawImage(ctx, el, images); break;
      default: break;
    }
    ctx.restore();
  });

  if (opts.guides) {
    ctx.save();
    ctx.setLineDash([14, 10]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(56,189,248,0.9)';
    if (opts.guides.x != null) { ctx.beginPath(); ctx.moveTo(opts.guides.x, 0); ctx.lineTo(opts.guides.x, POSTER_H); ctx.stroke(); }
    if (opts.guides.y != null) { ctx.beginPath(); ctx.moveTo(0, opts.guides.y); ctx.lineTo(POSTER_W, opts.guides.y); ctx.stroke(); }
    ctx.restore();
  }

  if (opts.selectedId) {
    const el = poster.elements.find((e) => e.id === opts.selectedId);
    if (el) {
      const b = elementBounds(el);
      ctx.save();
      ctx.setLineDash([10, 8]);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#38bdf8';
      ctx.strokeRect(b.x - 6, b.y - 6, b.w + 12, b.h + 12);
      ctx.setLineDash([]);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(b.x + b.w - 4, b.y + b.h - 4, 20, 20);
      ctx.restore();
    }
  }
}

export function resizeHandleHit(el, px, py, tolerance = 24) {
  const b = elementBounds(el);
  return Math.abs(px - (b.x + b.w + 6)) <= tolerance && Math.abs(py - (b.y + b.h + 6)) <= tolerance;
}

// Apply a resize drag (bottom-right handle) to an element.
export function applyResize(el, dx, dy) {
  switch (el.type) {
    case 'text': return { ...el, w: Math.max(120, Math.round(el.w + dx)) };
    case 'list': return { ...el, w: Math.max(320, Math.round(el.w + dx)) };
    case 'winner': return { ...el, size: Math.max(90, Math.min(520, Math.round(el.size + dx / 1.55))) };
    case 'image': {
      const ratio = el.w / el.h;
      const w = Math.max(60, el.w + dx);
      return { ...el, w: Math.round(w), h: Math.round(w / ratio) };
    }
    default: return el;
  }
}

// ─── Export ─────────────────────────────────────────────────────────────────
export function exportPosterBlob(poster, entries, images) {
  const canvas = document.createElement('canvas');
  canvas.width = POSTER_W;
  canvas.height = POSTER_H;
  renderPoster(canvas.getContext('2d'), poster, entries, images);
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode image'))), 'image/png');
    } catch (err) {
      reject(err);
    }
  });
}

export function safeFileName(name) {
  return String(name || 'rank-poster').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'rank-poster';
}

// Load an image for canvas use. `crossOrigin` keeps the canvas exportable;
// hosts that don't send CORS headers fail to load and fall back to initials.
export function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    if (!src.startsWith('data:') && !src.startsWith('blob:')) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve('error');
    img.src = src;
  });
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
