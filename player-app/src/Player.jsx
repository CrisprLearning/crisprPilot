import React, { useEffect, useRef, useState } from 'react';
import { fetchScreen, hasToken, heartbeat, pair } from './lib/api.js';
import { readCache, writeCache } from './lib/cache.js';
import * as socket from './lib/socket.js';
import { POLL_INTERVAL_MS, HEARTBEAT_MS } from './config.js';
import { log, warn } from './lib/log.js';
import ContentRenderer from './renderer/ContentRenderer.jsx';
import CheckinOverlay from './overlays/CheckinOverlay.jsx';
import EmergencyOverlay from './overlays/EmergencyOverlay.jsx';

export default function Player({ screenCode }) {
  const paired = hasToken(screenCode);
  const [data, setData] = useState(null);              // hydrated player payload
  const [error, setError] = useState(null);
  const [offline, setOffline] = useState(false);
  const [needPair, setNeedPair] = useState(!paired);
  const [idx, setIdx] = useState(0);                   // current item index
  const [phase, setPhase] = useState('in');            // 'in' | 'out'
  const [activeAlert, setActiveAlert] = useState(null);
  const etagRef = useRef(null);
  const advanceTimer = useRef(null);

  // ── Poll loop ─────────────────────────────────────────────────────
  useEffect(() => {
    if (needPair) return;
    let cancelled = false;

    async function load() {
      try {
        const res = await fetchScreen(screenCode, { etag: etagRef.current });
        if (cancelled) return;
        if (res.unchanged) return;                      // 304 — keep playing
        const payload = res.data;
        setData(payload);
        etagRef.current = payload.config_version || null;
        setOffline(false);
        setError(null);
        writeCache(screenCode, payload);
        log('loaded', screenCode, '→', payload.loop?.items?.length, 'items');
      } catch (e) {
        warn('fetch failed', e?.message, e?.code);
        if (e?.status === 401 || e?.status === 403 || e?.code === 'pairing_expired') {
          // Bearer dead or screen rotated — back to pairing UI
          setNeedPair(true);
          return;
        }
        const cached = readCache(screenCode);
        if (cached) { setData(cached); setOffline(true); setError(null); }
        else        { setError(e?.message || 'Failed to load screen'); }
      }
    }

    load();
    const poll = setInterval(load, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(poll); };
  }, [screenCode, needPair]);

  // ── Heartbeat ─────────────────────────────────────────────────────
  useEffect(() => {
    if (needPair) return;
    const send = () => {
      const current = data?.loop?.items?.[idx];
      heartbeat(screenCode, {
        current_item_id: current?.id,
        playback_status: data ? 'playing' : 'idle',
        player_version: '1.4.2',
      }).then((res) => {
        // Server says config drifted → refetch eagerly on next poll tick
        if (res?.config_version && etagRef.current && res.config_version !== etagRef.current) {
          etagRef.current = null;
        }
      }).catch(() => {});
    };
    send();
    const t = setInterval(send, HEARTBEAT_MS);
    return () => clearInterval(t);
  }, [screenCode, needPair, data, idx]);

  // ── Realtime overlays (mock for now; real WS later — §10 of contract) ──
  useEffect(() => {
    if (!data?.screen?.branch_id) return;
    socket.connect({ branchId: data.screen.branch_id });
    const offAlert = socket.subscribe(`emergency:${data.screen.branch_id}`, (alert) => setActiveAlert(alert));
    return () => { offAlert(); socket.disconnect(); };
  }, [data?.screen?.branch_id]);

  // ── Drive emergency overlay from polled alerts payload too ────────
  useEffect(() => {
    const a = (data?.alerts || []).find((x) => true);   // first active alert wins
    setActiveAlert(a || null);
  }, [data?.alerts]);

  // ── Advance items on duration ─────────────────────────────────────
  const items = data?.loop?.items || [];
  const current = items[idx];
  const loopEnabled = data?.loop?.auto_replay !== false;

  useEffect(() => {
    if (!current) return;
    clearTimeout(advanceTimer.current);
    setPhase('in');
    const dur = Math.max(2, Number(current.duration_seconds) || 8) * 1000;
    const outAt = dur - 600;                            // overlap transitions
    advanceTimer.current = setTimeout(() => {
      setPhase('out');
      setTimeout(() => {
        setIdx((i) => {
          const next = i + 1;
          if (next >= items.length) return loopEnabled ? 0 : i;
          return next;
        });
      }, 550);
    }, Math.max(800, outAt));
    return () => clearTimeout(advanceTimer.current);
  }, [idx, current?.id, items.length, loopEnabled]);

  // ── Pairing screen ────────────────────────────────────────────────
  if (needPair) {
    return <PairingScreen screenCode={screenCode} onPaired={() => { setNeedPair(false); etagRef.current = null; }} />;
  }

  // ── Loading / error states ────────────────────────────────────────
  if (error) {
    return (
      <div className="kiosk-hero">
        <h1 className="kiosk-h1" style={{ color: '#fca5a5' }}>Cannot load screen</h1>
        <p className="kiosk-h2">{screenCode}</p>
        <p className="kiosk-h2" style={{ opacity: 0.6 }}>{error}</p>
      </div>
    );
  }

  if (!data) return <div className="kiosk-badge">Connecting to {screenCode}…</div>;

  if (!current) {
    return (
      <>
        <div className="kiosk-hero">
          <h2 className="kiosk-h2">{data.screen.name}{data.screen.branch_name ? ` — ${data.screen.branch_name}` : ''}</h2>
          <h1 className="kiosk-h1">No loop assigned</h1>
        </div>
        {offline && <div className="kiosk-badge warn">Offline — using cache</div>}
      </>
    );
  }

  return (
    <div className="kiosk-stage">
      <div className={`kiosk-slot kiosk-anim-${current.transition_type || 'fade'}-${phase}`} key={`${current.id}-${idx}`}>
        <ContentRenderer item={current} screen={data.screen} />
      </div>

      <CheckinOverlay branchId={data.screen.branch_id} />
      {activeAlert && <EmergencyOverlay alert={activeAlert} onDismiss={() => setActiveAlert(null)} />}

      {offline && <div className="kiosk-badge warn">Offline — using cache</div>}
    </div>
  );
}

