import { useState, useEffect, useRef, useCallback } from 'react'
import { MODES, createRenderer, videoToScreen } from './gl.js'
import { createMotion, vault, stamp, sha256, beep, recorderType, shareBlob, download, dataUrlToBlob } from './engine.js'
import { Sheet, Btn, Section, Toggle, Slider, Tool, FONT, DISPLAY, PANEL } from './ui.jsx'

const PRESETS = [
  { id: 'SURVEIL', icon: '🛡', mode: 1, ev: 1,   zoom: 1, edge: false, ai: true,  sentry: true,  sens: 0.7 },
  { id: 'RECON',   icon: '🔭', mode: 7, ev: 0,   zoom: 2, edge: true,  ai: true,  sentry: false, sens: 0.5 },
  { id: 'ASTRO',   icon: '✨', mode: 9, ev: 2,   zoom: 1, edge: false, ai: false, sentry: false, sens: 0.3 },
  { id: 'SEARCH',  icon: '🔍', mode: 3, ev: 0.5, zoom: 1, edge: true,  ai: true,  sentry: false, sens: 0.85 },
]
const QUALITY = { HIGH: 1, BALANCED: 0.75, SAVER: 0.5 }

// ── camera ─────────────────────────────────────────────────────────────────
function useCamera(facing, attempt) {
  const [stream, setStream] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    let live = true, s = null
    setError(null)
    ;(async () => {
      try {
        s = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
        })
        if (!live) { s.getTracks().forEach(t => t.stop()); return }
        setStream(s)
      } catch (e) {
        if (live) setError(e?.name === 'NotAllowedError'
          ? 'Camera permission was denied. Allow camera access in your browser settings, then retry.'
          : (e?.message || 'Camera unavailable on this device.'))
      }
    })()
    return () => { live = false; s?.getTracks().forEach(t => t.stop()); setStream(null) }
  }, [facing, attempt])
  return { stream, error }
}

// ── lazy AI detector ───────────────────────────────────────────────────────
function useDetector(enabled) {
  const model = useRef(null)
  const [state, setState] = useState('off') // off | loading | ready | failed
  useEffect(() => {
    if (!enabled || model.current) { if (model.current) setState('ready'); return }
    let dead = false
    setState('loading')
    ;(async () => {
      try {
        const [tf, coco] = await Promise.all([import('@tensorflow/tfjs'), import('@tensorflow-models/coco-ssd')])
        await tf.ready()
        const m = await coco.load({ base: 'lite_mobilenet_v2' })
        if (!dead) { model.current = m; setState('ready') }
      } catch { if (!dead) setState('failed') }
    })()
    return () => { dead = true }
  }, [enabled])
  return { model, state }
}

