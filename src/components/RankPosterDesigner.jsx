import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BG_PRESETS, POSTER_H, POSTER_TYPES, POSTER_W, RANK_COLORS,
  applyResize, buildPoster, clampToCanvas, elementBounds, exportPosterBlob, fileToDataUrl,
  hitTest, loadImage, nextId, normalizeEntries, pickTop, renderPoster, resizeHandleHit, safeFileName,
} from '../lib/rankPoster';
import { POSTER_ASSETS } from '../lib/posterAssets';
import Icon from './Icon';

// ─── Type chooser ────────────────────────────────────────────────────────────
export function RankPosterTypeModal({ entries, hasActiveFilters, onClose, onConfirm }) {
  const [selected, setSelected] = useState(POSTER_TYPES[0].id);

  function countFor(def) {
    if (!def.limit) return `${entries.length} ranked student(s) available`;
    const top = pickTop(entries, def.limit);
    const ties = top.length - Math.min(def.limit, entries.length);
    if (entries.length < def.limit) return `${top.length} ranked student(s) available`;
    return ties > 0 ? `${top.length} students — includes ${ties} tie(s)` : `${top.length} students`;
  }

  return (
    <div className="crispr-modal-backdrop active" onClick={onClose}>
      <div className="crispr-modal-dialog" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="crispr-modal-header" style={{ background: 'linear-gradient(135deg, #b45309 0%, #f59e0b 100%)' }}>
          <h3><Icon className="ti ti-cup" /> Create Rank Poster</h3>
          <button type="button" className="crispr-modal-close" onClick={onClose}><Icon className="ti ti-close" /></button>
        </div>
        <div className="crispr-modal-body">
          <p className="rp-type-intro">Choose the kind of poster to design. You can tweak colours, text and placement in the next step.</p>
          <div className="rp-type-grid" role="radiogroup">
            {POSTER_TYPES.map((def) => (
              <label key={def.id} className={`rp-type-card${selected === def.id ? ' selected' : ''}`}>
                <input type="radio" name="rp-type" checked={selected === def.id} onChange={() => setSelected(def.id)} />
                <span className="rp-type-icon"><Icon className={`ti ${def.icon}`} /></span>
                <span className="rp-type-text">
                  <strong>{def.label}</strong>
                  <span>{def.desc}</span>
                  <em>{countFor(def)}</em>
                </span>
                <Icon className="ti ti-check rp-type-check" />
              </label>
            ))}
          </div>
          {hasActiveFilters && (
            <div className="qar-filter-notice" style={{ marginTop: 14 }}>
              <Icon className="ti ti-filter" style={{ color: '#006073', fontSize: 18, marginTop: 2 }} />
              <div><strong>Note:</strong> Active filters are applied. Only filtered students are considered for the poster.</div>
            </div>
          )}
          {entries.length === 0 && (
            <div className="qar-warning-box" style={{ marginTop: 14 }}>
              <Icon className="ti ti-alert-circle" style={{ color: '#856404', fontSize: 18, marginTop: 2 }} />
              <div>No completed attempts to rank yet.</div>
            </div>
          )}
        </div>
        <div className="crispr-modal-footer">
          <button type="button" className="crispr-btn crispr-btn-default" onClick={onClose}>Cancel</button>
          <button type="button" className="crispr-btn crispr-btn-primary" disabled={entries.length === 0} onClick={() => onConfirm(selected)}>
            <Icon className="ti ti-brush" /> Design Poster
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Designer ────────────────────────────────────────────────────────────────
const SNAP = 14;
const NUDGE = 1;

function useImages(sources) {
  const cacheRef = useRef(new Map());
  const mountedRef = useRef(true);
  const [version, setVersion] = useState(0);
  // Re-arm on every mount: StrictMode runs the cleanup once on its simulated unmount.
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  useEffect(() => {
    // Loads are keyed by src and never cancelled: the source list re-evaluates
    // on every edit, and an in-flight load must still land in the cache.
    sources.forEach((src) => {
      if (!src || cacheRef.current.has(src)) return;
      cacheRef.current.set(src, 'loading');
      loadImage(src).then((img) => {
        cacheRef.current.set(src, img);
        if (mountedRef.current) setVersion((v) => v + 1);
      });
    });
  }, [sources]);
  return [cacheRef.current, version];
}

export function RankPosterDesignerModal({ type, entries: allEntries, title, onClose, onExported }) {
  const [entries, setEntries] = useState(allEntries);
  const entryMap = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);

  const [poster, setPoster] = useState(() => buildPoster(type, allEntries, { title }));
  const [selectedId, setSelectedId] = useState(null);
  const [guides, setGuides] = useState(null);
  const [tab, setTab] = useState('elements');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  // Undo / redo — history of committed poster states.
  const pastRef = useRef([]);
  const futureRef = useRef([]);
  const [histTick, setHistTick] = useState(0);
  const posterRef = useRef(poster);
  posterRef.current = poster;

  const commit = useCallback((next, token) => {
    const prev = posterRef.current;
    if (token && pastRef.current.length && pastRef.current[pastRef.current.length - 1].token === token) {
      // Coalesce rapid edits of the same field (e.g. typing) into one undo step.
    } else {
      pastRef.current.push({ poster: prev, token });
      if (pastRef.current.length > 60) pastRef.current.shift();
    }
    futureRef.current = [];
    setPoster(next);
    setHistTick((t) => t + 1);
  }, []);

  function undo() {
    const entry = pastRef.current.pop();
    if (!entry) return;
    futureRef.current.push({ poster: posterRef.current, token: null });
    setPoster(entry.poster);
    setHistTick((t) => t + 1);
  }
  function redo() {
    const entry = futureRef.current.pop();
    if (!entry) return;
    pastRef.current.push({ poster: posterRef.current, token: null });
    setPoster(entry.poster);
    setHistTick((t) => t + 1);
  }

  const selected = poster.elements.find((e) => e.id === selectedId) || null;

  function updateElement(id, patch, token) {
    const next = { ...poster, elements: poster.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)) };
    commit(next, token);
  }
  function removeElement(id) {
    commit({ ...poster, elements: poster.elements.filter((e) => e.id !== id) });
    if (selectedId === id) setSelectedId(null);
  }
  function addElement(el) {
    commit({ ...poster, elements: [...poster.elements, el] });
    setSelectedId(el.id);
    setTab('properties');
  }
  function moveLayer(id, dir) {
    const idx = poster.elements.findIndex((e) => e.id === id);
    const to = idx + dir;
    if (idx < 0 || to < 0 || to >= poster.elements.length) return;
    const els = poster.elements.slice();
    [els[idx], els[to]] = [els[to], els[idx]];
    commit({ ...poster, elements: els });
  }
  function setBackground(patch, token) {
    commit({ ...poster, background: { ...poster.background, ...patch } }, token);
  }
  function resetLayout() {
    commit(buildPoster(poster.type, entries, { title }));
    setSelectedId(null);
  }

  // ── Images ──
  const imageSources = useMemo(() => {
    const srcs = new Set();
    entries.forEach((e) => { if (e.photoUrl) srcs.add(e.photoUrl); });
    poster.elements.forEach((e) => { if (e.type === 'image' && e.src) srcs.add(e.src); });
    return Array.from(srcs);
  }, [entries, poster.elements]);
  const [images, imagesVersion] = useImages(imageSources);

  // ── Canvas rendering ──
  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const [displayScale, setDisplayScale] = useState(0.5);

  useEffect(() => {
    function fit() {
      const stage = stageRef.current;
      if (!stage) return;
      const rect = stage.getBoundingClientRect();
      const s = Math.min((rect.width - 32) / POSTER_W, (rect.height - 32) / POSTER_H, 1);
      setDisplayScale(Math.max(0.1, s));
    }
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderPoster(canvas.getContext('2d'), poster, entryMap, images, { selectedId, guides });
  }, [poster, entryMap, images, imagesVersion, selectedId, guides]);

  // ── Pointer interaction (drag / resize) ──
  const dragRef = useRef(null);

  function toPoster(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (POSTER_W / rect.width),
      y: (e.clientY - rect.top) * (POSTER_H / rect.height),
    };
  }

  function onPointerDown(e) {
    if (e.button !== 0) return;
    const p = toPoster(e);
    let mode = 'move';
    let target = selected && resizeHandleHit(selected, p.x, p.y, 20 / displayScale) ? selected : null;
    if (target) mode = 'resize';
    else target = hitTest(poster, p.x, p.y);
    setSelectedId(target ? target.id : null);
    if (!target) return;
    if (mode === 'move') setTab('properties');
    dragRef.current = { id: target.id, mode, start: p, origin: target, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function onPointerMove(e) {
    const drag = dragRef.current;
    if (!drag) return;
    const p = toPoster(e);
    const dx = p.x - drag.start.x; const dy = p.y - drag.start.y;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) drag.moved = true;
    let next;
    if (drag.mode === 'resize') {
      next = applyResize(drag.origin, dx, dy);
      setGuides(null);
    } else {
      next = { ...drag.origin, x: drag.origin.x + dx, y: drag.origin.y + dy };
      // Smart snapping to the canvas centre lines.
      const b = elementBounds(next);
      const cx = b.x + b.w / 2; const cy = b.y + b.h / 2;
      const g = {};
      if (!e.altKey) {
        if (Math.abs(cx - POSTER_W / 2) < SNAP / displayScale) { next.x += POSTER_W / 2 - cx; g.x = POSTER_W / 2; }
        if (Math.abs(cy - POSTER_H / 2) < SNAP / displayScale) { next.y += POSTER_H / 2 - cy; g.y = POSTER_H / 2; }
        // Align to other elements' vertical centre / top edges.
        poster.elements.forEach((other) => {
          if (other.id === next.id) return;
          const ob = elementBounds(other);
          if (g.y == null && Math.abs(b.y - ob.y) < SNAP / displayScale) { next.y += ob.y - b.y; g.y = ob.y; }
          if (g.x == null && Math.abs(cx - (ob.x + ob.w / 2)) < SNAP / displayScale) { next.x += ob.x + ob.w / 2 - cx; g.x = ob.x + ob.w / 2; }
        });
      }
      next = clampToCanvas(next);
      setGuides(Object.keys(g).length ? g : null);
    }
    setPoster((cur) => ({ ...cur, elements: cur.elements.map((el) => (el.id === drag.id ? next : el)) }));
  }

  function onPointerUp(e) {
    const drag = dragRef.current;
    dragRef.current = null;
    setGuides(null);
    if (!drag) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) { /* noop */ }
    if (drag.moved) {
      // Record the pre-drag state as the undo point.
      const finalPoster = posterRef.current;
      const before = { ...finalPoster, elements: finalPoster.elements.map((el) => (el.id === drag.id ? drag.origin : el)) };
      pastRef.current.push({ poster: before, token: null });
      futureRef.current = [];
      setHistTick((t) => t + 1);
    }
  }

  function onKeyDown(e) {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
      return;
    }
    if (!selected) return;
    const step = e.shiftKey ? NUDGE * 10 : NUDGE;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) {
      e.preventDefault();
      updateElement(selected.id, { x: selected.x + moves[e.key][0], y: selected.y + moves[e.key][1] }, `nudge:${selected.id}`);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      removeElement(selected.id);
    } else if (e.key === 'Escape') {
      setSelectedId(null);
    }
  }

  // ── Adders ──
  function addText() {
    addElement({ id: nextId('text'), type: 'text', x: 360, y: 900, w: 1200, text: 'Your text here', fontSize: 40, weight: 600, color: '#ffffff', align: 'center' });
  }
  function addWinner(entryId) {
    addElement({ id: nextId('winner'), type: 'winner', x: 800, y: 600, size: 220, entryId, nameColor: '#ffffff', scoreColor: 'rgba(255,255,255,0.85)' });
  }
  function addList(limit) {
    const top = pickTop(entries, limit);
    addElement({ id: nextId('list'), type: 'list', x: 410, y: 300, w: 1100, entryIds: top.map((e) => e.id), columns: top.length > 10 ? 2 : 1, fontSize: 32, color: '#ffffff', card: true });
  }
  // Place an image element sized to `w` (aspect ratio preserved), centred on the canvas.
  async function addImage(src, { name, w = 320 } = {}) {
    const img = await loadImage(src);
    const ratio = img !== 'error' && img.naturalWidth ? img.naturalWidth / img.naturalHeight : 1;
    const h = Math.round(w / ratio);
    addElement({
      id: nextId('image'), type: 'image', name,
      x: Math.round((POSTER_W - w) / 2), y: Math.round((POSTER_H - h) / 2), w, h, src,
    });
  }
  async function addImageFromFile(file) {
    if (!file) return;
    try {
      await addImage(await fileToDataUrl(file), { name: file.name });
    } catch (_) {
      setNotice({ type: 'error', text: 'Could not read that image file.' });
    }
  }
  async function addAsset(asset) {
    try {
      await addImage(asset.url, { name: asset.name, w: 420 });
    } catch (_) {
      setNotice({ type: 'error', text: 'Could not load that graphic.' });
    }
  }
  async function setPhotoForEntry(entryId, file) {
    if (!file) return;
    try {
      const src = await fileToDataUrl(file);
      setEntries((cur) => cur.map((e) => (e.id === entryId ? { ...e, photoUrl: src } : e)));
    } catch (_) {
      setNotice({ type: 'error', text: 'Could not read that photo.' });
    }
  }

  // ── Export ──
  async function download() {
    setBusy(true);
    try {
      const blob = await exportPosterBlob(poster, entryMap, images);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeFileName(title)}-${poster.type}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      onExported?.('download');
    } catch (err) {
      setNotice({ type: 'error', text: `Export failed: ${err.message || err}` });
    } finally {
      setBusy(false);
    }
  }
  async function copyToClipboard() {
    setBusy(true);
    try {
      const blob = await exportPosterBlob(poster, entryMap, images);
      // eslint-disable-next-line no-undef
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setNotice({ type: 'success', text: 'Poster copied to clipboard.' });
      onExported?.('copy');
    } catch (err) {
      setNotice({ type: 'error', text: 'Clipboard copy is not available here — use Download instead.' });
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  const typeDef = POSTER_TYPES.find((t) => t.id === poster.type) || POSTER_TYPES[0];
  const canUndo = pastRef.current.length > 0;
  const canRedo = futureRef.current.length > 0;
  void histTick;

  return (
    <div className="crispr-modal-backdrop active rp-backdrop">
      <div className="rp-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="rp-header">
          <div className="rp-header-title">
            <Icon className="ti ti-cup" />
            <div>
              <h3>Poster Designer <span className="rp-chip">{typeDef.label}</span></h3>
              <p>{POSTER_W} × {POSTER_H} px · drag elements to place them · arrow keys nudge · Delete removes</p>
            </div>
          </div>
          <div className="rp-header-actions">
            <button type="button" className="rp-icon-btn" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}><Icon className="ti ti-back-left" /></button>
            <button type="button" className="rp-icon-btn" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo}><Icon className="ti ti-back-right" /></button>
            <button type="button" className="rp-icon-btn" title="Reset to auto layout" onClick={resetLayout}><Icon className="ti ti-wand" /></button>
            <button type="button" className="rp-icon-btn" title="Close" onClick={onClose}><Icon className="ti ti-close" /></button>
          </div>
        </div>

        <div className="rp-body">
          <aside className="rp-sidebar">
            <div className="rp-tabs">
              <button type="button" className={tab === 'elements' ? 'active' : ''} onClick={() => setTab('elements')}><Icon className="ti ti-layout-grid2" /> Elements</button>
              <button type="button" className={tab === 'background' ? 'active' : ''} onClick={() => setTab('background')}><Icon className="ti ti-paint-bucket" /> Background</button>
              <button type="button" className={tab === 'properties' ? 'active' : ''} onClick={() => setTab('properties')} disabled={!selected}><Icon className="ti ti-settings" /> Selected</button>
            </div>

            {tab === 'elements' && (
              <div className="rp-panel">
                <div className="rp-panel-title">Add to canvas</div>
                <button type="button" className="rp-add-btn" onClick={addText}><Icon className="ti ti-text" /> Text line</button>
                <label className="rp-add-btn">
                  <Icon className="ti ti-image" /> Logo / image
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { addImageFromFile(e.target.files?.[0]); e.target.value = ''; }} />
                </label>
                <button type="button" className="rp-add-btn" onClick={() => addList(10)}><Icon className="ti ti-list" /> Top 10 list block</button>
                <button type="button" className="rp-add-btn" onClick={() => addList(20)}><Icon className="ti ti-layout-column2" /> Top 20 list block</button>

                {POSTER_ASSETS.length > 0 && (
                  <>
                    <div className="rp-panel-title" style={{ marginTop: 16 }}>Graphics <span className="rp-muted">(click to place)</span></div>
                    <div className="rp-asset-grid">
                      {POSTER_ASSETS.map((asset) => (
                        <button type="button" key={asset.id} className="rp-asset" title={asset.name} onClick={() => addAsset(asset)}>
                          <img src={asset.url} alt={asset.name} loading="lazy" />
                        </button>
                      ))}
                    </div>
                  </>
                )}

                <div className="rp-panel-title" style={{ marginTop: 16 }}>Student cards <span className="rp-muted">(photo + name + score)</span></div>
                <div className="rp-student-list">
                  {entries.slice(0, 30).map((e) => {
                    const onCanvas = poster.elements.some((el) => el.type === 'winner' && el.entryId === e.id);
                    return (
                      <div key={e.id} className={`rp-student-row${onCanvas ? ' on-canvas' : ''}`}>
                        <span className="rp-rank-dot" style={{ background: (RANK_COLORS[e.rank] || { fill: '#e2e8f0' }).fill }}>{e.rank}</span>
                        <span className="rp-student-name" title={e.name}>{e.name}</span>
                        <span className="rp-muted">{e.score}/{e.maxMarks}</span>
                        <button type="button" className="rp-mini-btn" title={onCanvas ? 'Add another card' : 'Add to canvas'} onClick={() => addWinner(e.id)}><Icon className="ti ti-plus" /></button>
                      </div>
                    );
                  })}
                </div>

                <div className="rp-panel-title" style={{ marginTop: 16 }}>Layers</div>
                <div className="rp-layer-list">
                  {poster.elements.slice().reverse().map((el) => (
                    <button type="button" key={el.id} className={`rp-layer${selectedId === el.id ? ' active' : ''}`} onClick={() => { setSelectedId(el.id); setTab('properties'); }}>
                      <Icon className={`ti ${el.type === 'text' ? 'ti-text' : el.type === 'winner' ? 'ti-user' : el.type === 'list' ? 'ti-list' : 'ti-image'}`} />
                      <span>{layerLabel(el, entryMap)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {tab === 'background' && (
              <div className="rp-panel">
                <div className="rp-panel-title">Style</div>
                <div className="rp-seg">
                  <button type="button" className={poster.background.mode === 'solid' ? 'active' : ''} onClick={() => setBackground({ mode: 'solid' })}>Solid</button>
                  <button type="button" className={poster.background.mode === 'gradient' ? 'active' : ''} onClick={() => setBackground({ mode: 'gradient' })}>Gradient</button>
                </div>
                <div className="rp-field-row">
                  <label className="rp-color-field">
                    <span>{poster.background.mode === 'gradient' ? 'Colour 1' : 'Colour'}</span>
                    <input type="color" value={poster.background.color1} onChange={(e) => setBackground({ color1: e.target.value }, 'bg:c1')} />
                  </label>
                  {poster.background.mode === 'gradient' && (
                    <label className="rp-color-field">
                      <span>Colour 2</span>
                      <input type="color" value={poster.background.color2} onChange={(e) => setBackground({ color2: e.target.value }, 'bg:c2')} />
                    </label>
                  )}
                </div>
                {poster.background.mode === 'gradient' && (
                  <label className="rp-range-field">
                    <span>Angle <em>{poster.background.angle}°</em></span>
                    <input type="range" min="0" max="360" step="15" value={poster.background.angle} onChange={(e) => setBackground({ angle: Number(e.target.value) }, 'bg:angle')} />
                  </label>
                )}
                <div className="rp-panel-title" style={{ marginTop: 16 }}>Presets</div>
                <div className="rp-preset-grid">
                  {BG_PRESETS.map((p) => (
                    <button
                      type="button"
                      key={p.name}
                      className="rp-preset"
                      title={p.name}
                      style={{ background: p.mode === 'gradient' ? `linear-gradient(${p.angle}deg, ${p.color1}, ${p.color2})` : p.color1 }}
                      onClick={() => setBackground({ mode: p.mode, color1: p.color1, color2: p.color2, angle: p.angle })}
                    >
                      <span>{p.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {tab === 'properties' && selected && (
              <div className="rp-panel">
                <div className="rp-panel-title">{layerLabel(selected, entryMap)}</div>

                {selected.type === 'text' && (
                  <>
                    <label className="rp-field">
                      <span>Text</span>
                      <textarea rows={3} value={selected.text} onChange={(e) => updateElement(selected.id, { text: e.target.value }, `text:${selected.id}`)} />
                    </label>
                    <div className="rp-field-row">
                      <label className="rp-field">
                        <span>Size</span>
                        <input type="number" min="12" max="240" value={selected.fontSize} onChange={(e) => updateElement(selected.id, { fontSize: Math.max(12, Number(e.target.value) || 12) }, `fs:${selected.id}`)} />
                      </label>
                      <label className="rp-field">
                        <span>Weight</span>
                        <select value={selected.weight} onChange={(e) => updateElement(selected.id, { weight: Number(e.target.value) })}>
                          <option value={400}>Regular</option>
                          <option value={600}>Semi-bold</option>
                          <option value={700}>Bold</option>
                          <option value={800}>Extra bold</option>
                        </select>
                      </label>
                    </div>
                    <div className="rp-field-row">
                      <label className="rp-color-field">
                        <span>Colour</span>
                        <input type="color" value={toHex(selected.color)} onChange={(e) => updateElement(selected.id, { color: e.target.value }, `color:${selected.id}`)} />
                      </label>
                      <div className="rp-field">
                        <span>Align</span>
                        <div className="rp-seg">
                          {['left', 'center', 'right'].map((a) => (
                            <button type="button" key={a} className={selected.align === a ? 'active' : ''} onClick={() => updateElement(selected.id, { align: a })}><Icon className={`ti ti-align-${a}`} /></button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <label className="rp-range-field">
                      <span>Width <em>{selected.w}px</em></span>
                      <input type="range" min="200" max={POSTER_W} step="10" value={selected.w} onChange={(e) => updateElement(selected.id, { w: Number(e.target.value) }, `w:${selected.id}`)} />
                    </label>
                  </>
                )}

                {selected.type === 'winner' && (
                  <>
                    <label className="rp-field">
                      <span>Student</span>
                      <select value={selected.entryId} onChange={(e) => updateElement(selected.id, { entryId: e.target.value })}>
                        {entries.map((e) => <option key={e.id} value={e.id}>#{e.rank} · {e.name}</option>)}
                      </select>
                    </label>
                    <label className="rp-range-field">
                      <span>Photo size <em>{selected.size}px</em></span>
                      <input type="range" min="90" max="520" step="5" value={selected.size} onChange={(e) => updateElement(selected.id, { size: Number(e.target.value) }, `size:${selected.id}`)} />
                    </label>
                    <div className="rp-field-row">
                      <label className="rp-color-field">
                        <span>Name</span>
                        <input type="color" value={toHex(selected.nameColor)} onChange={(e) => updateElement(selected.id, { nameColor: e.target.value }, `nc:${selected.id}`)} />
                      </label>
                      <label className="rp-color-field">
                        <span>Score</span>
                        <input type="color" value={toHex(selected.scoreColor)} onChange={(e) => updateElement(selected.id, { scoreColor: e.target.value }, `sc:${selected.id}`)} />
                      </label>
                    </div>
                    <label className="rp-add-btn">
                      <Icon className="ti ti-upload" /> {entryMap.get(selected.entryId)?.photoUrl ? 'Replace photo' : 'Upload photo'}
                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { setPhotoForEntry(selected.entryId, e.target.files?.[0]); e.target.value = ''; }} />
                    </label>
                    {!entryMap.get(selected.entryId)?.photoUrl && (
                      <p className="rp-hint">No photo on record — initials are shown until you upload one.</p>
                    )}
                  </>
                )}

                {selected.type === 'list' && (
                  <>
                    <label className="rp-range-field">
                      <span>Students shown <em>{selected.entryIds.length}</em></span>
                      <input
                        type="range" min="1" max={Math.max(1, entries.length)} step="1" value={selected.entryIds.length}
                        onChange={(e) => updateElement(selected.id, { entryIds: pickTop(entries, Number(e.target.value)).map((x) => x.id) }, `n:${selected.id}`)}
                      />
                    </label>
                    <div className="rp-field-row">
                      <label className="rp-field">
                        <span>Columns</span>
                        <select value={selected.columns} onChange={(e) => updateElement(selected.id, { columns: Number(e.target.value) })}>
                          <option value={1}>1</option><option value={2}>2</option><option value={3}>3</option>
                        </select>
                      </label>
                      <label className="rp-field">
                        <span>Font size</span>
                        <input type="number" min="16" max="80" value={selected.fontSize} onChange={(e) => updateElement(selected.id, { fontSize: Math.max(16, Number(e.target.value) || 16) }, `fs:${selected.id}`)} />
                      </label>
                    </div>
                    <div className="rp-field-row">
                      <label className="rp-color-field">
                        <span>Text</span>
                        <input type="color" value={toHex(selected.color)} onChange={(e) => updateElement(selected.id, { color: e.target.value }, `color:${selected.id}`)} />
                      </label>
                      <label className="rp-check-field">
                        <input type="checkbox" checked={Boolean(selected.card)} onChange={(e) => updateElement(selected.id, { card: e.target.checked })} />
                        <span>Card background</span>
                      </label>
                    </div>
                    <label className="rp-range-field">
                      <span>Width <em>{selected.w}px</em></span>
                      <input type="range" min="320" max={POSTER_W - 40} step="10" value={selected.w} onChange={(e) => updateElement(selected.id, { w: Number(e.target.value) }, `w:${selected.id}`)} />
                    </label>
                  </>
                )}

                {selected.type === 'image' && (
                  <label className="rp-range-field">
                    <span>Width <em>{selected.w}px</em></span>
                    <input type="range" min="60" max={POSTER_W} step="10" value={selected.w} onChange={(e) => { const w = Number(e.target.value); updateElement(selected.id, { w, h: Math.round(w * (selected.h / selected.w)) }, `w:${selected.id}`); }} />
                  </label>
                )}

                <div className="rp-field-row">
                  <label className="rp-field"><span>X</span><input type="number" value={Math.round(selected.x)} onChange={(e) => updateElement(selected.id, { x: Number(e.target.value) || 0 }, `x:${selected.id}`)} /></label>
                  <label className="rp-field"><span>Y</span><input type="number" value={Math.round(selected.y)} onChange={(e) => updateElement(selected.id, { y: Number(e.target.value) || 0 }, `y:${selected.id}`)} /></label>
                </div>
                <div className="rp-field-row rp-layer-actions">
                  <button type="button" className="rp-mini-btn wide" title="Send backward" onClick={() => moveLayer(selected.id, -1)}><Icon className="ti ti-arrow-down" /> Back</button>
                  <button type="button" className="rp-mini-btn wide" title="Bring forward" onClick={() => moveLayer(selected.id, 1)}><Icon className="ti ti-arrow-up" /> Front</button>
                  <button type="button" className="rp-mini-btn wide danger" onClick={() => removeElement(selected.id)}><Icon className="ti ti-trash" /> Remove</button>
                </div>
              </div>
            )}
            {tab === 'properties' && !selected && (
              <div className="rp-panel"><p className="rp-hint">Click an element on the canvas to edit it.</p></div>
            )}
          </aside>

          <div className="rp-stage" ref={stageRef} tabIndex={0} onKeyDown={onKeyDown}>
            <canvas
              ref={canvasRef}
              width={POSTER_W}
              height={POSTER_H}
              className="rp-canvas"
              style={{ width: POSTER_W * displayScale, height: POSTER_H * displayScale, cursor: dragRef.current ? 'grabbing' : 'grab' }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />
            {notice && <div className={`rp-notice ${notice.type}`}>{notice.text}</div>}
          </div>
        </div>

        <div className="rp-footer">
          <span className="rp-muted">Tip: hold <kbd>Alt</kbd> while dragging to disable snapping.</span>
          <div className="rp-footer-actions">
            <button type="button" className="crispr-btn crispr-btn-default" onClick={onClose}>Close</button>
            <button type="button" className="crispr-btn crispr-btn-default" disabled={busy} onClick={copyToClipboard}><Icon className="ti ti-files" /> Copy image</button>
            <button type="button" className="crispr-btn crispr-btn-primary" disabled={busy} onClick={download}><Icon className="ti ti-download" /> Download PNG</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function layerLabel(el, entryMap) {
  switch (el.type) {
    case 'text': return `Text: ${String(el.text || '').split('\n')[0].slice(0, 28) || '(empty)'}`;
    case 'winner': { const e = entryMap.get(el.entryId); return e ? `#${e.rank} ${e.name}` : 'Student card'; }
    case 'list': return `Rank list (${el.entryIds.length})`;
    case 'image': return el.name ? `Image: ${el.name}` : 'Image';
    default: return el.type;
  }
}

// <input type="color"> only accepts #rrggbb; map rgba()/short forms to a hex fallback.
function toHex(color) {
  const c = String(color || '#ffffff').trim();
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  if (/^#[0-9a-f]{3}$/i.test(c)) return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c);
  if (m) return `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
  return '#ffffff';
}

// ─── Flow wrapper: chooser → designer ─────────────────────────────────────────
export default function RankPosterFlow({ open, rankings, maxMarks, title, hasActiveFilters, onClose, onExported }) {
  const [step, setStep] = useState('choose');
  const [type, setType] = useState(null);
  const entries = useMemo(() => normalizeEntries(rankings, maxMarks), [rankings, maxMarks]);

  useEffect(() => { if (open) { setStep('choose'); setType(null); } }, [open]);

  if (!open) return null;
  if (step === 'choose') {
    return (
      <RankPosterTypeModal
        entries={entries}
        hasActiveFilters={hasActiveFilters}
        onClose={onClose}
        onConfirm={(t) => { setType(t); setStep('design'); }}
      />
    );
  }
  return (
    <RankPosterDesignerModal
      type={type}
      entries={entries}
      title={title}
      onClose={onClose}
      onExported={onExported}
    />
  );
}