// ───────────────────────── Pairing UI ──────────────────────────────
function PairingScreen({ screenCode, onPaired }) {
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (code.length < 4) return;
    setSubmitting(true);
    setErr(null);
    try {
      await pair(screenCode, code.trim());
      onPaired();
    } catch (e) {
      const msg = e.code === 'pairing_expired' ? 'This pairing code has expired. Ask admin to regenerate it.'
              :  e.code === 'not_found'       ? 'No such screen, or it is already paired.'
              :  e.code === 'unauthenticated' ? 'Wrong pairing code.'
              :  e.message || 'Pairing failed.';
      setErr(msg);
    } finally { setSubmitting(false); }
  }

  return (
    <div className="kiosk-hero" style={{ background: 'radial-gradient(ellipse at center, #0f172a 0%, #000 75%)' }}>
      <div style={{ fontSize: 'clamp(28px,4vw,52px)', fontWeight: 800, letterSpacing: '-.02em' }}>Pair this screen</div>
      <div className="kiosk-h2" style={{ opacity: 0.7 }}>
        Screen code: <strong style={{ color: '#67e8f9' }}>{screenCode}</strong>
      </div>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, marginTop: 24 }}>
        <input
          autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 8))}
          placeholder="------"
          style={{ fontSize: 'clamp(40px,5vw,72px)', textAlign: 'center', letterSpacing: 12, padding: '14px 28px', border: '2px solid rgba(255,255,255,0.25)', borderRadius: 14, background: 'rgba(255,255,255,0.06)', color: '#fff', width: 'min(420px, 80vw)', fontVariantNumeric: 'tabular-nums' }}
        />
        <button type="submit" disabled={submitting || code.length < 4}
          style={{ ...kioskBtn, opacity: (submitting || code.length < 4) ? 0.5 : 1 }}>
          {submitting ? 'Pairing…' : 'Pair'}
        </button>
        {err && <div style={{ color: '#fca5a5', fontSize: 16, maxWidth: 480, textAlign: 'center' }}>{err}</div>}
      </form>
      <p className="kiosk-h2" style={{ opacity: 0.5, fontSize: 18, marginTop: 24 }}>
        Ask the admin to share the 6-digit pairing code for this screen.
      </p>
    </div>
  );
}

const kioskBtn = {
  fontSize: 22, padding: '14px 36px', borderRadius: 999,
  background: 'linear-gradient(90deg,#0ea5e9,#6366f1)', color: '#fff',
  border: 'none', cursor: 'pointer', fontWeight: 700, letterSpacing: '.04em',
};