export default function App() {
  // ── settings ──
  const [mode, setMode] = useState(1)
  const [ev, setEv] = useState(0.5)
  const [denoise, setDenoise] = useState(null)   // null = auto per mode
  const [zoom, setZoom] = useState(1)
  const [edge, setEdge] = useState(false)
  const [grid, setGrid] = useState(false)
  const [ai, setAi] = useState(false)
  const [sentry, setSentry] = useState(false)
  const [sens, setSens] = useState(0.6)
  const [alerts, setAlerts] = useState(true)
  const [stampOn, setStampOn] = useState(true)
  const [vaultOn, setVaultOn] = useState(true)
  const [quality, setQuality] = useState('BALANCED')
  const [preset, setPreset] = useState(null)

  // ── runtime ──
  const [facing, setFacing] = useState('environment')
  const [attempt, setAttempt] = useState(0)
  const [needsTap, setNeedsTap] = useState(false)
  const [fps, setFps] = useState(0)
  const [motion, setMotion] = useState({ frac: 0, boxes: [] })
  const [dets, setDets] = useState([])
  const [recording, setRecording] = useState(false)
  const [torch, setTorch] = useState(false)
  const [torchOk, setTorchOk] = useState(false)
  const [flash, setFlash] = useState(false)
  const [shots, setShots] = useState([])
  const [clips, setClips] = useState([])
  const [sheet, setSheet] = useState(null)
  const [viewer, setViewer] = useState(null)
  const [gps, setGps] = useState(null)
  const [glFail, setGlFail] = useState(false)
  const [clock, setClock] = useState('')
  const [alertFlash, setAlertFlash] = useState(false)
  const [cast, setCast] = useState({ on: false, code: '', viewers: 0, status: 'idle' })
  const [storage, setStorage] = useState(null)
  const [toast, setToast] = useState(null)

  const M = MODES[mode]
  const color = M.color
  const mirror = facing === 'user'
  const { stream, error } = useCamera(facing, attempt)
  const { model, state: aiState } = useDetector(ai)

  const videoRef = useRef(null), canvasRef = useRef(null), stageRef = useRef(null)
  const rendererRef = useRef(null), geomRef = useRef({ sx: 1, sy: 1 })
  const motionFn = useRef(null), recRef = useRef(null), stopAtRef = useRef(0)
  const lastTrigger = useRef(0), gpsRef = useRef(null), castRef = useRef(null)
  const cfg = useRef({})
  cfg.current = {
    mode: M.idx, ev, zoom, edge, mirror, sens, sentry, alerts, vaultOn,
    denoise: denoise ?? M.denoise, needMotion: sentry || !ai,
  }

  const say = useCallback(msg => { setToast(msg); clearTimeout(say.t); say.t = setTimeout(() => setToast(null), 2200) }, [])

  // ── clock ──
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('en-US', { hour12: false }))
    tick(); const i = setInterval(tick, 1000); return () => clearInterval(i)
  }, [])

  // ── restore vault ──
  useEffect(() => {
    ;(async () => {
      const [s, c] = await Promise.all([vault.all('shots'), vault.all('clips')])
      setShots(s.sort((a, b) => b.ts - a.ts)); setClips(c.sort((a, b) => b.ts - a.ts))
      setStorage(await vault.usage())
      try { await navigator.storage?.persist?.() } catch { /* optional */ }
    })()
  }, [])

  // ── wake lock ──
  useEffect(() => {
    let lock = null
    const get = async () => { try { lock = await navigator.wakeLock?.request('screen') } catch { /* optional */ } }
    get()
    const vis = () => document.visibilityState === 'visible' && get()
    document.addEventListener('visibilitychange', vis)
    return () => { document.removeEventListener('visibilitychange', vis); lock?.release?.() }
  }, [])

  // ── attach stream ──
  useEffect(() => {
    const v = videoRef.current
    if (!v || !stream) return
    v.srcObject = stream
    v.play().then(() => setNeedsTap(false)).catch(() => setNeedsTap(true))
    const track = stream.getVideoTracks()[0]
    setTorchOk(!!track?.getCapabilities?.()?.torch); setTorch(false)
    const ended = () => setAttempt(a => a + 1)
    track?.addEventListener('ended', ended)
    rendererRef.current?.reset()
    // GPS starts only once the camera is live
    let gid = null
    if (navigator.geolocation) {
      gid = navigator.geolocation.watchPosition(
        p => { const g = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }; gpsRef.current = g; setGps(g) },
        () => {}, { enableHighAccuracy: true, maximumAge: 5000 })
    }
    return () => { track?.removeEventListener('ended', ended); if (gid != null) navigator.geolocation.clearWatch(gid) }
  }, [stream])

  // ── renderer + resize ──
  useEffect(() => {
    const cv = canvasRef.current, stage = stageRef.current
    if (!cv || !stage) return
    let r
    try { r = createRenderer(cv) } catch { r = null }
    if (!r) { setGlFail(true); return }
    rendererRef.current = r
    motionFn.current = createMotion()
    const fit = () => {
      const b = stage.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2) * QUALITY[quality]
      let w = Math.round(b.width * dpr), h = Math.round(b.height * dpr)
      const cap = 1600, long = Math.max(w, h)
      if (long > cap) { w = Math.round(w * cap / long); h = Math.round(h * cap / long) }
      r.resize(Math.max(2, w), Math.max(2, h))
    }
    fit()
    const ro = new ResizeObserver(fit); ro.observe(stage)
    return () => ro.disconnect()
  }, [quality])

  useEffect(() => { rendererRef.current?.reset() }, [mode, facing])

  // ── recording ──
  const startRec = useCallback((auto = false) => {
    const c = canvasRef.current
    if (!c || recRef.current || !window.MediaRecorder) return
    const type = recorderType()
    const rec = new MediaRecorder(c.captureStream(30), type ? { mimeType: type, videoBitsPerSecond: 6_000_000 } : undefined)
    const chunks = [], t0 = Date.now()
    rec.ondataavailable = e => { if (e.data?.size) chunks.push(e.data) }
    rec.onstop = async () => {
      const blob = new Blob(chunks, { type: rec.mimeType || type || 'video/webm' })
      if (!blob.size) return
      const clip = { ts: Date.now(), blob, dur: Math.max(1, Math.round((Date.now() - t0) / 1000)), auto, mode: MODES[cfg.current.mode].label, size: blob.size }
      setClips(x => [clip, ...x])
      if (cfg.current.vaultOn) { await vault.put('clips', clip); setStorage(await vault.usage()) }
    }
    rec.start(1000)
    recRef.current = { rec, auto }
    setRecording(true)
  }, [])
  const stopRec = useCallback(() => {
    const r = recRef.current; if (!r) return
    try { r.rec.stop() } catch { /* already stopped */ }
    recRef.current = null; setRecording(false)
  }, [])

  // ── sentry trigger ──
  const trigger = useCallback(reason => {
    const now = Date.now()
    stopAtRef.current = now + 15000
    if (now - lastTrigger.current < 3000) return
    lastTrigger.current = now
    if (cfg.current.alerts) beep(reason === 'person' ? 988 : 784, 0.14, 2)
    setAlertFlash(true); setTimeout(() => setAlertFlash(false), 600)
    if (!recRef.current) startRec(true)
  }, [startRec])

  // ── the render loop ──
  useEffect(() => {
    let raf, frames = 0, last = performance.now(), tick = 0, lastUi = 0
    const loop = t => {
      const v = videoRef.current, r = rendererRef.current, S = cfg.current
      if (v && r && v.readyState >= 2) {
        const g = r.render(v, { mode: S.mode, gain: Math.pow(2, S.ev), denoise: S.denoise, zoom: S.zoom, edge: S.edge, mirror: S.mirror, time: t / 1000 })
        if (g) geomRef.current = g
        frames++
        if (S.needMotion && (++tick & 1) === 0 && motionFn.current) {
          const m = motionFn.current(v, S.sens)
          if (S.sentry && m.frac > 0.006 + (1 - S.sens) * 0.02 && m.boxes.length) trigger('motion')
          if (t - lastUi > 200) { lastUi = t; setMotion(m) }
        }
        const rr = recRef.current
        if (rr?.auto && Date.now() > stopAtRef.current) stopRec()
      }
      if (t - last >= 1000) { setFps(frames); frames = 0; last = t }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [trigger, stopRec])

  // ── AI detection (off the render loop, 1.6 Hz) ──
  useEffect(() => {
    if (!ai || aiState !== 'ready') { setDets([]); return }
    const small = document.createElement('canvas')
    let busy = false
    const id = setInterval(async () => {
      const v = videoRef.current
      if (busy || !v || v.readyState < 2 || !model.current) return
      busy = true
      try {
        small.width = 320; small.height = Math.round(320 * v.videoHeight / v.videoWidth)
        small.getContext('2d').drawImage(v, 0, 0, small.width, small.height)
        const preds = await model.current.detect(small, 8, 0.45)
        const d = preds.map(p => ({
          label: p.class, score: p.score,
          x: p.bbox[0] / small.width, y: p.bbox[1] / small.height,
          w: p.bbox[2] / small.width, h: p.bbox[3] / small.height,
        }))
        setDets(d)
        if (cfg.current.sentry && d.some(o => o.label === 'person')) trigger('person')
      } catch { /* skip frame */ }
      busy = false
    }, 600)
    return () => clearInterval(id)
  }, [ai, aiState, model, trigger])

  // ── capture ──
  const snap = useCallback(async () => {
    const c = canvasRef.current
    if (!c) return
    setFlash(true); setTimeout(() => setFlash(false), 140)
    let url = c.toDataURL('image/jpeg', 0.92)
    const now = new Date()
    const meta = { utc: now.toISOString().replace('T', ' ').slice(0, 19) + 'Z', mode: M.label, zoom, gps: gpsRef.current }
    if (stampOn) { try { url = await stamp(url, meta) } catch { /* keep unstamped */ } }
    const hash = await sha256(url)
    const shot = { ts: now.getTime(), url, hash, mode: M.label, utc: meta.utc, gps: meta.gps }
    setShots(s => [shot, ...s])
    if (vaultOn) { await vault.put('shots', shot); setStorage(await vault.usage()) }
  }, [M.label, zoom, stampOn, vaultOn])

  // ── torch ──
  const toggleTorch = useCallback(async () => {
    const track = stream?.getVideoTracks()[0]
    if (!track) return
    try { await track.applyConstraints({ advanced: [{ torch: !torch }] }); setTorch(t => !t) }
    catch { say('Torch not supported on this camera') }
  }, [stream, torch, say])

  // ── cast ──
  const startCast = useCallback(async () => {
    const c = canvasRef.current
    if (!c?.captureStream) { say('Casting not supported in this browser'); return }
    const code = Math.random().toString(36).slice(2, 6).toUpperCase()
    setCast({ on: true, code, viewers: 0, status: 'connecting' })
    try {
      const { joinRoom } = await import('trystero/nostr')
      const room = joinRoom({ appId: 'nvs15-cast' }, `nvs-${code}`)
      const out = c.captureStream(24)
      room.addStream(out)
      room.onPeerJoin(id => { try { room.addStream(out, id) } catch { /* noop */ } ; setCast(s => ({ ...s, viewers: s.viewers + 1, status: 'live' })) })
      room.onPeerLeave(() => setCast(s => ({ ...s, viewers: Math.max(0, s.viewers - 1) })))
      castRef.current = room
      setCast(s => ({ ...s, status: 'waiting' }))
    } catch { setCast({ on: false, code: '', viewers: 0, status: 'failed' }); say('Could not start cast') }
  }, [say])
  const stopCast = useCallback(() => {
    try { castRef.current?.leave() } catch { /* noop */ }
    castRef.current = null
    setCast({ on: false, code: '', viewers: 0, status: 'idle' })
  }, [])

  // ── presets ──
  const applyPreset = p => {
    setMode(p.mode); setEv(p.ev); setZoom(p.zoom); setEdge(p.edge); setAi(p.ai)
    setSentry(p.sentry); setSens(p.sens); setDenoise(null); setPreset(p.id)
    say(`${p.id} preset loaded`)
  }

  // ── gestures ──
  const gRef = useRef({})
  const onTouchStart = e => {
    const g = gRef.current
    if (e.touches.length === 2) {
      const [a, b] = e.touches
      g.kind = 'pinch'; g.d0 = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY); g.z0 = zoom
    } else if (e.touches.length === 1) {
      g.kind = 'swipe'; g.x0 = e.touches[0].clientX; g.y0 = e.touches[0].clientY; g.t0 = Date.now(); g.ev0 = ev
    }
  }
  const onTouchMove = e => {
    const g = gRef.current
    if (g.kind === 'pinch' && e.touches.length === 2) {
      const [a, b] = e.touches
      const d = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY)
      setZoom(Math.min(8, Math.max(1, +(g.z0 * d / g.d0).toFixed(2))))
    } else if (g.kind === 'swipe' && e.touches.length === 1) {
      const dx = e.touches[0].clientX - g.x0, dy = e.touches[0].clientY - g.y0
      if (Math.abs(dy) > 24 && Math.abs(dy) > Math.abs(dx) * 1.4) {
        g.vertical = true
        setEv(Math.min(3, Math.max(-2, +(g.ev0 - dy / 120).toFixed(1))))
      }
    }
  }
  const onTouchEnd = e => {
    const g = gRef.current
    if (g.kind === 'swipe' && !g.vertical) {
      const t = e.changedTouches[0], dx = t.clientX - g.x0, dy = t.clientY - g.y0, dt = Date.now() - g.t0
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && dt < 600) {
        setMode(m => (m + (dx < 0 ? 1 : -1) + MODES.length) % MODES.length); setPreset(null)
      } else if (Math.abs(dx) < 12 && Math.abs(dy) < 12 && dt < 300) {
        const now = Date.now()
        if (now - (g.lastTap || 0) < 300) { setZoom(1); g.lastTap = 0 } else g.lastTap = now
      }
    }
    g.kind = null; g.vertical = false
  }

  // ── overlay geometry ──
  const box = (x, y, w, h) => {
    const G = { ...geomRef.current, zoom, mirror }
    const [ax, ay] = videoToScreen(x, y, G), [bx, by] = videoToScreen(x + w, y + h, G)
    const l = Math.max(0, Math.min(ax, bx)), t = Math.max(0, Math.min(ay, by))
    const r = Math.min(1, Math.max(ax, bx)), b = Math.min(1, Math.max(ay, by))
    if (r <= l || b <= t) return null
    return { left: `${l * 100}%`, top: `${t * 100}%`, width: `${(r - l) * 100}%`, height: `${(b - t) * 100}%` }
  }

  const lastShot = shots[0]
  const watchUrl = cast.code ? `${location.origin}/?watch=${cast.code}` : ''

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden', fontFamily: FONT, color: '#e9f1ec' }}>
      <video ref={videoRef} muted playsInline autoPlay style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />

      {/* ══ STAGE ══ */}
      <div ref={stageRef} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        style={{ position: 'absolute', inset: 0, touchAction: 'none' }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />

        {grid && (
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            {[33.33, 66.66].map(p => <line key={'v' + p} x1={`${p}%`} y1="0" x2={`${p}%`} y2="100%" stroke={color} strokeOpacity=".3" />)}
            {[33.33, 66.66].map(p => <line key={'h' + p} x1="0" y1={`${p}%`} x2="100%" y2={`${p}%`} stroke={color} strokeOpacity=".3" />)}
            <circle cx="50%" cy="50%" r="22" fill="none" stroke={color} strokeOpacity=".7" strokeWidth="1.5" />
            <line x1="50%" y1="calc(50% - 34px)" x2="50%" y2="calc(50% - 10px)" stroke={color} strokeOpacity=".8" />
          </svg>
        )}

        {/* motion boxes */}
        {!ai && motion.boxes.map((b, i) => {
          const s = box(b.x, b.y, b.w, b.h); if (!s) return null
          return <div key={i} style={{ position: 'absolute', ...s, border: `2px solid ${i ? `${color}99` : color}`, borderRadius: 4, pointerEvents: 'none', boxShadow: i ? 'none' : `0 0 12px ${color}88` }} />
        })}

        {/* AI detections */}
        {ai && dets.map((d, i) => {
          const s = box(d.x, d.y, d.w, d.h); if (!s) return null
          const c = d.label === 'person' ? '#ff4d6d' : '#ffd23f'
          return (
            <div key={i} style={{ position: 'absolute', ...s, border: `2.5px solid ${c}`, borderRadius: 5, pointerEvents: 'none', boxShadow: `0 0 14px ${c}77` }}>
              <span style={{ position: 'absolute', top: -26, left: -2, background: c, color: '#000', fontFamily: FONT,
                fontSize: 13, fontWeight: 800, padding: '3px 8px', borderRadius: 5, whiteSpace: 'nowrap', letterSpacing: .5 }}>
                {d.label.toUpperCase()} {Math.round(d.score * 100)}%
              </span>
            </div>
          )
        })}

        {flash && <div style={{ position: 'absolute', inset: 0, background: '#fff', opacity: .7, pointerEvents: 'none' }} />}
        {alertFlash && <div style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 0 0 6px #ff3b5c', pointerEvents: 'none' }} />}
      </div>

      {/* ══ CAMERA STATES ══ */}
      {glFail && (
        <Center>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#ffb347' }}>GPU RENDERING UNAVAILABLE</div>
          <div style={{ fontSize: 13, opacity: .8, maxWidth: 300, textAlign: 'center', lineHeight: 1.5 }}>This browser does not support WebGL2. Try the latest Safari or Chrome.</div>
        </Center>
      )}
      {!glFail && error && (
        <Center>
          <div style={{ fontSize: 34 }}>📷</div>
          <div style={{ fontSize: 15, maxWidth: 310, textAlign: 'center', lineHeight: 1.55 }}>{error}</div>
          <Btn color={color} onClick={() => setAttempt(a => a + 1)}>↻ RETRY CAMERA</Btn>
        </Center>
      )}
      {!glFail && !error && (needsTap || !stream) && (
        <Center onClick={() => { videoRef.current?.play().then(() => setNeedsTap(false)).catch(() => {}); if (!stream) setAttempt(a => a + 1) }}>
          <div style={{ width: 88, height: 88, borderRadius: '50%', border: `3px solid ${color}`, display: 'grid', placeItems: 'center', fontSize: 34, color }}>▶</div>
          <div style={{ fontSize: 15, fontWeight: 700, color, letterSpacing: 2 }}>{stream ? 'TAP TO START' : 'STARTING CAMERA…'}</div>
        </Center>
      )}

      {/* ══ TOP STATUS ══ */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
        padding: 'calc(env(safe-area-inset-top,0px) + 10px) 14px 14px',
        background: 'linear-gradient(to bottom, rgba(0,0,0,.92), rgba(0,0,0,.5) 65%, transparent)',
        display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontFamily: DISPLAY, fontSize: 19, fontWeight: 900, color, letterSpacing: 3, textShadow: `0 0 16px ${color}77` }}>NVS</span>
        <span style={{ fontSize: 14, fontWeight: 700, color }}>{M.label}</span>
        <span style={{ flex: 1 }} />
        {recording && <Pill c="#ff4d4d" blink>● REC</Pill>}
        {sentry && <Pill c="#ff3b5c">🛡 ARMED</Pill>}
        {cast.on && <Pill c="#5cd6ff">📡 {cast.viewers}</Pill>}
        {ai && <Pill c={aiState === 'ready' ? '#7dff9a' : '#ffd23f'} blink={aiState === 'loading'}>{aiState === 'ready' ? 'AI ✓' : aiState === 'failed' ? 'AI ✗' : 'AI …'}</Pill>}
        <span style={{ fontSize: 13, color: 'rgba(233,241,236,.8)' }}>{clock}</span>
      </div>

      {/* ══ READOUT CHIP ══ */}
      <div style={{ position: 'absolute', left: 14, zIndex: 20, bottom: 'calc(env(safe-area-inset-bottom,0px) + 250px)',
        display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Chip>EV {ev > 0 ? '+' : ''}{ev.toFixed(1)}</Chip>
        {zoom > 1.01 && <Chip>{zoom.toFixed(1)}×</Chip>}
        <Chip>{fps} FPS</Chip>
        {gps && <Chip>📍 ±{Math.round(gps.acc)}m</Chip>}
      </div>

      {toast && (
        <div style={{ position: 'absolute', left: '50%', top: 'calc(env(safe-area-inset-top,0px) + 64px)', transform: 'translateX(-50%)',
          zIndex: 40, background: PANEL, border: `1.5px solid ${color}66`, borderRadius: 12, padding: '10px 16px',
          fontSize: 14, fontWeight: 700, color, whiteSpace: 'nowrap' }}>{toast}</div>
      )}

      {/* ══ DOCK ══ */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 20,
        paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 8px)',
        background: 'linear-gradient(to top, rgba(0,0,0,.97) 70%, rgba(0,0,0,.6) 88%, transparent)' }}>

        {/* mode wheel */}
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto', padding: '14px 12px 6px', scrollbarWidth: 'none' }}>
          {MODES.map((m, i) => (
            <button key={m.id} onClick={() => { setMode(i); setPreset(null) }} style={{
              flexShrink: 0, padding: '9px 14px', borderRadius: 10,
              background: i === mode ? `${m.color}22` : 'transparent',
              border: `1.5px solid ${i === mode ? m.color : 'transparent'}`,
              fontFamily: FONT, fontSize: i === mode ? 15 : 13, fontWeight: i === mode ? 800 : 600,
              color: i === mode ? m.color : 'rgba(233,241,236,.72)', letterSpacing: 1.2, whiteSpace: 'nowrap',
            }}>{m.label}</button>
          ))}
        </div>

        {/* shutter row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 22px 12px' }}>
          <button onClick={() => setSheet('gallery')} style={{ width: 56, height: 56, borderRadius: 14, overflow: 'hidden',
            border: '2px solid rgba(255,255,255,.3)', background: '#111', padding: 0 }}>
            {lastShot ? <img src={lastShot.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: 22 }}>🖼</span>}
          </button>
          <Round onClick={() => setFacing(f => f === 'user' ? 'environment' : 'user')} label="FLIP">⟲</Round>
          <button onClick={snap} aria-label="Capture" style={{ width: 82, height: 82, borderRadius: '50%', padding: 0,
            border: `4px solid ${color}`, background: 'transparent', display: 'grid', placeItems: 'center',
            boxShadow: `0 0 26px ${color}55` }}>
            <span style={{ width: 64, height: 64, borderRadius: '50%', background: color }} />
          </button>
          <Round onClick={() => recording ? stopRec() : startRec(false)} label={recording ? 'STOP' : 'VIDEO'} active={recording} c="#ff4d4d">
            {recording ? '■' : '●'}
          </Round>
          <Round onClick={toggleTorch} label="TORCH" active={torch} c="#ffd27a" dim={!torchOk}>🔦</Round>
        </div>

        {/* tool strip */}
        <div style={{ display: 'flex', gap: 8, padding: '0 12px' }}>
          <Tool icon="⚙" label="SETTINGS" c={color} on onClick={() => setSheet('settings')} />
          <Tool icon="◎" label="AI" c="#7dff9a" on={ai} onClick={() => setAi(a => !a)} />
          <Tool icon="🛡" label="SENTRY" c="#ff3b5c" on={sentry} onClick={() => { setSentry(s => !s); say(sentry ? 'Sentry disarmed' : 'Sentry armed — records on motion') }} />
          <Tool icon="📡" label="CAST" c="#5cd6ff" on={cast.on} onClick={() => setSheet('cast')} />
          <Tool icon="?" label="HELP" c={color} onClick={() => setSheet('help')} />
        </div>
      </div>

      {/* ══ SETTINGS ══ */}
      {sheet === 'settings' && (
        <Sheet title="SETTINGS" color={color} onClose={() => setSheet(null)}>
          <Section color={color}>MISSION PRESETS</Section>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {PRESETS.map(p => (
              <Btn key={p.id} color={color} active={preset === p.id} onClick={() => applyPreset(p)} style={{ padding: '15px 8px', fontSize: 14 }}>
                {p.icon} {p.id}
              </Btn>
            ))}
          </div>

          <Section color={color}>IMAGE</Section>
          <Slider color={color} label="EXPOSURE" value={ev} min={-2} max={3} step={0.1} onChange={setEv} fmt={v => `${v > 0 ? '+' : ''}${v.toFixed(1)} EV`} />
          <Slider color={color} label="NOISE REDUCTION" value={denoise ?? M.denoise} min={0} max={0.95} step={0.05}
            onChange={setDenoise} fmt={v => denoise === null ? `AUTO ${Math.round(v * 100)}%` : `${Math.round(v * 100)}%`} />
          {denoise !== null && <Btn color={color} onClick={() => setDenoise(null)}>RESET NOISE TO AUTO</Btn>}
          <Slider color={color} label="ZOOM" value={zoom} min={1} max={8} step={0.1} onChange={setZoom} fmt={v => `${v.toFixed(1)}×`} />

          <Section color={color}>OVERLAYS</Section>
          <Toggle color={color} label="AI OBJECT DETECTION" hint="Names 80 object types. Downloads ~2MB once." on={ai} onClick={() => setAi(a => !a)} c="#7dff9a" />
          <Toggle color={color} label="EDGE HIGHLIGHT" hint="Outlines shapes in gold" on={edge} onClick={() => setEdge(e => !e)} c="#ffd23f" />
          <Toggle color={color} label="GRID & RETICLE" on={grid} onClick={() => setGrid(g => !g)} />

          <Section color={color}>SECURITY</Section>
          <Toggle color={color} label="SENTRY" hint="Auto-records 15s clips when motion or a person appears" on={sentry} onClick={() => setSentry(s => !s)} c="#ff3b5c" />
          <Slider color={color} label="MOTION SENSITIVITY" value={sens} min={0.1} max={1} step={0.05} onChange={setSens} fmt={v => `${Math.round(v * 100)}%`} />
          <Toggle color={color} label="ALERT SOUND" on={alerts} onClick={() => setAlerts(a => !a)} c="#ffb347" />

          <Section color={color}>CAPTURE</Section>
          <Toggle color={color} label="GEO-STAMP" hint="Burns UTC time + GPS into photos, stores a SHA-256 hash" on={stampOn} onClick={() => setStampOn(s => !s)} c="#4dffc3" />
          <Toggle color={color} label="SAVE TO VAULT" hint="Keeps photos & videos on this device after closing" on={vaultOn} onClick={() => setVaultOn(v => !v)} c="#4dffc3" />
          {storage && (
            <div style={{ fontSize: 13, color: 'rgba(233,241,236,.7)', padding: '2px 4px' }}>
              Storage used: {(storage.usage / 1048576).toFixed(1)} MB of {(storage.quota / 1073741824).toFixed(1)} GB
            </div>
          )}

          <Section color={color}>PERFORMANCE</Section>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {Object.keys(QUALITY).map(q => (
              <Btn key={q} color={color} active={quality === q} onClick={() => setQuality(q)} style={{ fontSize: 12, padding: '12px 4px' }}>{q}</Btn>
            ))}
          </div>
          <div style={{ fontSize: 12.5, color: 'rgba(233,241,236,.62)', lineHeight: 1.5, padding: '0 4px' }}>
            Running at {fps} FPS · {rendererRef.current?.halfFloat ? 'high-precision' : 'standard'} GPU buffers. Choose SAVER on older phones or to save battery.
          </div>
        </Sheet>
      )}

      {/* ══ GALLERY ══ */}
      {sheet === 'gallery' && (
        <Gallery color={color} shots={shots} clips={clips} onClose={() => setSheet(null)} onOpen={setViewer}
          onDeleteShot={async s => { setShots(x => x.filter(y => y.ts !== s.ts)); await vault.del('shots', s.ts) }}
          onDeleteClip={async c => { setClips(x => x.filter(y => y.ts !== c.ts)); await vault.del('clips', c.ts) }} />
      )}

      {viewer && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 120, background: '#000', display: 'flex', flexDirection: 'column' }}>
          <img src={viewer.url} alt="" style={{ flex: 1, minHeight: 0, objectFit: 'contain', width: '100%' }} />
          <div style={{ padding: '14px 16px calc(env(safe-area-inset-bottom,0px) + 16px)', background: PANEL, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13, color: 'rgba(233,241,236,.8)' }}>{viewer.utc} · {viewer.mode}</div>
            {viewer.hash && <div style={{ fontSize: 11, color: 'rgba(233,241,236,.55)', wordBreak: 'break-all' }}>SHA-256 {viewer.hash}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <Btn color={color} onClick={async () => { if (!(await shareBlob(await dataUrlToBlob(viewer.url), `nvs-${viewer.ts}.jpg`, `NVS ${viewer.utc}`))) download(viewer.url, `nvs-${viewer.ts}.jpg`) }}>SHARE</Btn>
              <Btn color={color} onClick={() => download(viewer.url, `nvs-${viewer.ts}.jpg`)}>SAVE</Btn>
              <Btn color={color} onClick={() => setViewer(null)}>CLOSE</Btn>
            </div>
          </div>
        </div>
      )}

      {/* ══ CAST ══ */}
      {sheet === 'cast' && (
        <Sheet title="REMOTE CAST" color={color} onClose={() => setSheet(null)}>
          <div style={{ fontSize: 14, lineHeight: 1.6, color: 'rgba(233,241,236,.85)' }}>
            Stream this processed view live to another device — peer-to-peer, no server, no account.
          </div>
          {!cast.on ? (
            <Btn color="#5cd6ff" onClick={startCast} style={{ padding: '16px', fontSize: 15 }}>📡 START CASTING</Btn>
          ) : (
            <>
              <div style={{ textAlign: 'center', padding: '18px', borderRadius: 16, border: '1.5px solid #5cd6ff66', background: 'rgba(92,214,255,.08)' }}>
                <div style={{ fontSize: 13, color: 'rgba(233,241,236,.7)', letterSpacing: 2 }}>CAST CODE</div>
                <div style={{ fontFamily: DISPLAY, fontSize: 46, fontWeight: 900, color: '#5cd6ff', letterSpacing: 10, margin: '6px 0' }}>{cast.code}</div>
                <div style={{ fontSize: 13, color: '#5cd6ff' }}>
                  {cast.status === 'connecting' ? 'Connecting…' : cast.viewers ? `${cast.viewers} watching` : 'Waiting for a viewer'}
                </div>
              </div>
              <div style={{ fontSize: 13.5, lineHeight: 1.6, color: 'rgba(233,241,236,.85)' }}>
                On the other device, open:<br />
                <span style={{ color: '#5cd6ff', wordBreak: 'break-all' }}>{watchUrl}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Btn color="#5cd6ff" onClick={() => { navigator.clipboard?.writeText(watchUrl); say('Link copied') }}>COPY LINK</Btn>
                <Btn color="#5cd6ff" danger onClick={stopCast}>STOP</Btn>
              </div>
            </>
          )}
        </Sheet>
      )}

      {/* ══ HELP ══ */}
      {sheet === 'help' && (
        <Sheet title="FIELD GUIDE" color={color} onClose={() => setSheet(null)}>
          {[
            ['Gestures', 'Swipe left/right on the view to change mode. Swipe up/down to change exposure. Pinch to zoom. Double-tap to reset zoom.'],
            ['Seeing in the dark', 'Use NIGHT and raise exposure. Noise reduction blends recent frames on the GPU — hold steady for the cleanest image. For stars and extreme darkness use ASTRO and brace the phone.'],
            ['Thermal modes', 'THERMAL, WHT-HOT, BLK-HOT, RAINBOW and ARCTIC map brightness to false color. Phone cameras see light, not heat — these are visualizations, not real thermal imaging.'],
            ['AI detection', 'Turn on AI to name objects (person, car, dog…) with confidence scores. The model downloads once, then works offline.'],
            ['Sentry', 'Arm SENTRY and set the phone down. Motion or a person triggers an alert and a 15-second clip that extends while activity continues.'],
            ['Evidence', 'GEO-STAMP burns UTC time and GPS into every photo and stores a SHA-256 hash, so you can later prove the image was not altered.'],
            ['Your data', 'Photos and videos stay on this device in the vault. Nothing is uploaded. Cast is direct device-to-device.'],
            ['Offline', 'Add to Home Screen. After the first load the app runs with no signal.'],
          ].map(([t, b]) => (
            <div key={t} style={{ padding: '15px 16px', borderRadius: 14, background: 'rgba(255,255,255,.05)', border: '1.5px solid rgba(255,255,255,.1)' }}>
              <div style={{ fontSize: 15, fontWeight: 800, color, marginBottom: 6 }}>{t}</div>
              <div style={{ fontSize: 14, lineHeight: 1.6, color: 'rgba(233,241,236,.85)' }}>{b}</div>
            </div>
          ))}
        </Sheet>
      )}
    </div>
  )
}

