// ═════════════════════════════════════════════════════════════════════════
// NVS-15 ENGINE — cheap CPU-side services (everything heavy lives in gl.js)
// ═════════════════════════════════════════════════════════════════════════


// ── RESOLUTION: pure helpers (unit-tested in tests/resolution.test.mjs) ────
// Quality ladder: long-edge pixel cap for the render target.
export const QUALITY_CAP = { ULTRA: 4096, HIGH: 2560, BALANCED: 1600, SAVER: 1100 }
export const QUALITY_DPR = { ULTRA: 3, HIGH: 2.5, BALANCED: 2, SAVER: 1.5 }

// Size the WebGL drawing buffer. Never render above the source resolution
// (pure upscale costs GPU and adds nothing) unless super-res is stacking
// frames, which genuinely creates detail beyond one frame.
export function fitCanvas(cssW, cssH, dpr, quality = 'HIGH', srcW = 0, srcH = 0, sr = false) {
  const cap = QUALITY_CAP[quality] || QUALITY_CAP.HIGH
  const d = Math.min(Math.max(dpr || 1, 1), QUALITY_DPR[quality] || 2)
  let w = Math.round(cssW * d), h = Math.round(cssH * d)
  const srcLong = Math.max(srcW, srcH)
  // cover-crop means the source must fill the shorter axis too
  const ceiling = srcLong ? Math.round(srcLong * (sr ? 1.5 : 1)) : cap
  const limit = Math.min(cap, ceiling)
  const long = Math.max(w, h)
  if (long > limit) { const k = limit / long; w = Math.round(w * k); h = Math.round(h * k) }
  return { w: Math.max(2, w), h: Math.max(2, h), dpr: d }
}

// Bitrate scaled to pixel count — 6 Mbps is fine at 1080p and mush at 4K.
export function pickBitrate(w, h, fps = 30) {
  const bpp = 0.10                                   // bits per pixel per frame
  return Math.round(Math.min(120e6, Math.max(4e6, w * h * fps * bpp)))
}

export function resLabel(w, h) {
  const long = Math.max(w, h)
  if (long >= 3400) return '4K'
  if (long >= 2500) return 'QHD'
  if (long >= 1800) return 'FHD'
  if (long >= 1200) return 'HD'
  return `${long}p`
}

// ── MOTION DETECTION ──────────────────────────────────────────────────────
// analyzeMotion is pure (arrays in, boxes out) so it can be unit-tested.
//  1. adaptive threshold from the frame's own noise floor
//  2. 20×10 cell occupancy grid
//  3. morphological close (dilate → erode) to merge a target split across cells
//  4. 8-connected labelling, tight pixel-accurate bounds
//  5. camera-pan suppression when the whole grid lights up
export const MOTION_W = 160, MOTION_H = 90, CELL_W = 8, CELL_H = 9
export const GRID_X = MOTION_W / CELL_W, GRID_Y = MOTION_H / CELL_H   // 20 × 10