// ── small pieces ───────────────────────────────────────────────────────────
function Center({ children, onClick }) {
  return (
    <div onClick={onClick} style={{ position: 'absolute', inset: 0, zIndex: 15, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 16, background: 'rgba(0,0,0,.82)', cursor: onClick ? 'pointer' : 'default' }}>
      {children}
    </div>
  )
}
function Pill({ c, children, blink }) {
  return <span style={{ fontSize: 12.5, fontWeight: 800, color: c, border: `1.5px solid ${c}88`, borderRadius: 8, padding: '4px 8px',
    whiteSpace: 'nowrap', animation: blink ? 'blink 1s steps(1) infinite' : 'none' }}>{children}</span>
}
function Chip({ children }) {
  return <span style={{ fontSize: 13, fontWeight: 700, color: '#e9f1ec', background: 'rgba(0,0,0,.72)', border: '1px solid rgba(255,255,255,.2)',
    borderRadius: 9, padding: '6px 10px' }}>{children}</span>
}
function Round({ children, onClick, label, active, c = '#e9f1ec', dim }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', opacity: dim ? .45 : 1 }}>
      <span style={{ width: 52, height: 52, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 21,
        color: active ? '#041008' : c, background: active ? c : 'rgba(255,255,255,.1)', border: `1.5px solid ${active ? c : 'rgba(255,255,255,.25)'}` }}>{children}</span>
      <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, letterSpacing: 1, color: active ? c : 'rgba(233,241,236,.85)' }}>{label}</span>
    </button>
  )
}

function ClipCard({ clip, color, onDelete }) {
  const [url, setUrl] = useState(null)
  useEffect(() => { const u = URL.createObjectURL(clip.blob); setUrl(u); return () => URL.revokeObjectURL(u) }, [clip.blob])
  const ext = clip.blob.type.includes('mp4') ? 'mp4' : 'webm'
  return (
    <div style={{ borderRadius: 14, overflow: 'hidden', border: '1.5px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.04)' }}>
      {url && <video src={url} controls playsInline style={{ width: '100%', display: 'block', background: '#000' }} />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px' }}>
        <div style={{ flex: 1, fontSize: 13 }}>
          <div style={{ fontWeight: 700, color: clip.auto ? '#ff3b5c' : color }}>{clip.auto ? '🛡 SENTRY' : '● MANUAL'} · {clip.mode}</div>
          <div style={{ color: 'rgba(233,241,236,.6)', fontSize: 12 }}>{new Date(clip.ts).toLocaleString()} · {clip.dur}s · {(clip.size / 1048576).toFixed(1)}MB</div>
        </div>
        <Btn color={color} onClick={async () => { if (!(await shareBlob(clip.blob, `nvs-${clip.ts}.${ext}`, 'NVS clip'))) download(url, `nvs-${clip.ts}.${ext}`) }} style={{ padding: '8px 12px' }}>⤴</Btn>
        <Btn color={color} danger onClick={() => onDelete(clip)} style={{ padding: '8px 12px' }}>✕</Btn>
      </div>
    </div>
  )
}

function Gallery({ color, shots, clips, onClose, onOpen, onDeleteShot, onDeleteClip }) {
  const [tab, setTab] = useState('photos')
  return (
    <Sheet title="GALLERY" color={color} onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Btn color={color} active={tab === 'photos'} onClick={() => setTab('photos')}>PHOTOS ({shots.length})</Btn>
        <Btn color={color} active={tab === 'videos'} onClick={() => setTab('videos')}>VIDEOS ({clips.length})</Btn>
      </div>
      {tab === 'photos' && (shots.length === 0
        ? <Empty>No photos yet. Tap the shutter.</Empty>
        : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
            {shots.map(s => (
              <div key={s.ts} style={{ position: 'relative', aspectRatio: '1', borderRadius: 10, overflow: 'hidden', background: '#111' }}>
                <img src={s.url} alt="" onClick={() => onOpen(s)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <button onClick={() => onDeleteShot(s)} style={{ position: 'absolute', top: 4, right: 4, width: 28, height: 28, borderRadius: 8,
                  background: 'rgba(0,0,0,.75)', border: '1px solid rgba(255,90,90,.6)', color: '#ff7a7a', fontSize: 13 }}>✕</button>
              </div>
            ))}
          </div>)}
      {tab === 'videos' && (clips.length === 0
        ? <Empty>No videos yet. Tap VIDEO or arm SENTRY.</Empty>
        : clips.map(c => <ClipCard key={c.ts} clip={c} color={color} onDelete={onDeleteClip} />))}
    </Sheet>
  )
}
function Empty({ children }) {
  return <div style={{ padding: '34px 10px', textAlign: 'center', fontSize: 14, color: 'rgba(233,241,236,.6)' }}>{children}</div>
}