export function analyzeMotion(cur, prev, sensitivity = 0.6, opts = {}) {
  const W = opts.W || MOTION_W, H = opts.H || MOTION_H
  const CW = opts.CW || CELL_W, CH = opts.CH || CELL_H
  const GX = W / CW, GY = H / CH
  const n = W * H

  // Noise floor from a LOW PERCENTILE of the frame difference, not the mean:
  // a large moving object (or a pan) inflates the mean and would otherwise
  // raise the threshold high enough to hide the very thing we want to see.
  const samp = []
  for (let i = 0; i < n; i += 7) samp.push(Math.abs(cur[i] - prev[i]))
  samp.sort((a, b) => a - b)
  const p = q => samp[Math.min(samp.length - 1, Math.floor(samp.length * q))]
  const floor20 = p(0.20), mid = p(0.5)
  const thr = Math.max(6, floor20 * 2.0 + 5 + (1 - sensitivity) * 30)

  const diff = new Uint8Array(n)
  const cells = new Uint16Array(GX * GY)
  let changed = 0
  for (let y = 0; y < H; y++) {
    const row = y * W, cy = (y / CH) | 0
    for (let x = 0; x < W; x++) {
      if (Math.abs(cur[row + x] - prev[row + x]) > thr) {
        diff[row + x] = 1; changed++; cells[cy * GX + ((x / CW) | 0)]++
      }
    }
  }

  const need = CW * CH * (0.10 + (1 - sensitivity) * 0.18)
  let on = new Uint8Array(GX * GY)
  for (let i = 0; i < cells.length; i++) on[i] = cells[i] >= need ? 1 : 0
  const activeCells = on.reduce((a, b) => a + b, 0)

  // a pan or shake lights up nearly everything — not a target
  // Pan/shake vs. a large subject: both change a lot of pixels, but a pan
  // changes them EVERYWHERE while a subject changes one region. Judge by
  // spatial spread across rows and columns, not by raw area.
  const frac = changed / n
  const colUsed = new Uint8Array(GX), rowUsed = new Uint8Array(GY)
  for (let i = 0; i < on.length; i++) if (on[i]) { colUsed[i % GX] = 1; rowUsed[(i / GX) | 0] = 1 }
  const cols = colUsed.reduce((a, b) => a + b, 0), rows = rowUsed.reduce((a, b) => a + b, 0)
  const spread = cols >= GX * 0.8 && rows >= GY * 0.8
  if (activeCells > GX * GY * 0.6 || (spread && activeCells > GX * GY * 0.35) || (mid > thr && spread))
    return { frac, boxes: [], panning: true }

  const morph = (src, grow) => {
    const out = new Uint8Array(src.length)
    for (let y = 0; y < GY; y++) for (let x = 0; x < GX; x++) {
      let hit = grow ? 0 : 1
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy
        const v = (nx < 0 || ny < 0 || nx >= GX || ny >= GY) ? 0 : src[ny * GX + nx]
        if (grow) hit |= v; else hit &= v
      }
      out[y * GX + x] = hit
    }
    return out
  }
  on = morph(morph(on, true), false)   // close: bridges a target split across cells

  const seen = new Uint8Array(GX * GY), boxes = []
  for (let s0 = 0; s0 < on.length; s0++) {
    if (!on[s0] || seen[s0]) continue
    const stack = [s0]; seen[s0] = 1
    const members = []
    while (stack.length) {
      const k = stack.pop(); members.push(k)
      const x = k % GX, y = (k / GX) | 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= GX || ny >= GY) continue
        const nk = ny * GX + nx
        if (on[nk] && !seen[nk]) { seen[nk] = 1; stack.push(nk) }
      }
    }
    if (members.length < 2) continue                       // single cell = noise

    // tighten to the actual changed pixels inside the cell cluster
    let x0 = W, y0 = H, x1 = -1, y1 = -1, hits = 0
    for (const k of members) {
      const cx = (k % GX) * CW, cy = ((k / GX) | 0) * CH
      for (let y = cy; y < cy + CH; y++) for (let x = cx; x < cx + CW; x++) {
        if (!diff[y * W + x]) continue
        hits++
        if (x < x0) x0 = x; if (x > x1) x1 = x
        if (y < y0) y0 = y; if (y > y1) y1 = y
      }
    }
    if (x1 < 0 || hits < 24) continue
    const w = (x1 - x0 + 1) / W, h = (y1 - y0 + 1) / H
    if (w < 0.03 || h < 0.03) continue                     // too small to be real
    boxes.push({ x: x0 / W, y: y0 / H, w, h, score: hits })
  }
  boxes.sort((a, b) => b.score - a.score)
  return { frac: changed / n, boxes: boxes.slice(0, 5), panning: false }
}

export function createMotion() {
  const c = document.createElement('canvas'); c.width = MOTION_W; c.height = MOTION_H
  const ctx = c.getContext('2d', { willReadFrequently: true })
  const cur = new Uint8Array(MOTION_W * MOTION_H)
  let prev = null
  return function detect(video, sensitivity) {
    ctx.drawImage(video, 0, 0, MOTION_W, MOTION_H)
    const d = ctx.getImageData(0, 0, MOTION_W, MOTION_H).data
    for (let i = 0, j = 0; j < cur.length; i += 4, j++) cur[j] = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8
    if (!prev) { prev = new Uint8Array(cur); return { frac: 0, boxes: [], panning: false } }
    const out = analyzeMotion(cur, prev, sensitivity)
    prev.set(cur)
    return out
  }
}

// ── VAULT: IndexedDB persistence for captures + clips ─────────────────────
const DB = 'nvs15', VER = 1
function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, VER)
    r.onupgradeneeded = () => {
      const db = r.result
      for (const s of ['shots', 'clips']) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'ts' })
    }
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
  })
}
const tx = async (store, mode, fn) => {
  try {
    const db = await open()
    return await new Promise(res => {
      const t = db.transaction(store, mode); const out = fn(t.objectStore(store))
      t.oncomplete = () => res(out?.result ?? true); t.onerror = () => res(null)
    })
  } catch { return null }
}
export const vault = {
  put: (s, v) => tx(s, 'readwrite', o => o.put(v)),
  del: (s, k) => tx(s, 'readwrite', o => o.delete(k)),
  clear: s => tx(s, 'readwrite', o => o.clear()),
  all: async s => (await tx(s, 'readonly', o => o.getAll())) || [],
  usage: async () => { try { return await navigator.storage?.estimate?.() } catch { return null } },
}

// ── EVIDENCE: burned-in stamp + SHA-256 ───────────────────────────────────
export async function stamp(dataUrl, meta) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl })
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
  const x = c.getContext('2d'); x.drawImage(img, 0, 0)
  const fs = Math.max(11, Math.round(c.width * 0.02)), pad = Math.round(fs * 0.8)
  const lines = [
    `${meta.utc}  ·  ${meta.mode}${meta.zoom > 1 ? `  ·  ${meta.zoom.toFixed(1)}×` : ''}`,
    meta.gps ? `${meta.gps.lat.toFixed(6)}, ${meta.gps.lon.toFixed(6)}  ±${Math.round(meta.gps.acc || 0)}m` : 'GPS UNAVAILABLE',
  ]
  const bh = lines.length * fs * 1.4 + pad * 1.2
  x.fillStyle = 'rgba(0,0,0,.62)'; x.fillRect(0, c.height - bh, c.width, bh)
  x.fillStyle = 'rgba(80,255,130,.95)'; x.font = `${fs}px "DM Mono",monospace`; x.textBaseline = 'top'
  lines.forEach((t, i) => x.fillText(t, pad, c.height - bh + pad * 0.6 + i * fs * 1.4))
  return c.toDataURL('image/jpeg', 0.92)
}
export async function sha256(dataUrl) {
  try {
    const buf = await (await fetch(dataUrl)).arrayBuffer()
    const h = await crypto.subtle.digest('SHA-256', buf)
    return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('')
  } catch { return null }
}

// ── ALERT TONE ────────────────────────────────────────────────────────────
let actx = null
export function beep(freq = 880, dur = 0.16, count = 1) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)()
    for (let i = 0; i < count; i++) {
      const t = actx.currentTime + i * (dur + 0.07)
      const o = actx.createOscillator(), g = actx.createGain()
      o.type = 'square'; o.frequency.value = freq; o.connect(g); g.connect(actx.destination)
      g.gain.setValueAtTime(0.14, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur)
      o.start(t); o.stop(t + dur + 0.02)
    }
  } catch { /* audio blocked until user gesture */ }
}

// ── RECORDER MIME (iOS needs mp4) ─────────────────────────────────────────
export function recorderType() {
  const opts = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
  return opts.find(t => window.MediaRecorder?.isTypeSupported?.(t)) || ''
}

// ── SHARE ─────────────────────────────────────────────────────────────────
export async function shareBlob(blob, name, text) {
  try {
    const file = new File([blob], name, { type: blob.type })
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text }); return true }
  } catch { /* cancelled */ }
  return false
}
export function download(url, name) {
  const a = document.createElement('a'); a.href = url; a.download = name; a.click()
}
export const dataUrlToBlob = async u => (await fetch(u)).blob()

// ── FRAME REGISTRATION for super-resolution ───────────────────────────────
// Locks onto a reference frame and measures how far each new frame has
// drifted (handshake). The GPU then samples each frame back into alignment
// before averaging, so detail adds up instead of smearing.
export function createAligner() {
  const W = 128, H = 72, R = 6, M = 8
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const ctx = c.getContext('2d', { willReadFrequently: true })
  const cur = new Float32Array(W * H)
  let ref = null
  return {
    reset() { ref = null },
    estimate(video) {
      ctx.drawImage(video, 0, 0, W, H)
      const d = ctx.getImageData(0, 0, W, H).data
      for (let i = 0, j = 0; j < cur.length; i += 4, j++) cur[j] = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114
      if (!ref) { ref = new Float32Array(cur); return { dx: 0, dy: 0, fresh: true, lost: false } }
      let best = Infinity, bx = 0, by = 0
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        let sum = 0
        for (let y = M; y < H - M; y += 2) {
          const row = y * W, rrow = (y + dy) * W
          for (let x = M; x < W - M; x += 2) sum += Math.abs(cur[row + x] - ref[rrow + x + dx])
          if (sum >= best) break
        }
        if (sum < best) { best = sum; bx = dx; by = dy }
      }
      const lost = Math.abs(bx) === R || Math.abs(by) === R   // drifted past search window
      return { dx: bx / W, dy: by / H, fresh: false, lost }
    },
  }
}
